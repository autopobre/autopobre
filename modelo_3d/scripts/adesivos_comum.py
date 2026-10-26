# -*- coding: utf-8 -*-
"""Desenho dos atlas de adesivos dos veiculos (Pillow): texto centrado (com italico por cisalhamento), a tartaruga do
SEM PRESSA, o gancho, a placa Mercosul de mentira, o adesivo PERTO DEMAIS, o zebrado, e a gravacao do PNG com as
regioes em UV (origem embaixo a esquerda, como o Blender usa) num JSON ao lado.

Tudo e desenhado em K vezes o tamanho e reduzido no fim (bordas suaves). Fonte: Bahnschrift (Windows), so rasterizada
aqui; nada de telefone nem marca real.
"""
import json
import math
from PIL import Image, ImageDraw, ImageFont

FONTE = 'C:/Windows/Fonts/bahnschrift.ttf'
K = 2

AMARELO = (242, 196, 24, 255)
PRETO = (20, 21, 22, 255)
BRANCO = (244, 243, 238, 255)
VERMELHO = (196, 28, 32, 255)
AZUL = (24, 58, 140, 255)
CINZA = (92, 96, 100, 255)


def fonte(px, peso=700, largura=75):
    f = ImageFont.truetype(FONTE, int(px * K))
    f.set_variation_by_axes([peso, largura])
    return f


def caixa(r):
    x0, y0, x1, y1 = r
    return x0 * K, y0 * K, x1 * K, y1 * K


