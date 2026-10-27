// Inimigos comuns das fases: esqueletos (Skeleton_*), magos (wizard_enemy), criaturas (Creatures Pack)
// e o ArchDemon voador. Todos usam a mesma máquina de estados:
//   (escondido → surgindo) → parado → perseguir → ataque (preparo/ativo/recuperar),
//   com "ferido" (cambaleia), "defesa" (escudo), "fugir" (mago errante) e "morto".
// Derrotar um inimigo dá ALMAS (a moeda para subir de nível e comprar) e às vezes deixa cair um item.
import { estado, caixa, sobrepoe, particulas, texto } from "./nucleo.js";
import { ferirJogadora, invulneravel } from "./jogador.js";
import { desenharSprite, desenharProjetil, ciclo, nQuadros, temAnim } from "./sprites.js";
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
//   alcance (corpo a corpo) | projetil (tiro mirado) | raioDoCeu (cai onde a jogadora está) | bote (avança no golpe)
// postura: quantos golpes aguenta antes de cambalear (sem isso, atacar sem parar travaria o inimigo)
// almas: quanto paga ao morrer · surge: começa escondido e aparece quando a jogadora chega perto · voa: ArchDemon
const TIPOS = {
  guerreiro: {
    hp: 36, vel: 70, percepcao: 420, bloqueio: 0.35, postura: 2, aproximar: 58, cooldown: 1.3, almas: 30,
    ataques: [{ anim: "ataque", preparo: 0.5, ativo: 0.12, recuperar: 0.45, alcance: 72, dano: 18, distMax: 72,
      quadros: { preparo: [0, 1, 2], ativo: 3, recuperar: [4] } }],
  },
  lanceiro: {
    hp: 30, vel: 60, percepcao: 450, bloqueio: 0.2, postura: 2, aproximar: 74, cooldown: 1.5, almas: 35,
    ataques: [{ anim: "ataque", preparo: 0.6, ativo: 0.14, recuperar: 0.5, alcance: 92, dano: 20, distMax: 92,
      quadros: { preparo: [0, 1], ativo: 2, recuperar: [3] } }],
  },
  arqueiro: {
    hp: 18, vel: 55, percepcao: 520, postura: 1, distancia: 330, cooldown: 2.5, almas: 30,
    ataques: [{ anim: "ataque", preparo: 0.95, ativo: 0.05, recuperar: 0.5, distMax: 520, dano: 14,
      projetil: { tipo: "flecha", vel: 380 }, quadros: { preparo: intervalo(0, 8), ativo: 9, recuperar: intervalo(10, 14) } }],
  },
  mago_fogo: {
    hp: 24, vel: 50, percepcao: 520, postura: 1, distancia: 300, cooldown: 2.0, almas: 45,
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
    hp: 22, vel: 50, percepcao: 540, postura: 1, distancia: 320, cooldown: 2.1, almas: 45,
    ataques: [
      // Raio do céu: marca o chão sob a jogadora e o raio cai pouco depois (o escudo não segura)
      { anim: "raio", preparo: 0.5, ativo: 0.1, recuperar: 0.6, distMin: 140, distMax: 520, chance: 0.45, dano: 22,
        raioDoCeu: { aviso: 0.9 }, quadros: { preparo: [0, 1, 2, 3], ativo: 5, recuperar: intervalo(6, 11) } },
      { anim: "ataque", preparo: 0.55, ativo: 0.05, recuperar: 0.5, distMax: 500, dano: 16,
        projetil: { tipo: "raio", vel: 340, impacto: "azul", escalaImpacto: 0.35 },
        quadros: { preparo: [0, 1], ativo: 2, recuperar: [3, 4, 5, 6] } },
    ],
  },
  mago_errante: {
    hp: 18, vel: 65, percepcao: 520, postura: 1, distancia: 340, cooldown: 2.3, foge: true, almas: 40,
    ataques: [{ anim: "ataque", preparo: 0.5, ativo: 0.05, recuperar: 0.35, distMax: 520, dano: 12,
      projetil: { tipo: "magia", vel: 440, impacto: "oval", escalaImpacto: 0.3 },
      quadros: { preparo: [0, 1, 2], ativo: 3, recuperar: [4, 5] } }],
  },
  // Criaturas: pequenas, rápidas, surgem de um portal quando a jogadora chega perto
  diabrete: {
    hp: 14, vel: 125, percepcao: 320, postura: 1, aproximar: 34, cooldown: 0.9, almas: 18, surge: true, w: 22, h: 40,
    ataques: [{ anim: "ataque", preparo: 0.3, ativo: 0.12, recuperar: 0.3, alcance: 44, dano: 10, distMax: 44,
      quadros: { preparo: [0, 1], ativo: 2, recuperar: [3] } }],
  },
  lobo_sombrio: {
    hp: 26, vel: 150, percepcao: 380, postura: 1, aproximar: 42, cooldown: 1.1, almas: 28, surge: true, w: 40, h: 42,
    ataques: [{ anim: "ataque", preparo: 0.35, ativo: 0.2, recuperar: 0.35, alcance: 56, dano: 16, distMax: 70, bote: 280,
      quadros: { preparo: [0, 1], ativo: 2, recuperar: [3] } }],
  },
  demonio_rubro: {
    hp: 34, vel: 80, percepcao: 360, postura: 2, aproximar: 50, cooldown: 1.2, almas: 40, surge: true, w: 30, h: 46,
    ataques: [{ anim: "ataque", preparo: 0.45, ativo: 0.14, recuperar: 0.4, alcance: 62, dano: 20, distMax: 62,
      quadros: { preparo: [0, 1], ativo: 2, recuperar: [3] } }],
  },
  // ArchDemon: voa a ~90 px do chão, de lado, e dispara esferas sombrias. Alcance com pulo + mergulho, bomba ou cajado
  archdemon: {
    hp: 44, vel: 120, percepcao: 560, postura: 2, cooldown: 2.2, almas: 90, voa: true, w: 40, h: 58,
    ataques: [{ anim: "ataque", preparo: 0.6, ativo: 0.05, recuperar: 0.6, distMax: 540, dano: 18,
      projetil: { tipo: "sombra", vel: 300, impacto: "gas", escalaImpacto: 0.3 },
      quadros: { preparo: intervalo(0, 6), ativo: 7, recuperar: intervalo(8, 19) } }],
  },
};

