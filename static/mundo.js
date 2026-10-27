// Física com o cenário e o desenho dele (peças da pasta objects):
//   plataforma: { x1, x2, y }               laje de mão única: só o topo é sólido, dá para subir pulando por baixo
//   bloco:      { x1, x2, y1, y2, tipo }    sólido (tipo: "muro" | "coluna" | "torre" | "degrau")
//   rampa:      { x1, y1, x2, y2 }          chão inclinado: subida ou descida (y1 = altura em x1, y2 em x2)
//   escada:     { x, topo, base }           escada de mão: W/S para subir e descer
//   buraco:     { x1, x2 }                  abismo: não tem chão (cair = morrer)
//   tunel:      { x1, x2, teto, espessura } subsolo: corredor escuro sob um teto (bloco "teto"), com tochas
import { estado, CHAO, H } from "./nucleo.js";
import { desenharPeca, desenharFatiaPeca, tamanhoPeca, desenharEfeito, ciclo } from "./sprites.js";

// Quem está no chão "gruda" em superfícies até DEGRAU px acima ou abaixo dos pés:
// é isso que deixa subir rampas e escadas de degraus andando, e descer sem sair voando.
export const DEGRAU = 18;

export const noAbismo = (x) => estado.jogo.buracos.some((b) => x > b.x1 && x < b.x2);
const alturaRampa = (r, x) => r.y1 + ((r.y2 - r.y1) * (x - r.x1)) / (r.x2 - r.x1);

/** Superfície mais alta entre yTopo e yFundo sob os pés do corpo (ou null se não houver nenhuma). */
function superficie(c, yTopo, yFundo) {
  const jogo = estado.jogo, pe1 = c.x - c.w / 2 + 3, pe2 = c.x + c.w / 2 - 3;
  let melhor = null;
  const considerar = (y) => { if (y >= yTopo && y <= yFundo && (melhor === null || y < melhor)) melhor = y; };
  if (!noAbismo(c.x)) considerar(CHAO);
  if (!(c.descendo > 0)) for (const p of jogo.plataformas) if (pe2 > p.x1 && pe1 < p.x2) considerar(p.y);
  for (const b of jogo.blocos) if (pe2 > b.x1 && pe1 < b.x2) considerar(b.y1);
  for (const r of jogo.rampas) if (c.x >= r.x1 && c.x <= r.x2) considerar(alturaRampa(r, c.x));
  return melhor;
}

/** Move um corpo { x, y (pés), vx, vy, w, h } aplicando gravidade e colisões. */
export function moverCorpo(c, dt, gravidade) {
  const jogo = estado.jogo, estavaNoChao = c.noChao;
  c.vy += gravidade * dt;
  const xAntes = c.x, yAntes = c.y;

  // Horizontal: blocos empurram para fora pelo lado de onde o corpo veio (degraus baixos não: sobe-se andando)
  c.x += c.vx * dt;
  for (const b of jogo.blocos) {
    const degrau = estavaNoChao && b.y1 >= c.y - DEGRAU;
    if (!degrau && c.y > b.y1 + 2 && c.y - c.h < b.y2 && c.x + c.w / 2 > b.x1 && c.x - c.w / 2 < b.x2) {
      c.x = xAntes <= (b.x1 + b.x2) / 2 ? b.x1 - c.w / 2 : b.x2 + c.w / 2;
    }
  }
  c.x = Math.max(20, Math.min(jogo.mundoW - 20, c.x));

  // Vertical
  c.y += c.vy * dt;
  c.noChao = false;
  if (c.vy >= 0) {
    const tolerancia = estavaNoChao ? DEGRAU : 0;
    const piso = superficie(c, yAntes - (estavaNoChao ? DEGRAU : 1), c.y + tolerancia);
    if (piso !== null && c.y >= piso - tolerancia) { c.y = piso; c.vy = 0; c.noChao = true; }
  } else {
    // Subindo: bate a cabeça embaixo de blocos
    for (const b of jogo.blocos) {
      if (c.x + c.w / 2 > b.x1 && c.x - c.w / 2 < b.x2 && c.y - c.h < b.y2 && yAntes - c.h >= b.y2 - 1) {
        c.y = b.y2 + c.h; c.vy = 0;
      }
    }
  }
}

