// Chefões: uma máquina de estados só, com um PERFIL por chefe (números, quadros dos sprites e golpes especiais).
// A IA não controla nada aqui: ela só muda os números de b.est (estratégia) entre as lutas.
//   combo:     três golpes à frente; o 3º pode vir atrasado (est.atraso_terceiro_golpe)
//   investida: avança pela arena (minotauro: arrancada; górgona: bote)
//   especial:  cada chefe tem vários (perfil.especiais) e sorteia um, preferindo os feitos para a distância
//              atual ("perto"/"longe"); alguns só aparecem na fase 2. O peso "especial" da IA decide a frequência.
//   reverso:   golpe rápido contra quem rola por dentro (est.punir_rolagem = "para_frente")
import { estado, W, CHAO, caixa, sobrepoe, lerp, particulas, texto } from "./nucleo.js";
import { ferirJogadora, petrificar } from "./jogador.js";
import { desenharSprite, desenharEfeito, desenharProjetil, ciclo, escalaDe, nQuadros } from "./sprites.js";
import { efeito } from "./efeitos.js";
import { som } from "./sons.js";
import { mostrarDano } from "./inimigos.js";

// Quadro de uma lista conforme o progresso t/dur (segura o último)
const pela = (lista, t, dur) => lista[Math.min(lista.length - 1, Math.floor((t / dur) * lista.length))];
const subindo = (n, t, dur) => Math.min(n - 1, Math.floor((t / dur) * n));  // quadros 0..n-1 ao longo de dur

// especiais: { nome: { fase (mínima), distancia ("perto"/"longe": preferida), quadro(g) -> [anim, quadro] } }
const PERFIS = {
  minotauro: {
    nome: "Morvath, o Guardião Esquecido", sprite: "minotauro", hp: 320, w: 66, h: 118, andar: [85, 115],
    combo: { anim: "ataque", preparo: [0, 1, 2], ativo: [3], pausa: [4], alcance: 125, dano: 22, avanco: 170 },
    reverso: { anim: "ataque", preparo: [0, 1, 2], ativo: [3], recuperar: [4], alcance: 115, dano: 18 },
    investida: { anim: "ataque", preparo: [1], ativo: [3], recuperar: [4], vel: 720, dano: 28 },
    corEspecial: "#ffb070",
    especiais: {
      salto: { distancia: "longe", quadro: (g) => ["ataque", g.etapa === "preparo" ? 1 : 2] },
      giro: { distancia: "perto", quadro: (g) => ["ataque", g.etapa === "preparo" ? 2 : 3 + (Math.floor(g.t * 12) % 2)] },
      desabamento: { fase: 2, quadro: (g) => ["ataque", g.etapa === "preparo" ? subindo(3, g.t, 0.7) : 3] },
    },
    // Onde fica a lâmina do machado em cada quadro (para o brilho de aviso), em px do quadro relativos aos pés
    brilho: (anim, q) => (anim === "ataque" ? { 0: [-31, -23], 1: [-31, -23], 2: [-31, -86] }[q] : null),
  },
  gorgona: {
    nome: "Medrah, a Górgona", sprite: "gorgona", hp: 360, w: 60, h: 120, andar: [95, 130],
    combo: { anim: "chicote", preparo: [0, 1, 2], ativo: [3, 4], pausa: [5], alcance: 115, dano: 20, avanco: 110 },
    reverso: { anim: "reverso", preparo: [3, 4, 5], ativo: [6, 7, 8], recuperar: [9], alcance: 130, dano: 18 },
    investida: { anim: "bote", preparo: [3, 4, 5], ativo: [6, 7, 8, 9], recuperar: [10, 11, 12, 13, 14, 15], vel: 640, dano: 26 },
    corEspecial: "#7dff9a",
    especiais: {
      olhar: { quadro: (g) => ["especial", g.etapa === "preparo" ? ciclo(g.t, 8, 5) : 4] },
      veneno: { distancia: "longe", quadro: (g) => ["especial", g.etapa === "preparo" ? ciclo(g.t, 8, 4) : 4] },
      varredura: { distancia: "perto", quadro: (g) => ["reverso", g.etapa === "preparo" ? pela([3, 4, 5], g.t, 0.7) : 6 + ciclo(g.t, 14, 3)] },
    },
    brilho: () => [12, -80],  // os olhos dela brilham antes de cada golpe
  },
  arquimago: {
    nome: "Ignar, o Arquimago", sprite: "arquimago", hp: 380, w: 54, h: 116, andar: [80, 110],
    combo: { anim: "golpe1", preparo: [0, 1], ativo: [2], pausa: [3], alcance: 115, dano: 20, avanco: 120 },
    reverso: { anim: "golpe2", preparo: [0, 1], ativo: [2], recuperar: [3], alcance: 115, dano: 18 },
    investida: { anim: "correr", preparo: [0, 1], ativo: [2, 3, 4, 5, 6, 7], recuperar: [0], vel: 640, dano: 24 },
    corEspecial: "#ff9a3c",
    especiais: {
      chamas: { distancia: "perto", quadro: (g) => ["chama", g.etapa === "preparo" ? subindo(4, g.t, 0.7) : 5 + ciclo(g.t, 12, 6)] },
      bolas: { distancia: "longe", quadro: (g) => ["bola", g.etapa === "preparo" ? subindo(5, g.t, 0.5) : 5 + ciclo(g.t, 10, 3)] },
      teleporte: { quadro: (g) => (g.etapa === "ataque" ? ["golpe2", subindo(4, g.t, 0.3)] : ["parado", 0]) },
      chuva: { fase: 2, quadro: (g) => ["bola", g.etapa === "preparo" ? subindo(5, g.t, 0.8) : 5] },
    },
    brilho: () => [30, -43],  // a mão que solta o fogo
  },
  arquidemonio: {
    nome: "Azrakh, o Arquidemônio", sprite: "arquidemonio", hp: 440, w: 70, h: 150, andar: [90, 120],
    combo: { anim: "ataque", preparo: [3, 4, 5, 6], ativo: [7, 8], pausa: [9], alcance: 130, dano: 22, avanco: 140 },
    reverso: { anim: "ataque", preparo: [5, 6], ativo: [7, 8], recuperar: [10], alcance: 130, dano: 18 },
    investida: { anim: "ataque", preparo: [2, 3], ativo: [7, 8, 9], recuperar: [11, 12], vel: 760, dano: 28 },
    corEspecial: "#b46bff",
    especiais: {
      chuva: { quadro: (g) => ["ataque", g.etapa === "preparo" ? subindo(7, g.t, 0.8) : 7 + ciclo(g.t, 10, 3)] },
      rajada: { distancia: "longe", quadro: (g) => ["ataque", g.etapa === "preparo" ? subindo(7, g.t, 0.6) : 7 + ciclo(g.t, 10, 5)] },
      pilares: { distancia: "perto", quadro: (g) => ["ataque", g.etapa === "preparo" ? subindo(7, g.t, 0.6) : 12] },
    },
    brilho: () => [8, -48],  // a esfera na mão
  },
};
const EFEITO_MORTE = { gorgona: "gas", arquimago: "explosao", arquidemonio: "oval" };