const DROPS = [["erva", 0.12], ["bomba", 0.05]];  // chance de deixar cair cada item

export function novoInimigo(tipo, x, y) {
  const t = TIPOS[tipo], hp = Math.round(t.hp * (estado.jogo.dificuldade?.vida || 1));  // mais vida a cada ciclo
  const e = { tipo, x, y, vx: 0, vy: 0, w: t.w || 28, h: t.h || 60, dir: -1, hp, hpMax: hp,
    estado: t.surge ? "escondido" : "parado", tEstado: 0, etapa: null, ataque: null, cd: 0, cdFuga: 0, flash: 0,
    golpesSofridos: 0, queimando: 0, tickQueima: 0, t: Math.random() * 5, origemX: x };
  if (t.voa) { e.y = y - 90; e.limites = [x - 600, x + 600]; }
  else e.limites = trechoLivre(x, y);  // não atravessa obstáculos nem cai de plataformas
  e.ferir = (dano, px, py, opts) => ferirInimigo(e, dano, px, py, opts);
  return e;
}

const mudar = (e, novo) => { e.estado = novo; e.tEstado = 0; };
export const vivo = (e) => e.estado !== "morto";
/** Pode ser atingido? (escondidos e surgindo ainda não) */
export const alvejavel = (e) => vivo(e) && e.estado !== "escondido" && e.estado !== "surgindo";

