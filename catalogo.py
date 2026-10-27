"""Catálogo do jogo: armas, escudos, consumíveis, atributos e custos de nível.

Fica só aqui (Python) e o navegador recebe por /api/estado, para não existirem duas tabelas
diferentes. As compras, melhorias e subidas de nível são validadas no servidor com estes números.

ícone: [folha, coluna, linha] nas folhas 16x16 do "Weapon pack Free" (espadas/escudos/magia)
       ou ["icones", n] nos ícones 64x64 do "explosion-sprites/PNG/Icons".
"""

# Multiplicadores sobre o combo base do cavaleiro (static/jogador.js)
ARMAS = {
    "espada": {"nome": "Espada do Cavaleiro", "dano": 1.0, "velocidade": 1.0, "alcance": 1.0, "folego": 1.0,
               "critico": 2.0, "postura": 1, "rastro": "#f0ead6", "icone": ["espadas", 7, 0], "preco": None,
               "descricao": "Equilibrada. Nunca falhou ao seu dono, ao contrário dele."},
    "adaga": {"nome": "Adaga do Corvo", "dano": 0.7, "velocidade": 1.4, "alcance": 0.8, "folego": 0.6,
              "critico": 3.0, "postura": 1, "rastro": "#bfe3ff", "icone": ["espadas", 10, 1], "preco": 600,
              "descricao": "Rápida e barata em fôlego. Na cabeça, o crítico é triplo."},
    "lanca": {"nome": "Lança da Sentinela", "dano": 0.95, "velocidade": 0.95, "alcance": 1.4, "folego": 1.0,
              "critico": 2.0, "postura": 1, "rastro": "#d9d4c0", "icone": ["espadas", 8, 1], "preco": 700,
              "descricao": "Alcança longe: acerte antes de ser acertado."},
    "machado": {"nome": "Machado do Carrasco", "dano": 1.45, "velocidade": 0.78, "alcance": 0.95, "folego": 1.35,
                "critico": 2.0, "postura": 2, "rastro": "#ffb070", "icone": ["espadas", 9, 3], "preco": 900,
                "descricao": "Lento e faminto por fôlego, mas quebra a postura de qualquer esqueleto."},
    "lamina_flamejante": {"nome": "Lâmina Flamejante", "dano": 1.15, "velocidade": 1.0, "alcance": 1.0, "folego": 1.0,
                          "critico": 2.0, "postura": 1, "rastro": "#ff7a2a", "queima": True, "icone": ["espadas", 8, 2],
                          "preco": None, "recompensa": "minotauro",
                          "descricao": "Forjada com a brasa do machado de Morvath. Os golpes incendeiam."},
    "cajado": {"nome": "Cajado Arcano", "dano": 0.9, "velocidade": 0.9, "alcance": 1.0, "folego": 1.25,
               "critico": 2.0, "postura": 1, "rastro": "#8fd8ff", "magia": True, "icone": ["magia", 6, 0], "preco": 1600,
               "requer": "minotauro",
               "descricao": "Dispara esferas arcanas (o dano cresce com a Fé). Mantém a distância, mas gasta muito fôlego."},
    "punhos": {"nome": "Punhos", "dano": 0.6, "velocidade": 1.35, "alcance": 0.75, "folego": 0.6,
               "critico": 2.5, "postura": 1, "rastro": "#f0ead6", "icone": None, "preco": None,
               "descricao": "Socos e chutes. Rápidos e baratos, mas fracos."},
    "cajado_ignar": {"nome": "Cajado de Ignar", "dano": 1.15, "velocidade": 0.9, "alcance": 1.0, "folego": 1.2,
                     "critico": 2.0, "postura": 1, "rastro": "#ff9a3c", "magia": True, "queima": True,
                     "icone": ["magia", 6, 3], "preco": None, "recompensa": "arquimago",
                     "descricao": "Arrancado das mãos do Arquimago. As esferas incendeiam (dano cresce com a Fé)."},
    "espada_abissal": {"nome": "Espada Abissal", "dano": 1.7, "velocidade": 0.72, "alcance": 1.2, "folego": 1.45,
                       "critico": 2.5, "postura": 3, "rastro": "#b46bff", "icone": ["espadas", 11, 1], "preco": None,
                       "recompensa": "arquidemonio",
                       "descricao": "Forjada no coração de Azrakh. Pesadíssima; quebra qualquer guarda."},
}

