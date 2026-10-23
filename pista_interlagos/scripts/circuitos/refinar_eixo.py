"""Refina o eixo OSM do circuito (e do pit lane) sobre a imagem aerea de referencia.

    python refinar_eixo.py cascavel

Entrada: fontes/<c>/osm.json e fontes/<c>/referencia_esri.jpg (baixar_fontes.py --referencia).
Saida:   fontes/<c>/eixo_refinado.json (UTM SIRGAS 2000, metros) e
         fontes/<c>/eixo_refinado.jpg (conferencia visual).

Metodo (mesma ideia de ../refinar_tracado.py): o tracado OSM, desenhado por
mapeadores sobre imagens aereas, e ordenado no sentido da corrida e suavizado por
spline periodica. A imagem e retificada em transectos a cada 2 m (0,25 m por
amostra); indices de "asfalto" (cinza pouco saturado), "nao asfalto" (grama, terra
vermelha, zebra) e "linha branca" alimentam uma programacao dinamica que escolhe,
com continuidade, o deslocamento do centro e a largura da faixa asfaltada em cada
estacao. Duas passadas; a segunda corre ao longo do eixo ja corrigido. Os pixels da
imagem nao entram no jogo: so a geometria medida.
"""
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw
from projecao import Transformer
from compat_scipy import CubicSpline, gaussian_filter1d, map_coordinates, savgol_filter, uniform_filter1d

from config import CIRCUITOS, pasta_fontes

Image.MAX_IMAGE_PIXELS = None
DD = .25          # passo transversal (m)
DS = 2.0          # passo entre estacoes (m)


def carregar_osm(pasta):
    d = json.loads((pasta / 'osm.json').read_text(encoding='utf-8'))
    nos = {e['id']: (e['lon'], e['lat']) for e in d['elements'] if e['type'] == 'node'}
    vias = {e['id']: e for e in d['elements'] if e['type'] == 'way'}
    return nos, vias


def rota(nome, vias):
    """Sequencia de nos OSM no sentido da corrida, fechada (sem repetir o primeiro)."""
    if nome == 'cascavel':
        # Anti-horario: reta dos boxes (164452243), Baciao (164452250), subida interna
        # e curva 3 (164452245), reta de tras/retorno ao S (146619775).
        seq = []
        for w in (146619775, 164452243, 164452250, 164452245):
            nos = vias[w]['nodes']
            seq += nos if not seq else nos[1:]
        assert seq[0] == seq[-1]
        return seq[:-1]
    if nome == 'piracicaba':
        # O anel externo (423654779) esta desenhado no sentido anti-horario; o miolo
        # (423654780) sai do no 16 do anel e volta no no 17. Sentido horario (ECPA):
        # percorre o anel ao contrario e entra no miolo pelo no 17.
        anel = vias[423654779]['nodes'][:-1]
        miolo = vias[423654780]['nodes']
        i16, i17 = anel.index(miolo[0]), anel.index(miolo[-1])
        assert i17 == i16 + 1
        # Ordem horaria a partir do no 17: miolo invertido ate o no 16, depois o anel
        # invertido do no 16 ate voltar ao 17.
        seq = miolo[::-1]
        k = i16
        while True:
            k = (k - 1) % len(anel)
            if k == i17:
                break
            seq.append(anel[k])
        return seq
    if nome == 'chapeco':
        # Um so contorno fechado (leisure=track, mapeado em 27/05/2026), ja desenhado no
        # sentido horario da corrida. Os atalhos dos tracados alternativos nao estao no OSM.
        nos = vias[1523801531]['nodes']
        assert nos[0] == nos[-1]
        return nos[:-1]
    if nome == 'brasilia':
        # Tracado completo de 5.384 m, redesenhado no OSM depois da reforma (fev/2026), no sentido
        # horario da corrida (oneway). A via passa duas vezes pelo no do grampo de baixo: do no 0
        # ao 96 e a volta; do 97 em diante segue para o anel externo (via 219975884). O no 0 e o
        # entroncamento com o anel e faz um bico no desenho (reta de 180 m chegando e virada brusca):
        # fica de fora, e o spline vai do 96 ao 1 pela curva que o asfalto faz.
        nos = vias[32900091]['nodes']
        fim = nos.index(nos[0], 1)
        return nos[1:fim]
    if nome == 'goiania':
        # Tracado misto de 3.835 m: a relacao de circuito 15921950 junta duas vias oneway, ja no sentido
        # horario da corrida. 288004311 sai do meio da reta principal (onde o pit lane volta), faz a
        # curva 1, o anel de cima e o miolo; 288004307 desce a reta oposta, contorna a curva inclinada de
        # baixo e sobe a reta principal. Os atalhos dos tracados externo e curto (288004313, 288004320)
        # ficam de fora.
        seq = vias[288004311]['nodes'] + vias[288004307]['nodes'][1:]
        assert seq[0] == seq[-1]
        return seq[:-1]
    if nome == 'velocitta':
        # Traçado de competicao (3.443 m, o da Stock Car): a via 478876097 fecha a volta, ja no sentido anti-horario
        # da corrida, pela Caipirinha e pela Ferradura. O laco das curvas 3 e 4 originais (1156617273), a ultima curva
        # original (1156617274) e as ligacoes dos circuitos curtos (478876098, 750945804, 750945805) sao trechos fechados.
        nos = vias[478876097]['nodes']
        assert nos[0] == nos[-1]
        return nos[:-1]
    raise KeyError(nome)


