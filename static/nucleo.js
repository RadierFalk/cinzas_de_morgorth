// Peças compartilhadas por todos os módulos do jogo: tela, teclado, utilidades e o estado atual.

export const W = 960, H = 540, CHAO = 450;
export const canvas = document.getElementById("tela");
export const ctx = canvas.getContext("2d");

// O estado da cena atual (fase ou chefão) fica aqui para todos os módulos enxergarem
export const estado = { jogo: null };

// ===================== Entrada (com buffer, estilo souls) =====================
const MAPA = {
  esquerda: ["KeyA", "ArrowLeft"], direita: ["KeyD", "ArrowRight"],
  pular: ["KeyW", "ArrowUp", "Space"], esquivar: ["ShiftLeft", "ShiftRight", "KeyK"],
  atacar: ["KeyJ"], curar: ["KeyF"],
};
const BUFFER_S = 0.25;
export const segurando = new Set();
const buffer = {};

function acaoDe(code) {
  for (const [acao, codigos] of Object.entries(MAPA)) if (codigos.includes(code)) return acao;
}
const capturando = () => estado.jogo && !estado.jogo.encerrado;

addEventListener("keydown", (e) => {
  const a = acaoDe(e.code);
  if (!a || !capturando()) return;
  e.preventDefault();
  segurando.add(a);
  if (!e.repeat) buffer[a] = BUFFER_S;
});
addEventListener("keyup", (e) => { const a = acaoDe(e.code); if (a) segurando.delete(a); });
canvas.addEventListener("mousedown", (e) => { if (capturando() && e.button === 0) buffer.atacar = BUFFER_S; });

export function consumir(acao) {
  if (buffer[acao] > 0) { buffer[acao] = 0; return true; }
  return false;
}
export function avancarBuffer(dt) { for (const a in buffer) buffer[a] -= dt; }
export function limparEntrada() { segurando.clear(); for (const a in buffer) buffer[a] = 0; }

// ===================== Utilidades =====================
export const caixa = (o) => ({ x1: o.x - o.w / 2, x2: o.x + o.w / 2, y1: o.y - o.h, y2: o.y });
export const sobrepoe = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
export const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

export function particulas(x, y, cor, n, forca = 220) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = forca * (0.3 + Math.random());
    estado.jogo.particulas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, vida: 0.4 + Math.random() * 0.4, cor, tam: 2 + Math.random() * 3 });
  }
}
export function texto(x, y, txt, cor) { estado.jogo.textos.push({ x, y, txt, cor, vida: 0.9 }); }
