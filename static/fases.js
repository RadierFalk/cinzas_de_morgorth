// Layout de cada fase e de cada arena. Para criar ou ajustar uma fase, basta editar estes dados.
// cenario = fundo (sprites.js); tinta = cor por cima de tudo ("mistura: multiply" tinge em vez de escurecer).
// O visual de cada tema (piso, abismos, cor da pedra, clima) fica em TEMAS, no mundo.js.
//   plataforma(x1, x2, altura)        laje de mão única "altura" px acima do chão (altura 0 = ponte sobre abismo)
//   muro(x) / coluna(x)               obstáculos baixos (88x48 / 33x65): pule por cima
//   planalto(x1, x2, altura)          estrutura de tijolos com topo caminhável
//   escadaria(x, degraus, sobe)       degraus de 16 px que se sobem andando (sobe=false: escadaria que desce)
//   rampa(x1, x2, altura1, altura2)   chão inclinado (subida ou descida)
//   escada(x, altura)                 escada de mão do chão até "altura" (W/S para subir e descer)
//   buraco(x1, x2)                    abismo: cair = morrer (até ~140 px dá para pular; mais que isso, use ponte)
//   inimigos: [tipo, x, altura]       altura = em cima de qual superfície nasce (0 = chão)
//   itens: [item, x, altura]          itens deixados pelo caminho (recompensa para quem explora)
//   npcs: [tipo, x]                   guardia (nível), mercador (loja/IA), ferreiro (melhorias), cavaleiro_errante (conselho/IA)
//   meio / fogueira / nevoa           fogueira do meio (volta-se para ela ao morrer), fogueira do fim (salva) e saída
// O pulo alcança ~100 px de altura e ~170 px de distância. Um degrau tem no máximo 18 px.
import { CHAO } from "./nucleo.js";

const plataforma = (x1, x2, altura) => ({ x1, x2, y: CHAO - altura });
const bloco = (tipo, x, largura, altura, base = 0) => ({ tipo, x1: x, x2: x + largura, y1: CHAO - base - altura, y2: CHAO - base });
const muro = (x, base = 0) => bloco("muro", x, 88, 48, base);
const coluna = (x, base = 0) => bloco("coluna", x, 33, 65, base);
const planalto = (x1, x2, altura) => bloco("torre", x1, x2 - x1, altura);
const rampa = (x1, x2, altura1, altura2) => ({ x1, x2, y1: CHAO - altura1, y2: CHAO - altura2 });
// saida: para que lado o cavaleiro dá o passo ao chegar no topo (+1 = a estrutura fica à direita da escada)
const escada = (x, altura, saida = 1) => ({ x, topo: CHAO - altura, base: CHAO, saida });
const buraco = (x1, x2) => ({ x1, x2 });
const DEGRAU = 16, LARGURA_DEGRAU = 26;
function escadaria(x, degraus, sobe = true) {
  return Array.from({ length: degraus }, (_, i) =>
    bloco("degrau", x + i * LARGURA_DEGRAU, LARGURA_DEGRAU, DEGRAU * (sobe ? i + 1 : degraus - i)));
}