def rota_boxes(nome, vias):
    if nome == 'cascavel':
        # Desenhado da saida (reta interna, depois do Baciao) para a entrada (reta de
        # cima): no sentido da corrida, entra pela reta de cima.
        return vias[628049496]['nodes'][::-1]
    if nome == 'brasilia':
        # Entrada pelo lado de dentro da curva antes da reta de largada (1450655789), a faixa
        # diante do patio dos boxes (1450655791) e a saida por dentro da curva 1 ate a reta
        # longa (32900119, desenhada da saida para dentro).
        entrada, faixa, saida = (vias[w]['nodes'] for w in (1450655789, 1450655791, 32900119))
        assert entrada[-1] == faixa[0] and faixa[-1] == saida[-1]
        return entrada + faixa[1:] + saida[::-1][1:]
    if nome == 'goiania':
        # "Pit Lane" (879890871, oneway): sai da reta oposta antes da curva inclinada, corta por dentro
        # dela e corre ao lado da reta principal diante dos boxes ate voltar no meio dela.
        return vias[879890871]['nodes']
    if nome == 'velocitta':
        # Pit lane (677322173): sai da pista no alto, antes do grampo que leva a Ferradura, contorna o grampo por fora,
        # passa diante dos boxes ao norte da reta e volta na curva 1.
        return vias[677322173]['nodes']
    return None


# Trechos de asfalto fora do traçado de corrida (config 'trechos_fechados'): desenhados no jogo e fechados por barreiras.
# Cada um: via OSM (no sentido em que foi mapeada), nome, tipo e largura de partida da medida.
FECHADOS = {
    'velocitta': [
        {'via': 1156617273, 'id': 'curvas_3_4', 'nome': 'Curvas 3 e 4 do traçado original', 'tipo': 'tracado', 'largura': 12},
        {'via': 1156617274, 'id': 'paciencia', 'nome': 'Curva da Paciência · última curva do traçado original',
         'tipo': 'tracado', 'largura': 12},
        {'via': 478876098, 'id': 'ligacao_h', 'nome': 'Ligação do H', 'tipo': 'ligacao', 'largura': 11},
        {'via': 750945804, 'id': 'anel_superior', 'nome': 'Ligação do anel superior', 'tipo': 'ligacao', 'largura': 11},
        {'via': 750945805, 'id': 'ligacao_curta', 'nome': 'Ligação curta', 'tipo': 'ligacao', 'largura': 9},
        {'via': 718141140, 'id': 'acesso_museu', 'nome': 'Acesso do Museu', 'tipo': 'servico', 'largura': 6},
    ],
}


def refinar_fechados(nome, ref, vias, nos, T):
    """Eixo e largura de cada trecho fechado, medidos como o pit lane (uma via aberta), com deslocamento curto: as vias
    OSM ja seguem o asfalto e as pontas encostam na pista, cujo asfalto a medida nao deve puxar."""
    saida = []
    for f in FECHADOS.get(nome, []):
        pts = np.array([T.transform(*nos[n]) for n in vias[f['via']]['nodes']])
        L_osm = float(np.sum(np.linalg.norm(np.diff(pts, axis=0), axis=1)))
        w0 = f['largura']
        if L_osm < 60:
            # Curto demais para a programacao (a ligacao curta, 38 m entre a pista e a ligacao do anel): o desenho OSM.
            cs, L = spline(pts, False)
            _, P, _ = estacoes(cs, L, False)
            w = np.full(len(P), float(w0))
        else:
            P, _, w, L, _ = refinar(ref, pts, False, [(2.5, max(5, w0 - 4), w0 + 3)], w0)
        saida.append({'id': f['id'], 'nome': f['nome'], 'tipo': f['tipo'], 'via_osm': f['via'], 'comprimento_osm_m': L_osm,
                      'comprimento_m': float(L), 'eixo': np.round(P, 3).tolist(), 'largura_m': np.round(w, 2).tolist()})
        print(f'  fechado {f["id"]}: OSM {L_osm:.0f} m -> {L:.0f} m, largura media {np.mean(w):.1f} m')
    return saida


