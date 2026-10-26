# -*- coding: utf-8 -*-
"""Adesivos do guincho (guincho_v1): um atlas 2048x544 com fundo transparente e as regioes que o
criar_guincho_v1.py cola na lataria (porta, cabeceira, para-brisa, placas, para-barro, traseira).

O patrocinador de mentira do jogo, GUINCHO QUEBROU-LIGOU (sponsors.js, car-livery.js), assina o caminhao; a piada
antiga do reboque de caixas ("REBOQUE · SEM PRESSA") vai na cabeceira, com a tartaruga, de frente para quem vem
rebocado. O desenho comum (fonte, tartaruga, placas) fica em modelo_3d/scripts/adesivos_comum.py.

Uso (Pillow; no PC fica no apps/geo-venv):
 python modelo_3d/guincho_v1/gerar_adesivos_guincho.py
Saida: modelo_3d/guincho_v1/texturas/guincho_adesivos_v1.png e guincho_adesivos_v1.json (regioes em UV, origem
embaixo a esquerda, como o Blender usa).
"""
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / 'scripts'))
from adesivos_comum import (K, AMARELO, PRETO, BRANCO, fonte, caixa, novo_atlas, texto_centro, gancho,  # noqa: E402
                            placa_sem_pressa, placa_mercosul, perto_demais, zebrado, salvar)

W, H = 2048, 544
# nome: (x0, y0, x1, y1) em pixels do atlas (origem em cima a esquerda)
REGIOES = {
    'porta': (0, 0, 1024, 280),
    'cabeceira': (1024, 0, 2048, 280),
    'parabrisa': (0, 280, 1024, 408),
    'placa': (1024, 280, 1536, 446),
    'parabarro': (1536, 280, 1792, 536),
    'emblema': (1792, 280, 2048, 408),
    'perto_demais': (1024, 446, 1536, 536),
    'zebrado': (0, 408, 1024, 536),
    'giroflex': (1792, 408, 2048, 536),
}


def main():
    img, d = novo_atlas(W, H)

    # --- porta: faixa preta inclinada com GUINCHO em amarelo, QUEBROU-LIGOU embaixo, gancho na ponta
    x0, y0, x1, y1 = REGIOES['porta']
    d.polygon([((x0 + 18) * K, (y0 + 150) * K), ((x0 + 60) * K, (y0 + 18) * K), ((x1 - 10) * K, (y0 + 18) * K), ((x1 - 52) * K, (y0 + 150) * K)], fill=PRETO)
    texto_centro(d, x0 + 470, y0 + 86, 'GUINCHO', fonte(126), AMARELO, inclina=.22, img=img)
    gancho(d, x0 + 900, y0 + 92, 104, AMARELO)
    d.polygon([((x0 + 6) * K, (y0 + 266) * K), ((x0 + 36) * K, (y0 + 166) * K), ((x1 - 40) * K, (y0 + 166) * K), ((x1 - 70) * K, (y0 + 266) * K)], fill=AMARELO)
    texto_centro(d, x0 + 500, y0 + 217, 'QUEBROU-LIGOU', fonte(88), PRETO, inclina=.22, img=img)

    # --- cabeceira: placa amarela com borda preta, tartaruga, REBOQUE / SEM PRESSA
    placa_sem_pressa(d, REGIOES['cabeceira'])

    # --- faixa do para-brisa: azul-escuro com o nome
    x0, y0, x1, y1 = REGIOES['parabrisa']
    d.rectangle(caixa((x0, y0, x1, y1)), fill=(18, 26, 48, 235))
    texto_centro(d, x0 + 512, y0 + 64, 'QUEBROU-LIGOU', fonte(92, 700, 85), AMARELO)

    # --- placa Mercosul de mentira: REB0Q99 (REBOQ 99)
    placa_mercosul(d, REGIOES['placa'], 'REB0Q99')

    # --- para-barro: borracha preta com letras brancas
    x0, y0, x1, y1 = REGIOES['parabarro']
    d.rectangle(caixa((x0, y0, x1, y1)), fill=(16, 16, 17, 255))
    texto_centro(d, x0 + 128, y0 + 92, 'QUEBROU?', fonte(52, 700, 75), BRANCO)
    texto_centro(d, x0 + 128, y0 + 158, 'LIGOU!', fonte(66, 700, 75), AMARELO)
    for i in range(5):
        d.rectangle(caixa((x0 + 20 + i * 46, y0 + 214, x0 + 46 + i * 46, y0 + 236)), fill=(40, 40, 42, 255))

    # --- emblema da grade: QL cromado num oval preto
    x0, y0, x1, y1 = REGIOES['emblema']
    d.ellipse(caixa((x0 + 8, y0 + 8, x1 - 8, y1 - 8)), fill=(30, 31, 33, 255), outline=(205, 208, 210, 255), width=8 * K)
    texto_centro(d, x0 + 128, y0 + 64, 'QL', fonte(84, 700, 90), (215, 218, 220, 255), inclina=.18, img=img)

    # --- adesivo da traseira e zebrado da ponta da plataforma
    perto_demais(d, REGIOES['perto_demais'])
    zebrado(img, REGIOES['zebrado'])

    # --- giroflex: GUINCHO no meio da barra de luz
    x0, y0, x1, y1 = REGIOES['giroflex']
    d.rectangle(caixa((x0, y0, x1, y1)), fill=(22, 22, 24, 255))
    texto_centro(d, x0 + 128, y0 + 64, 'GUINCHO', fonte(62, 700, 75), AMARELO)

    salvar(img, W, H, REGIOES, AQUI / 'texturas' / 'guincho_adesivos_v1.png')


if __name__ == '__main__':
    main()
