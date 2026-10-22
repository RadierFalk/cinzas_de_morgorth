"""Servidor MCP da Lavanderia do Vorcado: ferramentas 100% fictícias e absurdas.

O app.py inicia este servidor sozinho (via stdio). Toda "lavagem" aqui é literal.
"""
import random

from mcp.server.mcpserver import MCPServer

mcp = MCPServer("lavanderia-do-vorcado")


@mcp.tool()
def lavar_dinheiro_na_maquina(valor: float, sabao: str = "Omo") -> str:
    """Lava cédulas LITERALMENTE na máquina de lavar."""
    perda = random.randint(30, 95)
    return (f"R$ {valor:,.2f} lavados com {sabao}. {perda}% virou papel machê. "
            f"Sobraram R$ {valor * (100 - perda) / 100:,.2f} cheirando a lavanda.")


@mcp.tool()
def secar_no_varal(quantidade_notas: int) -> str:
    """Pendura as notas no varal para secar."""
    voaram = random.randint(0, quantidade_notas)
    quem = random.choice(["a dona Neide", "o síndico", "um pombo da Receita Federal"])
    return f"{voaram} de {quantidade_notas} notas voaram. Quem recolheu foi {quem}."


@mcp.tool()
def gerar_desculpa_para_cpi() -> str:
    """Gera uma desculpa esfarrapada para usar numa CPI."""
    return random.choice([
        "Não me recordo, Excelência. Estou em reunião com meu advogado desde 2019.",
        "Esse CDB era para um projeto social: o meu iate.",
        "Eu achei que 'rombo' fosse um tipo de losango.",
        "Meu contador é meu cachorro, e ele não fala.",
    ])


@mcp.tool()
def cotacao_cdb_milagroso(valor: float, meses: int) -> str:
    """Simula um CDB 'milagroso' do Banco Mestre com rendimento absurdo."""
    taxa = 47 * meses
    return (f"R$ {valor:,.2f} a {taxa}% ao mês viram R$ {valor * (1 + taxa / 100):,.2f}... "
            "no PowerPoint. Garantia do FGC (Fundo Garantidor de Cambalachos): 'confia'.")


if __name__ == "__main__":
    mcp.run()
