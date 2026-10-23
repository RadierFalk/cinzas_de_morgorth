// O cavaleiro (sprites da pasta person): movimento, esquiva, combo de 3 golpes, ataque mergulho,
// cura, crítico na cabeça e dano recebido.
import { estado, consumir, segurando, CHAO, caixa, sobrepoe, particulas, texto } from "./nucleo.js";
import { desenharSprite, ciclo } from "./sprites.js";
import { moverCorpo, sobrePlataforma } from "./mundo.js";
import { efeito } from "./efeitos.js";
import { som } from "./sons.js";

export const P = {
  vel: 230, pulo: 560, grav: 1500,
  rolarVel: 430, rolarDur: 0.42, iframes: [0.04, 0.34],
  curarDur: 1.1, curarMomento: 0.65, curaQtd: 45, rezarDur: 1.3,
  custoRolar: 24, custoPulo: 10, custoMergulho: 14, regenEst: 42,
  janelaCombo: 0.4,   // depois de um golpe, quanto tempo dá para emendar o próximo
  critico: 2,         // multiplicador do golpe na cabeça
  variacao: 0.1,      // dano varia ±10%
};

// Combo de 3 golpes (quadros 0-19 da folha Attacks; os quadros 20-39 são os mesmos golpes espelhados).
// altura: [topo, base] da área do golpe, medida a partir dos pés. ponto: altura da lâmina (decide o crítico).
export const COMBO = [
  { nome: "corte", preparo: 0.12, ativo: 0.1, recuperar: 0.2, dano: 10, alcance: 72, altura: [56, 8], ponto: 38, custo: 16, passo: 40,
    quadros: { preparo: [0, 1, 2], ativo: [3], recuperar: [4, 5] } },
  { nome: "estocada", preparo: 0.1, ativo: 0.1, recuperar: 0.22, dano: 11, alcance: 88, altura: [48, 24], ponto: 36, custo: 16, passo: 120,
    quadros: { preparo: [9], ativo: [10, 11], recuperar: [12, 13] } },
  { nome: "giro", preparo: 0.16, ativo: 0.12, recuperar: 0.32, dano: 17, alcance: 92, altura: [60, 4], ponto: 38, custo: 24, passo: 60,
    quadros: { preparo: [14, 15], ativo: [16, 17], recuperar: [18, 19] } },
];
// Ataque no ar: desce com a espada para baixo. A ponta da espada passa pela cabeça de quem está embaixo.
const MERGULHO = { dano: 14, velQueda: 650, impacto: 6, raioImpacto: 60, durImpacto: 0.3 };

export function novaJogadora(x) {
  return {
    x, y: CHAO, vx: 0, vy: 0, w: 24, h: 66, dir: 1, noChao: true,
    hp: 100, hpMax: 100, hpFantasma: 100, est: 100, estMax: 100, estDelay: 0, frascos: 3,
    estado: "livre", tEstado: 0, invul: 0, semFolego: 0, janelaCombo: 0, proximoGolpe: 0, passo: 0,
  };
}

const mudar = (j, novo) => { j.estado = novo; j.tEstado = 0; };

function gastar(j, custo) {
  j.est = Math.max(0, j.est - custo);
  j.estDelay = j.est === 0 ? 1.0 : 0.55;  // zerou o fôlego: demora mais para voltar a encher
}

// Só faz a ação se tiver fôlego SUFICIENTE para ela (antes bastava ter qualquer coisa acima de zero)
function temFolego(j, custo) {
  if (j.est >= custo) return true;
  if (j.semFolego <= 0) som("sem_folego");
  j.semFolego = 0.45;  // a barra pisca em vermelho
  return false;
}

export function invulneravel(j) {
  return j.invul > 0 || j.estado === "morto" ||
    (j.estado === "rolar" && j.tEstado >= P.iframes[0] && j.tEstado <= P.iframes[1]);
}

