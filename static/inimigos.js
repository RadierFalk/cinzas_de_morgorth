// Esqueletos da fase (Craftpix Skeleton_Warrior/Spearman/Archer).
// Todos usam a mesma máquina de estados: parado → perseguir → ataque (preparo/ativo/recuperar),
// com "ferido" (atordoado) e "defesa" (bloqueio com escudo).
import { estado, CHAO, caixa, sobrepoe, particulas, texto } from "./nucleo.js";
import { ferirJogadora, invulneravel } from "./jogador.js";
import { desenharSprite, desenharFlecha, ciclo, nQuadros } from "./sprites.js";

// quadros: quais quadros da folha de ataque mostrar em cada etapa (o "ativo" é o do impacto)
// postura: quantos golpes aguenta antes de cambalear. Sem isso, chutar sem parar travaria o inimigo.
const TIPOS = {
  guerreiro: {
    hp: 36, vel: 70, alcance: 72, dano: 18, cooldown: 1.3, percepcao: 420, bloqueio: 0.35, postura: 2,
    ataque: { preparo: 0.5, ativo: 0.12, recuperar: 0.45, quadros: { preparo: [0, 1, 2], ativo: 3, recuperar: [4] } },
  },
  lanceiro: {
    hp: 30, vel: 60, alcance: 92, dano: 20, cooldown: 1.5, percepcao: 450, bloqueio: 0.2, postura: 2,
    ataque: { preparo: 0.6, ativo: 0.14, recuperar: 0.5, quadros: { preparo: [0, 1], ativo: 2, recuperar: [3] } },
  },
  arqueiro: {
    hp: 18, vel: 55, alcance: 520, dano: 14, cooldown: 2.2, percepcao: 520, bloqueio: 0, distancia: 330, postura: 1,
    ataque: { preparo: 0.95, ativo: 0.05, recuperar: 0.5, flecha: true,
      quadros: { preparo: [0, 1, 2, 3, 4, 5, 6, 7, 8], ativo: 9, recuperar: [10, 11, 12, 13, 14] } },
  },
};

export function novoInimigo(tipo, x) {
  const e = { tipo, x, y: CHAO, vx: 0, w: 28, h: 60, dir: -1, hp: TIPOS[tipo].hp, hpMax: TIPOS[tipo].hp,
    estado: "parado", tEstado: 0, etapa: null, cd: 0, flash: 0, golpesSofridos: 0, t: Math.random() * 5 };
  e.ferir = (dano, px, py) => ferirInimigo(e, dano, px, py);
  return e;
}

const mudar = (e, novo) => { e.estado = novo; e.tEstado = 0; };
export const vivo = (e) => e.estado !== "morto";

function ferirInimigo(e, dano, px, py) {
  const jogo = estado.jogo, tipo = TIPOS[e.tipo];
  if (!vivo(e)) return;
  // Escudo: de frente e fora do ataque, às vezes o esqueleto bloqueia
  const deFrente = Math.sign(jogo.jogador.x - e.x) === e.dir;
  if (deFrente && e.estado !== "ataque" && Math.random() < tipo.bloqueio) {
    mudar(e, "defesa");
    particulas(px, py, "#fff2b0", 8, 200);
    texto(e.x, e.y - 74, "bloqueou", "#bbb");
    return;
  }
  e.hp -= dano; e.flash = 0.1;
  jogo.hitstop = 0.03;
  particulas(px, py, "#d8d0bc", 8, 170);
  texto(e.x, e.y - 74, `${dano}`, "#f5e6c8");
  if (e.hp <= 0) { e.hp = 0; mudar(e, "morto"); particulas(e.x, e.y - 30, "#d8d0bc", 16, 220); return; }
  if (e.estado === "parado") mudar(e, "perseguir");  // atacado pelas costas: acorda
  // Postura: só cambaleia a cada N golpes; nos outros, aguenta e continua o que estava fazendo
  if (++e.golpesSofridos >= tipo.postura) {
    e.golpesSofridos = 0;
    mudar(e, "ferido"); e.vx = -e.dir * 140;
  }
}

