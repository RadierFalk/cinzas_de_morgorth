// Trilha sonora: uma música em loop por cena, com transição suave (fade) entre elas.
// Coloque os arquivos em static/audio/ com estes nomes. Se um arquivo não existir, a cena fica em silêncio.
const FAIXAS = {
  titulo: "titulo.mp3",
  ruinas: "ruinas.mp3",
  minotauro: "chefe_minotauro.mp3",
  floresta: "floresta.mp3",
  cripta: "cripta.mp3",
  gorgona: "chefe_gorgona.mp3",
  torre: "torre.mp3",
  arquimago: "chefe_arquimago.mp3",
  abismo: "abismo.mp3",
  arquidemonio: "chefe_arquidemonio.mp3",
  vitoria: "vitoria.mp3",
};
const VOLUME = 0.45;
const FADE_S = 1.2;

let atual = null;  // { nome, audio }
let mudo = false;
try { mudo = localStorage.getItem("musica_muda") === "1"; } catch {}

/** Troca para a música da cena (não faz nada se já estiver tocando). */
export function tocar(nome) {
  if (atual?.nome === nome) return;
  if (atual) desvanecer(atual.audio);
  const arquivo = FAIXAS[nome];
  if (!arquivo) { atual = null; return; }
  const audio = new Audio(`/static/audio/${arquivo}`);
  audio.loop = true;
  audio.volume = 0;
  audio.muted = mudo;
  audio.addEventListener("error", () => {});  // arquivo ausente: silêncio
  // Navegadores só deixam tocar som depois de um clique/tecla; por isso a música começa nos botões
  audio.play().then(() => aparecer(audio)).catch(() => {});
  atual = { nome, audio };
}

export function alternarMudo() {
  mudo = !mudo;
  try { localStorage.setItem("musica_muda", mudo ? "1" : "0"); } catch {}
  if (atual) atual.audio.muted = mudo;
  return mudo;
}
export const estaMudo = () => mudo;

function aparecer(audio) { animarVolume(audio, VOLUME); }
function desvanecer(audio) { animarVolume(audio, 0, () => audio.pause()); }

function animarVolume(audio, alvo, depois) {
  const inicio = audio.volume, t0 = performance.now();
  const passo = (agora) => {
    const p = Math.min(1, (agora - t0) / (FADE_S * 1000));
    audio.volume = inicio + (alvo - inicio) * p;
    if (p < 1) requestAnimationFrame(passo);
    else depois?.();
  };
  requestAnimationFrame(passo);
}