ESCUDOS = {
    "nenhum": {"nome": "Sem escudo", "absorcao": 0.0, "custo": 1.0, "icone": None, "preco": None, "descricao": ""},
    "madeira": {"nome": "Escudo de Madeira", "absorcao": 0.6, "custo": 0.8, "icone": ["escudos", 0, 4], "preco": 300,
                "descricao": "Segura 60% do dano. Melhor que nada."},
    "ferro": {"nome": "Escudo de Ferro", "absorcao": 0.85, "custo": 0.6, "icone": ["escudos", 4, 4], "preco": 800,
              "descricao": "Segura 85% do dano e cansa menos o braço."},
    "torre": {"nome": "Escudo Torre", "absorcao": 1.0, "custo": 0.45, "lento": True, "icone": ["escudos", 7, 3],
              "preco": 1500, "descricao": "Segura todo o dano, mas pesa: anda devagar bloqueando."},
}

# limite: quantos dá para comprar no total; uso "imediato" = efeito permanente na compra
CONSUMIVEIS = {
    "erva": {"nome": "Erva Verde", "icone": ["icones", 1], "preco": 80,
             "descricao": "Recupera 40 de vida aos poucos, em 4 segundos. Dá para usar andando."},
    "bomba": {"nome": "Bomba de Fogo", "icone": ["icones", 3], "preco": 150,
              "descricao": "Arremesso que explode em área (45 de dano)."},
    "resina": {"nome": "Resina Ígnea", "icone": ["icones", 6], "preco": 220,
               "descricao": "Por 30 segundos a arma pega fogo: +30% de dano e queima."},
    "fragmento": {"nome": "Fragmento de Estus", "icone": ["magia", 5, 0], "preco": 600, "limite": 4, "imediato": True,
                  "descricao": "Mais um frasco de Estus (até 7)."},
    "cinza": {"nome": "Cinza de Estus", "icone": ["magia", 4, 1], "preco": 900, "limite": 3, "imediato": True,
              "descricao": "Cada frasco passa a curar 10 a mais."},
}

ATRIBUTOS = {
    "vigor": "Vigor: +8 de vida máxima",
    "folego": "Fôlego: +6 de fôlego máximo",
    "forca": "Força: +6% de dano com armas",
    "fe": "Fé: +4 de cura por frasco e +6% de dano com magia",
}

# Almas por chefe derrotado (os inimigos comuns pagam no navegador, ver ALMAS em static/inimigos.js)
ALMAS_CHEFE = {"minotauro": 1500, "gorgona": 3000, "arquimago": 4500, "arquidemonio": 7000}
ALMAS_POR_INIMIGO_MAX = 120  # nenhum inimigo comum paga mais que isso (validação ao sincronizar)

# Classe inicial: escolhida uma vez, no começo da jornada.
# sprite/filtro: como o personagem é desenhado no navegador (static/jogador.js)
CLASSES = {
    "cavaleiro": {
        "nome": "Cavaleiro", "sprite": "cavaleiro_armadura", "filtro": None,
        "descricao": "Espada e escudo. Equilibrado e resistente: bloqueia o que não consegue esquivar.",
        "atributos": {"vigor": 3, "folego": 2, "forca": 2, "fe": 1},
        "arma": "espada", "escudo": "madeira", "armas": {"espada": 0}, "escudos": ["nenhum", "madeira"],
        "consumiveis": {"erva": 2, "bomba": 1},
    },
    "lanceiro": {
        "nome": "Lanceiro", "sprite": "cavaleiro", "filtro": "hue-rotate(190deg) saturate(1.3)",
        "descricao": "Lança longa e muito fôlego. Acerta antes de ser acertado, mas não tem escudo.",
        "atributos": {"vigor": 2, "folego": 4, "forca": 2, "fe": 1},
        "arma": "lanca", "escudo": "nenhum", "armas": {"lanca": 0}, "escudos": ["nenhum"],
        "consumiveis": {"erva": 3, "bomba": 1},
    },
    "viking": {
        "nome": "Viking", "sprite": "viking", "filtro": None,
        "descricao": "Machado e escudo redondo. Muita força e vida, pouca fé: golpes lentos que quebram guardas.",
        "atributos": {"vigor": 3, "folego": 2, "forca": 4, "fe": 0},
        "arma": "machado", "escudo": "madeira", "armas": {"machado": 0}, "escudos": ["nenhum", "madeira"],
        "consumiveis": {"erva": 2},
    },
    "fresco": {
        "nome": "Fresco", "sprite": "girl1", "filtro": None,
        "descricao": "Maga com cajado. Ataca de longe com esferas arcanas que crescem com a Fé, até no ar; frágil de perto.",
        "mergulho": False,           # não tem o ataque mergulho: no ar, lança magia
        "atributos": {"vigor": 1, "folego": 2, "forca": 1, "fe": 4},
        "arma": "cajado", "escudo": "nenhum", "armas": {"cajado": 0}, "escudos": ["nenhum"],
        "consumiveis": {"erva": 3, "resina": 1},
    },
    "guilherme": {
        "nome": "Guilherme", "sprite": "guilherme", "filtro": None,
        "descricao": "Sem arma, sem atributos, sem nada. Luta com socos e chutes. Para quem quer sofrer.",
        "atributos": {"vigor": 0, "folego": 0, "forca": 0, "fe": 0},
        "arma": "punhos", "escudo": "nenhum", "armas": {"punhos": 0}, "escudos": ["nenhum"],
        "consumiveis": {},
    },
}

