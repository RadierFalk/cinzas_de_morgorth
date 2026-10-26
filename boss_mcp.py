"""Servidor MCP "Mente do Boss": as únicas ferramentas que o agente tem para mudar o jogo.

O agente NUNCA mexe direto no combate. Ele só consegue consultar o histórico e ajustar
parâmetros da estratégia, e esta camada valida tudo (limites) antes de salvar.

Os campos jogador_id e chefe são preenchidos pelo app.py e ficam escondidos do modelo.
O app.py inicia este servidor sozinho (via stdio).
"""
import json
from collections import Counter
from typing import Literal

from mcp.server.mcpserver import MCPServer

import db

mcp = MCPServer("mente-do-boss")

COMO_EVITAR = {
    "minotauro": {
        "combo1": "afaste-se antes do primeiro golpe ou role no brilho do machado",
        "combo2": "o combo tem três golpes: não pare de esquivar no segundo",
        "combo3": "o terceiro golpe pode vir atrasado: espere o machado descer antes de rolar",
        "investida": "role NA DIREÇÃO dele quando o machado recuar; não dá para fugir correndo",
        "especial": "role no momento em que ele começa a cair do salto, não quando pula",
        "onda": "pule a onda de choque",
        "giro": "quando ele gira o machado, afaste-se andando para trás; no fim ele fica tonto: é a hora de atacar",
        "desabamento": "quando o teto treme, saia de cima das sombras no chão",
        "reverso": "depois de rolar por dentro dele, role de novo ou se afaste",
    },
    "gorgona": {
        "combo1": "a cauda alcança longe: afaste-se ou role no brilho",
        "combo2": "são três chicotadas: não pare de esquivar na segunda",
        "combo3": "a terceira chicotada pode vir atrasada: espere a cauda girar",
        "investida": "quando ela se enrola no chão, o bote vem: role na direção dela",
        "especial": "o olhar viaja pelo chão na altura do peito: pule por cima ou role através dele",
        "veneno": "as bolas de veneno caem antes, em cima e depois de você: avance para perto dela ou saia da poça",
        "varredura": "quando ela se enrola e a cauda brilha, PULE: a cauda varre o chão dos dois lados",
        "reverso": "depois de rolar por dentro dela, role de novo ou se afaste",
    },
    "arquimago": {
        "combo1": "o cajado alcança longe: afaste-se ou role no brilho da mão",
        "combo2": "são três golpes de cajado: não pare de esquivar no segundo",
        "combo3": "o terceiro golpe pode vir atrasado: espere o cajado descer",
        "investida": "quando ele dispara envolto em chamas, role NA DIREÇÃO dele",
        "especial": "o jato de chamas dura mais que uma rolagem: fique ATRÁS dele ou a mais de 4 passos",
        "chuva": "na fase 2 cai fogo do céu onde você está: continue se movendo",
        "bolas": "as três bolas de fogo vêm coladas na altura do peito: role através delas quando a primeira chegar perto",
        "teleporte": "quando ele some em fumaça, ele volta nas suas COSTAS: vire-se ou role para frente",
        "reverso": "depois de rolar por dentro dele, role de novo ou se afaste",
    },
    "arquidemonio": {
        "combo1": "as garras alcançam longe: afaste-se ou role no brilho",
        "combo2": "são três golpes: não pare de esquivar no segundo",
        "combo3": "o terceiro golpe pode vir atrasado: espere a garra descer",
        "investida": "quando ele recua no ar, vem um mergulho: role NA DIREÇÃO dele",
        "especial": "sombras roxas no chão marcam onde as esferas vão cair: saia de cima delas",
        "rajada": "as cinco esferas vêm em leque de cima: role através delas ou corra por baixo dele",
        "pilares": "rachaduras roxas avançam pelo chão até você: role através do pilar quando ele brotar",
        "reverso": "depois de rolar por dentro dele, role de novo ou se afaste",
    },
}

GOLPES = {
    "minotauro": """Golpes de Morvath, o Guardião Esquecido (um minotauro com um machado enorme):
- combo: três machadadas à frente. O terceiro golpe pode vir atrasado (atraso_terceiro_golpe). Só de perto.
- investida: recua o machado e avança em alta velocidade pela arena. Boa contra quem fica longe ou cura.
- especiais (peso_especial decide a frequência; ele escolhe conforme a distância):
  - salto (de longe): pula até onde o jogador VAI estar e, ao cair, solta ondas de choque nos dois lados.
  - giro (de perto): gira o machado avançando por ~1 s, acertando dos dois lados; depois fica tonto.
  - desabamento (só na fase 2): bate no chão e pedras caem do teto nas sombras marcadas.
- reverso: golpe rápido para trás, contra quem rola por dentro (punir_rolagem="para_frente").""",
    "gorgona": """Golpes de Medrah, a Górgona (meio mulher, meio serpente, com cobras no lugar do cabelo):
- combo: três chicotadas de cauda à frente. A terceira pode vir atrasada (atraso_terceiro_golpe). Só de perto.
- investida (bote): se enrola no chão e dá um bote longo pela arena. Boa contra quem fica longe ou cura.
- especiais (peso_especial decide a frequência; ela escolhe conforme a distância):
  - olhar petrificante: uma onda viaja pelo chão na altura do peito; quem é atingido fica PETRIFICADO.
  - veneno (de longe): cospe três bolas em arco; onde caem fica uma poça venenosa por alguns segundos.
  - varredura (de perto): a cauda varre o chão dos dois lados, bem longe; só escapa quem pula.
- reverso: chicotada para trás, contra quem rola por dentro (punir_rolagem="para_frente").""",
    "arquimago": """Golpes de Ignar, o Arquimago (um feiticeiro de fogo gigante, com cajado):
- combo: três golpes de cajado à frente. O terceiro pode vir atrasado (atraso_terceiro_golpe). Só de perto.
- investida: dispara pela arena envolto em chamas. Boa contra quem fica longe ou cura.
- especiais (peso_especial decide a frequência; ele escolhe conforme a distância):
  - jato de chamas (de perto): fogo à frente por ~1 s, mais do que uma rolagem protege.
  - bolas de fogo (de longe): três bolas coladas em linha reta na altura do peito.
  - teleporte: some em fumaça e reaparece nas costas do jogador, já golpeando.
  - chuva de fogo (só na fase 2): bolas caem nas sombras marcadas perto do jogador.
- reverso: golpe rápido para trás, contra quem rola por dentro (punir_rolagem="para_frente").""",
    "arquidemonio": """Golpes de Azrakh, o Arquidemônio (um demônio voador, chefe final):
- combo: três golpes de garra sombria à frente. O terceiro pode vir atrasado (atraso_terceiro_golpe). Só de perto.
- investida (mergulho): recua no ar e mergulha pela arena. Boa contra quem fica longe ou cura.
- especiais (peso_especial decide a frequência; ele escolhe conforme a distância):
  - chuva sombria: marca sombras no chão perto do jogador e esferas caem nelas (3 na fase 1, 5 na fase 2).
  - rajada (de longe): cinco esferas sombrias em leque, disparadas do alto.
  - pilares (de perto): pilares de sombra brotam do chão em sequência, dele até o jogador.
- reverso: golpe rápido para trás, contra quem rola por dentro (punir_rolagem="para_frente").""",
}

