// Cenas do jogo: fases (plataformas, rampas, escadas, estruturas, abismos, inimigos e NPCs) e arenas de chefe.
// O combate é 100% código determinístico. A IA muda a ESTRATÉGIA dos chefes entre as lutas e fala pelos
// NPCs (veja app.py, boss_mcp.py e mercador_mcp.py).
import { W, H, CHAO, ctx, estado, avancarBuffer, limparEntrada, consumir, canvas, lerp, texto } from "./nucleo.js";
import { novaJogadora, atualizarJogadora, desenharJogadora, rezar, configurarJogadora, itemSelecionado,
  atualizarArmasDaJogadora, desenharArmasDaJogadora } from "./jogador.js";
import { novoBoss, nomeDoChefe, atualizarBoss, atualizarOndas, desenharBoss, desenharOndas } from "./boss.js";
import { novoInimigo, atualizarInimigos, desenharInimigos, alvejavel } from "./inimigos.js";
import { carregarSprites, desenharCenario, desenharEfeito, desenharSprite, desenharIcone, desenharBarra, ciclo, nQuadros } from "./sprites.js";
import { atualizarEfeitos, desenharEfeitos } from "./efeitos.js";
import { desenharMundo, gerarDecoracao, pisoEm, TEMAS } from "./mundo.js";
import { iniciarAmbiente, atualizarAmbiente, desenharAmbiente } from "./ambiente.js";
import { FASES, ARENAS } from "./fases.js";
import { carregarSons, som, ambienteLigado } from "./sons.js";

export { carregarSprites, carregarSons, nomeDoChefe, FASES };

// Para inspecionar pelo console do navegador: (await import("/static/jogo.js")).depurar()
export const depurar = () => estado.jogo;

// NPCs: animação parada, o que dizem ao chegar perto e o que o E abre
const NPCS = {
  guardia: { nome: "Guardiã do Fogo", anim: "parado", fps: 6, convite: "E — Subir de nível" },
  mercador: { nome: "Ozren, o Mercador", anim: "parado", fps: 6, convite: "E — Comprar / conversar" },
  ferreiro: { nome: "Ferreiro", anim: "parado", fps: 8, convite: "E — Melhorar armas" },
  cavaleiro_errante: { nome: "Cavaleiro Errante", anim: "parado", fps: 7, convite: "E — Pedir conselho" },
};

function novaCena(modo, cenario, callbacks, contexto) {
  limparEntrada();
  const jogo = {
    modo, cenario, t: 0, tremor: 0, hitstop: 0, fim: null, encerrado: false, pausado: false, fade: 1, saida: null,
    mundoW: W, cam: 0, jogador: null, boss: null, inimigos: [], plataformas: [], blocos: [], rampas: [], escadas: [], buracos: [],
    projeteis: [], raios: [], ondas: [], efeitos: [], particulas: [], textos: [], bombas: [], magias: [], itensNoChao: [],
    npcs: [], decoracao: [], fogueiras: [], legenda: null, aviso: null, convite: null,
    personagem: contexto?.personagem, catalogo: contexto?.catalogo, almasGanhas: 0, recuperou: false, encontrados: {},
    ...callbacks,
    log: {
      resultado: null, duracao_s: 0, fase_alcancada: 1,
      esquivas: { para_frente: 0, para_tras: 0 }, pulos: 0, bloqueios: 0,
      curas_hp_antes: [], curas_punidas: 0, tentou_curar_sem_frasco: 0,
      ataques: { acertos: 0, erros: 0 }, dano_recebido: {}, golpe_final: null,
    },
  };
  jogo.alvos = () => (jogo.boss ? (jogo.boss.estado !== "morto" ? [jogo.boss] : []) : jogo.inimigos.filter(alvejavel));
  jogo.terminar = (resultado) => terminar(jogo, resultado);
  estado.jogo = jogo;
  ambienteLigado(modo === "fase");  // vento só nas fases
  canvas.focus();
  return jogo;
}

