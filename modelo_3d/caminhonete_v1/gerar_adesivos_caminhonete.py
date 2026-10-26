# -*- coding: utf-8 -*-
"""Adesivos da caminhonete do resgate (caminhonete_v1): um atlas 2048x544 com fundo transparente e as regioes que o
criar_caminhonete_v1.py cola na lataria.

Ela e do GUINCHO QUEBROU-LIGOU, como o guincho plataforma (guincho_v1): RESGATE nas portas da frente, 24 HORAS (QUASE)
nas de tras, a placa REBOQUE · SEM PRESSA com a tartaruga na tampa da cacamba (de frente para o carro rebocado) e o
SE ESTA LENDO ISTO, ESTA PERTO DEMAIS embaixo dela. A marca da caminhonete e inventada: TATU 4X4.

Uso (Pillow; no PC fica no apps/geo-venv):
 python modelo_3d/caminhonete_v1/gerar_adesivos_caminhonete.py
Saida: modelo_3d/caminhonete_v1/texturas/caminhonete_adesivos_v1.png e .json (regioes em UV).
"""
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / 'scripts'))
from adesivos_comum import (K, AMARELO, PRETO, BRANCO, fonte, caixa, novo_atlas, texto_centro, gancho,  # noqa: E402
                            placa_sem_pressa, placa_mercosul, perto_demais, salvar)

W, H = 2048, 544
CROMO = (214, 218, 222, 255)
REGIOES = {
    'porta': (0, 0, 1024, 280),
    'tampa': (1024, 0, 2048, 280),
    'parabrisa': (0, 280, 1024, 408),
    'placa': (1024, 280, 1536, 446),
    'perto_demais': (1024, 446, 1536, 536),
    'emblema': (1536, 280, 1792, 408),
    'giroflex': (1792, 280, 2048, 408),
    'porta_tras': (0, 408, 1024, 536),
    'letreiro': (1536, 408, 2048, 472),
    'quatro': (1536, 472, 1792, 536),
}


def main():
    img, d = novo_atlas(W, H)

    # --- portas da frente: RESGATE em amarelo na faixa preta, gancho, QUEBROU-LIGOU na faixa amarela
    x0, y0, x1, y1 = REGIOES['porta']
    d.polygon([((x0 + 18) * K, (y0 + 150) * K), ((x0 + 60) * K, (y0 + 18) * K), ((x1 - 10) * K, (y0 + 18) * K), ((x1 - 52) * K, (y0 + 150) * K)], fill=PRETO)
    texto_centro(d, x0 + 460, y0 + 86, 'RESGATE', fonte(126), AMARELO, inclina=.22, img=img)
    gancho(d, x0 + 900, y0 + 92, 104, AMARELO)
    d.polygon([((x0 + 6) * K, (y0 + 266) * K), ((x0 + 36) * K, (y0 + 166) * K), ((x1 - 40) * K, (y0 + 166) * K), ((x1 - 70) * K, (y0 + 266) * K)], fill=AMARELO)
    texto_centro(d, x0 + 500, y0 + 217, 'QUEBROU-LIGOU', fonte(88), PRETO, inclina=.22, img=img)

    # --- tampa da cacamba: a placa SEM PRESSA
    placa_sem_pressa(d, REGIOES['tampa'])

    # --- faixa do para-brisa
    x0, y0, x1, y1 = REGIOES['parabrisa']
    d.rectangle(caixa((x0, y0, x1, y1)), fill=(18, 26, 48, 235))
    texto_centro(d, x0 + 512, y0 + 64, 'QUEBROU-LIGOU', fonte(92, 700, 85), AMARELO)

    # --- placa: SOS 4X4 4
    placa_mercosul(d, REGIOES['placa'], 'SOS4X44')
    perto_demais(d, REGIOES['perto_demais'])

    # --- emblema da grade: TATU num oval cromado
    x0, y0, x1, y1 = REGIOES['emblema']
    d.ellipse(caixa((x0 + 8, y0 + 8, x1 - 8, y1 - 8)), fill=(28, 29, 31, 255), outline=CROMO, width=9 * K)
    texto_centro(d, x0 + 128, y0 + 64, 'TATU', fonte(70, 700, 85), CROMO)

    # --- giroflex: RESGATE no meio da barra
    x0, y0, x1, y1 = REGIOES['giroflex']
    d.rectangle(caixa((x0, y0, x1, y1)), fill=(22, 22, 24, 255))
    texto_centro(d, x0 + 128, y0 + 64, 'RESGATE', fonte(58, 700, 75), AMARELO)

    # --- portas de tras: 24 HORAS e a etiqueta (QUASE)
    x0, y0, x1, y1 = REGIOES['porta_tras']
    texto_centro(d, x0 + 400, y0 + 64, '24 HORAS', fonte(104), PRETO, inclina=.22, img=img)
    d.rounded_rectangle(caixa((x0 + 690, y0 + 34, x0 + 930, y0 + 98)), radius=10 * K, fill=AMARELO, outline=PRETO, width=4 * K)
    texto_centro(d, x0 + 810, y0 + 66, '(QUASE)', fonte(52, 700, 80), PRETO)

    # --- letreiro da tampa: TATU em letras cromadas
    x0, y0, x1, y1 = REGIOES['letreiro']
    texto_centro(d, x0 + 256, y0 + 32, 'T  A  T  U', fonte(56, 700, 100), CROMO)

    # --- 4X4 da lateral da cacamba
    x0, y0, x1, y1 = REGIOES['quatro']
    d.polygon([((x0 + 6) * K, (y1 - 6) * K), ((x0 + 30) * K, (y0 + 6) * K), ((x1 - 6) * K, (y0 + 6) * K), ((x1 - 30) * K, (y1 - 6) * K)], fill=PRETO)
    texto_centro(d, x0 + 128, y0 + 32, '4X4', fonte(48, 700, 80), AMARELO, inclina=.22, img=img)

    salvar(img, W, H, REGIOES, AQUI / 'texturas' / 'caminhonete_adesivos_v1.png')


if __name__ == '__main__':
    main()
