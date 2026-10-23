// Menu da fogueira: descansar, subir de nível (Guardiã), loja (Mercador), ferreiro, equipamento,
// conversa com o Mercador (IA) e conselho do Cavaleiro Errante (IA).
// Tudo que custa almas é validado no servidor (app.py / personagem.py); aqui só mostramos e enviamos.
import { som } from "./sons.js";
import { desenharIcone } from "./sprites.js";

const ABAS = [
  ["descansar", "Descansar"], ["nivel", "Nível"], ["loja", "Loja"], ["ferreiro", "Ferreiro"],
  ["equipamento", "Equipamento"], ["mercador", "Ozren (IA)"], ["cavaleiro", "Cavaleiro (IA)"],
];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let conversa = [];  // conversa com o Mercador (fica enquanto a página estiver aberta)

/**
 * Abre o menu dentro do elemento `raiz`.
 * estado: objeto da página com personagem, catalogo, loja, custo_nivel, custo_melhoria (é atualizado aqui)
 * api(caminho, corpo): função de chamada ao servidor · aba: aba inicial
 * chefe: próximo chefe (habilita o conselho do Cavaleiro) · descanso: veio de uma fogueira (mostra "Descansar")
 * aoFechar(): chamado ao voltar
 */
export function abrirMenu({ raiz, estado, api, aba = "descansar", chefe = null, descanso = true, aoFechar }) {
  let atual = aba, mensagem = "", conselho = null;
  const abas = ABAS.filter(([id]) => (id !== "descansar" || descanso) && (id !== "cavaleiro" || chefe));
  if (!abas.some(([id]) => id === atual)) atual = abas[0][0];

  function render() {
    const p = estado.personagem;
    raiz.innerHTML = `
      <div class="menu-topo">
        <span class="menu-almas">✦ ${p.almas} almas · nível ${p.nivel}</span>
        <button class="menu-fechar">Voltar (Esc)</button>
      </div>
      <nav class="menu-abas">${abas.map(([id, nome]) => `<button data-aba="${id}" class="${id === atual ? "ativa" : ""}">${nome}</button>`).join("")}</nav>
      <div class="menu-msg">${esc(mensagem)}</div>
      <div class="menu-corpo">${corpo()}</div>`;
    raiz.classList.remove("hidden");
    raiz.querySelector(".menu-fechar").onclick = fechar;
    raiz.querySelectorAll("[data-aba]").forEach((b) => (b.onclick = () => { atual = b.dataset.aba; mensagem = ""; som("clique"); render(); }));
    raiz.querySelectorAll("canvas[data-icone]").forEach((c) => desenharIcone(c.getContext("2d"), JSON.parse(c.dataset.icone), 0, 0, c.width));
    raiz.querySelectorAll("[data-acao]").forEach((b) => (b.onclick = () => acao(b.dataset.acao, b.dataset.valor)));
    const form = raiz.querySelector(".chat-form");
    if (form) {
      form.onsubmit = (e) => { e.preventDefault(); conversar(form.querySelector("input").value); };
      form.querySelector("input").focus();
    }
  }

  const icone = (ic, tam = 32) => (ic ? `<canvas width="${tam}" height="${tam}" data-icone='${JSON.stringify(ic)}'></canvas>` : "");

  function corpo() {
    const p = estado.personagem, cat = estado.catalogo;
    switch (atual) {
      case "descansar":
        return `<p class="fala">O calor da fogueira fecha suas feridas. Vida, fôlego e frascos restaurados.</p>
          <div class="ficha">
            <div>Vigor ${p.atributos.vigor} · Fôlego ${p.atributos.folego} · Força ${p.atributos.forca} · Fé ${p.atributos.fe}</div>
            <div>${esc(cat.armas[p.arma].nome)} +${p.armas[p.arma]} · ${esc(cat.escudos[p.escudo].nome)} · ${p.frascos_max} frascos (+${p.cura_extra} de cura)</div>
            ${p.almas_perdidas ? `<div class="aviso-almas">Suas ${p.almas_perdidas.qtd} almas esperam onde você caiu.</div>` : ""}
          </div>`;
      case "nivel": {
        const custo = estado.custo_nivel;
        return `<p class="fala">“Traga-me almas, e eu as transformo em força.” — Guardiã do Fogo</p>
          <p>Próximo nível: <b>${custo}</b> almas</p>
          ${Object.entries(cat.atributos).map(([id, desc]) => `
            <div class="linha-item"><span class="valor">${p.atributos[id]}</span><span class="desc">${esc(desc)}</span>
            <button data-acao="nivel" data-valor="${id}" ${p.almas < custo ? "disabled" : ""}>+1</button></div>`).join("")}`;
      }
      case "loja":
        return `<p class="fala">“Almas por mercadoria. Nada de fiado.” — Ozren</p>
          ${Object.entries(estado.loja).map(([id, it]) => {
            const def = cat.armas[id] || cat.escudos[id] || cat.consumiveis[id];
            const indisponivel = it.ja_tem || it.restam === 0;
            const preco = it.preco_final < it.preco ? `<s>${it.preco}</s> <b class="desconto">${it.preco_final}</b>` : `<b>${it.preco}</b>`;
            return `<div class="linha-item">${icone(def.icone)}<span class="desc"><b>${esc(it.nome)}</b> — ${esc(it.descricao)}
              ${it.restam != null ? `<small>(restam ${it.restam})</small>` : ""}</span><span class="preco">${preco}</span>
              <button data-acao="comprar" data-valor="${id}" ${indisponivel || p.almas < it.preco_final ? "disabled" : ""}>${it.ja_tem ? "Já tem" : "Comprar"}</button></div>`;
          }).join("")}
          <p class="nota">Itens no inventário: ${Object.entries(p.consumiveis).filter(([, q]) => q > 0).map(([k, q]) => `${esc(cat.consumiveis[k].nome)} ×${q}`).join(", ") || "nenhum"}</p>`;
      case "ferreiro":
        return `<p class="fala">“Cada golpe de martelo custa almas. E vale cada uma.” — Ferreiro</p>
          ${Object.entries(p.armas).map(([id, nivel]) => {
            const max = nivel >= cat.melhoria_max, custo = estado.custo_melhoria[id];
            return `<div class="linha-item">${icone(cat.armas[id].icone)}<span class="desc"><b>${esc(cat.armas[id].nome)} +${nivel}</b>
              — +10% de dano por nível</span><span class="preco">${max ? "máximo" : `<b>${custo}</b>`}</span>
              <button data-acao="melhorar" data-valor="${id}" ${max || p.almas < custo ? "disabled" : ""}>Melhorar</button></div>`;
          }).join("")}`;
      case "equipamento":
        return `<h4>Armas</h4>${Object.keys(p.armas).map((id) => {
            const a = cat.armas[id];
            const extras = [a.queima && "queima", a.magia && "dispara magia", a.postura > 1 && "quebra postura"].filter(Boolean).join(", ");
            return `<div class="linha-item ${p.arma === id ? "equipado" : ""}">${icone(a.icone)}<span class="desc"><b>${esc(a.nome)} +${p.armas[id]}</b>
              — dano ×${a.dano}, velocidade ×${a.velocidade}, alcance ×${a.alcance}, fôlego ×${a.folego}, crítico ×${a.critico}${extras ? ` · ${extras}` : ""}</span>
              <button data-acao="arma" data-valor="${id}" ${p.arma === id ? "disabled" : ""}>${p.arma === id ? "Equipada" : "Equipar"}</button></div>`;
          }).join("")}
          <h4>Escudos <small>(segure L ou o botão direito para bloquear)</small></h4>${p.escudos.map((id) => {
            const e = cat.escudos[id];
            return `<div class="linha-item ${p.escudo === id ? "equipado" : ""}">${icone(e.icone)}<span class="desc"><b>${esc(e.nome)}</b>
              ${e.absorcao ? `— segura ${Math.round(e.absorcao * 100)}% do dano` : ""}</span>
              <button data-acao="escudo" data-valor="${id}" ${p.escudo === id ? "disabled" : ""}>${p.escudo === id ? "Equipado" : "Equipar"}</button></div>`;
          }).join("")}`;
      case "mercador":
        return `<div class="chat">${conversa.map((m) => `<p class="${m.role}">${m.role === "user" ? "Você" : "Ozren"}: ${esc(m.content)}</p>`).join("")
            || `<p class="assistant">Ozren: “Hm. Mais um cliente que fede a cinzas. Vai comprar ou só olhar?”</p>`}</div>
          ${p.desconto ? `<p class="nota desconto">Desconto ativo: ${p.desconto.percentual}% em ${esc(estado.loja[p.desconto.item]?.nome || p.desconto.item)}</p>` : ""}
          <form class="chat-form"><input maxlength="400" placeholder="Fale com o mercador (ex.: o que você recomenda contra o minotauro?)"><button>Falar</button></form>
          <p class="nota">O Ozren é uma IA: lembra de você, vê suas mortes e pode dar desconto (no máximo 25%, um por vez — a regra está no código).</p>`;
      case "cavaleiro":
        return `<p class="fala">O Cavaleiro Errante observa a névoa em silêncio.</p>
          ${conselho ? `<p class="conselho">“${esc(conselho)}”</p>` : `<button data-acao="conselho">Pedir conselho</button>`}
          <p class="nota">Ele lê o seu histórico de lutas contra este chefe e o seu equipamento (IA).</p>`;
    }
    return "";
  }

  async function acao(tipo, valor) {
    const rotas = {
      nivel: ["/api/nivel/subir", { atributo: valor }, "nivel"], comprar: ["/api/loja/comprar", { item: valor }, "compra"],
      melhorar: ["/api/ferreiro/melhorar", { item: valor }, "ferreiro"], arma: ["/api/equipar", { arma: valor }, "equipar"],
      escudo: ["/api/equipar", { escudo: valor }, "equipar"],
    };
    if (tipo === "conselho") return pedirConselho();
    const [rota, corpo, efeitoSonoro] = rotas[tipo];
    try {
      const r = await api(rota, corpo);
      Object.assign(estado, { personagem: r.personagem, loja: r.loja, custo_nivel: r.custo_nivel, custo_melhoria: r.custo_melhoria });
      mensagem = r.mensagem;
      som(efeitoSonoro);
    } catch (e) {
      mensagem = e.message;
      som("sem_folego");
    }
    render();
  }

  async function conversar(texto) {
    texto = texto.trim();
    if (!texto) return;
    conversa.push({ role: "user", content: texto });
    mensagem = "Ozren pensa...";
    render();
    try {
      const r = await api("/api/mercador/conversar", { mensagem: texto, historico: conversa.slice(0, -1) });
      conversa.push({ role: "assistant", content: r.resposta });
      Object.assign(estado, { personagem: r.personagem, loja: r.loja });
      mensagem = r.erro ? `(a IA falhou: ${r.erro.slice(0, 80)})` : r.ferramentas.length ? `ferramentas: ${r.ferramentas.join(" → ")}` : "";
    } catch (e) {
      conversa.push({ role: "assistant", content: "..." });
      mensagem = e.message;
    }
    render();
  }

  async function pedirConselho() {
    mensagem = "O cavaleiro pensa...";
    render();
    const r = await api(`/api/conselho/${chefe}`, {}).catch((e) => ({ conselho: e.message, ferramentas: [] }));
    conselho = r.conselho;
    mensagem = r.ferramentas?.length ? `ferramentas: ${r.ferramentas.join(" → ")}` : "";
    render();
  }

  function fechar() {
    raiz.classList.add("hidden");
    raiz.innerHTML = "";
    removeEventListener("keydown", teclaEsc);
    aoFechar?.();
  }
  const teclaEsc = (e) => { if (e.key === "Escape") fechar(); };
  addEventListener("keydown", teclaEsc);
  render();
}