class Referencia:
    def __init__(self, pasta, epsg):
        meta = json.loads((pasta / 'referencia_esri.json').read_text())
        self.z, self.tx0, self.ty0 = meta['z'], meta['tx0'], meta['ty0']
        self.img = np.asarray(Image.open(pasta / 'referencia_esri.jpg').convert('RGB')).astype(np.float32)
        self.inv = Transformer.from_crs(epsg, 4326, always_xy=True)

    def px(self, x, y):
        lon, lat = self.inv.transform(x, y)
        k = 2 ** self.z
        col = (np.asarray(lon) + 180) / 360 * k
        row = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * k
        return (col - self.tx0) * 256 - .5, (row - self.ty0) * 256 - .5

    def rgb(self, x, y):
        c, r = self.px(x, y)
        return np.stack([map_coordinates(self.img[..., k], [r, c], order=1, mode='nearest') for k in range(3)], -1)


class ReferenciaSentinel2(Referencia):
    """Cor real do Sentinel-2 (10 m) no lugar da imagem aerea, para um circuito construido
    depois da ultima imagem aerea (Chapeco: a Esri de 08/2024 ainda mostra a terraplanagem).
    Reamostrada a 2 m por pixel na grade da cena, com o contraste esticado para a faixa da
    imagem aerea (os limiares sao recalibrados em calibrar())."""
    SUB = 5

    def __init__(self, pasta, epsg):
        import geo_io
        g = geo_io.ler(pasta / 'sentinel2_rgb.tif')
        a = np.moveaxis(g.a, 0, -1).astype(np.float32)
        self.t, crs = g.transform, g.epsg
        lo, hi = np.percentile(a, 1), np.percentile(a, 99.7)
        a = np.clip((a - lo) / (hi - lo) * 235 + 10, 0, 255)
        k = self.SUB
        g = (np.arange(a.shape[0] * k) + .5) / k - .5, (np.arange(a.shape[1] * k) + .5) / k - .5
        R, C = np.meshgrid(*g, indexing='ij')
        self.img = np.clip(np.stack([map_coordinates(a[..., b], [R, C], order=3, mode='nearest') for b in range(3)], -1), 0, 255)
        self.inv = Transformer.from_crs(epsg, crs, always_xy=True)

    def px(self, x, y):
        u, v = self.inv.transform(x, y)
        col, lin = ~self.t * (np.asarray(u), np.asarray(v))
        return np.asarray(col) * self.SUB - .5, np.asarray(lin) * self.SUB - .5


class ReferenciaOrto(Referencia):
    """Ortofoto local numa grade UTM (Goiania: a de 2016 da Prefeitura, 0,25 m por pixel, exportada por
    baixar_fontes.py), georreferenciada com as curvas de nivel e os equipamentos da Prefeitura."""

    def __init__(self, pasta, epsg):
        meta = json.loads((pasta / 'referencia_orto.json').read_text())
        assert meta['epsg'] == epsg
        self.x0, self.y1, self.passo = meta['x0'], meta['y1'], meta['px']
        self.img = np.asarray(Image.open(pasta / 'referencia_orto.jpg').convert('RGB')).astype(np.float32)

    def px(self, x, y):
        return (np.asarray(x) - self.x0) / self.passo - .5, (self.y1 - np.asarray(y)) / self.passo - .5


LIMIAR ={'sat': 34.0, 'lum_min': 28.0, 'lum_max': 185.0}


def calibrar(ref, P, N):
    """Limiar de saturacao do asfalto deste circuito: entre o eixo e os arredores."""
    amostra = lambda d: ref.rgb(P[:, 0] + d * N[:, 0], P[:, 1] + d * N[:, 1])
    pista = np.concatenate([amostra(d) for d in (-2, 0, 2)])
    fora = np.concatenate([amostra(d) for d in (-25, -20, 20, 25)])
    sat = lambda f: f.max(-1) - f.min(-1)
    lum = pista.mean(-1)
    LIMIAR['sat'] = float((np.percentile(sat(pista), 75) + np.percentile(sat(fora), 50)) / 2)
    LIMIAR['lum_min'] = float(max(20, np.percentile(lum, 2) - 15))
    LIMIAR['lum_max'] = float(min(190, np.percentile(lum, 98) + 20))
    return dict(LIMIAR)


def indices(f):
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    lum = (r + g + b) / 3
    sat = f.max(-1) - f.min(-1)
    estrada = (np.clip((LIMIAR['sat'] - sat) / 8 + .5, 0, 1) * np.clip((lum - LIMIAR['lum_min']) / 12, 0, 1)
               * np.clip((LIMIAR['lum_max'] - lum) / 15, 0, 1))
    veg = (g > r + 3) & (g > b + 8) & (sat > LIMIAR['sat'] - 4)
    terra = (r > g + 7) & (r > b + 16) & (sat > LIMIAR['sat'] + 2)
    nao = np.clip(veg + terra, 0, 1).astype(np.float32)
    branco = np.clip((lum - 150) / 35, 0, 1) * np.clip((45 - sat) / 15, 0, 1)
    return estrada, nao, branco