/**
 * Aplica um golpe da jogadora em todos os alvos dentro da área.
 * Crítico: a lâmina (pontoY) passa pela cabeça do alvo (o quarto de cima do corpo).
 */
function golpear(j, area, pontoY, danoBase, jaAcertados) {
  let acertou = false, critou = false;
  for (const alvo of estado.jogo.alvos()) {
    if (jaAcertados.has(alvo)) continue;
    const c = caixa(alvo);
    if (!sobrepoe(area, c)) continue;
    const cabeca = c.y1 + (c.y2 - c.y1) * 0.28;
    const critico = pontoY >= c.y1 - 14 && pontoY <= cabeca;
    let dano = danoBase * (1 - P.variacao + Math.random() * 2 * P.variacao);
    if (critico) dano *= P.critico;
    jaAcertados.add(alvo);
    alvo.ferir(Math.round(dano), (Math.max(area.x1, c.x1) + Math.min(area.x2, c.x2)) / 2, critico ? cabeca : pontoY, critico);
    acertou = true; critou ||= critico;
  }
  if (acertou) som(critou ? "critico" : "acerto", j.x);
  return acertou;
}

export function atualizarJogadora(dt) {
  const jogo = estado.jogo, j = jogo.jogador;
  j.tEstado += dt;
  if (j.invul > 0) j.invul -= dt;
  if (j.semFolego > 0) j.semFolego -= dt;
  if (j.janelaCombo > 0) j.janelaCombo -= dt;
  const mover = (segurando.has("direita") ? 1 : 0) - (segurando.has("esquerda") ? 1 : 0);

  switch (j.estado) {
    case "livre":
      j.vx = mover * P.vel;
      if (mover) j.dir = mover;
      if (j.noChao && consumir("esquivar")) {
        if (temFolego(j, P.custoRolar)) {
          const dir = mover || j.dir;
          mudar(j, "rolar"); j.rolarDir = dir; j.dir = dir; gastar(j, P.custoRolar);
          som("rolar", j.x);
          const b = jogo.boss;  // só a luta contra o chefe registra a direção das esquivas
          if (b) {
            const lado = Math.sign(b.x - j.x) === dir ? "para_frente" : "para_tras";
            jogo.log.esquivas[lado]++;
            if (b.golpe) b.golpe.rolagens.push(lado);
          }
        }
      } else if (consumir("atacar")) {
        if (!j.noChao) {
          // No ar: ataque mergulho
          if (temFolego(j, P.custoMergulho)) {
            mudar(j, "mergulho"); gastar(j, P.custoMergulho);
            j.acertados = new Set(); j.impacto = false;
            j.vy = MERGULHO.velQueda; j.vx *= 0.3;
            som("golpe", j.x);
          }
        } else {
          const i = j.janelaCombo > 0 ? j.proximoGolpe : 0;  // emenda o combo se ainda estiver na janela
          if (temFolego(j, COMBO[i].custo)) {
            mudar(j, "ataque"); j.golpe = i; j.acertados = new Set(); j.contou = false; j.acertou = false;
            gastar(j, COMBO[i].custo);
            som("golpe", j.x);
          }
        }
      } else if (j.noChao && consumir("curar")) {
        if (j.frascos > 0) {
          mudar(j, "curar"); j.curou = false; j.frascos--;
          jogo.log.curas_hp_antes.push(Math.round(j.hp));
        } else {
          jogo.log.tentou_curar_sem_frasco++;
          texto(j.x, j.y - 90, "Sem frascos", "#999");
        }
      } else if (j.noChao && consumir("pular")) {
        if (temFolego(j, P.custoPulo)) {
          j.vy = -P.pulo; j.noChao = false; gastar(j, P.custoPulo); jogo.log.pulos++;
          som("pulo", j.x);
        }
      } else if (consumir("descer") && sobrePlataforma(j)) {
        j.descendo = 0.25;  // atravessa a plataforma para baixo
      }
      // Passos
      if (j.noChao && mover && (j.passo -= dt) <= 0) { som("passo", j.x); j.passo = 0.3; }
      break;

    case "rolar":
      j.vx = j.rolarDir * P.rolarVel * (1 - 0.45 * (j.tEstado / P.rolarDur));
      if (j.tEstado >= P.rolarDur) mudar(j, "livre");
      break;

    case "ataque": {
      const g = COMBO[j.golpe];
      const ativo = j.tEstado >= g.preparo && j.tEstado < g.preparo + g.ativo;
      j.vx = ativo ? j.dir * g.passo : 0;
      if (ativo) {
        const [topo, base] = g.altura;
        const area = { x1: j.dir > 0 ? j.x : j.x - g.alcance, x2: j.dir > 0 ? j.x + g.alcance : j.x, y1: j.y - topo, y2: j.y - base };
        if (golpear(j, area, j.y - g.ponto, g.dano, j.acertados)) j.acertou = true;
      }
      if (!j.contou && j.tEstado >= g.preparo + g.ativo) { j.contou = true; jogo.log.ataques[j.acertou ? "acertos" : "erros"]++; }
      if (j.tEstado >= g.preparo + g.ativo + g.recuperar) {
        mudar(j, "livre");
        j.janelaCombo = P.janelaCombo;
        j.proximoGolpe = (j.golpe + 1) % COMBO.length;
      }
      break;
    }

    case "mergulho":
      if (!j.impacto) {
        j.vy = Math.max(j.vy, MERGULHO.velQueda);
        // A ponta da espada fica abaixo dos pés: acertar alguém de cima = acertar a cabeça
        golpear(j, { x1: j.x - 26, x2: j.x + 26, y1: j.y - 40, y2: j.y + 14 }, j.y + 4, MERGULHO.dano, j.acertados);
        if (j.noChao) {
          j.impacto = true; j.tEstado = 0; j.vx = 0;
          jogo.tremor = Math.max(jogo.tremor, 5);
          efeito("circulo", j.x, j.y - 8, { escala: 0.35, fps: 26 });
          som("mergulho", j.x);
          // Onda do impacto: dano pequeno em quem está perto, no chão
          golpear(j, { x1: j.x - MERGULHO.raioImpacto, x2: j.x + MERGULHO.raioImpacto, y1: j.y - 40, y2: j.y }, j.y - 20, MERGULHO.impacto, j.acertados);
        }
      } else {
        j.vx = 0;
        if (j.tEstado >= MERGULHO.durImpacto) mudar(j, "livre");
      }
      break;

    case "curar":
      j.vx = mover * 50;
      if (!j.curou && j.tEstado >= P.curarMomento) {
        j.curou = true;
        j.hp = Math.min(j.hpMax, j.hp + P.curaQtd);
        particulas(j.x, j.y - 34, "#e84a4a", 18, 120);
        som("curar", j.x);
      }
      if (j.tEstado >= P.curarDur) mudar(j, "livre");
      break;

    case "rezar":
      // Ajoelhado na fogueira
      j.vx = 0;
      if (j.tEstado >= P.rezarDur) mudar(j, "livre");
      break;

    case "petrificada":
      // Olhar da Górgona: virou pedra por um instante e não consegue agir
      j.vx = 0;
      if (j.tEstado >= j.duracaoPedra) { mudar(j, "livre"); particulas(j.x, j.y - 34, "#9a968a", 16, 160); }
      break;

    case "atingido":
      j.vx *= 0.9;
      if (j.tEstado >= 0.38) mudar(j, "livre");
      break;

    case "morto":
      j.vx *= 0.9;
      break;
  }

  // Física (chão, plataformas e obstáculos)
  if (j.descendo > 0) j.descendo -= dt;
  moverCorpo(j, dt, P.grav);

  // Fôlego (stamina): só enche parado, andando ou curando, e depois de uma pausa
  if (j.estDelay > 0) j.estDelay -= dt;
  else if (!["rolar", "ataque", "mergulho"].includes(j.estado)) j.est = Math.min(j.estMax, j.est + P.regenEst * dt);
  j.hpFantasma = Math.max(j.hp, j.hpFantasma - 30 * dt);
}

