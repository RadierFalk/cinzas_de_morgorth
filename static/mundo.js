// Física com o cenário e o desenho dele (peças da pasta objects):
//   plataforma: { x1, x2, y }               laje de mão única: só o topo é sólido, dá para subir pulando por baixo
//   bloco:      { x1, x2, y1, y2, tipo }    sólido (tipo: "muro" | "coluna" | "torre" | "degrau")
//   rampa:      { x1, y1, x2, y2 }          chão inclinado: subida ou descida (y1 = altura em x1, y2 em x2)
//   escada:     { x, topo, base }           escada de mão: W/S para subir e descer
//   buraco:     { x1, x2 }                  abismo: não tem chão (cair = morrer)
import { estado, CHAO, H } from "./nucleo.js";
import { desenharPeca, desenharFatiaPeca, tamanhoPeca } from "./sprites.js";

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

// Decoração de fundo por tema (sorteada de forma determinística: a fase fica sempre igual)
const DECORACAO = {
  ruinas: ["estatua", "grade", "arbusto", "planta", "grade", "arbusto_escuro"],
  floresta: ["arbusto", "arbusto_escuro", "planta", "morro", "arbusto", "planta"],
  cripta: ["grade", "estatua", "morro", "arbusto_escuro", "grade", "planta"],
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

/** Fase inteira: decoração, chão, abismos, rampas, plataformas, estruturas e escadas. */
export function desenharMundo(ctx) {
  const jogo = estado.jogo, cam = jogo.cam;
  const visivel = (x1, x2) => x2 > cam - 40 && x1 < cam + 1000;

  // Decoração (atrás de tudo; a base fica escondida pela grama do chão)
  for (const d of jogo.decoracao) {
    const [w, h] = tamanhoPeca(d.tipo), e = ESCALA_DECORACAO[d.tipo];
    if (!visivel(d.x, d.x + w * e)) continue;
    ctx.globalAlpha = 0.9;
    desenharPeca(ctx, d.tipo, d.x, CHAO + 8 - h * e, w * e, h * e, d.espelhar);
    ctx.globalAlpha = 1;
  }

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
      ctx.restore();
    }
  }

  // Chão: faixa de grama repetida; abaixo dela, terra escura
  const [cw, ch] = tamanhoPeca("chao"), larguraChao = cw * ESCALA;
  ctx.fillStyle = "#0b0807"; ctx.fillRect(cam - 10, CHAO + 40, 1000, 200);
  for (let x = Math.floor(cam / larguraChao) * larguraChao; x < cam + 980; x += larguraChao) {
    desenharPeca(ctx, "chao", x, CHAO - 18, larguraChao + 1, ch * ESCALA, Math.floor(x / larguraChao) % 2 === 1);
  }

  // Abismos: escuridão por cima do chão, com bordas de terra
  for (const b of jogo.buracos) {
    if (!visivel(b.x1, b.x2)) continue;
    const g = ctx.createLinearGradient(0, CHAO - 20, 0, H);
    g.addColorStop(0, "#120b08"); g.addColorStop(1, "#000");
    ctx.fillStyle = g; ctx.fillRect(b.x1, CHAO - 20, b.x2 - b.x1, H - CHAO + 20);
    ctx.fillStyle = "#3a2618";
    for (const [borda, lado] of [[b.x1, 1], [b.x2, -1]]) {
      for (let y = CHAO - 16; y < H; y += 14) ctx.fillRect(borda - (lado > 0 ? 0 : 7) + ((y / 14) % 2) * 3 * lado, y, 7, 12);
    }
  }

  // Rampas: terra escura por baixo e a faixa de grama inclinada por cima
  for (const r of jogo.rampas) {
    if (!visivel(r.x1, r.x2)) continue;
    const base = Math.max(r.y1, r.y2, CHAO) + 40;
    ctx.fillStyle = "#1b120c";
    ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); ctx.lineTo(r.x2, base); ctx.lineTo(r.x1, base); ctx.fill();
    const ang = Math.atan2(r.y2 - r.y1, r.x2 - r.x1), comprimento = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
    ctx.save();
    ctx.translate(r.x1, r.y1); ctx.rotate(ang);
    for (let d = -8; d < comprimento; d += larguraChao - 2) desenharPeca(ctx, "chao", d, -18, larguraChao + 1, ch * ESCALA);
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
  }

  // Obstáculos e estruturas
  for (const b of jogo.blocos) {
    if (!visivel(b.x1, b.x2)) continue;
    if (b.tipo === "torre" || b.tipo === "degrau") desenharAlvenaria(ctx, b);
    else desenharPeca(ctx, b.tipo === "coluna" ? "pilar_quebrado" : "muro", b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
  }

  // Escadas de mão (madeira)
  for (const e of jogo.escadas) {
    if (!visivel(e.x - 20, e.x + 20)) continue;
    ctx.fillStyle = "#3d2a1a"; ctx.fillRect(e.x - 14, e.topo - 6, 5, e.base - e.topo + 6); ctx.fillRect(e.x + 9, e.topo - 6, 5, e.base - e.topo + 6);
    ctx.fillStyle = "#6b4a2c"; ctx.fillRect(e.x - 13, e.topo - 6, 2, e.base - e.topo + 6); ctx.fillRect(e.x + 10, e.topo - 6, 2, e.base - e.topo + 6);
    for (let y = e.topo + 4; y < e.base; y += 16) { ctx.fillStyle = "#5a3e26"; ctx.fillRect(e.x - 10, y, 20, 4); ctx.fillStyle = "#7d5a38"; ctx.fillRect(e.x - 10, y, 20, 1); }
  }
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
