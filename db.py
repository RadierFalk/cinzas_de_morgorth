"""Banco SQLite: usuários, sessões, lutas, estratégia de cada chefe, progresso e memórias.

Usado tanto pelo app.py quanto pelo servidor MCP (boss_mcp.py).
"""
import json
import sqlite3

ARQUIVO = "souls.db"

# Ordem da campanha. Morrer numa fase recomeça a fase; vencer um chefe libera a próxima.
CENAS = ["ruinas", "minotauro", "floresta", "cripta", "gorgona"]
CHEFES = {
    "minotauro": "Mais uma cinza que vem perturbar meu descanso. Aproxime-se.",
    "gorgona": "Mais uma estátua para o meu salão. Olhe para mim, viajante.",
}

# Como um chefe luta quando ainda não aprendeu nada sobre o jogador
ESTRATEGIA_PADRAO = {
    "agressividade": 0.4,          # 0 = espera muito entre ataques, 1 = ataca sem parar
    "atraso_terceiro_golpe": 0.3,  # 0 = combo em ritmo constante, 1 = terceiro golpe bem atrasado
    "punir_cura": False,           # avança com investida rápida quando o jogador bebe o frasco
    "punir_rolagem": "nenhuma",    # "para_tras", "para_frente" ou "nenhuma"
    "pesos": {"combo": 1.0, "investida": 1.0, "especial": 1.0},
}


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
        CREATE TABLE IF NOT EXISTS estrategias (
            usuario_id INTEGER NOT NULL, chefe TEXT NOT NULL, estrategia TEXT NOT NULL, fala TEXT NOT NULL,
            PRIMARY KEY (usuario_id, chefe)
        );
        CREATE TABLE IF NOT EXISTS progresso (
            usuario_id INTEGER PRIMARY KEY, fogueira_boss INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS memorias (
            id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL, fato TEXT NOT NULL,
            UNIQUE (usuario_id, fato)
        );
        CREATE TABLE IF NOT EXISTS personagens (
            usuario_id INTEGER PRIMARY KEY, dados TEXT NOT NULL
        );
    """)
    migrar(conn)
    conn.close()


def migrar(conn: sqlite3.Connection) -> None:
    """Atualiza bancos criados pela versão com um chefe só, sem perder nada."""
    colunas = lambda tabela: {c[1] for c in conn.execute(f"PRAGMA table_info({tabela})")}
    if "chefe" not in colunas("lutas"):
        conn.execute("ALTER TABLE lutas ADD COLUMN chefe TEXT NOT NULL DEFAULT 'minotauro'")
    if "cena" not in colunas("progresso"):
        conn.execute("ALTER TABLE progresso ADD COLUMN cena TEXT NOT NULL DEFAULT 'ruinas'")
        conn.execute("UPDATE progresso SET cena = 'minotauro' WHERE fogueira_boss = 1")
    if conn.execute("SELECT name FROM sqlite_master WHERE name = 'boss'").fetchone():
        conn.execute("INSERT OR IGNORE INTO estrategias SELECT usuario_id, 'minotauro', estrategia, fala FROM boss")
        conn.execute("DROP TABLE boss")
    conn.commit()


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


# ---------- lutas contra chefes ----------

def salvar_luta(usuario_id: int, chefe: str, resultado: str, log: dict) -> None:
    executar("INSERT INTO lutas (usuario_id, chefe, resultado, log) VALUES (?, ?, ?, ?)",
             (usuario_id, chefe, resultado, json.dumps(log, ensure_ascii=False)))


def lutas(usuario_id: int, chefe: str, limite: int = 5) -> list[dict]:
    """Últimas lutas contra um chefe, da mais recente para a mais antiga."""
    linhas = executar("SELECT resultado, log, criada_em FROM lutas WHERE usuario_id = ? AND chefe = ? "
                      "ORDER BY id DESC LIMIT ?", (usuario_id, chefe, limite))
    return [{**l, "log": json.loads(l["log"])} for l in linhas]


def placar(usuario_id: int, chefe: str) -> dict:
    resultados = [l["resultado"] for l in executar(
        "SELECT resultado FROM lutas WHERE usuario_id = ? AND chefe = ? ORDER BY id DESC", (usuario_id, chefe))]
    seguidas = 0
    for r in resultados:
        if r != "morte":
            break
        seguidas += 1
    return {"mortes": resultados.count("morte"), "vitorias": resultados.count("vitoria"),
            "derrotas_seguidas": seguidas}


# ---------- estratégia de cada chefe ----------

def estado_boss(usuario_id: int, chefe: str) -> dict:
    linhas = executar("SELECT estrategia, fala FROM estrategias WHERE usuario_id = ? AND chefe = ?",
                      (usuario_id, chefe))
    if not linhas:
        return {"estrategia": ESTRATEGIA_PADRAO, "fala": CHEFES[chefe]}
    estrategia = json.loads(linhas[0]["estrategia"])
    pesos = estrategia["pesos"]
    if "salto" in pesos:  # versão antiga chamava o golpe especial do minotauro de "salto"
        pesos["especial"] = pesos.pop("salto")
    return {"estrategia": estrategia, "fala": linhas[0]["fala"]}


def salvar_estrategia(usuario_id: int, chefe: str, estrategia: dict) -> None:
    fala = estado_boss(usuario_id, chefe)["fala"]
    executar("INSERT OR REPLACE INTO estrategias (usuario_id, chefe, estrategia, fala) VALUES (?, ?, ?, ?)",
             (usuario_id, chefe, json.dumps(estrategia), fala))


def salvar_fala(usuario_id: int, chefe: str, fala: str) -> None:
    estrategia = estado_boss(usuario_id, chefe)["estrategia"]
    executar("INSERT OR REPLACE INTO estrategias (usuario_id, chefe, estrategia, fala) VALUES (?, ?, ?, ?)",
             (usuario_id, chefe, json.dumps(estrategia), fala))


# ---------- progresso na campanha ----------

def cena_atual(usuario_id: int) -> str:
    linhas = executar("SELECT cena FROM progresso WHERE usuario_id = ?", (usuario_id,))
    return linhas[0]["cena"] if linhas else CENAS[0]


def salvar_cena(usuario_id: int, cena: str) -> None:
    executar("INSERT INTO progresso (usuario_id, cena) VALUES (?, ?) "
             "ON CONFLICT (usuario_id) DO UPDATE SET cena = excluded.cena", (usuario_id, cena))


# ---------- personagem (nível, almas, equipamento, itens) ----------

def carregar_personagem(usuario_id: int, inicial: dict) -> dict:
    linhas = executar("SELECT dados FROM personagens WHERE usuario_id = ?", (usuario_id,))
    if not linhas:
        return json.loads(json.dumps(inicial))  # cópia
    dados = json.loads(linhas[0]["dados"])
    return {**json.loads(json.dumps(inicial)), **dados}  # campos novos ganham o valor inicial


def salvar_personagem(usuario_id: int, dados: dict) -> None:
    executar("INSERT OR REPLACE INTO personagens (usuario_id, dados) VALUES (?, ?)",
             (usuario_id, json.dumps(dados, ensure_ascii=False)))


def chefes_vencidos(usuario_id: int) -> set[str]:
    return {l["chefe"] for l in executar(
        "SELECT DISTINCT chefe FROM lutas WHERE usuario_id = ? AND resultado = 'vitoria'", (usuario_id,))}


# ---------- memória de longo prazo (compartilhada entre os chefes) ----------

def salvar_fato(usuario_id: int, fato: str) -> None:
    executar("INSERT OR IGNORE INTO memorias (usuario_id, fato) VALUES (?, ?)", (usuario_id, fato))


def fatos(usuario_id: int) -> list[str]:
    return [r["fato"] for r in executar("SELECT fato FROM memorias WHERE usuario_id = ?", (usuario_id,))]
