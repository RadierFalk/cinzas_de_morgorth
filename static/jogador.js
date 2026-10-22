// A jogadora (sprite Girl_2): movimento, esquiva, chute, cura e dano recebido.
import { estado, consumir, segurando, CHAO, caixa, sobrepoe, particulas, texto } from "./nucleo.js";
import { desenharSprite, ciclo } from "./sprites.js";

export const P = {
  vel: 230, pulo: 560, grav: 1500,
  rolarVel: 430, rolarDur: 0.42, iframes: [0.04, 0.34],
  ataqueDur: 0.42, ataqueAtivo: [0.12, 0.22], dano: 9, alcance: 66,
  curarDur: 1.1, curarMomento: 0.65, curaQtd: 45,
  custoAtaque: 18, custoRolar: 24, custoPulo: 8, regenEst: 42,
};

export function novaJogadora(x) {
  return {
    x, y: CHAO, vx: 0, vy: 0, w: 24, h: 64, dir: 1, noChao: true,
    hp: 100, hpMax: 100, hpFantasma: 100, est: 100, estMax: 100, estDelay: 0, frascos: 3,
    estado: "livre", tEstado: 0, invul: 0,
  };
}

const gastar = (j, custo) => { j.est = Math.max(0, j.est - custo); j.estDelay = 0.55; };
const mudar = (j, novo) => { j.estado = novo; j.tEstado = 0; };

export function invulneravel(j) {
  return j.invul > 0 || j.estado === "morto" ||
    (j.estado === "rolar" && j.tEstado >= P.iframes[0] && j.tEstado <= P.iframes[1]);
}

export function atualizarJogadora(dt) {
  const jogo = estado.jogo, j = jogo.jogador;
  j.tEstado += dt;
  if (j.invul > 0) j.invul -= dt;
  const mover = (segurando.has("direita") ? 1 : 0) - (segurando.has("esquerda") ? 1 : 0);

  switch (j.estado) {
    case "livre":
      j.vx = mover * P.vel;
      if (mover) j.dir = mover;
      if (j.noChao && j.est > 0 && consumir("esquivar")) {
        const dir = mover || j.dir;
        mudar(j, "rolar"); j.rolarDir = dir; j.dir = dir; gastar(j, P.custoRolar);
        const b = jogo.boss;  // só a luta contra o chefão registra a direção das esquivas
        if (b) {
          const lado = Math.sign(b.x - j.x) === dir ? "para_frente" : "para_tras";
          jogo.log.esquivas[lado]++;
          if (b.golpe) b.golpe.rolagens.push(lado);
        }
      } else if (j.est > 0 && consumir("atacar")) {
        mudar(j, "ataque"); j.acertou = false; j.contou = false; gastar(j, P.custoAtaque);
      } else if (j.noChao && consumir("curar")) {
        if (j.frascos > 0) {
          mudar(j, "curar"); j.curou = false; j.frascos--;
          jogo.log.curas_hp_antes.push(Math.round(j.hp));
        } else {
          jogo.log.tentou_curar_sem_frasco++;
          texto(j.x, j.y - 80, "Sem frascos", "#999");
        }
      } else if (j.noChao && j.est > 0 && consumir("pular")) {
        j.vy = -P.pulo; j.noChao = false; gastar(j, P.custoPulo); jogo.log.pulos++;
      }
      break;

    case "rolar":
      j.vx = j.rolarDir * P.rolarVel * (1 - 0.45 * (j.tEstado / P.rolarDur));
      if (j.tEstado >= P.rolarDur) mudar(j, "livre");
      break;

    case "ataque": {
      j.vx = j.tEstado < 0.1 ? j.dir * 90 : 0;
      const [ini, fim] = P.ataqueAtivo;
      if (!j.acertou && j.tEstado >= ini && j.tEstado <= fim) {
        const golpe = { x1: j.dir > 0 ? j.x : j.x - P.alcance, x2: j.dir > 0 ? j.x + P.alcance : j.x, y1: j.y - 56, y2: j.y - 4 };
        for (const alvo of jogo.alvos()) {
          if (sobrepoe(golpe, caixa(alvo))) { j.acertou = true; alvo.ferir(P.dano, j.x + j.dir * 40, j.y - 34); }
        }
      }
      if (!j.contou && j.tEstado > fim) { j.contou = true; jogo.log.ataques[j.acertou ? "acertos" : "erros"]++; }
      if (j.tEstado >= P.ataqueDur) mudar(j, "livre");
      break;
    }

    case "curar":
      j.vx = mover * 50;
      if (!j.curou && j.tEstado >= P.curarMomento) {
        j.curou = true;
        j.hp = Math.min(j.hpMax, j.hp + P.curaQtd);
        particulas(j.x, j.y - 34, "#e8c35a", 18, 120);
      }
      if (j.tEstado >= P.curarDur) mudar(j, "livre");
      break;

    case "atingido":
      j.vx *= 0.9;
      if (j.tEstado >= 0.38) mudar(j, "livre");
      break;

    case "morto":
      j.vx *= 0.9;
      break;
  }

  // Física
  j.vy += P.grav * dt;
  j.x += j.vx * dt;
  j.y += j.vy * dt;
  if (j.y >= CHAO) { j.y = CHAO; j.vy = 0; j.noChao = true; } else j.noChao = false;

  // Fôlego (stamina)
  if (j.estDelay > 0) j.estDelay -= dt;
  else if (j.estado !== "rolar" && j.estado !== "ataque") j.est = Math.min(j.estMax, j.est + P.regenEst * dt);
  j.hpFantasma = Math.max(j.hp, j.hpFantasma - 30 * dt);
}

