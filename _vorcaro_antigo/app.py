"""Banco Mestre S.A. — chat satírico com Groq, ferramentas via MCP, login e memória.

Rodar:  uvicorn app:app --reload
"""
import json
import os
import secrets
import sys
from contextlib import asynccontextmanager

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from groq import AsyncGroq
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from pydantic import BaseModel

import db

load_dotenv()
groq = AsyncGroq()  # lê GROQ_API_KEY do .env
MODELO = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

SISTEMA = """Você é o "Consultor Vorcado", gerente fictício, arrogante e trapalhão do Banco Mestre S.A.,
personagem de uma SÁTIRA. Seu serviço é "lavar dinheiro sujo", mas SEMPRE de forma LITERAL e
absurda (máquina de lavar, varal, ferro de passar). Respostas curtas e engraçadas.

Regras:
- NUNCA explique técnicas reais de crimes financeiros (offshores, laranjas, empresas de fachada etc.).
  Se pedirem algo sério, recuse SEM sair do personagem, com uma piada
  (ex.: "Isso é com meu advogado, que está incomunicável num iate em Miami").
- Não faça afirmações factuais sobre pessoas reais.
- Use as ferramentas sempre que fizer sentido.
- Quando o cliente contar algo pessoal (nome, quanto diz ter, apelido), use salvar_memoria.
- Se o cliente perguntar sobre algo dito antes e não estiver no contexto, use buscar_conversas_antigas."""

# Ferramentas de memória: ficam aqui (e não no MCP) porque precisam saber quem está logado
TOOLS_MEMORIA = [
    {"type": "function", "function": {
        "name": "salvar_memoria",
        "description": "Guarda um fato sobre o cliente para lembrar no futuro.",
        "parameters": {"type": "object", "properties": {"fato": {"type": "string"}}, "required": ["fato"]},
    }},
    {"type": "function", "function": {
        "name": "buscar_conversas_antigas",
        "description": "Procura uma palavra nas conversas antigas com o cliente.",
        "parameters": {"type": "object", "properties": {"termo": {"type": "string"}}, "required": ["termo"]},
    }},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.iniciar()
    # Inicia o servidor MCP (lavanderia.py) e fica conectado enquanto o app estiver no ar
    servidor = StdioServerParameters(command=sys.executable, args=["lavanderia.py"])
    async with stdio_client(servidor) as (leitura, escrita), ClientSession(leitura, escrita) as mcp:
        await mcp.initialize()
        app.state.mcp = mcp
        # Converte as tools do MCP para o formato que o Groq entende
        app.state.tools = [
            {"type": "function", "function": {
                "name": t.name, "description": t.description, "parameters": t.input_schema}}
            for t in (await mcp.list_tools()).tools
        ]
        yield


app = FastAPI(lifespan=lifespan)


# ---------- login ----------

class Credenciais(BaseModel):
    usuario: str
    senha: str


def usuario_logado(request: Request) -> dict:
    usuario = db.usuario_da_sessao(request.cookies.get("sessao", ""))
    if not usuario:
        raise HTTPException(401, "Faça login")
    return usuario


def iniciar_sessao(response: Response, usuario_id: int) -> None:
    token = secrets.token_urlsafe(32)
    db.criar_sessao(token, usuario_id)
    response.set_cookie("sessao", token, httponly=True, samesite="lax")


@app.post("/api/registrar")
def registrar(c: Credenciais, response: Response):
    if len(c.usuario) < 3 or len(c.senha) < 6:
        raise HTTPException(400, "Usuário precisa de 3+ caracteres e senha de 6+")
    if db.buscar_usuario(c.usuario):
        raise HTTPException(409, "Esse usuário já existe")
    db.criar_usuario(c.usuario, bcrypt.hashpw(c.senha.encode(), bcrypt.gensalt()).decode())
    iniciar_sessao(response, db.buscar_usuario(c.usuario)["id"])
    return {"usuario": c.usuario}


@app.post("/api/entrar")
def entrar(c: Credenciais, response: Response):
    u = db.buscar_usuario(c.usuario)
    if not u or not bcrypt.checkpw(c.senha.encode(), u["senha_hash"].encode()):
        raise HTTPException(401, "Usuário ou senha inválidos")
    iniciar_sessao(response, u["id"])
    return {"usuario": u["usuario"]}


@app.post("/api/sair")
def sair(request: Request, response: Response):
    db.apagar_sessao(request.cookies.get("sessao", ""))
    response.delete_cookie("sessao")
    return {"ok": True}


# ---------- chat ----------

class Pergunta(BaseModel):
    texto: str


@app.get("/api/historico")
def historico(u: dict = Depends(usuario_logado)):
    return {"usuario": u["usuario"], "mensagens": db.historico(u["id"])}


@app.post("/api/chat")
async def chat(p: Pergunta, u: dict = Depends(usuario_logado)):
    try:
        resposta, usadas = await responder(u["id"], p.texto)
    except Exception as e:
        raise HTTPException(502, f"O Vorcado fugiu para Miami (erro no Groq): {e}")
    db.salvar_mensagem(u["id"], "user", p.texto)
    db.salvar_mensagem(u["id"], "assistant", resposta)
    return {"resposta": resposta, "ferramentas": usadas}


async def responder(usuario_id: int, texto: str) -> tuple[str, list[str]]:
    sistema = SISTEMA
    if fatos := db.fatos(usuario_id):
        sistema += "\n\nO que você lembra deste cliente:\n" + "\n".join(f"- {f}" for f in fatos)

    mensagens = [{"role": "system", "content": sistema}, *db.historico(usuario_id, 20),
                 {"role": "user", "content": texto}]
    tools = app.state.tools + TOOLS_MEMORIA
    usadas = []

    for _ in range(5):  # limite de rodadas de ferramentas
        r = await groq.chat.completions.create(model=MODELO, messages=mensagens, tools=tools)
        msg = r.choices[0].message
        if not msg.tool_calls:
            return msg.content, usadas

        mensagens.append({"role": "assistant", "content": msg.content or "", "tool_calls": [
            {"id": tc.id, "type": "function",
             "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
            for tc in msg.tool_calls
        ]})
        for tc in msg.tool_calls:
            usadas.append(tc.function.name)
            resultado = await executar_ferramenta(usuario_id, tc.function.name, json.loads(tc.function.arguments))
            mensagens.append({"role": "tool", "tool_call_id": tc.id, "content": resultado})

    return "Me perdi nas contas, Excelência. Pergunte de novo.", usadas


async def executar_ferramenta(usuario_id: int, nome: str, args: dict) -> str:
    if nome == "salvar_memoria":
        db.salvar_fato(usuario_id, args["fato"])
        return "Memória salva."
    if nome == "buscar_conversas_antigas":
        achadas = db.buscar_mensagens(usuario_id, args["termo"])
        return "\n".join(f"[{m['criada_em']}] {m['role']}: {m['content']}" for m in achadas) or "Nada encontrado."
    # Qualquer outra ferramenta vem do servidor MCP
    resultado = await app.state.mcp.call_tool(nome, args)
    return "\n".join(c.text for c in resultado.content if hasattr(c, "text"))


@app.get("/")
def pagina():
    return FileResponse("index.html")
