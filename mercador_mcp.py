"""Servidor MCP "Mercador": ferramentas da IA do mercador encapuzado (e do Cavaleiro Errante).

A IA conversa com o jogador, mas qualquer coisa que mexa em almas ou preços passa por estas
ferramentas, e as regras (desconto máximo de 25%, um por vez) estão no código de personagem.py.
O jogador_id é preenchido pelo app.py e fica escondido do modelo.
"""
import json
from collections import Counter

from mcp.server.mcpserver import MCPServer

import db
import personagem

mcp = MCPServer("mercador")


@mcp.tool()
def ver_jogador(jogador_id: int) -> str:
    """Nível, almas, atributos, equipamento, itens e chefes vencidos do jogador."""
    return json.dumps(personagem.resumo(jogador_id), ensure_ascii=False)


@mcp.tool()
def ver_estoque(jogador_id: int) -> str:
    """O que está à venda agora, com preços (já com desconto, se houver) e o que o jogador já tem."""
    return json.dumps(personagem.estoque_do_jogador(jogador_id), ensure_ascii=False)


@mcp.tool()
def ver_mortes(jogador_id: int) -> str:
    """Como o jogador anda morrendo para os chefes: placar e os golpes que mais o machucam."""
    resumo = {}
    for chefe in db.CHEFES:
        lutas = db.lutas(jogador_id, chefe, 10)
        dano = Counter()
        for l in lutas:
            dano.update(l["log"].get("dano_recebido", {}))
        resumo[chefe] = {"placar": db.placar(jogador_id, chefe), "golpes_que_mais_machucam": dict(dano.most_common(3))}
    return json.dumps(resumo, ensure_ascii=False)


@mcp.tool()
def oferecer_desconto(jogador_id: int, item: str, percentual: float, motivo: str) -> str:
    """Dá um desconto num item à venda (chave do item, ex.: "ferro"). Máximo 25%; vale para uma compra
    e substitui o desconto anterior. Use com moderação: um mercador não vive de caridade."""
    try:
        _, mensagem = personagem.oferecer_desconto(jogador_id, item, percentual, motivo)
        return mensagem
    except personagem.ErroDeRegra as e:
        return f"Não foi possível: {e}"


if __name__ == "__main__":
    mcp.run()
