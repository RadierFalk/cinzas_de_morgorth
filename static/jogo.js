// Cenas do jogo: a fase (Ruínas, com esqueletos) e a arena do chefão.
// O combate é 100% código determinístico. A IA só muda a ESTRATÉGIA do boss entre as lutas
// (veja app.py e boss_mcp.py).
import { W, H, CHAO, ctx, estado, avancarBuffer, limparEntrada, canvas, lerp } from "./nucleo.js";
import { novaJogadora, atualizarJogadora, desenharJogadora } from "./jogador.js";
import { NOME_BOSS, novoBoss, atualizarBoss, atualizarOndas, desenharBoss, desenharOndas } from "./boss.js";
import { novoInimigo, atualizarInimigos, desenharInimigos, vivo } from "./inimigos.js";
import { carregarSprites } from "./sprites.js";

export { carregarSprites };

// Para inspecionar pelo console do navegador: (await import("/static/jogo.js")).depurar()
export const depurar = () => estado.jogo;

// ===================== Layout da fase =====================
const FASE = {
  nome: "RUÍNAS DE MORVATH",
  largura: 3600,
  inicio: 120,
  fogueira: 3200,
  nevoa: 3460,
  inimigos: [
    // Grupos pequenos e espaçados: no máximo dois esqueletos acordam ao mesmo tempo
    ["guerreiro", 760], ["lanceiro", 1150], ["arqueiro", 1330], ["guerreiro", 1880], ["guerreiro", 2010],
    ["arqueiro", 2560], ["lanceiro", 2920], ["guerreiro", 3060],
  ],
  lapides: [420, 980, 1350, 1760, 2250, 2620, 3080],
};

function novaCena(modo, callbacks) {
  limparEntrada();
  const jogo = {
    modo, t: 0, tremor: 0, hitstop: 0, fim: null, encerrado: false, fade: 1, saida: null,
    mundoW: modo === "fase" ? FASE.largura : W, cam: 0,
    jogador: novaJogadora(modo === "fase" ? FASE.inicio : 180),
    boss: null, inimigos: [], projeteis: [], ondas: [], particulas: [], textos: [],
    legenda: null, aviso: null, ...callbacks,
    log: {
      resultado: null, duracao_s: 0, fase_alcancada: 1,
      esquivas: { para_frente: 0, para_tras: 0 }, pulos: 0,
      curas_hp_antes: [], curas_punidas: 0, tentou_curar_sem_frasco: 0,
      ataques: { acertos: 0, erros: 0 }, dano_recebido: {}, golpe_final: null,
    },
  };
  jogo.alvos = () => (jogo.boss ? (jogo.boss.estado !== "morto" ? [jogo.boss] : []) : jogo.inimigos.filter(vivo));
  jogo.terminar = (resultado) => terminar(jogo, resultado);
  estado.jogo = jogo;
  canvas.focus();
  return jogo;
}

/** Fase antes do chefão. callbacks: aoMorrer(), aoAcenderFogueira(), aoChegarNoBoss() */
export function iniciarFase(callbacks) {
  const jogo = novaCena("fase", callbacks);
  jogo.inimigos = FASE.inimigos.map(([tipo, x]) => novoInimigo(tipo, x));
  jogo.fogueira = { x: FASE.fogueira, acesa: !!callbacks.fogueiraAcesa };
  jogo.aviso = { txt: FASE.nome, vida: 4, total: 4, cor: "#d8cfb8" };
}

/** Luta contra o chefão. A estratégia vem da IA (via servidor). */
export function iniciarLuta(estrategia, fala, aoTerminar) {
  const jogo = novaCena("boss", { aoTerminar });
  jogo.boss = novoBoss(estrategia);
  if (fala) jogo.legenda = { txt: fala, vida: 7 };
}

function terminar(jogo, resultado) {
  if (jogo.fim) return;
  jogo.fim = { resultado, espera: resultado === "morte" ? 2.6 : 3.2 };
  const b = jogo.boss, j = jogo.jogador;
  Object.assign(jogo.log, {
    resultado,
    duracao_s: Math.round(jogo.t),
    boss_hp_restante_pct: b ? Math.round((100 * b.hp) / b.hpMax) : null,
    jogador_hp_restante: Math.round(j.hp),
    frascos_restantes: j.frascos,
  });
}

