"""Fotos aereas obliquas (quadros de um video) como referencias do editor de traçado.

    python fotos_referencia.py chapeco        (chamado tambem por pacote_referencia.py)

Entrada: fontes/<circuito>/fotos/fotos.json e as fotos ao lado dele:
    {"fonte": "...", "semente": "g_030.jpg", "pontos": [[u, v, E, N], ...], "fotos": ["g_022.jpg", ...], "saida": [...]}
`pontos`: uns poucos pontos da foto semente (pixel u, v e UTM E, N do circuito), so para o chute. A homografia (chao -> foto)
sai deles e e refinada encostando a faixa de asfalto da volta do jogo (eixo e larguras de dados/pista_<c>.json) no asfalto
escuro da foto: o meio da faixa no asfalto, as margens fora dele (a 4 e 8 m da borda, longe de outro trecho da volta), em
tres escalas de desfoque. As outras fotos, na ordem da lista, partem da homografia da vizinha ja ajustada (meio segundo de
voo muda pouco) e se refinam do mesmo jeito: so a semente pede pontos.

Saida, em fontes/<circuito>/referencias/ (fora do repositorio e do site; as fotos sao de terceiros, so para conferir):
- cada foto de `saida` como camada 'perspectiva' do editor (a foto como foi tirada, com as linhas projetadas nela);
- 'fotos_vista_de_cima.jpg': as fotos de `saida` levadas para a vista de cima (UTM), cada pixel da que ve aquele chao com mais
  detalhe (ate 2,5 m por pixel da foto), como camada 'planta'.
A homografia supoe o chao plano: com os 18,5 m de desnivel de Chapeco a foto pode escorregar alguns metros longe da volta.
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates
from scipy.optimize import minimize

from compat_scipy import cKDTree
from config import CIRCUITOS, DADOS, pasta_fontes

RES_PLANTA = .5            # m por pixel da vista de cima
DETALHE_MAX = 2.5          # m de chao por pixel da foto, no maximo, na vista de cima
SIGMAS = (6, 3, 1.5)       # desfoque (px) das tres escalas do ajuste


def volta_utm(nome):
    """Eixo, normais e larguras da volta do jogo em UTM do circuito."""
    d = json.loads((DADOS / f'pista_{nome}.json').read_text(encoding='utf-8'))
    m = d['meta']
    k, o = m.get('horizontal_scale_to_nominal') or 1, np.array(m['origin_utm'][:2])
    A = np.array(d['samples'], float)
    return A[:, 1:3] / k + o, A[:, 9:11], A[:, 4] / k


def dlt(mundo, foto):
    M = []
    for (x, y), (u, v) in zip(mundo, foto):
        M += [[x, y, 1, 0, 0, 0, -u * x, -u * y, -u], [0, 0, 0, x, y, 1, -v * x, -v * y, -v]]
    h = np.linalg.svd(np.array(M, float))[2][-1].reshape(3, 3)
    return h / h[2, 2]


def projetar(H, q):
    r = np.c_[q, np.ones(len(q))] @ H.T
    return r[:, :2] / r[:, 2:3], r[:, 2]


def asfalto_da_foto(rgb):
    """Cara de asfalto novo (0 a 1): escuro e cinza (a terra e a grama sao saturadas, o concreto e os escapes mais claros)."""
    a = rgb.astype(float)
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    return np.clip((110 - mx) / 50, 0, 1) * np.clip((.35 - sat) / .2, 0, 1)


class Faixa:
    """Pontos do chao dentro da faixa da volta e nas margens fora dela, no referencial da homografia (UTM - origem)."""

    def __init__(self, xy, N, w, origem):
        self.dentro = np.vstack([xy + N * (f * w / 2)[:, None] for f in (-.6, -.3, 0, .3, .6)]) - origem
        fora = np.vstack([xy + N * (lado * (w / 2 + extra))[:, None] for lado in (1, -1) for extra in (4.0, 8.0)])
        dist, i = cKDTree(xy).query(fora)
        self.fora = fora[dist - w[i] / 2 > 3] - origem

    def nota(self, H, F):
        h_, w_ = F.shape

        def media(q):
            p, z = projetar(H, q)
            ok = (z > 0) & (p[:, 0] > 0) & (p[:, 0] < w_ - 1) & (p[:, 1] > 0) & (p[:, 1] < h_ - 1)
            return (map_coordinates(F, [p[ok, 1], p[ok, 0]], order=1).mean() if ok.any() else 0.0), ok.mean()
        a, fa = media(self.dentro)
        b, _ = media(self.fora)
        return (a - b) * min(1.0, fa / .6)


def ajustar(H, asf, faixa):
    """Refina a homografia (8 numeros, h33 = 1) em tres escalas de desfoque, cada numero em passos relativos ao seu valor."""
    h = (H / H[2, 2]).ravel()[:8]
    for sigma in SIGMAS:
        F = gaussian_filter(asf, sigma)
        escala = np.abs(h) + 1e-9
        r = minimize(lambda z: -faixa.nota(np.r_[h + z * escala * .02, 1].reshape(3, 3), F), np.zeros(8), method='Powell',
                     options={'maxiter': 4000, 'xtol': 1e-3, 'ftol': 1e-5})
        h = h + r.x * escala * .02
    H = np.r_[h, 1].reshape(3, 3)
    return H, faixa.nota(H, gaussian_filter(asf, SIGMAS[-1]))


def vista_de_cima(fotos, caixa, origem):
    """Mosaico na vista de cima: cada pixel da foto que ve aquele chao com mais detalhe (ate DETALHE_MAX m por pixel)."""
    x0, y0, x1, y1 = caixa
    W, Hh = int(np.ceil((x1 - x0) / RES_PLANTA)), int(np.ceil((y1 - y0) / RES_PLANTA))
    X, Y = np.meshgrid(x0 + (np.arange(W) + .5) * RES_PLANTA, y1 - (np.arange(Hh) + .5) * RES_PLANTA)
    q = np.column_stack([X.ravel(), Y.ravel()]) - origem
    melhor = np.full(len(q), DETALHE_MAX)
    saida = np.zeros((len(q), 3), np.uint8)
    for rgb, H in fotos:
        p, z = projetar(H, q)
        h_, w_ = rgb.shape[:2]
        # Metros de chao por pixel da foto: o inverso da raiz do determinante do jacobiano da homografia ali.
        e = 1.0
        px, _ = projetar(H, q + [e, 0])
        py, _ = projetar(H, q + [0, e])
        det = np.abs((px[:, 0] - p[:, 0]) * (py[:, 1] - p[:, 1]) - (px[:, 1] - p[:, 1]) * (py[:, 0] - p[:, 0]))
        m_px = 1 / np.sqrt(np.maximum(det, 1e-12))
        ok = (z > 0) & (p[:, 0] > 1) & (p[:, 0] < w_ - 2) & (p[:, 1] > 1) & (p[:, 1] < h_ - 2) & (m_px < melhor)
        cores = np.stack([map_coordinates(rgb[..., c].astype(float), [p[ok, 1], p[ok, 0]], order=1) for c in range(3)], -1)
        saida[ok] = np.clip(cores, 0, 255).astype(np.uint8)
        melhor[ok] = m_px[ok]
    img = Image.fromarray(saida.reshape(Hh, W, 3))
    coberto = float((melhor < DETALHE_MAX).mean())
    return img, coberto


def montar(nome, destino, caixa):
    """Camadas das fotos para camadas.json (as perspectivas e a vista de cima), gravando as imagens em `destino`."""
    pasta = pasta_fontes(nome) / 'fotos'
    arq = pasta / 'fotos.json'
    if not arq.exists():
        return []
    cfg = json.loads(arq.read_text(encoding='utf-8'))
    xy, N, w = volta_utm(nome)
    origem = np.round(xy.mean(0), -1)
    faixa = Faixa(xy, N, w, origem)
    lista = cfg['fotos']
    i0 = lista.index(cfg['semente'])
    pts = np.array(cfg['pontos'], float)
    H = {}
    for ordem in (range(i0, len(lista)), range(i0 - 1, -1, -1)):
        anterior = H[lista[i0]] if lista[i0] in H else dlt(pts[:, 2:] - origem, pts[:, :2])
        for i in ordem:
            rgb = np.asarray(Image.open(pasta / lista[i]).convert('RGB'))
            Hi, nota = ajustar(anterior, asfalto_da_foto(rgb), faixa)
            H[lista[i]] = Hi
            anterior = Hi
            print(f'  {lista[i]}: nota {nota:.3f}')
    camadas = []
    fotos = []
    for f in cfg.get('saida', lista):
        rgb = np.asarray(Image.open(pasta / f).convert('RGB'))
        Image.fromarray(rgb).save(destino / f'foto_{f}', quality=90)
        camadas.append({'nome': f'Foto aérea {f.rsplit(".", 1)[0]}', 'arquivo': f'foto_{f}', 'tipo': 'perspectiva',
                        'H': np.round(H[f], 12).tolist(), 'origem': origem.tolist(), 'fonte': cfg.get('fonte')})
        fotos.append((rgb, H[f]))
    img, coberto = vista_de_cima(fotos, caixa, origem)
    img.save(destino / 'fotos_vista_de_cima.jpg', quality=88)
    print(f'  vista de cima: {img.width}x{img.height} px a {RES_PLANTA} m, {coberto:.0%} da caixa')
    camadas.insert(0, {'nome': 'Fotos aéreas, vista de cima', 'arquivo': 'fotos_vista_de_cima.jpg', 'tipo': 'planta',
                       'x0': caixa[0], 'y1': caixa[3], 'res': RES_PLANTA, 'fonte': cfg.get('fonte')})
    return camadas


if __name__ == '__main__':
    from pacote_referencia import montar as montar_pacote
    montar_pacote(sys.argv[1])