PARAMETROS = """
Parâmetros ajustáveis (definir_estrategia_boss):
- agressividade 0..1: tempo de espera entre ataques (1 = quase sem pausa).
- atraso_terceiro_golpe 0..1: quanto o terceiro golpe do combo demora.
- punir_cura: se true, faz uma investida rápida assim que o jogador bebe o frasco.
- punir_rolagem: "para_tras" (persegue com investida quem rola para longe depois do combo),
  "para_frente" (golpe reverso em quem rola por dentro), ou "nenhuma".
- peso_combo / peso_investida / peso_especial 0.2..3: frequência relativa de cada golpe.
Na fase 2 (metade da vida) o chefe fica 20% mais rápido automaticamente.

Regras de justiça (aplicadas automaticamente): agressividade e atraso mudam no máximo 0.3 por luta,
e depois de 3 derrotas seguidas do jogador eles caem pelo menos 0.1."""


@mcp.tool()
def consultar_golpes_do_boss(chefe: str) -> str:
    """Descreve os golpes do chefe e o que cada parâmetro de estratégia faz."""
    return GOLPES.get(chefe, "") + PARAMETROS


@mcp.tool()
def consultar_historico_lutas(jogador_id: int, chefe: str, ultimas: int = 5) -> str:
    """Resumo das últimas lutas do jogador contra este chefe: placar, hábitos de esquiva e cura, e golpes que mais o atingiram."""
    lutas = db.lutas(jogador_id, chefe, max(1, min(ultimas, 20)))
    esquivas, dano, finais = Counter(), Counter(), Counter()
    curas = []
    for l in lutas:
        log = l["log"]
        esquivas.update(log.get("esquivas", {}))
        dano.update(log.get("dano_recebido", {}))
        curas += log.get("curas_hp_antes", [])
        if log.get("golpe_final"):
            finais[log["golpe_final"]] += 1
    evitar = COMO_EVITAR.get(chefe, {})
    return json.dumps({
        "placar": db.placar(jogador_id, chefe),
        "lutas_analisadas": len(lutas),
        "resultados_recentes": [l["resultado"] for l in lutas],
        "esquivas_total": dict(esquivas),
        "dano_recebido_por_golpe": dict(dano.most_common()),
        "golpes_que_mataram": dict(finais.most_common()),
        # Base para dicas corretas: como evitar os golpes que mais machucam este jogador
        "como_evitar": {g: evitar[g] for g, _ in dano.most_common(3) if g in evitar},
        "hp_medio_ao_curar": round(sum(curas) / len(curas)) if curas else None,
        "maior_fase_alcancada": max((l["log"].get("fase_alcancada", 1) for l in lutas), default=1),
    }, ensure_ascii=False)


@mcp.tool()
def definir_estrategia_boss(
    jogador_id: int,
    chefe: str,
    agressividade: float,
    atraso_terceiro_golpe: float,
    punir_cura: bool,
    punir_rolagem: Literal["nenhuma", "para_tras", "para_frente"],
    peso_combo: float,
    peso_investida: float,
    peso_especial: float,
    motivo: str,
) -> str:
    """Define como o chefe vai lutar na PRÓXIMA tentativa. Valores fora dos limites são ajustados."""
    def limitar(v, lo, hi):
        return round(min(hi, max(lo, float(v))), 2)

    # Regras de justiça aplicadas em CÓDIGO: o modelo pode pedir qualquer coisa, mas não consegue burlar
    atual = db.estado_boss(jogador_id, chefe)["estrategia"]
    derrotas = db.placar(jogador_id, chefe)["derrotas_seguidas"]
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
            "especial": limitar(peso_especial, 0.2, 3),
        },
        "motivo": motivo[:200],
    }
    db.salvar_estrategia(jogador_id, chefe, estrategia)
    regras = f" Regras de justiça: {'; '.join(avisos)}." if avisos else ""
    return "Estratégia aplicada: " + json.dumps(estrategia, ensure_ascii=False) + regras


if __name__ == "__main__":
    mcp.run()