/** Está em pé numa plataforma (e não no chão)? Serve para o "descer". */
export function sobrePlataforma(c) {
  return c.noChao && estado.jogo.plataformas.some((p) => c.x > p.x1 && c.x < p.x2 && Math.abs(c.y - p.y) < 1);
}

/** Escada de mão ao alcance (para subir pelo pé dela ou descer pelo topo). */
export function escadaPerto(c) {
  return estado.jogo.escadas.find((e) => Math.abs(c.x - e.x) < 18 && c.y >= e.topo - 4 && c.y <= e.base + 4) || null;
}

/** Trecho onde um inimigo pode andar sem atravessar obstáculos, rampas, abismos ou cair de plataformas. */
export function trechoLivre(x, y) {
  const jogo = estado.jogo;
  const plat = jogo.plataformas.find((p) => x >= p.x1 && x <= p.x2 && Math.abs(p.y - y) < 2);
  if (plat) return [plat.x1 + 14, plat.x2 - 14];
  const topo = jogo.blocos.find((b) => x >= b.x1 && x <= b.x2 && Math.abs(b.y1 - y) < 2);
  if (topo) return [topo.x1 + 14, topo.x2 - 14];  // em cima de uma estrutura
  let ini = 20, fim = jogo.mundoW - 20;
  const parede = (x1, x2, folga = 16) => { if (x2 <= x) ini = Math.max(ini, x2 + folga); if (x1 >= x) fim = Math.min(fim, x1 - folga); };
  for (const b of jogo.blocos) if (b.y2 >= y - 4) parede(b.x1, b.x2);  // bloco suspenso não atrapalha quem anda embaixo
  for (const r of jogo.rampas) parede(r.x1, r.x2);
  // Abismos: o inimigo fica longe da borda, para a jogadora ter onde pousar sem ser jogada de volta no buraco
  for (const b of jogo.buracos) parede(b.x1, b.x2, 70);
  return [ini, fim];
}

/** Superfície onde algo apoiado em x (perto da altura y) está: usada para raios, projéteis e itens no chão. */
export function pisoEm(x, yReferencia) {
  const jogo = estado.jogo;
  let melhor = noAbismo(x) ? H + 200 : CHAO;
  for (const p of jogo.plataformas) if (x >= p.x1 && x <= p.x2 && p.y >= yReferencia - 6 && p.y < melhor) melhor = p.y;
  for (const b of jogo.blocos) if (x >= b.x1 && x <= b.x2 && b.y1 >= yReferencia - 6 && b.y1 < melhor) melhor = b.y1;
  for (const r of jogo.rampas) {
    if (x >= r.x1 && x <= r.x2) { const y = alturaRampa(r, x); if (y >= yReferencia - 6 && y < melhor) melhor = y; }
  }
  return melhor;
}

// ===================== Desenho (peças da pasta objects) =====================
// Escala das peças: 1.5 deixa o "tamanho de pixel" igual ao do cavaleiro
const ESCALA = 1.5;

// Visual de cada tema de fase:
//   piso:   "grama" (faixa de grama), "pedra" (lajotas sobre tijolos) ou "rocha" (pedra escura com rachaduras em brasa)
//   buraco: "escuro", "nevoa" (névoa verde subindo) ou "lava" (lava brilhando; cair continua matando)
//   pedra:  cor multiplicada sobre lajes, estruturas e piso (null = cor original)
//   clima:  partículas do ambiente (ver ambiente.js)
export const TEMAS = {
  ruinas: { piso: "grama", buraco: "escuro", pedra: null, clima: ["neblina"] },
  floresta: { piso: "grama", buraco: "escuro", pedra: "#a9c79a", clima: ["vagalumes", "folhas"] },
  cripta: { piso: "pedra", buraco: "nevoa", pedra: "#b5c9a8", clima: ["almas", "neblina_verde"] },
  torre: { piso: "pedra", buraco: "escuro", pedra: "#e8b48c", clima: ["brasas", "poeira"] },
  abismo: { piso: "rocha", buraco: "lava", pedra: "#c46a5c", clima: ["cinzas", "brasas"] },
};

