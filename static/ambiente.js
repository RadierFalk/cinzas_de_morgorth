// Clima de cada lugar: partículas que dão vida ao cenário (névoa, vaga-lumes, folhas, brasas, cinzas, almas, poeira).
// São só visuais: não encostam em ninguém. Ficam nas coordenadas do mundo, perto da câmera.
import { estado, W, CHAO } from "./nucleo.js";

const aleatorio = (a, b) => a + Math.random() * (b - a);

// Cada clima: quantas nascem por segundo e como nasce uma partícula (x0 = borda esquerda da tela no mundo)
const CLIMAS = {
  neblina: { taxa: 0.9, nascer: (x0) => ({ x: x0 + aleatorio(-200, W), y: aleatorio(CHAO - 70, CHAO + 10), vx: aleatorio(8, 22), vy: 0,
    vida: 9, raio: aleatorio(110, 220), cor: "200,210,225", alfa: 0.07 }) },
  neblina_verde: { taxa: 0.9, nascer: (x0) => ({ x: x0 + aleatorio(-200, W), y: aleatorio(CHAO - 60, CHAO + 10), vx: aleatorio(-15, 15), vy: 0,
    vida: 9, raio: aleatorio(110, 200), cor: "120,220,140", alfa: 0.06 }) },
  vagalumes: { taxa: 3, nascer: (x0) => ({ x: x0 + aleatorio(0, W), y: aleatorio(140, CHAO - 30), vx: aleatorio(-12, 12), vy: aleatorio(-8, 8),
    vida: aleatorio(4, 7), brilho: true, cor: "220,255,140", tam: 2, onda: aleatorio(0, 6) }) },
  folhas: { taxa: 1.6, nascer: (x0) => ({ x: x0 + aleatorio(-100, W), y: -10, vx: aleatorio(15, 45), vy: aleatorio(30, 55),
    vida: 12, folha: true, cor: Math.random() < 0.5 ? "#6f8f3a" : "#a07a2c", giro: aleatorio(0, 6), onda: aleatorio(0, 6) }) },
  brasas: { taxa: 7, nascer: (x0) => ({ x: x0 + aleatorio(0, W), y: CHAO + aleatorio(0, 30), vx: aleatorio(-10, 10), vy: aleatorio(-70, -35),
    vida: aleatorio(2.5, 5), brilho: true, cor: Math.random() < 0.5 ? "255,150,60" : "255,210,110", tam: 2, onda: aleatorio(0, 6) }) },
  cinzas: { taxa: 9, nascer: (x0) => ({ x: x0 + aleatorio(-100, W), y: -10, vx: aleatorio(-20, 10), vy: aleatorio(25, 50),
    vida: 14, cor: Math.random() < 0.3 ? "200,70,50" : "120,110,110", tam: Math.random() < 0.3 ? 3 : 2, onda: aleatorio(0, 6) }) },
  almas: { taxa: 0.7, nascer: (x0) => ({ x: x0 + aleatorio(0, W), y: CHAO + 10, vx: aleatorio(-6, 6), vy: aleatorio(-28, -16),
    vida: aleatorio(6, 9), alma: true, cor: "170,240,220", onda: aleatorio(0, 6) }) },
  poeira: { taxa: 4, nascer: (x0) => ({ x: x0 + aleatorio(0, W), y: aleatorio(80, CHAO - 20), vx: aleatorio(-6, 6), vy: aleatorio(-4, 4),
    vida: aleatorio(4, 8), cor: "255,235,200", tam: 1, alfa: 0.5, onda: aleatorio(0, 6) }) },
};

/** Liga o clima da cena (lista de nomes de CLIMAS) e já espalha algumas partículas pela tela. */
export function iniciarAmbiente(jogo, climas = []) {
  jogo.climas = climas.filter((c) => CLIMAS[c]);
  jogo.ambiente = [];
  for (const nome of jogo.climas) {
    const c = CLIMAS[nome];
    for (let i = 0; i < c.taxa * 4; i++) {
      const p = c.nascer(jogo.cam);
      p.t = aleatorio(0, p.vida * 0.8); p.x += p.vx * p.t; p.y += p.vy * p.t;  // como se já estivessem caindo há um tempo
      jogo.ambiente.push(p);
    }
  }
}

export function atualizarAmbiente(dt) {
  const jogo = estado.jogo;
  if (!jogo.ambiente) return;
  for (const nome of jogo.climas) {
    const c = CLIMAS[nome];
    if (Math.random() < c.taxa * dt) jogo.ambiente.push({ ...c.nascer(jogo.cam), t: 0 });
  }
  for (const p of jogo.ambiente) {
    p.t += dt;
    p.x += (p.vx + (p.onda != null ? Math.sin(p.t * 1.5 + p.onda) * 12 : 0)) * dt;
    p.y += p.vy * dt;
  }
  jogo.ambiente = jogo.ambiente.filter((p) => p.t < p.vida && p.x > jogo.cam - 300 && p.x < jogo.cam + W + 300 && p.y < CHAO + 80).slice(-220);
}

/** Desenha o clima (coordenadas do mundo). */
export function desenharAmbiente(ctx) {
  const jogo = estado.jogo;
  if (!jogo.ambiente) return;
  ctx.save();
  for (const p of jogo.ambiente) {
    // Aparece e some suavemente
    const f = Math.min(1, p.t / 0.8, (p.vida - p.t) / 1.2);
    if (p.raio) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.raio);
      g.addColorStop(0, `rgba(${p.cor},${p.alfa * f})`); g.addColorStop(1, `rgba(${p.cor},0)`);
      ctx.fillStyle = g; ctx.fillRect(p.x - p.raio, p.y - p.raio * 0.4, p.raio * 2, p.raio * 0.8);
    } else if (p.folha) {
      ctx.globalAlpha = 0.8 * f; ctx.fillStyle = p.cor;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.giro + p.t * 2); ctx.fillRect(-3, -1.5, 6, 3); ctx.restore();
    } else if (p.alma) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9);
      g.addColorStop(0, `rgba(${p.cor},${0.5 * f})`); g.addColorStop(1, `rgba(${p.cor},0)`);
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(p.x - 9, p.y - 9, 18, 26);
    } else {
      const piscar = p.brilho ? 0.55 + 0.45 * Math.sin(p.t * 6 + (p.onda || 0)) : 1;
      ctx.globalAlpha = (p.alfa ?? 0.85) * f * piscar;
      if (p.brilho) { ctx.shadowColor = `rgb(${p.cor})`; ctx.shadowBlur = 8; }
      ctx.fillStyle = `rgb(${p.cor})`; ctx.fillRect(p.x, p.y, p.tam, p.tam);
      ctx.shadowBlur = 0;
    }
  }
  ctx.restore();
}