export const FASES = {
  ruinas: {
    nome: "RUÍNAS DE MORVATH", cenario: "noite", tema: "ruinas", tinta: null,
    largura: 5200, meio: 3000, fogueira: 4800, nevoa: 5050,
    plataformas: [plataforma(2200, 2380, 90), plataforma(2440, 2620, 180), plataforma(3300, 3560, 0)],
    blocos: [
      muro(560),
      ...escadaria(900, 6), planalto(1056, 1360, 96),           // escadaria até o planalto do arqueiro
      planalto(2700, 2830, 160),                                 // torre: só se passa subindo a escada de mão
      planalto(3880, 4200, 72), muro(4620),
    ],
    rampas: [rampa(1360, 1520, 96, 0), rampa(3700, 3880, 0, 72), rampa(4200, 4360, 72, 0)],
    escadas: [escada(2688, 160)],
    buracos: [buraco(1750, 1870), buraco(3300, 3560)],          // o segundo tem uma ponte por cima
    inimigos: [
      ["guerreiro", 760, 0], ["arqueiro", 1220, 96], ["lanceiro", 1650, 0], ["guerreiro", 2000, 0], ["guerreiro", 2110, 0],
      ["arqueiro", 2290, 90], ["lanceiro", 3430, 0], ["guerreiro", 3960, 72], ["guerreiro", 4110, 72], ["lanceiro", 4500, 0],
    ],
    itens: [["erva", 1300, 96], ["bomba", 2560, 180], ["resina", 2790, 160]],
    npcs: [["guardia", 3070], ["mercador", 3140], ["ferreiro", 4870], ["cavaleiro_errante", 4950]],
  },
  floresta: {
    nome: "FLORESTA DOS SUSSURROS", cenario: "floresta", tema: "floresta", tinta: "rgba(8, 18, 40, 0.32)",
    largura: 5400, meio: 3100, fogueira: 4950, nevoa: 5250,
    plataformas: [plataforma(2300, 2490, 90), plataforma(2550, 2720, 180), plataforma(4050, 4330, 0)],
    blocos: [
      muro(600), planalto(1200, 1500, 80),
      ...escadaria(3400, 5), planalto(3530, 3800, 80),
    ],
    rampas: [rampa(1000, 1200, 0, 80), rampa(1500, 1660, 80, 0), rampa(3800, 3950, 80, 0)],
    escadas: [],
    buracos: [buraco(1900, 2030), buraco(4050, 4330)],
    inimigos: [
      ["mago_errante", 820, 0], ["diabrete", 1300, 80], ["diabrete", 1420, 80], ["lobo_sombrio", 1760, 0],
      ["mago_raio", 2160, 0], ["mago_errante", 2400, 90], ["mago_fogo", 2640, 180], ["lanceiro", 2850, 0],
      ["lobo_sombrio", 3660, 80], ["diabrete", 4190, 0], ["mago_fogo", 4450, 0], ["lobo_sombrio", 4600, 0], ["guerreiro", 4720, 0],
    ],
    itens: [["bomba", 2700, 180], ["erva", 3750, 80]],
    npcs: [["guardia", 3170], ["mercador", 3240], ["ferreiro", 5020], ["mercador", 5100]],
  },
  cripta: {
    nome: "CRIPTA DOS PETRIFICADOS", cenario: "cripta_palida", tema: "cripta", tinta: "rgba(10, 28, 22, 0.38)",
    largura: 6000, meio: 2650, fogueira: 5600, nevoa: 5850,
    plataformas: [plataforma(700, 880, 90), plataforma(3900, 4080, 90), plataforma(4140, 4320, 180), plataforma(4450, 4720, 0)],
    blocos: [
      coluna(480), coluna(1150), planalto(1500, 1640, 150),
      ...escadaria(2950, 6), planalto(3106, 3500, 96),
    ],
    rampas: [rampa(3500, 3660, 96, 0)],
    escadas: [escada(1488, 150)],
    buracos: [buraco(2050, 2180), buraco(4450, 4720)],
    inimigos: [
      ["guerreiro", 620, 0], ["arqueiro", 790, 90], ["demonio_rubro", 1000, 0], ["mago_fogo", 1320, 0],
      ["archdemon", 1820, 0], ["lanceiro", 1950, 0], ["demonio_rubro", 2300, 0], ["diabrete", 2420, 0],
      ["guerreiro", 3200, 96], ["mago_raio", 3420, 96], ["archdemon", 3800, 0], ["arqueiro", 3990, 90],
      ["mago_fogo", 4230, 180], ["lobo_sombrio", 4580, 0], ["demonio_rubro", 4900, 0], ["guerreiro", 5010, 0],
      ["lanceiro", 5110, 0], ["archdemon", 5250, 0],
    ],
    itens: [["resina", 1600, 150], ["bomba", 4250, 180], ["erva", 3300, 96]],
    npcs: [["guardia", 2710], ["mercador", 2780], ["ferreiro", 5670], ["cavaleiro_errante", 5750]],
  },
  torre: {
    nome: "TORRE DAS CINZAS", cenario: "salao", tema: "torre", tinta: "rgba(45, 12, 0, 0.40)",
    largura: 5650, meio: 2700, fogueira: 5250, nevoa: 5500,
    plataformas: [
      plataforma(600, 780, 90),
      plataforma(3050, 3230, 90), plataforma(3290, 3470, 180), plataforma(3530, 3700, 90),  // andaimes em zigue-zague
      plataforma(3850, 4110, 0),                                                            // ponte sobre o abismo
    ],
    blocos: [
      ...escadaria(950, 6), planalto(1106, 1400, 96),
      planalto(2200, 2330, 170),                                 // torre: só se passa pela escada de mão
      planalto(4460, 4800, 80), coluna(5000),
    ],
    rampas: [rampa(1400, 1560, 96, 0), rampa(4300, 4460, 0, 80), rampa(4800, 4960, 80, 0)],
    escadas: [escada(2188, 170)],
    buracos: [buraco(1800, 1920), buraco(3850, 4110)],
    inimigos: [
      ["mago_fogo", 700, 90], ["guerreiro", 880, 0], ["arqueiro", 1250, 96], ["mago_raio", 1340, 96],
      ["demonio_rubro", 1680, 0], ["lanceiro", 2050, 0], ["mago_fogo", 2265, 170], ["diabrete", 2500, 0],
      ["mago_errante", 3140, 90], ["mago_fogo", 3380, 180], ["guerreiro", 3620, 90], ["lanceiro", 3980, 0],
      ["mago_raio", 4600, 80], ["guerreiro", 4720, 80], ["demonio_rubro", 5100, 0],
    ],
    itens: [["erva", 1350, 96], ["bomba", 3400, 180], ["resina", 4550, 80]],
    npcs: [["guardia", 2770], ["mercador", 2840], ["ferreiro", 5320], ["cavaleiro_errante", 5400]],
  },
  abismo: {
    nome: "ABISMO RUBRO", cenario: "ruinas_palidas", tema: "abismo", tinta: "#c8503a", mistura: "multiply",
    largura: 6200, meio: 3100, fogueira: 5800, nevoa: 6050,
    plataformas: [plataforma(2500, 2800, 0), plataforma(3800, 3980, 90), plataforma(4040, 4220, 180)],
    blocos: [
      coluna(500), muro(900),
      ...escadaria(1550, 6), planalto(1706, 2000, 96),           // termina na beira de um abismo
      planalto(3500, 3630, 160),                                 // torre com escada de mão
      planalto(4600, 4900, 90),
    ],
    rampas: [rampa(4400, 4600, 0, 90)],
    escadas: [escada(3488, 160)],
    buracos: [buraco(1200, 1330), buraco(2000, 2120), buraco(2500, 2800), buraco(4900, 5020), buraco(5250, 5380)],
    inimigos: [
      ["lobo_sombrio", 700, 0], ["demonio_rubro", 1050, 0], ["archdemon", 1450, 0], ["guerreiro", 1800, 96],
      ["arqueiro", 1950, 96], ["diabrete", 2300, 0], ["lobo_sombrio", 2400, 0], ["lanceiro", 2650, 0],
      ["archdemon", 2900, 0], ["demonio_rubro", 3400, 0], ["mago_fogo", 3565, 160], ["arqueiro", 3890, 90],
      ["mago_raio", 4130, 180], ["archdemon", 4300, 0], ["guerreiro", 4700, 90], ["demonio_rubro", 4820, 90],
      ["lobo_sombrio", 5150, 0], ["archdemon", 5500, 0], ["guerreiro", 5650, 0],
    ],
    itens: [["erva", 1900, 96], ["resina", 3600, 160], ["bomba", 4130, 180], ["erva", 4750, 90]],
    npcs: [["guardia", 3170], ["mercador", 3240], ["ferreiro", 5870], ["cavaleiro_errante", 5950]],
  },
};

// Arenas dos chefes: cabem numa tela, sem plataformas (os golpes dos chefes assumem chão plano)
export const ARENAS = {
  minotauro: { cenario: "ruinas_palidas", clima: ["neblina", "poeira"] },
  gorgona: { cenario: "salao", clima: ["poeira", "neblina_verde"] },
  arquimago: { cenario: "salao_palido", clima: ["brasas"] },
  arquidemonio: { cenario: "cripta", clima: ["cinzas", "almas"] },
};
