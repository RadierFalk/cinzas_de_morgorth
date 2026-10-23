// Todas as imagens do jogo: personagens, projéteis, efeitos (explosões), cenários e peças do mundo.
// Folhas de personagem: quadros com o personagem olhando para a DIREITA e os pés na base do quadro.
// A maioria (Craftpix) é uma tira horizontal de quadros 128x128; o cavaleiro (pasta person) usa
// quadros 128x64 organizados em GRADE (várias linhas por arquivo).

const W = 960, H = 540;

// anim: [arquivo, nº de quadros, âncora]
// âncora = x do corpo dentro do quadro (medido nos PNGs). Sem ela o personagem "pularia"
// para o lado ao trocar de animação, porque cada folha tem o corpo num lugar diferente.
// qw/qh: tamanho do quadro (padrão 128x128)
const PERSONAGENS = {
  cavaleiro: { pasta: "person", escala: 1.5, qw: 128, qh: 64, anims: {
    parado: ["Idle", 8, 66], correr: ["Run", 8, 62], pulo: ["Jump", 8, 65], rolar: ["Roll", 4, 65],
    ataque: ["Attacks", 20, 66], mergulho: ["attack_from_air", 8, 64], curar: ["Health", 8, 66],
    rezar: ["Pray", 12, 66], ferido: ["Hurt", 3, 66], morte: ["Death", 4, 66] } },
  minotauro: { pasta: "sprint_minotaur2/Minotaur_2", escala: 1.4, anims: {
    parado: ["Idle", 10, 57], andar: ["Walk", 12, 53], ataque: ["Attack", 5, 53],
    ferido: ["Hurt", 3, 64], morte: ["Dead", 5, 46] } },
  gorgona: { pasta: "gorgon_boss/Gorgon_1", escala: 1.5, anims: {
    parado: ["Idle", 7, 60], andar: ["Walk", 13, 56], correr: ["Run", 7, 105],
    bote: ["Attack_1", 16, 40], chicote: ["Attack_2", 7, 69], reverso: ["Attack_3", 10, 32],
    especial: ["Special", 5, 57], ferido: ["Hurt", 3, 54], morte: ["Dead", 3, 61] } },
  guerreiro: { pasta: "esqueleto_2/Skeleton_Warrior", escala: 1, anims: {
    parado: ["Idle", 7, 64], andar: ["Walk", 7, 70], ataque: ["Attack_1", 5, 52],
    ferido: ["Hurt", 2, 63], morte: ["Dead", 4, 62], defesa: ["Protect", 1, 66] } },
  lanceiro: { pasta: "esqueleto_2/Skeleton_Spearman", escala: 1, anims: {
    parado: ["Idle", 7, 59], andar: ["Walk", 7, 58], ataque: ["Attack_1", 4, 42],
    ferido: ["Hurt", 3, 68], morte: ["Dead", 5, 66], defesa: ["Protect", 2, 64] } },
  arqueiro: { pasta: "esqueleto_2/Skeleton_Archer", escala: 1, anims: {
    parado: ["Idle", 7, 60], andar: ["Walk", 8, 66], ataque: ["Shot_1", 15, 60],
    ferido: ["Hurt", 2, 62], morte: ["Dead", 5, 52] } },
  mago_fogo: { pasta: "wizard_enemy/Fire vizard", escala: 1, anims: {
    parado: ["Idle", 7, 48], andar: ["Walk", 6, 60], ataque: ["Fireball", 8, 52],
    chama: ["Flame_jet", 14, 42], ferido: ["Hurt", 3, 48], morte: ["Dead", 6, 44] } },
  mago_raio: { pasta: "wizard_enemy/Lightning Mage", escala: 1, anims: {
    parado: ["Idle", 7, 52], andar: ["Walk", 7, 60], ataque: ["Light_ball", 7, 62],
    raio: ["Light_charge", 13, 28], ferido: ["Hurt", 3, 51], morte: ["Dead", 5, 54] } },
  mago_errante: { pasta: "wizard_enemy/Wanderer Magican", escala: 1, anims: {
    parado: ["Idle", 8, 64], andar: ["Walk", 7, 64], ataque: ["Magic_arrow", 6, 56],
    salto: ["Jump", 8, 58], ferido: ["Hurt", 4, 64], morte: ["Dead", 4, 56] } },
};

