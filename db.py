"""Banco SQLite: usuários, sessões, lutas, estratégia do boss e memórias.

Usado tanto pelo app.py quanto pelo servidor MCP (boss_mcp.py).
"""
import json
import sqlite3

ARQUIVO = "souls.db"

# Como o boss luta quando ainda não aprendeu nada sobre o jogador
ESTRATEGIA_PADRAO = {
    "agressividade": 0.4,          # 0 = espera muito entre ataques, 1 = ataca sem parar
    "atraso_terceiro_golpe": 0.3,  # 0 = combo em ritmo constante, 1 = terceiro golpe bem atrasado
    "punir_cura": False,           # avança com investida rápida quando o jogador bebe o frasco
    "punir_rolagem": "nenhuma",    # "para_tras", "para_frente" ou "nenhuma"
    "pesos": {"combo": 1.0, "investida": 1.0, "salto": 1.0},
}
FALA_INICIAL = "Mais uma cinza que vem perturbar meu descanso. Aproxime-se."


def executar(sql: str, params: tuple = ()) -> list[dict]:
    conn = sqlite3.connect(ARQUIVO)
    conn.row_factory = sqlite3.Row
    try:
        linhas = [dict(r) for r in conn.execute(sql, params)]
        conn.commit()
        return linhas
    finally:
        conn.close()


def iniciar() -> None:
    conn = sqlite3.connect(ARQUIVO)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY, usuario TEXT UNIQUE NOT NULL, senha_hash TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessoes (
            token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS lutas (
            id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL, resultado TEXT NOT NULL,
            log TEXT NOT NULL, criada_em TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS boss (
            usuario_id INTEGER PRIMARY KEY, estrategia TEXT NOT NULL, fala TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS progresso (
            usuario_id INTEGER PRIMARY KEY, fogueira_boss INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS memorias (
            id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL, fato TEXT NOT NULL,
            UNIQUE (usuario_id, fato)
        );
    """)
    conn.close()


# ---------- usuários e sessões ----------

def criar_usuario(usuario: str, senha_hash: str) -> None:
    executar("INSERT INTO usuarios (usuario, senha_hash) VALUES (?, ?)", (usuario, senha_hash))


def buscar_usuario(usuario: str) -> dict | None:
    linhas = executar("SELECT * FROM usuarios WHERE usuario = ?", (usuario,))
    return linhas[0] if linhas else None


def criar_sessao(token: str, usuario_id: int) -> None:
    executar("INSERT INTO sessoes (token, usuario_id) VALUES (?, ?)", (token, usuario_id))


def usuario_da_sessao(token: str) -> dict | None:
    linhas = executar(
        "SELECT u.id, u.usuario FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?",
        (token,),
    )
    return linhas[0] if linhas else None


def apagar_sessao(token: str) -> None:
    executar("DELETE FROM sessoes WHERE token = ?", (token,))


# ---------- lutas ----------

def salvar_luta(usuario_id: int, resultado: str, log: dict) -> None:
    executar("INSERT INTO lutas (usuario_id, resultado, log) VALUES (?, ?, ?)",
             (usuario_id, resultado, json.dumps(log, ensure_ascii=False)))


def lutas(usuario_id: int, limite: int = 5) -> list[dict]:
    """Últimas lutas, da mais recente para a mais antiga."""
    linhas = executar("SELECT resultado, log, criada_em FROM lutas WHERE usuario_id = ? ORDER BY id DESC LIMIT ?",
                      (usuario_id, limite))
    return [{**l, "log": json.loads(l["log"])} for l in linhas]


def placar(usuario_id: int) -> dict:
    resultados = [l["resultado"] for l in executar(
        "SELECT resultado FROM lutas WHERE usuario_id = ? ORDER BY id DESC", (usuario_id,))]
    seguidas = 0
    for r in resultados:
        if r != "morte":
            break
        seguidas += 1
    return {"mortes": resultados.count("morte"), "vitorias": resultados.count("vitoria"),
            "derrotas_seguidas": seguidas}


# ---------- boss ----------

def estado_boss(usuario_id: int) -> dict:
    linhas = executar("SELECT estrategia, fala FROM boss WHERE usuario_id = ?", (usuario_id,))
    if not linhas:
        return {"estrategia": ESTRATEGIA_PADRAO, "fala": FALA_INICIAL}
    return {"estrategia": json.loads(linhas[0]["estrategia"]), "fala": linhas[0]["fala"]}


def salvar_estrategia(usuario_id: int, estrategia: dict) -> None:
    fala = estado_boss(usuario_id)["fala"]
    executar("INSERT OR REPLACE INTO boss (usuario_id, estrategia, fala) VALUES (?, ?, ?)",
             (usuario_id, json.dumps(estrategia), fala))


def salvar_fala(usuario_id: int, fala: str) -> None:
    estrategia = estado_boss(usuario_id)["estrategia"]
    executar("INSERT OR REPLACE INTO boss (usuario_id, estrategia, fala) VALUES (?, ?, ?)",
             (usuario_id, json.dumps(estrategia), fala))


# ---------- progresso na fase ----------

def acender_fogueira(usuario_id: int) -> None:
    """A fogueira antes do chefão: depois de acesa, as tentativas começam direto no boss."""
    executar("INSERT OR REPLACE INTO progresso (usuario_id, fogueira_boss) VALUES (?, 1)", (usuario_id,))


def fogueira_acesa(usuario_id: int) -> bool:
    return bool(executar("SELECT 1 FROM progresso WHERE usuario_id = ? AND fogueira_boss = 1", (usuario_id,)))


# ---------- memória de longo prazo ----------

def salvar_fato(usuario_id: int, fato: str) -> None:
    executar("INSERT OR IGNORE INTO memorias (usuario_id, fato) VALUES (?, ?)", (usuario_id, fato))


def fatos(usuario_id: int) -> list[str]:
    return [r["fato"] for r in executar("SELECT fato FROM memorias WHERE usuario_id = ?", (usuario_id,))]