function ferirInimigo(e, dano, px, py, { critico = false, postura = 1, queima = false } = {}) {
  const jogo = estado.jogo, tipo = TIPOS[e.tipo];
  if (!alvejavel(e)) return;
  // Escudo: de frente e fora do ataque, às vezes o esqueleto bloqueia (um golpe na cabeça passa por cima)
  const deFrente = Math.sign(jogo.jogador.x - e.x) === e.dir;
  if (!critico && deFrente && e.estado !== "ataque" && Math.random() < (tipo.bloqueio || 0)) {
    mudar(e, "defesa");
    particulas(px, py, "#fff2b0", 8, 200);
    texto(e.x, e.y - 74, "bloqueou", "#bbb");
    som("bloqueado", e.x);
    return;
  }
  jogo.hitstop = Math.max(jogo.hitstop, 0.03);
  aplicarDano(e, dano, px, py, critico);
  if (queima && vivo(e)) e.queimando = 2;
  if (!vivo(e)) return;
  if (e.estado === "parado") mudar(e, "perseguir");  // atacado pelas costas: acorda
  // Postura: só cambaleia a cada N golpes (ou com um crítico); armas pesadas contam mais
  e.golpesSofridos += postura;
  if (critico || e.golpesSofridos >= tipo.postura) {
    e.golpesSofridos = 0;
    mudar(e, "ferido"); e.vx = -e.dir * 140;
  }
}

function aplicarDano(e, dano, px, py, critico) {
  e.hp -= dano; e.flash = 0.1;
  const sangue = e.tipo.startsWith("mago") || TIPOS[e.tipo].surge || TIPOS[e.tipo].voa;
  particulas(px, py, sangue ? "#c43b3b" : "#d8d0bc", critico ? 18 : 8, critico ? 240 : 170);
  mostrarDano(e.x, e.y - e.h - 14, dano, critico);
  if (e.hp <= 0) morrer(e);
}

function morrer(e) {
  const jogo = estado.jogo, tipo = TIPOS[e.tipo];
  e.hp = 0; mudar(e, "morto"); e.queimando = 0;
  if (!tipo.surge) efeito("fumaca", e.x, e.y, { escala: 0.8, fps: 12 });
  som(["guerreiro", "lanceiro", "arqueiro"].includes(e.tipo) ? "osso" : "morte_mago", e.x);
  // Almas (mais a cada ciclo) e, às vezes, um item
  const almas = Math.round(tipo.almas * (jogo.dificuldade?.almas || 1));
  jogo.almasGanhas = (jogo.almasGanhas || 0) + almas;
  texto(e.x, e.y - e.h - 34, `+${almas} almas`, "#8fe3ff", 14);
  som("almas", e.x);
  for (const [item, chance] of DROPS) {
    if (Math.random() < chance) { jogo.itensNoChao.push({ item, x: e.x, y: tipo.voa ? pisoEm(e.x, e.y) : e.y, t: 0 }); break; }
  }
}

function escolherAtaque(tipo, dist) {
  return tipo.ataques.find((a) => dist >= (a.distMin || 0) && dist <= a.distMax && (!a.chance || Math.random() < a.chance)) || null;
}

function disparar(e, a) {
  const jogo = estado.jogo, j = jogo.jogador, p = a.projetil;
  const ox = e.x + e.dir * 26, oy = e.y - (TIPOS[e.tipo].voa ? 30 : 40);
  // Mira no peito da jogadora (funciona com inimigos em plataformas e voando)
  const dx = j.x - ox, dy = j.y - 34 - oy, d = Math.hypot(dx, dy) || 1;
  jogo.projeteis.push({ tipo: p.tipo, x: ox, y: oy, vx: (dx / d) * p.vel, vy: (dy / d) * p.vel, dano: a.dano, origem: e.tipo,
    impacto: p.impacto, escalaImpacto: p.escalaImpacto, vida: 3, t: 0 });
  som({ flecha: "flecha", fogo: "bola_fogo", raio: "magia", magia: "magia", sombra: "magia" }[p.tipo], e.x);
}