def novo_atlas(w, h):
    img = Image.new('RGBA', (w * K, h * K), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def texto_centro(d, cx, cy, txt, f, cor, inclina=0.0, img=None):
    """Texto centrado em (cx, cy) (px do atlas). inclina: italico por cisalhamento (desenhado em camada propria)."""
    l, t, r, b = d.textbbox((0, 0), txt, font=f, anchor='lt')
    w, h = r - l, b - t
    if not inclina:
        d.text((cx * K - w / 2 - l, cy * K - h / 2 - t), txt, font=f, fill=cor)
        return
    pad = int(h * abs(inclina)) + 8
    camada = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(camada).text((pad - l, pad - t), txt, font=f, fill=cor)
    # x' = x + inclina * (y - centro): o topo vai para a direita
    camada = camada.transform(camada.size, Image.AFFINE, (1, inclina, -inclina * camada.size[1] / 2, 0, 1, 0), resample=Image.BICUBIC)
    img.alpha_composite(camada, (int(cx * K - camada.size[0] / 2), int(cy * K - camada.size[1] / 2)))


def tartaruga(d, cx, cy, s, casco=(46, 120, 62, 255), pele=(120, 170, 80, 255), linha=PRETO, bone=AMARELO):
    """A tartaruga do SEM PRESSA, de perfil para a direita, de bone. s: largura do casco (px do atlas)."""
    cx, cy, s = cx * K, cy * K, s * K
    lw = max(2, int(s * .045))
    # patas e rabo atras do casco
    for px in (-.32, .26):
        d.rounded_rectangle((cx + px * s - s * .09, cy - s * .02, cx + px * s + s * .09, cy + s * .2), radius=s * .05, fill=pele, outline=linha, width=lw)
    d.polygon([(cx - s * .5, cy - s * .02), (cx - s * .66, cy + s * .05), (cx - s * .48, cy + s * .08)], fill=pele, outline=linha)
    # cabeca e pescoco
    d.rounded_rectangle((cx + s * .36, cy - s * .16, cx + s * .6, cy + s * .02), radius=s * .07, fill=pele, outline=linha, width=lw)
    d.ellipse((cx + s * .46, cy - s * .36, cx + s * .78, cy - s * .06), fill=pele, outline=linha, width=lw)
    d.ellipse((cx + s * .62, cy - s * .28, cx + s * .69, cy - s * .21), fill=linha)
    d.arc((cx + s * .58, cy - s * .2, cx + s * .74, cy - s * .1), 10, 120, fill=linha, width=lw)
    # bone
    d.chord((cx + s * .45, cy - s * .48, cx + s * .78, cy - s * .2), 180, 360, fill=bone, outline=linha, width=lw)
    d.rounded_rectangle((cx + s * .66, cy - s * .36, cx + s * .9, cy - s * .31), radius=s * .02, fill=bone, outline=linha, width=lw)
    # casco: meia elipse com o desenho dos escudos
    d.chord((cx - s * .5, cy - s * .5, cx + s * .5, cy + s * .14), 180, 360, fill=casco, outline=linha, width=lw)
    d.rectangle((cx - s * .5, cy - s * .04, cx + s * .5, cy + s * .04), fill=(230, 200, 120, 255), outline=linha, width=lw)
    claro = tuple(min(255, int(c * 1.35)) for c in casco[:3]) + (255,)
    for ox, oy, r in [(-.24, -.16, .11), (0, -.26, .12), (.24, -.16, .11), (-.12, -.06, .07), (.12, -.06, .07)]:
        pts = [(cx + (ox + r * math.cos(a)) * s, cy + (oy + r * .8 * math.sin(a)) * s) for a in [k * math.pi / 3 for k in range(6)]]
        d.polygon(pts, fill=claro, outline=linha)


def gancho(d, cx, cy, s, cor):
    """Um gancho de reboque estilizado (s: altura em px do atlas)."""
    cx, cy, s = cx * K, cy * K, s * K
    lw = int(s * .14)
    d.line((cx, cy - s * .5, cx, cy + s * .1), fill=cor, width=lw)
    d.arc((cx - s * .32, cy - s * .12, cx + s * .32, cy + s * .5), 0, 200, fill=cor, width=lw)
    d.ellipse((cx - s * .12, cy - s * .62, cx + s * .12, cy - s * .38), outline=cor, width=int(lw * .7))


def placa_sem_pressa(d, regiao):
    """A placa amarela REBOQUE / SEM PRESSA com a tartaruga (regiao de 1024 x 280)."""
    x0, y0, x1, y1 = regiao
    d.rectangle(caixa((x0, y0, x1, y1)), fill=PRETO)
    d.rounded_rectangle(caixa((x0 + 12, y0 + 12, x1 - 12, y1 - 12)), radius=18 * K, fill=AMARELO)
    tartaruga(d, x0 + 165, y0 + 168, 210)
    texto_centro(d, x0 + 640, y0 + 82, 'REBOQUE', fonte(96, 700, 85), PRETO)
    texto_centro(d, x0 + 640, y0 + 190, 'SEM PRESSA', fonte(132, 700, 75), PRETO)


def placa_mercosul(d, regiao, texto):
    """Placa Mercosul de mentira (regiao de 512 x 166): faixa azul com BRASIL e a bandeira."""
    x0, y0, x1, y1 = regiao
    d.rounded_rectangle(caixa((x0 + 2, y0 + 2, x1 - 2, y1 - 2)), radius=10 * K, fill=BRANCO, outline=PRETO, width=4 * K)
    d.rounded_rectangle(caixa((x0 + 6, y0 + 6, x1 - 6, y0 + 40)), radius=6 * K, fill=AZUL)
    texto_centro(d, x0 + 256, y0 + 23, 'BRASIL', fonte(26, 600, 100), BRANCO)
    d.rectangle(caixa((x1 - 52, y0 + 12, x1 - 18, y0 + 34)), fill=(0, 150, 64, 255))
    d.polygon([((x1 - 35) * K, (y0 + 13) * K), ((x1 - 20) * K, (y0 + 23) * K), ((x1 - 35) * K, (y0 + 33) * K), ((x1 - 50) * K, (y0 + 23) * K)], fill=(250, 214, 0, 255))
    texto_centro(d, x0 + 256, y0 + 104, texto, fonte(104, 600, 88), PRETO)


def perto_demais(d, regiao):
    """O adesivo da traseira (regiao de 512 x 90): quem le isto esta na fita de 5 m."""
    x0, y0, x1, y1 = regiao
    d.rounded_rectangle(caixa((x0 + 2, y0 + 2, x1 - 2, y1 - 2)), radius=10 * K, fill=AMARELO, outline=PRETO, width=4 * K)
    texto_centro(d, x0 + 256, y0 + 30, 'SE ESTÁ LENDO ISTO,', fonte(36, 700, 75), PRETO)
    texto_centro(d, x0 + 256, y0 + 64, 'ESTÁ PERTO DEMAIS', fonte(40, 700, 75), PRETO)


def zebrado(img, regiao, passo=64):
    """Diagonais vermelhas e brancas, numa camada do tamanho da regiao (as que passam da borda ficam de fora)."""
    x0, y0, x1, y1 = regiao
    camada = Image.new('RGBA', ((x1 - x0) * K, (y1 - y0) * K), BRANCO)
    dz, h = ImageDraw.Draw(camada), y1 - y0
    for i in range(-4, (x1 - x0) // passo + 4):
        a = i * passo
        dz.polygon([(a * K, h * K), ((a + passo / 2) * K, h * K), ((a + passo / 2 + h) * K, 0), ((a + h) * K, 0)], fill=VERMELHO)
    img.paste(camada, (x0 * K, y0 * K))


def salvar(img, w, h, regioes, png):
    """Reduz o atlas, grava o PNG e, ao lado, as regioes em UV (mesmo nome, .json)."""
    img = img.resize((w, h), Image.LANCZOS)
    png.parent.mkdir(parents=True, exist_ok=True)
    img.save(png, optimize=True)
    uv = {n: [x0 / w, 1 - y1 / h, x1 / w, 1 - y0 / h] for n, (x0, y0, x1, y1) in regioes.items()}
    png.with_suffix('.json').write_text(json.dumps(uv, indent=1), encoding='utf-8')
    print('atlas', png)