// ===================== Atualização =====================
function atualizar(dt) {
  const jogo = estado.jogo, j = jogo.jogador;
  avancarBuffer(dt);
  if (jogo.fade > 0) jogo.fade = Math.max(0, jogo.fade - dt * 1.5);
  if (jogo.hitstop > 0) { jogo.hitstop -= dt; return; }
  jogo.t += dt;

  if (!jogo.saida) atualizarJogadora(dt);
  if (jogo.boss) { atualizarBoss(dt); atualizarOndas(dt); }
  else atualizarInimigos(dt);
  separarCorpos(jogo);
  if (jogo.modo === "fase") atualizarFase(jogo, dt);

  for (const p of jogo.particulas) { p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vida -= dt; }
  jogo.particulas = jogo.particulas.filter((p) => p.vida > 0);
  for (const t of jogo.textos) { t.y -= 40 * dt; t.vida -= dt; }
  jogo.textos = jogo.textos.filter((t) => t.vida > 0);
  if (jogo.legenda && (jogo.legenda.vida -= dt) <= 0) jogo.legenda = null;
  if (jogo.aviso && (jogo.aviso.vida -= dt) <= 0) jogo.aviso = null;
  jogo.tremor *= 0.88;

  // Câmera segue a jogadora (só se move na fase; a arena cabe na tela)
  const alvo = Math.max(0, Math.min(jogo.mundoW - W, j.x - W * 0.4));
  jogo.cam += (alvo - jogo.cam) * Math.min(1, dt * 6);

  if (jogo.fim && !jogo.encerrado && (jogo.fim.espera -= dt) <= 0) {
    jogo.encerrado = true;
    if (jogo.modo === "boss") jogo.aoTerminar?.(jogo.log);
    else jogo.aoMorrer?.();
  }
}

function atualizarFase(jogo, dt) {
  const j = jogo.jogador, f = jogo.fogueira;
  if (Math.random() < (f.acesa ? 0.6 : 0.08)) {
    jogo.particulas.push({ x: f.x + (Math.random() - 0.5) * 14, y: CHAO - 8, vx: (Math.random() - 0.5) * 20,
      vy: -60 - Math.random() * 60, vida: 0.6 + Math.random() * 0.5, cor: Math.random() < 0.5 ? "#ff9a3c" : "#ffd36b", tam: 2 + Math.random() * 2 });
  }
  // Acender a fogueira: recupera tudo e salva o progresso
  if (!f.acesa && j.estado !== "morto" && Math.abs(j.x - f.x) < 40) {
    f.acesa = true;
    j.hp = j.hpMax; j.hpFantasma = j.hpMax; j.frascos = 3; j.est = j.estMax;
    jogo.aviso = { txt: "FOGUEIRA ACESA", vida: 3, total: 3, cor: "#e8b04a" };
    jogo.aoAcenderFogueira?.();
  }
  // Atravessar a névoa leva ao chefão
  if (!jogo.saida && j.x >= FASE.nevoa && j.estado !== "morto") {
    jogo.saida = { t: 0 };
  }
  if (jogo.saida) {
    // Caminha sozinha para dentro da névoa enquanto a tela escurece
    j.dir = 1; j.vx = 60;
    j.x += j.vx * dt;
    if ((jogo.saida.t += dt) >= 1.2 && !jogo.encerrado) { jogo.encerrado = true; jogo.aoChegarNoBoss?.(); }
  }
}

// Ninguém atravessa ninguém andando (só rolando)
function separarCorpos(jogo) {
  const j = jogo.jogador;
  if (j.estado !== "rolar" && j.y > CHAO - 60) {
    const corpos = jogo.boss ? (jogo.boss.estado !== "morto" ? [jogo.boss] : []) : jogo.inimigos.filter(vivo);
    for (const c of corpos) {
      const minDist = (j.w + c.w) / 2 - 6, dx = j.x - c.x;
      if (Math.abs(dx) < minDist) j.x = c.x + (dx >= 0 ? 1 : -1) * minDist;
    }
  }
  j.x = Math.max(20, Math.min(jogo.mundoW - 20, j.x));  // encurralada na parede: presa, mas dentro do mapa
}

