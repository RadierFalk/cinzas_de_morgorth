"""Servidor MCP "Mente do Boss": as únicas ferramentas que o agente tem para mudar o jogo.

O agente NUNCA mexe direto no combate. Ele só consegue consultar o histórico e ajustar
parâmetros da estratégia, e esta camada valida tudo (limites) antes de salvar.

O app.py inicia este servidor sozinho (via stdio).
"""
import json
from collections import Counter
from typing import Literal

from mcp.server.mcpserver import MCPServer

import db

mcp = MCPServer("mente-do-boss")

COMO_EVITAR = {
    "combo1": "afaste-se antes do primeiro golpe ou role no brilho do machado",
    "combo2": "o combo tem três golpes: não pare de esquivar no segundo",
    "combo3": "o terceiro golpe pode vir atrasado: espere o machado descer antes de rolar",
    "investida": "role NA DIREÇÃO dele quando o machado recuar; não dá para fugir correndo",
    "salto": "role no momento em que ele começa a cair, não quando pula",
    "onda": "pule a onda de choque",
    "reverso": "depois de rolar por dentro dele, role de novo ou se afaste",
}

GOLPES = """Golpes de Morvath, o Guardião Esquecido (um minotauro com um machado enorme):
- combo: três machadadas à frente. O terceiro golpe pode vir atrasado (parâmetro atraso_terceiro_golpe),
  o que pega jogadores que rolam no ritmo dos dois primeiros. Só usado de perto.
- investida: recua o machado e avança em alta velocidade pela arena. Boa contra quem fica longe ou cura.
- salto: pula até onde o jogador VAI estar e, ao cair, solta ondas de choque pelo chão nos dois lados.
  As ondas podem ser puladas.
- reverso: golpe rápido para trás, usado quando o jogador rola por dentro do boss (punir_rolagem="para_frente").

Parâmetros ajustáveis (definir_estrategia_boss):
- agressividade 0..1: tempo de espera entre ataques (1 = quase sem pausa).
- atraso_terceiro_golpe 0..1: quanto o terceiro golpe do combo demora.
- punir_cura: se true, faz uma investida rápida assim que o jogador bebe o frasco.
- punir_rolagem: "para_tras" (persegue com investida quem rola para longe depois do combo),
  "para_frente" (golpe reverso em quem rola por dentro), ou "nenhuma".
- peso_combo / peso_investida / peso_salto 0.2..3: frequência relativa de cada golpe.
Na fase 2 (metade da vida) o boss fica 20% mais rápido automaticamente.

Regras de justiça (aplicadas automaticamente): agressividade e atraso mudam no máximo 0.3 por luta,
e depois de 3 derrotas seguidas do jogador eles caem pelo menos 0.1."""


@mcp.tool()
def consultar_golpes_do_boss() -> str:
    """Descreve os golpes do boss e o que cada parâmetro de estratégia faz."""
    return GOLPES


@mcp.tool()
def consultar_historico_lutas(jogador_id: int, ultimas: int = 5) -> str:
    """Resumo das últimas lutas do jogador: placar, hábitos de esquiva e cura, e golpes que mais o atingiram."""
    lutas = db.lutas(jogador_id, max(1, min(ultimas, 20)))
    esquivas, dano, finais = Counter(), Counter(), Counter()
    curas = []
    for l in lutas:
        log = l["log"]
        esquivas.update(log.get("esquivas", {}))
        dano.update(log.get("dano_recebido", {}))
        curas += log.get("curas_hp_antes", [])
        if log.get("golpe_final"):
            finais[log["golpe_final"]] += 1
    return json.dumps({
        "placar": db.placar(jogador_id),
        "lutas_analisadas": len(lutas),
        "resultados_recentes": [l["resultado"] for l in lutas],
        "esquivas_total": dict(esquivas),
        "dano_recebido_por_golpe": dict(dano.most_common()),
        "golpes_que_mataram": dict(finais.most_common()),
        # Base para dicas corretas: como evitar os golpes que mais machucam este jogador
        "como_evitar": {g: COMO_EVITAR[g] for g, _ in dano.most_common(3) if g in COMO_EVITAR},
        "hp_medio_ao_curar": round(sum(curas) / len(curas)) if curas else None,
        "maior_fase_alcancada": max((l["log"].get("fase_alcancada", 1) for l in lutas), default=1),
    }, ensure_ascii=False)


@mcp.tool()
def definir_estrategia_boss(
    jogador_id: int,
    agressividade: float,
    atraso_terceiro_golpe: float,
    punir_cura: bool,
    punir_rolagem: Literal["nenhuma", "para_tras", "para_frente"],
    peso_combo: float,
    peso_investida: float,
    peso_salto: float,
    motivo: str,
) -> str:
    """Define como o boss vai lutar na PRÓXIMA tentativa. Valores fora dos limites são ajustados."""
    def limitar(v, lo, hi):
        return round(min(hi, max(lo, float(v))), 2)

    # Regras de justiça aplicadas em CÓDIGO: o modelo pode pedir qualquer coisa, mas não consegue burlar
    atual = db.estado_boss(jogador_id)["estrategia"]
    derrotas = db.placar(jogador_id)["derrotas_seguidas"]
    avisos = []

    def ajustar(nome, pedido):
        antes = atual[nome]
        novo = limitar(pedido, antes - 0.3, antes + 0.3)  # muda no máximo 0.3 por luta
        if derrotas >= 3:
            novo = min(novo, antes - 0.1)               # após 3 derrotas seguidas, fica um pouco mais fácil
        novo = limitar(novo, 0, 1)
        if novo != limitar(pedido, 0, 1):
            avisos.append(f"{nome} ajustado para {novo}")
        return novo

    estrategia = {
        "agressividade": ajustar("agressividade", agressividade),
        "atraso_terceiro_golpe": ajustar("atraso_terceiro_golpe", atraso_terceiro_golpe),
        "punir_cura": bool(punir_cura),
        "punir_rolagem": punir_rolagem if punir_rolagem in ("para_tras", "para_frente") else "nenhuma",
        "pesos": {
            "combo": limitar(peso_combo, 0.2, 3),
            "investida": limitar(peso_investida, 0.2, 3),
            "salto": limitar(peso_salto, 0.2, 3),
        },
        "motivo": motivo[:200],
    }
    db.salvar_estrategia(jogador_id, estrategia)
    regras = f" Regras de justiça: {'; '.join(avisos)}." if avisos else ""
    return "Estratégia aplicada: " + json.dumps(estrategia, ensure_ascii=False) + regras


if __name__ == "__main__":
    mcp.run()