export const nomeDoChefe = (chefe) => PERFIS[chefe].nome;

export function novoBoss(chefe, estrategia) {
  const p = PERFIS[chefe];
  const b = {
    chefe, perfil: p, x: 740, y: CHAO, vx: 0, vy: 0, w: p.w, h: p.h, dir: -1,
    hp: p.hp, hpMax: p.hp, hpFantasma: p.hp, fase: 1,
    estado: "espera", t: 0, cooldown: 1.6, golpe: null, flash: 0, invulneravel: false,
    est: { ...estrategia, pesos: { ...estrategia.pesos, especial: estrategia.pesos.especial ?? estrategia.pesos.salto ?? 1 } },
  };
  b.ferir = (dano, x, y, opts = {}) => {
    ferirBoss(b, dano, x, y, opts.critico);
    if (opts.queima && b.estado !== "morto") b.queimando = 2;  // lâmina flamejante / resina
  };
  b.queimando = 0; b.tickQueima = 0;
  return b;
}

function ferirBoss(b, dano, x, y, critico = false, queimadura = false) {
  const jogo = estado.jogo;
  if (b.invulneravel || b.estado === "morto") return;
  b.hp -= dano; b.flash = 0.1;
  b.alpha = 1;  // se estava sumindo no teleporte, o golpe interrompe
  if (!queimadura) { jogo.hitstop = 0.04; jogo.tremor = Math.max(jogo.tremor, critico ? 7 : 3); }
  particulas(x, y, "#f5e6c8", critico ? 20 : 10, 180);
  mostrarDano(b.x, b.y - b.h - 20, dano, critico);

  if (b.hp <= 0) {
    b.hp = 0; b.estado = "morto"; b.t = 0; b.golpe = null; b.vx = 0;
    jogo.tremor = 16;
    efeito(EFEITO_MORTE[b.chefe] || "fumaca", b.x, b.y - (EFEITO_MORTE[b.chefe] ? 60 : 0), { escala: 1.3, fps: 10 });
    som("chefe_derrotado");
    jogo.terminar("vitoria");
  } else if (b.fase === 1 && b.hp <= b.hpMax / 2) {
    // Troca de fase: urro, fica invulnerável por um instante e volta mais rápido
    b.estado = "transicao"; b.t = 0; b.golpe = null; b.vx = 0; b.invulneravel = true;
    jogo.tremor = 14;
    jogo.log.fase_alcancada = 2;
    efeito("duas_cores", b.x, b.y - 70, { escala: 1.1, fps: 14 });
    som("urro");
  }
}

function cooldownBoss(b) {
  // Mesmo na agressividade máxima sobra uma janela para revidar (chefe justo)
  const base = 1.8 - 1.0 * b.est.agressividade;
  return b.fase === 2 ? base * 0.8 : base;
}

function escolherGolpe(b, dist) {
  const p = b.est.pesos, perto = dist < 180;
  const opcoes = [
    ["combo", perto ? p.combo * 2 : 0],
    ["investida", p.investida * (perto ? 0.4 : 1.5)],
    ["especial", p.especial * (perto ? 0.6 : 1)],
    ["aproximar", perto ? 0 : 1.2],
  ];
  let sorteio = Math.random() * opcoes.reduce((s, [, peso]) => s + peso, 0);
  for (const [nome, peso] of opcoes) if ((sorteio -= peso) <= 0) return nome;
  return perto ? "combo" : "investida";
}

// Qual especial: os da fase atual, preferindo os feitos para a distância e evitando repetir o último
function escolherEspecial(b) {
  const perto = Math.abs(estado.jogo.jogador.x - b.x) < 200;
  const opcoes = Object.entries(b.perfil.especiais).filter(([, e]) => (e.fase || 1) <= b.fase).map(([nome, e]) => {
    let peso = !e.distancia ? 1 : (e.distancia === "perto") === perto ? 1.8 : 0.35;
    if (nome === b.ultimoEspecial) peso *= 0.3;
    return [nome, peso];
  });
  let sorteio = Math.random() * opcoes.reduce((s, [, peso]) => s + peso, 0);
  for (const [nome, peso] of opcoes) if ((sorteio -= peso) <= 0) return (b.ultimoEspecial = nome);
  return (b.ultimoEspecial = opcoes[0][0]);
}

