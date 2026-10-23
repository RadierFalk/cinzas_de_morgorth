// Inimigos comuns das fases: esqueletos (Craftpix Skeleton_*) e magos (Craftpix wizard_enemy).
// Todos usam a mesma máquina de estados:
//   parado → perseguir → ataque (preparo/ativo/recuperar), com "ferido" (cambaleia), "defesa"
//   (escudo), "fugir" (o mago errante salta para longe) e "morto".
import { estado, caixa, sobrepoe, particulas, texto } from "./nucleo.js";
import { ferirJogadora, invulneravel } from "./jogador.js";
import { desenharSprite, desenharProjetil, ciclo, nQuadros } from "./sprites.js";
import { trechoLivre, pisoEm } from "./mundo.js";
import { efeito } from "./efeitos.js";
import { som } from "./sons.js";

/** Número de dano flutuante: o crítico aparece maior, em amarelo. Usado pelos inimigos e pelos chefes. */
export function mostrarDano(x, y, dano, critico) {
  if (critico) {
    texto(x, y - 18, "CRÍTICO", "#ffd84a", 15);
    texto(x, y, `${dano}`, "#ffd84a", 26);
    efeito("circulo", x, y + 30, { escala: 0.28, fps: 30 });
    estado.jogo.hitstop = 0.09;
  } else texto(x, y, `${dano}`, "#f5e6c8");
}

const intervalo = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ataques: em ordem de prioridade; o primeiro cujas condições batem é usado
//   distMin/distMax: distância até a jogadora; chance: probabilidade de escolher
//   quadros: quais quadros mostrar em cada etapa (o "ativo" é o do impacto ou do disparo)
//   alcance (corpo a corpo) | projetil (tiro mirado) | raioDoCeu (cai onde a jogadora está)
// postura: quantos golpes aguenta antes de cambalear (sem isso, chutar sem parar travaria o inimigo)
const TIPOS = {
  guerreiro: {
    hp: 36, vel: 70, percepcao: 420, bloqueio: 0.35, postura: 2, aproximar: 58, cooldown: 1.3,
    ataques: [{ anim: "ataque", preparo: 0.5, ativo: 0.12, recuperar: 0.45, alcance: 72, dano: 18, distMax: 72,
      quadros: { preparo: [0, 1, 2], ativo: 3, recuperar: [4] } }],
  },
  lanceiro: {
    hp: 30, vel: 60, percepcao: 450, bloqueio: 0.2, postura: 2, aproximar: 74, cooldown: 1.5,
    ataques: [{ anim: "ataque", preparo: 0.6, ativo: 0.14, recuperar: 0.5, alcance: 92, dano: 20, distMax: 92,
      quadros: { preparo: [0, 1], ativo: 2, recuperar: [3] } }],
  },
  arqueiro: {
    hp: 18, vel: 55, percepcao: 520, postura: 1, distancia: 330, cooldown: 2.5,
    ataques: [{ anim: "ataque", preparo: 0.95, ativo: 0.05, recuperar: 0.5, distMax: 520, dano: 14,
      projetil: { tipo: "flecha", vel: 380 }, quadros: { preparo: intervalo(0, 8), ativo: 9, recuperar: intervalo(10, 14) } }],
  },
  mago_fogo: {
    hp: 24, vel: 50, percepcao: 520, postura: 1, distancia: 300, cooldown: 2.0,
    ataques: [
      // Jato de chamas: de perto, uma área quente na frente dele
      { anim: "chama", preparo: 0.45, ativo: 0.55, recuperar: 0.3, alcance: 110, dano: 16, distMax: 105,
        quadros: { preparo: [0, 1, 2, 3], ativo: intervalo(4, 11), recuperar: [12, 13] } },
      { anim: "ataque", preparo: 0.7, ativo: 0.05, recuperar: 0.45, distMax: 480, dano: 18,
        projetil: { tipo: "fogo", vel: 300, impacto: "explosao", escalaImpacto: 0.45 },
        quadros: { preparo: [0, 1, 2, 3, 4], ativo: 5, recuperar: [6, 7] } },
    ],
  },
  mago_raio: {
    hp: 22, vel: 50, percepcao: 540, postura: 1, distancia: 320, cooldown: 2.1,
    ataques: [
      // Raio do céu: marca o chão sob a jogadora e o raio cai pouco depois
      { anim: "raio", preparo: 0.5, ativo: 0.1, recuperar: 0.6, distMin: 140, distMax: 520, chance: 0.45, dano: 22,
        raioDoCeu: { aviso: 0.9 }, quadros: { preparo: [0, 1, 2, 3], ativo: 5, recuperar: intervalo(6, 11) } },
      { anim: "ataque", preparo: 0.55, ativo: 0.05, recuperar: 0.5, distMax: 500, dano: 16,
        projetil: { tipo: "raio", vel: 340, impacto: "azul", escalaImpacto: 0.35 },
        quadros: { preparo: [0, 1], ativo: 2, recuperar: [3, 4, 5, 6] } },
    ],
  },
  mago_errante: {
    hp: 18, vel: 65, percepcao: 520, postura: 1, distancia: 340, cooldown: 2.3, foge: true,
    ataques: [{ anim: "ataque", preparo: 0.5, ativo: 0.05, recuperar: 0.35, distMax: 520, dano: 12,
      projetil: { tipo: "magia", vel: 440, impacto: "oval", escalaImpacto: 0.3 },
      quadros: { preparo: [0, 1, 2], ativo: 3, recuperar: [4, 5] } }],
  },
};