// Projéteis: tira de quadros; "voo" = quadros usados enquanto voa; "centro" = ponto que fica na posição
const PROJETEIS = {
  flecha: { arquivo: "esqueleto_2/Skeleton_Archer/Arrow.png", qw: 48, qh: 48, voo: [0], centro: [24, 24.5] },
  fogo: { arquivo: "wizard_enemy/Fire vizard/Charge.png", qw: 64, qh: 64, voo: [1, 2, 3, 4, 5, 6], centro: [50, 32] },
  raio: { arquivo: "wizard_enemy/Lightning Mage/Charge.png", qw: 64, qh: 64, voo: [0, 1, 2, 3, 4, 5], centro: [32, 32] },
  magia: { arquivo: "wizard_enemy/Wanderer Magican/Charge_2.png", qw: 64, qh: 128, voo: [2, 3, 4, 5], centro: [35, 63] },
};

// Efeitos (explosion-sprites): um PNG por quadro. âncora: ponto do quadro que fica na posição
// (efeitos "de chão" usam a base do desenho, para nascerem no chão e não flutuando)
const PNG_EFEITOS = "explosion-sprites/PNG";
const seq = (pasta, n) => Array.from({ length: n }, (_, i) => `${pasta}/${pasta}${i + 1}`);
const EFEITOS = {
  explosao: { arquivos: seq("Explosion", 10), ancora: [126, 187] },
  nuclear: { arquivos: seq("Nuclear_explosion", 10), ancora: [128, 193] },
  oval: { arquivos: seq("Explosion_blue_oval", 10), ancora: [133, 182] },
  azul: { arquivos: seq("Explosion_blue_circle", 10), ancora: [124, 128] },
  gas: { arquivos: seq("Explosion_gas_circle", 10), ancora: [130, 130] },
  duas_cores: { arquivos: seq("Explosion_two_colors", 10), ancora: [127, 124] },
  circulo: { arquivos: seq("Circle_explosion", 10), ancora: [138, 130] },
  fumaca: { arquivos: seq("Smoke", 6), ancora: [61, 128] },
  fogo: { arquivos: seq("Fire", 6), ancora: [66, 128] },
  raio: {
    arquivos: [...[1, 2, 3, 4, 5].map((i) => `Lightning/Lightning_beginning${i}`),
      ...[1, 2, 3, 4, 5, 6].map((i) => `Lightning/Lightning_cycle${i}`),
      ...[1, 2, 3].map((i) => `Lightning/Lightning_end${i}`)],
    ancora: [32, 193],
  },
  raio_chao: { arquivos: [1, 2, 3, 4].map((i) => `Lightning/Lightning_spot${i}`), ancora: [31, 32] },
};

// Peças do mundo (pasta objects): recortes [arquivo, x, y, largura, altura] dentro das imagens
const OBJETOS = "objects/Final";
const PECAS = {
  laje: ["Tiles", 64, 249, 126, 26],          // plataforma de pedra
  pilar: ["Tiles", 256, 32, 34, 58],          // coluna que sustenta as plataformas
  pilar_quebrado: ["Tiles", 163, 299, 26, 52],
  muro: ["Tiles", 36, 18, 88, 48],            // bloco de tijolos com tampa de pedra
  chao: ["Tiles", 128, 17, 96, 47],           // chão com grama (repete na horizontal)
  grade: ["Tiles", 0, 243, 62, 79],
  planta: ["Tiles", 226, 44, 30, 52],
  morro: ["Tiles", 158, 146, 162, 78],
  arbusto: ["brush", 0, 0, 224, 96],
  arbusto_escuro: ["brush", 0, 96, 224, 96],
  estatua: ["Salt", 9, 25, 94, 199],
  arvore: ["Grass_background_2", 0, 10, 352, 406],
  lapides: ["Grass_background_1", 0, 204, 352, 212],
};

