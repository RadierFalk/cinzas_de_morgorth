// Cenas do jogo: fases (com plataformas, obstáculos e inimigos) e arenas de chefe.
// O combate é 100% código determinístico. A IA só muda a ESTRATÉGIA dos chefes entre as lutas
// (veja app.py e boss_mcp.py).
import { W, H, CHAO, ctx, estado, avancarBuffer, limparEntrada, canvas, lerp } from "./nucleo.js";
import { novaJogadora, atualizarJogadora, desenharJogadora, rezar } from "./jogador.js";
import { novoBoss, nomeDoChefe, atualizarBoss, atualizarOndas, desenharBoss, desenharOndas } from "./boss.js";
import { novoInimigo, atualizarInimigos, desenharInimigos, vivo } from "./inimigos.js";
import { carregarSprites, desenharCenario, desenharEfeito, ciclo } from "./sprites.js";
import { atualizarEfeitos, desenharEfeitos } from "./efeitos.js";
import { desenharMundo, gerarDecoracao } from "./mundo.js";
import { FASES, ARENAS } from "./fases.js";
import { carregarSons, som, ambienteLigado } from "./sons.js";

export { carregarSprites, carregarSons, nomeDoChefe, FASES };

// Para inspecionar pelo console do navegador: (await import("/static/jogo.js")).depurar()
export const depurar = () => estado.jogo;

