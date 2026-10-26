"""Monta as folhas do Guilherme a partir dos PNGs avulsos (512x512) do "Animated Prototype Character".

O jogo carrega uma tira horizontal por animação; este script recorta a área onde o boneco fica,
reduz para quadros de 144x120 (pés na linha 99) e salva em static/guilherme/folhas/<animação>.png.
Rodar de novo só é preciso se os PNGs originais mudarem:  python ferramentas/montar_folhas_guilherme.py
"""
import glob
import os
import re

from PIL import Image

ORIGEM = "static/guilherme/Animated Prototype Character/Base Character"
DESTINO = "static/guilherme/folhas"
RECORTE = (32, 96, 416, 416)  # x1, y1, x2, y2 no quadro de 512: cabe até a queda da morte e o pulo
ESCALA = 0.375                 # 384x320 -> 144x120

os.makedirs(DESTINO, exist_ok=True)
animacoes = {}
for arquivo in glob.glob(f"{ORIGEM}/*.png"):
    nome, n = re.match(r"(\w+) \((\d+)\)", os.path.basename(arquivo)).groups()
    animacoes.setdefault(nome, []).append((int(n), arquivo))

qw, qh = round((RECORTE[2] - RECORTE[0]) * ESCALA), round((RECORTE[3] - RECORTE[1]) * ESCALA)
for nome, quadros in sorted(animacoes.items()):
    quadros.sort()
    tira = Image.new("RGBA", (qw * len(quadros), qh))
    for i, (_, arquivo) in enumerate(quadros):
        q = Image.open(arquivo).convert("RGBA").crop(RECORTE).resize((qw, qh), Image.LANCZOS)
        tira.paste(q, (i * qw, 0))
    tira.save(f"{DESTINO}/{nome}.png")
    print(f"{nome}: {len(quadros)} quadros de {qw}x{qh}")
