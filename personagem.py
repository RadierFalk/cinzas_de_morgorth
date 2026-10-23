"""Regras do personagem: comprar, subir de nível, melhorar arma, equipar e sincronizar almas.

Tudo que custa almas é validado aqui, no servidor. Usado pelo app.py e pelo servidor MCP do mercador.
Cada função devolve (personagem_atualizado, mensagem) ou levanta ErroDeRegra.
"""
import catalogo as cat
import db


class ErroDeRegra(Exception):
    pass


def carregar(usuario_id: int) -> dict:
    return db.carregar_personagem(usuario_id, cat.PERSONAGEM_INICIAL)


def salvar(usuario_id: int, p: dict) -> dict:
    db.salvar_personagem(usuario_id, p)
    return p


def estoque_do_jogador(usuario_id: int) -> dict:
    p = carregar(usuario_id)
    vende = cat.estoque(db.chefes_vencidos(usuario_id))
    for chave, item in vende.items():
        item["preco_final"] = cat.preco_com_desconto(p, chave, item["preco"])
        item["ja_tem"] = (chave in p["armas"]) if item["tipo"] == "arma" else (chave in p["escudos"]) if item["tipo"] == "escudo" else False
        if item.get("limite"):
            item["restam"] = item["limite"] - p["compras"].get(chave, 0)
    return vende


def comprar(usuario_id: int, item: str) -> tuple[dict, str]:
    p = carregar(usuario_id)
    vende = estoque_do_jogador(usuario_id)
    if item not in vende:
        raise ErroDeRegra("O mercador não vende isso.")
    oferta = vende[item]
    if oferta["ja_tem"]:
        raise ErroDeRegra("Você já tem isso.")
    if oferta.get("limite") and oferta["restam"] <= 0:
        raise ErroDeRegra("Acabou o estoque disso.")
    preco = oferta["preco_final"]
    if p["almas"] < preco:
        raise ErroDeRegra(f"Faltam {preco - p['almas']} almas.")
    p["almas"] -= preco
    p["compras"][item] = p["compras"].get(item, 0) + 1
    if p.get("desconto") and p["desconto"]["item"] == item:
        p["desconto"] = None  # desconto vale para uma compra
    if oferta["tipo"] == "arma":
        p["armas"][item] = 0
    elif oferta["tipo"] == "escudo":
        p["escudos"].append(item)
    elif item == "fragmento":
        p["frascos_max"] = min(7, p["frascos_max"] + 1)
    elif item == "cinza":
        p["cura_extra"] += 10
    else:
        p["consumiveis"][item] = p["consumiveis"].get(item, 0) + 1
    return salvar(usuario_id, p), f"Comprou {oferta['nome']} por {preco} almas."


def subir_nivel(usuario_id: int, atributo: str) -> tuple[dict, str]:
    if atributo not in cat.ATRIBUTOS:
        raise ErroDeRegra("Atributo desconhecido.")
    p = carregar(usuario_id)
    custo = cat.custo_nivel(p["nivel"])
    if p["almas"] < custo:
        raise ErroDeRegra(f"Faltam {custo - p['almas']} almas.")
    p["almas"] -= custo
    p["nivel"] += 1
    p["atributos"][atributo] += 1
    return salvar(usuario_id, p), f"Nível {p['nivel']}: {cat.ATRIBUTOS[atributo].split(':')[0]} +1."


def melhorar_arma(usuario_id: int, arma: str) -> tuple[dict, str]:
    p = carregar(usuario_id)
    if arma not in p["armas"]:
        raise ErroDeRegra("Você não tem essa arma.")
    nivel = p["armas"][arma]
    if nivel >= cat.MELHORIA_MAX:
        raise ErroDeRegra("Essa arma já está no máximo.")
    custo = cat.custo_melhoria(nivel)
    if p["almas"] < custo:
        raise ErroDeRegra(f"Faltam {custo - p['almas']} almas.")
    p["almas"] -= custo
    p["armas"][arma] = nivel + 1
    return salvar(usuario_id, p), f"{cat.ARMAS[arma]['nome']} +{nivel + 1}."


def equipar(usuario_id: int, arma: str | None, escudo: str | None) -> tuple[dict, str]:
    p = carregar(usuario_id)
    if arma:
        if arma not in p["armas"]:
            raise ErroDeRegra("Você não tem essa arma.")
        p["arma"] = arma
    if escudo:
        if escudo not in p["escudos"]:
            raise ErroDeRegra("Você não tem esse escudo.")
        p["escudo"] = escudo
    return salvar(usuario_id, p), "Equipado."


