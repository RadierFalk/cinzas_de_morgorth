# 🏦🧼 Banco Mestre S.A. — Consultor Vorcado

Chat **satírico** em que o "Consultor Vorcado", banqueiro fictício, "lava dinheiro" de forma
**literal**: máquina de lavar, varal, ferro de passar. Nada aqui descreve práticas reais.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `app.py` | Servidor web (FastAPI): login, chat com o Groq, ferramentas e memória |
| `db.py` | Banco SQLite (`vorcado.db`): usuários, sessões, mensagens e memórias |
| `lavanderia.py` | Servidor **MCP** com as ferramentas cômicas |
| `index.html` | Tela de login + chat |

## Como funciona

- **Login:** senha guardada com hash `bcrypt`; ao entrar, um token de sessão vai num cookie.
- **Conversa gravada:** toda mensagem fica na tabela `mensagens`; as últimas 20 vão para o modelo.
- **Ferramentas (MCP):** o `app.py` inicia o `lavanderia.py` e repassa as ferramentas dele ao Groq.
- **Memória:** duas ferramentas locais:
  - `salvar_memoria`: o modelo guarda fatos sobre o cliente, que entram sempre no prompt;
  - `buscar_conversas_antigas`: o modelo pesquisa nas mensagens gravadas.

## Como rodar

1. Copie `.env.example` para `.env` e coloque sua chave do Groq (<https://console.groq.com/keys>).
2. Instale (Python 3.10+):
   ```powershell
   py -3.13 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```
3. Rode e abra <http://127.0.0.1:8000>:
   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn app:app --reload
   ```