function iniciarGolpe(b, nome, extra = {}) {
  if (nome === "aproximar") { b.cooldown = 0.5; return; }
  if (nome === "especial" && !extra.tipo) extra = { ...extra, tipo: escolherEspecial(b) };
  b.estado = "golpe";
  b.golpe = { nome, etapa: "preparo", t: 0, i: 0, rolagens: [], acertou: false, brilho: 0.25, ...extra };
  b.dir = Math.sign(estado.jogo.jogador.x - b.x) || b.dir;
}

// Depois de cada golpe o chefe fica parado um tempo: é a janela para revidar
function recuperar(b, dur, anim = null, quadros = []) {
  b.golpe = { nome: "recuperar", etapa: "recuperar", t: 0, dur, anim, quadros, rolagens: [] };
}

function areaFrente(b, alcance) {
  return { x1: b.dir > 0 ? b.x + 10 : b.x - alcance, x2: b.dir > 0 ? b.x + alcance : b.x - 10, y1: CHAO - 125, y2: CHAO };
}

function tentarAcertar(b, area, dano, origem) {
  const g = b.golpe;
  if (!g.acertou && sobrepoe(area, caixa(estado.jogo.jogador))) {
    if (ferirJogadora(dano, origem, b.dir)) g.acertou = true;
  }
}

const preparoCombo = (b, i) => (i === 0 ? 0.55 : i === 1 ? 0.3 : 0.3 + 0.9 * b.est.atraso_terceiro_golpe);

export function atualizarBoss(dt) {
  const jogo = estado.jogo, b = jogo.boss, j = jogo.jogador, p = b.perfil;
  b.t += dt;
  if (b.flash > 0) b.flash -= dt;
  b.hpFantasma = Math.max(b.hp, b.hpFantasma - 60 * dt);
  const dist = Math.abs(j.x - b.x);
  // Queimando: 4 de dano a cada meio segundo
  if (b.queimando > 0 && b.estado !== "morto") {
    b.queimando -= dt;
    if (Math.random() < 0.5) particulas(b.x + (Math.random() - 0.5) * b.w, b.y - Math.random() * b.h, "#ff8a2a", 1, 60);
    if ((b.tickQueima -= dt) <= 0) { b.tickQueima = 0.5; ferirBoss(b, 4, b.x, b.y - b.h / 2, false, true); }
  }

  if (b.estado === "transicao") {
    b.vx = 0;
    if (b.t > 0.3 && b.t < 1.2 && Math.random() < 0.5) particulas(b.x, b.y - 100, "#ff5a36", 2, 160);
    if (b.t >= 1.6) { b.estado = "espera"; b.fase = 2; b.invulneravel = false; b.cooldown = 0.3; }
  } else if (b.estado === "espera") {
    b.dir = Math.sign(j.x - b.x) || b.dir;
    const vel = p.andar[b.fase - 1] * (b.chefe === "gorgona" && dist > 260 ? 1.6 : 1);  // a górgona rasteja rápido de longe
    b.vx = dist > 140 && j.estado !== "morto" ? b.dir * vel : 0;
    b.cooldown -= dt;
    if (j.estado === "morto") b.vx = 0;
    else if (b.est.punir_cura && j.estado === "curar" && dist < 600) iniciarGolpe(b, "investida", { rapido: true });
    else if (b.cooldown <= 0) iniciarGolpe(b, escolherGolpe(b, dist));
  } else if (b.estado === "golpe") {
    atualizarGolpe(b, dt);
  }

  // Física
  if (b.y < CHAO || b.vy < 0) b.vy += 2400 * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.y >= CHAO) { b.y = CHAO; b.vy = 0; }
  b.x = Math.max(b.w / 2 + 10, Math.min(W - b.w / 2 - 10, b.x));
}

function atualizarGolpe(b, dt) {
  const jogo = estado.jogo, g = b.golpe, j = jogo.jogador, e = b.est, p = b.perfil;
  g.t += dt * (b.fase === 2 ? 1.2 : 1);
  if (g.brilho > 0) g.brilho -= dt;
  if (g.etapa !== "ar") b.vx = 0;

  switch (g.nome) {
    case "combo": {
      const c = p.combo;
      if (g.etapa === "preparo" && g.t >= preparoCombo(b, g.i)) { g.etapa = "ativo"; g.t = 0; g.acertou = false; som("golpe_chefe", b.x); }
      else if (g.etapa === "ativo") {
        b.vx = b.dir * c.avanco;
        tentarAcertar(b, areaFrente(b, c.alcance), c.dano, `combo${g.i + 1}`);
        if (g.t >= 0.14) { g.etapa = "pausa"; g.t = 0; }
      } else if (g.etapa === "pausa" && g.t >= 0.12) {
        g.i++;
        if (g.i < 3) {
          g.etapa = "preparo"; g.t = 0; g.brilho = 0.2;
          b.dir = Math.sign(j.x - b.x) || b.dir;
        } else {
          // Fim do combo: a estratégia definida pela IA decide se pune a esquiva da jogadora
          const atras = Math.sign(j.x - b.x) !== b.dir;
          if (e.punir_rolagem === "para_tras" && g.rolagens.includes("para_tras")) iniciarGolpe(b, "investida", { rapido: true });
          else if (e.punir_rolagem === "para_frente" && g.rolagens.includes("para_frente") && atras) iniciarGolpe(b, "reverso");
          else recuperar(b, 0.9, c.anim, c.pausa);
        }
      }
      break;
    }

    case "reverso": {
      const r = p.reverso;
      if (g.etapa === "preparo" && g.t >= 0.28) { g.etapa = "ativo"; g.t = 0; som("golpe_chefe", b.x); }
      else if (g.etapa === "ativo") {
        tentarAcertar(b, areaFrente(b, r.alcance), r.dano, "reverso");
        if (g.t >= 0.12) recuperar(b, 0.6, r.anim, r.recuperar);
      }
      break;
    }

    case "investida": {
      const inv = p.investida, preparo = g.rapido ? 0.32 : 0.65;
      if (g.etapa === "preparo") {
        if (g.t < preparo - 0.15) b.dir = Math.sign(j.x - b.x) || b.dir;  // rastreia até pouco antes
        if (g.t >= preparo) { g.etapa = "ativo"; g.t = 0; som("investida", b.x); }
      } else if (g.etapa === "ativo") {
        b.vx = b.dir * inv.vel;
        const frente = areaFrente(b, 90);
        tentarAcertar(b, { ...frente, x1: Math.min(b.x - 33, frente.x1), x2: Math.max(b.x + 33, frente.x2) }, inv.dano, "investida");
        if (Math.random() < 0.6) particulas(b.x - b.dir * 30, CHAO - 5, "#6b6355", 1, 60);
        const naParede = b.x <= b.w / 2 + 12 || b.x >= W - b.w / 2 - 12;
        if (g.t >= 0.42 || naParede) recuperar(b, 0.75, inv.anim, inv.recuperar);
      }
      break;
    }

    case "especial":
      ESPECIAIS[g.tipo](b, g, j, jogo, dt);
      break;

    case "recuperar":
      if (g.t >= g.dur) { b.estado = "espera"; b.golpe = null; b.cooldown = cooldownBoss(b); }
      break;
  }
}