// Decoração de fundo por tema (sorteada de forma determinística: a fase fica sempre igual)
const DECORACAO = {
  ruinas: ["estatua", "grade", "arbusto", "planta", "grade", "arbusto_escuro"],
  floresta: ["arbusto", "arbusto_escuro", "planta", "morro", "arbusto", "planta"],
  cripta: ["grade", "estatua", "morro", "arbusto_escuro", "grade", "planta"],
  torre: ["estatua", "grade", "grade", "planta", "estatua", "arbusto_escuro"],
  abismo: ["morro", "arbusto_escuro", "estatua", "morro", "grade", "arbusto_escuro"],
};
const ESCALA_DECORACAO = { estatua: 0.75, grade: 1.2, arbusto: 0.6, arbusto_escuro: 0.6, morro: 0.9, planta: 1.3 };

/** Gera a decoração de fundo de uma fase: um item a cada 260–420 px. */
export function gerarDecoracao(tema, largura) {
  const lista = DECORACAO[tema] || DECORACAO.ruinas, itens = [];
  let semente = largura % 97 + 7;
  const aleatorio = () => ((semente = (semente * 9301 + 49297) % 233280) / 233280);
  for (let x = 180; x < largura - 100; x += 260 + aleatorio() * 160) {
    itens.push({ tipo: lista[Math.floor(aleatorio() * lista.length)], x, espelhar: aleatorio() < 0.5 });
  }
  return itens;
}

// Piso de cada estilo: [peça, deslocamento do topo em relação ao chão, altura]; abaixo dele, a cor do subsolo
const PISO = {
  grama: { peca: "chao", topo: -18, subsolo: "#0b0807" },
  pedra: { peca: "tampa", topo: -4, subsolo: "#141210" },
  rocha: { peca: "tampa", topo: -4, subsolo: "#120706" },
};

// Pinta por cima (multiplicando) só onde a forma passar: muda a cor da pedra sem mexer no resto
function tingir(ctx, cor, forma) {
  if (!cor) return;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = cor;
  ctx.beginPath(); forma(); ctx.fill();
  ctx.restore();
}