def spline(pts, fechado):
    pts = np.asarray(pts, float)
    if fechado:
        pts = np.vstack([pts, pts[:1]])
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    keep = np.concatenate([[True], np.diff(s) > .05])
    pts, s = pts[keep], s[keep]
    return CubicSpline(s, pts, bc_type='periodic' if fechado else 'natural'), s[-1]


def estacoes(cs, comprimento, fechado):
    n = int(round(comprimento / DS))
    ss = np.linspace(0, comprimento, n, endpoint=not fechado) if fechado else np.linspace(0, comprimento, n + 1)
    P = cs(ss)
    T = cs(ss, 1)
    T /= np.linalg.norm(T, axis=1)[:, None]
    N = np.column_stack([-T[:, 1], T[:, 0]])          # esquerda
    return ss, P, N


def programar(ref, P, N, fechado, omax, wmin, wmax, w0, dmax_extra=3.0, proibido=None, concreto=None):
    """Deslocamento e largura por estacao, com continuidade (programacao dinamica)."""
    dmax = omax + wmax / 2 + dmax_extra
    d = np.arange(-dmax, dmax + 1e-9, DD)
    X = P[:, None, 0] + d[None, :] * N[:, None, 0]
    Y = P[:, None, 1] + d[None, :] * N[:, None, 1]
    f = ref.rgb(X, Y)
    estrada, nao, branco = indices(f)
    if concreto is not None:
        # Placas de concreto (bege claro): pista so onde a via e de concreto.
        lum, sat = f.mean(-1), f.max(-1) - f.min(-1)
        placa = np.clip((lum - 115) / 12, 0, 1) * np.clip((62 - sat) / 10, 0, 1) * concreto(X, Y)
        estrada = np.maximum(estrada, placa)
        nao = np.where(placa > .5, 0, nao)
    if proibido is not None:
        # Asfalto de outra via (a pista, para o pit lane): conta como obstaculo.
        fora = proibido(X, Y)
        estrada = np.where(fora, 0, estrada)
        nao = np.where(fora, 2.0, nao)
    modo = 'wrap' if fechado else 'nearest'
    estrada = uniform_filter1d(estrada, 3, axis=0, mode=modo)
    nao = uniform_filter1d(nao, 3, axis=0, mode=modo)
    branco = uniform_filter1d(branco, 5, axis=0, mode=modo)
    # Cada metro de asfalto dentro da faixa soma; cada metro de grama, terra ou zebra subtrai.
    valor = estrada - .45 - 1.6 * nao
    cum = np.concatenate([np.zeros((len(P), 1), np.float32), np.cumsum(valor, 1)], 1)
    cnao = np.concatenate([np.zeros((len(P), 1), np.float32), np.cumsum(nao + .6 * branco, 1)], 1)
    os_ = np.arange(-omax, omax + 1e-9, DD)
    ws = np.arange(wmin, wmax + 1e-9, DD)
    O, W = np.meshgrid(os_, ws, indexing='ij')
    idx = lambda v: np.clip(np.round((v + dmax) / DD).astype(int), 0, len(d))
    a, b = idx(O - W / 2 + .4), idx(O + W / 2 - .4)
    fora_e0, fora_e1 = idx(O - W / 2 - 1.6), idx(O - W / 2)
    fora_d0, fora_d1 = idx(O + W / 2), idx(O + W / 2 + 1.6)
    n = len(P)
    S = np.empty((n,) + O.shape, np.float32)
    for i in range(n):
        dentro = (cum[i, b] - cum[i, a]) * DD
        borda = ((cnao[i, fora_e1] - cnao[i, fora_e0]) / np.maximum(fora_e1 - fora_e0, 1)
                 + (cnao[i, fora_d1] - cnao[i, fora_d0]) / np.maximum(fora_d1 - fora_d0, 1)) / 2
        S[i] = dentro + 1.5 * np.minimum(borda, 1) - .08 * np.abs(O) - .05 * np.abs(W - w0)
    # Laco: desenrola com sobra nas duas pontas e fica com o meio.
    extra = min(150, n) if fechado else 0
    ordem = np.r_[np.arange(n - extra, n), np.arange(n), np.arange(0, extra)] if fechado else np.arange(n)
    m = len(ordem)
    back = np.zeros((m,) + O.shape, np.int8)
    acc = S[ordem[0]].copy()
    movs = [(i, j) for i in (-1, 0, 1) for j in (-1, 0, 1)]
    neg = np.float32(-1e9)
    for k in range(1, m):
        best = np.full(O.shape, neg)
        arg = np.zeros(O.shape, np.int8)
        for q, (di, dj) in enumerate(movs):
            sh = np.full(O.shape, neg)
            src = acc[max(0, -di):O.shape[0] - max(0, di), max(0, -dj):O.shape[1] - max(0, dj)]
            sh[max(0, di):O.shape[0] - max(0, -di), max(0, dj):O.shape[1] - max(0, -dj)] = src
            pen = sh - .1 * abs(di) - .25 * abs(dj)
            mask = pen > best
            best[mask] = pen[mask]
            arg[mask] = q
        acc = best + S[ordem[k]]
        back[k] = arg
    i, j = np.unravel_index(np.argmax(acc), acc.shape)
    caminho = np.zeros((m, 2), int)
    for k in range(m - 1, -1, -1):
        caminho[k] = i, j
        di, dj = movs[back[k, i, j]]
        i, j = i - di, j - dj
    caminho = caminho[extra:extra + n]
    return os_[caminho[:, 0]], ws[caminho[:, 1]], S