export function atualizarInimigos(dt) {
  const jogo = estado.jogo, j = jogo.jogador;
  for (const e of jogo.inimigos) {
    const tipo = TIPOS[e.tipo];
    e.t += dt; e.tEstado += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.cd > 0) e.cd -= dt;
    if (e.cdFuga > 0) e.cdFuga -= dt;
    // Queimando (lâmina flamejante / resina): 3 de dano a cada meio segundo
    if (e.queimando > 0 && vivo(e)) {
      e.queimando -= dt;
      if (Math.random() < 0.4) particulas(e.x + (Math.random() - 0.5) * e.w, e.y - Math.random() * e.h, "#ff8a2a", 1, 50);
      if ((e.tickQueima -= dt) <= 0) { e.tickQueima = 0.5; aplicarDano(e, 3, e.x, e.y - e.h / 2, false); }
    }
    const dx = j.x - e.x, dist = Math.abs(dx), alturaOk = Math.abs(j.y - e.y) < (tipo.voa ? 320 : 260);

    switch (e.estado) {
      case "escondido":
        e.vx = 0;
        if (dist < tipo.percepcao && alturaOk && j.estado !== "morto") {
          mudar(e, "surgindo"); e.dir = Math.sign(dx) || e.dir;
          efeito("gas", e.x, e.y - 20, { escala: 0.25, fps: 22 });
          som("magia", e.x);
        }
        break;

      case "surgindo":
        if (e.tEstado >= 0.6) mudar(e, "perseguir");
        break;

      case "parado":
        e.vx = 0;
        if (dist < tipo.percepcao && alturaOk && j.estado !== "morto") mudar(e, "perseguir");
        break;

      case "perseguir": {
        e.dir = Math.sign(dx) || e.dir;
        if (j.estado === "morto") { e.vx = 0; break; }
        if (tipo.foge && dist < 120 && e.cdFuga <= 0) { mudar(e, "fugir"); e.cdFuga = 3; break; }
        if (tipo.voa) voar(e, j, dt);
        else if (tipo.distancia) {
          // Quem ataca de longe mantém distância
          if (dist < tipo.distancia - 90) e.vx = -e.dir * tipo.vel;
          else if (dist > tipo.distancia + 60) e.vx = e.dir * tipo.vel;
          else e.vx = 0;
        } else {
          e.vx = dist > tipo.aproximar ? e.dir * tipo.vel : 0;
        }
        let a = e.cd <= 0 && alturaOk ? escolherAtaque(tipo, dist) : null;
        // Corpo a corpo só se a jogadora estiver no trecho que ele alcança: um obstáculo entre os dois
        // protege dos dois lados (senão a lança passaria por cima da lápide e o golpe dela não)
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
        if (tipo.voa) { e.vy *= 0.9; e.y += e.vy * dt; }
        if (e.etapa === "preparo" && e.tEstado >= a.preparo) {
          e.etapa = "ativo"; e.tEstado = 0; e.acertou = false;
          if (a.alcance) som("golpe_inimigo", e.x);
          if (a.projetil) disparar(e, a);
          if (a.raioDoCeu) {
            const alvoY = j.noChao ? j.y : pisoEm(j.x, j.y);
            jogo.raios.push({ x: j.x, y: alvoY, t: 0, aviso: a.raioDoCeu.aviso, dano: a.dano, caiu: false });
          }
        } else if (e.etapa === "ativo") {
          if (a.bote) e.vx = e.dir * a.bote;  // lobo: avança no golpe
          if (a.alcance && !e.acertou) {
            const area = { x1: e.dir > 0 ? e.x : e.x - a.alcance, x2: e.dir > 0 ? e.x + a.alcance : e.x, y1: e.y - Math.max(e.h, 62), y2: e.y };
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
        if (tipo.voa) {
          // Cai até o chão
          const chao = pisoEm(e.x, e.y);
          e.vy += 900 * dt; e.y = Math.min(chao, e.y + e.vy * dt);
        }
        break;
    }
    e.x = Math.max(e.limites[0], Math.min(e.limites[1], e.x + e.vx * dt));
  }
  separarInimigos();
  atualizarProjeteis(dt);
  atualizarRaios(dt);
}

// ArchDemon: fica de lado em relação à jogadora, ~90 px acima do chão, balançando no ar
function voar(e, j, dt) {
  const alvoX = j.x - e.dir * 200, chao = pisoEm(j.x, j.y - 10);
  const alvoY = Math.min(chao, j.y) - 90 + Math.sin(e.t * 2.4) * 14;
  e.vx = Math.max(-TIPOS[e.tipo].vel, Math.min(TIPOS[e.tipo].vel, (alvoX - e.x) * 1.6));
  e.vy = (alvoY - e.y) * 2.2;
  e.y += e.vy * dt;
}

// Inimigos no mesmo nível não se sobrepõem (senão três esqueletos viram um só encostados num obstáculo)
function separarInimigos() {
  const vivos = estado.jogo.inimigos.filter(alvejavel);
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
    // Rolar (invencível) faz o tiro atravessar; pular por cima também funciona; o escudo segura
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
      if (Math.abs(j.x - r.x) < 30 && Math.abs(j.y - r.y) < 40) ferirJogadora(r.dano, "raio", Math.sign(j.x - r.x) || 1, { inbloqueavel: true });
    }
  }
  jogo.raios = jogo.raios.filter((r) => r.t < r.aviso + 0.6);
}