export function atualizarInimigos(dt) {
  const jogo = estado.jogo, j = jogo.jogador;
  for (const e of jogo.inimigos) {
    const tipo = TIPOS[e.tipo], a = tipo.ataque;
    e.t += dt; e.tEstado += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.cd > 0) e.cd -= dt;
    const dx = j.x - e.x, dist = Math.abs(dx);

    switch (e.estado) {
      case "parado":
        e.vx = 0;
        if (dist < tipo.percepcao && j.estado !== "morto") mudar(e, "perseguir");
        break;

      case "perseguir":
        e.dir = Math.sign(dx) || e.dir;
        if (j.estado === "morto") { e.vx = 0; break; }
        if (tipo.distancia) {
          // Arqueiro: mantém distância e atira
          if (dist < tipo.distancia - 90) e.vx = -e.dir * tipo.vel;
          else if (dist > tipo.alcance) e.vx = e.dir * tipo.vel;
          else e.vx = 0;
        } else {
          e.vx = dist > tipo.alcance * 0.8 ? e.dir * tipo.vel : 0;
        }
        if (dist <= tipo.alcance && e.cd <= 0) { mudar(e, "ataque"); e.etapa = "preparo"; e.vx = 0; }
        break;

      case "ataque":
        e.vx = 0;
        if (e.etapa === "preparo" && e.tEstado >= a.preparo) {
          e.etapa = "ativo"; e.tEstado = 0; e.acertou = false;
          if (a.flecha) jogo.projeteis.push({ x: e.x + e.dir * 30, y: CHAO - 40, dir: e.dir, vida: 2.5 });
        } else if (e.etapa === "ativo") {
          if (!a.flecha && !e.acertou) {
            const area = { x1: e.dir > 0 ? e.x : e.x - tipo.alcance, x2: e.dir > 0 ? e.x + tipo.alcance : e.x, y1: CHAO - 60, y2: CHAO };
            if (sobrepoe(area, caixa(j)) && ferirJogadora(tipo.dano, e.tipo, e.dir)) e.acertou = true;
          }
          if (e.tEstado >= a.ativo) { e.etapa = "recuperar"; e.tEstado = 0; }
        } else if (e.etapa === "recuperar" && e.tEstado >= a.recuperar) {
          mudar(e, "perseguir");
          e.cd = tipo.cooldown * (0.7 + Math.random() * 0.6);
        }
        break;

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
    e.x = Math.max(20, Math.min(jogo.mundoW - 20, e.x + e.vx * dt));
  }

  // Flechas: dá para rolar através delas ou pular por cima
  for (const f of jogo.projeteis) {
    f.x += f.dir * 420 * dt; f.vida -= dt;
    const corpo = caixa(j);
    if (!f.acertou && f.x > corpo.x1 && f.x < corpo.x2 && f.y > corpo.y1 && f.y < corpo.y2 && !invulneravel(j)) {
      ferirJogadora(TIPOS.arqueiro.dano, "flecha", f.dir);
      f.acertou = true;
    }
  }
  jogo.projeteis = jogo.projeteis.filter((f) => f.vida > 0 && !f.acertou);
}

function quadroInimigo(e) {
  const tipo = TIPOS[e.tipo], a = tipo.ataque, n = (anim) => nQuadros(e.tipo, anim);
  switch (e.estado) {
    case "ataque": {
      if (e.etapa === "ativo") return ["ataque", a.quadros.ativo];
      const lista = a.quadros[e.etapa], dur = e.etapa === "preparo" ? a.preparo : a.recuperar;
      return ["ataque", lista[Math.min(lista.length - 1, Math.floor((e.tEstado / dur) * lista.length))]];
    }
    case "ferido": return ["ferido", ciclo(e.tEstado, 8, n("ferido"))];
    case "defesa": return [tipo.bloqueio ? "defesa" : "ferido", 0];
    case "morto": return ["morte", Math.min(n("morte") - 1, Math.floor(e.tEstado * 8))];
    default:
      return Math.abs(e.vx) > 5 ? ["andar", ciclo(e.t, 10, n("andar"))] : ["parado", ciclo(e.t, 7, n("parado"))];
  }
}

export function desenharInimigos(ctx) {
  const jogo = estado.jogo;
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
  for (const f of jogo.projeteis) desenharFlecha(ctx, f.x, f.y, f.dir);
}