def refinar(ref, pts, fechado, passadas, w0, proibido=None, concreto=None):
    cs, L = spline(pts, fechado)
    hist = []
    for omax, wmin, wmax in passadas:
        ss, P, N = estacoes(cs, L, fechado)
        regra = proibido
        if fechado:
            # Trechos distantes na volta que correm lado a lado (a reta do miolo do ECPA
            # desce colada a reta principal): cada estacao fica com o asfalto mais perto
            # do proprio trecho, sem se fundir ao vizinho.
            from compat_scipy import cKDTree
            arvore = cKDTree(P)
            def regra(X, Y, P=P, ss=ss, L=L, arvore=arvore, outra=proibido):
                q = np.column_stack([np.ravel(X), np.ravel(Y)])
                _, k = arvore.query(q)
                linha = np.repeat(np.arange(np.shape(X)[0]), np.shape(X)[1])
                ds = np.abs(ss[k] - ss[linha])
                ban = (np.minimum(ds, L - ds) > 60).reshape(np.shape(X))
                return ban | outra(X, Y) if outra is not None else ban
        o, w, _ = programar(ref, P, N, fechado, omax, wmin, wmax, w0, proibido=regra, concreto=concreto)
        # Deslocamento e largura variam devagar: gaussiana de 15 m (o eixo nao serpenteia).
        modo = 'wrap' if fechado else 'nearest'
        o = gaussian_filter1d(o, 7.5, mode=modo)
        w = gaussian_filter1d(w, 7.5, mode=modo)
        novo = P + o[:, None] * N
        hist.append({'desloc_med': float(np.mean(np.abs(o))), 'desloc_max': float(np.max(np.abs(o))),
                     'largura_med': float(np.mean(w)), 'comprimento': float(L)})
        cs, L = spline(novo, fechado)
        larguras = (ss / ss[-1] if not fechado else ss / L, w)
    ss, P, N = estacoes(cs, L, fechado)
    frac = ss / L
    w = np.interp(frac, np.linspace(0, 1, len(larguras[1]), endpoint=not fechado), larguras[1])
    return P, N, w, L, hist


def patio_dos_boxes(ref, Pb, Nb, wb, Lb, lado, hb, faixa=(.5, 6.0), vao=8.0):
    """Trecho do pit lane diante do patio dos boxes: o concreto claro junto a faixa, nos 6 m do
    lado das garagens, no maior trecho continuo. s ao longo do pit lane. Na imagem de Brasilia
    a poeira vermelha tinge o concreto (saturacao 30 a 70, luminancia 155 a 200); a terra fica
    abaixo de 145 e muito saturada, o asfalto abaixo de 80. Em Goiania (imagem da obra, 09/2025) o
    patio ainda e terra: vale o telhado branco dos predios dos boxes, de 8 a 24 m da faixa (`faixa`),
    e o predio novo e o antigo, separados por ~10 m, contam juntos (`vao`)."""
    sb = np.linspace(0, Lb, len(Pb))
    d = np.arange(faixa[0], faixa[1] + .01, .5)
    off = lado * (wb[:, None] / 2 + d[None, :])
    f = ref.rgb(Pb[:, None, 0] + off * Nb[:, None, 0], Pb[:, None, 1] + off * Nb[:, None, 1])
    lum, sat = f.mean(-1), f.max(-1) - f.min(-1)
    concreto = uniform_filter1d(((lum > 150) & (sat < 85)).mean(1), 5) > .45
    idx = np.flatnonzero(concreto)
    blocos = np.split(idx, np.flatnonzero(np.diff(idx) > vao / DS) + 1)
    maior = max(blocos, key=len)
    garagens = [float(sb[maior[0]]), float(sb[maior[-1]])]
    hb.append({'patio_boxes_s': garagens, 'patio_boxes_m': garagens[1] - garagens[0]})
    print(f'  patio dos boxes: de {garagens[0]:.0f} a {garagens[1]:.0f} m do pit lane '
          f'({garagens[1] - garagens[0]:.0f} m); trechos claros {[(round(sb[b[0]]), round(sb[b[-1]])) for b in blocos if len(b) > 5]}')
    return garagens