/**
 * Fase. callbacks: aoMorrer(x), aoAcenderFogueira(x, final), aoAtravessarNevoa(), aoInteragir(alvo)
 * inicioX: onde a jogadora aparece (a fogueira do meio, se já foi acesa). Inimigos que ficaram
 * para trás dela não voltam. contexto: { personagem, catalogo } vindos do servidor.
 */
export function iniciarFase(id, callbacks, inicioX = 120, contexto = null) {
  const f = FASES[id];
  const jogo = novaCena("fase", f.cenario, callbacks, contexto);
  jogo.faseId = id; jogo.fase = f; jogo.mundoW = f.largura;
  for (const chave of ["plataformas", "blocos", "rampas", "escadas", "buracos"]) jogo[chave] = (f[chave] || []).map((o) => ({ ...o }));
  jogo.jogador = novaJogadora(inicioX);
  jogo.jogador.y = pisoEm(inicioX, CHAO - 400);
  configurarJogadora(jogo.jogador, jogo.personagem, jogo.catalogo);
  jogo.inimigos = f.inimigos.filter(([, x]) => x > inicioX + 150).map(([tipo, x, altura]) => novoInimigo(tipo, x, CHAO - altura));
  jogo.fogueiras = [{ x: f.meio, final: false }, { x: f.fogueira, final: true }].map((fg) => ({ ...fg, acesa: fg.x <= inicioX }));
  jogo.npcs = (f.npcs || []).map(([tipo, x]) => ({ tipo, x, y: pisoEm(x, CHAO - 400), t: Math.random() * 3 }));
  jogo.itensNoChao = (f.itens || []).filter(([, x]) => x > inicioX).map(([item, x, altura]) => ({ item, x, y: CHAO - altura, t: 0 }));
  jogo.decoracao = gerarDecoracao(f.tema, f.largura);
  jogo.cam = Math.max(0, Math.min(jogo.mundoW - W, inicioX - W * 0.4));
  iniciarAmbiente(jogo, TEMAS[f.tema]?.clima);
  jogo.aviso = { txt: f.nome, vida: 4, total: 4, cor: "#d8cfb8" };
  som("area");
}

/** Luta contra um chefe. A estratégia vem da IA (via servidor). */
export function iniciarLuta(chefe, estrategia, fala, aoTerminar, contexto = null) {
  const jogo = novaCena("chefe", ARENAS[chefe].cenario, { aoTerminar }, contexto);
  jogo.chefe = chefe;
  jogo.jogador = novaJogadora(180);
  configurarJogadora(jogo.jogador, jogo.personagem, jogo.catalogo);
  jogo.boss = novoBoss(chefe, estrategia);
  iniciarAmbiente(jogo, ARENAS[chefe].clima);
  if (fala) jogo.legenda = { txt: fala, vida: 7 };
}

// ===================== Pausa e sincronização (menus da fogueira) =====================
export function pausar() { if (estado.jogo) { estado.jogo.pausado = true; limparEntrada(); } }
export function retomar() { if (estado.jogo) { estado.jogo.pausado = false; limparEntrada(); } }

/** Aplica um personagem novo (depois de comprar, subir de nível, equipar). descansar: enche vida e frascos. */
export function aplicarPersonagem(personagem, catalogo, descansar = false) {
  const jogo = estado.jogo;
  if (!jogo) return;
  jogo.personagem = personagem; jogo.catalogo = catalogo;
  configurarJogadora(jogo.jogador, personagem, catalogo, descansar);
}

