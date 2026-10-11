"""Autodromo da Chapada dos Sonhos: circuito imaginario no topo do paredao da Chapada dos Guimaraes.

    python baixar_fontes.py chapada        (relevo, cobertura, Sentinel-2, OSM da caixa do circuito)
    python gerar_chapada.py [--longe]      (--longe baixa de novo o Sentinel-2 largo do horizonte)

Pedido #5 da Central de Projetos: nao existe autodromo na Chapada. O relevo, os paredoes, a mata, a cor do
chao e o vale la embaixo sao os reais (ANADEM, Copernicus GLO-30, ESA WorldCover, Sentinel-2); o tracado,
os boxes e a beirada sem guard-rail sao desenho de jogo. A volta corre no sentido horario sobre um bloco de
planalto a ~820 m, 2 a 3 km ao sul da cidade: a reta principal por dentro, a curva 1 de frente para o
abismo, o paredao leste, o bico, a borda sul e o S do Mirante, com o precipicio sempre a esquerda (o lado do
piloto) a poucos metros do asfalto.

O formato e o de gerar_pista.py (mesmas colunas, bloco `pit`, grade `terrain`, `scenery`), com:
- `scenery.cliff`: a linha da beirada (topo do paredao) com a altura do topo e a do paredao, o planalto a
  direita de quem anda nela. O jogo (cliff-edge.js) a usa para a fisica (passou dela, cai) e para o paredao.
- `scenery.far`: o relevo e a cor do vale ate 22 km (dois aneis: medio e longe), em arquivos a parte.
- A grade do terreno do lado do abismo ja vem escavada: paredao vertical na beirada (no jogo, uma malha
  propria), encosta de ~35 graus ao pe dele e o relevo real do vale mais longe.
"""
import json
import math
import sys

import numpy as np
from PIL import Image

import geo_io
import gerar_pista as gp
from compat_scipy import cKDTree, gaussian_filter1d
from config import ASSETS, CIRCUITOS, DADOS, pasta_fontes
from projecao import Transformer

NOME = 'chapada'
# Origem local (UTM 21S, SIRGAS 2000) do desenho: x para leste, y para norte, em metros.
ORIGEM = np.array([630520.0, 8288300.0])
PASSO = 5.0          # grade do terreno (m): maior que os 4 m dos outros (o vale entra nela)
DS = 2.0
SEMENTE = 99

# --- Tracado: poligonal com o raio de cada curva (concordancia de estrada), sentido horario. O nome
# entra nos trechos da volta. As retas e raios seguem o topo do paredao medido no relevo (30 m).
VERTICES = [
    ((-655, 300), 45, 'Curva do Cerrado'),
    ((1440, 290), 42, 'Curva 1 · beira do abismo'),
    ((1410, 140), 220, 'Paredão leste'),
    ((1325, 10), 160, 'Paredão leste'),
    ((1350, -150), 150, 'Paredão leste'),
    ((1292, -300), 300, ''),
    ((1228, -552), 30, 'Bico'),
    ((1000, -410), 500, 'Borda sul'),
    ((800, -322), 700, ''),
    ((480, -285), 900, ''),
    ((212, -322), 55, 'S do Mirante'),
    ((52, -108), 65, 'S do Mirante'),
    ((-280, -20), 450, 'Borda oeste'),
    ((-520, 100), 300, ''),
    ((-660, 150), 40, 'Curva da Volta'),
]
# Nomes dos trechos (s do inicio da curva depois da linha, ajustados ao tracado gerado) e das retas.
LINHA_X = 640.0                 # a linha de chegada cruza a reta principal aqui (x local)
LARGURA = 12.0                  # estrada de serra
LARGURA_RETA = 14.0             # reta principal
# Faixa de terra entre a borda do asfalto e o precipicio (m), por vertice do trecho da beirada: a beirada
# comeca na curva 1 e acaba na Curva da Volta, onde o tracado entra no planalto.
FOLGA = {1: 6.0, 2: 3.5, 3: 3.0, 4: 3.5, 5: 3.5, 6: 5.0, 7: 3.0, 8: 2.6, 9: 2.8, 10: 4.0, 11: 2.4, 12: 3.2, 13: 3.6}
RAMPA_MAX = .08                 # rampa maxima da pista (terraplanagem de jogo; Interlagos chega a ~10%)
# Paredao: altura do arenito vertical (m) e encosta abaixo dele.
PAREDAO_M = (95.0, 175.0)
ENCOSTA = .75                   # declive da encosta ao pe do paredao (m por m)
# Arquibancadas do lado de dentro da reta (a direita), de frente para os boxes, com o vale ao fundo.
ARQUIBANCADAS = [{'antes_da_chegada': 130, 'blocos': 7, 'lado': -1, 'recuo': 14}]
PIT = {'lado': 1, 'inicio': .50, 'antes_do_fim': 230, 'entrada': 70, 'saida': 70, 'largura': 7.6, 'garagens': (-170, 170),
       'fonte': 'Pit lane imaginário à esquerda da reta principal, diante dos boxes, no planalto.'}
# Horizonte: aneis do relevo do vale alem da grade (lado do quadrado em km, passo em m, lado da imagem em px).
# O medio leva o Sentinel-2 na resolucao cheia (10 m, imagem de 6,8 m/px), o longe reduzido a 20 m.
ANEIS = {'medio': (14.0, 40.0, 2048), 'longe': (44.0, 160.0, 1024)}