export function novoInimigo(tipo, x, y) {
  const e = { tipo, x, y, vx: 0, w: 28, h: 60, dir: -1, hp: TIPOS[tipo].hp, hpMax: TIPOS[tipo].hp,
    estado: "parado", tEstado: 0, etapa: null, ataque: null, cd: 0, cdFuga: 0, flash: 0, golpesSofridos: 0,
    t: Math.random() * 5 };
  e.limites = trechoLivre(x, y);  // não atravessa obstáculos nem cai de plataformas
  e.ferir = (dano, px, py, critico) => ferirInimigo(e, dano, px, py, critico);
  return e;
}

const mudar = (e, novo) => { e.estado = novo; e.tEstado = 0; };
export const vivo = (e) => e.estado !== "morto";

function ferirInimigo(e, dano, px, py, critico = false) {
  const jogo = estado.jogo, tipo = TIPOS[e.tipo];
  if (!vivo(e)) return;
  // Escudo: de frente e fora do ataque, às vezes o esqueleto bloqueia (um golpe na cabeça passa por cima)
  const deFrente = Math.sign(jogo.jogador.x - e.x) === e.dir;
  if (!critico && deFrente && e.estado !== "ataque" && Math.random() < (tipo.bloqueio || 0)) {
    mudar(e, "defesa");
    particulas(px, py, "#fff2b0", 8, 200);
    texto(e.x, e.y - 74, "bloqueou", "#bbb");
    som("bloqueado", e.x);
    return;
  }
  jogo.hitstop = 0.03;
  e.hp -= dano; e.flash = 0.1;
  const mago = e.tipo.startsWith("mago");
  particulas(px, py, mago ? "#c43b3b" : "#d8d0bc", critico ? 18 : 8, critico ? 240 : 170);
  mostrarDano(e.x, e.y - 74, dano, critico);
  if (e.hp <= 0) {
    e.hp = 0; mudar(e, "morto");
    efeito("fumaca", e.x, e.y, { escala: 0.8, fps: 12 });
    som(mago ? "morte_mago" : "osso", e.x);
    return;
  }
  if (e.estado === "parado") mudar(e, "perseguir");  // atacado pelas costas: acorda
  // Postura: só cambaleia a cada N golpes (ou com um crítico); nos outros, aguenta e continua o que fazia
  if (critico || ++e.golpesSofridos >= tipo.postura) {
    e.golpesSofridos = 0;
    mudar(e, "ferido"); e.vx = -e.dir * 140;
  }
}

function escolherAtaque(tipo, dist) {
  return tipo.ataques.find((a) => dist >= (a.distMin || 0) && dist <= a.distMax && (!a.chance || Math.random() < a.chance)) || null;
}

function disparar(e, a) {
  const jogo = estado.jogo, j = jogo.jogador, p = a.projetil;
  const ox = e.x + e.dir * 26, oy = e.y - 40;
  // Mira no peito da jogadora (funciona com inimigos em plataformas)
  const dx = j.x - ox, dy = j.y - 34 - oy, d = Math.hypot(dx, dy) || 1;
  jogo.projeteis.push({ tipo: p.tipo, x: ox, y: oy, vx: (dx / d) * p.vel, vy: (dy / d) * p.vel, dano: a.dano, origem: e.tipo,
    impacto: p.impacto, escalaImpacto: p.escalaImpacto, vida: 3, t: 0 });
  som({ flecha: "flecha", fogo: "bola_fogo", raio: "magia", magia: "magia" }[p.tipo], e.x);
}

