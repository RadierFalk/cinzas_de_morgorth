// O cavaleiro (sprites da pasta person): movimento, esquiva, combo de 3 golpes, ataque mergulho,
// bloqueio com escudo, armas, itens, escadas de mão, cura, crítico na cabeça e dano recebido.
// Os atributos vêm do personagem salvo no servidor (nível, arma, escudo) — ver configurarJogadora.
import { estado, consumir, segurando, CHAO, H, caixa, sobrepoe, particulas, texto } from "./nucleo.js";
import { desenharSprite, desenharIcone, ciclo } from "./sprites.js";
import { moverCorpo, sobrePlataforma, escadaPerto, pisoEm, noAbismo } from "./mundo.js";
import { efeito } from "./efeitos.js";
import { som } from "./sons.js";

export const P = {
  vel: 230, pulo: 560, grav: 1500,
  rolarVel: 430, rolarDur: 0.42, iframes: [0.04, 0.34],
  curarDur: 1.1, curarMomento: 0.65, rezarDur: 1.3, velEscada: 110,
  custoRolar: 24, custoPulo: 10, custoMergulho: 14, regenEst: 42,
  janelaCombo: 0.4,   // depois de um golpe, quanto tempo dá para emendar o próximo
  variacao: 0.1,      // dano varia ±10%
};

// Combo de 3 golpes (quadros 0-19 da folha Attacks; os quadros 20-39 são os mesmos golpes espelhados).
// altura: [topo, base] da área do golpe, medida a partir dos pés. ponto: altura da lâmina (decide o crítico).
// Os números daqui são os da Espada; as outras armas multiplicam dano, tempo, alcance e fôlego.
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
const ITENS_RAPIDOS = ["erva", "bomba", "resina"];

export function novaJogadora(x) {
  return {
    x, y: CHAO, vx: 0, vy: 0, w: 24, h: 66, dir: 1, noChao: true,
    hp: 100, hpMax: 100, hpFantasma: 100, est: 100, estMax: 100, estDelay: 0, frascos: 3,
    estado: "livre", tEstado: 0, invul: 0, semFolego: 0, janelaCombo: 0, proximoGolpe: 0, passo: 0,
    bloqueando: false, itemSel: 0, regen: 0, resina: 0,
    stats: statsPadrao(),
  };
}

function statsPadrao() {
  return { danoMult: 1, curaQtd: 45, critico: 2, postura: 1, queima: false, magia: false,
    vel: 1, alcance: 1, folego: 1, rastro: "#f0ead6", escudo: null, iconeArma: null };
}

/**
 * Aplica o personagem salvo (nível, atributos, arma, escudo, frascos) na jogadora.
 * encher: começa com vida, fôlego e frascos cheios (início de cena ou descanso na fogueira).
 */
export function configurarJogadora(j, personagem, catalogo, encher = true) {
  if (!personagem || !catalogo) return;
  const a = personagem.atributos, arma = catalogo.armas[personagem.arma] || catalogo.armas.espada;
  const nivelArma = personagem.armas[personagem.arma] || 0;
  const escudo = catalogo.escudos[personagem.escudo];
  j.hpMax = 100 + 8 * (a.vigor - 1);
  j.estMax = 100 + 6 * (a.folego - 1);
  j.frascosMax = personagem.frascos_max;
  j.stats = {
    danoMult: arma.dano * (1 + 0.1 * nivelArma) * (1 + 0.06 * (a.forca - 1)),
    curaQtd: 45 + 4 * (a.fe - 1) + (personagem.cura_extra || 0),
    critico: arma.critico, postura: arma.postura, queima: !!arma.queima, magia: !!arma.magia,
    vel: arma.velocidade, alcance: arma.alcance, folego: arma.folego, rastro: arma.rastro,
    escudo: escudo && escudo.absorcao > 0 ? escudo : null, iconeArma: arma.icone,
  };
  if (encher) { j.hp = j.hpFantasma = j.hpMax; j.est = j.estMax; j.frascos = j.frascosMax; }
  j.hp = Math.min(j.hp, j.hpMax);
}

const mudar = (j, novo) => { j.estado = novo; j.tEstado = 0; };

function gastar(j, custo) {
  j.est = Math.max(0, j.est - custo);
  j.estDelay = j.est === 0 ? 1.0 : 0.55;  // zerou o fôlego: demora mais para voltar a encher
}