def construir(vertices, ds=DS, suave=6.0):
    """Eixo fechado: retas entre os vertices e arcos de raio dado em cada um (tangentes as retas), com
    o rumo suavizado (transicao de curvatura de ~10 m) e o laco fechado de novo."""
    pts = [np.array(v[0], float) for v in vertices]
    raios = [v[1] for v in vertices]
    n = len(pts)
    arcos, tang = [], []
    for i in range(n):
        a, b, c = pts[i - 1], pts[i], pts[(i + 1) % n]
        u = (b - a) / np.linalg.norm(b - a)
        w = (c - b) / np.linalg.norm(c - b)
        defl = math.atan2(u[0] * w[1] - u[1] * w[0], u @ w)
        t = raios[i] * math.tan(abs(defl) / 2)
        tang.append(t)
        arcos.append((b - u * t, b + w * t, u, defl, raios[i]))
    for i in range(n):
        vao = np.linalg.norm(pts[(i + 1) % n] - pts[i])
        if tang[i] + tang[(i + 1) % n] > vao:
            raise SystemExit(f'tangentes nao cabem entre os vertices {i} e {(i + 1) % n}')
    out, marcas = [], []
    for i in range(n):
        p0, p1, u, defl, r = arcos[i]
        h0 = math.atan2(u[1], u[0])
        sg = 1 if defl > 0 else -1
        centro = p0 + sg * r * np.array([-u[1], u[0]])
        m = max(2, int(abs(defl) * r / ds))
        marcas.append((len(out), i, m))
        for k in range(m):
            h = h0 + defl * k / m
            out.append(centro - sg * r * np.array([-math.sin(h), math.cos(h)]))
        q0, q1 = arcos[i][1], arcos[(i + 1) % n][0]
        m = max(1, int(np.linalg.norm(q1 - q0) / ds))
        for k in range(m):
            out.append(q0 + (q1 - q0) * k / m)
    P = np.array(out)
    seg = np.linalg.norm(np.diff(np.vstack([P, P[:1]]), axis=0), axis=1)
    s = np.r_[0, np.cumsum(seg)]
    N = int(round(s[-1] / ds))
    su = np.linspace(0, s[-1], N, endpoint=False)
    s_arcos = [(s[k], i, s[k + m] - s[k]) for k, i, m in marcas]
    P = np.column_stack([np.interp(su, s, np.r_[P[:, 0], P[0, 0]]), np.interp(su, s, np.r_[P[:, 1], P[0, 1]])])
    d = np.roll(P, -1, 0) - P
    th = np.unwrap(np.arctan2(d[:, 1], d[:, 0]))
    sl = np.linalg.norm(d, axis=1)
    volta = round((th[-1] - th[0] + math.atan2(d[0, 1], d[0, 0]) - math.atan2(d[-1, 1], d[-1, 0])) / (2 * math.pi))
    tend = 2 * math.pi * volta * np.arange(N) / N
    thn = gaussian_filter1d(th - tend, suave / ds, mode='wrap') + tend
    Q = np.zeros_like(P)
    Q[0] = P[0]
    for i in range(1, N):
        Q[i] = Q[i - 1] + sl[i - 1] * np.array([math.cos(thn[i - 1]), math.sin(thn[i - 1])])
    fim = Q[-1] + sl[-1] * np.array([math.cos(thn[-1]), math.sin(thn[-1])])
    Q -= np.outer(np.arange(N) / N, fim - Q[0])
    Q += gaussian_filter1d(P - Q, 40, axis=0, mode='wrap')
    # Indice (na amostragem final) onde comeca o arco de cada vertice, e quantas estacoes ele tem.
    inicio = {i: int(round(sv / s[-1] * N)) % N for sv, i, _ in s_arcos}
    arco = {i: int(round(la / s[-1] * N)) for _, i, la in s_arcos}
    return Q, inicio, arco


def ruido1d(n, comprimento, semente, periodico=True):
    """Ruido suave (desvio 1) com comprimento de onda ~comprimento estacoes."""
    r = np.random.default_rng(semente).standard_normal(n)
    r = gaussian_filter1d(r, comprimento / 2.5, mode='wrap' if periodico else 'nearest')
    return r / (r.std() + 1e-9)


class Dem:
    """Um GeoTIFF de relevo amostrado em coordenadas locais (bilinear ou cubico, pelo gp.Raster)."""

    def __init__(self, caminho, epsg):
        self.r = gp.Raster(caminho, epsg)

    def __call__(self, x, y, ordem=1):
        return self.r(np.asarray(x, float) + ORIGEM[0], np.asarray(y, float) + ORIGEM[1], ordem=ordem)


# Topo do paredao alem do trecho da pista, a mao sobre o mapa do relevo (x, y locais), na ordem da linha da
# beirada (o planalto a direita): a nordeste, a borda do bloco leste (de frente para o sul) ate o fundo da
# enseada e o paredao leste descendo ate a curva 1; a oeste, a borda sul depois da Curva da Volta. Cada ponto
# e refinado no relevo (refinar_topo); as pontas passam da grade do terreno.
TOPO_NORDESTE = [(2560, 60), (2450, 110), (2350, 160), (2250, 200), (2150, 240), (2000, 290), (1900, 340), (1800, 365), (1700, 400), (1600, 415),
                 (1530, 420), (1480, 405), (1440, 385), (1415, 360), (1408, 330)]
TOPO_OESTE = [(-700, 128), (-800, 148), (-900, 112), (-1000, 195), (-1100, 180), (-1200, 245), (-1300, 315)]


def refinar_topo(dem, pts, busca=(-40.0, 60.0)):
    """Leva cada ponto ao topo do paredao no relevo, ao longo da normal da linha: o primeiro ponto, vindo
    do planalto, em que o chao cai mais de 50% em 10 m acima de 650 m. Sem degrau achado, fica o ponto."""
    P = np.array(pts, float)
    T, _ = gp.quadro(P, fechado=False)
    abismo = np.column_stack([-T[:, 1], T[:, 0]])          # a esquerda de quem anda na linha
    u = np.arange(busca[0], busca[1], 2.0)
    out = P.copy()
    for i in range(len(P)):
        q = P[i] + abismo[i] * u[:, None]
        zq = dem(q[:, 0], q[:, 1])
        zq10 = dem(q[:, 0] + abismo[i, 0] * 10, q[:, 1] + abismo[i, 1] * 10)
        ok = np.flatnonzero(((zq - zq10) / 10 > .5) & (zq > 650))
        if len(ok):
            out[i] = q[ok[0]]
    out[:, 0] = gaussian_filter1d(out[:, 0], 1, mode='nearest')
    out[:, 1] = gaussian_filter1d(out[:, 1], 1, mode='nearest')
    return out


def reamostrar(P, ds=DS):
    seg = np.linalg.norm(np.diff(P[:, :2], axis=0), axis=1)
    s = np.r_[0, np.cumsum(seg)]
    su = np.arange(0, s[-1] + 1e-6, ds)
    return np.column_stack([np.interp(su, s, P[:, k]) for k in range(P.shape[1])])


