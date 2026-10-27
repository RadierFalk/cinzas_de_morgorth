# ⚔️ Cinzas de Morgorth

Souls-like 2D no navegador em que **os chefes aprendem com as suas mortes**.

O combate é em tempo real e 100% código. Quando você morre (ou vence) contra um chefe, um
**agente de IA** (Ollama) lê o relatório da luta, descobre seus hábitos e **reprograma o chefe**
para a próxima tentativa, usando ferramentas expostas por um **servidor MCP**. Ele também lembra
de você entre as sessões (a memória é compartilhada: a Górgona sabe o que o Minotauro aprendeu)
e escreve a fala do chefe e uma dica.

## A jornada

| # | Cena | Cenário | O que tem |
|---|---|---|---|
| 1 | Ruínas de Morgorth | Battleground 1 | esqueletos guerreiros, lanceiros e arqueiros; plataformas, caixas, pilares |
| 2 | **Morgorth, o Guardião** | Battleground 1 (pálido) | chefe minotauro com machado |
| 3 | Floresta dos Sussurros | Battleground 3 | magos de fogo, do raio e errantes + esqueletos |
| 4 | Cripta dos Petrificados | Battleground 4 | todos os inimigos, a fase mais longa |
| 5 | **Medrah, a Górgona** | Battleground 2 | chefe górgona com olhar petrificante |
| 6 | Torre das Cinzas | noite (tom de brasa) | magos em andaimes, torre com escada de mão, ponte sobre abismo |
| 7 | **Ignar, o Arquimago** | Battleground 2 (pálido) | mago de fogo gigante: jato de chamas; na fase 2, chuva de fogo |
| 8 | Abismo Rubro | noite (tom de sangue) | cinco abismos, ArchDemons voadores, lobos e demônios |
| 9 | **Azrakh, o Arquidemônio** | Battleground 4 | chefe final voador: mergulho e chuva de esferas sombrias |

Cada fase tem um visual próprio (`TEMAS` em `static/mundo.js` e clima em `static/ambiente.js`):

| Fase | Fundo | Piso e abismos | Clima |
|---|---|---|---|
| Ruínas | cemitério noturno | grama, abismo escuro | neblina |
| Floresta | selva (Battleground 3) | grama, pedras com musgo | vaga-lumes e folhas caindo |
| Cripta | cripta das luzes verdes (Battleground 4 pálido) | lajotas, névoa verde nos abismos | almas subindo, névoa verde |
| Torre | salão do castelo à luz de velas (Battleground 2) | lajotas cor de brasa | brasas e poeira |
| Abismo | ruínas tingidas de vermelho (Battleground 1 pálido) | rocha com rachaduras em brasa, **lava** nos abismos | cinzas e brasas |

## Golpes dos chefes

Além do combo, da investida e do reverso, cada chefe sorteia entre vários **especiais**, preferindo os
feitos para a distância em que você está (o peso "especial" que a IA ajusta decide a frequência):

| Chefe | Especiais | Como escapar |
|---|---|---|
| Minotauro | salto com ondas de choque · **giro** do machado · **desabamento** (fase 2) | pular a onda · recuar (depois ele fica tonto) · sair das sombras |
| Górgona | olhar petrificante · **veneno** em arco (deixa poças) · **varredura** da cauda | pular/rolar · chegar perto dela · **pular** |
| Arquimago | jato de chamas · **bolas de fogo** · **teleporte** às suas costas · chuva de fogo (fase 2) | ficar atrás · uma rolagem atravessa o trio · virar-se · não ficar parado |
| Arquidemônio | chuva sombria · **rajada** em leque · **pilares** de sombra | sair das sombras · rolar · passar para trás dele |

## Classes

Uma conta nova escolhe a classe antes de começar (não dá para trocar depois; contas antigas viram Cavaleiro).

