// Layout de cada fase e de cada arena. Para criar ou ajustar uma fase, basta editar estes dados.
//   plataforma(x1, x2, altura)             laje de pedra de mão única, "altura" px acima do chão
//   bloco(tipo, x, largura, altura, base)  obstáculo sólido: "muro" (88x48) | "coluna" (33x65)
//   inimigos: [tipo, x, altura]             altura = em cima de qual plataforma nasce (0 = chão)
//   meio: fogueira no meio da fase (morrer depois de acendê-la recomeça dali)
//   fogueira: fogueira do fim (salva o progresso para a próxima cena); nevoa: saída da fase
//   tinta: cor por cima do fundo, para cada fase ter seu clima (o fundo é o mesmo cemitério noturno)
// O pulo alcança ~100 px: plataformas a 90 px dá para subir do chão; a 180 px, só a partir de outra a 90.
import { CHAO } from "./nucleo.js";

const plataforma = (x1, x2, altura) => ({ x1, x2, y: CHAO - altura });
const bloco = (tipo, x, largura, altura, base = 0) => ({ tipo, x1: x, x2: x + largura, y1: CHAO - base - altura, y2: CHAO - base });
const muro = (x, base = 0) => bloco("muro", x, 88, 48, base);
const coluna = (x, base = 0) => bloco("coluna", x, 33, 65, base);

export const FASES = {
  ruinas: {
    nome: "RUÍNAS DE MORVATH", cenario: "noite", tema: "ruinas", tinta: null,
    largura: 4400, meio: 2560, fogueira: 3950, nevoa: 4200,
    plataformas: [plataforma(980, 1160, 90), plataforma(1640, 1820, 90), plataforma(1880, 2060, 180), plataforma(2900, 3080, 90)],
    blocos: [muro(560), muro(1420), coluna(1448, 48), coluna(2440), muro(3320), muro(3700)],
    inimigos: [
      ["guerreiro", 760, 0], ["arqueiro", 1070, 90], ["lanceiro", 1280, 0], ["guerreiro", 1720, 0],
      ["arqueiro", 1970, 180], ["guerreiro", 2250, 0], ["guerreiro", 2340, 0], ["lanceiro", 2790, 0],
      ["arqueiro", 2990, 90], ["guerreiro", 3500, 0], ["lanceiro", 3620, 0],
    ],
  },
  floresta: {
    nome: "FLORESTA DOS SUSSURROS", cenario: "noite", tema: "floresta", tinta: "rgba(40, 90, 30, 0.28)",
    largura: 4800, meio: 2820, fogueira: 4450, nevoa: 4620,
    plataformas: [plataforma(1100, 1290, 90), plataforma(1350, 1520, 180), plataforma(2350, 2560, 90),
      plataforma(3280, 3460, 90), plataforma(3520, 3700, 180)],
    blocos: [muro(640), coluna(1910), muro(2900), coluna(4060)],
    inimigos: [
      ["mago_errante", 900, 0], ["guerreiro", 1180, 0], ["mago_fogo", 1430, 180], ["lanceiro", 1720, 0],
      ["mago_raio", 2200, 0], ["mago_errante", 2450, 90], ["guerreiro", 2650, 0], ["mago_fogo", 3150, 0],
      ["mago_raio", 3600, 180], ["guerreiro", 3800, 0], ["lanceiro", 3950, 0], ["mago_errante", 4300, 0],
    ],
  },
  cripta: {
    nome: "CRIPTA DOS PETRIFICADOS", cenario: "noite", tema: "cripta", tinta: "rgba(70, 25, 90, 0.26)",
    largura: 5400, meio: 2420, fogueira: 5000, nevoa: 5220,
    plataformas: [plataforma(700, 880, 90), plataforma(1500, 1700, 90), plataforma(1760, 1940, 180), plataforma(2600, 2800, 90),
      plataforma(3400, 3600, 90), plataforma(3660, 3840, 180), plataforma(4400, 4600, 90)],
    blocos: [coluna(480), coluna(1200), muro(2200), coluna(3050), coluna(4160), coluna(4800)],
    inimigos: [
      ["guerreiro", 620, 0], ["arqueiro", 790, 90], ["mago_fogo", 1050, 0], ["lanceiro", 1380, 0],
      ["mago_raio", 1850, 180], ["guerreiro", 1980, 0], ["guerreiro", 2100, 0], ["mago_errante", 2700, 90],
      ["lanceiro", 2950, 0], ["arqueiro", 3500, 90], ["mago_fogo", 3750, 180], ["guerreiro", 3900, 0],
      ["mago_raio", 4300, 0], ["guerreiro", 4500, 90], ["lanceiro", 4700, 0],
    ],
  },
};

// Arenas dos chefes: cabem numa tela, sem plataformas (os golpes dos chefes assumem chão plano)
export const ARENAS = {
  minotauro: { cenario: "ruinas_palidas" },
  gorgona: { cenario: "salao" },
};