// ===================== Loop =====================
let ultimo = 0;
function loop(ts) {
  const dt = Math.min(1 / 30, (ts - ultimo) / 1000 || 0);
  ultimo = ts;
  if (estado.jogo) { atualizar(dt); desenhar(); }
  else desenharFundo(ts / 1000, 0);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ===================== Cenário (camadas com parallax) =====================
function camada(desenho) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  desenho(c.getContext("2d"));
  return c;
}
const ceu = camada((f) => {
  const g = f.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#07080d"); g.addColorStop(0.55, "#161a24"); g.addColorStop(1, "#22262f");
  f.fillStyle = g; f.fillRect(0, 0, W, H);
  const halo = f.createRadialGradient(770, 95, 20, 770, 95, 160);
  halo.addColorStop(0, "rgba(230,220,190,0.25)"); halo.addColorStop(1, "rgba(230,220,190,0)");
  f.fillStyle = halo; f.fillRect(0, 0, W, H);
  f.fillStyle = "#e6dcc0"; f.beginPath(); f.arc(770, 95, 34, 0, Math.PI * 2); f.fill();
});
const ruinas = camada((f) => {
  f.fillStyle = "#11141b";
  [[60, 170], [190, 120], [330, 200], [610, 150], [730, 110], [880, 190]].forEach(([x, alt]) => {
    f.fillRect(x, CHAO - 200 - alt, 46, 200 + alt);
    f.beginPath(); f.moveTo(x, CHAO - 200 - alt); f.lineTo(x + 20, CHAO - 225 - alt); f.lineTo(x + 46, CHAO - 205 - alt); f.lineTo(x + 46, CHAO - 200 - alt); f.fill();
  });
  f.fillRect(0, CHAO - 120, W, 120);
});
const chao = camada((f) => {
  f.fillStyle = "#1b1e25"; f.fillRect(0, CHAO, W, H - CHAO);
  f.fillStyle = "#3b404c"; f.fillRect(0, CHAO, W, 3);
  f.strokeStyle = "#262a33"; f.lineWidth = 2;
  for (let x = 0; x < W; x += 70) { f.beginPath(); f.moveTo(x, CHAO + 3); f.lineTo(x + 12, H); f.stroke(); }
});

function repetir(img, deslocamento) {
  const x = -(((deslocamento % W) + W) % W);
  ctx.drawImage(img, x, 0); ctx.drawImage(img, x + W, 0);
}