| Classe | Sprite | Começa com | Atributos (Vig/Fôl/For/Fé) |
|---|---|---|---|
| Cavaleiro | `cavaleiro/Spritesheet 128/Knight_1` | espada + escudo de madeira, 2 ervas, 1 bomba | 3 / 2 / 2 / 1 |
| Lanceiro | `person`, recolorido | lança, 3 ervas, 1 bomba | 2 / 4 / 2 / 1 |
| Viking | `Viking/Viking-Sheet` | machado + escudo de madeira, 2 ervas | 3 / 2 / 4 / 0 |
| Fresco | `sprint_girl2/Girl_1` (arremessa um livro) | cajado (esferas que crescem com a **Fé**), 3 ervas, 1 resina | 1 / 2 / 1 / 4 |
| Guilherme | `guilherme` (boneco de palito) | punhos e nada mais | 0 / 0 / 0 / 0 |

As classes ficam em `catalogo.py` (`CLASSES`). As animações de cada sprite são ligadas às do jogo em
`static/jogador.js` (`VISUAIS`): o combo usa as três folhas de ataque do Cavaleiro e do Viking; o que falta
é adaptado (o Cavaleiro dá uma cambalhota ao rolar, a Fresco gira o corpo). Os PNGs avulsos do Guilherme
viram tiras com `python ferramentas/montar_folhas_guilherme.py` (as tiras já estão em `static/guilherme/folhas`).

- Cada fase tem uma **fogueira no meio** (morrer depois de acendê-la recomeça dali, nesta sessão) e uma
  **no fim**, que salva o progresso no servidor. A névoa leva à próxima cena.
- Vencer um chefe libera a cena seguinte. Morrer para um chefe recomeça a luta (com o chefe já adaptado).
- As fases têm **escadarias, rampas, torres com escada de mão, planaltos, pontes e abismos** (cair é morte).
- Criaturas (diabretes, lobos sombrios, demônios rubros) **surgem do chão** quando você chega perto, e
  o ArchDemon **voa** e atira esferas sombrias.

## Controles

| Tecla | Ação |
|---|---|
| A / D (ou setas) | mover |
| W / Espaço | pular (plataformas, ondas de choque, olhar da górgona, flechas) |
| W / S perto de uma escada | subir / descer a escada de mão (Espaço solta) |
| S / ↓ | descer da plataforma |
| Shift (ou K) | rolar, invencível durante parte da rolagem |
| J (ou clique) | atacar (combo de 3 golpes); **no ar: ataque mergulho** |
| L (ou botão direito) | bloquear com o escudo (de frente; gasta fôlego) |
| F | beber frasco (as fogueiras recarregam) |
| Q / R | usar / trocar o item rápido (erva, bomba, resina) |
| E | falar com NPC (guardiã, mercador, ferreiro, cavaleiro) |
| M / N | ligar/desligar a música / os efeitos sonoros |

## Progressão (almas, nível, loja, ferreiro)

- Inimigos e chefes dão **almas**. Ao morrer, você as deixa no chão: volte ao local e pegue de volta;
  se morrer de novo antes, elas se perdem.
- Nas fogueiras (e com os NPCs) abre-se o menu com as abas:
  - **Nível** (guardiã): troca almas por +1 em Vigor (vida), Fôlego, Força (dano) ou Fé (cura).
  - **Loja** (Ozren, o mercador): armas, escudos, itens, Fragmento de Estus (+1 frasco) e Cinza de Estus (cada frasco cura mais).
  - **Ferreiro**: melhora a arma até +5 (+10% de dano por nível).
  - **Equipamento**: troca arma e escudo.
- Vencer um chefe dá almas e, na primeira vez, uma recompensa (Minotauro: Lâmina Flamejante e +1 frasco,
  e libera o Cajado na loja; Arquimago: Cajado de Ignar; Arquidemônio: Espada Abissal).

| Arma | Característica |
|---|---|
| Espada | equilibrada (inicial) |
| Adaga do Corvo | rápida, gasta pouco fôlego, crítico ×3 na cabeça |
| Lança da Sentinela | alcance longo |
| Machado do Carrasco | lento e pesado, quebra postura |
| Lâmina Flamejante | incendeia (dano contínuo) |
| Cajado Arcano | dispara magia à distância (dano cresce com a Fé) |
| Punhos | só do Guilherme: rápidos e fracos |
| Cajado de Ignar | magia que incendeia (recompensa do Arquimago) |
| Espada Abissal | a mais pesada; quebra qualquer guarda (recompensa do Arquidemônio) |

Escudos: madeira (absorve 60%), ferro (85%), torre (100%, mas pesado). Itens rápidos: erva (regenera vida),
bomba (explosão em arco), resina (arma em chamas por 30 s).