// Só faz a ação se tiver fôlego SUFICIENTE para ela
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

// Golpe atual, já ajustado pela arma (tempo, alcance, fôlego)
function golpeAtual(j) {
  const g = COMBO[j.golpe], s = j.stats;
  return { ...g, preparo: g.preparo / s.vel, ativo: g.ativo / s.vel, recuperar: g.recuperar / s.vel,
    alcance: g.alcance * s.alcance, custo: Math.round(g.custo * s.folego) };
}

/** Dano da jogadora contra um alvo: base × arma × força, ±10%; ×crítico se a lâmina passou pela cabeça. */
function golpear(j, area, pontoY, danoBase, jaAcertados) {
  let acertou = false, critou = false;
  const s = j.stats, queima = s.queima || j.resina > 0;
  for (const alvo of estado.jogo.alvos()) {
    if (jaAcertados.has(alvo)) continue;
    const c = caixa(alvo);
    if (!sobrepoe(area, c)) continue;
    const cabeca = c.y1 + (c.y2 - c.y1) * 0.28;
    const critico = pontoY >= c.y1 - 14 && pontoY <= cabeca;
    let dano = danoBase * s.danoMult * (j.resina > 0 ? 1.3 : 1) * (1 - P.variacao + Math.random() * 2 * P.variacao);
    if (critico) dano *= s.critico;
    jaAcertados.add(alvo);
    alvo.ferir(Math.max(1, Math.round(dano)), (Math.max(area.x1, c.x1) + Math.min(area.x2, c.x2)) / 2, critico ? cabeca : pontoY,
      { critico, postura: s.postura, queima });
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
  if (j.resina > 0) { j.resina -= dt; if (Math.random() < 0.3) particulas(j.x + j.dir * 18, j.y - 30, "#ff8a2a", 1, 40); }
  if (j.regen > 0 && j.estado !== "morto") {
    j.regen -= dt; j.hp = Math.min(j.hpMax, j.hp + 10 * dt);
    if (Math.random() < 0.2) particulas(j.x, j.y - 40, "#7be07b", 1, 40);
  }
  const mover = (segurando.has("direita") ? 1 : 0) - (segurando.has("esquerda") ? 1 : 0);
  j.bloqueando = false;

  switch (j.estado) {
    case "livre": {
      const escada = escadaPerto(j);
      // Para descer: de pé no topo da estrutura, ao lado da escada
      const escadaNoTopo = jogo.escadas.find((e) => Math.abs(j.y - e.topo) < 4 && Math.abs(j.x - (e.x + (e.saida || 1) * 24)) < 22) || null;
      // Bloqueio: segurar L (ou botão direito) com um escudo equipado
      j.bloqueando = !!j.stats.escudo && j.noChao && segurando.has("bloquear");
      const vel = j.bloqueando ? (j.stats.escudo.lento ? 40 : 90) : P.vel;
      j.vx = mover * vel;
      if (mover && !j.bloqueando) j.dir = mover;  // bloqueando: anda sem virar as costas
      if (escada && segurando.has("cima") && j.y > escada.topo + 2) {
        mudar(j, "escalar"); j.escada = escada; j.x = escada.x; j.vx = j.vy = 0; consumir("pular");
      } else if (escadaNoTopo && segurando.has("descer")) {
        mudar(j, "escalar"); j.escada = escadaNoTopo; j.x = escadaNoTopo.x; j.y += 3; j.vx = j.vy = 0; consumir("descer");
      } else if (j.noChao && consumir("esquivar")) {
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
          j.golpe = j.janelaCombo > 0 ? j.proximoGolpe : 0;  // emenda o combo se ainda estiver na janela
          const g = golpeAtual(j);
          if (temFolego(j, g.custo)) {
            mudar(j, "ataque"); j.acertados = new Set(); j.contou = false; j.acertou = false; j.disparou = false;
            gastar(j, g.custo);
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
      } else if (consumir("usar_item")) {
        usarItem(j);
      } else if (consumir("trocar_item")) {
        trocarItem(j);
      } else if (j.noChao && consumir("pular")) {
        if (temFolego(j, P.custoPulo)) {
          j.vy = -P.pulo; j.noChao = false; gastar(j, P.custoPulo); jogo.log.pulos++;
          som("pulo", j.x);
        }
      } else if (!escada && consumir("descer") && sobrePlataforma(j)) {
        j.descendo = 0.25;  // atravessa a plataforma para baixo
      }
      // Passos
      if (j.noChao && mover && (j.passo -= dt) <= 0) { som("passo", j.x); j.passo = 0.3; }
      break;
    }

    case "escalar": {
      // Escada de mão: W sobe, S desce, Espaço solta
      const e = j.escada, sobe = segurando.has("cima"), desce = segurando.has("descer");
      j.vx = 0; j.vy = 0; j.x = e.x;
      j.subindo = sobe || desce;
      if (sobe) j.y -= P.velEscada * dt;
      if (desce) j.y += P.velEscada * dt;
      // No topo, dá um passo para cima da estrutura
      if (j.y <= e.topo) { j.y = e.topo; j.x += (e.saida || 1) * 24; j.dir = e.saida || 1; j.noChao = true; mudar(j, "livre"); }
      else if (j.y >= e.base) { j.y = e.base; mudar(j, "livre"); }
      else if (soltouDaEscada()) mudar(j, "livre");
      if (sobe && (j.passo -= dt) <= 0) { som("passo", j.x, 0.6); j.passo = 0.35; }
      j.hpFantasma = Math.max(j.hp, j.hpFantasma - 30 * dt);
      return;  // sem gravidade na escada
    }

    case "rolar":
      j.vx = j.rolarDir * P.rolarVel * (1 - 0.45 * (j.tEstado / P.rolarDur));
      if (j.tEstado >= P.rolarDur) mudar(j, "livre");
      break;

    case "ataque": {
      const g = golpeAtual(j);
      const ativo = j.tEstado >= g.preparo && j.tEstado < g.preparo + g.ativo;
      j.vx = ativo ? j.dir * g.passo : 0;
      if (ativo && j.stats.magia) {
        // Cajado: cada golpe dispara uma esfera arcana (o giro dispara uma maior)
        if (!j.disparou) { j.disparou = true; dispararMagia(j, g.dano * (j.golpe === 2 ? 1.5 : 1)); }
      } else if (ativo) {
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
        j.hp = Math.min(j.hpMax, j.hp + j.stats.curaQtd);
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
      // O empurrão de um golpe nunca joga a jogadora no abismo (só cai quem anda, rola ou pula para dentro)
      if (noAbismo(j.x + j.vx * dt) && !noAbismo(j.x)) j.vx = 0;
      if (j.tEstado >= (j.atordoado || 0.38)) { j.atordoado = 0; mudar(j, "livre"); }
      break;

    case "morto":
      j.vx *= 0.9;
      break;
  }

  // Física (chão, plataformas, rampas e obstáculos)
  if (j.descendo > 0) j.descendo -= dt;
  moverCorpo(j, dt, P.grav);

  // Caiu no abismo
  if (j.y > H + 80 && j.estado !== "morto") {
    j.hp = 0; mudar(j, "morto"); j.vy = 0;
    jogo.log.golpe_final = "queda";
    som("morte");
    jogo.terminar("morte");
  }

  // Fôlego (stamina): só enche fora de ações cansativas e depois de uma pausa; bloqueando enche mais devagar
  if (j.estDelay > 0) j.estDelay -= dt;
  else if (!["rolar", "ataque", "mergulho"].includes(j.estado)) {
    j.est = Math.min(j.estMax, j.est + P.regenEst * (j.bloqueando ? 0.35 : 1) * dt);
  }
  j.hpFantasma = Math.max(j.hp, j.hpFantasma - 30 * dt);
}

// Espaço solta da escada (W também é "pular", então só o Espaço conta aqui)
function soltouDaEscada() { return consumir("pular") && !segurando.has("cima"); }

// ===================== Itens de uso rápido (Q usa, R troca) =====================
function itensDisponiveis() {
  const consumiveis = estado.jogo.personagem?.consumiveis || {};
  return ITENS_RAPIDOS.filter((i) => consumiveis[i] > 0);
}

/** Item selecionado no momento (para o HUD). */
export function itemSelecionado(j) {
  const lista = itensDisponiveis();
  if (!lista.length) return null;
  return lista[j.itemSel % lista.length];
}

function trocarItem(j) {
  const lista = itensDisponiveis();
  if (lista.length) { j.itemSel = (j.itemSel + 1) % lista.length; som("clique"); }
}

function usarItem(j) {
  const jogo = estado.jogo, item = itemSelecionado(j);
  if (!item) { texto(j.x, j.y - 90, "Sem itens", "#999"); return; }
  jogo.personagem.consumiveis[item]--;
  if (item === "erva") {
    j.regen = 4; som("curar", j.x, 0.6);
    texto(j.x, j.y - 90, "Erva Verde", "#7be07b", 14);
  } else if (item === "resina") {
    j.resina = 30; som("bola_fogo", j.x);
    texto(j.x, j.y - 90, "Arma em chamas", "#ff8a2a", 14);
  } else if (item === "bomba") {
    jogo.bombas.push({ x: j.x + j.dir * 16, y: j.y - 50, vx: j.dir * 300 + j.vx * 0.5, vy: -300, t: 0 });
    som("golpe", j.x);
  }
}

function dispararMagia(j, dano) {
  estado.jogo.magias.push({ x: j.x + j.dir * 30, y: j.y - 38, vx: j.dir * 540, dano, vida: 1.1, t: 0, acertados: new Set() });
  som("magia", j.x);
}

/** Bombas (arremesso em arco) e esferas do cajado. Chamado pelo jogo a cada quadro. */
export function atualizarArmasDaJogadora(dt) {
  const jogo = estado.jogo, j = jogo.jogador;
  for (const b of jogo.bombas) {
    b.t += dt; b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    const bateu = b.y >= pisoEm(b.x, b.y - 4) || jogo.alvos().some((a) => sobrepoe(caixa(a), { x1: b.x - 6, x2: b.x + 6, y1: b.y - 6, y2: b.y + 6 }));
    if (bateu || b.t > 3) {
      b.fim = true;
      efeito("explosao", b.x, b.y + 10, { escala: 0.6, fps: 22 });
      som("explosao", b.x, 1.4);
      jogo.tremor = Math.max(jogo.tremor, 8);
      golpear(j, { x1: b.x - 70, x2: b.x + 70, y1: b.y - 80, y2: b.y + 30 }, b.y + 40, 45 / j.stats.danoMult, new Set());
    }
  }
  jogo.bombas = jogo.bombas.filter((b) => !b.fim);
  for (const m of jogo.magias) {
    m.t += dt; m.x += m.vx * dt; m.vida -= dt;
    if (golpear(j, { x1: m.x - 10, x2: m.x + 10, y1: m.y - 10, y2: m.y + 10 }, m.y, m.dano, m.acertados)) {
      m.vida = 0; efeito("azul", m.x, m.y, { escala: 0.3, fps: 26 });
    }
    if (jogo.blocos.some((b) => m.x > b.x1 && m.x < b.x2 && m.y > b.y1 && m.y < b.y2)) m.vida = 0;
  }
  jogo.magias = jogo.magias.filter((m) => m.vida > 0);
}

/** Ajoelha na fogueira (chamado ao acendê-la). */
export function rezar(j) { mudar(j, "rezar"); j.vx = 0; }

/**
 * Dano na jogadora. empurrao: direção do golpe (de onde veio). opts.inbloqueavel: o escudo não segura.
 * Bloqueando de frente: o escudo absorve parte do dano e gasta fôlego; sem fôlego, a guarda quebra.
 */
export function ferirJogadora(dano, origem, empurrao, opts = {}) {
  const jogo = estado.jogo, j = jogo.jogador;
  if (invulneravel(j)) return false;
  const escudo = j.stats.escudo;
  if (j.bloqueando && escudo && !opts.inbloqueavel && empurrao === -j.dir) {
    const custo = dano * escudo.custo * 1.6;
    jogo.log.bloqueios = (jogo.log.bloqueios || 0) + 1;
    particulas(j.x + j.dir * 16, j.y - 36, "#fff2b0", 10, 180);
    if (j.est >= custo) {
      // Bloqueio bem-sucedido
      gastar(j, custo);
      const passou = Math.round(dano * (1 - escudo.absorcao));
      j.hp -= passou; j.vx = empurrao * 120;
      if (passou > 0) texto(j.x, j.y - 90, `-${passou}`, "#e74c3c");
      som("bloqueado", j.x);
      jogo.hitstop = 0.05;
      if (passou > 0) jogo.log.dano_recebido[origem] = (jogo.log.dano_recebido[origem] || 0) + passou;
      return checarMorte(j, origem) || true;
    }
    // Guarda quebrada: sem fôlego, fica atordoado e o escudo segura só metade do que seguraria
    j.est = 0; j.estDelay = 1.0;
    dano = Math.round(dano * (1 - escudo.absorcao / 2));
    texto(j.x, j.y - 106, "GUARDA QUEBRADA", "#ffb070", 14);
    j.atordoado = 0.8;
  }
  if (j.estado === "curar" && !j.curou) jogo.log.curas_punidas++;
  j.hp -= dano;
  jogo.log.dano_recebido[origem] = (jogo.log.dano_recebido[origem] || 0) + dano;
  if (j.estado === "escalar") j.escada = null;
  mudar(j, "atingido");
  j.vx = empurrao * 260; j.vy = -220; j.invul = 0.45;
  jogo.tremor = 10; jogo.hitstop = 0.08;
  particulas(j.x, j.y - 34, "#c0392b", 14);
  texto(j.x, j.y - 90, `-${dano}`, "#e74c3c");
  som("ferida", j.x);
  checarMorte(j, origem);
  return true;
}

function checarMorte(j, origem) {
  const jogo = estado.jogo;
  if (j.hp > 0) return false;
  j.hp = 0; mudar(j, "morto");
  jogo.log.golpe_final = origem;
  som("morte");
  jogo.terminar("morte");
  return true;
}

/** Golpe que petrifica (olhar da Górgona): causa dano e prende a jogadora por alguns instantes. */
export function petrificar(dano, origem, duracao) {
  const j = estado.jogo.jogador;
  if (!ferirJogadora(dano, origem, 0, { inbloqueavel: true }) || j.estado === "morto") return false;
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
      if (j.bloqueando) return ["parado", 0];
      return Math.abs(j.vx) > 10 ? ["correr", ciclo(t, 14, 8)] : ["parado", ciclo(t, 8, 8)];
    case "escalar": return ["escalar", j.subindo ? ciclo(t, 10, 6) : 0];
    case "rolar": return ["rolar", pela([0, 1, 2, 3], j.tEstado, P.rolarDur)];
    case "ataque": {
      const g = golpeAtual(j), q = g.quadros;
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
  // Rastro colorido do golpe (cor da arma; laranja com resina)
  if (j.estado === "ataque" && !j.stats.magia) {
    const g = golpeAtual(j), cor = j.resina > 0 ? "#ff7a2a" : j.stats.rastro;
    if (cor !== "#f0ead6" && j.tEstado >= g.preparo && j.tEstado < g.preparo + g.ativo + 0.05) {
      ctx.save();
      ctx.strokeStyle = cor; ctx.globalAlpha = 0.65; ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(j.x + j.dir * 10, j.y - 36, g.alcance * 0.6, j.dir > 0 ? -1.1 : Math.PI - 0.7, j.dir > 0 ? 0.7 : Math.PI + 1.1);
      ctx.stroke();
      ctx.restore();
    }
  }
  // Escudo erguido na frente do corpo
  if (j.bloqueando && j.stats.escudo) desenharIcone(ctx, j.stats.escudo.icone, j.x + j.dir * 14 - 14, j.y - 58, 28);
}

/** Bombas e esferas do cajado (coordenadas do mundo). */
export function desenharArmasDaJogadora(ctx) {
  const jogo = estado.jogo;
  for (const b of jogo.bombas) {
    ctx.fillStyle = "#2a2a2a"; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = Math.floor(b.t * 20) % 2 ? "#ffd36b" : "#ff7a2a"; ctx.fillRect(b.x + 3, b.y - 9, 3, 3);
  }
  for (const m of jogo.magias) {
    const g = ctx.createRadialGradient(m.x, m.y, 1, m.x, m.y, 14);
    g.addColorStop(0, "rgba(220,245,255,1)"); g.addColorStop(0.5, "rgba(120,200,255,0.8)"); g.addColorStop(1, "rgba(120,200,255,0)");
    ctx.fillStyle = g; ctx.fillRect(m.x - 14, m.y - 14, 28, 28);
  }
}
