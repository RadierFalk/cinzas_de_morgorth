"""Banco SQLite: usuários, sessões de login, mensagens e memórias."""
import sqlite3

ARQUIVO = "vorcado.db"


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
        CREATE TABLE IF NOT EXISTS mensagens (
            id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL,
            role TEXT NOT NULL, content TEXT NOT NULL,
            criada_em TEXT DEFAULT CURRENT_TIMESTAMP
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


# ---------- mensagens (conversa gravada) ----------

def salvar_mensagem(usuario_id: int, role: str, content: str) -> None:
    executar("INSERT INTO mensagens (usuario_id, role, content) VALUES (?, ?, ?)", (usuario_id, role, content))


def historico(usuario_id: int, limite: int = 100) -> list[dict]:
    """Últimas mensagens do usuário, da mais antiga para a mais nova."""
    return executar(
        "SELECT role, content FROM (SELECT id, role, content FROM mensagens WHERE usuario_id = ? "
        "ORDER BY id DESC LIMIT ?) ORDER BY id",
        (usuario_id, limite),
    )


def buscar_mensagens(usuario_id: int, termo: str) -> list[dict]:
    return executar(
        "SELECT role, content, criada_em FROM mensagens WHERE usuario_id = ? AND content LIKE ? "
        "ORDER BY id DESC LIMIT 5",
        (usuario_id, f"%{termo}%"),
    )


# ---------- memória de longo prazo ----------

def salvar_fato(usuario_id: int, fato: str) -> None:
    executar("INSERT OR IGNORE INTO memorias (usuario_id, fato) VALUES (?, ?)", (usuario_id, fato))


def fatos(usuario_id: int) -> list[str]:
    return [r["fato"] for r in executar("SELECT fato FROM memorias WHERE usuario_id = ?", (usuario_id,))]