// ===================== Desenho =====================
function quadroInimigo(e) {
  const n = (anim) => nQuadros(e.tipo, anim);
  switch (e.estado) {
    case "surgindo": return ["surgir", Math.min(6, Math.floor((e.tEstado / 0.6) * 7))];
    case "ataque": {
      const a = e.ataque, q = a.quadros;
      if (e.etapa === "ativo") return [a.anim, Array.isArray(q.ativo) ? q.ativo[Math.min(q.ativo.length - 1, Math.floor((e.tEstado / a.ativo) * q.ativo.length))] : q.ativo];
      const lista = q[e.etapa], dur = e.etapa === "preparo" ? a.preparo : a.recuperar;
      return [a.anim, lista[Math.min(lista.length - 1, Math.floor((e.tEstado / dur) * lista.length))]];
    }
    case "fugir": return ["salto", Math.min(n("salto") - 1, Math.floor((e.tEstado / 0.55) * n("salto")))];
    case "ferido": return ["ferido", ciclo(e.tEstado, 8, n("ferido"))];
    case "defesa": return [TIPOS[e.tipo].bloqueio ? "defesa" : "ferido", 0];
    case "morto": return ["morte", Math.min(n("morte") - 1, Math.floor(e.tEstado * (TIPOS[e.tipo].surge ? 12 : 8)))];
    default: {
      // Quem não tem animação de andar (criaturas, ArchDemon) usa a parada
      const andando = Math.abs(e.vx) > 5 && temAnim(e.tipo, "andar");
      return andando ? ["andar", ciclo(e.t, 10, n("andar"))] : ["parado", ciclo(e.t, 7, n("parado"))];
    }
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
    if (e.estado === "escondido") continue;
    const [anim, q] = quadroInimigo(e);
    const fim = TIPOS[e.tipo].surge ? 0.6 : 1.2;  // criaturas somem rápido; os outros ficam um pouco no chão
    const alpha = vivo(e) ? 1 : Math.max(0, 1 - Math.max(0, e.tEstado - fim) / 1.2);
    if (alpha <= 0) continue;
    desenharSprite(ctx, e.tipo, anim, q, e.x, e.y, { dir: e.dir, alpha, branco: e.flash > 0 ? 0.85 : 0, vermelho: e.queimando > 0 ? 0.25 : 0 });
    // Barra de vida pequena depois do primeiro golpe
    if (vivo(e) && e.hp < e.hpMax) {
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(e.x - 21, e.y - e.h - 22, 42, 6);
      ctx.fillStyle = "#8b1a1a"; ctx.fillRect(e.x - 20, e.y - e.h - 21, 40 * (e.hp / e.hpMax), 4);
    }
  }
  for (const f of jogo.projeteis) {
    if (f.tipo === "sombra") {
      // Esfera sombria do ArchDemon
      const g = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, 13);
      g.addColorStop(0, "rgba(255,210,255,1)"); g.addColorStop(0.45, "rgba(150,60,200,0.9)"); g.addColorStop(1, "rgba(60,0,90,0)");
      ctx.fillStyle = g; ctx.fillRect(f.x - 13, f.y - 13, 26, 26);
    } else desenharProjetil(ctx, f.tipo, f.t, f.x, f.y, Math.atan2(f.vy, f.vx));
  }
}