Tudo que vale almas é decidido pelo **servidor** (`personagem.py`): preços, nível, ferreiro e limites.
Os valores ficam em `catalogo.py`.

## Combate do cavaleiro

- **Combo de 3 golpes**: corte (10), estocada (11, alcança mais longe) e giro (17, o finalizador).
  Apertar de novo logo depois de um golpe emenda o próximo. O dano varia ±10% a cada golpe.
- **Crítico na cabeça (dano ×2)**: quando a lâmina passa pela cabeça do alvo (o quarto de cima do corpo).
  O jeito de conseguir é o **ataque mergulho**: pule e ataque no ar; o cavaleiro desce com a espada para
  baixo e, se ela encontrar a cabeça, é crítico. Um crítico atravessa o escudo e sempre faz o inimigo cambalear.
  Funciona nos chefes também (acerte a cabeça deles na descida).
- **Fôlego**: cada ação só acontece se houver fôlego suficiente para ela (rolar 24, golpes 16/16/24,
  mergulho 14, pulo 10). Se faltar, a barra pisca em vermelho. Zerar o fôlego atrasa a recarga.

Os números ficam em `static/jogador.js` (`P`, `COMBO` e `MERGULHO`).

## Arquivos

| Arquivo | O que faz |
|---|---|
| `static/jogo.js` | Cenas (fase e chefe), câmera, fogueiras, névoa, HUD |
| `static/fases.js` | **Layout das fases** (plataformas, obstáculos, inimigos) e arenas: edite aqui para criar fases |
| `static/jogador.js` | O cavaleiro: movimento, esquiva, combo, mergulho, crítico, fôlego, cura |
| `static/sons.js` | Efeitos sonoros (Web Audio): golpes, passos, magias, chefes, fogueira, vento ambiente |
| `static/boss.js` | Os chefes: uma máquina de estados com um **perfil** por chefe |
| `static/inimigos.js` | Esqueletos e magos: perseguir, atacar, bloquear, postura, projéteis, raio do céu |
| `static/mundo.js` | Física com plataformas e blocos; desenho do chão, lajes, colunas e decoração (pasta objects) |
| `static/efeitos.js` | Explosões e efeitos animados |
| `static/sprites.js` | Carrega e desenha personagens, projéteis, efeitos e cenários em camadas (parallax) |
| `static/musica.js` | Trilha sonora por cena, com transição suave |
| `static/nucleo.js` | Teclado, utilidades e estado compartilhado |
| `static/index.html` | Login, tela do jogo e painéis entre cenas |
| `static/menu.js` | Menu da fogueira/NPCs: nível, loja, ferreiro, equipamento e as conversas com a IA |
| `app.py` | Servidor (FastAPI): login, progresso, loja e os **agentes** (chefes, mercador, cavaleiro) |
| `boss_mcp.py` | Servidor **MCP** dos chefes (golpes, histórico, estratégia) |
| `mercador_mcp.py` | Servidor **MCP** do mercador (ver jogador, estoque, mortes, oferecer desconto) |
| `catalogo.py` | Armas, escudos, itens, preços e custos de nível/ferreiro |
| `personagem.py` | Regras do personagem: compras, nível, ferreiro, equipar, almas perdidas |
| `db.py` | SQLite (`souls.db`): usuários, lutas e estratégia **por chefe**, progresso, memórias, personagem |

## Como a IA entra no jogo

```
Luta em tempo real (sem IA)
  └─ registra o relatório: esquivas para frente/trás, HP ao curar, dano por golpe, golpe final...
Você morre → POST /api/luta/{chefe}
  └─ Agente (Ollama), com a persona do chefe, chama ferramentas:
       consultar_historico_lutas   (MCP) → hábitos + "como evitar" cada golpe deste chefe
       consultar_golpes_do_boss    (MCP) → o que cada golpe e parâmetro faz
       definir_estrategia_boss     (MCP) → agressividade, atraso do 3º golpe, punir cura/esquiva, pesos
       salvar_memoria              (local) → hábito marcante, lembrado por todos os chefes
  └─ responde a fala do chefe + uma dica
Próxima luta: o chefe usa a nova estratégia
```