/** O que mudou nesta cena desde a última sincronização (e zera os contadores). */
export function relatorioDaCena() {
  const jogo = estado.jogo;
  if (!jogo) return null;
  const r = { almas_ganhas: jogo.almasGanhas, consumiveis: { ...(jogo.personagem?.consumiveis || {}) },
    recuperou: jogo.recuperou, encontrados: { ...jogo.encontrados } };
  jogo.almasGanhas = 0; jogo.recuperou = false; jogo.encontrados = {};
  return r;
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
    arma: jogo.personagem?.arma, escudo: jogo.personagem?.escudo, nivel: jogo.personagem?.nivel,
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
  atualizarArmasDaJogadora(dt);
  if (jogo.boss) { atualizarBoss(dt); atualizarOndas(dt); }
  else atualizarInimigos(dt);
  separarCorpos(jogo);
  atualizarColetaveis(jogo, dt);
  if (jogo.modo === "fase") atualizarFase(jogo, dt);
  atualizarEfeitos(dt);
  atualizarAmbiente(dt);

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
    if (jogo.modo === "chefe") jogo.aoTerminar?.(jogo.log, j.x);
    else jogo.aoMorrer?.(j.x);
  }
}

// Itens caídos e a mancha de almas deixada na última morte
function atualizarColetaveis(jogo, dt) {
  const j = jogo.jogador;
  if (j.estado === "morto") return;
  for (const it of jogo.itensNoChao) {
    it.t += dt;
    if (Math.abs(it.x - j.x) < 26 && Math.abs(it.y - j.y) < 40) {
      it.pego = true;
      jogo.personagem.consumiveis[it.item] = (jogo.personagem.consumiveis[it.item] || 0) + 1;
      jogo.encontrados[it.item] = (jogo.encontrados[it.item] || 0) + 1;
      texto(it.x, it.y - 40, `+1 ${jogo.catalogo?.consumiveis[it.item]?.nome || it.item}`, "#7be07b", 14);
      som("pegar_item", it.x);
    }
  }
  jogo.itensNoChao = jogo.itensNoChao.filter((it) => !it.pego);
  const perdidas = jogo.personagem?.almas_perdidas;
  const cenaAtual = jogo.faseId || jogo.chefe;
  if (perdidas && perdidas.cena === cenaAtual && Math.abs(perdidas.x - j.x) < 30) {
    jogo.recuperou = true;
    jogo.personagem.almas += perdidas.qtd;
    jogo.personagem.almas_perdidas = null;
    texto(j.x, j.y - 110, `Almas recuperadas: ${perdidas.qtd}`, "#8fe3ff", 16);
    som("recuperar_almas", j.x);
  }
}