// Cenários. Dois tipos de camada:
//  - "battlegrounds" (fantasy-2d-battlegrounds): camadas de 1920x1080 que cobrem a tela inteira
//    [arquivo, velocidade do parallax (0 = parada, 1 = anda junto com o chão), opção]
//    "unico": objeto grande que aparece só a cada 3 telas; "frente": na frente dos personagens
//  - "objects" (cemitério noturno): { img, vel, escala, y, espaco } — "espaco" desenha a imagem
//    de tantos em tantos pixels (árvores, lápides) em vez de emendar uma na outra
const NOITE = [
  { img: "Background_0", vel: 0.05, escala: 1.3, y: 0 },                        // céu com lua
  { img: "Background_1", vel: 0.2, escala: 1.3, y: -20 },                       // mausoléus
  { img: "Grass_background_1", vel: 0.4, escala: 1.15, y: 22, espaco: 760 },    // lápides e arbustos
  { img: "Grass_background_2", vel: 0.5, escala: 1.2, y: -40, espaco: 1100, desloc: 420 },  // árvore retorcida
];
const CENARIOS = {
  noite: { tipo: "objects", camadas: NOITE },
  ruinas: { pasta: "Battleground1/Bright", camadas: [
    ["sky", 0], ["ruins_bg", 0.15], ["hills&trees", 0.3], ["ruins2", 0.45], ["statue", 0.6, "unico"],
    ["ruins", 0.6], ["stones&grass", 1]] },
  ruinas_palidas: { pasta: "Battleground1/Pale", camadas: [
    ["sky", 0], ["ruins_bg", 0.15], ["hills&trees", 0.3], ["ruins2", 0.45], ["statue", 0.6, "unico"],
    ["ruins", 0.6], ["stones&grass", 1]] },
  salao: { pasta: "Battleground2/Bright", camadas: [
    ["bg", 0], ["mountaims", 0.1], ["wall@windows", 0.5], ["columns&falgs", 0.55], ["candeliar", 0.6],
    ["floor", 1], ["dragon", 0.9, "unico"]] },
  floresta: { pasta: "Battleground3/Bright", camadas: [
    ["sky", 0], ["jungle_bg", 0.15], ["trees&bushes", 0.35], ["grasses", 0.55], ["grass&road", 1],
    ["lianas", 0.8], ["tree_face", 0.9, "unico"], ["fireflys", 1.1, "frente"]] },
  cripta: { pasta: "Battleground4/Bright", camadas: [
    ["sky", 0], ["graves", 0.2], ["back_trees", 0.3], ["crypt", 0.5, "unico"], ["wall", 0.6],
    ["ground", 1], ["tree", 0.9, "unico"], ["bones", 1]] },
};

const folhas = {};       // "cavaleiro/parado" -> { img, branco, vermelho, pedra, n, ancora, qw, qh, cols }
const projeteis = {};    // "fogo" -> img
const efeitos = {};      // "explosao" -> [img, img, ...]
const cenarios = {};     // "ruinas" -> [{ normal, espelho, vel, unico, frente }]
const objetos = {};      // "Tiles" -> img

