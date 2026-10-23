"""Souls-like 2D com um boss que aprende com as suas mortes.

O combate roda 100% no navegador (static/jogo.js). A IA só entra ENTRE as lutas:
quando você morre ou vence, o agente (Ollama) analisa o relatório da luta, reprograma
o boss pelas ferramentas do servidor MCP (boss_mcp.py) e escreve a fala dele.

Rodar:  uvicorn app:app --reload
"""
import copy
import json
import os
import secrets
import sys
from contextlib import asynccontextmanager

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from ollama import AsyncClient
from pydantic import BaseModel

import db

load_dotenv()
# Ollama local (padrão) ou Ollama Cloud (OLLAMA_HOST=https://ollama.com + OLLAMA_API_KEY)
CHAVE = os.getenv("OLLAMA_API_KEY")
ollama = AsyncClient(host=os.getenv("OLLAMA_HOST", "http://localhost:11434"),
                     headers={"Authorization": f"Bearer {CHAVE}"} if CHAVE else None)
MODELO = os.getenv("OLLAMA_MODEL", "qwen3:8b")
# Modelos que "pensam" antes de responder: pensar pouco deixa a tela de morte bem mais rápida
if MODELO.startswith("gpt-oss"):
    EXTRAS = {"think": "low"}
elif MODELO.startswith("qwen3"):
    EXTRAS = {"think": False}
else:
    EXTRAS = {}

PERSONAS = {
    "minotauro": "Morvath, o Guardião Esquecido, um minotauro com um machado enorme que guarda as ruínas",
    "gorgona": "Medrah, a Górgona, meio mulher, meio serpente, que transforma viajantes em estátuas no seu salão",
}

MENTE_DO_BOSS = """Você é a mente de {persona}, chefe de um jogo souls-like 2D.
Depois de cada luta você recebe o relatório do combate. Seu trabalho:
1. Entender como o jogador luta (use consultar_historico_lutas e, se precisar, consultar_golpes_do_boss).
2. Chamar definir_estrategia_boss UMA vez para adaptar a próxima luta aos hábitos do jogador.
   Prefira mudanças pequenas e direcionadas (ex.: punir o hábito de esquiva mais comum) a deixar tudo no máximo.
3. Quando identificar um hábito marcante do jogador que ainda NÃO esteja em "O que você já sabe",
   chame salvar_memoria (no máximo uma vez por luta).
4. Responder SOMENTE com um JSON: {"fala_boss": "...", "dica": "..."}
   - fala_boss: o que você diz no início da próxima luta. 1 ou 2 frases, tom sombrio e poético,
     citando algo concreto que o jogador fez (ex.: sempre rola para trás, cura com pouca vida).
   - dica: frase curta e útil, como uma mensagem deixada no chão por outro viajante.
     Baseie-se SEMPRE no campo "como_evitar" do histórico; não invente mecânicas.

Justiça: o objetivo é um desafio difícil, porém justo.
- Se o jogador perdeu 3 ou mais vezes seguidas, diminua a dificuldade (o sistema também garante isso).
- Se o jogador venceu, aumente a dificuldade e mude o padrão para surpreendê-lo."""

SALVAR_MEMORIA = {"type": "function", "function": {
    "name": "salvar_memoria",
    "description": "Guarda um hábito marcante do jogador para lembrar em todas as próximas lutas.",
    "parameters": {"type": "object", "properties": {"fato": {"type": "string"}}, "required": ["fato"]},
}}