// Minotauro: pula até onde a jogadora VAI estar e, ao cair, solta ondas de choque pelo chão
function atualizarSalto(b, g, j, jogo) {
  if (g.etapa === "preparo" && g.t >= 0.45) {
    const alvo = Math.max(60, Math.min(W - 60, j.x + j.vx * 0.5));
    const T = 0.7;
    b.dir = Math.sign(alvo - b.x) || b.dir;
    b.vx = (alvo - b.x) / T; b.vy = -(2400 * T) / 2;
    g.etapa = "ar"; g.t = 0;
  } else if (g.etapa === "ar" && g.t > 0.1 && b.y >= CHAO) {
    b.vx = 0;
    jogo.tremor = 14;
    efeito("nuclear", b.x, CHAO + 4, { escala: 0.55, fps: 22 });
    som("impacto", b.x);
    g.acertou = false;
    tentarAcertar(b, { x1: b.x - 90, x2: b.x + 90, y1: CHAO - 70, y2: CHAO }, 30, "especial");
    jogo.ondas.push({ tipo: "choque", x: b.x - 40, dir: -1, vida: 1.2, vel: 460 }, { tipo: "choque", x: b.x + 40, dir: 1, vida: 1.2, vel: 460 });
    recuperar(b, 1.0, "ataque", [4]);
  }
}

// Górgona: os olhos brilham em verde e uma onda petrificante percorre a arena na altura do peito
function atualizarOlhar(b, g, j, jogo) {
  if (g.etapa === "preparo" && g.t >= 0.85) {
    g.etapa = "ativo"; g.t = 0; g.ondas = 0;
  }
  if (g.etapa === "ativo") {
    const total = b.fase === 2 ? 2 : 1;  // na fase 2 vêm duas ondas seguidas
    if (g.ondas < total && g.t >= g.ondas * 0.4) {
      jogo.ondas.push({ tipo: "olhar", x: b.x + b.dir * 40, dir: b.dir, vida: 2.4, vel: 380 });
      efeito("gas", b.x + b.dir * 30, b.y - 85, { escala: 0.35, fps: 24 });
      som("olhar", b.x);
      g.ondas++;
    }
    if (g.ondas >= total && g.t >= 0.3) recuperar(b, 0.8, "especial", [4]);
  }
}

// Arquimago: a mão arde e um jato de fogo sai à frente por mais tempo do que uma rolagem protege.
// Escapa quem fica atrás dele ou longe (o alcance é o desenho do jato, ~190 px).
function atualizarChamas(b, g, j, jogo) {
  if (g.etapa === "preparo") {
    if (g.t < 0.5) b.dir = Math.sign(j.x - b.x) || b.dir;
    if (g.t >= 0.7) { g.etapa = "ativo"; g.t = 0; g.proximoTick = 0; som("bola_fogo", b.x, 1.4); }
  } else if (g.etapa === "ativo") {
    const area = { x1: b.dir > 0 ? b.x + 20 : b.x - 190, x2: b.dir > 0 ? b.x + 190 : b.x - 20, y1: CHAO - 100, y2: CHAO - 40 };
    if (g.t >= g.proximoTick) { g.proximoTick += 0.25; g.acertou = false; }  // queima em "ticks"
    tentarAcertar(b, area, 9, "especial");
    if (Math.random() < 0.7) particulas(area.x1 + Math.random() * (area.x2 - area.x1), CHAO - 70, Math.random() < 0.5 ? "#ff8a2a" : "#ffd36b", 1, 90);
    if (g.t >= (b.fase === 2 ? 1.3 : 1.1)) recuperar(b, 0.9, "chama", [12, 13]);
  }
}

// Coisas que caem do céu nas sombras marcadas no chão, perto da jogadora: esferas sombrias (Arquidemônio),
// fogo (Arquimago, fase 2) ou pedras do teto (Minotauro, fase 2)
function marcarQueda(jogo, j, n, estilo, origem) {
  [0, -100, 100, -200, 200].slice(0, n).forEach((desloc, i) => {
    const x = Math.max(30, Math.min(W - 30, j.x + desloc)), espera = 0.9 + i * 0.12;
    jogo.ondas.push({ tipo: "meteoro", x, dir: 0, vel: 0, espera, total: espera, vida: espera + 0.3, estilo, origem });
  });
}

