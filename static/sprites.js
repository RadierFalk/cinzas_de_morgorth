// Folhas de sprites (Craftpix). Cada PNG é uma tira horizontal de quadros 128x128,
// com o personagem olhando para a DIREITA e os pés na base do quadro.

const Q = 128;

// anim: [arquivo, nº de quadros, âncora]
// âncora = x do centro dos pés dentro do quadro (medido nos PNGs). Sem ela o personagem
// "pularia" para o lado ao trocar de animação, porque cada folha tem o corpo num lugar diferente.
const PERSONAGENS = {
  garota: { pasta: "sprint_girl2/Girl_2", escala: 1, anims: {
    parado: ["Idle", 7, 68], andar: ["Walk", 12, 63], ataque: ["Attack", 9, 60],
    falar: ["Dialogue", 6, 56], defesa: ["Protection", 2, 68] } },
  minotauro: { pasta: "sprint_minotaur2/Minotaur_2", escala: 1.4, anims: {
    parado: ["Idle", 10, 57], andar: ["Walk", 12, 53], ataque: ["Attack", 5, 53],  // ataque alinhado pelo tronco
    ferido: ["Hurt", 3, 64], morte: ["Dead", 5, 46] } },
  guerreiro: { pasta: "esqueleto_2/Skeleton_Warrior", escala: 1, anims: {
    parado: ["Idle", 7, 64], andar: ["Walk", 7, 70], ataque: ["Attack_1", 5, 52],
    ferido: ["Hurt", 2, 63], morte: ["Dead", 4, 62], defesa: ["Protect", 1, 66] } },
  lanceiro: { pasta: "esqueleto_2/Skeleton_Spearman", escala: 1, anims: {
    parado: ["Idle", 7, 59], andar: ["Walk", 7, 58], ataque: ["Attack_1", 4, 42],
    ferido: ["Hurt", 3, 68], morte: ["Dead", 5, 66], defesa: ["Protect", 2, 64] } },
  arqueiro: { pasta: "esqueleto_2/Skeleton_Archer", escala: 1, anims: {
    parado: ["Idle", 7, 60], andar: ["Walk", 8, 66], ataque: ["Shot_1", 15, 60],
    ferido: ["Hurt", 2, 62], morte: ["Dead", 5, 52] } },
};

const folhas = {};  // "garota/parado" -> { img, branco, vermelho, n, ancora }
let flecha = null;

export function carregarSprites() {
  const promessas = [];
  for (const [nome, p] of Object.entries(PERSONAGENS)) {
    for (const [anim, [arquivo, n, ancora]] of Object.entries(p.anims)) {
      promessas.push(carregarImagem(`/static/${p.pasta}/${arquivo}.png`)
        .then((img) => { folhas[`${nome}/${anim}`] = { img, n, ancora, branco: tingir(img, "#ffffff"), vermelho: tingir(img, "#ff2a1a") }; })
        .catch(() => {}));  // se falhar, o personagem é desenhado como silhueta
    }
  }
  promessas.push(carregarImagem("/static/esqueleto_2/Skeleton_Archer/Arrow.png").then((img) => (flecha = img)).catch(() => {}));
  return Promise.all(promessas);
}

function carregarImagem(src) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = erro;
    img.src = src;
  });
}

// Cópia da folha pintada de uma cor só: usada para o "flash" branco ao levar dano
function tingir(img, cor) {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = cor;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export const nQuadros = (nome, anim) => PERSONAGENS[nome].anims[anim][1];
export const ciclo = (t, fps, n) => Math.floor(t * fps) % n;
export const escalaDe = (nome) => PERSONAGENS[nome].escala;

/**
 * Desenha um quadro com os pés em (x, y).
 * opts: dir (1 direita, -1 esquerda), alpha, branco (0..1 flash), vermelho (0..1), rot (radianos), pivo (altura do giro)
 */
export function desenharSprite(ctx, nome, anim, quadro, x, y, opts = {}) {
  const { dir = 1, alpha = 1, branco = 0, vermelho = 0, rot = 0, pivo = 36 } = opts;
  const s = folhas[`${nome}/${anim}`];
  const escala = PERSONAGENS[nome].escala;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (rot) { ctx.translate(0, -pivo * escala); ctx.rotate(rot); ctx.translate(0, pivo * escala); }
  ctx.scale(dir * escala, escala);
  if (!s) {
    // Silhueta de reserva (imagem não carregou)
    ctx.fillStyle = "#444"; ctx.fillRect(-12, -64, 24, 64);
    ctx.restore();
    return;
  }
  ctx.imageSmoothingEnabled = false;  // pixel art nítida
  const q = Math.max(0, Math.min(s.n - 1, Math.floor(quadro)));
  const desenhar = (fonte) => ctx.drawImage(fonte, q * Q, 0, Q, Q, -s.ancora, -Q, Q, Q);
  desenhar(s.img);
  const a = ctx.globalAlpha;
  if (vermelho > 0) { ctx.globalAlpha = a * vermelho; desenhar(s.vermelho); }
  if (branco > 0) { ctx.globalAlpha = a * branco; desenhar(s.branco); }
  ctx.restore();
}

export function desenharFlecha(ctx, x, y, dir) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(dir, 1);
  if (flecha) { ctx.imageSmoothingEnabled = false; ctx.drawImage(flecha, -24, -24.5); }
  else { ctx.fillStyle = "#ccc"; ctx.fillRect(-20, -1, 40, 2); }
  ctx.restore();
}