function novaCena(modo, cenario, callbacks) {
  limparEntrada();
  const jogo = {
    modo, cenario, t: 0, tremor: 0, hitstop: 0, fim: null, encerrado: false, fade: 1, saida: null,
    mundoW: W, cam: 0, jogador: null, boss: null, inimigos: [], plataformas: [], blocos: [],
    projeteis: [], raios: [], ondas: [], efeitos: [], particulas: [], textos: [],
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
  ambienteLigado(modo === "fase");  // vento só nas fases
  canvas.focus();
  return jogo;
}

/**
 * Fase. callbacks: aoMorrer(), aoAcenderFogueira(x, final), aoAtravessarNevoa()
 * inicioX: onde a jogadora aparece (a fogueira do meio, se já foi acesa). Inimigos que ficaram
 * para trás dela não voltam.
 */
export function iniciarFase(id, callbacks, inicioX = 120) {
  const f = FASES[id];
  const jogo = novaCena("fase", f.cenario, callbacks);
  jogo.faseId = id; jogo.fase = f; jogo.mundoW = f.largura;
  jogo.plataformas = f.plataformas.map((p) => ({ ...p }));
  jogo.blocos = f.blocos.map((b) => ({ ...b }));
  jogo.jogador = novaJogadora(inicioX);
  jogo.inimigos = f.inimigos.filter(([, x]) => x > inicioX + 150).map(([tipo, x, altura]) => novoInimigo(tipo, x, CHAO - altura));
  jogo.fogueiras = [{ x: f.meio, final: false }, { x: f.fogueira, final: true }].map((fg) => ({ ...fg, acesa: fg.x <= inicioX }));
  jogo.decoracao = gerarDecoracao(f.tema, f.largura);
  jogo.cam = Math.max(0, Math.min(jogo.mundoW - W, inicioX - W * 0.4));
  jogo.aviso = { txt: f.nome, vida: 4, total: 4, cor: "#d8cfb8" };
  som("area");
}

/** Luta contra um chefe. A estratégia vem da IA (via servidor). */
export function iniciarLuta(chefe, estrategia, fala, aoTerminar) {
  const jogo = novaCena("chefe", ARENAS[chefe].cenario, { aoTerminar });
  jogo.jogador = novaJogadora(180);
  jogo.boss = novoBoss(chefe, estrategia);
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
  atualizarEfeitos(dt);

  for (const p of jogo.particulas) { p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vida -= dt; }
  jogo.particulas = jogo.particulas.filter((p) => p.vida > 0);
  for (const t of jogo.textos) { t.y -= 40 * dt; t.vida -= dt; }
  jogo.textos = jogo.textos.filter((t) => t.vida > 0);
  if (jogo.legenda && (jogo.legenda.vida -= dt) <= 0) jogo.legenda = null;
  if (jogo.aviso && (jogo.aviso.vida -= dt) <= 0) jogo.aviso = null;
  jogo.tremor *= 0.88;

  // Câmera segue a jogadora (nas arenas ela não se move: tudo cabe na tela)
  const alvo = Math.max(0, Math.min(jogo.mundoW - W, j.x - W * 0.4));
  jogo.cam += (alvo - jogo.cam) * Math.min(1, dt * 6);

  if (jogo.fim && !jogo.encerrado && (jogo.fim.espera -= dt) <= 0) {
    jogo.encerrado = true;
    if (jogo.modo === "chefe") jogo.aoTerminar?.(jogo.log);
    else jogo.aoMorrer?.();
  }
}

function atualizarFase(jogo, dt) {
  const j = jogo.jogador;
  for (const f of jogo.fogueiras) {
    // Acender uma fogueira: recupera vida, fôlego e frascos, e vira o ponto de retorno
    if (!f.acesa && j.estado === "livre" && j.noChao && Math.abs(j.x - f.x) < 40 && j.y > CHAO - 10) {
      f.acesa = true;
      j.hp = j.hpMax; j.hpFantasma = j.hpMax; j.frascos = 3; j.est = j.estMax;
      rezar(j);  // ajoelha diante da fogueira
      som("fogueira", f.x);
      jogo.aviso = { txt: "FOGUEIRA ACESA", vida: 3, total: 3, cor: "#e8b04a" };
      jogo.aoAcenderFogueira?.(f.x, f.final);
    }
    if (f.acesa && Math.random() < 0.3) {
      jogo.particulas.push({ x: f.x + (Math.random() - 0.5) * 20, y: CHAO - 30, vx: (Math.random() - 0.5) * 20,
        vy: -60 - Math.random() * 60, vida: 0.6 + Math.random() * 0.5, cor: Math.random() < 0.5 ? "#ff9a3c" : "#ffd36b", tam: 2 });
    }
  }
  // Atravessar a névoa leva à próxima cena
  if (!jogo.saida && j.x >= jogo.fase.nevoa && j.estado !== "morto") jogo.saida = { t: 0 };
  if (jogo.saida) {
    // Caminha sozinha para dentro da névoa enquanto a tela escurece
    j.dir = 1; j.vx = 60;
    j.x += j.vx * dt;
    if ((jogo.saida.t += dt) >= 1.2 && !jogo.encerrado) { jogo.encerrado = true; jogo.aoAtravessarNevoa?.(); }
  }
}

// Ninguém atravessa ninguém andando (só rolando)
function separarCorpos(jogo) {
  const j = jogo.jogador;
  if (j.estado !== "rolar") {
    const corpos = jogo.boss ? (jogo.boss.estado !== "morto" ? [jogo.boss] : []) : jogo.inimigos.filter(vivo);
    for (const c of corpos) {
      if (Math.abs(j.y - c.y) > 40) continue;  // um em cima da plataforma, outro embaixo
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
  else desenharCenario(ctx, "ruinas", ts * 0.02);  // tela de título: cenário passando devagar
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ===================== Desenho =====================
function desenharFogueiraENevoa(jogo) {
  for (const f of jogo.fogueiras) {
    // Fogueira: espada cravada num monte de cinzas
    ctx.fillStyle = "#2b2622"; ctx.beginPath(); ctx.ellipse(f.x, CHAO, 26, 7, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#8d8f98"; ctx.fillRect(f.x - 2, CHAO - 46, 4, 42);
    ctx.fillStyle = "#5a4a32"; ctx.fillRect(f.x - 9, CHAO - 50, 18, 4);
    if (f.acesa) {
      const g = ctx.createRadialGradient(f.x, CHAO - 20, 4, f.x, CHAO - 20, 130);
      g.addColorStop(0, "rgba(255,160,60,0.4)"); g.addColorStop(1, "rgba(255,160,60,0)");
      ctx.fillStyle = g; ctx.fillRect(f.x - 130, CHAO - 150, 260, 170);
      desenharEfeito(ctx, "fogo", ciclo(jogo.t, 10, 6), f.x, CHAO + 2, 0.5);
    } else {
      ctx.fillStyle = "#ff7a2a"; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(jogo.t * 4);
      ctx.fillRect(f.x - 6, CHAO - 4, 3, 2); ctx.fillRect(f.x + 4, CHAO - 3, 2, 2);
      ctx.globalAlpha = 1;
    }
  }
  // Névoa que leva à próxima cena
  const nx = jogo.fase.nevoa;
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = `rgba(220,225,235,${0.08 + 0.05 * Math.sin(jogo.t * 2 + i)})`;
    ctx.fillRect(nx + i * 10 + Math.sin(jogo.t * 1.5 + i) * 6, CHAO - 240, 26, 240);
  }
}

function desenhar() {
  const jogo = estado.jogo;
  ctx.save();
  if (jogo.tremor > 0.5) ctx.translate((Math.random() - 0.5) * jogo.tremor, (Math.random() - 0.5) * jogo.tremor);
  desenharCenario(ctx, jogo.cenario, jogo.cam);
  if (jogo.fase?.tinta) { ctx.fillStyle = jogo.fase.tinta; ctx.fillRect(0, 0, W, H); }  // clima de cada fase

  ctx.save();
  ctx.translate(-Math.round(jogo.cam), 0);  // daqui em diante: coordenadas do mundo
  if (jogo.modo === "fase") {
    desenharMundo(ctx);
    desenharFogueiraENevoa(jogo);
    desenharInimigos(ctx);
  }
  if (jogo.boss) { desenharOndas(ctx, jogo.t); desenharBoss(ctx, jogo.boss); }
  desenharJogadora(ctx, jogo.jogador, jogo.t);
  desenharEfeitos(ctx);
  for (const p of jogo.particulas) {
    ctx.globalAlpha = Math.min(1, p.vida * 2); ctx.fillStyle = p.cor;
    ctx.fillRect(p.x, p.y, p.tam, p.tam);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  for (const t of jogo.textos) {
    ctx.font = `bold ${t.tamanho}px Georgia`;
    ctx.globalAlpha = Math.min(1, t.vida * 2); ctx.fillStyle = t.cor;
    ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  desenharCenario(ctx, jogo.cenario, jogo.cam, true);  // camadas da frente (vaga-lumes etc.)
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
  // Fôlego: pisca em vermelho quando falta fôlego para a ação
  const semFolego = j.semFolego > 0 && Math.floor(jogo.t * 16) % 2 === 0;
  barra(24, 40, 200, 7, j.est / j.estMax, null, semFolego ? "#c0392b" : "#3f8f4a");
  if (j.semFolego > 0) { ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 2; ctx.strokeRect(21, 37, 206, 13); }
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < j.frascos ? "#e8c35a" : "#3a3a3a";
    ctx.beginPath(); ctx.arc(32 + i * 20, 64, 6, 0, Math.PI * 2); ctx.fill();
  }

  ctx.textAlign = "center";
  if (b) {
    ctx.font = "18px Georgia"; ctx.fillStyle = "#efe4c8";
    ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
    ctx.fillText(b.perfil.nome, W / 2, H - 38);
    ctx.shadowBlur = 0;
    barra(W / 2 - 300, H - 28, 600, 9, b.hp / b.hpMax, b.hpFantasma / b.hpMax, "#8b1a1a");
  }
  if (jogo.legenda) {
    ctx.globalAlpha = Math.min(1, jogo.legenda.vida, (7 - jogo.legenda.vida) * 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(80, 82, W - 160, 66);
    ctx.font = "italic 19px Georgia"; ctx.fillStyle = "#efe4c8";
    quebrarTexto(`“${jogo.legenda.txt}”`, W / 2, 110, 760, 26);
    ctx.globalAlpha = 1;
  }
  if (jogo.aviso) {
    // Letreiro no estilo souls: nome da área / fogueira acesa
    const a = jogo.aviso;
    ctx.globalAlpha = Math.max(0, Math.min(1, a.vida, (a.total - a.vida) * 2));  // aparece e some suavemente
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, H / 2 - 120, W, 70);
    ctx.font = "40px Georgia"; ctx.fillStyle = a.cor;
    ctx.fillText(a.txt, W / 2, H / 2 - 72);
    ctx.globalAlpha = 1;
  }
  if (jogo.t < 8) {
    ctx.globalAlpha = Math.min(1, 8 - jogo.t) * 0.8;
    ctx.font = "13px system-ui"; ctx.fillStyle = "#ddd"; ctx.textAlign = "right";
    ctx.shadowColor = "#000"; ctx.shadowBlur = 3;
    ctx.fillText("A/D mover · W pular · S descer · Shift esquivar · J atacar (no ar: mergulho) · F curar", W - 20, 30);
    ctx.shadowBlur = 0;
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
