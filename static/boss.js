// Morvath, o Guardião (sprite Minotaur_2). Máquina de estados do combate em tempo real.
// A IA não controla nada aqui: ela só muda os números de b.est (estratégia) entre as lutas.
import { estado, W, CHAO, caixa, sobrepoe, lerp, particulas, texto } from "./nucleo.js";
import { ferirJogadora } from "./jogador.js";
import { desenharSprite, ciclo, escalaDe } from "./sprites.js";

export const NOME_BOSS = "Morvath, o Guardião Esquecido";
const BOSS_HP = 320;

export function novoBoss(estrategia) {
  const b = {
    x: 740, y: CHAO, vx: 0, vy: 0, w: 66, h: 118, dir: -1,
    hp: BOSS_HP, hpMax: BOSS_HP, hpFantasma: BOSS_HP, fase: 1,
    estado: "espera", t: 0, cooldown: 1.6, golpe: null, flash: 0, invulneravel: false, est: estrategia,
  };
  b.ferir = (dano, x, y) => ferirBoss(b, dano, x, y);
  return b;
}

function ferirBoss(b, dano, x, y) {
  const jogo = estado.jogo;
  if (b.invulneravel || b.estado === "morto") return;
  b.hp -= dano; b.flash = 0.1;
  jogo.hitstop = 0.04; jogo.tremor = Math.max(jogo.tremor, 3);
  particulas(x, y, "#f5e6c8", 10, 180);
  texto(b.x, b.y - b.h - 10, `${dano}`, "#f5e6c8");

  if (b.hp <= 0) {
    b.hp = 0; b.estado = "morto"; b.t = 0; b.golpe = null; b.vx = 0;
    jogo.tremor = 16;
    jogo.terminar("vitoria");
  } else if (b.fase === 1 && b.hp <= b.hpMax / 2) {
    // Troca de fase: urro, fica invulnerável por um instante e volta mais rápido
    b.estado = "transicao"; b.t = 0; b.golpe = null; b.vx = 0; b.invulneravel = true;
    jogo.tremor = 14;
    jogo.log.fase_alcancada = 2;
  }
}

function cooldownBoss(b) {
  // Mesmo na agressividade máxima sobra uma janela para revidar (boss justo)
  const base = 1.8 - 1.0 * b.est.agressividade;
  return b.fase === 2 ? base * 0.8 : base;
}