PERSONAGEM_INICIAL = {
    "classe": None,                  # escolhida no começo da jornada (ver CLASSES)
    "nivel": 1, "almas": 0,
    "atributos": {"vigor": 1, "folego": 1, "forca": 1, "fe": 1},
    "arma": "espada", "escudo": "nenhum",
    "armas": {"espada": 0},          # arma -> nível de melhoria (+0..+5)
    "escudos": ["nenhum"],
    "consumiveis": {"erva": 2, "bomba": 1},
    "compras": {},                   # item -> quantas vezes comprou (para itens com limite)
    "frascos_max": 3, "cura_extra": 0,
    "almas_perdidas": None,          # {"cena", "x", "qtd"}: recupere tocando no local da morte
    "desconto": None,                # {"item", "percentual", "motivo"}: dado pelo mercador (IA)
    "ciclo": 0,                      # jornadas completas (Novo Jogo+): inimigos mais fortes e numerosos a cada uma
    "jornada_completa": False,       # venceu o último chefe neste ciclo: pode começar o próximo
}

MELHORIA_MAX = 5


def bonus_ciclo(ciclo: int) -> float:
    """Novo Jogo+: as almas crescem 25% por ciclo (a força dos inimigos fica no navegador, static/jogo.js)."""
    return 1 + 0.25 * ciclo


def custo_nivel(nivel: int) -> int:
    """Almas para ir do nível `nivel` para o seguinte."""
    return int(round((80 * 1.13 ** (nivel - 1)) / 10) * 10)


def custo_melhoria(nivel_arma: int) -> int:
    return 300 * (nivel_arma + 1)


def preco_com_desconto(personagem: dict, item: str, preco: int) -> int:
    d = personagem.get("desconto")
    if d and d.get("item") == item:
        return int(preco * (1 - d["percentual"] / 100))
    return preco


def item_do_catalogo(item: str) -> tuple[str, dict] | None:
    for tipo, tabela in (("arma", ARMAS), ("escudo", ESCUDOS), ("consumivel", CONSUMIVEIS)):
        if item in tabela:
            return tipo, tabela[item]
    return None


def estoque(cenas_vencidas: set[str]) -> dict:
    """O que o mercador vende agora (alguns itens só depois de vencer um chefe)."""
    vende = {}
    for tipo, tabela in (("arma", ARMAS), ("escudo", ESCUDOS), ("consumivel", CONSUMIVEIS)):
        for chave, item in tabela.items():
            if item.get("preco") and (not item.get("requer") or item["requer"] in cenas_vencidas):
                vende[chave] = {"tipo": tipo, "nome": item["nome"], "preco": item["preco"], "descricao": item["descricao"],
                                "limite": item.get("limite")}
    return vende


def catalogo_publico() -> dict:
    return {"armas": ARMAS, "escudos": ESCUDOS, "consumiveis": CONSUMIVEIS, "atributos": ATRIBUTOS,
            "classes": CLASSES, "melhoria_max": MELHORIA_MAX}
