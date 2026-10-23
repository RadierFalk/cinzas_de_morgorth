// Chefões: uma máquina de estados só, com um PERFIL por chefe (números, quadros dos sprites e golpe especial).
// A IA não controla nada aqui: ela só muda os números de b.est (estratégia) entre as lutas.
//   combo:     três golpes à frente; o 3º pode vir atrasado (est.atraso_terceiro_golpe)
//   investida: avança pela arena (minotauro: arrancada; górgona: bote)
//   especial:  minotauro = salto com ondas de choque; górgona = olhar petrificante
//   reverso:   golpe rápido contra quem rola por dentro (est.punir_rolagem = "para_frente")
import { estado, W, CHAO, caixa, sobrepoe, lerp, particulas, texto } from "./nucleo.js";
import { ferirJogadora, petrificar } from "./jogador.js";
import { desenharSprite, desenharEfeito, ciclo, escalaDe, nQuadros } from "./sprites.js";
import { efeito } from "./efeitos.js";
import { som } from "./sons.js";
import { mostrarDano } from "./inimigos.js";

const PERFIS = {
  minotauro: {
    nome: "Morvath, o Guardião Esquecido", sprite: "minotauro", hp: 320, w: 66, h: 118, andar: [85, 115],
    combo: { anim: "ataque", preparo: [0, 1, 2], ativo: [3], pausa: [4], alcance: 125, dano: 22, avanco: 170 },
    reverso: { anim: "ataque", preparo: [0, 1, 2], ativo: [3], recuperar: [4], alcance: 115, dano: 18 },
    investida: { anim: "ataque", preparo: [1], ativo: [3], recuperar: [4], vel: 720, dano: 28 },
    especial: "salto",
    // Onde fica a lâmina do machado em cada quadro (para o brilho de aviso), em px do quadro relativos aos pés
    brilho: (anim, q) => (anim === "ataque" ? { 0: [-31, -23], 1: [-31, -23], 2: [-31, -86] }[q] : null),
  },
  gorgona: {
    nome: "Medrah, a Górgona", sprite: "gorgona", hp: 360, w: 60, h: 120, andar: [95, 130],
    combo: { anim: "chicote", preparo: [0, 1, 2], ativo: [3, 4], pausa: [5], alcance: 115, dano: 20, avanco: 110 },
    reverso: { anim: "reverso", preparo: [3, 4, 5], ativo: [6, 7, 8], recuperar: [9], alcance: 130, dano: 18 },
    investida: { anim: "bote", preparo: [3, 4, 5], ativo: [6, 7, 8, 9], recuperar: [10, 11, 12, 13, 14, 15], vel: 640, dano: 26 },
    especial: "olhar",
    brilho: () => [12, -80],  // os olhos dela brilham antes de cada golpe
  },
};

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
  if (!queimadura) { jogo.hitstop = 0.04; jogo.tremor = Math.max(jogo.tremor, critico ? 7 : 3); }
  particulas(x, y, "#f5e6c8", critico ? 20 : 10, 180);
  mostrarDano(b.x, b.y - b.h - 20, dano, critico);

  if (b.hp <= 0) {
    b.hp = 0; b.estado = "morto"; b.t = 0; b.golpe = null; b.vx = 0;
    jogo.tremor = 16;
    efeito(b.chefe === "gorgona" ? "gas" : "fumaca", b.x, b.y - (b.chefe === "gorgona" ? 60 : 0), { escala: 1.3, fps: 10 });
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

function iniciarGolpe(b, nome, extra = {}) {
  if (nome === "aproximar") { b.cooldown = 0.5; return; }
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
      if (p.especial === "salto") atualizarSalto(b, g, j, jogo);
      else atualizarOlhar(b, g, jogo);
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
function atualizarOlhar(b, g, jogo) {
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

export function atualizarOndas(dt) {
  const jogo = estado.jogo, j = jogo.jogador;
  for (const o of jogo.ondas) {
    o.x += o.dir * o.vel * dt; o.vida -= dt;
    if (o.acertou) continue;
    if (o.tipo === "choque") {
      // Rente ao chão: pule por cima
      if (j.y >= CHAO - 20 && Math.abs(j.x - o.x) < 22 && ferirJogadora(18, "onda", o.dir)) o.acertou = true;
    } else {
      // Na altura do peito: pule por cima ou role através dela
      const corpo = caixa(j);
      if (corpo.y2 > CHAO - 75 && corpo.y1 < CHAO - 25 && Math.abs(j.x - o.x) < 24 && petrificar(14, "especial", 1.0)) o.acertou = true;
    }
  }
  jogo.ondas = jogo.ondas.filter((o) => o.vida > 0 && o.x > -40 && o.x < W + 40);
}

// ===================== Desenho =====================
function quadroBoss(b) {
  const g = b.golpe, p = b.perfil, s = p.sprite, j = estado.jogo.jogador;
  const pela = (lista, t, dur) => lista[Math.min(lista.length - 1, Math.floor((t / dur) * lista.length))];
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
      if (p.especial === "salto") return ["ataque", g.etapa === "preparo" ? 1 : 2];
      return ["especial", g.etapa === "preparo" ? ciclo(g.t, 8, 5) : 4];
    case "recuperar":
      if (g.anim && g.t < 0.5 && g.quadros.length) return [g.anim, pela(g.quadros, g.t, 0.5)];
      return ["parado", ciclo(b.t, 8, nQuadros(s, "parado"))];
  }
  return ["parado", 0];
}

export function desenharBoss(ctx, b) {
  const [anim, q] = quadroBoss(b);
  const g = b.golpe, p = b.perfil, s = escalaDe(p.sprite);
  const alpha = b.estado === "morto" ? Math.max(0, 1 - Math.max(0, b.t - 1.2) / 1.5) : 1;
  const vermelho = b.fase === 2 || b.estado === "transicao" ? 0.12 + 0.08 * Math.sin(b.t * 6) : 0;

  // Rastro na investida
  if (g && g.nome === "investida" && g.etapa === "ativo") {
    for (let i = 1; i <= 3; i++) desenharSprite(ctx, p.sprite, anim, q, b.x - b.vx * 0.025 * i, b.y, { dir: b.dir, alpha: 0.22 / i });
  }
  desenharSprite(ctx, p.sprite, anim, q, b.x, b.y, { dir: b.dir, alpha, branco: b.flash > 0 ? 0.85 : 0, vermelho });

  // Brilho de aviso (telegraph): vermelho quando é um golpe de punição rápido; verde no olhar da górgona
  const olhar = g && g.nome === "especial" && p.especial === "olhar" && g.etapa === "preparo";
  const pos = p.brilho(anim, q);
  if (pos && ((g && g.brilho > 0) || olhar)) {
    ctx.save();
    ctx.fillStyle = olhar ? "#7dff9a" : g.rapido ? "#ff4030" : "#fff6d0";
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 25;
    ctx.globalAlpha = olhar ? 0.6 + 0.4 * Math.sin(g.t * 30) : Math.min(1, g.brilho * 5);
    const tam = olhar ? 6 + g.t * 14 : 10 + (0.25 - g.brilho) * 40;
    estrela(ctx, b.x + b.dir * pos[0] * s, b.y + pos[1] * s, tam);
    ctx.restore();
  }
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
    if (o.tipo === "choque") {
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