def pit_sintetico(cfg, reta, xy, z, E, T, bank, largura, s, L, superficie):
    """gerar_pista.pit_sintetico com a faixa interpolada entre as estacoes da pista: la ela toma a estacao
    anterior a cada ponto e, com estacoes de 1,9994 m, dois pontos seguidos caiam na mesma (segmento nulo)."""
    lado = cfg['lado']
    r0, r1 = reta
    a = r0 + cfg['inicio'] * (r1 - r0)
    b = r1 - cfg.get('antes_do_fim', 4)
    print(f'reta principal: s de {r0:.0f} a {r1:.0f} m; faixa dos boxes de {a:.0f} a {b:.0f}')
    us = np.arange(a, b + 1e-6, DS)
    sm = us % L
    sx = np.r_[s, L]
    em = lambda col: np.interp(sm, sx, np.r_[col, col[0]])
    centro = np.column_stack([em(xy[:, 0]), em(xy[:, 1])])
    nrm = np.column_stack([em(E[:, 0]), em(E[:, 1])])
    nrm /= np.linalg.norm(nrm, axis=1)[:, None]
    larg = em(largura)
    off_final = larg / 2 + 4.6 + cfg['largura'] / 2
    t_ = us - a
    tot = b - a
    fe, fs = cfg['entrada'], cfg['saida']
    assert tot > fe + fs + 60, 'reta curta demais para a faixa dos boxes'
    blend = np.where(t_ < fe, 0.5 - 0.5 * np.cos(np.pi * np.clip(t_ / fe, 0, 1)),
                     np.where(t_ > tot - fs, 0.5 + 0.5 * np.cos(np.pi * np.clip((t_ - (tot - fs)) / fs, 0, 1)), 1.0))
    borda_ = larg / 2 - cfg['largura'] / 2 + .3
    off = lado * (borda_ + (off_final - borda_) * blend)
    pxy = centro + nrm * off[:, None]
    pw = np.full(len(us), cfg['largura'])
    ps = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pxy, axis=0), axis=1))]
    k, main_s, lat, z_main = superficie(pxy)
    pz = z_main
    pbank = bank[k]
    main_s = sm.copy()
    gap = np.maximum(0, np.abs(lat) - pw / 2 - largura[k] / 2)
    lo, hi = -pw / 2, pw / 2
    g0, g1 = (float(np.interp(v, us, ps)) for v in cfg['garagens'])
    abertura = float(ps[np.argmax(gap > .3)])
    muro_idx = np.flatnonzero(gap > 1.3)
    muro_trechos = [(ps[muro_idx[0]], ps[muro_idx[-1]])] if len(muro_idx) else []
    print(f'pit {ps[-1]:.0f} m: entra em s={main_s[0]:.0f}, volta em s={main_s[-1]:.0f}; garagens {g0:.0f}-{g1:.0f} m')
    return gp.completar_pit(pxy, lo, hi, pz, pbank, main_s, gap, (g0, g1), superficie, cfg['fonte'], abertura,
                            muro_trechos[0][0] if muro_trechos else abertura,
                            muro_trechos[0][1] if muro_trechos else ps[-1] - 40, L, muro_trechos)


def corridas(linha):
    """Trechos [inicio, fim) de uma linha booleana, achatados numa lista."""
    v = np.r_[0, linha.astype(np.int8), 0]
    borda = np.flatnonzero(np.diff(v))
    return borda.tolist()