/** Fase inteira: decoração, chão, abismos, rampas, plataformas, estruturas e escadas (no visual do tema). */
export function desenharMundo(ctx) {
  const jogo = estado.jogo, cam = jogo.cam, tema = TEMAS[jogo.fase?.tema] || TEMAS.ruinas;
  const visivel = (x1, x2) => x2 > cam - 40 && x1 < cam + 1000;
  const piso = PISO[tema.piso];

  // Decoração (atrás de tudo; a base fica escondida pela grama do chão)
  for (const d of jogo.decoracao) {
    const [w, h] = tamanhoPeca(d.tipo), e = ESCALA_DECORACAO[d.tipo];
    if (!visivel(d.x, d.x + w * e)) continue;
    ctx.globalAlpha = 0.9;
    desenharPeca(ctx, d.tipo, d.x, CHAO + 8 - h * e, w * e, h * e, d.espelhar);
    ctx.globalAlpha = 1;
  }

  // Túneis: parede de fundo (atrás de tudo que se move) e tochas
  for (const t of jogo.tuneis) if (visivel(t.x1, t.x2)) desenharFundoDoTunel(ctx, t, tema, jogo.t);

  // Colunas que sustentam as plataformas (atrás das lajes e dos personagens). Pontes sobre abismos não têm.
  const [pw, ph] = tamanhoPeca("pilar");
  for (const p of jogo.plataformas) {
    if (!visivel(p.x1, p.x2)) continue;
    for (const cx of [p.x1 + 26, p.x2 - 26]) {
      if (noAbismo(cx)) continue;
      // Empilha o pilar do chão até a laje (recortando o último pedaço)
      ctx.save();
      ctx.beginPath(); ctx.rect(cx - pw / 2, p.y + 20, pw, CHAO - p.y); ctx.clip();
      for (let y = CHAO + 4 - ph; y > p.y - ph; y -= ph - 2) desenharPeca(ctx, "pilar", cx - pw / 2, y, pw, ph);
      tingir(ctx, tema.pedra, () => ctx.rect(cx - pw / 2, p.y, pw, CHAO - p.y + 20));
      ctx.restore();
    }
  }

  // Chão: faixa do piso repetida; abaixo dela, o subsolo (tijolos escuros nos pisos de pedra)
  const [cw, ch] = tamanhoPeca(piso.peca), larguraChao = cw * ESCALA, alturaPiso = ch * ESCALA;
  const x0 = Math.floor(cam / larguraChao) * larguraChao;
  ctx.fillStyle = piso.subsolo; ctx.fillRect(cam - 10, CHAO + 18, 1000, 200);
  if (tema.piso !== "grama") {
    const [tw, th] = tamanhoPeca("tijolos");
    ctx.globalAlpha = 0.35;
    for (let y = CHAO + piso.topo + alturaPiso; y < H; y += th * ESCALA) {
      for (let x = x0 - ((y / 7) % 2) * 40; x < cam + 980; x += tw * ESCALA) desenharPeca(ctx, "tijolos", x, y, tw * ESCALA, th * ESCALA);
    }
    ctx.globalAlpha = 1;
  }
  for (let x = x0; x < cam + 980; x += larguraChao) {
    desenharPeca(ctx, piso.peca, x, CHAO + piso.topo, larguraChao + 1, alturaPiso, Math.floor(x / larguraChao) % 2 === 1);
  }
  tingir(ctx, tema.pedra, () => ctx.rect(cam - 10, CHAO + piso.topo, 1000, H - CHAO - piso.topo));
  if (tema.piso === "rocha") desenharRachaduras(ctx, cam, jogo.t);

  // Abismos (escuros, com névoa ou com lava), com bordas de terra
  for (const b of jogo.buracos) {
    if (!visivel(b.x1, b.x2)) continue;
    desenharBuraco(ctx, b, tema.buraco, jogo.t);
    ctx.fillStyle = tema.buraco === "lava" ? "#2a1210" : "#3a2618";
    for (const [borda, lado] of [[b.x1, 1], [b.x2, -1]]) {
      for (let y = CHAO - 16; y < H; y += 14) ctx.fillRect(borda - (lado > 0 ? 0 : 7) + ((y / 14) % 2) * 3 * lado, y, 7, 12);
    }
  }

  // Rampas: subsolo por baixo e a faixa do piso inclinada por cima
  for (const r of jogo.rampas) {
    if (!visivel(r.x1, r.x2)) continue;
    const base = Math.max(r.y1, r.y2, CHAO) + 40;
    ctx.fillStyle = tema.piso === "grama" ? "#1b120c" : piso.subsolo;
    ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); ctx.lineTo(r.x2, base); ctx.lineTo(r.x1, base); ctx.fill();
    const ang = Math.atan2(r.y2 - r.y1, r.x2 - r.x1), comprimento = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
    ctx.save();
    ctx.translate(r.x1, r.y1); ctx.rotate(ang);
    for (let d = -8; d < comprimento; d += larguraChao - 2) desenharPeca(ctx, piso.peca, d, piso.topo, larguraChao + 1, alturaPiso);
    tingir(ctx, tema.pedra, () => ctx.rect(-8, piso.topo, comprimento + 16, alturaPiso));
    ctx.restore();
  }

  // Plataformas: laje de pedra emendada (ponta esquerda + meio repetido + ponta direita)
  const [lw, lh] = tamanhoPeca("laje"), ponta = 10, meio = lw - 2 * ponta, alturaLaje = lh * ESCALA;
  for (const p of jogo.plataformas) {
    if (!visivel(p.x1, p.x2)) continue;
    const y = p.y - 4, pontaW = ponta * ESCALA;
    desenharFatiaPeca(ctx, "laje", 0, ponta, p.x1, y, pontaW, alturaLaje);
    for (let x = p.x1 + pontaW; x < p.x2 - pontaW; x += meio * ESCALA) {
      const largura = Math.min(meio * ESCALA, p.x2 - pontaW - x);
      desenharFatiaPeca(ctx, "laje", ponta, largura / ESCALA, x, y, largura, alturaLaje);
    }
    desenharFatiaPeca(ctx, "laje", lw - ponta, ponta, p.x2 - pontaW, y, pontaW, alturaLaje);
    tingir(ctx, tema.pedra, () => ctx.rect(p.x1, y, p.x2 - p.x1, alturaLaje));
  }

  // Obstáculos e estruturas
  for (const b of jogo.blocos) {
    if (!visivel(b.x1, b.x2)) continue;
    if (b.tipo === "torre" || b.tipo === "degrau" || b.tipo === "teto") desenharAlvenaria(ctx, b);
    else desenharPeca(ctx, b.tipo === "coluna" ? "pilar_quebrado" : "muro", b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
    tingir(ctx, tema.pedra, () => ctx.rect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1));
    if (b.tipo === "teto") desenharEstalactites(ctx, b);
  }

  // Escadas de mão (madeira)
  for (const e of jogo.escadas) {
    if (!visivel(e.x - 20, e.x + 20)) continue;
    ctx.fillStyle = "#3d2a1a"; ctx.fillRect(e.x - 14, e.topo - 6, 5, e.base - e.topo + 6); ctx.fillRect(e.x + 9, e.topo - 6, 5, e.base - e.topo + 6);
    ctx.fillStyle = "#6b4a2c"; ctx.fillRect(e.x - 13, e.topo - 6, 2, e.base - e.topo + 6); ctx.fillRect(e.x + 10, e.topo - 6, 2, e.base - e.topo + 6);
    for (let y = e.topo + 4; y < e.base; y += 16) { ctx.fillStyle = "#5a3e26"; ctx.fillRect(e.x - 10, y, 20, 4); ctx.fillStyle = "#7d5a38"; ctx.fillRect(e.x - 10, y, 20, 1); }
  }
}

