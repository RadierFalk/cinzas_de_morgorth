// Física com o cenário: chão, plataformas de mão única e blocos sólidos (muros e colunas), e o desenho deles.
//   plataforma: { x1, x2, y }               só o topo é sólido; dá para subir pulando por baixo
//   bloco:      { x1, x2, y1, y2, tipo }    sólido dos lados, em cima e embaixo (tipo: "muro" | "coluna")
import { estado, CHAO } from "./nucleo.js";
import { desenharPeca, desenharFatiaPeca, tamanhoPeca } from "./sprites.js";

/** Move um corpo { x, y (pés), vx, vy, w, h } aplicando gravidade e colisões. */
export function moverCorpo(c, dt, gravidade) {
  const jogo = estado.jogo;
  c.vy += gravidade * dt;
  const xAntes = c.x, yAntes = c.y;

  // Horizontal: blocos empurram para fora pelo lado de onde o corpo veio
  c.x += c.vx * dt;
  for (const b of jogo.blocos) {
    if (c.y > b.y1 + 2 && c.y - c.h < b.y2 && c.x + c.w / 2 > b.x1 && c.x - c.w / 2 < b.x2) {
      c.x = xAntes <= (b.x1 + b.x2) / 2 ? b.x1 - c.w / 2 : b.x2 + c.w / 2;
    }
  }
  c.x = Math.max(20, Math.min(jogo.mundoW - 20, c.x));

  // Vertical
  c.y += c.vy * dt;
  c.noChao = false;
  if (c.vy >= 0) {
    // Caindo: pousa na superfície mais alta que atravessou neste quadro
    const pe1 = c.x - c.w / 2 + 3, pe2 = c.x + c.w / 2 - 3;
    let piso = CHAO;
    for (const p of jogo.plataformas) {
      if (!(c.descendo > 0) && pe2 > p.x1 && pe1 < p.x2 && yAntes <= p.y + 1 && c.y >= p.y) piso = Math.min(piso, p.y);
    }
    for (const b of jogo.blocos) {
      if (pe2 > b.x1 && pe1 < b.x2 && yAntes <= b.y1 + 1 && c.y >= b.y1) piso = Math.min(piso, b.y1);
    }
    if (c.y >= piso) { c.y = piso; c.vy = 0; c.noChao = true; }
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
  return c.noChao && c.y < CHAO && estado.jogo.plataformas.some((p) => c.x > p.x1 && c.x < p.x2 && Math.abs(c.y - p.y) < 1);
}

/** Trecho de chão livre (entre blocos) onde um inimigo pode andar sem atravessar obstáculos. */
export function trechoLivre(x, y) {
  const jogo = estado.jogo;
  const plat = jogo.plataformas.find((p) => x >= p.x1 && x <= p.x2 && Math.abs(p.y - y) < 2);
  if (plat) return [plat.x1 + 14, plat.x2 - 14];
  let ini = 20, fim = jogo.mundoW - 20;
  for (const b of jogo.blocos) {
    if (b.y2 < y - 4) continue;  // bloco suspenso: não atrapalha quem anda embaixo
    if (b.x2 <= x) ini = Math.max(ini, b.x2 + 16);
    if (b.x1 >= x) fim = Math.min(fim, b.x1 - 16);
  }
  return [ini, fim];
}

/** Superfície onde algo apoiado em x (perto da altura y) está: usada para raios e para pousar inimigos. */
export function pisoEm(x, yReferencia) {
  const jogo = estado.jogo;
  let melhor = CHAO;
  for (const p of jogo.plataformas) if (x >= p.x1 && x <= p.x2 && p.y >= yReferencia - 6 && p.y < melhor) melhor = p.y;
  for (const b of jogo.blocos) if (x >= b.x1 && x <= b.x2 && b.y1 >= yReferencia - 6 && b.y1 < melhor) melhor = b.y1;
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

/** Fase inteira: decoração de fundo, chão, plataformas com colunas e obstáculos. */
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

  // Colunas que sustentam as plataformas (atrás das lajes e dos personagens)
  const [pw, ph] = tamanhoPeca("pilar");
  for (const p of jogo.plataformas) {
    if (!visivel(p.x1, p.x2)) continue;
    for (const cx of [p.x1 + 26, p.x2 - 26]) {
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

  // Obstáculos
  for (const b of jogo.blocos) {
    if (!visivel(b.x1, b.x2)) continue;
    const peca = b.tipo === "coluna" ? "pilar_quebrado" : "muro";
    desenharPeca(ctx, peca, b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
  }
}
