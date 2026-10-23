// Efeitos sonoros (pasta sounds/Sounds Pack), tocados com a Web Audio API:
// o mesmo som pode tocar várias vezes ao mesmo tempo, com o tom variando um pouco para não cansar.
import { estado, W } from "./nucleo.js";

const PASTA = "sounds/Sounds Pack";
// nome do efeito: [arquivos (sorteia um), volume]
const SONS = {
  // Jogadora
  golpe: [["Other/whoosh_1", "Other/whoosh_2", "Combat and Gore/swipe"], 0.35],
  acerto: [["Weapons/sword_slice", "Combat and Gore/punch_2"], 0.5],
  critico: [["Combat and Gore/crunch_splat", "Combat and Gore/bone_snap"], 0.7],
  bloqueado: [["Weapons/sword_clash", "Weapons/sword_clash_2"], 0.5],
  rolar: [["Materials/clothing_1", "Materials/clothing_2"], 0.5],
  pulo: [["Materials/clothing_thud"], 0.35],
  passo: [["Footsteps/foley_footstep_gravel_1", "Footsteps/foley_footstep_gravel_2", "Footsteps/foley_footstep_gravel_3", "Footsteps/foley_footstep_gravel_4"], 0.18],
  mergulho: [["Retro/explosion_quick"], 0.45],
  curar: [["Other/drink_slurp"], 0.6],
  sem_folego: [["UI/sci_fi_disallow"], 0.3],
  ferida: [["Combat and Gore/punch", "Combat and Gore/punch_3"], 0.55],
  petrificada: [["Materials/stone_push_medium"], 0.6],
  morte: [["Musical Effects/brass_defeated"], 0.55],
  // Inimigos
  osso: [["Combat and Gore/bone_snap"], 0.5],
  morte_mago: [["Combat and Gore/splat_quick", "Combat and Gore/squelching_3"], 0.45],
  golpe_inimigo: [["Combat and Gore/swipe"], 0.3],
  flecha: [["Other/elastic_twang"], 0.35],
  bola_fogo: [["Environment/fire_lighting"], 0.4],
  magia: [["Other/whoosh_1"], 0.3],
  explosao: [["Retro/explosion_small"], 0.35],
  raio: [["Retro/explosion_medium", "Environment/air_burst"], 0.45],
  // Chefes
  golpe_chefe: [["Other/whoosh_2"], 0.5],
  investida: [["Materials/stone_push_short"], 0.6],
  impacto: [["Retro/explosion_large"], 0.6],
  olhar: [["Retro/ghost"], 0.45],
  urro: [["Musical Effects/horror_sting"], 0.6],
  chefe_derrotado: [["Musical Effects/brass_level_complete"], 0.6],
  // Mundo e interface
  fogueira: [["Environment/fire_lighting", "Musical Effects/harpsichord_inn"], 0.55],
  area: [["Musical Effects/harpsichord_mystery"], 0.45],
  vitoria: [["Musical Effects/brass_positive_long"], 0.55],
  clique: [["UI/select_1"], 0.4],
};
const AMBIENTE = "Environment/ambient_wind";  // vento em loop nas fases

let ctxAudio = null, mestre = null;
const buffers = {};
let mudo = false;
try { mudo = localStorage.getItem("efeitos_mudos") === "1"; } catch {}

/** Baixa e decodifica todos os sons (chamar no início). Sem suporte a áudio, tudo vira silêncio. */
export async function carregarSons() {
  const Contexto = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Contexto || !globalThis.fetch) return;
  ctxAudio = new Contexto();
  mestre = ctxAudio.createGain();
  mestre.gain.value = mudo ? 0 : 1;
  mestre.connect(ctxAudio.destination);
  const arquivos = new Set([AMBIENTE, ...Object.values(SONS).flatMap(([lista]) => lista)]);
  await Promise.all([...arquivos].map(async (arq) => {
    try {
      const resp = await fetch(encodeURI(`/static/${PASTA}/${arq}.wav`));
      buffers[arq] = await ctxAudio.decodeAudioData(await resp.arrayBuffer());
    } catch { /* arquivo ausente: esse som fica mudo */ }
  }));
}

/** Navegadores só liberam o áudio depois de um clique/tecla: chame isso num clique. */
export function liberarAudio() { ctxAudio?.resume?.(); }

/**
 * Toca um efeito. x (opcional): posição no mundo; sons longe da câmera ficam mais baixos.
 */
export function som(nome, x = null, volumeExtra = 1) {
  if (!ctxAudio || mudo) return;
  const [lista, volume] = SONS[nome] || [[], 0];
  const buffer = buffers[lista[Math.floor(Math.random() * lista.length)]];
  if (!buffer) return;
  let distancia = 1;
  const jogo = estado.jogo;
  if (x != null && jogo) distancia = Math.max(0, 1 - Math.abs(x - (jogo.cam + W / 2)) / 900);
  if (distancia <= 0) return;
  const fonte = ctxAudio.createBufferSource();
  fonte.buffer = buffer;
  fonte.playbackRate.value = 0.93 + Math.random() * 0.14;  // pequena variação de tom
  const ganho = ctxAudio.createGain();
  ganho.gain.value = volume * volumeExtra * distancia;
  fonte.connect(ganho).connect(mestre);
  fonte.start();
}

let ambiente = null;
/** Liga/desliga o vento ambiente (nas fases). */
export function ambienteLigado(ligado) {
  if (!ctxAudio) return;
  if (ligado && !ambiente && buffers[AMBIENTE]) {
    const fonte = ctxAudio.createBufferSource();
    fonte.buffer = buffers[AMBIENTE]; fonte.loop = true;
    const ganho = ctxAudio.createGain(); ganho.gain.value = 0.18;
    fonte.connect(ganho).connect(mestre);
    fonte.start();
    ambiente = fonte;
  } else if (!ligado && ambiente) {
    ambiente.stop(); ambiente = null;
  }
}

export function alternarEfeitos() {
  mudo = !mudo;
  try { localStorage.setItem("efeitos_mudos", mudo ? "1" : "0"); } catch {}
  if (mestre) mestre.gain.value = mudo ? 0 : 1;
  return mudo;
}
export const efeitosMudos = () => mudo;