export function carregarSprites() {
  const p = [];
  for (const [nome, def] of Object.entries(PERSONAGENS)) {
    const qw = def.qw || 128, qh = def.qh || 128;
    for (const [anim, [arquivo, n, ancora]] of Object.entries(def.anims)) {
      p.push(carregar(`${def.pasta}/${arquivo}.png`).then((img) => {
        folhas[`${nome}/${anim}`] = { img, n, ancora, qw, qh, cols: Math.max(1, Math.floor(img.width / qw)),
          branco: tingir(img, "#ffffff"), vermelho: tingir(img, "#ff2a1a"), pedra: tingir(img, "#8f8b80") };
      }));
    }
  }
  for (const [nome, def] of Object.entries(PROJETEIS)) p.push(carregar(def.arquivo).then((img) => (projeteis[nome] = img)));
  for (const [nome, def] of Object.entries(EFEITOS)) {
    p.push(Promise.all(def.arquivos.map((a) => carregar(`${PNG_EFEITOS}/${a}.png`))).then((imgs) => (efeitos[nome] = imgs)));
  }
  const arquivosObjetos = new Set([...Object.values(PECAS).map((p) => p[0]), ...NOITE.map((c) => c.img)]);
  for (const arq of arquivosObjetos) p.push(carregar(`${OBJETOS}/${arq}.png`).then((img) => (objetos[arq] = img)));
  for (const [nome, def] of Object.entries(CENARIOS)) {
    if (def.tipo === "objects") continue;  // usam as imagens de "objetos" diretamente
    p.push(Promise.all(def.camadas.map(([arquivo, vel, opcao]) =>
      carregar(`fantasy-2d-battlegrounds/PNG/${def.pasta}/${arquivo}.png`).then((img) => ({
        normal: reduzir(img, false), espelho: reduzir(img, true), vel, unico: opcao === "unico", frente: opcao === "frente",
      })))).then((camadas) => (cenarios[nome] = camadas)));
  }
  // Uma imagem que falhar não trava o jogo: o personagem vira silhueta e a camada some
  return Promise.all(p.map((x) => x.catch(() => {})));
}

function carregar(caminho) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = erro;
    img.src = encodeURI(`/static/${caminho}`);  // encodeURI: há pastas com espaço e "&" no nome
  });
}

// Cópia da folha pintada de uma cor só: flash branco (dano), vermelho (fúria) e cinza (petrificada)
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

// Camada de cenário reduzida para o tamanho da tela (e uma versão espelhada, para emendar sem costura)
function reduzir(img, espelhar) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  if (espelhar) { g.translate(W, 0); g.scale(-1, 1); }
  g.drawImage(img, 0, 0, W, H);
  return c;
}

export const nQuadros = (nome, anim) => PERSONAGENS[nome].anims[anim][1];
export const ciclo = (t, fps, n) => Math.floor(t * fps) % n;
export const escalaDe = (nome) => PERSONAGENS[nome].escala;
export const nQuadrosEfeito = (nome) => EFEITOS[nome].arquivos.length;

/**
 * Desenha um quadro de personagem com os pés em (x, y).
 * opts: dir (1 direita, -1 esquerda), alpha, branco/vermelho/pedra (0..1, cor por cima), rot (radianos), pivo (altura do giro)
 */
export function desenharSprite(ctx, nome, anim, quadro, x, y, opts = {}) {
  const { dir = 1, alpha = 1, branco = 0, vermelho = 0, pedra = 0, rot = 0, pivo = 36 } = opts;
  const s = folhas[`${nome}/${anim}`];
  const escala = PERSONAGENS[nome].escala;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (rot) { ctx.translate(0, -pivo * escala); ctx.rotate(rot); ctx.translate(0, pivo * escala); }
  ctx.scale(dir * escala, escala);
  if (!s) {
    ctx.fillStyle = "#444"; ctx.fillRect(-12, -64, 24, 64);  // silhueta de reserva
    ctx.restore();
    return;
  }
  ctx.imageSmoothingEnabled = false;  // pixel art nítida
  const q = Math.max(0, Math.min(s.n - 1, Math.floor(quadro)));
  // Quadro q numa grade de "cols" colunas (nas tiras horizontais, cols = nº de quadros)
  const sx = (q % s.cols) * s.qw, sy = Math.floor(q / s.cols) * s.qh;
  const desenhar = (fonte) => ctx.drawImage(fonte, sx, sy, s.qw, s.qh, -s.ancora, -s.qh, s.qw, s.qh);
  desenhar(s.img);
  const a = ctx.globalAlpha;
  for (const [fonte, forca] of [[s.pedra, pedra], [s.vermelho, vermelho], [s.branco, branco]]) {
    if (forca > 0) { ctx.globalAlpha = a * forca; desenhar(fonte); }
  }
  ctx.restore();
}

export function desenharProjetil(ctx, tipo, t, x, y, angulo) {
  const def = PROJETEIS[tipo], img = projeteis[tipo];
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angulo);
  if (img) {
    ctx.imageSmoothingEnabled = false;
    const q = def.voo[ciclo(t, 14, def.voo.length)];
    ctx.drawImage(img, q * def.qw, 0, def.qw, def.qh, -def.centro[0], -def.centro[1], def.qw, def.qh);
  } else { ctx.fillStyle = "#ccc"; ctx.fillRect(-12, -2, 24, 4); }
  ctx.restore();
}