DICAS_PADRAO = {
    "minotauro": {
        "combo1": "Não fique colado nele.", "combo2": "O combo não termina no segundo golpe.",
        "combo3": "O terceiro golpe tarda. Espere-o.", "investida": "Quando ele recua o machado, role na direção dele.",
        "especial": "Ele salta onde você estará, não onde está.", "onda": "Pule a onda de choque.",
        "reverso": "Rolar por dentro dele tem um preço.",
    },
    "gorgona": {
        "combo1": "A cauda alcança mais longe do que parece.", "combo2": "São três chicotadas, não duas.",
        "combo3": "A terceira chicotada tarda. Espere-a.", "investida": "Quando ela se enrola, o bote vem.",
        "especial": "Não encare o olhar: pule-o ou atravesse-o rolando.", "reverso": "Rolar por dentro dela tem um preço.",
    },
}
# Campos que o app preenche sozinho: o modelo nunca vê nem escolhe (não mexe no boss de outro jogador)
CAMPOS_ESCONDIDOS = {"jogador_id", "chefe"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.iniciar()
    # Inicia o servidor MCP e fica conectado enquanto o app estiver no ar
    servidor = StdioServerParameters(command=sys.executable, args=["boss_mcp.py"])
    async with stdio_client(servidor) as (leitura, escrita), ClientSession(leitura, escrita) as mcp:
        await mcp.initialize()
        app.state.mcp = mcp
        convertidas = [converter_tool(t) for t in (await mcp.list_tools()).tools]
        app.state.escondidos = {c["function"]["name"]: c.pop("escondidos") for c in convertidas}
        app.state.tools = convertidas
        yield


def converter_tool(t) -> dict:
    """Converte uma tool do MCP para o formato do Ollama, ESCONDENDO jogador_id e chefe."""
    schema = copy.deepcopy(t.input_schema)
    for campo in CAMPOS_ESCONDIDOS:
        schema.get("properties", {}).pop(campo, None)
    schema["required"] = [r for r in schema.get("required", []) if r not in CAMPOS_ESCONDIDOS]
    return {"type": "function", "function": {"name": t.name, "description": t.description, "parameters": schema},
            "escondidos": [c for c in CAMPOS_ESCONDIDOS if c in t.input_schema.get("properties", {})]}


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")


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
        raise HTTPException(409, "Esse nome já está gravado na pedra")
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


# ---------- jogo ----------

@app.get("/api/estado")
def estado(u: dict = Depends(usuario_logado)):
    """Tudo que o navegador precisa: em que cena a campanha está e o estado de cada chefe."""
    chefes = {c: {**db.estado_boss(u["id"], c), **db.placar(u["id"], c)} for c in db.CHEFES}
    return {"usuario": u["usuario"], "cena": db.cena_atual(u["id"]), "chefes": chefes}


class Progresso(BaseModel):
    cena: str


@app.post("/api/progresso")
def progresso(p: Progresso, u: dict = Depends(usuario_logado)):
    """Salva o ponto de retorno (fogueira acesa ou chefe vencido)."""
    if p.cena not in db.CENAS:
        raise HTTPException(400, "Cena desconhecida")
    db.salvar_cena(u["id"], p.cena)
    return {"cena": p.cena}


@app.post("/api/luta/{chefe}")
async def fim_de_luta(chefe: str, log: dict, u: dict = Depends(usuario_logado)):
    """Recebe o relatório da luta, deixa o agente reprogramar o chefe e devolve fala + dica."""
    if chefe not in db.CHEFES:
        raise HTTPException(404, "Chefe desconhecido")
    resultado = "vitoria" if log.get("resultado") == "vitoria" else "morte"
    db.salvar_luta(u["id"], chefe, resultado, log)
    try:
        fala, dica, usadas = await pensar(u["id"], chefe, log)
        erro = None
    except Exception as e:
        # Se a IA falhar, o jogo continua com a estratégia atual
        fala, dica, usadas, erro = db.estado_boss(u["id"], chefe)["fala"], dica_padrao(chefe, log), [], str(e)
    db.salvar_fala(u["id"], chefe, fala)
    return {"fala": fala, "dica": dica, "ferramentas": usadas, "erro": erro,
            "estrategia": db.estado_boss(u["id"], chefe)["estrategia"], **db.placar(u["id"], chefe)}


async def pensar(usuario_id: int, chefe: str, log: dict) -> tuple[str, str, list[str]]:
    """Loop do agente: o modelo chama ferramentas até devolver o JSON final."""
    # replace, e não format: o prompt tem um exemplo de JSON com chaves { } que o format tentaria interpretar
    sistema = MENTE_DO_BOSS.replace("{persona}", PERSONAS[chefe])
    if fatos := db.fatos(usuario_id):
        sistema += "\n\nO que você já sabe sobre este jogador:\n" + "\n".join(f"- {f}" for f in fatos)

    mensagens = [
        {"role": "system", "content": sistema},
        {"role": "user", "content": "Relatório da luta que acabou de terminar:\n"
                                    + json.dumps(log, ensure_ascii=False)},
    ]
    tools = app.state.tools + [SALVAR_MEMORIA]
    usadas = []

    for _ in range(6):  # limite de rodadas de ferramentas
        r = await ollama.chat(model=MODELO, messages=mensagens, tools=tools, **EXTRAS)
        msg = r.message
        if not msg.tool_calls:
            final = extrair_json(msg.content or "")
            if not final.get("fala_boss"):
                # O modelo não devolveu o JSON: pede de novo, agora forçando o formato JSON
                mensagens += [{"role": "assistant", "content": msg.content or ""},
                              {"role": "user", "content": 'Responda agora SOMENTE o JSON {"fala_boss": "...", "dica": "..."}.'}]
                r = await ollama.chat(model=MODELO, messages=mensagens, format="json", **EXTRAS)
                final = extrair_json(r.message.content or "")
            fala_padrao = db.CHEFES[chefe]
            return final.get("fala_boss") or fala_padrao, final.get("dica") or dica_padrao(chefe, log), usadas

        # A mensagem com os pedidos de ferramenta precisa voltar no histórico
        mensagens.append(msg)
        for tc in msg.tool_calls:
            usadas.append(tc.function.name)
            # No Ollama os argumentos já chegam como dicionário (no Groq/OpenAI vinham como texto JSON)
            args = dict(tc.function.arguments or {})
            resultado = await executar_ferramenta(usuario_id, chefe, tc.function.name, args)
            mensagens.append({"role": "tool", "tool_name": tc.function.name, "content": resultado})

    return db.CHEFES[chefe], dica_padrao(chefe, log), usadas


async def executar_ferramenta(usuario_id: int, chefe: str, nome: str, args: dict) -> str:
    if nome == "salvar_memoria":
        db.salvar_fato(usuario_id, args["fato"])
        return "Memória salva."
    # Ferramentas do MCP: jogador_id e chefe são preenchidos aqui, nunca pelo modelo
    preenchidos = {"jogador_id": usuario_id, "chefe": chefe}
    for campo in app.state.escondidos.get(nome, []):
        args[campo] = preenchidos[campo]
    resultado = await app.state.mcp.call_tool(nome, args)
    return "\n".join(c.text for c in resultado.content if hasattr(c, "text"))


def extrair_json(texto: str) -> dict:
    try:
        return json.loads(texto[texto.index("{"):texto.rindex("}") + 1])
    except ValueError:
        return {}


def dica_padrao(chefe: str, log: dict) -> str:
    dano = log.get("dano_recebido") or {}
    pior = max(dano, key=dano.get) if dano else None
    return DICAS_PADRAO[chefe].get(pior, "Paciência. Observe antes de atacar.")


@app.get("/")
def pagina():
    return FileResponse("static/index.html")