function atualizarChuva(b, g, j, jogo) {
  if (g.etapa !== "preparo" || g.t < 0.8) return;
  const fogo = b.chefe === "arquimago";
  marcarQueda(jogo, j, b.fase === 2 ? 5 : 3, fogo ? "fogo" : "sombra", fogo ? "chuva" : "especial");
  som(fogo ? "bola_fogo" : "magia", b.x);
  if (fogo) recuperar(b, 1.0, "bola", [6, 7]);
  else recuperar(b, 1.0, "ataque", [12, 13]);
}

// Minotauro: gira o machado e avança girando por ~1,2 s, acertando dos dois lados. Afaste-se ou pule para trás;
// no fim ele fica tonto (janela longa para revidar)
function atualizarGiro(b, g, j, jogo, dt) {
  if (g.etapa === "preparo") {
    b.dir = Math.sign(j.x - b.x) || b.dir;
    if (g.t >= 0.6) { g.etapa = "ativo"; g.t = 0; g.dirMov = b.dir; g.proximoTick = 0; }
  } else if (g.etapa === "ativo") {
    b.vx = g.dirMov * 150;
    b.dir = Math.floor(g.t * 10) % 2 ? 1 : -1;  // vira de um lado para o outro: parece girar
    if (g.t >= g.proximoTick) { g.proximoTick += 0.35; g.acertou = false; som("golpe_chefe", b.x); }
    tentarAcertar(b, { x1: b.x - 88, x2: b.x + 88, y1: CHAO - 110, y2: CHAO }, 14, "giro");
    if (Math.random() < 0.6) particulas(b.x + (Math.random() - 0.5) * 140, CHAO - 6, "#8a7a62", 1, 80);
    if (g.t >= 1.2) { b.dir = Math.sign(j.x - b.x) || b.dir; recuperar(b, 1.2, "ferido", [0, 1, 2]); }
  }
}

// Minotauro (fase 2): bate no chão e o teto desaba: pedras caem nas sombras marcadas
function atualizarDesabamento(b, g, j, jogo) {
  if (g.etapa !== "preparo" || g.t < 0.7) return;
  jogo.tremor = 16;
  efeito("fumaca", b.x, CHAO + 4, { escala: 0.8, fps: 14 });
  som("impacto", b.x);
  marcarQueda(jogo, j, 5, "pedra", "desabamento");
  recuperar(b, 1.0, "ataque", [4]);
}

// Górgona: cospe três bolas de veneno em arco; onde caem, fica uma poça que machuca por alguns segundos
function atualizarVeneno(b, g, j, jogo) {
  if (g.etapa === "preparo") {
    b.dir = Math.sign(j.x - b.x) || b.dir;
    if (g.t >= 0.6) { g.etapa = "ativo"; g.t = 0; g.cuspidas = 0; }
  } else if (g.etapa === "ativo") {
    if (g.cuspidas < 3 && g.t >= g.cuspidas * 0.25) {
      // Mira um pouco antes, em cima e depois da jogadora (cobre a fuga)
      const alvo = j.x + (g.cuspidas - 1) * 70, T = 0.9, x0 = b.x + b.dir * 30, y0 = b.y - 90;
      jogo.ondas.push({ tipo: "projetil", estilo: "veneno", x: x0, y: y0, vx: (alvo - x0) / T, vy: (CHAO - y0 - 450 * T * T) / T,
        grav: 900, raio: 10, dano: 10, origem: "veneno", dir: 0, vel: 0, vida: 3 });
      som("magia", b.x);
      g.cuspidas++;
    }
    if (g.cuspidas >= 3 && g.t >= 0.6) recuperar(b, 0.8, "especial", [4]);
  }
}

// Górgona: a cauda varre o chão dos dois lados (longe!). Só escapa quem PULA
function atualizarVarredura(b, g, j, jogo) {
  if (g.etapa === "preparo") {
    if (g.t >= 0.7) { g.etapa = "ativo"; g.t = 0; g.acertou = false; som("golpe_chefe", b.x, 1.3); }
  } else if (g.etapa === "ativo") {
    tentarAcertar(b, { x1: b.x - 230, x2: b.x + 230, y1: CHAO - 32, y2: CHAO }, 20, "varredura");
    if (Math.random() < 0.8) particulas(b.x + (Math.random() - 0.5) * 460, CHAO - 4, "#7d9a6a", 1, 70);
    if (g.t >= 0.3) recuperar(b, 0.9, "reverso", [9]);
  }
}

// Arquimago: três bolas de fogo coladas, em linha reta na altura do peito. Uma rolagem bem na hora atravessa as três
function atualizarBolas(b, g, j, jogo) {
  if (g.etapa === "preparo") {
    b.dir = Math.sign(j.x - b.x) || b.dir;
    if (g.t >= 0.5) { g.etapa = "ativo"; g.t = 0; g.disparos = 0; }
  } else if (g.etapa === "ativo") {
    if (g.disparos < 3 && g.t >= g.disparos * 0.2) {  // 0,2 s entre bolas: o trio inteiro cabe na invencibilidade de uma rolagem
      jogo.ondas.push({ tipo: "projetil", estilo: "fogo", x: b.x + b.dir * 50, y: CHAO - 62, vx: b.dir * 400, vy: 0, grav: 0,
        raio: 12, dano: 16, origem: "bolas", dir: 0, vel: 0, vida: 3 });
      som("bola_fogo", b.x);
      g.disparos++;
    }
    if (g.disparos >= 3 && g.t >= 0.8) recuperar(b, 0.7, "bola", [7]);
  }
}