export function desenharEfeito(ctx, nome, quadro, x, y, escala = 1, dir = 1, alpha = 1) {
  const imgs = efeitos[nome];
  if (!imgs) return;
  const img = imgs[Math.max(0, Math.min(imgs.length - 1, Math.floor(quadro)))];
  const [ax, ay] = EFEITOS[nome].ancora;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(dir * escala, escala);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -ax, -ay);
  ctx.restore();
}

/** Desenha uma peça do mundo (pasta objects) com o canto superior esquerdo em (x, y). */
export function desenharPeca(ctx, nome, x, y, largura, altura, espelhar = false) {
  const [arq, sx, sy, sw, sh] = PECAS[nome], img = objetos[arq];
  if (!img) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (espelhar) { ctx.translate(Math.round(x) + largura, Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(img, sx, sy, sw, sh, 0, 0, largura, altura); }
  else ctx.drawImage(img, sx, sy, sw, sh, Math.round(x), Math.round(y), largura, altura);
  ctx.restore();
  return true;
}
/** Tamanho original de uma peça, em pixels da imagem. */
export const tamanhoPeca = (nome) => [PECAS[nome][3], PECAS[nome][4]];
/** Desenha só um pedaço (sx..sx+sw) de uma peça: usado para emendar plataformas de qualquer largura. */
export function desenharFatiaPeca(ctx, nome, fx, fw, x, y, largura, altura) {
  const [arq, sx, sy, , sh] = PECAS[nome], img = objetos[arq];
  if (!img) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx + fx, sy, fw, sh, Math.round(x), Math.round(y), Math.ceil(largura), altura);
}

/** Desenha as camadas do cenário com parallax. frente=true desenha só as camadas da frente. */
export function desenharCenario(ctx, nome, cam, frente = false) {
  if (CENARIOS[nome]?.tipo === "objects") { if (!frente) desenharNoite(ctx, cam); return; }
  const camadas = cenarios[nome];
  if (!camadas) { ctx.fillStyle = "#15171d"; if (!frente) ctx.fillRect(0, 0, W, H); return; }
  ctx.imageSmoothingEnabled = false;
  for (const c of camadas) {
    if (c.frente !== frente) continue;
    const desloc = cam * c.vel;
    const primeira = Math.floor(desloc / W);
    for (let i = primeira; i <= primeira + 1; i++) {
      if (c.unico && ((i % 3) + 3) % 3 !== 0) continue;
      // Telas alternadas são espelhadas: a emenda entre uma e outra fica invisível
      ctx.drawImage(i % 2 ? c.espelho : c.normal, Math.round(i * W - desloc), 0);
    }
  }
}

// Fundo do cemitério noturno (pasta objects): camadas emendadas (espelhadas uma sim, outra não) ou espaçadas
function desenharNoite(ctx, cam) {
  ctx.fillStyle = "#0d1020"; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  for (const c of NOITE) {
    const img = objetos[c.img];
    if (!img) continue;
    const w = Math.round(img.width * c.escala), h = Math.round(img.height * c.escala);
    const desloc = cam * c.vel;
    if (c.espaco) {
      // Uma árvore / um grupo de lápides a cada "espaco" pixels
      const extra = c.desloc || 0;
      for (let i = Math.floor((desloc - w - extra) / c.espaco); ; i++) {
        const x = i * c.espaco + extra - desloc;
        if (x > W) break;
        if (x + w >= 0) ctx.drawImage(img, Math.round(x), c.y, w, h);
      }
    } else {
      const primeira = Math.floor(desloc / w);
      for (let i = primeira; i <= primeira + Math.ceil(W / w); i++) {
        const x = Math.round(i * w - desloc);
        if (i % 2) { ctx.save(); ctx.translate(x + w, c.y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); ctx.restore(); }
        else ctx.drawImage(img, x, c.y, w, h);
      }
    }
  }
}