def faixa_nas_garagens(ref, Pb, Nb, wb, Lb, lado, garagens, largura, hb):
    """Diante das garagens a faixa encosta nas portas: a borda do telhado branco (primeiro pixel
    claro do lado dos boxes, mediana no trecho do predio) fixa a borda da faixa de `largura` m. Em
    Goiania o desenho OSM corre colado a pista, e na imagem da obra (09/2025) o patio entre os dois e
    terra; a ortofoto de 2016 da Prefeitura mostra o pit lane do muro ate as portas. Transicao de
    60 m nas pontas, ate o desenho medido."""
    sb = np.linspace(0, Lb, len(Pb))
    g0, g1 = garagens
    d = np.arange(3, 34, .5)
    q = Pb[:, None, :] + lado * d[None, :, None] * Nb[:, None, :]
    f = ref.rgb(q[..., 0], q[..., 1])
    claro = (f.mean(-1) > 150) & (f.max(-1) - f.min(-1) < 85)
    # O telhado: o primeiro trecho claro continuo de 4 m (faixas pintadas e concreto solto ficam de fora).
    telhado = np.lib.stride_tricks.sliding_window_view(claro, 8, axis=1).all(-1)
    borda = np.array([d[np.argmax(l)] if l.any() else np.nan for l in telhado])
    zona = (sb > g0 + 10) & (sb < g1 - 10)
    R = float(np.nanmedian(borda[zona]))
    desloc = R - .3 - largura / 2                       # centro da faixa: borda a 0,3 m da fachada
    peso = np.clip(np.minimum(sb - (g0 - 60), (g1 + 60) - sb) / 60, 0, 1)
    peso = .5 - .5 * np.cos(np.pi * peso)
    Pn = Pb + (lado * desloc * peso)[:, None] * Nb
    wn = wb * (1 - peso) + largura * peso
    Pn = savgol_filter(Pn, 31, 3, axis=0, mode='interp')
    cs, L = spline(Pn[::2], False)
    _, Pn, Nn = estacoes(cs, L, False)
    wn = np.interp(np.linspace(0, 1, len(Pn)), np.linspace(0, 1, len(wn)), wn)
    hb.append({'fachada_das_garagens_m': R, 'faixa_deslocada_m': desloc, 'largura_diante_das_garagens_m': largura})
    print(f'  garagens: fachada a {R:.1f} m do eixo medido da faixa; faixa de {largura:.1f} m deslocada {desloc:.1f} m ate ela')
    return Pn, Nn, wn, L


def desenhar(ref, pasta, linhas):
    xs = np.concatenate([p[:, 0] for p, _ in linhas])
    ys = np.concatenate([p[:, 1] for p, _ in linhas])
    c, r = ref.px(xs, ys)
    x0, y0, x1, y1 = int(c.min() - 60), int(r.min() - 60), int(c.max() + 60), int(r.max() + 60)
    img = Image.fromarray(ref.img[max(0, y0):y1, max(0, x0):x1].astype(np.uint8))
    dr = ImageDraw.Draw(img)
    for P, cor in linhas:
        c, r = ref.px(P[:, 0], P[:, 1])
        dr.line(list(zip(c - max(0, x0), r - max(0, y0))), fill=cor, width=1)
    img.save(pasta / 'eixo_refinado.jpg', quality=90)