// Arquimago: some numa explosão de fumaça e reaparece ATRÁS da jogadora, já golpeando
function atualizarTeleporte(b, g, j, jogo) {
  if (g.etapa === "preparo") {
    b.alpha = Math.max(0, 1 - g.t / 0.4);
    if (g.t >= 0.4) {
      efeito("fumaca", b.x, CHAO + 4, { escala: 0.6, fps: 16 });
      const lado = -(j.dir || 1);  // aparece nas costas dela
      b.x = Math.max(b.w / 2 + 12, Math.min(W - b.w / 2 - 12, j.x + lado * 75));
      b.dir = Math.sign(j.x - b.x) || -lado;
      b.invulneravel = true; g.etapa = "sumido"; g.t = 0;
      efeito("fumaca", b.x, CHAO + 4, { escala: 0.6, fps: 16 });
      som("magia", b.x);
    }
  } else if (g.etapa === "sumido") {
    b.alpha = Math.min(1, g.t / 0.3);
    if (g.t >= 0.3) { b.invulneravel = false; b.alpha = 1; g.etapa = "ataque"; g.t = 0; g.acertou = false; g.brilho = 0.25; g.rapido = true; }
  } else if (g.etapa === "ataque") {
    if (g.t >= 0.2) tentarAcertar(b, areaFrente(b, 120), 20, "teleporte");
    if (g.t >= 0.32) recuperar(b, 0.8, "golpe2", [3]);
  }
}

// Arquidemônio: do alto, dispara cinco esferas sombrias em leque na direção da jogadora
function atualizarRajada(b, g, j, jogo) {
  if (g.etapa === "preparo") {
    b.dir = Math.sign(j.x - b.x) || b.dir;
    if (g.t >= 0.6) {
      const x0 = b.x + b.dir * 20, y0 = b.y - 110, base = Math.atan2(j.y - 40 - y0, j.x - x0);
      for (let i = -2; i <= 2; i++) {
        const a = base + i * 0.2;
        jogo.ondas.push({ tipo: "projetil", estilo: "sombra", x: x0, y: y0, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, grav: 0,
          raio: 11, dano: 14, origem: "rajada", dir: 0, vel: 0, vida: 3 });
      }
      som("magia", b.x, 1.3);
      g.etapa = "ativo"; g.t = 0;
    }
  } else if (g.etapa === "ativo" && g.t >= 0.4) recuperar(b, 0.8, "ataque", [12, 13]);
}

// Arquidemônio: pilares de sombra brotam do chão um atrás do outro, dele até a jogadora (e além)
function atualizarPilares(b, g, j, jogo) {
  if (g.etapa !== "preparo") return;
  if (g.t < 0.35) b.dir = Math.sign(j.x - b.x) || b.dir;  // escolhe o lado cedo: dá para passar para trás dele
  if (g.t < 0.6) return;
  // Pilares colados (60 px, cada um pega 30 px para cada lado): não sobra fresta segura no caminho
  for (let i = 0; i < 9; i++) {
    const x = b.x + b.dir * (60 + i * 60);
    if (x < 20 || x > W - 20) break;
    const espera = 0.45 + i * 0.12;
    jogo.ondas.push({ tipo: "pilar", x, dir: 0, vel: 0, espera, total: espera, vida: espera + 0.4 });
  }
  som("magia", b.x);
  recuperar(b, 1.1, "ataque", [12, 13]);
}

const ESPECIAIS = {
  salto: atualizarSalto, giro: atualizarGiro, desabamento: atualizarDesabamento,
  olhar: atualizarOlhar, veneno: atualizarVeneno, varredura: atualizarVarredura,
  chamas: atualizarChamas, bolas: atualizarBolas, teleporte: atualizarTeleporte, chuva: atualizarChuva,
  rajada: atualizarRajada, pilares: atualizarPilares,
};

export function atualizarOndas(dt) {
  const jogo = estado.jogo, j = jogo.jogador;
  const novas = [];
  for (const o of jogo.ondas) {
    o.x += o.dir * o.vel * dt; o.vida -= dt;
    if (o.acertou) continue;
    if (o.tipo === "meteoro") {
      // Cai uma vez só: explode na sombra marcada (não dá para bloquear; saia de cima)
      if ((o.espera -= dt) <= 0 && !o.caiu) {
        o.caiu = true;
        efeito({ fogo: "explosao", sombra: "oval", pedra: "fumaca" }[o.estilo], o.x, CHAO + 4, { escala: 0.45, fps: 22 });
        som(o.estilo === "pedra" ? "impacto" : "explosao", o.x);
        jogo.tremor = Math.max(jogo.tremor, 6);
        if (o.estilo === "pedra") particulas(o.x, CHAO - 10, "#8a7a62", 10, 160);
        if (Math.abs(j.x - o.x) < 42 && j.y > CHAO - 90 && ferirJogadora(22, o.origem, Math.sign(j.x - o.x) || 1, { inbloqueavel: true })) o.acertou = true;
      }
    } else if (o.tipo === "projetil") {
      o.vy += o.grav * dt; o.x += o.vx * dt; o.y += o.vy * dt;
      const corpo = caixa(j);
      if (sobrepoe({ x1: o.x - o.raio, x2: o.x + o.raio, y1: o.y - o.raio, y2: o.y + o.raio }, corpo)) {
        if (ferirJogadora(o.dano, o.origem, Math.sign(o.vx) || 1)) { o.acertou = true; o.vida = 0; }
      }
      if (o.y >= CHAO - 4) {
        o.vida = 0;
        efeito(o.estilo === "fogo" ? "explosao" : o.estilo === "sombra" ? "oval" : "gas", o.x, CHAO + 4, { escala: 0.25, fps: 24 });
        if (o.estilo === "veneno") novas.push({ tipo: "poca", x: o.x, dir: 0, vel: 0, vida: 2.6, proximoTick: 0 });
      }
    } else if (o.tipo === "poca") {
      // Poça de veneno: machuca um pouco a cada meio segundo quem pisa nela
      if (Math.abs(j.x - o.x) < 32 && j.noChao && j.y >= CHAO - 4 && (o.proximoTick -= dt) <= 0) {
        if (ferirJogadora(6, "veneno", 0, { inbloqueavel: true })) o.proximoTick = 0.5;
      }
    } else if (o.tipo === "pilar") {
      if ((o.espera -= dt) <= 0) {
        if (!o.subiu) { o.subiu = true; som("explosao", o.x, 0.6); }
        // Machuca enquanto está de pé (~0,3 s): rolar através funciona, ficar parado não
        if (o.vida > 0.1 && Math.abs(j.x - o.x) < 30 && ferirJogadora(20, "pilares", Math.sign(j.x - o.x) || 1, { inbloqueavel: true })) o.acertou = true;
      }
    } else if (o.tipo === "choque") {
      // Rente ao chão: pule por cima
      if (j.y >= CHAO - 20 && Math.abs(j.x - o.x) < 22 && ferirJogadora(18, "onda", o.dir)) o.acertou = true;
    } else {
      // Na altura do peito: pule por cima ou role através dela
      const corpo = caixa(j);
      if (corpo.y2 > CHAO - 75 && corpo.y1 < CHAO - 25 && Math.abs(j.x - o.x) < 24 && petrificar(14, "especial", 1.0)) o.acertou = true;
    }
  }
  jogo.ondas = [...jogo.ondas, ...novas].filter((o) => o.vida > 0 && o.x > -40 && o.x < W + 40);
}

