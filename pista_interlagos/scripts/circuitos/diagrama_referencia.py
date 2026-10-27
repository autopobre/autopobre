"""Diagramas do traçado (desenhos vistos de cima, sem escala nem coordenadas) como camadas do editor de traçado.

    python diagrama_referencia.py chapeco        (chamado tambem por pacote_referencia.py)

Entrada: fontes/<circuito>/diagramas/diagramas.json e as imagens ao lado dele:
    {"fonte": "...", "diagramas": [{"arquivo": "x.png", "nome": "...", "abaixo_de_px": 95}]}
O desenho e encaixado na volta do jogo (eixo e larguras de dados/pista_<c>.json): o traço preto da volta sobre o eixo, as
margens fora dele (a 10 e 20 m da borda, longe de outro trecho da volta) no branco; primeiro escala, giro e posicao, depois
uma transformacao afim (o desenho pode esticar mais num sentido que no outro), cada etapa em tres escalas de desfoque.
Com "encaixe": "sentinel2" esse e so o chute: quem decide e o asfalto da mediana Sentinel-2 (sentinel2_mediana.tif), os
traços do desenho (a volta e os atalhos) sobre o cinza do asfalto, uma faixa branca em volta deles fora dele; o desenho fica
independente da volta do jogo, e o desvio da volta ate ele sai no relatorio.
`abaixo_de_px`: o titulo fica acima dessa linha, nao conta nem aparece.

Saida, em fontes/<circuito>/referencias/: o desenho levado para a vista de cima (UTM, 1 m por pixel), transparente fora dos
traços: o preto da volta em amarelo claro, o cinza dos atalhos em azul claro, para ler sobre as fotos e o chao escuro.
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates
from scipy.optimize import minimize

from compat_scipy import cKDTree
from config import pasta_fontes
from fotos_referencia import volta_utm

RES = 1.0
SIGMAS = (4, 2, 1)
COR_VOLTA, COR_ATALHO = (255, 236, 140), (120, 220, 255)


def montar(nome, destino, caixa):
    pasta = pasta_fontes(nome) / 'diagramas'
    arq = pasta / 'diagramas.json'
    if not arq.exists():
        return []
    cfg = json.loads(arq.read_text(encoding='utf-8'))
    xy, N, w = volta_utm(nome)
    origem = np.round(xy.mean(0), -1)
    q = xy - origem
    dentro = np.vstack([q + N * (f * w / 2)[:, None] for f in (-.4, 0, .4)])
    fora = np.vstack([xy + N * (lado * (w / 2 + extra))[:, None] for lado in (1, -1) for extra in (10.0, 20.0)])
    dist, i = cKDTree(xy).query(fora)
    fora = fora[dist - w[i] / 2 > 8] - origem
    camadas = []
    for d in cfg['diagramas']:
        cinza = np.asarray(Image.open(pasta / d['arquivo']).convert('L')).astype(float)
        preto = np.clip((110 - cinza) / 60, 0, 1)
        preto[:d.get('abaixo_de_px', 0)] = 0
        A = encaixar(preto, q, dentro, fora)
        cinza[:d.get('abaixo_de_px', 0)] = 255
        if d.get('encaixe') == 'sentinel2':
            A = encaixar_sentinel2(nome, cinza, A, caixa, origem)
            desvio_da_volta(cinza, A, q, N)
        img = vista_de_cima(cinza, A, caixa, origem)
        arquivo = 'diagrama_' + d['arquivo'].rsplit('.', 1)[0] + '.png'
        img.save(destino / arquivo, optimize=True)
        print(f'  {d["nome"]}: {img.width}x{img.height} px a {RES} m')
        camadas.append({'nome': d['nome'], 'arquivo': arquivo, 'tipo': 'planta', 'x0': caixa[0], 'y1': caixa[3], 'res': RES,
                        'visivel': True, 'fonte': cfg.get('fonte')})
    return camadas


def afim(p):
    return np.array(p, float).reshape(2, 3)


def similar(s, giro, tx, ty):
    """Mundo (leste, norte) -> pixel do desenho (direita, para baixo): escala, giro e posicao."""
    c, n = np.cos(giro), np.sin(giro)
    return np.array([[s * c, s * n, tx], [s * n, -s * c, ty]])


def encaixar(preto, eixo, dentro, fora):
    """A transformacao afim (mundo - origem -> pixel) que poe o eixo da volta no traço preto."""
    h, w = preto.shape

    def nota(A, F):
        def media(p):
            u = p @ A[:, :2].T + A[:, 2]
            ok = (u[:, 0] > 0) & (u[:, 0] < w - 1) & (u[:, 1] > 0) & (u[:, 1] < h - 1)
            return map_coordinates(F, [u[ok, 1], u[ok, 0]], order=1).sum() / len(p)
        return media(dentro) - media(fora)
    # Chute: as caixas do eixo e do traço preto, norte para cima.
    lin, col = np.nonzero(preto > .5)
    s = min((col.max() - col.min()) / np.ptp(eixo[:, 0]), (lin.max() - lin.min()) / np.ptp(eixo[:, 1]))
    meio_m = (eixo.max(0) + eixo.min(0)) / 2
    tx = (col.max() + col.min()) / 2 - s * meio_m[0]
    ty = (lin.max() + lin.min()) / 2 + s * meio_m[1]
    v = np.array([s, 0.0, tx, ty])
    for sigma in SIGMAS:
        F = gaussian_filter(preto, sigma)
        esc = np.array([s * .02, .02, 5, 5])
        r = minimize(lambda z: -nota(similar(*(v + z * esc)), F), np.zeros(4), method='Powell',
                     options={'maxiter': 4000, 'xtol': 1e-3, 'ftol': 1e-6})
        v = v + r.x * esc
    A = similar(*v).ravel()
    for sigma in SIGMAS[1:]:
        F = gaussian_filter(preto, sigma)
        esc = np.r_[np.abs(A[[0, 1]]) * .02 + 1e-4, 3, np.abs(A[[3, 4]]) * .02 + 1e-4, 3]
        r = minimize(lambda z: -nota(afim(A + z * esc), F), np.zeros(6), method='Powell',
                     options={'maxiter': 4000, 'xtol': 1e-3, 'ftol': 1e-6})
        A = A + r.x * esc
    A = afim(A)
    print(f'  encaixe: {np.hypot(*A[:, 0]):.3f} e {np.hypot(*A[:, 1]):.3f} px/m, nota {nota(A, gaussian_filter(preto, 1)):.3f}')
    return A


def encaixar_sentinel2(nome, cinza, A0, caixa, origem, res=2.0):
    """Refina A (mundo - origem -> pixel do desenho) pelo asfalto da mediana Sentinel-2: os traços do desenho no cinza do
    asfalto, a faixa branca a 4-12 px deles fora dele. Parametriza a inversa (pixel -> mundo), escala/giro/posicao e depois
    afim, em tres desfoques."""
    from scipy.ndimage import binary_dilation
    from pacote_referencia import sentinel2_em_utm
    from retificar_eixo import asfalto
    img, x0, y1, _ = sentinel2_em_utm(pasta_fontes(nome), _epsg(nome), caixa, res)
    S = asfalto(np.moveaxis(np.asarray(img, float), -1, 0))
    tinta = (235 - cinza) / 120 > .5
    margem = binary_dilation(tinta, iterations=12) & ~binary_dilation(tinta, iterations=4)
    margem[:int(np.argmax(tinta.any(1)))] = False
    pi, pm = (np.column_stack(np.nonzero(m)[::-1]).astype(float) for m in (tinta, margem))

    def nota(B, F):
        def media(p):
            m = p @ B[:, :2].T + B[:, 2] + origem
            c, l = (m[:, 0] - x0) / res - .5, (y1 - m[:, 1]) / res - .5
            return map_coordinates(F, [l, c], order=1, mode='constant', cval=0).mean()
        return media(pi) - media(pm)
    B = np.linalg.inv(np.vstack([A0, [0, 0, 1]]))[:2].ravel()
    for etapa, sigmas in (('similar', (4, 2, 1)), ('afim', (2, 1))):
        for sigma in sigmas:
            F = gaussian_filter(S, sigma)
            if etapa == 'similar':
                # (escala e giro a partir da inversa atual, posicao em metros)
                s = np.hypot(B[0], B[3])
                g = np.arctan2(B[3], B[0])
                v = np.array([s, g, B[2], B[5]])
                esc = np.array([s * .01, .01, 2, 2])
                f = lambda z: (lambda s_, g_, tx, ty: np.array([[s_ * np.cos(g_), s_ * np.sin(g_), tx],
                                                                 [s_ * np.sin(g_), -s_ * np.cos(g_), ty]]))(*(v + z * esc))
                r = minimize(lambda z: -nota(f(z), F), np.zeros(4), method='Powell', options={'maxiter': 4000, 'xtol': 1e-3,
                                                                                               'ftol': 1e-6})
                B = f(r.x).ravel()
            else:
                esc = np.r_[np.abs(B[[0, 1]]) * .01 + 1e-4, 2, np.abs(B[[3, 4]]) * .01 + 1e-4, 2]
                r = minimize(lambda z: -nota(afim(B + z * esc), F), np.zeros(6), method='Powell',
                             options={'maxiter': 4000, 'xtol': 1e-3, 'ftol': 1e-6})
                B = B + r.x * esc
    B = afim(B)
    A = np.linalg.inv(np.vstack([B, [0, 0, 1]]))[:2]
    print(f'  encaixe no Sentinel-2: {np.hypot(*A[:, 0]):.3f} e {np.hypot(*A[:, 1]):.3f} px/m, '
          f'nota {nota(B, gaussian_filter(S, 1)):.3f} (com o chute da volta: '
          f'{nota(afim(np.linalg.inv(np.vstack([A0, [0, 0, 1]]))[:2].ravel()), gaussian_filter(S, 1)):.3f})')
    return A


def _epsg(nome):
    from config import CIRCUITOS
    return CIRCUITOS[nome]['epsg']


def desvio_da_volta(cinza, A, q, N, alcance=20.0):
    """Quanto a volta do jogo se afasta do traço preto do desenho: em cada estacao, o meio do preto na normal (ate
    `alcance` m de cada lado)."""
    off = np.arange(-alcance, alcance + .1, .5)
    P = q[:, None, :] + N[:, None, :] * off[None, :, None]
    u = P @ A[:, :2].T + A[:, 2]
    preto = np.clip((110 - map_coordinates(cinza, [u[..., 1], u[..., 0]], order=1, mode='constant', cval=255)) / 60, 0, 1)
    peso = preto.sum(1)
    ok = peso > 2
    meio = (preto * off).sum(1) / np.maximum(peso, 1e-9)
    d = np.abs(meio[ok])
    print(f'  volta do jogo ao meio do traço preto: media {d.mean():.1f} m, p95 {np.percentile(d, 95):.1f} m, '
          f'max {d.max():.1f} m ({ok.mean():.0%} das estacoes com o traço na janela)')
    return meio, ok


def vista_de_cima(cinza, A, caixa, origem):
    x0, y0, x1, y1 = caixa
    W, H = int(np.ceil((x1 - x0) / RES)), int(np.ceil((y1 - y0) / RES))
    X, Y = np.meshgrid(x0 + (np.arange(W) + .5) * RES - origem[0], y1 - (np.arange(H) + .5) * RES - origem[1])
    u = A[0, 0] * X + A[0, 1] * Y + A[0, 2]
    v = A[1, 0] * X + A[1, 1] * Y + A[1, 2]
    g = map_coordinates(cinza, [v, u], order=1, mode='constant', cval=255)
    tinta = np.clip((235 - g) / 120, 0, 1)
    volta = np.clip((150 - g) / 80, 0, 1)
    cor = np.array(COR_ATALHO, float) * (1 - volta)[..., None] + np.array(COR_VOLTA, float) * volta[..., None]
    rgba = np.dstack([cor, tinta * 255]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


if __name__ == '__main__':
    from pacote_referencia import montar as montar_pacote
    montar_pacote(sys.argv[1])