export function atualizarInimigos(dt) {
  const jogo = estado.jogo, j = jogo.jogador;
  for (const e of jogo.inimigos) {
    const tipo = TIPOS[e.tipo];
    e.t += dt; e.tEstado += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.cd > 0) e.cd -= dt;
    if (e.cdFuga > 0) e.cdFuga -= dt;
    const dx = j.x - e.x, dist = Math.abs(dx), alturaOk = Math.abs(j.y - e.y) < 260;

    switch (e.estado) {
      case "parado":
        e.vx = 0;
        if (dist < tipo.percepcao && alturaOk && j.estado !== "morto") mudar(e, "perseguir");
        break;

      case "perseguir": {
        e.dir = Math.sign(dx) || e.dir;
        if (j.estado === "morto") { e.vx = 0; break; }
        if (tipo.foge && dist < 120 && e.cdFuga <= 0) { mudar(e, "fugir"); e.cdFuga = 3; break; }
        if (tipo.distancia) {
          // Quem ataca de longe mantém distância
          if (dist < tipo.distancia - 90) e.vx = -e.dir * tipo.vel;
          else if (dist > tipo.distancia + 60) e.vx = e.dir * tipo.vel;
          else e.vx = 0;
        } else {
          e.vx = dist > tipo.aproximar ? e.dir * tipo.vel : 0;
        }
        let a = e.cd <= 0 && alturaOk ? escolherAtaque(tipo, dist) : null;
        // Corpo a corpo só se a jogadora estiver no trecho que ele alcança: um obstáculo entre os dois
        // protege dos dois lados (senão a lança passaria por cima da lápide e o chute não)
        const alcancavel = j.x > e.limites[0] - 30 && j.x < e.limites[1] + 30;
        if (a && a.alcance && !alcancavel) a = null;
        if (a) { mudar(e, "ataque"); e.etapa = "preparo"; e.ataque = a; e.vx = 0; }
        break;
      }

      case "fugir":
        // Mago errante: salta para longe da jogadora
        e.vx = -e.dir * 240;
        if (e.tEstado >= 0.55) mudar(e, "perseguir");
        break;

      case "ataque": {
        const a = e.ataque;
        e.vx = 0;
        if (e.etapa === "preparo" && e.tEstado >= a.preparo) {
          e.etapa = "ativo"; e.tEstado = 0; e.acertou = false;
          if (a.alcance) som("golpe_inimigo", e.x);
          if (a.projetil) disparar(e, a);
          if (a.raioDoCeu) {
            const alvoY = j.noChao ? j.y : pisoEm(j.x, j.y);
            jogo.raios.push({ x: j.x, y: alvoY, t: 0, aviso: a.raioDoCeu.aviso, dano: a.dano, caiu: false });
          }
        } else if (e.etapa === "ativo") {
          if (a.alcance && !e.acertou) {
            const area = { x1: e.dir > 0 ? e.x : e.x - a.alcance, x2: e.dir > 0 ? e.x + a.alcance : e.x, y1: e.y - 62, y2: e.y };
            if (sobrepoe(area, caixa(j)) && ferirJogadora(a.dano, e.tipo, e.dir)) e.acertou = true;
          }
          if (e.tEstado >= a.ativo) { e.etapa = "recuperar"; e.tEstado = 0; }
        } else if (e.etapa === "recuperar" && e.tEstado >= a.recuperar) {
          mudar(e, "perseguir");
          e.cd = tipo.cooldown * (0.7 + Math.random() * 0.6);
        }
        break;
      }

      case "ferido":
        e.vx *= 0.85;
        if (e.tEstado >= 0.32) mudar(e, "perseguir");
        break;

      case "defesa":
        e.vx = 0;
        if (e.tEstado >= 0.35) mudar(e, "perseguir");
        break;

      case "morto":
        e.vx = 0;
        break;
    }
    e.x = Math.max(e.limites[0], Math.min(e.limites[1], e.x + e.vx * dt));
  }
  separarInimigos();
  atualizarProjeteis(dt);
  atualizarRaios(dt);
}

// Inimigos no mesmo nível não se sobrepõem (senão três esqueletos viram um só encostados num obstáculo)
function separarInimigos() {
  const vivos = estado.jogo.inimigos.filter(vivo);
  for (let i = 0; i < vivos.length; i++) {
    for (let k = i + 1; k < vivos.length; k++) {
      const a = vivos[i], b = vivos[k];
      if (Math.abs(a.y - b.y) > 4) continue;
      const dx = b.x - a.x, minimo = 26;
      if (Math.abs(dx) >= minimo) continue;
      const empurrao = (minimo - Math.abs(dx)) / 2, lado = dx >= 0 ? 1 : -1;
      a.x = Math.max(a.limites[0], Math.min(a.limites[1], a.x - lado * empurrao));
      b.x = Math.max(b.limites[0], Math.min(b.limites[1], b.x + lado * empurrao));
    }
  }
}