// ===================== Túneis (subsolo) =====================
const tochas = (t) => {
  const lista = [];
  for (let x = t.x1 + 90; x < t.x2 - 40; x += 240) lista.push(x);
  return lista;
};

// Parede de tijolos escurecida e tochas presas nela
function desenharFundoDoTunel(ctx, t, tema, tempo) {
  const [tw, th] = tamanhoPeca("tijolos"), w = t.x2 - t.x1, h = CHAO - t.teto + 10;
  ctx.save();
  ctx.beginPath(); ctx.rect(t.x1, t.teto, w, h); ctx.clip();
  for (let y = t.teto; y < CHAO + 10; y += th * ESCALA) {
    for (let x = t.x1 - ((y / 7) % 2) * 30; x < t.x2; x += tw * ESCALA) desenharPeca(ctx, "tijolos", x, y, tw * ESCALA, th * ESCALA);
  }
  tingir(ctx, tema.pedra, () => ctx.rect(t.x1, t.teto, w, h));
  ctx.fillStyle = "rgba(4,3,6,0.6)"; ctx.fillRect(t.x1, t.teto, w, h);
  ctx.restore();
  for (const x of tochas(t)) {
    const y = t.teto + 38;
    ctx.fillStyle = "#2a1c12"; ctx.fillRect(x - 2, y, 4, 16);   // cabo
    ctx.fillStyle = "#5a3e26"; ctx.fillRect(x - 4, y - 2, 8, 4); // bocal
    desenharEfeito(ctx, "fogo", ciclo(tempo + x, 10, 6), x, y + 2, 0.22);
  }
}

// Pontas de pedra penduradas no teto (posições fixas para cada túnel)
function desenharEstalactites(ctx, b) {
  ctx.fillStyle = "rgba(20,16,14,0.9)";
  ctx.beginPath();
  for (let x = b.x1 + 12; x < b.x2 - 12; x += 22) {
    const comprimento = 6 + ((x * 31) % 11);
    ctx.moveTo(x - 6, b.y2); ctx.lineTo(x, b.y2 + comprimento); ctx.lineTo(x + 6, b.y2);
  }
  ctx.fill();
}

/**
 * Escuridão dos túneis, por cima dos personagens: só a volta da jogadora e as tochas ficam iluminadas.
 * Quem está lá dentro aparece aos poucos ao chegar perto.
 */