function escolherGolpe(b, dist) {
  const p = b.est.pesos, perto = dist < 180;
  const opcoes = [
    ["combo", perto ? p.combo * 2 : 0],
    ["investida", p.investida * (perto ? 0.4 : 1.5)],
    ["salto", p.salto * (perto ? 0.6 : 1)],
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

const recuperar = (b, dur) => { b.golpe = { nome: "recuperar", etapa: "recuperar", t: 0, dur, rolagens: [] }; };

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
  const jogo = estado.jogo, b = jogo.boss, j = jogo.jogador;
  b.t += dt;
  if (b.flash > 0) b.flash -= dt;
  b.hpFantasma = Math.max(b.hp, b.hpFantasma - 60 * dt);
  const dist = Math.abs(j.x - b.x);

  if (b.estado === "transicao") {
    b.vx = 0;
    if (b.t > 0.3 && b.t < 1.2 && Math.random() < 0.5) particulas(b.x, b.y - 100, "#ff5a36", 2, 160);
    if (b.t >= 1.6) { b.estado = "espera"; b.fase = 2; b.invulneravel = false; b.cooldown = 0.3; }
  } else if (b.estado === "espera") {
    b.dir = Math.sign(j.x - b.x) || b.dir;
    b.vx = dist > 140 && j.estado !== "morto" ? b.dir * (b.fase === 2 ? 115 : 85) : 0;
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
  const jogo = estado.jogo, g = b.golpe, j = jogo.jogador, e = b.est;
  g.t += dt * (b.fase === 2 ? 1.2 : 1);
  if (g.brilho > 0) g.brilho -= dt;
  if (g.etapa !== "ar") b.vx = 0;

  switch (g.nome) {
    case "combo": {
      if (g.etapa === "preparo" && g.t >= preparoCombo(b, g.i)) { g.etapa = "ativo"; g.t = 0; g.acertou = false; }
      else if (g.etapa === "ativo") {
        b.vx = b.dir * 170;
        tentarAcertar(b, areaFrente(b, 125), 22, `combo${g.i + 1}`);
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
          else recuperar(b, 0.9);
        }
      }
      break;
    }

    case "reverso":
      if (g.etapa === "preparo" && g.t >= 0.28) { g.etapa = "ativo"; g.t = 0; }
      else if (g.etapa === "ativo") {
        tentarAcertar(b, areaFrente(b, 115), 18, "reverso");
        if (g.t >= 0.12) recuperar(b, 0.6);
      }
      break;

    case "investida": {
      const preparo = g.rapido ? 0.32 : 0.65;
      if (g.etapa === "preparo") {
        if (g.t < preparo - 0.15) b.dir = Math.sign(j.x - b.x) || b.dir;  // rastreia até pouco antes
        if (g.t >= preparo) { g.etapa = "ativo"; g.t = 0; }
      } else if (g.etapa === "ativo") {
        b.vx = b.dir * 720;
        const frente = areaFrente(b, 90);
        tentarAcertar(b, { ...frente, x1: Math.min(b.x - 33, frente.x1), x2: Math.max(b.x + 33, frente.x2) }, 28, "investida");
        if (Math.random() < 0.6) particulas(b.x - b.dir * 30, CHAO - 5, "#6b6355", 1, 60);
        const naParede = b.x <= b.w / 2 + 12 || b.x >= W - b.w / 2 - 12;
        if (g.t >= 0.42 || naParede) recuperar(b, 0.75);
      }
      break;
    }

    case "salto":
      if (g.etapa === "preparo" && g.t >= 0.45) {
        // Mira onde a jogadora VAI estar
        const alvo = Math.max(60, Math.min(W - 60, j.x + j.vx * 0.5));
        const T = 0.7;
        b.dir = Math.sign(alvo - b.x) || b.dir;
        b.vx = (alvo - b.x) / T; b.vy = -(2400 * T) / 2;
        g.etapa = "ar"; g.t = 0;
      } else if (g.etapa === "ar" && g.t > 0.1 && b.y >= CHAO) {
        b.vx = 0;
        jogo.tremor = 14;
        particulas(b.x, CHAO, "#8a8170", 24, 260);
        g.acertou = false;
        tentarAcertar(b, { x1: b.x - 90, x2: b.x + 90, y1: CHAO - 70, y2: CHAO }, 30, "salto");
        jogo.ondas.push({ x: b.x - 40, dir: -1, vida: 1.2 }, { x: b.x + 40, dir: 1, vida: 1.2 });
        recuperar(b, 1.0);
      }
      break;

    case "recuperar":
      if (g.t >= g.dur) { b.estado = "espera"; b.golpe = null; b.cooldown = cooldownBoss(b); }
      break;
  }
}

export function atualizarOndas(dt) {
  const jogo = estado.jogo, j = jogo.jogador;
  for (const o of jogo.ondas) {
    o.x += o.dir * 460 * dt; o.vida -= dt;
    if (!o.acertou && j.y >= CHAO - 20 && Math.abs(j.x - o.x) < 22) {
      if (ferirJogadora(18, "onda", o.dir)) o.acertou = true;
    }
  }
  jogo.ondas = jogo.ondas.filter((o) => o.vida > 0 && o.x > -40 && o.x < W + 40);
}

// ===================== Desenho =====================
// Folha Attack do minotauro: 0 postura, 1 recua o machado, 2 machado erguido, 3 golpe, 4 fim do golpe
function quadroBoss(b) {
  const g = b.golpe;
  if (b.estado === "morto") return ["morte", Math.min(4, Math.floor(b.t * 6))];
  if (b.estado === "transicao") return ["ferido", ciclo(b.t, 6, 3)];
  if (!g) return Math.abs(b.vx) > 5 ? ["andar", ciclo(b.t, 12, 12)] : ["parado", ciclo(b.t, 8, 10)];
  switch (g.nome) {
    case "combo": case "reverso":
      // Ergue o machado e SEGURA no quadro 2 enquanto espera: é isso que torna o golpe atrasado legível
      if (g.etapa === "preparo") return ["ataque", Math.min(2, Math.floor((g.t / 0.3) * 3))];
      return ["ataque", g.etapa === "ativo" ? 3 : 4];
    case "investida": return ["ataque", g.etapa === "preparo" ? 1 : 3];
    case "salto": return ["ataque", g.etapa === "preparo" ? 1 : 2];
    case "recuperar": return g.t < 0.35 ? ["ataque", 4] : ["parado", ciclo(b.t, 8, 10)];
  }
  return ["parado", 0];
}

// Onde fica a lâmina do machado (para o brilho de aviso), em pixels do quadro relativos aos pés
const LAMINA = { 1: [-31, -23], 2: [-31, -86] };

export function desenharBoss(ctx, b) {
  const [anim, q] = quadroBoss(b);
  const g = b.golpe;
  const alpha = b.estado === "morto" ? Math.max(0, 1 - Math.max(0, b.t - 1.2) / 1.5) : 1;
  const vermelho = b.fase === 2 || b.estado === "transicao" ? 0.12 + 0.08 * Math.sin(b.t * 6) : 0;

  // Rastro na investida
  if (g && g.nome === "investida" && g.etapa === "ativo") {
    for (let i = 1; i <= 3; i++) desenharSprite(ctx, "minotauro", anim, q, b.x - b.vx * 0.025 * i, b.y, { dir: b.dir, alpha: 0.22 / i });
  }
  desenharSprite(ctx, "minotauro", anim, q, b.x, b.y, { dir: b.dir, alpha, branco: b.flash > 0 ? 0.85 : 0, vermelho });

  // Brilho de aviso (telegraph): vermelho quando é um golpe de punição rápido
  if (g && g.brilho > 0 && anim === "ataque" && LAMINA[q]) {
    const s = escalaDe("minotauro"), [lx, ly] = LAMINA[q];
    ctx.save();
    ctx.fillStyle = g.rapido ? "#ff4030" : "#fff6d0";
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 25;
    ctx.globalAlpha = Math.min(1, g.brilho * 5);
    estrela(ctx, b.x + b.dir * lx * s, b.y + ly * s, 10 + (0.25 - g.brilho) * 40);
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

export function desenharOndas(ctx) {
  for (const o of estado.jogo.ondas) {
    ctx.globalAlpha = Math.min(1, o.vida * 2);
    ctx.fillStyle = "#d9c9a3";
    ctx.beginPath(); ctx.moveTo(o.x - 14, CHAO); ctx.lineTo(o.x + o.dir * 6, CHAO - 26); ctx.lineTo(o.x + 14, CHAO); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