/** Ajoelha na fogueira (chamado ao acendê-la). */
export function rezar(j) { mudar(j, "rezar"); j.vx = 0; }

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
  texto(j.x, j.y - 90, `-${dano}`, "#e74c3c");
  som("ferida", j.x);
  if (j.hp <= 0) {
    j.hp = 0; mudar(j, "morto");
    jogo.log.golpe_final = origem;
    som("morte");
    jogo.terminar("morte");
  }
  return true;
}

/** Golpe que petrifica (olhar da Górgona): causa dano e prende a jogadora por alguns instantes. */
export function petrificar(dano, origem, duracao) {
  const j = estado.jogo.jogador;
  if (!ferirJogadora(dano, origem, 0) || j.estado === "morto") return false;
  mudar(j, "petrificada");
  j.duracaoPedra = duracao; j.vx = 0; j.vy = 0; j.invul = 0;
  texto(j.x, j.y - 106, "PETRIFICADA", "#b8b4a6");
  som("petrificada", j.x);
  return true;
}

// ===================== Desenho =====================
const pela = (lista, t, dur) => lista[Math.min(lista.length - 1, Math.floor((t / dur) * lista.length))];

function quadroJogadora(j, t) {
  switch (j.estado) {
    case "livre":
      if (!j.noChao) return ["pulo", j.vy < -250 ? 1 : j.vy < -60 ? 2 : j.vy < 120 ? 3 : j.vy < 300 ? 5 : 6];
      return Math.abs(j.vx) > 10 ? ["correr", ciclo(t, 14, 8)] : ["parado", ciclo(t, 8, 8)];
    case "rolar": return ["rolar", pela([0, 1, 2, 3], j.tEstado, P.rolarDur)];
    case "ataque": {
      const g = COMBO[j.golpe], q = g.quadros;
      if (j.tEstado < g.preparo) return ["ataque", pela(q.preparo, j.tEstado, g.preparo)];
      if (j.tEstado < g.preparo + g.ativo) return ["ataque", pela(q.ativo, j.tEstado - g.preparo, g.ativo)];
      return ["ataque", pela(q.recuperar, j.tEstado - g.preparo - g.ativo, g.recuperar)];
    }
    case "mergulho": return ["mergulho", j.impacto ? pela([3, 4, 5, 6], j.tEstado, MERGULHO.durImpacto) : ciclo(t, 14, 3)];
    case "curar": return ["curar", pela([0, 1, 2, 3, 4, 5, 6, 7], j.tEstado, P.curarDur)];
    case "rezar": return ["rezar", pela([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], j.tEstado, P.rezarDur)];
    case "atingido": return ["ferido", pela([0, 1, 2], j.tEstado, 0.38)];
    case "petrificada": return ["ferido", 1];
    case "morto": return ["morte", Math.min(3, Math.floor(j.tEstado * 6))];
  }
  return ["parado", 0];
}

export function desenharJogadora(ctx, j, t) {
  const [anim, q] = quadroJogadora(j, t);
  let alpha = 1;
  if (j.invul > 0 && !["morto", "atingido", "petrificada"].includes(j.estado) && Math.floor(t * 20) % 2) alpha = 0.45;
  if (j.estado === "rolar") {
    // Rastro da rolagem
    for (let i = 1; i <= 2; i++) desenharSprite(ctx, "cavaleiro", anim, q, j.x - j.vx * 0.03 * i, j.y, { dir: j.dir, alpha: 0.2 / i });
  }
  desenharSprite(ctx, "cavaleiro", anim, q, j.x, j.y, {
    dir: j.dir, alpha,
    vermelho: j.estado === "atingido" ? Math.max(0, 1 - j.tEstado / 0.3) : 0,
    pedra: j.estado === "petrificada" ? 0.85 : 0,
  });
}