def main():
    nome = sys.argv[1]
    c = CIRCUITOS[nome]
    pasta = pasta_fontes(nome)
    nos, vias = carregar_osm(pasta)
    T = Transformer.from_crs(4326, c['epsg'], always_xy=True)
    ref = {'sentinel2': ReferenciaSentinel2, 'orto_goiania': ReferenciaOrto}.get(c.get('referencia'), Referencia)(pasta, c['epsg'])
    seq = rota(nome, vias)
    pts = np.array([T.transform(*nos[n]) for n in seq])
    L_osm = float(np.sum(np.linalg.norm(np.diff(np.vstack([pts, pts[:1]]), axis=0), axis=1)))
    w0 = c['largura_m'] or 13.0
    cs0, L0 = spline(pts, True)
    _, P0, N0 = estacoes(cs0, L0, True)
    calibrar(ref, P0, N0)
    if c.get('lum_max_asfalto'):
        # Asfalto novo e escuro (Brasilia): patio, escapes e o asfalto velho, mais claros, ficam de fora.
        LIMIAR['lum_max'] = float(c['lum_max_asfalto'])
    print('limiar do asfalto:', dict(LIMIAR))
    boxes = rota_boxes(nome, vias)
    # Lado dos boxes no sentido da corrida: 1 a esquerda (Cascavel, anti-horario, boxes por
    # dentro); -1 a direita (Brasilia, horario, boxes por dentro da reta de largada).
    lado = c.get('lado_boxes', 1)
    concreto = None
    linhas = []
    if boxes:
        from compat_scipy import cKDTree
        bp = np.array([T.transform(*nos[n]) for n in boxes])
    if boxes and c.get('reta_de_concreto'):
        arvore_osm = cKDTree(bp)
        def concreto(X, Y):
            # A reta dos boxes e de concreto: aceito como pista so perto do pit lane.
            dist, _ = arvore_osm.query(np.column_stack([np.ravel(X), np.ravel(Y)]))
            return (dist < 40).reshape(np.shape(X)).astype(np.float32)
    # Faixa de largura procurada: a publicada, quando ha (Chapeco: 12 a 15 m).
    wmin, wmax = c.get('largura_faixa_m', (8, 18))
    fora_do_pit = None
    if boxes and c.get('separar_pit_lane'):
        # O pit lane corre colado a reta de largada: o asfalto mais perto do desenho OSM do pit
        # (4 m de folga, para as junções da entrada e da saida) nao e da pista.
        csp, Lp = spline(bp, False)
        arv_pit = cKDTree(estacoes(csp, Lp, False)[1])
        arv_pista = cKDTree(estacoes(*spline(pts, True), True)[1])
        def fora_do_pit(X, Y):
            q = np.column_stack([np.ravel(X), np.ravel(Y)])
            return (arv_pit.query(q)[0] + 4 < arv_pista.query(q)[0]).reshape(np.shape(X))
    P, N, w, L, hist = refinar(ref, pts, True, [(c.get('desloc_max_m', 6), wmin, wmax), (3, wmin, wmax)], w0,
                               proibido=fora_do_pit, concreto=concreto)
    if boxes:
        # Pit lane: asfalto escuro entre o muro e as garagens, sempre do lado de dentro
        # (o lado dos boxes no sentido da corrida), alem da faixa da pista e do muro; nas
        # pontas (70 m) as vias se juntam e a regra nao vale.
        arvore = cKDTree(P)
        ponta = int(70 / DS)
        def proibido(X, Y):
            q = np.column_stack([np.ravel(X), np.ravel(Y)])
            _, k = arvore.query(q)
            e = lado * np.einsum('ij,ij->i', q - P[k], N[k])
            ban = (e < w[k] / 2 + 1.2).reshape(np.shape(X))
            ban[:ponta] = False
            ban[-ponta:] = False
            return ban
        # Onde o desenho OSM do pit cruza para fora da pista, a linha inicial vai para
        # dentro: meia pista, muro e meia faixa.
        csb, Lb0 = spline(bp, False)
        sb0, Pb0, _ = estacoes(csb, Lb0, False)
        _, k = arvore.query(Pb0)
        e = lado * np.einsum('ij,ij->i', Pb0 - P[k], N[k])
        alvo = w[k] / 2 + 1.2 + 3.5
        meio = (sb0 > 70) & (sb0 < Lb0 - 70) & (e < alvo)
        Pb0[meio] += (lado * (alvo - e)[:, None] * N[k])[meio]
        bp = Pb0[::3]
        Pb, Nb, wb, Lb, hb = refinar(ref, bp, False, [(8, 5, 12), (4, 5, 12), (2, 5, 12)], 7.0, proibido=proibido)
    if boxes and not c.get('boxes_sob_cobertura'):
        # Garagens ao longo do patio dos boxes (Brasilia: o predio antigo foi demolido na reforma e
        # os 40 boxes novos ficam para 2026; a imagem mostra o patio de concreto claro junto a faixa).
        # Em Goiania a ortofoto (2016) e anterior ao predio novo dos boxes: as garagens saem da imagem Esri
        # da obra (09/2025), onde os dois predios ja tem telhado.
        ref_g = Referencia(pasta, c['epsg']) if c.get('garagens_na_esri') else ref
        garagens = patio_dos_boxes(ref_g, Pb, Nb, wb, Lb, lado, hb, **c.get('patio_boxes', {}))
        if c.get('garagens_pit_s'):
            # Predio dos boxes medido a mao na imagem (Velocitta: o patio mais claro e o da tenda do paddock, ao lado).
            garagens = [float(v) for v in c['garagens_pit_s']]
            hb.append({'garagens_medidas_na_imagem': garagens})
            print(f'  garagens no predio medido: de {garagens[0]:.0f} a {garagens[1]:.0f} m do pit lane')
    if boxes and c.get('faixa_nas_garagens'):
        Pb, Nb, wb, Lb = faixa_nas_garagens(ref, Pb, Nb, wb, Lb, lado, garagens, c['faixa_nas_garagens'], hb)
    if boxes and c.get('boxes_sob_cobertura'):
        # Ao lado do predio o pit lane fica sob a borda da cobertura, invisivel do alto:
        # nos transectos medidos, pista de concreto, muro (1,5 m) e faixa de 6 m junto as
        # garagens. Vale onde a pista e reta e o pit corre a menos de 30 m dela.
        _, k = arvore.query(Pb)
        e = np.einsum('ij,ij->i', Pb - P[k], N[k])
        Tt = np.gradient(P, axis=0)
        rumo = np.unwrap(np.arctan2(Tt[:, 1], Tt[:, 0]))
        viz = int(50 / DS)
        giro = np.abs(np.array([rumo[(j + viz) % len(P)] - rumo[(j - viz) % len(P)] for j in k]))
        giro = np.minimum(giro, np.abs(giro - 2 * np.pi))
        sb = np.linspace(0, Lb, len(Pb))
        zona = (giro < np.radians(8)) & (e > 0) & (e < 30) & (sb > 90) & (sb < Lb - 90)
        peso = np.convolve(zona.astype(float), np.ones(11) / 11, mode='same')
        # Deslocamento constante (a largura detectada oscila no concreto): meia pista,
        # plataforma do muro (2,5 m) e meia faixa (3 m), como nos transectos.
        meia = float(np.median(w[k[zona]])) / 2 if zona.any() else 6.5
        # A borda do telhado das garagens fixa o lado de dentro da faixa: centro 5 m antes
        # dela (faixa de 9 m, de rolagem e de trabalho), medida no trecho do predio.
        base = meia + 5.5
        dd = np.arange(0, 30, .5)
        q = P[k][:, None, :] + (base + dd)[None, :, None] * N[k][:, None, :]
        lum = ref.rgb(q[..., 0], q[..., 1]).mean(-1)
        borda = np.array([dd[np.argmax(l > 190)] if (l > 190).any() else np.nan for l in lum])
        R = float(np.nanmedian(borda[zona])) if np.isfinite(borda[zona]).any() else 5.0
        alvo = P[k] + (base + R - 5.0) * N[k]
        Pb = Pb * (1 - peso[:, None]) + alvo * peso[:, None]
        wb = wb * (1 - peso) + 9.0 * peso
        Pb = savgol_filter(Pb, 31, 3, axis=0, mode="interp")
        csb, Lb = spline(Pb[::2], False)
        sbn, Pb, Nb = estacoes(csb, Lb, False)
        wb = np.interp(np.linspace(0, 1, len(Pb)), np.linspace(0, 1, len(wb)), wb)
        hb.append({'trecho_predio_m': float(zona.sum() * DS), 'telhado_alem_do_muro_m': R})
        # Predio das garagens: cobertura clara (telhado) do lado de dentro do pit lane.
        d = np.arange(0, 10, .5)
        off = wb[:, None] / 2 + d[None, :]
        f = ref.rgb(Pb[:, None, 0] + off * Nb[:, None, 0], Pb[:, None, 1] + off * Nb[:, None, 1])
        telhado = uniform_filter1d(((f.mean(-1) > 190) & (f.max(-1) - f.min(-1) < 45)).mean(1), 5) > .35
        idx = np.flatnonzero(telhado)
        blocos = np.split(idx, np.flatnonzero(np.diff(idx) > 4) + 1)
        maior = max(blocos, key=len)
        sbf = np.linspace(0, Lb, len(Pb))
        garagens = [float(sbf[maior[0]]), float(sbf[maior[-1]])]
        hb.append({'garagens_s': garagens})
    saida = {'circuito': nome, 'epsg': c['epsg'], 'passo_m': DS, 'comprimento_osm_m': L_osm,
             'comprimento_refinado_m': L, 'passadas': hist,
             'eixo': np.round(P, 3).tolist(), 'largura_m': np.round(w, 2).tolist(),
             'nos_osm': [int(n) for n in seq]}
    linhas += [(P, (255, 40, 40)), (P + (w / 2)[:, None] * N, (255, 255, 0)), (P - (w / 2)[:, None] * N, (255, 255, 0))]
    if boxes:
        saida['boxes'] = {'eixo': np.round(Pb, 3).tolist(), 'largura_m': np.round(wb, 2).tolist(),
                          'comprimento_m': Lb, 'passadas': hb, 'garagens_s': garagens}
        linhas += [(Pb, (0, 255, 255)), (Pb + (wb / 2)[:, None] * Nb, (0, 160, 255)), (Pb - (wb / 2)[:, None] * Nb, (0, 160, 255))]
    if c.get('trechos_fechados'):
        saida['fechados'] = refinar_fechados(nome, ref, vias, nos, T)
        for f in saida['fechados']:
            Pf = np.array(f['eixo'])
            linhas.append((Pf, (255, 120, 0)))
    (pasta / 'eixo_refinado.json').write_text(json.dumps(saida), encoding='utf-8')
    desenhar(ref, pasta, linhas)
    print(f'{nome}: OSM {L_osm:.1f} m -> refinado {L:.1f} m (oficial {c["extensao_m"]} m); '
          f'largura media {np.mean(w):.2f} m (min {np.min(w):.2f}, max {np.max(w):.2f})')
    for h in hist:
        print('  passada', h)
    if boxes:
        print(f'  boxes: {Lb:.1f} m, largura media {np.mean(wb):.2f}; predio das garagens de {garagens[0]:.0f} a {garagens[1]:.0f} m')


if __name__ == '__main__':
    main()
