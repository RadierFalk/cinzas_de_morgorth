# ⚔️ Cinzas de Morvath

Souls-like 2D no navegador com um **boss que aprende com as suas mortes**.

Atravesse as **Ruínas de Morvath** (esqueletos guerreiros, lanceiros e arqueiros), acenda a
**fogueira** e atravesse a névoa para enfrentar **Morvath, o Guardião**, um minotauro com machado.
Depois de acender a fogueira, as próximas tentativas começam direto no chefão.

O combate é em tempo real e 100% código. Quando você morre (ou vence), um **agente de IA**
(Ollama) lê o relatório da luta, descobre seus hábitos e **reprograma o boss** para a próxima
tentativa, usando ferramentas expostas por um **servidor MCP**. Ele também lembra de você
entre as sessões e escreve a fala do boss e uma dica.

## Controles

| Tecla | Ação |
|---|---|
| A / D (ou setas) | mover |
| W / Espaço | pular (desvia das ondas de choque) |
| Shift (ou K) | rolar, invencível durante parte da rolagem |
| J (ou clique) | atacar |
| F | beber frasco (3 por luta) |

## Arquivos

| Arquivo | O que faz |
|---|---|
| `static/jogo.js` | Cenas (fase e chefão), câmera, cenário com parallax, fogueira, névoa, HUD |
| `static/jogador.js` | A jogadora: movimento, esquiva, chute, cura |
| `static/boss.js` | O minotauro: máquina de estados do combate e relatório da luta |
| `static/inimigos.js` | Esqueletos: perseguir, atacar, bloquear com escudo, postura, flechas |
| `static/sprites.js` | Carrega as folhas de sprites e desenha os quadros (âncoras, flash de dano) |
| `static/nucleo.js` | Teclado, utilidades e estado compartilhado |
| `static/index.html` | Login, tela do jogo e painel entre lutas |
| `app.py` | Servidor (FastAPI): login e o **agente** que analisa a luta |
| `boss_mcp.py` | Servidor **MCP** com as ferramentas do agente |
| `db.py` | SQLite (`souls.db`): usuários, sessões, lutas, estratégia do boss e memórias |

## Como a IA entra no jogo

```
Luta em tempo real (jogo.js, sem IA)
  └─ registra o relatório: esquivas para frente/trás, HP ao curar, dano por golpe, golpe final...
Você morre → POST /api/luta (app.py)
  └─ Agente (Ollama) chama ferramentas:
       consultar_historico_lutas   (MCP) → hábitos + "como evitar" cada golpe
       definir_estrategia_boss     (MCP) → agressividade, atraso do 3º golpe, punir cura/esquiva, pesos
       salvar_memoria              (local) → hábito marcante, lembrado em todas as próximas lutas
  └─ responde a fala do boss + uma dica
Próxima luta: o boss usa a nova estratégia
```

Decisões importantes:

- **A IA nunca controla o combate diretamente.** Ela só ajusta parâmetros entre lutas. A latência
  do modelo não afeta o jogo, e se a IA falhar (por exemplo, com o Ollama desligado) o boss
  continua com a estratégia anterior.
- **As regras de justiça estão em código, não no prompt** (`definir_estrategia_boss`):
  cada parâmetro muda no máximo 0,3 por luta, e após 3 derrotas seguidas o boss fica mais fácil.
  Nos testes, a IA ignorou essa regra quando ela estava só no prompt.
- **O `jogador_id` é escondido do modelo.** O `app.py` remove esse campo das ferramentas e o
  preenche sozinho, então a IA não consegue mexer no boss de outro jogador.

## Como rodar

1. Escolha onde a IA roda e configure o `.env` (veja `.env.example`):
   - **Ollama local:** instale em <https://ollama.com/download> e baixe um modelo com suporte
     a ferramentas, por exemplo `ollama pull qwen3:8b`. Não precisa de chave.
   - **Ollama Cloud:** crie uma chave em <https://ollama.com/settings/keys> e preencha
     `OLLAMA_HOST=https://ollama.com`, `OLLAMA_API_KEY` e `OLLAMA_MODEL=gpt-oss:120b`.
2. Instale (Python 3.10+):
   ```powershell
   py -3.13 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```
3. Rode e abra <http://127.0.0.1:8000>:
   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn app:app --reload
   ```

Para inspecionar o estado da luta no console do navegador:
`(await import("/static/jogo.js")).depurar()`

## Sprites

Pacotes gratuitos da [Craftpix](https://craftpix.net) (licença em <https://craftpix.net/file-licenses/>):
`static/sprint_girl2` (Girl_2), `static/sprint_minotaur2` (Minotaur_2) e `static/esqueleto_2`.
Cada PNG é uma tira de quadros 128×128. Os quadros usados em cada animação, a âncora (centro dos
pés) e a escala de cada personagem ficam em `static/sprites.js`.

O pacote da Girl_2 não tem animações de rolar, pular, levar dano e morrer. Elas foram montadas
com o que existe: a corrida girando com rastro, o joelho erguido do chute, a pose de defesa
tingida de vermelho e a mesma pose caindo.

## Ideias para evoluir

- Sons de golpe, esquiva e morte (Web Audio).
- NPC na fogueira, entre as lutas, que conversa com você e lembra das suas mortes.
- Mais golpes no boss e novos parâmetros para a IA ajustar.
- Mapa com fases antes do boss (Phaser.js).
