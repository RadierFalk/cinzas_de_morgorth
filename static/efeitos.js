// Explosões e outros efeitos animados (explosion-sprites). Tocam uma vez e somem.
import { estado } from "./nucleo.js";
import { desenharEfeito, nQuadrosEfeito } from "./sprites.js";

/** Cria um efeito em (x, y). Efeitos "de chão" (explosao, nuclear, fumaca, raio...) usam y = chão. */
export function efeito(nome, x, y, { escala = 1, fps = 20, dir = 1 } = {}) {
  estado.jogo.efeitos.push({ nome, x, y, escala, fps, dir, t: 0, n: nQuadrosEfeito(nome) });
}

export function atualizarEfeitos(dt) {
  const jogo = estado.jogo;
  for (const e of jogo.efeitos) e.t += dt;
  jogo.efeitos = jogo.efeitos.filter((e) => e.t * e.fps < e.n);
}

export function desenharEfeitos(ctx) {
  for (const e of estado.jogo.efeitos) desenharEfeito(ctx, e.nome, e.t * e.fps, e.x, e.y, e.escala, e.dir);
}