// ===================== Desenho =====================
function quadroBoss(b) {
  const g = b.golpe, p = b.perfil, s = p.sprite, j = estado.jogo.jogador;
  if (b.estado === "morto") return ["morte", Math.min(nQuadros(s, "morte") - 1, Math.floor(b.t * 6))];
  if (b.estado === "transicao") return ["ferido", ciclo(b.t, 6, 3)];
  if (!g) {
    if (Math.abs(b.vx) < 5) return ["parado", ciclo(b.t, 8, nQuadros(s, "parado"))];
    const correndo = s === "gorgona" && Math.abs(j.x - b.x) > 260;
    return correndo ? ["correr", ciclo(b.t, 12, 7)] : ["andar", ciclo(b.t, 12, nQuadros(s, "andar"))];
  }
  switch (g.nome) {
    case "combo": {
      // Ergue a arma e SEGURA o último quadro do preparo enquanto espera: é isso que torna o golpe atrasado legível
      const c = p.combo;
      if (g.etapa === "preparo") return [c.anim, pela(c.preparo, g.t, 0.3)];
      return [c.anim, g.etapa === "ativo" ? pela(c.ativo, g.t, 0.14) : c.pausa[0]];
    }
    case "reverso": {
      const r = p.reverso;
      return [r.anim, g.etapa === "preparo" ? pela(r.preparo, g.t, 0.28) : pela(r.ativo, g.t, 0.12)];
    }
    case "investida": {
      const inv = p.investida;
      return [inv.anim, g.etapa === "preparo" ? pela(inv.preparo, g.t, 0.3) : inv.ativo[ciclo(g.t, 14, inv.ativo.length)]];
    }
    case "especial":
      return p.especiais[g.tipo].quadro(g);
    case "recuperar":
      if (g.anim && g.t < 0.5 && g.quadros.length) return [g.anim, pela(g.quadros, g.t, 0.5)];
      return ["parado", ciclo(b.t, 8, nQuadros(s, "parado"))];
  }
  return ["parado", 0];
}