export function ferirJogadora(dano, origem, empurrao) {
  const jogo = estado.jogo, j = jogo.jogador;
  if (invulneravel(j)) return false;
  if (j.estado === "curar" && !j.curou) jogo.log.curas_punidas++;
  j.hp -= dano;
  jogo.log.dano_recebido[origem] = (jogo.log.dano_recebido[origem] || 0) + dano;
  mudar(j, "atingido");
  j.vx = empurrao * 260; j.vy = -220; j.invul = 0.45;
  jogo.tremor = 10; jogo.hitstop = 0.08;
  particulas(j.x, j.y - 34, "#c0392b", 14);
  texto(j.x, j.y - 80, `-${dano}`, "#e74c3c");
  if (j.hp <= 0) {
    j.hp = 0; mudar(j, "morto");
    jogo.log.golpe_final = origem;
    jogo.terminar("morte");
  }
  return true;
}

// Quadros da folha Attack (chute): 3-5 preparo, 6 = perna esticada (o momento do dano), 7-8 retorno
function quadroDoChute(t) {
  const [ini, fim] = P.ataqueAtivo;
  if (t < ini) return 3 + Math.floor((t / ini) * 3);
  if (t <= fim) return 6;
  return Math.min(8, 7 + Math.floor((t - fim) / 0.1));
}

export function desenharJogadora(ctx, j, t) {
  let anim = "parado", q = ciclo(t, 7, 7), rot = 0, alpha = 1, vermelho = 0;
  switch (j.estado) {
    case "livre":
      if (!j.noChao) { anim = "ataque"; q = 4; }                      // joelho erguido = pose de pulo
      else if (Math.abs(j.vx) > 10) { anim = "andar"; q = ciclo(t, 16, 12); }
      break;
    case "rolar": {
      // Não há animação de rolagem na folha: a corrida girando + rastro fazem o papel
      anim = "andar"; q = ciclo(t, 30, 12);
      rot = (j.tEstado / P.rolarDur) * Math.PI * 2 * j.rolarDir;
      for (let i = 1; i <= 2; i++) {
        desenharSprite(ctx, "garota", anim, q, j.x - j.vx * 0.03 * i, j.y, { dir: j.dir, rot: rot - 0.5 * i * j.rolarDir, alpha: 0.25 / i });
      }
      break;
    }
    case "ataque": anim = "ataque"; q = quadroDoChute(j.tEstado); break;
    case "curar": anim = "falar"; q = ciclo(j.tEstado, 8, 6); break;
    case "atingido": anim = "defesa"; q = 0; vermelho = Math.max(0, 1 - j.tEstado / 0.3); break;
    case "morto":
      anim = "defesa"; q = 1;
      rot = -j.dir * Math.min(1, j.tEstado * 2) * (Math.PI / 2);
      alpha = Math.max(0.35, 1 - j.tEstado * 0.3);
      break;
  }
  if (j.invul > 0 && j.estado !== "morto" && j.estado !== "atingido" && Math.floor(t * 20) % 2) alpha *= 0.45;
  desenharSprite(ctx, "garota", anim, q, j.x, j.y, { dir: j.dir, rot, alpha, vermelho });

  // Brilho dourado do frasco
  if (j.estado === "curar") {
    ctx.save();
    ctx.fillStyle = "#e8c35a"; ctx.shadowColor = "#e8c35a"; ctx.shadowBlur = 16;
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 12);
    ctx.beginPath(); ctx.arc(j.x + j.dir * 6, j.y - 44, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Rastro do chute
  if (j.estado === "ataque" && j.tEstado >= P.ataqueAtivo[0] && j.tEstado <= P.ataqueAtivo[1] + 0.05) {
    ctx.save();
    ctx.strokeStyle = "rgba(245,240,225,0.6)"; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(j.x + j.dir * 10, j.y - 34, 46, j.dir > 0 ? -0.9 : Math.PI - 0.6, j.dir > 0 ? 0.6 : Math.PI + 0.9);
    ctx.stroke();
    ctx.restore();
  }
}