function atualizarProjeteis(dt) {
  const jogo = estado.jogo, j = jogo.jogador;
  for (const f of jogo.projeteis) {
    f.x += f.vx * dt; f.y += f.vy * dt; f.vida -= dt; f.t += dt;
    const corpo = caixa(j);
    // Rolar (invencível) faz o tiro atravessar; pular por cima também funciona
    const acertouJogadora = f.x > corpo.x1 && f.x < corpo.x2 && f.y > corpo.y1 && f.y < corpo.y2 && !invulneravel(j);
    const bateuNoCenario = f.y >= pisoEm(f.x, f.y - 2) || jogo.blocos.some((b) => f.x > b.x1 && f.x < b.x2 && f.y > b.y1 && f.y < b.y2);
    if (acertouJogadora) ferirJogadora(f.dano, f.origem, Math.sign(f.vx));
    if (acertouJogadora || bateuNoCenario) {
      f.vida = 0;
      if (f.impacto) { efeito(f.impacto, f.x, f.y, { escala: f.escalaImpacto, fps: 24 }); som("explosao", f.x); }
    }
  }
  jogo.projeteis = jogo.projeteis.filter((f) => f.vida > 0);
}

function atualizarRaios(dt) {
  const jogo = estado.jogo, j = jogo.jogador;
  for (const r of jogo.raios) {
    r.t += dt;
    if (!r.caiu && r.t >= r.aviso) {
      r.caiu = true;
      efeito("raio", r.x, r.y, { escala: 1, fps: 28 });
      efeito("raio_chao", r.x, r.y - 6, { escala: 1.4, fps: 14 });
      jogo.tremor = Math.max(jogo.tremor, 6);
      som("raio", r.x);
      if (Math.abs(j.x - r.x) < 30 && Math.abs(j.y - r.y) < 40) ferirJogadora(r.dano, "raio", Math.sign(j.x - r.x) || 1);
    }
  }
  jogo.raios = jogo.raios.filter((r) => r.t < r.aviso + 0.6);
}

// ===================== Desenho =====================
function quadroInimigo(e) {
  const n = (anim) => nQuadros(e.tipo, anim);
  switch (e.estado) {
    case "ataque": {
      const a = e.ataque, q = a.quadros;
      if (e.etapa === "ativo") return [a.anim, Array.isArray(q.ativo) ? q.ativo[Math.min(q.ativo.length - 1, Math.floor((e.tEstado / a.ativo) * q.ativo.length))] : q.ativo];
      const lista = q[e.etapa], dur = e.etapa === "preparo" ? a.preparo : a.recuperar;
      return [a.anim, lista[Math.min(lista.length - 1, Math.floor((e.tEstado / dur) * lista.length))]];
    }
    case "fugir": return ["salto", Math.min(n("salto") - 1, Math.floor((e.tEstado / 0.55) * n("salto")))];
    case "ferido": return ["ferido", ciclo(e.tEstado, 8, n("ferido"))];
    case "defesa": return [TIPOS[e.tipo].bloqueio ? "defesa" : "ferido", 0];
    case "morto": return ["morte", Math.min(n("morte") - 1, Math.floor(e.tEstado * 8))];
    default:
      return Math.abs(e.vx) > 5 ? ["andar", ciclo(e.t, 10, n("andar"))] : ["parado", ciclo(e.t, 7, n("parado"))];
  }
}

export function desenharInimigos(ctx) {
  const jogo = estado.jogo;
  // Aviso do raio: um círculo no chão que fica mais forte até o raio cair
  for (const r of jogo.raios) {
    if (r.caiu) continue;
    const p = r.t / r.aviso;
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.5 * p;
    ctx.strokeStyle = "#8fd8ff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(r.x, r.y - 2, 34 - 12 * p, 7, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(143,216,255,0.25)"; ctx.fill();
    ctx.restore();
  }
  for (const e of jogo.inimigos) {
    const [anim, q] = quadroInimigo(e);
    const alpha = vivo(e) ? 1 : Math.max(0, 1 - Math.max(0, e.tEstado - 1.2) / 1.2);
    if (alpha <= 0) continue;
    desenharSprite(ctx, e.tipo, anim, q, e.x, e.y, { dir: e.dir, alpha, branco: e.flash > 0 ? 0.85 : 0 });
    // Barra de vida pequena depois do primeiro golpe
    if (vivo(e) && e.hp < e.hpMax) {
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(e.x - 21, e.y - 82, 42, 6);
      ctx.fillStyle = "#8b1a1a"; ctx.fillRect(e.x - 20, e.y - 81, 40 * (e.hp / e.hpMax), 4);
    }
  }
  for (const f of jogo.projeteis) desenharProjetil(ctx, f.tipo, f.t, f.x, f.y, Math.atan2(f.vy, f.vx));
}