function desenharFundo(t, cam) {
  ctx.drawImage(ceu, 0, 0);
  repetir(ruinas, cam * 0.35);
  repetir(chao, cam);
  for (let i = 0; i < 3; i++) {
    const x = ((t * (12 + i * 8) + i * 300) % (W + 400)) - 200;
    const g = ctx.createRadialGradient(x, CHAO - 30 - i * 40, 10, x, CHAO - 30 - i * 40, 260);
    g.addColorStop(0, "rgba(150,160,180,0.07)"); g.addColorStop(1, "rgba(150,160,180,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

function desenharCenarioDaFase(jogo) {
  // Lápides
  ctx.fillStyle = "#2a2e38";
  for (const x of FASE.lapides) {
    ctx.beginPath(); ctx.moveTo(x - 12, CHAO); ctx.lineTo(x - 12, CHAO - 26); ctx.arc(x, CHAO - 26, 12, Math.PI, 0); ctx.lineTo(x + 12, CHAO); ctx.fill();
  }
  // Fogueira: espada cravada num monte de cinzas
  const f = jogo.fogueira;
  ctx.fillStyle = "#2b2622"; ctx.beginPath(); ctx.ellipse(f.x, CHAO, 26, 7, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#8d8f98"; ctx.fillRect(f.x - 2, CHAO - 46, 4, 42);
  ctx.fillStyle = "#5a4a32"; ctx.fillRect(f.x - 9, CHAO - 50, 18, 4);
  if (f.acesa) {
    const g = ctx.createRadialGradient(f.x, CHAO - 20, 4, f.x, CHAO - 20, 120);
    g.addColorStop(0, "rgba(255,160,60,0.35)"); g.addColorStop(1, "rgba(255,160,60,0)");
    ctx.fillStyle = g; ctx.fillRect(f.x - 120, CHAO - 140, 240, 160);
  }
  // Névoa que leva ao chefão
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(220,225,235,${0.08 + 0.04 * Math.sin(jogo.t * 2 + i)})`;
    ctx.fillRect(FASE.nevoa + i * 10 + Math.sin(jogo.t * 1.5 + i) * 6, CHAO - 220, 26, 220);
  }
}

// ===================== Desenho =====================
function desenhar() {
  const jogo = estado.jogo;
  ctx.save();
  if (jogo.tremor > 0.5) ctx.translate((Math.random() - 0.5) * jogo.tremor, (Math.random() - 0.5) * jogo.tremor);
  desenharFundo(jogo.t, jogo.cam);

  ctx.save();
  ctx.translate(-Math.round(jogo.cam), 0);  // daqui em diante: coordenadas do mundo
  if (jogo.modo === "fase") { desenharCenarioDaFase(jogo); desenharInimigos(ctx); }
  if (jogo.boss) { desenharOndas(ctx); desenharBoss(ctx, jogo.boss); }
  desenharJogadora(ctx, jogo.jogador, jogo.t);
  for (const p of jogo.particulas) {
    ctx.globalAlpha = Math.min(1, p.vida * 2); ctx.fillStyle = p.cor;
    ctx.fillRect(p.x, p.y, p.tam, p.tam);
  }
  ctx.globalAlpha = 1;
  ctx.font = "bold 18px Georgia"; ctx.textAlign = "center";
  for (const t of jogo.textos) { ctx.globalAlpha = Math.min(1, t.vida * 2); ctx.fillStyle = t.cor; ctx.fillText(t.txt, t.x, t.y); }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.restore();

  desenharHUD(jogo);
  desenharTelaFinal(jogo);
  const escuro = Math.max(jogo.fade, jogo.saida ? Math.min(1, jogo.saida.t / 1.2) : 0);
  if (escuro > 0) { ctx.fillStyle = `rgba(0,0,0,${escuro})`; ctx.fillRect(0, 0, W, H); }
}

function barra(x, y, w, h, valor, fantasma, cor) {
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  if (fantasma != null) { ctx.fillStyle = "#c9a227"; ctx.fillRect(x, y, w * fantasma, h); }
  ctx.fillStyle = cor; ctx.fillRect(x, y, w * Math.max(0, valor), h);
}

function desenharHUD(jogo) {
  const j = jogo.jogador, b = jogo.boss;
  barra(24, 22, 260, 12, j.hp / j.hpMax, j.hpFantasma / j.hpMax, "#a32a20");
  barra(24, 40, 200, 7, j.est / j.estMax, null, "#3f8f4a");
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < j.frascos ? "#e8c35a" : "#3a3a3a";
    ctx.beginPath(); ctx.arc(32 + i * 20, 64, 6, 0, Math.PI * 2); ctx.fill();
  }

  ctx.textAlign = "center";
  if (b) {
    ctx.font = "18px Georgia"; ctx.fillStyle = "#d8cfb8";
    ctx.fillText(NOME_BOSS, W / 2, H - 38);
    barra(W / 2 - 300, H - 28, 600, 9, b.hp / b.hpMax, b.hpFantasma / b.hpMax, "#8b1a1a");
  }
  if (jogo.legenda) {
    ctx.globalAlpha = Math.min(1, jogo.legenda.vida, (7 - jogo.legenda.vida) * 2);
    ctx.font = "italic 19px Georgia"; ctx.fillStyle = "#efe4c8";
    quebrarTexto(`“${jogo.legenda.txt}”`, W / 2, 110, 760, 26);
    ctx.globalAlpha = 1;
  }
  if (jogo.aviso) {
    // Letreiro no estilo souls: nome da área / fogueira acesa
    const a = jogo.aviso;
    ctx.globalAlpha = Math.max(0, Math.min(1, a.vida, (a.total - a.vida) * 2));  // aparece e some suavemente
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, H / 2 - 120, W, 70);
    ctx.font = "40px Georgia"; ctx.fillStyle = a.cor;
    ctx.fillText(a.txt, W / 2, H / 2 - 72);
    ctx.globalAlpha = 1;
  }
  if (jogo.t < 8) {
    ctx.globalAlpha = Math.min(1, 8 - jogo.t) * 0.7;
    ctx.font = "13px system-ui"; ctx.fillStyle = "#bbb"; ctx.textAlign = "right";
    ctx.fillText("A/D mover · W pular · Shift esquivar · J atacar · F curar", W - 20, 30);
    ctx.globalAlpha = 1;
  }
}

function quebrarTexto(txt, x, y, larguraMax, alturaLinha) {
  let linha = "";
  for (const palavra of txt.split(" ")) {
    const teste = linha ? linha + " " + palavra : palavra;
    if (ctx.measureText(teste).width > larguraMax && linha) { ctx.fillText(linha, x, y); linha = palavra; y += alturaLinha; }
    else linha = teste;
  }
  ctx.fillText(linha, x, y);
}

function desenharTelaFinal(jogo) {
  if (!jogo.fim) return;
  const total = jogo.fim.resultado === "morte" ? 2.6 : 3.2;
  const a = lerp(0, 1, (total - Math.max(0, jogo.fim.espera) - 0.6) / 1.2);
  ctx.fillStyle = `rgba(0,0,0,${0.65 * a})`;
  ctx.fillRect(0, H / 2 - 60, W, 120);
  ctx.globalAlpha = a;
  ctx.textAlign = "center";
  ctx.font = "60px Georgia";
  ctx.fillStyle = jogo.fim.resultado === "morte" ? "#9b1c1c" : "#d4af37";
  ctx.fillText(jogo.fim.resultado === "morte" ? "VOCÊ MORREU" : "INIMIGO ABATIDO", W / 2, H / 2 + 20);
  ctx.globalAlpha = 1;
}