def sincronizar(usuario_id: int, dados: dict) -> dict:
    """O navegador manda o que mudou durante a fase (almas ganhas, itens usados, almas deixadas ao morrer).

    Itens só aumentam pelos "encontrados" (caídos dos inimigos, com teto); o resto só pode DIMINUIR
    (gastos na fase). Almas ganhas também têm um teto por envio.
    """
    p = carregar(usuario_id)
    ganhas = max(0, min(int(dados.get("almas_ganhas", 0)), 40 * cat.ALMAS_POR_INIMIGO_MAX))
    p["almas"] += ganhas
    for item, qtd in (dados.get("encontrados") or {}).items():
        if item in cat.CONSUMIVEIS and not cat.CONSUMIVEIS[item].get("imediato"):
            p["consumiveis"][item] = p["consumiveis"].get(item, 0) + max(0, min(int(qtd), 6))
    for item, qtd in (dados.get("consumiveis") or {}).items():
        if item in p["consumiveis"]:
            p["consumiveis"][item] = max(0, min(p["consumiveis"][item], int(qtd)))
    if "recuperou" in dados and dados["recuperou"] and p.get("almas_perdidas"):
        p["almas"] += p["almas_perdidas"]["qtd"]
        p["almas_perdidas"] = None
    if dados.get("morreu_em"):
        m = dados["morreu_em"]
        # Morrer de novo antes de recuperar: as almas antigas se perdem
        p["almas_perdidas"] = {"cena": str(m["cena"])[:20], "x": float(m["x"]), "qtd": p["almas"]} if p["almas"] > 0 else None
        p["almas"] = 0
    return salvar(usuario_id, p)


def recompensa_chefe(usuario_id: int, chefe: str, primeira_vez: bool) -> tuple[dict, list[str]]:
    p = carregar(usuario_id)
    p["almas"] += cat.ALMAS_CHEFE.get(chefe, 0)
    ganhos = [f"{cat.ALMAS_CHEFE.get(chefe, 0)} almas"]
    if primeira_vez:
        for chave, arma in cat.ARMAS.items():
            if arma.get("recompensa") == chefe and chave not in p["armas"]:
                p["armas"][chave] = 0
                ganhos.append(arma["nome"])
        if chefe == "minotauro":
            p["frascos_max"] = min(7, p["frascos_max"] + 1)
            ganhos.append("Fragmento de Estus")
    return salvar(usuario_id, p), ganhos


def oferecer_desconto(usuario_id: int, item: str, percentual: float, motivo: str) -> tuple[dict, str]:
    """Usado pela IA do mercador. As regras ficam aqui: no máximo 25% e um desconto ativo por vez."""
    vende = estoque_do_jogador(usuario_id)
    if item not in vende:
        raise ErroDeRegra(f"'{item}' não está à venda. Itens à venda: {', '.join(vende)}.")
    p = carregar(usuario_id)
    percentual = max(5, min(25, round(float(percentual))))
    p["desconto"] = {"item": item, "percentual": percentual, "motivo": motivo[:120]}
    salvar(usuario_id, p)
    preco = cat.preco_com_desconto(p, item, vende[item]["preco"])
    return p, f"Desconto de {percentual}% em {vende[item]['nome']}: sai por {preco} almas (vale para uma compra; substitui o anterior)."


def resumo(usuario_id: int) -> dict:
    """Visão do personagem para a IA (mercador e conselheiro)."""
    p = carregar(usuario_id)
    return {
        "nivel": p["nivel"], "almas": p["almas"], "atributos": p["atributos"],
        "arma": cat.ARMAS[p["arma"]]["nome"] + f" +{p['armas'].get(p['arma'], 0)}",
        "escudo": cat.ESCUDOS[p["escudo"]]["nome"],
        "armas_que_tem": [cat.ARMAS[a]["nome"] for a in p["armas"]],
        "consumiveis": {cat.CONSUMIVEIS[k]["nome"]: v for k, v in p["consumiveis"].items() if v},
        "frascos": p["frascos_max"],
        "almas_perdidas": p["almas_perdidas"],
        "chefes_vencidos": sorted(db.chefes_vencidos(usuario_id)),
        "desconto_ativo": p["desconto"],
    }