export function desenharBoss(ctx, b) {
  const [anim, q] = quadroBoss(b);
  const g = b.golpe, p = b.perfil, s = escalaDe(p.sprite);
  const alpha = (b.estado === "morto" ? Math.max(0, 1 - Math.max(0, b.t - 1.2) / 1.5) : 1) * (b.alpha ?? 1);
  const vermelho = b.fase === 2 || b.estado === "transicao" ? 0.12 + 0.08 * Math.sin(b.t * 6) : 0;

  // Rastro na investida
  if (g && g.nome === "investida" && g.etapa === "ativo") {
    for (let i = 1; i <= 3; i++) desenharSprite(ctx, p.sprite, anim, q, b.x - b.vx * 0.025 * i, b.y, { dir: b.dir, alpha: 0.22 / i });
  }
  desenharSprite(ctx, p.sprite, anim, q, b.x, b.y, { dir: b.dir, alpha, branco: b.flash > 0 ? 0.85 : 0, vermelho });

  // Rastros que mostram a área dos golpes giratórios (giro do machado; varredura da cauda)
  if (g?.nome === "especial" && g.etapa === "ativo" && (g.tipo === "giro" || g.tipo === "varredura")) {
    ctx.save();
    ctx.lineWidth = 4;
    if (g.tipo === "giro") {
      ctx.strokeStyle = "rgba(255,200,140,0.55)";
      for (let i = 0; i < 2; i++) {
        const a = g.t * 14 + i * Math.PI;
        ctx.beginPath(); ctx.ellipse(b.x, CHAO - 55, 88, 34, 0, a, a + 1.6); ctx.stroke();
      }
    } else {
      const abre = Math.min(1, g.t / 0.15);  // a cauda abre para os dois lados rente ao chão
      ctx.strokeStyle = `rgba(150,230,120,${0.7 * (1 - g.t / 0.3)})`;
      ctx.beginPath(); ctx.ellipse(b.x, CHAO - 12, 230 * abre, 14, 0, 0, Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(b.x, CHAO - 12, 230 * abre, 14, 0, Math.PI, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // Brilho de aviso (telegraph): vermelho quando é um golpe de punição rápido; na cor do especial enquanto ele carrega
  const olhar = g && g.nome === "especial" && p.corEspecial && g.etapa === "preparo";
  const pos = p.brilho(anim, q);
  if (pos && ((g && g.brilho > 0) || olhar)) {
    ctx.save();
    ctx.fillStyle = olhar ? p.corEspecial : g.rapido ? "#ff4030" : "#fff6d0";
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 25;
    ctx.globalAlpha = olhar ? 0.6 + 0.4 * Math.sin(g.t * 30) : Math.min(1, g.brilho * 5);
    const tam = olhar ? 6 + g.t * 14 : 10 + (0.25 - g.brilho) * 40;
    estrela(ctx, b.x + b.dir * pos[0] * s, b.y + pos[1] * s, tam);
    ctx.restore();
  }
}

const COR_ESTILO = { fogo: "255,138,42", sombra: "180,107,255", veneno: "120,230,90", pedra: "140,128,110" };

// Esfera brilhante (projéteis e o que cai do céu)
function esfera(ctx, x, y, r, cor) {
  const gr = ctx.createRadialGradient(x, y, 2, x, y, r);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, `rgba(${cor},0.95)`); gr.addColorStop(1, `rgba(${cor},0)`);
  ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function estrela(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const raio = i % 2 ? r * 0.25 : r, a = (i / 8) * Math.PI * 2;
    ctx.lineTo(x + Math.cos(a) * raio, y + Math.sin(a) * raio);
  }
  ctx.fill();
}

export function desenharOndas(ctx, t) {
  for (const o of estado.jogo.ondas) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, o.vida * 2);
    if (o.tipo === "meteoro") {
      if (o.caiu) { ctx.restore(); continue; }
      // Sombra no chão que cresce e o que vai cair aparecendo nos últimos 0,6 s
      const cor = COR_ESTILO[o.estilo], p = 1 - o.espera / o.total;
      ctx.fillStyle = o.estilo === "pedra" ? `rgba(0,0,0,${0.25 + 0.35 * p})` : `rgba(${cor},${0.15 + 0.35 * p})`;
      ctx.beginPath(); ctx.ellipse(o.x, CHAO - 2, 14 + 28 * p, 5 + 3 * p, 0, 0, Math.PI * 2); ctx.fill();
      if (o.espera < 0.6) {
        const y = CHAO - 16 - (o.espera / 0.6) * 480;
        if (o.estilo === "pedra") {
          ctx.fillStyle = "#6f6454"; ctx.beginPath(); ctx.moveTo(o.x - 16, y + 4); ctx.lineTo(o.x - 6, y - 14); ctx.lineTo(o.x + 14, y - 10);
          ctx.lineTo(o.x + 17, y + 8); ctx.lineTo(o.x - 4, y + 14); ctx.fill();
          ctx.fillStyle = "#958a76"; ctx.fillRect(o.x - 6, y - 8, 10, 5);
        } else esfera(ctx, o.x, y, 16, cor);
      }
    } else if (o.tipo === "projetil") {
      if (o.estilo === "fogo") desenharProjetil(ctx, "fogo", t, o.x, o.y, o.vx < 0 ? Math.PI : 0);
      else esfera(ctx, o.x, o.y, o.raio + 6, COR_ESTILO[o.estilo]);
    } else if (o.tipo === "poca") {
      // Poça de veneno borbulhando
      ctx.globalAlpha = Math.min(1, o.vida * 1.5) * 0.8;
      ctx.fillStyle = "#3f8f2a"; ctx.beginPath(); ctx.ellipse(o.x, CHAO - 1, 34, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#8be05a";
      for (let i = 0; i < 3; i++) { const bx = o.x - 20 + i * 20 + Math.sin(t * 3 + i) * 4; ctx.fillRect(bx, CHAO - 4 - ((t * 20 + i * 7) % 10), 3, 3); }
    } else if (o.tipo === "pilar") {
      const p = 1 - Math.max(0, o.espera) / o.total;
      if (!o.subiu) {
        // Aviso: rachadura roxa no chão
        ctx.fillStyle = `rgba(180,107,255,${0.2 + 0.6 * p})`; ctx.fillRect(o.x - 18, CHAO - 3, 36, 3);
        if (Math.random() < 0.3) ctx.fillRect(o.x - 2 + (Math.random() - 0.5) * 30, CHAO - 8, 2, 5);
      } else {
        // Pilar de sombra: sobe rápido e se desfaz
        const altura = 150 * Math.min(1, (0.4 - o.vida) / 0.08 + 0.2);  // tempo desde que brotou = 0,4 − vida
        const gr = ctx.createLinearGradient(0, CHAO - altura, 0, CHAO);
        gr.addColorStop(0, "rgba(180,107,255,0)"); gr.addColorStop(0.3, "rgba(150,70,230,0.85)"); gr.addColorStop(1, "rgba(40,10,60,0.95)");
        ctx.fillStyle = gr; ctx.fillRect(o.x - 22, CHAO - altura, 44, altura);
      }
    } else if (o.tipo === "choque") {
      ctx.fillStyle = "#d9c9a3";
      ctx.beginPath(); ctx.moveTo(o.x - 14, CHAO); ctx.lineTo(o.x + o.dir * 6, CHAO - 26); ctx.lineTo(o.x + 14, CHAO); ctx.fill();
    } else {
      // Olhar petrificante: nuvem verde na altura do peito
      const g = ctx.createRadialGradient(o.x, CHAO - 50, 2, o.x, CHAO - 50, 34);
      g.addColorStop(0, "rgba(125,255,154,0.55)"); g.addColorStop(1, "rgba(125,255,154,0)");
      ctx.fillStyle = g; ctx.fillRect(o.x - 34, CHAO - 84, 68, 68);
      desenharEfeito(ctx, "gas", 3 + ciclo(t, 12, 4), o.x, CHAO - 50, 0.3, o.dir);
    }
    ctx.restore();
  }
}