function atualizarFase(jogo, dt) {
  const j = jogo.jogador;
  for (const f of jogo.fogueiras) {
    // Acender uma fogueira: recupera vida, fôlego e frascos, e vira o ponto de retorno
    if (!f.acesa && j.estado === "livre" && j.noChao && Math.abs(j.x - f.x) < 40 && j.y > CHAO - 10) {
      f.acesa = true;
      j.hp = j.hpMax; j.hpFantasma = j.hpMax; j.frascos = j.frascosMax ?? 3; j.est = j.estMax;
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
  // O que dá para fazer com E aqui: uma fogueira acesa ou um NPC por perto
  jogo.convite = null;
  if (j.estado === "livre" && j.noChao) {
    const npc = jogo.npcs.find((n) => Math.abs(n.x - j.x) < 46 && Math.abs(n.y - j.y) < 30);
    const fogueira = jogo.fogueiras.find((f) => f.acesa && Math.abs(f.x - j.x) < 46 && j.y > CHAO - 10);
    if (npc) jogo.convite = { tipo: npc.tipo, texto: NPCS[npc.tipo].convite, x: npc.x, y: npc.y };
    else if (fogueira) jogo.convite = { tipo: "fogueira", texto: "E — Descansar na fogueira", x: fogueira.x, y: CHAO };
  }
  if (consumir("interagir") && jogo.convite && jogo.aoInteragir) {
    if (jogo.convite.tipo === "fogueira") { rezar(j); som("fogueira", j.x, 0.5); }
    jogo.aoInteragir(jogo.convite.tipo);
  }
  for (const n of jogo.npcs) n.t += dt;
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
  if (j.estado !== "rolar" && j.estado !== "escalar") {
    const corpos = jogo.boss ? (jogo.boss.estado !== "morto" ? [jogo.boss] : []) : jogo.inimigos.filter(alvejavel);
    for (const c of corpos) {
      if (Math.abs(j.y - c.y) > 40) continue;  // um em cima da plataforma, outro embaixo (ou voando)
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
  if (estado.jogo) { if (!estado.jogo.pausado) atualizar(dt); desenhar(); }
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

function desenharNpcs(jogo) {
  for (const n of jogo.npcs) {
    const def = NPCS[n.tipo];
    desenharSprite(ctx, n.tipo, def.anim, ciclo(n.t, def.fps, nQuadros(n.tipo, def.anim)), n.x, n.y, { dir: n.x > jogo.jogador.x ? -1 : 1 });
  }
}

function desenharColetaveis(jogo) {
  for (const it of jogo.itensNoChao) {
    const y = it.y - 18 + Math.sin(it.t * 4) * 3;
    ctx.save();
    ctx.fillStyle = "rgba(255,240,180,0.25)"; ctx.beginPath(); ctx.arc(it.x, y + 8, 14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    desenharIcone(ctx, jogo.catalogo?.consumiveis[it.item]?.icone, it.x - 10, y - 2, 20);
  }
  const perdidas = jogo.personagem?.almas_perdidas;
  if (perdidas && perdidas.cena === (jogo.faseId || jogo.chefe)) {
    // Mancha de almas: brilho verde onde a jogadora morreu da última vez
    const y = pisoEm(perdidas.x, CHAO - 300) - 16, pulso = 0.6 + 0.4 * Math.sin(jogo.t * 3);
    const g = ctx.createRadialGradient(perdidas.x, y, 2, perdidas.x, y, 26);
    g.addColorStop(0, `rgba(160,255,200,${pulso})`); g.addColorStop(1, "rgba(80,220,140,0)");
    ctx.fillStyle = g; ctx.fillRect(perdidas.x - 26, y - 26, 52, 52);
  }
}

function desenhar() {
  const jogo = estado.jogo;
  ctx.save();
  if (jogo.tremor > 0.5) ctx.translate((Math.random() - 0.5) * jogo.tremor, (Math.random() - 0.5) * jogo.tremor);
  desenharCenario(ctx, jogo.cenario, jogo.cam);
  if (jogo.fase?.tinta) {
    // Cor de cada fase sobre o fundo ("multiply" tinge o fundo inteiro, ex.: o vermelho do Abismo Rubro)
    ctx.save();
    if (jogo.fase.mistura) ctx.globalCompositeOperation = jogo.fase.mistura;
    ctx.fillStyle = jogo.fase.tinta; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(-Math.round(jogo.cam), 0);  // daqui em diante: coordenadas do mundo
  if (jogo.modo === "fase") {
    desenharMundo(ctx);
    desenharFogueiraENevoa(jogo);
    desenharNpcs(jogo);
    desenharInimigos(ctx);
  }
  desenharColetaveis(jogo);
  if (jogo.boss) { desenharOndas(ctx, jogo.t); desenharBoss(ctx, jogo.boss); }
  desenharJogadora(ctx, jogo.jogador, jogo.t);
  desenharArmasDaJogadora(ctx);
  desenharEfeitos(ctx);
  desenharAmbiente(ctx);
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
  if (jogo.convite) {
    ctx.font = "13px system-ui"; ctx.fillStyle = "#efe4c8"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
    ctx.fillText(jogo.convite.texto, jogo.convite.x, jogo.convite.y - 96);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
  desenharCenario(ctx, jogo.cenario, jogo.cam, true);  // camadas da frente (vaga-lumes etc.)
  ctx.restore();

  desenharHUD(jogo);
  desenharTelaFinal(jogo);
  const escuro = Math.max(jogo.fade, jogo.saida ? Math.min(1, jogo.saida.t / 1.2) : 0);
  if (escuro > 0) { ctx.fillStyle = `rgba(0,0,0,${escuro})`; ctx.fillRect(0, 0, W, H); }
  if (jogo.pausado) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, W, H); }
}

function desenharHUD(jogo) {
  const j = jogo.jogador, b = jogo.boss, p = jogo.personagem;
  // Vida e fôlego crescem com Vigor e Fôlego (a barra fica mais comprida, como nos souls)
  desenharBarra(ctx, "vida", 20, 16, 180 + j.hpMax * 0.9, 20, j.hp / j.hpMax, j.hpFantasma / j.hpMax);
  desenharBarra(ctx, "folego", 20, 40, 150 + j.estMax * 0.8, 16, j.est / j.estMax, null, j.semFolego > 0 && Math.floor(jogo.t * 16) % 2 === 0);
  // Frascos de Estus
  desenharIcone(ctx, ["magia", 7, 4], 18, 60, 28);
  ctx.font = "bold 15px Georgia"; ctx.textAlign = "left"; ctx.fillStyle = "#efe4c8"; ctx.shadowColor = "#000"; ctx.shadowBlur = 3;
  ctx.fillText(`${j.frascos}/${j.frascosMax ?? 3}`, 48, 80);
  // Arma, escudo e item rápido
  const quadro = (x, y, icone, legenda) => {
    ctx.fillStyle = "rgba(10,10,14,0.6)"; ctx.fillRect(x, y, 34, 34);
    ctx.strokeStyle = "#5a4a32"; ctx.lineWidth = 2; ctx.strokeRect(x, y, 34, 34);
    desenharIcone(ctx, icone, x + 3, y + 3, 28);
    if (legenda) { ctx.font = "bold 11px system-ui"; ctx.fillStyle = "#efe4c8"; ctx.fillText(legenda, x + 2, y + 46); }
  };
  if (p && jogo.catalogo) {
    const arma = jogo.catalogo.armas[p.arma], nivelArma = p.armas[p.arma] || 0;
    quadro(96, 58, arma?.icone, nivelArma ? `+${nivelArma}` : "");
    if (j.stats.escudo) quadro(134, 58, j.stats.escudo.icone, "L");
    const item = itemSelecionado(j);
    if (item) quadro(172, 58, jogo.catalogo.consumiveis[item].icone, `Q x${p.consumiveis[item]}`);
    // Almas (canto inferior direito, estilo souls)
    const almas = p.almas + jogo.almasGanhas;
    ctx.textAlign = "right"; ctx.font = "bold 20px Georgia"; ctx.fillStyle = "#cfefff";
    ctx.fillText(`${almas}`, W - 24, H - (b ? 58 : 24));
    ctx.font = "11px system-ui"; ctx.fillStyle = "#8fb8cc";
    ctx.fillText(`ALMAS · NÍVEL ${p.nivel}`, W - 24, H - (b ? 74 : 40));
  }
  ctx.shadowBlur = 0;

  ctx.textAlign = "center";
  if (b) {
    ctx.font = "18px Georgia"; ctx.fillStyle = "#efe4c8";
    ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
    ctx.fillText(b.perfil.nome, W / 2, H - 40);
    ctx.shadowBlur = 0;
    desenharBarra(ctx, "chefe", W / 2 - 310, H - 32, 620, 22, b.hp / b.hpMax, b.hpFantasma / b.hpMax);
  }
  if (jogo.legenda) {
    ctx.globalAlpha = Math.min(1, jogo.legenda.vida, (7 - jogo.legenda.vida) * 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(80, 102, W - 160, 66);
    ctx.font = "italic 19px Georgia"; ctx.fillStyle = "#efe4c8";
    quebrarTexto(`“${jogo.legenda.txt}”`, W / 2, 130, 760, 26);
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
  if (jogo.t < 9) {
    ctx.globalAlpha = Math.min(1, 9 - jogo.t) * 0.85;
    ctx.font = "12px system-ui"; ctx.fillStyle = "#ddd"; ctx.textAlign = "right";
    ctx.shadowColor = "#000"; ctx.shadowBlur = 3;
    ctx.fillText("A/D mover · W pular/subir escada · S descer · Shift rolar · J atacar (no ar: mergulho)", W - 20, 24);
    ctx.fillText("L bloquear · F frasco · Q usar item · R trocar item · E interagir", W - 20, 40);
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