export function desenharEscuridao(ctx) {
  const jogo = estado.jogo, j = jogo.jogador, cam = jogo.cam;
  for (const t of jogo.tuneis) {
    if (t.x2 < cam - 40 || t.x1 > cam + 1000) continue;
    const w = t.x2 - t.x1, h = CHAO - t.teto + 40;
    ctx.save();
    ctx.beginPath(); ctx.rect(t.x1, t.teto, w, h); ctx.clip();
    const luz = ctx.createRadialGradient(j.x, j.y - 34, 50, j.x, j.y - 34, 300);
    luz.addColorStop(0, "rgba(0,0,0,0)"); luz.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = luz; ctx.fillRect(t.x1, t.teto, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (const x of tochas(t)) {
      const brilho = ctx.createRadialGradient(x, t.teto + 34, 4, x, t.teto + 34, 120);
      brilho.addColorStop(0, `rgba(255,140,50,${0.22 + 0.04 * Math.sin(jogo.t * 9 + x)})`); brilho.addColorStop(1, "rgba(255,140,50,0)");
      ctx.fillStyle = brilho; ctx.fillRect(x - 120, t.teto - 86, 240, 240);
    }
    ctx.restore();
  }
}

// Abismo: escuridão simples, névoa verde subindo (cripta) ou lava viva (abismo rubro)
function desenharBuraco(ctx, b, estilo, t) {
  const w = b.x2 - b.x1;
  if (estilo === "lava") {
    // Brilho subindo do buraco, superfície ondulando e bolhas
    const brilho = ctx.createLinearGradient(0, CHAO - 120, 0, CHAO + 10);
    brilho.addColorStop(0, "rgba(255,90,20,0)"); brilho.addColorStop(1, `rgba(255,110,30,${0.28 + 0.08 * Math.sin(t * 2)})`);
    ctx.fillStyle = brilho; ctx.fillRect(b.x1 - 30, CHAO - 120, w + 60, 130);
    ctx.fillStyle = "#1a0705"; ctx.fillRect(b.x1, CHAO - 20, w, 70);
    const lava = ctx.createLinearGradient(0, CHAO + 40, 0, H);
    lava.addColorStop(0, "#ffcf5a"); lava.addColorStop(0.25, "#ff7a1e"); lava.addColorStop(1, "#7a1206");
    ctx.fillStyle = lava;
    ctx.beginPath(); ctx.moveTo(b.x1, H);
    for (let x = b.x1; x <= b.x2; x += 6) ctx.lineTo(x, CHAO + 46 + Math.sin(x * 0.08 + t * 2.5) * 3);
    ctx.lineTo(b.x2, H); ctx.fill();
    ctx.fillStyle = "#ffe08a";
    for (let i = 0; i < w / 30; i++) {
      const fase = (t * 0.7 + i * 0.37) % 1, bx = b.x1 + ((i * 53) % w);
      ctx.globalAlpha = 1 - fase; ctx.fillRect(bx, CHAO + 44 - fase * 14, 3, 3);
    }
    ctx.globalAlpha = 1;
    return;
  }
  const g = ctx.createLinearGradient(0, CHAO - 20, 0, H);
  g.addColorStop(0, "#120b08"); g.addColorStop(1, "#000");
  ctx.fillStyle = g; ctx.fillRect(b.x1, CHAO - 20, w, H - CHAO + 20);
  if (estilo === "nevoa") {
    for (let i = 0; i < 4; i++) {
      const y = CHAO + 20 - ((t * 12 + i * 22) % 80), a = 0.18 * (1 - ((t * 12 + i * 22) % 80) / 80);
      ctx.fillStyle = `rgba(120,220,140,${a})`;
      ctx.beginPath(); ctx.ellipse(b.x1 + w / 2 + Math.sin(t + i) * w * 0.2, y, w * 0.45, 10, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// Rachaduras em brasa na rocha (abismo rubro): pulsam devagar
function desenharRachaduras(ctx, cam, t) {
  ctx.save();
  ctx.strokeStyle = `rgba(255,110,40,${0.45 + 0.2 * Math.sin(t * 1.7)})`; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = Math.floor(cam / 140) * 140; x < cam + 1000; x += 140) {
    const s = (x * 7919) % 97;  // posição fixa para cada trecho
    ctx.moveTo(x + s, CHAO + 4); ctx.lineTo(x + s + 12, CHAO + 14); ctx.lineTo(x + s + 6, CHAO + 26); ctx.lineTo(x + s + 20, CHAO + 40);
  }
  ctx.stroke();
  ctx.restore();
}

// Estrutura de tijolos (torres, muros altos, degraus): tampa de pedra em cima e tijolos repetidos no corpo
function desenharAlvenaria(ctx, b) {
  const [tw, th] = tamanhoPeca("tampa"), [, jh] = tamanhoPeca("tijolos");
  const w = b.x2 - b.x1, h = b.y2 - b.y1, alturaTampa = Math.min(th, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(b.x1, b.y1, w, h); ctx.clip();
  for (let y = b.y1 + alturaTampa; y < b.y2; y += jh) for (let x = b.x1; x < b.x2; x += tw) desenharPeca(ctx, "tijolos", x, y, tw, jh);
  for (let x = b.x1; x < b.x2; x += tw) desenharPeca(ctx, "tampa", x, b.y1, tw, alturaTampa);
  ctx.restore();
}