def main():
    c = CIRCUITOS[NOME]
    pasta = pasta_fontes(NOME)
    epsg = c['epsg']
    anadem = Dem(pasta / 'anadem.tif', epsg)
    cop = Dem(pasta / 'copernicus_dsm.tif', epsg)

    # --- Eixo e linha de chegada.
    P, arco_ini, arco_n = construir(VERTICES)
    n = len(P)
    T, E = gp.quadro(P)
    i0 = int(np.argmin(np.abs(P[:, 0] - LINHA_X) + 1e3 * (P[:, 1] < 200)))
    P = np.roll(P, -i0, 0)
    arco_ini = {k: (v - i0) % n for k, v in arco_ini.items()}
    T, E = gp.quadro(P)
    seg = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
    s = np.r_[0, np.cumsum(seg[:-1])]
    L = float(seg.sum())
    kappa = gp.curvatura(P)
    raio = 1 / np.maximum(np.abs(kappa), 1e-6)
    # Reta principal (s relativo a linha): do fim do arco da Curva do Cerrado ao inicio da curva 1.
    fim_cerrado = arco_ini[0] + int(round(abs(math.radians(90)) * VERTICES[0][1] / DS))
    reta_principal = ((fim_cerrado - n) * DS, arco_ini[1] * DS)
    print(f'volta {L:.0f} m, {n} estacoes; reta principal de {reta_principal[0]:.0f} a {reta_principal[1]:.0f} m; '
          f'raio minimo {raio.min():.1f} m')

    # --- Larguras: 14 m na reta principal (transicao de 40 m), 12 m no resto.
    sr = np.where(s > L / 2, s - L, s)
    na_reta = np.clip(np.minimum(sr - reta_principal[0], reta_principal[1] - sr) / 40 + .5, 0, 1)
    largura = LARGURA + (LARGURA_RETA - LARGURA) * na_reta

    # --- Trecho da beirada (abismo a esquerda): da curva 1 a Curva da Volta, folga por vertice.
    # A beirada comeca no meio da curva 1 (35% do arco): o fim da reta aponta para o abismo, logo adiante.
    a_beira, b_beira = arco_ini[1] + int(.35 * arco_n[1]), arco_ini[14]
    beira = np.zeros(n, bool)
    idx_beira = np.arange(a_beira, b_beira + 1) % n
    beira[idx_beira] = True
    folga = np.full(n, np.nan)
    marcos = sorted((arco_ini[k], FOLGA[k]) for k in FOLGA)
    for (ia, fa), (ib, fb) in zip(marcos, marcos[1:] + [(marcos[-1][0] + 1, marcos[-1][1])]):
        for j in range(ia, max(ia + 1, ib)):
            folga[j % n] = fa
    folga[~beira] = np.nan
    base = np.where(beira, folga, 0.0)
    base = gaussian_filter1d(np.nan_to_num(base, nan=0.0), 12, mode='wrap')
    # Variacao natural da beirada (+-0,6 m, ondas de ~120 m), nunca a menos de 2 m do asfalto.
    folga = np.where(beira, np.maximum(2.0, base + .6 * ruido1d(n, 60, SEMENTE)), np.nan)

    # --- Perfil: o planalto atras da beirada (o relevo de 30 m borra o topo do paredao e daria a pista
    # dezenas de metros abaixo dele), suavizado e com rampa maxima de 6%.
    z_eixo = anadem(P[:, 0], P[:, 1], ordem=3)
    atras = np.max([anadem(P[:, 0] - E[:, 0] * d, P[:, 1] - E[:, 1] * d, ordem=1) for d in (30, 50, 70, 90)], axis=0)
    # Tambem a chegada da curva 1 (300 m antes do arco): ali o eixo ja passa sobre a enseada do paredao.
    perto = beira.copy()
    perto[np.arange(arco_ini[1] - 150, a_beira) % n] = True
    z_ref = np.where(perto, np.maximum(z_eixo, atras - 4), z_eixo)
    sigma = np.where(na_reta > .5, 60.0, 35.0) / DS
    z_abs = np.zeros(n)
    for sg in np.unique(sigma):
        z_abs = np.where(sigma == sg, gaussian_filter1d(z_ref, sg, mode='wrap'), z_abs)
    z_abs = gaussian_filter1d(z_abs, 10, mode='wrap')
    # Rampa maxima: a media do maior perfil abaixo do de referencia com rampa limitada (so corte) e do menor
    # acima dele (so aterro), que tambem respeita o limite. Duas voltas propagam o limite pelo laco.
    limite = RAMPA_MAX * .95 * DS
    corte, aterro = z_abs.copy(), z_abs.copy()
    for _ in range(2):
        for i in list(range(n)) + list(range(n - 1, -1, -1)):
            for j in (i - 1, (i + 1) % n):
                corte[i] = min(corte[i], corte[j] + limite)
                aterro[i] = max(aterro[i], aterro[j] - limite)
    z_abs = (corte + aterro) / 2
    z_abs = gaussian_filter1d(z_abs, 4, mode='wrap')
    base_alt = math.floor((float(np.percentile(anadem(*np.meshgrid(np.arange(-1500, 2200, 30.0), np.arange(-1300, 900, 30.0))), 1)) - 5) / 10) * 10
    z = z_abs - base_alt
    grade = (np.roll(z, -1) - np.roll(z, 1)) / (seg + np.roll(seg, 1))
    print(f'perfil {z_abs.min():.0f}-{z_abs.max():.0f} m ({np.ptp(z_abs):.0f} m), rampa {100 * grade.min():.1f}% a '
          f'{100 * grade.max():.1f}%; base {base_alt} m')

    # --- Curvas, trechos, caimento e zebras (como gerar_pista.py).
    cv = gp.curvas(kappa, s, L)
    nomes_v = {}
    for k, (xy_v, r_v, nome_v) in enumerate(VERTICES):
        if nome_v:
            nomes_v[arco_ini[k]] = nome_v
    trechos = [[0.0, 'Reta principal']]
    nomes_cv = []
    for cc in cv:
        perto = min(nomes_v, key=lambda q: min(abs(q - cc['ini']), n - abs(q - cc['ini'])))
        dist = min(abs(perto - cc['ini']), n - abs(perto - cc['ini'])) * DS
        nomes_cv.append(nomes_v[perto] if dist < 150 else 'Curva')
        trechos.append([round(float(s[cc['ini']]), 1), nomes_cv[-1]])
    trechos.append([round(float(s[(arco_ini[6] + 60) % n]), 1), 'Borda sul · beira do abismo'])
    trechos.append([round(float(s[(arco_ini[0] + 70) % n]), 1), 'Reta principal'])
    trechos.sort()
    print(f'{len(cv)} curvas:')
    for k, cc in enumerate(cv):
        print(f'  s={s[cc["ini"]]:7.1f}  {"esq" if cc["lado"] > 0 else "dir"}  raio min {cc["raio_min"]:6.1f} m  '
              f'giro {cc["giro_graus"]:5.1f}  {nomes_cv[k]}')
    intens = np.clip((400 - raio) / 300, 0, 1)
    bank = -np.sign(kappa) * (.01 + .015 * intens)
    bank = gaussian_filter1d(bank, 10 / DS, mode='wrap')
    zebra_d, zebra_e = np.zeros(n), np.zeros(n)
    for cc in cv:
        if cc['raio_min'] > 160:
            continue
        idx = np.arange(cc['ini'], cc['fim'] + 1) if cc['fim'] >= cc['ini'] else np.r_[cc['ini']:n, 0:cc['fim'] + 1]
        pico = abs(kappa[cc['apice']])
        dentro = [i for i in idx if abs(kappa[i]) > .7 * pico]
        a = int(np.where(idx == cc['apice'])[0][0])
        saida = list(idx[a:]) + [(idx[-1] + q) % n for q in range(1, 6)]
        (zebra_e if cc['lado'] > 0 else zebra_d)[dentro] = 1
        (zebra_d if cc['lado'] > 0 else zebra_e)[[i for i in saida if abs(kappa[i]) < .8 * pico]] = 1

    # --- Pit lane: faixa de servico a esquerda da reta principal.
    kd = cKDTree(P)

    def superficie(q):
        k = kd.query(q)[1]
        dd = q - P[k]
        lat = np.sum(dd * E[k], axis=1)
        along = np.sum(dd * T[k], axis=1)
        return k, (s[k] + along) % L, lat, z[k] + grade[k] * along + bank[k] * lat

    pit = pit_sintetico(dict(PIT), reta_principal, P, z, E, T, bank, largura, s, L, superficie)

    # --- Linha da beirada (topo do paredao): junto da pista, a borda esquerda do asfalto mais a folga, da
    # saida da curva 1 a entrada da Curva da Volta; alem dela, o topo medido no relevo, emendado.
    meio = largura / 2 + np.nan_to_num(folga)
    desenhada = P[idx_beira] + E[idx_beira] * meio[idx_beira][:, None]
    zl = z + bank * (largura / 2)
    z_desenho = zl[idx_beira] + base_alt - .04 * np.nan_to_num(folga)[idx_beira]
    d0 = np.column_stack([desenhada, z_desenho])
    # O planalto atras do topo medido: o relevo de 30 m o da baixo; vale o mais alto logo atras.
    def com_topo(A):
        Tq, _ = gp.quadro(A, fechado=False)
        dentro = np.column_stack([Tq[:, 1], -Tq[:, 0]])
        zt_ = np.max([anadem(A[:, 0] + dentro[:, 0] * d, A[:, 1] + dentro[:, 1] * d) for d in (25, 45, 65)], axis=0) - 3
        return np.column_stack([A, gaussian_filter1d(zt_, 1.5, mode='nearest')])
    nordeste = com_topo(refinar_topo(anadem, TOPO_NORDESTE))
    oeste = com_topo(refinar_topo(anadem, TOPO_OESTE))
    # Emendas em Hermite entre a ultima medida e a primeira desenhada (e vice-versa), tangentes das pontas.
    def emenda(a, b, ta, tb, m=20):
        u = np.linspace(0, 1, m + 2)[1:-1, None]
        h00, h10, h01, h11 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
        return h00 * a + h10 * ta + h01 * b + h11 * tb
    vao1 = np.linalg.norm(d0[0, :2] - nordeste[-1, :2])
    t1a = (nordeste[-1] - nordeste[-2]) / np.linalg.norm(nordeste[-1, :2] - nordeste[-2, :2]) * vao1
    t1b = (d0[5] - d0[0]) / np.linalg.norm(d0[5, :2] - d0[0, :2]) * vao1
    vao2 = np.linalg.norm(oeste[0, :2] - d0[-1, :2])
    t2a = (d0[-1] - d0[-6]) / np.linalg.norm(d0[-1, :2] - d0[-6, :2]) * vao2
    t2b = (oeste[1] - oeste[0]) / np.linalg.norm(oeste[1, :2] - oeste[0, :2]) * vao2
    for A in (t1a, t1b, t2a, t2b):
        A[2] = 0
    borda = reamostrar(np.vstack([nordeste, emenda(nordeste[-1], d0[0], t1a, t1b), d0,
                                  emenda(d0[-1], oeste[0], t2a, t2b), oeste]))
    # A beirada nunca chega a menos de 2 m do asfalto (as emendas podem cortar caminho perto da pista).
    k_, _, lat_, _ = superficie(borda[:, :2])
    perto = np.abs(lat_) < largura[k_] / 2 + 2.0
    if perto.any():
        off = np.sign(lat_[perto]) * (largura[k_[perto]] / 2 + 2.0)
        borda[perto, :2] = P[k_[perto]] + E[k_[perto]] * off[:, None]
        print(f'beirada afastada da pista em {int(perto.sum())} pontos das emendas')
    borda[:, 2] = gaussian_filter1d(borda[:, 2], 3, mode='nearest')
    nb = len(borda)
    altura_paredao = PAREDAO_M[0] + (PAREDAO_M[1] - PAREDAO_M[0]) * (.5 + .5 * np.tanh(ruido1d(nb, 110, SEMENTE + 1, False)))
    tb_, nb_ = gp.quadro(borda[:, :2], fechado=False)
    print(f'beirada: {nb * DS:.0f} m de paredao ({len(d0) * DS:.0f} m junto da pista), folga '
          f'{np.nanmin(folga):.1f}-{np.nanmax(folga):.1f} m, paredao {altura_paredao.min():.0f}-{altura_paredao.max():.0f} m')

    # --- Grade do terreno: margens maiores do lado do abismo (o pe do paredao e a encosta entram nela).
    todos = np.vstack([P, np.array(pit['xy'])])
    x0 = math.floor((todos[:, 0].min() - 320) / PASSO) * PASSO
    # A leste vai mais longe (900 m): da curva 1 se olha o outro lado da enseada, que precisa de arvores de verdade.
    x1 = todos[:, 0].max() + 900
    y0 = math.floor((todos[:, 1].min() - 480) / PASSO) * PASSO
    y1 = todos[:, 1].max() + 280
    nx = int((x1 - x0) / PASSO) + 1
    ny = int((y1 - y0) / PASSO) + 1
    gx = x0 + np.arange(nx) * PASSO
    gy = y0 + np.arange(ny) * PASSO
    XX, YY = np.meshgrid(gx, gy)
    q = np.column_stack([XX.ravel(), YY.ravel()])
    dem = anadem(q[:, 0], q[:, 1], ordem=3)
    # Distancia com sinal a beirada: positiva do lado do abismo (a esquerda de quem anda na linha).
    kb = cKDTree(borda[:, :2])
    db, ib = kb.query(q)
    lado_ab = np.sign(np.sum((q - borda[ib, :2]) * nb_[ib], axis=1))
    # Pontas da linha: alem delas nao ha abismo desenhado (o relevo segue).
    pontas = (ib == 0) | (ib == nb - 1)
    D = np.where(pontas, -np.inf, lado_ab * db)
    ztopo = borda[ib, 2]
    # Planalto: o relevo, colado ao plano da pista perto dela (como gerar_pista.py).
    k, _, lat, road = superficie(q)
    fora = np.abs(lat) - largura[k] / 2
    peso = np.clip((34 - fora) / 28, 0, 1)
    planalto = dem * (1 - peso) + (road + base_alt - .06) * peso
    # Curva 1: uma plataforma no nivel da pista em volta dela (terraplanagem de escape), para que do fim da reta se
    # veja o vazio adiante e nao um barranco: o planalto ate 120 m do meio do arco, sumindo ate 220 m.
    c1 = P[(arco_ini[1] + arco_n[1] // 2) % n]
    plat = np.clip((220 - np.hypot(q[:, 0] - c1[0], q[:, 1] - c1[1])) / 100, 0, 1)
    planalto = planalto * (1 - plat) + (road + base_alt - .06) * plat
    # Perto da beirada o planalto sobe ao topo dela (o relevo de 30 m o deixa baixo ali).
    junto = np.clip((D + 40) / 34, 0, 1) * (D <= 0)
    planalto = np.where(junto > 0, np.maximum(planalto, planalto * (1 - junto) + ztopo * junto), planalto)
    # Abismo: o paredao ate o pe (topo - altura) e, dele, uma encosta reta que chega ao relevo real (que em 30 m
    # borra o paredao numa rampa) a 180-280 m da beirada, conforme o trecho; dali em diante, o relevo. Cada ponto da
    # beirada mede o relevo ao longo da sua normal e acha a inclinacao da sua encosta. Onde o vale ali e raso para o
    # paredao sorteado, o pe sobe ate a encosta ter pelo menos 0,25 m por m (o paredao fica mais baixo).
    Dp = np.arange(0, 500.1, 5.0)
    px_ = borda[:, 0:1] + nb_[:, 0:1] * Dp[None, :]
    py_ = borda[:, 1:2] + nb_[:, 1:2] * Dp[None, :]
    perfil = anadem(px_.ravel(), py_.ravel()).reshape(px_.shape)
    junta = 180 + 100 * (.5 + .5 * np.tanh(ruido1d(nb, 90, SEMENTE + 2, False)))
    p_junta = perfil[np.arange(nb), np.round(junta / 5).astype(int)]
    pe_b = np.maximum(borda[:, 2] - altura_paredao, p_junta + .25 * junta)
    pe_b = np.minimum(pe_b, borda[:, 2] - 40)
    pe_b = gaussian_filter1d(pe_b, 4, mode='nearest')
    encosta = gaussian_filter1d(np.clip((pe_b - p_junta) / junta, .1, 1.5), 4, mode='nearest')
    altura_paredao = borda[:, 2] - pe_b
    linha = pe_b[ib] - encosta[ib] * np.maximum(D, 0)
    w_rel = np.clip((D - (junta[ib] - 20)) / 40, 0, 1)
    abismo = (1 - w_rel) * np.minimum(dem, linha) + w_rel * dem
    print(f'paredao final {altura_paredao.min():.0f}-{altura_paredao.max():.0f} m; encosta {encosta.min():.2f}-{encosta.max():.2f} m/m '
          f'(mediana {np.median(encosta):.2f}) ate o relevo a {junta.min():.0f}-{junta.max():.0f} m')
    zt = np.where(D > 0, abismo, planalto) - base_alt
    pit_xy = np.array(pit['xy'])
    pk = cKDTree(pit_xy)
    dp, ip = pk.query(q)
    pl = np.array(pit['lx_ly'])
    plat = np.sum((q - pit_xy[ip]) * pl[ip], axis=1)
    pout = np.maximum(np.maximum(pit['lo_arr'][ip] - plat, plat - pit['hi_arr'][ip]), 0)
    pt_ = np.gradient(pit_xy, axis=0)
    pt_ /= np.linalg.norm(pt_, axis=1)[:, None]
    adiante = np.sum((q - pit_xy[ip]) * pt_[ip], axis=1)
    ponta = ((ip == 0) & (adiante < -1)) | ((ip == len(pit_xy) - 1) & (adiante > 1))
    ppeso = np.clip((22 - pout) / 16, 0, 1) * (dp < 60) * ~ponta
    pz = np.array(pit['z_lane'])
    usa = (ppeso > 0) & ((pout < fora) | (ppeso > peso)) & (D <= 0)
    zt = np.where(usa, zt * (1 - ppeso) + (pz[ip] - .06) * ppeso, zt)
    terrain = {'x0': float(x0), 'y0': float(y0), 'step': PASSO, 'nx': nx, 'ny': ny, 'z': np.round(zt, 2).tolist()}
    print(f'terreno {nx}x{ny} ({nx * ny} vertices), {(D > 0).mean():.0%} do lado do abismo')

    # --- Cenario (cobertura, edificacoes, arquibancadas) e cor do chao, como os outros circuitos.
    # gerar_pista.cenario pinta e grava a cobertura com o passo do modulo (4 m): aqui a grade e de 5 m.
    gp.PASSO = PASSO
    extra = {'arquibancadas': ARQUIBANCADAS}
    scenery = gp.cenario(NOME, pasta, epsg, np.r_[ORIGEM, base_alt], 1.0, gx, gy, P, largura, pit, s, L, T, E, extra)
    classes = np.array(list(scenery['cover']['classes'])).reshape(ny, nx)
    # Sem arvore no paredao nem a menos de um passo da beirada (o pe do paredao fica de pedra solta).
    Dg = D.reshape(ny, nx)
    classes[(Dg > -PASSO) & (Dg < 9)] = '5'
    scenery['cover']['classes'] = ''.join(classes.ravel())
    gp.solo(NOME, pasta, epsg, np.r_[ORIGEM, base_alt], 1.0, gx, gy)
    scenery['cliff'] = {
        'columns': ['x', 'y', 'top_z', 'wall_m'],
        'edge': np.round(np.column_stack([borda[:, :2], borda[:, 2] - base_alt, altura_paredao]), 2).tolist(),
        'plateau': 'right',
        # Nos da grade alem da beirada, por linha (sul para norte): pares [inicio, fim) de colunas.
        'abyss_runs': [corridas(linha) for linha in (Dg > 0)],
        'track_from': round(float(s[a_beira % n]), 1), 'track_to': round(float(s[b_beira % n]), 1),
        'source': 'Topo do paredão sul e leste da Chapada dos Guimarães medido no ANADEM (30 m); junto da pista, a '
                  'beirada é desenho de jogo (2 a 6 m de terra entre o asfalto e o precipício).',
    }
    scenery['far'] = aneis(pasta, epsg, base_alt, '--longe' in sys.argv)

    # --- Sem guard-rail em lugar nenhum (pedido): os dois lados vazios.
    rails = {'-1': [], '1': []}
    frenagens = []
    for cc in cv:
        if cc['raio_min'] < 160:
            a = s[cc['ini']]
            frenagens.append([round(float((a - 120) % L), 1), round(float((a + 25) % L), 1)])
    colunas = ['s_xy_m', 'x_east_m', 'y_north_m', 'z_local_m', 'width_m', 'crossfall_left', 'grade', 'tx', 'ty',
               'left_x', 'left_y', 'fit_rmse_m', 'ground_points', 'kerb_right', 'kerb_left']
    rmse = np.abs(z_eixo - z_abs)
    samples = np.column_stack([s, P, z, largura, bank, grade, T, E, rmse, np.zeros(n), zebra_d, zebra_e])
    comp_3d = float(np.sqrt(np.sum((np.roll(P, -1, 0) - P) ** 2, axis=1) + (np.roll(z, -1) - z) ** 2).sum())
    fontes = json.loads((pasta / 'proveniencia.json').read_text(encoding='utf-8'))
    validacao = {
        'anadem_menos_copernicus_mediana_m': float(np.median(z_eixo - cop(P[:, 0], P[:, 1], ordem=3))),
        'anadem_menos_copernicus_p95_abs_m': float(np.percentile(np.abs(z_eixo - cop(P[:, 0], P[:, 1], ordem=3)), 95)),
        'suavizacao_residuo_rms_m': float(np.sqrt(np.mean((z_ref - z_abs) ** 2))),
    }
    meta = {
        'id': NOME, 'name': c['nome'], 'nominal_m': round(comp_3d), 'direction': c['sentido'],
        'reconstructed_xy_m': L, 'reconstructed_3d_m': comp_3d,
        'measured_centreline_m': L, 'osm_centreline_m': None,
        'horizontal_scale_to_nominal': 1.0, 'difference_nominal_pct': 100 * (comp_3d / round(comp_3d) - 1),
        'elevation_min_m': float(z_abs.min()), 'elevation_max_m': float(z_abs.max()),
        'elevation_range_m': float(np.ptp(z_abs)), 'grade_min_pct': float(100 * grade.min()),
        'grade_max_pct': float(100 * grade.max()), 'width_min_m': float(largura.min()),
        'width_max_m': float(largura.max()), 'kerb_m': float((zebra_d.sum() + zebra_e.sum()) * DS),
        'pit_lane_m': float(pit['length_m']), 'samples': n,
        'origin_utm': [float(ORIGEM[0]), float(ORIGEM[1]), float(base_alt)], 'epsg': epsg, 'altitude_base_m': base_alt,
        'sections': trechos, 'rails': rails, 'brake_zones': frenagens,
        'kerb_colors': ['#c8201e', '#f1efe8'], 'surface_zones': [],
        'city_angle': gp.angulo_cidade(c, np.r_[ORIGEM, base_alt], epsg),
        'horizon': c['horizonte'], 'imaginary': True,
        # Base da nevoa de altitude (cinematic.js): o fundo do vale, para ele nao sumir na nevoa.
        'haze_base_m': float(np.percentile(np.array(terrain['z']), 3)),
        'elevation_check': validacao, 'sources': fontes,
        'centreline': 'Desenho de jogo (gerar_chapada.py): retas e curvas de raio fixo seguindo o topo do paredão medido no ANADEM.',
        'caveat': ('Circuito imaginário: não existe autódromo na Chapada dos Guimarães. Relevo (ANADEM e Copernicus), mata '
                   '(ESA WorldCover) e cor do chão (Sentinel-2) reais; traçado, perfil (terraplanagem com rampa de até 6%), '
                   'boxes e o paredão vertical na beirada da pista são desenho de jogo.'),
    }
    pit = {k: v for k, v in pit.items() if k not in ('xy', 'z_lane', 'lx_ly', 'lo_arr', 'hi_arr')}
    saida = {'meta': meta, 'columns': colunas, 'samples': np.round(samples, 5).tolist(), 'pit': pit,
             'terrain': terrain, 'scenery': scenery}
    destino = DADOS / f'pista_{NOME}.json'
    destino.write_text(json.dumps(saida, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    print(f'{destino.name}: {destino.stat().st_size / 1e6:.2f} MB')
    resumo = {k: meta[k] for k in ('reconstructed_xy_m', 'reconstructed_3d_m', 'elevation_min_m', 'elevation_max_m',
                                    'elevation_range_m', 'grade_min_pct', 'grade_max_pct', 'width_min_m', 'width_max_m',
                                    'kerb_m', 'pit_lane_m', 'altitude_base_m', 'haze_base_m', 'elevation_check')}
    print(json.dumps(resumo, indent=1, ensure_ascii=False))


# --- Horizonte: o vale e a planicie ate 22 km (Copernicus GLO-30 e Sentinel-2) ----------------------------
COP_TILE = 'Copernicus_DSM_COG_10_S16_00_W056_00_DEM'


def aneis(pasta, epsg, base_alt, baixar):
    """Dois aneis de relevo com cor alem da grade do terreno: 'medio' (14 km, 40 m) e 'longe' (44 km,
    160 m). Cada um grava o relevo em Int16 (decimetros acima de `offset`) e a cor do Sentinel-2 em JPEG."""
    # Relevo: o ANADEM (terreno, como a grade do circuito: os aneis emendam nela sem degrau) numa janela larga;
    # onde ele nao tem dado, o Copernicus (superficie).
    tile = pasta / 'cop30_S16W056.tif'
    if not tile.exists():
        import requests
        url = f'https://copernicus-dem-30m.s3.amazonaws.com/{COP_TILE}/{COP_TILE}.tif'
        tile.write_bytes(requests.get(url, timeout=600).content)
    cop_largo = Dem(tile, epsg)
    largo = pasta / 'anadem_largo.tif'
    meio_max = max(v[0] for v in ANEIS.values()) * 500 + 500
    if baixar or not largo.exists():
        para = Transformer.from_crs(epsg, 4326, always_xy=True)
        lon0, lat0 = para.transform(ORIGEM[0] - meio_max, ORIGEM[1] - meio_max)
        lon1, lat1 = para.transform(ORIGEM[0] + meio_max, ORIGEM[1] + meio_max)
        g = geo_io.recortar(f'https://metadados.snirh.gov.br/files/anadem_v1_tiles/anadem_v1_{CIRCUITOS[NOME]["anadem"]}.tif',
                            (lon0, lat0, lon1, lat1))
        geo_io.gravar(largo, g.a, g.transform, g.epsg, g.nodata)
        print(f'ANADEM largo: {g.a.shape[2]}x{g.a.shape[1]} px -> {largo.name}')
    anadem_largo = Dem(largo, epsg)

    def dem(x, y):
        z = anadem_largo(x, y)
        ruim = ~np.isfinite(z) | (z < -100) | (z > 3000)
        if ruim.any():
            z = np.where(ruim, cop_largo(x, y), z)
        return z
    # Cor: o medio na resolucao cheia do Sentinel-2 (10 m), o longe reduzido (20 m); a mesma cena do circuito,
    # completada pelas vizinhas do mesmo dia.
    fontes_cor = {'medio': (pasta / 'sentinel2_medio.tif', 1), 'longe': (pasta / 'sentinel2_largo.tif', 2)}
    imagens, saida = {}, {}
    for nome, (lado_km, passo, px) in ANEIS.items():
        cor, fator = fontes_cor[nome]
        if baixar or not cor.exists():
            sentinel2_largo(pasta, epsg, cor, lado_km * 500 + 500, fator)
        s2 = geo_io.ler(cor)
        rgb = np.moveaxis(s2.a[:3], 0, -1).astype(float)
        para_s2 = Transformer.from_crs(epsg, s2.epsg, always_xy=True)
        meio = lado_km * 500
        u = np.arange(-meio, meio + 1e-6, passo)
        X, Y = np.meshgrid(u, u)
        zz = dem(X.ravel(), Y.ravel()).reshape(X.shape) - base_alt
        off = math.floor(zz.min()) - 1
        dec = np.clip(np.round((zz - off) * 10), 0, 65535).astype('<u2')
        arq_z = ASSETS / f'{NOME}_{nome}_relevo.bin'
        arq_z.write_bytes(dec[::-1].tobytes())          # primeira linha ao norte, como a imagem
        # Cor: centros dos pixels da imagem levados ao Sentinel-2 (bilinear).
        v = (np.arange(px) + .5) / px * 2 * meio - meio
        IX, IY = np.meshgrid(v, v[::-1])
        ux, uy = para_s2.transform(IX.ravel() + ORIGEM[0], IY.ravel() + ORIGEM[1])
        col, lin = ~s2.transform * (np.asarray(ux), np.asarray(uy))
        col, lin = np.asarray(col) - .5, np.asarray(lin) - .5
        c0 = np.clip(np.floor(col).astype(int), 0, rgb.shape[1] - 2)
        r0 = np.clip(np.floor(lin).astype(int), 0, rgb.shape[0] - 2)
        fc, fr = np.clip(col - c0, 0, 1)[:, None], np.clip(lin - r0, 0, 1)[:, None]
        imagens[nome] = ((rgb[r0, c0] * (1 - fc) + rgb[r0, c0 + 1] * fc) * (1 - fr) + (rgb[r0 + 1, c0] * (1 - fc) + rgb[r0 + 1, c0 + 1] * fc) * fr).reshape(px, px, 3)
        saida[nome] = {'relief': arq_z.name, 'x0': -meio, 'y0': -meio, 'step': passo, 'nx': len(u), 'ny': len(u), 'offset': off, 'unit': .1}
    # A cor do Sentinel-2 como vem, como a do chao perto da pista (a mesma foto no material do terreno): esticada canal
    # a canal ela deixava o campo seco rosado e as matas arroxeadas. So um pouco menos saturada.
    for nome, img in imagens.items():
        x = np.clip(img / 255, 0, 1)
        cinza = x.mean(-1, keepdims=True)
        x = np.clip(cinza + (x - cinza) * .9, 0, 1)
        arq_c = ASSETS / f'{NOME}_{nome}.jpg'
        Image.fromarray((x * 255 + .5).astype(np.uint8)).save(arq_c, quality=84)
        saida[nome]['image'] = arq_c.name
        print(f'anel {nome}: {saida[nome]["nx"]}x{saida[nome]["ny"]} ({saida[nome]["step"]:.0f} m), '
              f'{(ASSETS / saida[nome]["relief"]).stat().st_size / 1e3:.0f} kB + {arq_c.stat().st_size / 1e3:.0f} kB')
    saida['source'] = ('Relevo Copernicus GLO-30 (ESA) e cor do Sentinel-2 L2A '
                       f'({json.loads((pasta / "sentinel2.json").read_text())["id"]}) até 22 km do circuito.')
    return saida


def sentinel2_largo(pasta, epsg, destino, meio_m, fator=2):
    """A cena Sentinel-2 da caixa do circuito numa janela larga, reduzida `fator` vezes (2: ~20 m), com o
    que ela nao cobre (o norte da janela passa da faixa do tile 21LXC) preenchido pelas cenas vizinhas do mesmo dia."""
    import requests
    import rasterio
    from affine import Affine
    from rasterio.enums import Resampling
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds
    info = json.loads((pasta / 'sentinel2.json').read_text())
    para = Transformer.from_crs(epsg, 4326, always_xy=True)
    lon0, lat0 = para.transform(ORIGEM[0] - meio_m, ORIGEM[1] - meio_m)
    lon1, lat1 = para.transform(ORIGEM[0] + meio_m, ORIGEM[1] + meio_m)
    dia = info['datetime'][:10]
    busca = {'collections': ['sentinel-2-l2a'], 'bbox': [lon0, lat0, lon1, lat1],
             'datetime': f'{dia}T00:00:00Z/{dia}T23:59:59Z', 'limit': 20}
    itens = requests.post('https://earth-search.aws.element84.com/v1/search', json=busca, timeout=120).json()['features']
    itens.sort(key=lambda f: (f['id'] != info['id'], f['properties'].get('eo:cloud_cover', 100)))
    env = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_TIMEOUT='120')
    mosaico, t_, crs_ = None, None, None
    for item in itens:
        with rasterio.Env(**env), rasterio.open('/vsicurl/' + item['assets']['visual']['href']) as src:
            if mosaico is None:
                b = transform_bounds('EPSG:4326', src.crs, lon0, lat0, lon1, lat1)
                crs_ = src.crs
            elif src.crs != crs_:
                continue
            win = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
            forma = (3, int(win.height // fator), int(win.width // fator))
            a = src.read(window=win, out_shape=forma, resampling=Resampling.average, boundless=True, fill_value=0)
            if mosaico is None:
                mosaico = a
                t_ = src.window_transform(win) * Affine.scale(win.width / forma[2], win.height / forma[1])
            else:
                vazio = (mosaico.max(0) == 0) & (a.max(0) > 0)
                mosaico[:, vazio] = a[:, vazio]
                print(f'  {item["id"]}: {vazio.mean():.1%} da janela')
        if not (mosaico.max(0) == 0).any():
            break
    geo_io.gravar(destino, mosaico, t_, crs_.to_epsg(), None)
    print(f'Sentinel-2 largo: {mosaico.shape[2]}x{mosaico.shape[1]} px, {(mosaico.max(0) == 0).mean():.1%} sem dado -> {destino.name}')


if __name__ == '__main__':
    main()