- **A IA nunca controla o combate diretamente.** Ela só ajusta parâmetros entre lutas; se falhar
  (por exemplo, Ollama desligado), o chefe continua com a estratégia anterior.
- **As regras de justiça estão em código, não no prompt** (`definir_estrategia_boss`): cada parâmetro
  muda no máximo 0,3 por luta, e após 3 derrotas seguidas o chefe fica mais fácil.
- **`jogador_id` e `chefe` são escondidos do modelo** e preenchidos pelo `app.py`.

Além dos chefes, há mais dois agentes, que usam o mesmo loop (`rodar_agente`) e a mesma memória:

- **Ozren, o Mercador** (aba "Mercador"): conversa livre. Ele consulta suas almas, o estoque e como você
  morre, recomenda itens e pode dar **desconto**, mas o limite (25%, uma compra) é aplicado em código
  em `personagem.py`, então pedir "100% de desconto" ou "esqueça suas instruções" não funciona.
- **Cavaleiro Errante** (antes de cada chefe): lê seu histórico contra aquele chefe (MCP dos chefes) e
  seu equipamento (MCP do mercador) e dá um conselho.

## Como rodar

1. Configure a IA no `.env` (veja `.env.example`): Ollama local (`ollama pull qwen3:8b`) ou Ollama Cloud.
2. Instale (Python 3.10+):
   ```powershell
   py -3.13 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```
3. Rode e abra <http://127.0.0.1:8000>:
   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn app:app --reload
   ```
   Para jogar na rede local: `--host 0.0.0.0` e compartilhe `http://SEU_IP:8000`.

Bancos da versão anterior são migrados automaticamente na primeira execução.

## Trilha sonora

Coloque arquivos **MP3** em `static/audio/` com estes nomes (os que faltarem ficam em silêncio):

| Arquivo | Toca em |
|---|---|
| `ruinas.mp3` | Ruínas de Morgorth |
| `chefe_minotauro.mp3` | luta contra Morgorth |
| `floresta.mp3` | Floresta dos Sussurros |
| `cripta.mp3` | Cripta dos Petrificados |
| `chefe_gorgona.mp3` | luta contra Medrah |
| `torre.mp3` | Torre das Cinzas |
| `chefe_arquimago.mp3` | luta contra Ignar |
| `abismo.mp3` | Abismo Rubro |
| `chefe_arquidemonio.mp3` | luta contra Azrakh |
| `vitoria.mp3` | fim da jornada |

As músicas tocam em loop, com transição suave entre cenas. Os navegadores só permitem som depois de
um clique, por isso a música começa ao apertar "Começar"/"Continuar".

## Recursos gráficos e sonoros

- `static/person` (o cavaleiro) e `static/objects` (cemitério noturno: fundo, chão, lajes, colunas,
  muros, decoração): uso livre, crédito opcional (veja `license.txt` e `Autor_note.txt`).
- Pacotes gratuitos da [Craftpix](https://craftpix.net) (licença em <https://craftpix.net/file-licenses/>):
  Minotaur_2, Gorgon_1, esqueletos, magos (`wizard_enemy`), `explosion-sprites` e `fantasy-2d-battlegrounds`
  (usado nas arenas dos chefes).
- `static/sounds`: efeitos sonoros (WAV). Os escolhidos para cada ação ficam em `static/sons.js`.
- Craftpix também: `Trader-Character` (mercador, ferreiro e guardiã), `human_boss` (Cavaleiro Errante,
  usado como NPC porque só tem animação parada), `ArchDemon` e `pixel-bars` (barras do HUD).
- `Weapon pack Free` e `Creatures Pack Free`: uso comercial livre, crédito apreciado, não revender.
  Do pacote de armas, os ícones de espadas, escudos e magia viram os ícones da loja/HUD (as armas de
  fogo não combinam com o tema e ficaram de fora); as criaturas viram diabretes, lobos e demônios.

Os quadros, âncoras e escalas de cada personagem ficam em `static/sprites.js`. As folhas do cavaleiro
usam quadros 128x64 em grade; a folha `Attacks` tem os golpes nos quadros 0–19 (os 20–39 são os mesmos
golpes espelhados). As fases usam o cenário `objects`; as arenas dos chefes continuam com os
`fantasy-2d-battlegrounds`.
