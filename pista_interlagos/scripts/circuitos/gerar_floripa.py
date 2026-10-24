"""Autodromo Floripa: circuito de rua imaginario sobre as ruas, as pontes e o mar reais de Florianopolis.

    python baixar_fontes.py floripa --referencia   (OSM, ANADEM, Copernicus, WorldCover, Sentinel-2, Esri so p/ medir)
    python gerar_floripa.py [--planta]

Pedido da equipe (11/10/2026), com o tracado desenhado no Google Maps (fotos_referencia/autodromo_floripa/trajeto.png):
largada na Ponte Hercilio Luz rumo a ilha, a Parque da Luz adiante; Alameda Adolfo Konder, Rua Hoepcke, Rua
Claudino Bento da Silva, Av. Paulo Fontes diante da rodoviaria, o laco da Rua Pedro Bittencourt, a Ponte Colombo
Salles de volta ao continente, o laco do Estreito (Rua 14 de Julho) e a Av. Ivo Silveira de volta a Hercilio Luz.

O eixo sao as vias do OpenStreetMap em sequencia (ids em CADEIA), com as esquinas arredondadas e o rumo
suavizado; as larguras saem das faixas de cada via (com um minimo de corrida); o perfil e o relevo (ANADEM) em
terra e um greide desenhado sobre as pontes (fatos publicados); o mar e o relevo abaixo do nivel 0. Muros de
concreto com alambrado dos dois lados, como nos circuitos de rua. Os boxes ficam diante da Rodoviaria Rita
Maria, na Av. Paulo Fontes (a ponte nao tem onde por uma faixa de boxes).

No fim, gerar_cidade_floripa.py poe a cidade de verdade em volta (scenery.city) e grava dados/pista_floripa.json; a volta
sem ela fica em fontes/floripa/pista_floripa_base.json.

O formato e o de gerar_pista.py / gerar_chapada.py, com:
- duas colunas a mais nas estacoes: 'wall_right_m', 'wall_left_m' (folga do asfalto ate a face do muro);
- `meta.decks`: trechos [s0, s1] sobre estrutura (pontes): ali o jogo nao cola o terreno na pista e o carro
  anda no tabuleiro ate o muro;
- `meta.sea_level_m`: o nivel do mar na altura local (0: a base e o nivel do mar);
- `scenery.bridges`: geometria das pontes para os modelos (torres, vaos, pilares).
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

import gerar_pista as gp
from compat_scipy import cKDTree, gaussian_filter1d, maximum_filter1d, minimum_filter1d
from config import ASSETS, CIRCUITOS, DADOS, pasta_fontes
from projecao import Transformer

NOME = 'floripa'
DS = 2.0
PASSO = 4.0
SEMENTE = 99

# --- Vias do OSM na ordem da volta (sentido da corrida); '-' na frente percorre a via ao contrario.
CADEIA = [
    # Av. Gov. Ivo Silveira (fim) e a cabeceira continental da Hercilio Luz
    768332127, -768332125,
    # Ponte Hercilio Luz (continente -> ilha)
    687688904,
    # Cabeceira insular e Alameda Adolfo Konder
    -925099678, 768332129, 985673474, 37737976, 985673476, 985673480,
    # Rua Hoepcke, Rua Claudino Bento da Silva e a alca para a Av. Paulo Fontes
    985673477, 539428494, 37739493, 295564201,
    # Av. Paulo Fontes (sentido centro), diante da Rodoviaria Rita Maria
    539428495, 246389311, 973189149, 973189158, 973189144, 973189145, 973189143,
    # Rua Pedro Bittencourt (o laco em volta do estacionamento da rodoviaria) e a cabeceira da Colombo Salles
    201386746, 973189140, 109298493, 973189139, 973189138, 109298496,
    # Ponte Colombo Salles (ilha -> continente) e a Via Expressa
    35893655, 35893667,
    # Saida para o Estreito: alca, Rua 14 de Julho e Av. Gov. Ivo Silveira
    37736684, 97888058, 82241514, 264394224, 109298492, 975325084, 97888032, 986386773,
]
PONTES = {687688904: 'hercilio_luz', 35893655: 'colombo_salles'}

# Largura da pista por via (m): o leito real (faixas do OSM) com um minimo de corrida de 9,5 m.
LARG_MIN = 9.5
LARG_MAX = 15.0
LARG_VIA = {
    687688904: 9.5,           # Hercilio Luz: o leito de 9,2 m entre as trelicas (as calcadas correm por fora delas)
    35893655: 14.0,           # Colombo Salles: 4 faixas
    35893667: 14.0,
}
LARG_FIXA = {687688904: 9.5}
# Esquinas abertas (desenho de jogo): o arco de `raio` m tangente as duas ruas substitui a quina do OSM, usando parte do
# lote de dentro (pedido da equipe, 11/10/2026: a de 90+ graus da Alameda Adolfo Konder com a Rua Hoepcke, no alto do morro,
# era a mais fechada da volta, ~9 m no eixo, e o muro de dentro dobrava num raio de 3 m). `largura`: a pista no arco.
ESQUINAS = [{'nome': 'Adolfo Konder x Hoepcke', 'no': (-27.59368, -48.55907), 'raio': 22.0, 'largura': 11.0, 'alcance': 40.0}]
# Linha de chegada: fracao do tabuleiro da Hercilio Luz a partir da cabeceira continental. O grid (76 m
# atras do Opala 99, o ultimo) fica no vao central, do lado do continente; a reta segue ate a ilha.
LINHA = .56
RAMPA_MAX = .12
# Sob as copas (a Alameda Adolfo Konder e arborizada de ponta a ponta; um trecho da Rua 14 de Julho) o MDT fotogrametrico
# nao ve o asfalto e chuta o chao pelo que aparece em volta (o parque, os lotes, mais baixos): fez um vale de 2,7 m na
# Alameda (s 545-575, -12% e +9,5% em 60 m, baixada de raio 54 m), onde a rua real e quase plana (as curvas de nivel de 1 m
# do GeoFloripa nao descem nem 1 m ali) e os carros voavam e capotavam (usuario, 24/10/2026). Onde a superficie (MDS) fica
# COPA_M acima do terreno no eixo por COPA_MIN_M ou mais, o perfil so guarda curvas verticais de raio RAIO_COPA_M ou mais.
COPA_M = 2.0
COPA_MIN_M = 20.0
RAIO_COPA_M = 700.0
# Greide das pontes (cotas em m acima do mar): cabeceiras pela terra (ou dadas) e o topo no vao.
GREIDE = {
    'hercilio_luz': {'forma': 'parabola'},
    # Gabarito de navegacao de 17,5 m (OpenSeaMap, no 2905018738) mais ~4,5 m de viga no meio do vao principal.
    'colombo_salles': {'forma': 'hermite', 'topo': 22.0, 'topo_lonlat': (-48.5651542, -27.5977069)},
}


def ll_cadeia(osm):
    nos = {e['id']: (e['lon'], e['lat']) for e in osm['elements'] if e['type'] == 'node'}
    vias = {e['id']: e for e in osm['elements'] if e['type'] == 'way'}
    pts, ids, larg = [], [], []
    for w in CADEIA:
        via = vias[abs(w)]
        ns = via['nodes'][::-1] if w < 0 else via['nodes']
        if pts and ns[0] == pts[-1]:
            ns = ns[1:]
        elif pts:
            raise SystemExit(f'cadeia quebrada antes da via {w}')
        t = via.get('tags', {})
        faixas = float(t.get('lanes', '2').split(';')[0])
        lg = LARG_VIA.get(abs(w), faixas * 3.3 + 1.2)
        for n in ns:
            pts.append(n)
            ids.append(abs(w))
            larg.append(min(LARG_MAX, max(LARG_MIN, lg)))
    if pts[0] != pts[-1]:
        raise SystemExit('a cadeia nao fecha a volta')
    ll = np.array([nos[n] for n in pts[:-1]])
    return ll, np.array(ids[:-1]), np.array(larg[:-1])


def abrir_esquinas(P, ids, larg, origem, para):
    """Troca a quina de cada ESQUINAS por um arco de raio dado, tangente as duas ruas (as direcoes medias delas nos
    `alcance` m antes e depois da quina). Devolve o poligono novo, as vias e larguras de cada vertice, e os pontos dos
    arcos (as estacoes junto deles ficam sem a medida dos meios-fios)."""
    arcos = []
    for e in ESQUINAS:
        x, y = para.transform(e['no'][1], e['no'][0])
        c = int(np.argmin(np.hypot(P[:, 0] - (x - origem[0]), P[:, 1] - (y - origem[1]))))
        n = len(P)
        seg = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)

        def ponto(dist, sentido):
            """O ponto do poligono a `dist` m da quina, andando no sentido dado, e o indice do vertice que comeca (na
            ordem da volta) o lado onde ele cai."""
            k, feito = c, 0.0
            while True:
                j = (k + sentido) % n
                passo = seg[k] if sentido > 0 else seg[j]
                if feito + passo >= dist:
                    f = (dist - feito) / passo
                    return P[k] + (P[j] - P[k]) * f, (k if sentido > 0 else j)
                feito += passo
                k = j
        antes, _ = ponto(e['alcance'], -1)
        depois, _ = ponto(e['alcance'], 1)
        u = (P[c] - antes) / np.linalg.norm(P[c] - antes)
        w = (depois - P[c]) / np.linalg.norm(depois - P[c])
        defl = math.atan2(u[0] * w[1] - u[1] * w[0], u @ w)
        tang = e['raio'] * math.tan(abs(defl) / 2)
        # Os pontos das ruas a `tang` m da quina, e a direcao de cada rua ali: a curva sai e chega tangente a elas.
        t1, k1 = ponto(tang, -1)
        t2, k2 = ponto(tang, 1)
        d1 = P[(k1 + 1) % n] - P[k1]
        d1 /= np.linalg.norm(d1)
        d2 = P[(k2 + 1) % n] - P[k2]
        d2 /= np.linalg.norm(d2)
        giro = abs(math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1 @ d2))
        corda = float(np.linalg.norm(t2 - t1))
        raio_ef = corda / (2 * math.sin(giro / 2))
        # Bezier cubica com as alcas de um arco circular do mesmo giro (4/3 tan(giro/4) R).
        h = 4 / 3 * math.tan(giro / 4) * raio_ef
        b0, b1, b2, b3 = t1, t1 + d1 * h, t2 - d2 * h, t2
        m = max(12, int(giro * raio_ef / 1.0))
        q_ = np.linspace(0, 1, m + 1)[:, None]
        arco = (1 - q_) ** 3 * b0 + 3 * (1 - q_) ** 2 * q_ * b1 + 3 * (1 - q_) * q_ ** 2 * b2 + q_ ** 3 * b3
        # Do vertice k1 ao comeco da curva (t1, no lado k1-k1+1) e do fim dela (t2, no lado k2-k2+1) ao vertice k2+1: os
        # vertices entre eles saem.
        fim = (k2 + 1) % n
        manter = [i for i in range(n) if not (((i - k1) % n) > 0 and ((i - k1) % n) < ((fim - k1) % n))]
        novo, nid, nlg = [], [], []
        for i in manter:
            novo.append(P[i]); nid.append(ids[i]); nlg.append(larg[i])
            if i == k1:
                meio = len(arco) // 2
                for q, pt in enumerate(arco):
                    if np.linalg.norm(pt - novo[-1]) < .05:
                        continue
                    novo.append(pt); nid.append(ids[c] if q < meio else ids[(c + 1) % n]); nlg.append(larg[c])
        P, ids, larg = np.array(novo), np.array(nid), np.array(nlg)
        arcos.append(arco)
        afast = float(np.linalg.norm(arco[len(arco) // 2] - np.array([x - origem[0], y - origem[1]])))
        print(f"esquina {e['nome']}: {math.degrees(giro):.0f} graus, raio {raio_ef:.1f} m, tangentes de {tang:.1f} m, "
              f"apice {afast:.1f} m para dentro da quina do OSM")
    return P, ids, larg, arcos


def arredondar(P, raio_alvo=24.0, raio_esquina=13.0, frac=.46):
    """Arredonda o poligono fechado: em cada vertice um arco tangente aos dois lados, de raio raio_alvo (ou
    raio_esquina nas esquinas de mais de 50 graus), limitado para a tangente caber em `frac` dos lados vizinhos.
    Nas vias curvas do OSM (alcas, lacos) os vertices sao proximos e o arco segue a curva desenhada."""
    n = len(P)
    out, origem = [], []
    for i in range(n):
        a, b, c = P[i - 1], P[i], P[(i + 1) % n]
        u, w = b - a, c - b
        la, lb = np.linalg.norm(u), np.linalg.norm(w)
        u, w = u / la, w / lb
        defl = math.atan2(u[0] * w[1] - u[1] * w[0], u @ w)
        if abs(defl) < math.radians(2):
            out.append(b)
            origem.append(i)
            continue
        r = raio_esquina if abs(defl) > math.radians(50) else raio_alvo
        t = min(r * math.tan(abs(defl) / 2), frac * la, frac * lb)
        r = t / math.tan(abs(defl) / 2)
        p0 = b - u * t
        sg = 1 if defl > 0 else -1
        centro = p0 + sg * r * np.array([-u[1], u[0]])
        m = max(2, int(abs(defl) * r / .5))
        h0 = math.atan2(u[1], u[0])
        for k in range(m + 1):
            h = h0 + defl * k / m
            out.append(centro - sg * r * np.array([-math.sin(h), math.cos(h)]))
            origem.append(i)
    return np.array(out), np.array(origem)


def reamostrar_fechado(P, ds=DS):
    Q = np.vstack([P, P[:1]])
    seg = np.linalg.norm(np.diff(Q, axis=0), axis=1)
    s = np.r_[0, np.cumsum(seg)]
    N = int(round(s[-1] / ds))
    su = np.linspace(0, s[-1], N, endpoint=False)
    return np.column_stack([np.interp(su, s, Q[:, 0]), np.interp(su, s, Q[:, 1])]), su, s[-1]


def suavizar_rumo(P, sigma_m=5.0):
    """Rumo suavizado (gaussiana de sigma_m) e reintegrado, laco fechado e a deriva devolvida (como construir()
    de gerar_chapada): da curvatura continua sem mudar o desenho das ruas."""
    n = len(P)
    d = np.roll(P, -1, 0) - P
    th = np.unwrap(np.arctan2(d[:, 1], d[:, 0]))
    sl = np.linalg.norm(d, axis=1)
    volta = round((th[-1] - th[0] + math.atan2(d[0, 1], d[0, 0]) - math.atan2(d[-1, 1], d[-1, 0])) / (2 * math.pi))
    tend = 2 * math.pi * volta * np.arange(n) / n
    thn = gaussian_filter1d(th - tend, sigma_m / DS, mode='wrap') + tend
    Q = np.zeros_like(P)
    Q[0] = P[0]
    for i in range(1, n):
        Q[i] = Q[i - 1] + sl[i - 1] * np.array([math.cos(thn[i - 1]), math.sin(thn[i - 1])])
    fim = Q[-1] + sl[-1] * np.array([math.cos(thn[-1]), math.sin(thn[-1])])
    Q -= np.outer(np.arange(n) / n, fim - Q[0])
    for _ in range(3):
        Q += gaussian_filter1d(P - Q, 25, axis=0, mode='wrap')
    return Q


def eixo(c, pasta, epsg):
    para = Transformer.from_crs(4326, epsg, always_xy=True)
    ox, oy = para.transform(c['centro'][1], c['centro'][0])
    origem = np.array([round(ox, -1), round(oy, -1)])
    osm = json.loads((pasta / 'osm.json').read_text(encoding='utf-8'))
    ll, ids, larg_no = ll_cadeia(osm)
    ux, uy = para.transform(ll[:, 0], ll[:, 1])
    P0 = np.column_stack([ux, uy]) - origem
    print(f'cadeia OSM: {len(P0)} nos, {np.linalg.norm(np.diff(np.vstack([P0, P0[:1]]), axis=0), axis=1).sum():.0f} m')
    P0, ids, larg_no, arcos = abrir_esquinas(P0, ids, larg_no, origem, para)
    R, orig = arredondar(P0)
    P, _, _ = reamostrar_fechado(R)
    P = suavizar_rumo(P)
    P, s, L = reamostrar_fechado(P)
    k = orig[cKDTree(R).query(P)[1]]
    via, larg = ids[k], larg_no[k]
    # A linha de chegada na Hercilio Luz (LINHA: fracao do tabuleiro a partir da cabeceira continental).
    ponte = np.flatnonzero(via == 687688904)
    i0 = int(ponte[0] + LINHA * (len(ponte) - 1))
    P, via, larg = np.roll(P, -i0, 0), np.roll(via, -i0), np.roll(larg, -i0)
    densa = reamostrar_fechado(R, .5)[0]
    desvio = cKDTree(densa).query(P)[0]
    print(f'eixo: {L:.0f} m, {len(P)} estacoes; desvio da via OSM arredondada: mediana {np.median(desvio):.2f} m, '
          f'max {desvio.max():.2f} m')
    return P, s, L, via, larg, origem, P0, arcos


def corrida(mask):
    """Indices (em ordem, podendo dar a volta no laco) do unico trecho continuo de `mask`."""
    n = len(mask)
    if mask.all():
        return np.arange(n)
    i0 = int(np.flatnonzero(mask & ~np.roll(mask, 1))[0])
    k = [i0]
    while mask[(k[-1] + 1) % n] and len(k) < n:
        k.append((k[-1] + 1) % n)
    return np.array(k)


def s_continuo(s, k, L):
    """s dos indices k sem o salto da linha de chegada."""
    return np.unwrap(s[k], period=L)


def trechos_de(mask, s, L, minimo=0.0):
    """Trechos [s0, s1] de uma mascara ao longo da volta (sem dar a volta no indice)."""
    runs, k, n = [], 0, len(mask)
    while k < n:
        j = k
        while j < n and mask[j] == mask[k]:
            j += 1
        if mask[k] and (j - k) * DS >= minimo:
            runs.append([float(s[k]), float(s[j - 1]) + DS if j < n else L])
        k = j
    return runs


class Relevo:
    """O terreno e a superficie de 1 m do GeoFloripa (aerolevantamento do Estado, 2010-2012) na caixa baixada; fora
    dela o ANADEM (30 m), com o mar (sem dado) a 0. Coordenadas locais."""

    def __init__(self, pasta, epsg, origem):
        self.o = np.asarray(origem, float)
        self.mdt = gp.Raster(pasta / 'mdt_floripa.tif', epsg)
        self.mds = gp.Raster(pasta / 'mds_floripa.tif', epsg)
        self.mds.a[self.mds.a < -1e30] = np.nan
        self.an = gp.Raster(pasta / 'anadem.tif', epsg)
        cop = gp.Raster(pasta / 'copernicus_dsm.tif', epsg)
        vazio = self.an.a < -50
        if vazio.any():
            lin, col = np.nonzero(vazio)
            lon, lat = self.an.t * (col + .5, lin + .5)
            X, Y = Transformer.from_crs(4326, epsg, always_xy=True).transform(np.asarray(lon), np.asarray(lat))
            self.an.a[vazio] = np.minimum(cop(np.asarray(X), np.asarray(Y), ordem=1), 0.0)
        t = self.mdt.t
        h, w = self.mdt.a.shape
        self.caixa = (t.c + 30, t.f + t.e * h + 30, t.c + t.a * w - 30, t.f - 30)     # x0, y0, x1, y1 (UTM)

    def dentro(self, X, Y):
        x0, y0, x1, y1 = self.caixa
        return np.clip(np.minimum.reduce([X - x0, x1 - X, Y - y0, y1 - Y]) / 60, 0, 1)

    def terreno(self, x, y, ordem=1):
        X, Y = np.asarray(x, float) + self.o[0], np.asarray(y, float) + self.o[1]
        w = self.dentro(X, Y)
        z = self.an(X, Y, ordem=1)
        if (w > 0).any():
            z = np.where(w > 0, self.mdt(X, Y, ordem=ordem) * w + z * (1 - w), z)
        return z

    def superficie(self, x, y):
        X, Y = np.asarray(x, float) + self.o[0], np.asarray(y, float) + self.o[1]
        z = self.mds(X, Y, ordem=1)
        return np.where(self.dentro(X, Y) > .99, z, np.nan)


def ao_longo(f, P, E, offs=(-3.0, -1.5, 0.0, 1.5, 3.0)):
    """Mediana de f nos pontos da secao (offsets laterais) de cada estacao (ignora os sem dado)."""
    import warnings
    v = np.array([f(P[:, 0] + E[:, 0] * d, P[:, 1] + E[:, 1] * d) for d in offs])
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', RuntimeWarning)
        return np.nanmedian(v, axis=0)


def perfil(P, E, s, L, via, rel, esquina=None):
    """Perfil da volta. Em terra, o terreno de 1 m sob a secao da pista (suavizado, rampa limitada). Nas pontes, o
    tabuleiro no modelo de superficie (MDS) onde ele passa sobre terra; sobre o mar, onde a correlacao de imagens nao
    mede nada, o greide e ajustado: a Hercilio Luz por uma parabola nos pontos medidos das duas cabeceiras (o vao
    pensil e abaulado), a Colombo Salles por uma curva suave entre as duas margens com as rampas medidas. Sob as copas,
    so a forma suave do chao (RAIO_COPA_M), menos nas esquinas abertas (`esquina`: devagar, o medido fica)."""
    n = len(P)
    zt = ao_longo(rel.terreno, P, E)
    zs = ao_longo(rel.superficie, P, E)
    tab = np.isin(via, list(PONTES))
    # O tabuleiro comeca onde a estrutura sai do chao (MDS acima do MDT), as vezes antes da via 'bridge' do OSM.
    estrutura = zs - zt > 2.0
    for wid in PONTES:
        k = corrida(via == wid)
        for ponta, passo in ((k[0], -1), (k[-1], 1)):
            q = (ponta + passo) % n
            for _ in range(40):
                if not estrutura[q]:
                    break
                tab[q] = True
                via[q] = wid
                q = (q + passo) % n
    z = zt.copy()
    idx = np.arange(n)
    z[tab] = np.interp(idx[tab], np.r_[idx[~tab] - n, idx[~tab], idx[~tab] + n], np.r_[z[~tab], z[~tab], z[~tab]])
    z = gaussian_filter1d(z, 6 / DS, mode='wrap')
    info = {}
    for wid, nome in PONTES.items():
        k = corrida(via == wid)
        sk = s_continuo(s, k, L)
        t = sk - sk[0]
        zm = np.where(np.isfinite(zs[k]), zs[k], zt[k])
        medido = np.isfinite(zs[k]) & (zs[k] - zt[k] > .5)
        # A cota das cabeceiras: a do chao onde a ponte encosta nele.
        medido[[0, -1]] = True
        zm[[0, -1]] = z[[k[0], k[-1]]]
        cfg = GREIDE[nome]
        if cfg['forma'] == 'parabola':
            c2, c1, c0 = np.polyfit(t[medido], zm[medido], 2)
            zk = c0 + c1 * t + c2 * t ** 2
            residuo = float(np.std(zm[medido] - zk[medido]))
            # A parabola passa perto das cabeceiras; o que falta ate elas se distribui em 60 m.
            for j in (0, len(k) - 1):
                erro = zm[j] - zk[j]
                zk = zk + erro * np.clip(1 - np.abs(t - t[j]) / 60, 0, 1)
            info[nome] = {'forma': 'parabola nos pontos medidos', 'topo_m': round(float(zk.max()), 2),
                          'topo_em_m': round(float(t[np.argmax(zk)]), 1), 'pontos': int(medido.sum()), 'residuo_m': round(residuo, 2)}
        else:
            # Sobre terra o medido (suavizado); sobre o mar uma Hermite cubica entre as margens com as rampas medidas
            # nos 60 m de cada lado e, se dado, o topo publicado (vao de navegacao).
            ok = np.flatnonzero(medido[1:-1]) + 1
            ilha, cont = ok[ok < len(k) / 2], ok[ok > len(k) / 2]
            a, b = int(ilha[-1]), int(cont[0])
            zl = zm.copy()
            zl[~medido] = np.interp(t[~medido], t[medido], zm[medido])
            zl = gaussian_filter1d(zl, 4 / DS, mode='nearest')
            ra = np.polyfit(t[ilha[-30:]], zm[ilha[-30:]], 1)[0]
            rb = np.polyfit(t[cont[:30]], zm[cont[:30]], 1)[0]
            vao = t[b] - t[a]
            u = (t[a:b + 1] - t[a]) / vao
            h00, h10, h01, h11 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
            meio = h00 * zl[a] + h10 * ra * vao + h01 * zl[b] + h11 * rb * vao
            if cfg.get('topo') and cfg.get('topo_lonlat'):
                # O topo no vao de navegacao (OpenSeaMap): duas Hermite, das margens (com as rampas medidas) ao topo, nivelado.
                lo_, la_ = cfg['topo_lonlat']
                X_, Y_ = Transformer.from_crs(4326, CIRCUITOS[NOME]['epsg'], always_xy=True).transform(lo_, la_)
                jn = int(np.argmin(np.hypot(P[k, 0] - (X_ - rel.o[0]), P[k, 1] - (Y_ - rel.o[1]))))
                uc = float(np.clip((t[jn] - t[a]) / vao, .2, .8))
                meio = np.empty_like(u)
                for lado_, (u0, u1, z0, z1, m0, m1) in enumerate(((0.0, uc, zl[a], cfg['topo'], ra * vao, 0.0), (uc, 1.0, cfg['topo'], zl[b], 0.0, rb * vao))):
                    sel = (u <= uc) if lado_ == 0 else (u > uc)
                    w = (u[sel] - u0) / (u1 - u0)
                    g00, g10, g01, g11 = 2 * w ** 3 - 3 * w ** 2 + 1, w ** 3 - 2 * w ** 2 + w, -2 * w ** 3 + 3 * w ** 2, w ** 3 - w ** 2
                    # Tangentes limitadas (Fritsch-Carlson): o greide sobe ou desce sem passar do topo.
                    d_ = z1 - z0
                    t0_ = float(np.clip(m0 * (u1 - u0), min(0, 3 * d_), max(0, 3 * d_)))
                    t1_ = float(np.clip(m1 * (u1 - u0), min(0, 3 * d_), max(0, 3 * d_)))
                    meio[sel] = g00 * z0 + g10 * t0_ + g01 * z1 + g11 * t1_
            elif cfg.get('topo'):
                # A corcova acima da reta entre as margens, escalada para o topo publicado (sobe ou desce).
                reta = zl[a] + (zl[b] - zl[a]) * u
                corcova = meio - reta
                pico = int(np.argmax(corcova))
                if corcova[pico] > .1:
                    meio = reta + corcova * (cfg['topo'] - reta[pico]) / corcova[pico]
            zk = zl.copy()
            zk[a:b + 1] = meio
            zk = gaussian_filter1d(zk, 6 / DS, mode='nearest')
            zk[[0, -1]] = zm[[0, -1]]
            info[nome] = {'forma': 'medido em terra + Hermite sobre o mar', 'topo_m': round(float(zk.max()), 2),
                          'margens_m': [round(float(zl[a]), 2), round(float(zl[b]), 2)],
                          'rampas_pct': [round(100 * ra, 2), round(100 * rb, 2)], 'vao_sem_medida_m': round(float(vao), 1)}
        z[k] = zk
    # Rampa maxima (corte e aterro como gerar_chapada): nas pontes so alisa as emendas com as cabeceiras.
    limite = RAMPA_MAX * DS
    corte, aterro = z.copy(), z.copy()
    for _ in range(2):
        for i in list(range(n)) + list(range(n - 1, -1, -1)):
            for j in (i - 1, (i + 1) % n):
                corte[i] = min(corte[i], corte[j] + limite)
                aterro[i] = max(aterro[i], aterro[j] - limite)
    z = (corte + aterro) / 2
    z = gaussian_filter1d(z, 3 / DS, mode='wrap')
    # Sob as copas, so a forma suave do chao medido (COPA_M): trechos de COPA_MIN_M ou mais, emendando os buracos de menos
    # de 20 m entre eles (um poste, um vao entre duas arvores).
    with np.errstate(invalid='ignore'):
        copa = (zs - zt > COPA_M) & ~tab
    emenda = int(20 / DS) + 1
    copa = minimum_filter1d(maximum_filter1d(copa.astype(float), emenda, mode='wrap'), emenda, mode='wrap') > 0
    copa &= ~tab
    if esquina is not None:
        copa &= ~esquina
    for t0, t1 in trechos_de(copa, s, L):
        if t1 - t0 < COPA_MIN_M:
            copa[(s >= t0) & (s < t1)] = False
    antes = z.copy()
    z = gp.curva_vertical_minima(z, DS, np.where(copa, RAIO_COPA_M, np.inf), rampa=RAMPA_MAX)
    print(f'greide das pontes: {json.dumps(info, ensure_ascii=False)}')
    print(f'sob as copas (raio vertical minimo {RAIO_COPA_M:.0f} m): '
          f'{[(round(t0), round(t1)) for t0, t1 in trechos_de(copa, s, L)]}, perfil mudou ate {np.abs(z - antes).max():.2f} m')
    return z, zt, tab, info


def larguras_meiofio(pasta, origem, P, E):
    """Largura e centro do leito entre os meios-fios do GeoFloripa (2020), por transectos de 2 em 2 m: o meio-fio mais
    perto de cada lado. Onde falta um lado (esquinas, acessos) fica sem medida (vale a largura da via no OSM)."""
    from shapely.geometry import LineString, shape
    from shapely import STRtree
    linhas = []
    for f in json.loads((pasta / 'geofloripa_meiofio.geojson').read_text(encoding='utf-8'))['features']:
        g = shape(f['geometry'])
        for parte in (g.geoms if g.geom_type.startswith('Multi') else [g]):
            linhas.append(LineString(np.array(parte.coords)[:, :2] - origem))
    arv = STRtree(linhas)
    n = len(P)
    esq, dir_ = np.full(n, np.nan), np.full(n, np.nan)
    for i in range(n):
        tr = LineString([P[i] - E[i] * 14, P[i] + E[i] * 14])
        for j in arv.query(tr, predicate='intersects'):
            x = tr.intersection(linhas[j])
            for p in ([x] if x.geom_type == 'Point' else list(getattr(x, 'geoms', []))):
                if p.geom_type != 'Point':
                    continue
                d = (p.x - P[i, 0]) * E[i, 0] + (p.y - P[i, 1]) * E[i, 1]
                if d > 1.2:
                    esq[i] = d if np.isnan(esq[i]) else min(esq[i], d)
                elif d < -1.2:
                    dir_[i] = d if np.isnan(dir_[i]) else max(dir_[i], d)
    ambos = np.isfinite(esq) & np.isfinite(dir_) & ((esq - dir_) > 5) & ((esq - dir_) < 26)
    largura = np.where(ambos, esq - dir_, np.nan)
    centro = np.where(ambos, (esq + dir_) / 2, np.nan)
    print(f'meios-fios: leito medido em {ambos.mean():.0%} das estacoes, largura mediana {np.nanmedian(largura):.1f} m')
    return largura, centro, ambos


def main():
    c = CIRCUITOS[NOME]
    pasta = pasta_fontes(NOME)
    epsg = c['epsg']
    P, s, L, via, larg_osm, ORIGEM, P0, arcos = eixo(c, pasta, epsg)
    # Estacoes das esquinas abertas (e 12 m de cada lado): ali nao vale o leito entre os meios-fios da rua.
    esquina = np.zeros(len(P), bool)
    for arco in arcos:
        esquina |= cKDTree(arco).query(P)[0] < 4.0
    esquina = maximum_filter1d_wrap(esquina.astype(float), 13) > 0
    rel = Relevo(pasta, epsg, ORIGEM)
    dem = rel.terreno
    # --- Leito entre os meios-fios: o eixo vai para o meio dele (ate 3,5 m) e a largura de corrida e a dele, com o
    # minimo de corrida; onde nao ha medida (esquinas, acessos) vale a da via no OSM.
    T, E = gp.quadro(P)
    lm, cm, ok = larguras_meiofio(pasta, ORIGEM, P, E)
    ok = ok & ~esquina
    idx = np.arange(len(P))
    desl = np.interp(idx, np.r_[idx[ok] - len(P), idx[ok], idx[ok] + len(P)], np.r_[cm[ok], cm[ok], cm[ok]])
    desl = gaussian_filter1d(np.clip(desl, -3.5, 3.5), 12 / DS, mode='wrap')
    antigo = P + E * desl[:, None]
    P, s, L = reamostrar_fechado(antigo)
    k = cKDTree(antigo).query(P)[1]
    via, larg_osm, lm, ok, esquina = via[k], larg_osm[k], lm[k], ok[k], esquina[k]
    n = len(P)
    T, E = gp.quadro(P)
    kappa = gp.curvatura(P)
    raio = 1 / np.maximum(np.abs(kappa), 1e-6)
    medida = np.where(ok, lm, larg_osm)
    for e in ESQUINAS:
        medida = np.where(esquina, e['largura'], medida)
    medida = np.array([np.median(np.take(medida, np.arange(i - 10, i + 11), mode='wrap')) for i in range(n)])
    largura = np.clip(medida, LARG_MIN, LARG_MAX)
    for w, lg in LARG_VIA.items():
        largura = np.where(via == w, np.maximum(largura, lg), largura)
    # Na Hercilio Luz o leito e o vao entre as trelicas (9,2 m publicados): os meios-fios dela pegam as calcadas.
    for w, lg in LARG_FIXA.items():
        largura = np.where(via == w, lg, largura)
    largura = gaussian_filter1d(largura, 10 / DS, mode='wrap')
    print(f'eixo no meio do leito: deslocamento medio {np.abs(desl).mean():.2f} m (max {np.abs(desl).max():.2f}); '
          f'largura {largura.min():.1f} a {largura.max():.1f} m (leito medido mediano {np.nanmedian(lm):.1f} m)')
    if '--planta' in sys.argv:
        planta(pasta, P, P0, ORIGEM, epsg, raio)
    z, z_dem, tab, greide = perfil(P, E, s, L, via, rel, esquina)
    seg = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
    grade = (np.roll(z, -1) - np.roll(z, 1)) / (seg + np.roll(seg, 1))
    print(f'perfil {z.min():.1f} a {z.max():.1f} m, rampa {100 * grade.min():.1f}% a {100 * grade.max():.1f}%; '
          f'pontes: {[(PONTES[w], round(float(s[corrida(via == w)[0]])), round(float(s[corrida(via == w)[-1]]))) for w in PONTES]}')
    if '--perfil' in sys.argv:
        for i in range(0, n, 25):
            print(f'  s={s[i]:6.0f} z={z[i]:6.1f} chao={z_dem[i]:7.1f} larg={largura[i]:5.1f} leito={lm[i]:5.1f} raio={min(raio[i], 999):5.0f} via={via[i]}')
    np.savez(pasta / 'eixo_floripa.npz', P=P, via=via, larg=largura, origem=ORIGEM, P0=P0, z=z)
    if '--so-perfil' in sys.argv:
        return

    # --- Curvas, trechos, caimento e zebras (como gerar_chapada). Nas pontes o tabuleiro tem so o abaulamento.
    cv = gp.curvas(kappa, s, L)
    intens = np.clip((300 - raio) / 250, 0, 1)
    bank = -np.sign(kappa) * (.01 + .015 * intens)
    bank = np.where(tab, -np.sign(kappa) * .006, bank)
    bank = gaussian_filter1d(bank, 10 / DS, mode='wrap')
    zebra_d, zebra_e = np.zeros(n), np.zeros(n)
    for cc in cv:
        if cc['raio_min'] > 120:
            continue
        idx = np.arange(cc['ini'], cc['fim'] + 1) if cc['fim'] >= cc['ini'] else np.r_[cc['ini']:n, 0:cc['fim'] + 1]
        if tab[idx].any():
            continue
        pico = abs(kappa[cc['apice']])
        dentro = [i for i in idx if abs(kappa[i]) > .7 * pico]
        a = int(np.where(idx == cc['apice'])[0][0])
        saida = list(idx[a:]) + [(idx[-1] + q) % n for q in range(1, 6)]
        (zebra_e if cc['lado'] > 0 else zebra_d)[dentro] = 1
        (zebra_d if cc['lado'] > 0 else zebra_e)[[i for i in saida if abs(kappa[i]) < .8 * pico]] = 1
    print(f'{len(cv)} curvas:')
    for cc in cv:
        print(f'  s={s[cc["ini"]]:7.1f}  {"esq" if cc["lado"] > 0 else "dir"}  raio min {cc["raio_min"]:6.1f} m  '
              f'giro {cc["giro_graus"]:5.1f}  via {via[cc["apice"]]}')
    trechos = trechos_nomeados(s, via, L)

    # --- Superficie da pista (para o pit e o terreno): estacao mais proxima, lateral e altura do plano.
    kd = cKDTree(P)

    def superficie(q):
        k = kd.query(q)[1]
        dd = q - P[k]
        lat = np.sum(dd * E[k], axis=1)
        along = np.sum(dd * T[k], axis=1)
        return k, (s[k] + along) % L, lat, z[k] + grade[k] * along + bank[k] * lat

    # --- Boxes: faixa a direita da Av. Paulo Fontes, diante da Rodoviaria Rita Maria.
    reta = corrida(np.isin(via, VIAS_PAULO_FONTES))
    reta_s = (float(s[reta[0]]), float(s[reta[-1]]))
    pit = pit_direita(dict(PIT), reta_s, P, z, E, T, bank, largura, s, L, superficie)

    # --- Muros de concreto com alambrado dos dois lados; a direita abrem para o pit. Folga do asfalto a face
    # do muro: 0,6 m nas ruas (a calcada vira area de escape nas curvas fechadas, por fora) e 0,35 m nas pontes.
    folga = {-1: np.full(n, .6), 1: np.full(n, .6)}
    for lado in (-1, 1):
        fora_da_curva = (np.sign(kappa) == -lado)
        extra = 2.4 * np.clip((45 - raio) / 30, 0, 1) * fora_da_curva
        folga[lado] = np.where(tab, .35, .6 + extra)
        folga[lado] = gaussian_filter1d(maximum_filter1d_wrap(folga[lado], 9), 6 / DS, mode='wrap')
    a_pit, b_pit = (pit['entry_main_s'] - 25) % L, (pit['exit_main_s'] + 25) % L
    tem_d = ~((s >= a_pit) & (s <= b_pit)) if a_pit < b_pit else ~((s >= a_pit) | (s <= b_pit))
    rails = {'-1': trechos_de(tem_d, s, L), '1': [[0.0, L]]}

    # --- Terreno: relevo em terra colado ao plano da pista junto dela (menos sob as pontes), o mar abaixo de 0.
    todos = np.vstack([P, np.array(pit['xy'])])
    x0 = math.floor((todos[:, 0].min() - MARGEM) / PASSO) * PASSO
    x1 = todos[:, 0].max() + MARGEM
    y0 = math.floor((todos[:, 1].min() - MARGEM) / PASSO) * PASSO
    y1 = todos[:, 1].max() + MARGEM
    nx, ny = int((x1 - x0) / PASSO) + 1, int((y1 - y0) / PASSO) + 1
    gx, gy = x0 + np.arange(nx) * PASSO, y0 + np.arange(ny) * PASSO
    XX, YY = np.meshgrid(gx, gy)
    q = np.column_stack([XX.ravel(), YY.ravel()])
    zt = dem(q[:, 0], q[:, 1], ordem=1)
    agua, fundo = mar_e_fundo(pasta, ORIGEM, rel, q, zt, (ny, nx))
    # Terra: nunca abaixo de 0,9 m (o aterro e o cais da Beira-Mar); mar: o fundo da batimetria.
    zt = np.where(agua, fundo, np.maximum(zt, .9))
    k, _, lat, road = superficie(q)
    fora = np.abs(lat) - largura[k] / 2
    # Sob as pontes (onde o tabuleiro passa mais de 3 m acima do chao) o terreno fica o medido; nas cabeceiras, colado.
    sob_tabuleiro = tab[k] & (road - zt > 3.0)
    peso = np.clip((24 - fora) / 16, 0, 1) * ~sob_tabuleiro * ~agua
    zt = zt * (1 - peso) + (road - .06) * peso
    # Sob as pontes e ao lado delas o chao fica pelo menos 2,5 m abaixo do tabuleiro (vigas e pilares).
    perto_tab = sob_tabuleiro & (fora < 12)
    zt = np.where(perto_tab, np.minimum(zt, road - 2.5), zt)
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
    ppeso = np.clip((26 - pout) / 16, 0, 1) * (dp < 60) * ~ponta
    pz = np.array(pit['z_lane'])
    usa = (ppeso > 0) & ((pout < fora) | (ppeso > peso))
    zt = np.where(usa, zt * (1 - ppeso) + (pz[ip] - .06) * ppeso, zt)
    terrain = {'x0': float(x0), 'y0': float(y0), 'step': PASSO, 'nx': nx, 'ny': ny, 'z': np.round(zt, 2).tolist()}
    print(f'terreno {nx}x{ny} ({nx * ny} vertices), {agua.mean():.0%} de mar')

    # --- Cenario: cobertura, edificacoes reais, marcos, pontes, horizonte.
    gp.PASSO = PASSO
    # Arquibancadas (track-clearance.js standLayout: blocos de 28 m a partir de `antes_da_chegada` m antes da linha).
    arquibancadas = [{'antes_da_chegada': round(L - a['s'], 1), 'blocos': a['blocos'], 'lado': a['lado'], 'recuo': a['recuo']} for a in ARQUIBANCADAS]
    scenery = gp.cenario(NOME, pasta, epsg, np.r_[ORIGEM, 0.0], 1.0, gx, gy, P, largura, pit, s, L, T, E, {'arquibancadas': arquibancadas})
    classes = np.array(list(scenery['cover']['classes'])).reshape(ny, nx)
    classes[agua.reshape(ny, nx)] = '6'
    classes[(~agua.reshape(ny, nx)) & (classes == '6')] = '4'
    scenery['cover']['classes'] = ''.join(classes.ravel())
    scenery['buildings'], scenery['skyline'] = edificios(pasta, epsg, ORIGEM, P, largura, folga, tab, z, pit, gx, gy, agua.reshape(ny, nx), rel, s, E,
                                                         np.round(zt, 2).reshape(ny, nx))
    scenery['landmarks'] = marcos(pasta, epsg, ORIGEM, dem)
    # De onde a praca da cabeceira se ve da volta (track-surface.js landmarkView: nenhuma placa na frente do monumento).
    for m in scenery['landmarks']:
        if m['kind'] == 'monumento_hercilio_luz':
            k = int(np.argmin(np.hypot(P[:, 0] - m['x'], P[:, 1] - m['y'])))
            lat = (m['x'] - P[k, 0]) * E[k, 0] + (m['y'] - P[k, 1]) * E[k, 1]
            m['lap'] = {'s': round(float(s[k]), 1), 'side': 1 if lat > 0 else -1, 'd': round(float(abs(lat)), 1),
                        'edge_d': round(float(abs(lat) - largura[k] / 2), 1)}
    scenery['bridges'] = pontes_cena(P, s, L, via, z, largura, osm_local(pasta, ORIGEM, epsg), dem, ORIGEM)
    gp.solo(NOME, pasta, epsg, np.r_[ORIGEM, 0.0], 1.0, gx, gy)
    if '--sem-aneis' not in sys.argv:
        scenery['far'] = aneis_floripa(pasta, epsg, ORIGEM, '--longe' in sys.argv)

    frenagens = []
    for cc in cv:
        if cc['raio_min'] < 160:
            a = s[cc['ini']]
            frenagens.append([round(float((a - 120) % L), 1), round(float((a + 25) % L), 1)])
    colunas = ['s_xy_m', 'x_east_m', 'y_north_m', 'z_local_m', 'width_m', 'crossfall_left', 'grade', 'tx', 'ty',
               'left_x', 'left_y', 'fit_rmse_m', 'ground_points', 'kerb_right', 'kerb_left', 'wall_right_m', 'wall_left_m']
    rmse = np.where(tab, 0.0, np.abs(z_dem - z))
    samples = np.column_stack([s, P, z, largura, bank, grade, T, E, rmse, np.zeros(n), zebra_d, zebra_e, folga[-1], folga[1]])
    comp_3d = float(np.sqrt(np.sum((np.roll(P, -1, 0) - P) ** 2, axis=1) + (np.roll(z, -1) - z) ** 2).sum())
    fontes = json.loads((pasta / 'proveniencia.json').read_text(encoding='utf-8'))
    decks = [[round(float(s[corrida(via == w)[0]]), 1), round(float(s[corrida(via == w)[-1]]) + DS, 1)] for w in PONTES]
    meta = {
        'id': NOME, 'name': c['nome'], 'nominal_m': round(comp_3d), 'direction': c['sentido'],
        'reconstructed_xy_m': L, 'reconstructed_3d_m': comp_3d,
        'measured_centreline_m': L, 'osm_centreline_m': L,
        'horizontal_scale_to_nominal': 1.0, 'difference_nominal_pct': 100 * (comp_3d / round(comp_3d) - 1),
        'elevation_min_m': float(z.min()), 'elevation_max_m': float(z.max()),
        'elevation_range_m': float(np.ptp(z)), 'grade_min_pct': float(100 * grade.min()),
        'grade_max_pct': float(100 * grade.max()), 'width_min_m': float(largura.min()),
        'width_max_m': float(largura.max()), 'kerb_m': float((zebra_d.sum() + zebra_e.sum()) * DS),
        'pit_lane_m': float(pit['length_m']), 'samples': n,
        'origin_utm': [float(ORIGEM[0]), float(ORIGEM[1]), 0.0], 'epsg': epsg, 'altitude_base_m': 0,
        'sections': trechos, 'rails': rails, 'brake_zones': frenagens,
        # Circuito de rua: muros de concreto com alambrado (track-surface.js), zebras pintadas no asfalto.
        'barrier': 'street', 'decks': decks, 'sea_level_m': 0.0,
        'kerb_colors': ['#c8201e', '#f1efe8'], 'surface_zones': [],
        'city_angle': gp.angulo_cidade(c, np.r_[ORIGEM, 0.0], epsg),
        'horizon': 'floripa', 'imaginary': True, 'street': True,
        'haze_base_m': 0.0,
        'sources': fontes,
        'centreline': 'Vias do OpenStreetMap em sequência (gerar_floripa.py), esquinas arredondadas e rumo suavizado.',
        'caveat': ('Circuito de rua imaginário: as ruas, as pontes, o relevo (ANADEM), o mar e os prédios (OSM e Microsoft) '
                   'são os reais de Florianópolis; larguras mínimas de corrida, greide das pontes, muros e boxes diante da '
                   'rodoviária são desenho de jogo.'),
    }
    pit = {k_: v for k_, v in pit.items() if k_ not in ('xy', 'z_lane', 'lx_ly', 'lo_arr', 'hi_arr')}
    saida = {'meta': meta, 'columns': colunas, 'samples': np.round(samples, 5).tolist(), 'pit': pit,
             'terrain': terrain, 'scenery': scenery}
    # A volta sem a cidade (a base de gerar_cidade_floripa.py, que grava dados/pista_floripa.json no fim).
    destino = pasta / f'pista_{NOME}_base.json'
    destino.write_text(json.dumps(saida, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    # As edificacoes que o jogo desenharia sobre uma faixa que ele mantem livre saem pela propria regra dele.
    import subprocess
    from config import RAIZ
    # O Node portatil da pasta apps (acima do repositorio, tambem de dentro de uma worktree), senao o do PATH.
    node = next((q / 'apps' / 'node-v22.23.2-win-x64' / 'node.exe' for q in RAIZ.parents if (q / 'apps' / 'node-v22.23.2-win-x64' / 'node.exe').exists()), 'node')
    subprocess.run([str(node), str(Path(__file__).with_name('podar_edificios.mjs')), str(destino)], check=True)
    print(f'{destino.name}: {destino.stat().st_size / 1e6:.2f} MB')
    resumo = {k_: meta[k_] for k_ in ('reconstructed_xy_m', 'reconstructed_3d_m', 'elevation_min_m', 'elevation_max_m',
                                      'elevation_range_m', 'grade_min_pct', 'grade_max_pct', 'width_min_m', 'width_max_m',
                                      'kerb_m', 'pit_lane_m', 'decks')}
    print(json.dumps(resumo, indent=1, ensure_ascii=False))
    # A cidade de verdade em volta (pedido da equipe, 15/10/2026): ruas, calcadas, bloqueios, predios nas pegadas reais.
    import gerar_cidade_floripa
    gerar_cidade_floripa.main()


# Marcos com modelo proprio no jogo (floripa-landmarks.js): vias/relacoes do OSM. Ficam fora das edificacoes genericas.
MARCOS = {
    'rodoviaria': ('way', 35165963, 'Terminal Rodoviário Rita Maria'),
    'ticen': ('way', 43719878, 'Terminal de Integração do Centro (TICEN)'),
    'mercado_publico': ('relation', 2995576, 'Mercado Público'),
    'alfandega': ('way', 156314044, 'Casa da Alfândega'),
    'catedral': ('way', 131337293, 'Catedral Metropolitana'),
    'forte_santana': ('way', 663542203, 'Forte de Santana'),
    'parque_da_luz': ('way', 131353997, 'Parque da Luz'),
}
# Antenas do Morro da Cruz (OSM man_made=tower, tower:type=communication) e o pico (285 m).
MORRO_DA_CRUZ = {'pico': (-27.59012, -48.53262, 285.0),
                 'torres': [(-27.58907, -48.53386), (-27.59011, -48.53323), (-27.59036, -48.53345), (-27.58715, -48.53371),
                            (-27.58802, -48.53377), (-27.58822, -48.53379), (-27.59141, -48.53362), (-27.59212, -48.53360),
                            (-27.58958, -48.53319), (-27.58903, -48.53343), (-27.58773, -48.53380), (-27.58735, -48.53385)]}
# A praca na cabeceira insular da Hercilio Luz (pedido da equipe, 24/10/2026: "faltou a estatua e o mirantezinho"): o
# Monumento a Hercilio Luz (OSM no 1763818745, historic=memorial, memorial=statue; inscricao "A Hercilio Luz / O povo de
# Santa Catharina / 29-05-1860 - 20-10-1924") no meio do jardim em leque, e o mirante de pergola branca em arco na beira da
# praca, do lado da baia (OSM via 164776332, area de estar; tourism=viewpoint no 1763818766). O centro e o do anel de
# caminho do OSM em volta do monumento (via 164776331; o no da estatua fica a 0,7 m dele), onde o jogo desenha o jardim
# em leque, que vem do OSM; na ortofoto 2016 do GeoFloripa o pedestal fica ~4 m a sudoeste (o desenho da praca no OSM e
# deslocado, o resto da cidade do jogo segue o OSM). Da ortofoto, o giro e o arco: o pedestal quadrado com a frente para
# nordeste (para a Alameda e o Parque da Luz, de onde se chega), a pergola contornando o monumento entre 13,2 e 16,9 m
# dele. Os dois sao abertos: se anda em volta deles e sob a pergola (o jogo poe os solidos).
PRACA_CABECEIRA = {'centro': (-27.5936329, -48.5616387), 'frente_graus': 56.3, 'pedestal_m': 3.6,
                   'pergola_raios_m': (13.2, 16.9), 'pergola_graus': (202.5, 257.0)}


def poligono_osm(o, tipo, oid):
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    if tipo == 'way':
        w = next(v for v in o['vias'] if v['id'] == oid)
        return Polygon(linha_via(o, w)).buffer(0)
    r = next(v for v in o['rel'] if v['id'] == oid)
    vias = {v['id']: v for v in o['vias']}
    partes = [Polygon(linha_via(o, vias[m['ref']])).buffer(0) for m in r['members']
              if m['type'] == 'way' and m.get('role') == 'outer' and m['ref'] in vias]
    return unary_union(partes)


def retangulo(p):
    """Retangulo orientado minimo: centro, lados (w ao longo do rumo, d), rumo."""
    r = p.minimum_rotated_rectangle
    q = np.array(r.exterior.coords)[:4]
    a, b = q[1] - q[0], q[2] - q[1]
    return [round(float(r.centroid.x), 2), round(float(r.centroid.y), 2), round(float(np.linalg.norm(a)), 2),
            round(float(np.linalg.norm(b)), 2), round(math.atan2(a[1], a[0]), 4)]


def marcos(pasta, epsg, origem, dem):
    o = osm_local(pasta, origem, epsg)
    out = []
    for chave, (tipo, oid, nome) in MARCOS.items():
        p = poligono_osm(o, tipo, oid)
        anel = np.array((max(p.geoms, key=lambda g: g.area) if p.geom_type == 'MultiPolygon' else p).exterior.coords)[:, :2]
        x, y, w, d, rumo = retangulo(p)
        out.append({'kind': chave, 'name': nome, 'x': x, 'y': y, 'w': w, 'd': d, 'heading': rumo,
                    'ground': round(float(dem(np.array([x]), np.array([y]))[0]), 2),
                    'outline': np.round(anel, 2).tolist()})
    para = Transformer.from_crs(4326, epsg, always_xy=True)
    lat, lon, ele = MORRO_DA_CRUZ['pico']
    px, py = para.transform(lon, lat)
    torres = []
    for k, (la, lo) in enumerate(MORRO_DA_CRUZ['torres']):
        tx, ty = para.transform(lo, la)
        # So a posicao: o morro fica fora do relevo baixado (o jogo assenta as antenas nos aneis de relevo, floripa_medio).
        torres.append([round(tx - origem[0], 1), round(ty - origem[1], 1)])
    out.append({'kind': 'morro_da_cruz', 'name': 'Morro da Cruz', 'x': round(px - origem[0], 1), 'y': round(py - origem[1], 1),
                'ele': ele, 'towers': torres})
    # A praca da cabeceira: o contorno e o que a cidade deixa livre (quiosques, barracas, arvores, moveis): o redondo do
    # jardim em volta do pedestal (6,5 m) e a faixa do arco da pergola com a frente dela; abertos, sem buraco na zona de
    # passeio (o pedestal em si: w x d).
    c = PRACA_CABECEIRA
    mx, my = para.transform(c['centro'][1], c['centro'][0])
    mx, my = mx - origem[0], my - origem[1]
    chao = round(float(dem(np.array([mx]), np.array([my]))[0]), 2)
    frente = math.radians(c['frente_graus'])
    canto = [(mx + 6.5 * math.cos(frente + k * math.pi / 4), my + 6.5 * math.sin(frente + k * math.pi / 4)) for k in range(9)]
    out.append({'kind': 'monumento_hercilio_luz', 'name': 'Monumento a Hercílio Luz', 'x': round(mx, 2), 'y': round(my, 2),
                'w': c['pedestal_m'], 'd': c['pedestal_m'], 'heading': round(frente, 4), 'ground': chao, 'open': True,
                'inscription': ['A HERCÍLIO LUZ', 'O POVO DE SANTA CATHARINA', '29-05-1860 · 20-10-1924'],
                'outline': np.round(canto, 2).tolist()})
    r0, r1 = c['pergola_raios_m']
    a0, a1 = (math.radians(g) for g in c['pergola_graus'])
    arco = np.linspace(a0, a1, 24)
    anel = ([(mx + math.cos(a) * (r0 - 2.5), my + math.sin(a) * (r0 - 2.5)) for a in arco]
            + [(mx + math.cos(a) * (r1 + .8), my + math.sin(a) * (r1 + .8)) for a in arco[::-1]])
    out.append({'kind': 'mirante_cabeceira', 'name': 'Mirante da cabeceira da Ponte Hercílio Luz', 'x': round(mx, 2),
                'y': round(my, 2), 'radii': [r0, r1], 'angles': [round(a0, 4), round(a1, 4)], 'ground': chao, 'open': True,
                'outline': np.round(anel + anel[:1], 2).tolist()})
    print(f'marcos: {", ".join(m["kind"] for m in out)}')
    return out


def mar_e_fundo(pasta, origem, rel, q, zt, forma):
    """Mar: no MDT de 1 m a agua e 0 (dentro da caixa dele); fora, pela linha de costa do OSM. O fundo: a batimetria
    da Marinha em faixas (GeoFloripa: 0-2, 2-4 ... 20-30 m), o meio de cada faixa, suavizado, nunca a menos de 0,8 m
    junto da beira."""
    from shapely.geometry import shape
    import shapely
    X, Y = q[:, 0] + origem[0], q[:, 1] + origem[1]
    dentro = rel.dentro(X, Y) > .99
    agua_osm, d_osm = mar(osm_local(pasta, origem, CIRCUITOS[NOME]['epsg']), q)
    agua = np.where(dentro, zt <= .05, agua_osm)
    # Pixels soltos (um poco de 0 no meio da terra, uma laje no mar): maioria dos 8 vizinhos.
    A = agua.reshape(forma).astype(float)
    viz = sum(np.roll(np.roll(A, i, 0), j, 1) for i in (-1, 0, 1) for j in (-1, 0, 1)) / 9
    agua = (viz > .5).ravel()
    # Distancia a terra (m), pelas celulas de beira.
    W = agua.reshape(forma)
    beira = W & ~(np.roll(W, 1, 0) & np.roll(W, -1, 0) & np.roll(W, 1, 1) & np.roll(W, -1, 1))
    d = np.full(len(q), 0.0)
    if beira.any():
        d[agua] = cKDTree(q[beira.ravel()]).query(q[agua])[0]
    prof = np.full(len(q), np.nan)
    meio = {'0 - 2': 1.0, '2 - 4': 3.0, '4 - 6': 5.0, '6 - 8': 7.0, '8 - 10': 9.0, '10 - 15': 12.5, '15 - 20': 17.5, '20 - 30': 24.0}
    for f in json.loads((pasta / 'geofloripa_batimetria.geojson').read_text(encoding='utf-8'))['features']:
        g = shape(f['geometry'])
        from shapely import affinity
        g = affinity.translate(g, -origem[0], -origem[1])
        sel = agua & np.isnan(prof)
        if not sel.any():
            break
        den = shapely.contains_xy(g, q[sel, 0], q[sel, 1])
        ii = np.flatnonzero(sel)[den]
        prof[ii] = np.maximum(np.nan_to_num(prof[ii], nan=0), meio.get(f['properties']['intervalo'], 3.0))
    # Sem faixa (fora da batimetria): cresce com a distancia da beira.
    prof = np.where(np.isnan(prof), np.minimum(1.0 + d * .03, 12.0), prof)
    P2 = prof.reshape(forma)
    from compat_scipy import gaussian_filter
    P2 = gaussian_filter(P2, 4)
    prof = np.maximum(P2.ravel(), np.minimum(.8 + d * .12, 3.0))
    fundo = -prof
    print(f'mar: {agua.mean():.0%} da grade, fundo ate {prof[agua].max() if agua.any() else 0:.1f} m')
    return agua, fundo


def edificios(pasta, epsg, origem, P, largura, folga, tab, z, pit, gx, gy, agua, rel, s, E, zgrade):
    """Edificacoes do cadastro da Prefeitura (GeoFloripa, 2020), cada uma com a altura do modelo de superficie menos o do
    terreno (1 m, 2010-2012: o percentil 75 dentro da pegada). Os andares do OSM, quando mapeados, valem mais (predios
    posteriores a 2012 nao aparecem no MDS). Fora da pista e dos muros (as calcadas ficam), da faixa dos boxes e das
    garagens, dos marcos (modelo proprio) e de sob as pontes."""
    from shapely.geometry import Polygon, LineString, shape
    from shapely import STRtree, affinity
    import shapely
    o = osm_local(pasta, origem, epsg)
    n = len(P)
    meio = largura / 2 + np.maximum(folga[-1], folga[1]) + 1.6
    passo = gx[1] - gx[0]

    def chao_grade(x, y):
        # O chao da grade do terreno como o jogo o le (bilinear), para a mesma regra da faixa 'ponte' (track-clearance.js).
        fx = min(max((x - gx[0]) / passo, 0), len(gx) - 1.001)
        fy = min(max((y - gy[0]) / passo, 0), len(gy) - 1.001)
        i, j = int(fx), int(fy)
        u, v = fx - i, fy - j
        return (zgrade[j, i] * (1 - u) + zgrade[j, i + 1] * u) * (1 - v) + (zgrade[j + 1, i] * (1 - u) + zgrade[j + 1, i + 1] * u) * v
    faixa = []
    for i in range(n):
        j = (i + 1) % n
        if np.linalg.norm(P[j] - P[i]) > 5:
            continue
        # Sobre as pontes altas (mais de 6 m acima do chao) nada fica a menos de 36 m das bordas (track-clearance.js, faixa
        # 'ponte'); onde o tabuleiro corre baixo, junto das cabeceiras, 4 m.
        # (O jogo interpola a largura da faixa entre as estacoes: vale a maior das duas pontas do segmento.)
        alto = any(tab[q] and z[q] - chao_grade(P[q, 0], P[q, 1]) > 6 for q in (i, j))
        # Pontas redondas, como a distancia do jogo a cada segmento (bandClearance mede ate o ponto mais proximo dele).
        faixa.append(LineString([P[i], P[j]]).buffer(max(meio[i], meio[j]) + (36.0 if alto else 4.0 if tab[i] else 0.0)))
    pit_xy = np.array(pit['xy'])
    faixa.append(LineString(pit_xy).buffer(float(max(np.abs(np.array(pit['lo_arr'])).max(), np.array(pit['hi_arr']).max())) + 24))
    # As arquibancadas (19 degraus de 0,85 m atras do recuo, mais o telhado e uma margem) tomam o lugar do que houver ali.
    for a in ARQUIBANCADAS:
        idx = [i for i in range(n) if (s[i] - a['s']) % (s[-1] + DS) <= a['blocos'] * 28]
        # A faixa 'arquibancada' do jogo vai do patio (5,5 m) ao fundo do telhado (recuo + ~17,6 m) e guarda 12 m de margem.
        de, ate = 5.5, a['recuo'] + 17.6
        meio_ = a['lado'] * (largura[idx] / 2 + (de + ate) / 2)
        faixa.append(LineString(P[idx] + E[idx] * meio_[:, None]).buffer((ate - de) / 2 + 12.5))
    arvore = STRtree(faixa)
    marcos_p = [poligono_osm(o, t_, i_) for k_, (t_, i_, _) in MARCOS.items() if k_ != 'parque_da_luz']
    marcos_t = STRtree(marcos_p)
    # Andares do OSM pelas pegadas que contem o centro de cada edificacao do cadastro.
    andares, osm_p = [], []
    for w in o['vias']:
        t = w.get('tags', {})
        if 'building' in t and w['nodes'][0] == w['nodes'][-1] and t.get('building:levels'):
            A = linha_via(o, w)
            try:
                lv = float(t['building:levels'])
            except ValueError:
                continue
            if len(A) >= 4:
                osm_p.append(Polygon(A).buffer(0))
                andares.append(lv)
    osm_t = STRtree(osm_p)
    lista, ceu, cont = [], [], {'pista': 0, 'marco': 0, 'mar': 0, 'fora': 0, 'baixa': 0}
    xmin, xmax, ymin, ymax = gx[0] + 8, gx[-1] - 8, gy[0] + 8, gy[-1] - 8
    for f in json.loads((pasta / 'geofloripa_edificacoes.geojson').read_text(encoding='utf-8'))['features']:
        g = affinity.translate(shape(f['geometry']), -origem[0], -origem[1]).buffer(0)
        if g.is_empty or g.area < 12:
            continue
        p = max(g.geoms, key=lambda h: h.area) if g.geom_type == 'MultiPolygon' else g
        cx, cy = p.centroid.x, p.centroid.y
        fora = not (xmin < cx < xmax and ymin < cy < ymax)
        # O jogo desenha o retangulo orientado minimo da pegada: e ele que nao pode encostar na pista (um L de esquina).
        if not fora and len(arvore.query(p.minimum_rotated_rectangle, predicate='intersects')):
            cont['pista'] += 1
            continue
        if len(marcos_t.query(p.centroid, predicate='intersects')):
            cont['marco'] += 1
            continue
        i, j = int(round((cy - gy[0]) / PASSO)), int(round((cx - gx[0]) / PASSO))
        if fora:
            # Alem da grade: o horizonte da cidade (landscape.js skyline), com o chao do MDT em cada uma.
            cont['fora'] += 1
            dz = rel.superficie(np.array([cx]), np.array([cy])) - rel.terreno(np.array([cx]), np.array([cy]))
            x0_, y0_, x1_, y1_ = p.bounds
            amostra = np.column_stack([np.random.default_rng(len(ceu)).uniform(x0_, x1_, 12), np.random.default_rng(len(ceu) + 1).uniform(y0_, y1_, 12)])
            dentro_ = shapely.contains_xy(p, amostra[:, 0], amostra[:, 1])
            if dentro_.any():
                dz = rel.superficie(amostra[dentro_, 0], amostra[dentro_, 1]) - rel.terreno(amostra[dentro_, 0], amostra[dentro_, 1])
            dz = dz[np.isfinite(dz)]
            h = float(np.percentile(dz, 75)) if len(dz) else 3.4
            if h < 2.2:
                h = 3.4
            x, y, w_, d_, rumo = retangulo(p)
            chao = float(rel.terreno(np.array([x]), np.array([y]))[0])
            tipo = 'predio' if h >= 12 and p.area >= 120 else 'galpao' if p.area >= 600 else 'casa'
            ceu.append([x, y, w_, d_, rumo, round(min(h, 120.0), 2), tipo, round(chao, 2)])
            continue
        if agua[i, j]:
            cont['mar'] += 1
            continue
        # Altura: MDS - MDT nos pontos de 1,5 em 1,5 m dentro da pegada.
        x0, y0, x1, y1 = p.bounds
        xs, ys = np.meshgrid(np.arange(x0 + .75, x1, 1.5), np.arange(y0 + .75, y1, 1.5))
        den = shapely.contains_xy(p, xs, ys)
        px, py = (xs[den], ys[den]) if den.any() else (np.array([cx]), np.array([cy]))
        dz = rel.superficie(px, py) - rel.terreno(px, py)
        dz = dz[np.isfinite(dz)]
        h = float(np.percentile(dz, 75)) if len(dz) else 0.0
        fonte = 'geofloripa'
        hit = osm_t.query(p.centroid, predicate='intersects')
        if len(hit):
            h_osm = 3.1 * andares[hit[0]] + .8
            if h < .7 * h_osm:
                h, fonte = h_osm, 'geofloripa+osm'
        if h < 2.2:
            # Nao aparece no MDS de 2010-2012 (construida depois, ou um anexo baixo): uma casa de um piso.
            cont['baixa'] += 1
            h = 3.4
        h = min(h, 120.0)
        area = p.area
        x, y, w_, d_, rumo = retangulo(p)
        tipo = 'predio' if h >= 12 and area >= 120 else 'galpao' if area >= 600 else 'casa'
        lista.append([x, y, w_, d_, rumo, round(h, 2), tipo, fonte])
    print(f'edificacoes do cadastro: {len(lista)} ({sum(1 for e in lista if e[6] == "predio")} predios, '
          f'{sum(1 for e in lista if e[7].endswith("osm"))} com andares do OSM), tiradas: {cont}')
    return ({'columns': ['x', 'y', 'w', 'd', 'heading', 'h', 'kind', 'source'], 'items': lista},
            {'columns': ['x', 'y', 'w', 'd', 'heading', 'h', 'kind', 'z'], 'items': ceu})


def pontes_cena(P, s, L, via, z, largura, o, dem, origem):
    """Geometria das pontes para os modelos (floripa-bridges.js): o trecho da volta de cada uma e, para a Colombo
    Salles, a gemea Pedro Ivo Campos (OSM 35893653) ao lado, com o greide da Colombo levado a ela."""
    out = []
    for w, nome in PONTES.items():
        k = corrida(via == w)
        sk = s_continuo(s, k, L)
        item = {'kind': nome, 's0': round(float(s[k[0]]), 1), 's1': round(float(sk[-1] % L) + DS, 1),
                'length': round(float(sk[-1] - sk[0] + DS), 1), 'width': round(float(np.median(largura[k])), 2)}
        item.update({k_: v_ for k_, v_ in PONTE_FATOS.get(nome, {}).items() if k_ != 'navigation'})
        if nome == 'hercilio_luz':
            # As torres pelos vaos oficiais a partir da cabeceira continental (o inicio do tabuleiro no MDS).
            t0 = float(sk[0])
            item['towers_s'] = [round((t0 + item['continental_m']) % L, 1), round((t0 + item['continental_m'] + item['main_span_m']) % L, 1)]
            print(f'Hercilio Luz: tabuleiro de {item["length"]:.0f} m (publicado 821), torres em s={item["towers_s"]}')
        if nome == 'colombo_salles':
            la, lo = PONTE_FATOS[nome]['navigation']
            nx_, ny_ = Transformer.from_crs(4326, CIRCUITOS[NOME]['epsg'], always_xy=True).transform(lo, la)
            q_ = np.array([nx_, ny_]) - origem
            j_ = int(np.argmin(np.linalg.norm(P[k] - q_, axis=1)))
            item['navigation_s'] = round(float(s[k[j_]]), 1)
            print(f'Colombo Salles: vao de navegacao em s={item["navigation_s"]} (topo do greide em s={float(s[k[int(np.argmax(z[k]))]]):.0f})')
            gemea = next(v for v in o['vias'] if v['id'] == 35893653)
            A = linha_via(o, gemea)
            seg = np.linalg.norm(np.diff(A, axis=0), axis=1)
            sa = np.r_[0, np.cumsum(seg)]
            u = np.arange(0, sa[-1] + 1e-6, 8.0)
            G = np.column_stack([np.interp(u, sa, A[:, 0]), np.interp(u, sa, A[:, 1])])
            kk = cKDTree(P[k]).query(G)[1]
            zg = z[k][kk]
            item['twin'] = {'name': 'Ponte Pedro Ivo Campos', 'width': 14.0,
                            'points': np.round(np.column_stack([G, zg]), 2).tolist()}
        out.append(item)
    return out


def aneis_floripa(pasta, epsg, origem, baixar):
    """Os aneis de relevo e cor alem da grade (far-terrain.js), como na Chapada: a ilha, os morros, as baias e o
    continente ate 22 km. O mar (sem dado no ANADEM) fica 4 m abaixo do nivel 0, sob o plano da agua do jogo."""
    import gerar_chapada as gc
    gc.NOME, gc.ORIGEM = NOME, np.array(origem, float)
    gc.COP_TILE = CIRCUITOS[NOME]['copernicus']
    gc.ANEIS = ANEIS
    original = gc.Dem.__call__

    def com_mar(self, x, y, ordem=1):
        zz = original(self, x, y, ordem)
        return np.where((zz < -50) | (zz <= .3), -4.0, zz)
    gc.Dem.__call__ = com_mar
    try:
        far = gc.aneis(pasta, epsg, 0.0, baixar)
    finally:
        gc.Dem.__call__ = original
    return far


ANEIS = {'medio': (14.0, 40.0, 2048), 'longe': (44.0, 160.0, 1024)}
# Fatos das pontes para os modelos (provisorios ate a pesquisa).
# Hercilio Luz (pt.wikipedia; Teixeira Duarte, restauro 2019; ABCEM; SciELO): 821 m, viaduto continental de 222,5 m em
# 7 vaos e insular de 259 m em 8, vao pensil de 339,47 m; torres de 74,2 m acima do mar sobre blocos a +4,5 m; tabuleiro
# do vao a 30,86 m; leito de 9,2 m entre as trelicas e duas calcadas de 2,5 m por fora delas (15,92 m no todo); corrente
# de barras de olhal: 73,5 m na sela, ~45 m no quarto do vao (onde vira o banzo superior da trelica), ~35,5 m no meio;
# 28 pendurais; paineis de ~12,1 m; pintura cinza-claro (#BFC3C7). Colombo Salles (1975): viga de concreto protendido
# sobre pilares, 4 faixas, ~16,5 m de largura; vaos ~42 m no aterro, ~78 m sobre o mar e o vao de navegacao (~157 m) no
# meio de uma unidade de 314 m; gabarito 17,5 m. A Pedro Ivo Campos (1991), gemea ao sul, 17 m, com o miolo de aco.
PONTE_FATOS = {
    'hercilio_luz': {'total_m': 821.0, 'continental_m': 222.5, 'continental_spans': 7, 'main_span_m': 339.47, 'insular_m': 259.0,
                     'insular_spans': 8, 'tower_top_m': 74.2, 'pier_top_m': 4.5, 'deck_mid_m': 30.86, 'roadway_m': 9.2,
                     'walkway_m': 2.5, 'total_width_m': 15.92, 'chain': {'saddle_m': 73.5, 'quarter_m': 45.0, 'low_m': 35.5},
                     'hangers': 28, 'panel_m': 12.1, 'paint': '#bfc3c7'},
    'colombo_salles': {'land_span_m': 42.0, 'water_span_m': 78.0, 'main_span_m': 157.0, 'clearance_m': 17.5, 'width_m': 16.5,
                       'navigation': (-27.5977069, -48.5651542)},
}


def maximum_filter1d_wrap(v, tam):
    n = len(v)
    h = tam // 2
    ext = np.r_[v[-h:], v, v[:h]]
    return np.array([ext[i:i + tam].max() for i in range(n)])


# Arquibancadas de circuito de rua: na Av. Paulo Fontes, do lado da cidade, de frente para os boxes e a rodoviaria
# (s do comeco do primeiro bloco, numero de blocos de 28 m, lado: 1 esquerda, recuo do asfalto ate a frente).
ARQUIBANCADAS = [{'s': 1112.0, 'blocos': 5, 'lado': 1, 'recuo': 7.0}]
# Vias da Av. Paulo Fontes (sentido centro) onde corre a faixa dos boxes.
VIAS_PAULO_FONTES = [539428495, 246389311, 973189149, 973189158, 973189144, 973189145, 973189143]
# Faixa dos boxes: comeca `inicio` da reta, termina `antes_do_fim` antes dela acabar; entrada e saida (m),
# largura, garagens (s da volta relativos ao comeco da faixa) e a fonte.
PIT = {'inicio': .04, 'antes_do_fim': 6, 'entrada': 62, 'saida': 58, 'largura': 7.6, 'garagens': None,
       'fonte': 'Faixa de boxes de jogo à direita da Av. Paulo Fontes, diante da Rodoviária Rita Maria (a Ponte Hercílio '
                'Luz, onde fica a largada, não tem espaço para ela).'}
MARGEM = 420.0


def pit_direita(cfg, reta, P, z, E, T, bank, largura, s, L, superficie):
    """Faixa de servico a direita da reta (como pit_sintetico, do outro lado) e o bloco escrito ao contrario
    (das saida para a entrada, garagens a esquerda das estacoes, `reversed`), como Brasilia em montar_pit."""
    r0, r1 = reta
    if r1 < r0:
        r1 += L
    a = r0 + cfg['inicio'] * (r1 - r0)
    b = r1 - cfg['antes_do_fim']
    us = np.arange(a, b + 1e-6, DS)
    sm = us % L
    sx = np.r_[s, L]
    em = lambda col: np.interp(sm, sx, np.r_[col, col[0]])
    centro = np.column_stack([em(P[:, 0]), em(P[:, 1])])
    nrm = np.column_stack([em(E[:, 0]), em(E[:, 1])])
    nrm /= np.linalg.norm(nrm, axis=1)[:, None]
    larg = em(largura)
    off_final = larg / 2 + 4.6 + cfg['largura'] / 2
    t_ = us - a
    tot = b - a
    fe, fs = cfg['entrada'], cfg['saida']
    print(f'reta da Paulo Fontes: s de {r0:.0f} a {r1:.0f} m ({r1 - r0:.0f} m); faixa dos boxes de {a:.0f} a {b:.0f}')
    assert tot > fe + fs + 60, 'reta curta demais para a faixa dos boxes'
    blend = np.where(t_ < fe, 0.5 - 0.5 * np.cos(np.pi * np.clip(t_ / fe, 0, 1)),
                     np.where(t_ > tot - fs, 0.5 + 0.5 * np.cos(np.pi * np.clip((t_ - (tot - fs)) / fs, 0, 1)), 1.0))
    borda = larg / 2 - cfg['largura'] / 2 + .3
    off = -(borda + (off_final - borda) * blend)
    pxy = centro + nrm * off[:, None]
    pw = np.full(len(us), cfg['largura'])
    ps = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pxy, axis=0), axis=1))]
    k, _, lat, z_main = superficie(pxy)
    pz = z_main
    pbank = bank[k]
    main_s = sm.copy()
    gap = np.maximum(0, np.abs(lat) - pw / 2 - largura[k] / 2)
    lo, hi = -pw / 2, pw / 2
    par = np.flatnonzero(blend > .999)
    g0, g1 = ps[par[0]] + 10, ps[par[-1]] - 10
    abertura = float(ps[np.argmax(gap > .3)])
    muro_idx = np.flatnonzero(gap > 1.3)
    muro_trechos = [(ps[muro_idx[0]], ps[muro_idx[-1]])] if len(muro_idx) else []
    wall_nose = muro_trechos[0][0] if muro_trechos else abertura
    wall_end = muro_trechos[0][1] if muro_trechos else ps[-1] - 40
    print(f'pit {ps[-1]:.0f} m: entra em s={main_s[0]:.0f}, volta em s={main_s[-1]:.0f}; garagens {g0:.0f}-{g1:.0f} m da entrada')
    fim = float(ps[-1])
    pxy, pz, pbank, main_s, gap = pxy[::-1], pz[::-1], -pbank[::-1], main_s[::-1], gap[::-1]
    lo, hi = -hi[::-1], -lo[::-1]
    g0, g1 = fim - g1, fim - g0
    abertura, wall_nose, wall_end = fim - abertura, fim - wall_nose, fim - wall_end
    muro_trechos = [(fim - b_, fim - a_) for a_, b_ in reversed(muro_trechos)]
    return gp.completar_pit(pxy, lo, hi, pz, pbank, main_s, gap, (g0, g1), superficie, cfg['fonte'], abertura,
                            wall_nose, wall_end, L, muro_trechos, reverso=True)


def trechos_nomeados(s, via, L):
    """Nomes dos trechos da volta pelas ruas (o painel mostra onde o carro esta)."""
    nomes = {687688904: 'Ponte Hercílio Luz', 37737976: 'Alameda Adolfo Konder', 985673477: 'Rua Hoepcke',
             37739493: 'Rua Claudino Bento da Silva', 539428495: 'Av. Paulo Fontes · Rodoviária', 201386746: 'Rua Pedro Bittencourt',
             35893655: 'Ponte Colombo Salles', 37736684: 'Estreito · Via Expressa', 264394224: 'Rua 14 de Julho',
             109298492: 'Av. Gov. Ivo Silveira'}
    out = [[0.0, 'Ponte Hercílio Luz']]
    for w, nome in nomes.items():
        k = corrida(via == w)
        if w == 687688904:
            continue
        out.append([round(float(s[k[0]]), 1), nome])
    return sorted(out)


def osm_local(pasta, origem, epsg, _cache={}):
    """Nos do OSM em coordenadas locais e as vias (lido uma vez)."""
    if 'osm' not in _cache:
        osm = json.loads((pasta / 'osm.json').read_text(encoding='utf-8'))
        nos = [e for e in osm['elements'] if e['type'] == 'node']
        ids = np.array([e['id'] for e in nos])
        x, y = Transformer.from_crs(4326, epsg, always_xy=True).transform(np.array([e['lon'] for e in nos]), np.array([e['lat'] for e in nos]))
        xy = np.column_stack([x, y]) - origem
        _cache['osm'] = {'pos': dict(zip(ids.tolist(), map(tuple, xy))), 'vias': [e for e in osm['elements'] if e['type'] == 'way'],
                         'rel': [e for e in osm['elements'] if e['type'] == 'relation']}
    return _cache['osm']


def linha_via(o, w):
    return np.array([o['pos'][n] for n in w['nodes'] if n in o['pos']])


def mar(o, q):
    """Mar ou terra em cada ponto pela linha de costa do OSM (a terra fica a esquerda dela), e a distancia a ela."""
    pts, tang = [], []
    for w in o['vias']:
        if w.get('tags', {}).get('natural') != 'coastline':
            continue
        A = linha_via(o, w)
        for a, b in zip(A[:-1], A[1:]):
            d = b - a
            m = max(1, int(np.linalg.norm(d) / 1.5))
            u = np.arange(m)[:, None] / m
            pts.append(a + d * u)
            tang.append(np.repeat((d / (np.linalg.norm(d) + 1e-9))[None], m, 0))
    pts, tang = np.vstack(pts), np.vstack(tang)
    dist, i = cKDTree(pts).query(q)
    v = q - pts[i]
    agua = (tang[i, 0] * v[:, 1] - tang[i, 1] * v[:, 0]) < 0
    # Lagos e lagoas mapeados (natural=water) tambem sao agua, rasa.
    from shapely.geometry import Polygon
    import shapely
    for w in o['vias']:
        t = w.get('tags', {})
        if t.get('natural') == 'water' and w['nodes'][0] == w['nodes'][-1]:
            A = linha_via(o, w)
            if len(A) >= 4:
                dentro = shapely.contains_xy(Polygon(A).buffer(0), q[:, 0], q[:, 1])
                agua |= dentro
    return agua, dist


def planta(pasta, P, P0, origem, epsg, raio):
    """O eixo sobre a referencia Esri (conferencia local), colorido pelo raio."""
    from PIL import Image, ImageDraw
    ref = json.loads((pasta / 'referencia_esri.json').read_text())
    img = Image.open(pasta / 'referencia_esri.jpg').convert('RGB')
    de = Transformer.from_crs(epsg, 4326, always_xy=True)
    z, tx0, ty0 = ref['z'], ref['tx0'], ref['ty0']

    def px(Q):
        lon, lat = de.transform(Q[:, 0] + origem[0], Q[:, 1] + origem[1])
        lon, lat = np.asarray(lon), np.asarray(lat)
        k = 2 ** z
        x = ((lon + 180) / 360 * k - tx0) * 256
        y = ((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * k - ty0) * 256
        return np.column_stack([x, y])
    A, B = px(P), px(P0)
    dr = ImageDraw.Draw(img)
    for i in range(len(A)):
        j = (i + 1) % len(A)
        r = raio[i]
        cor = (255, 40, 40) if r < 15 else (255, 160, 0) if r < 30 else (255, 255, 0) if r < 80 else (0, 255, 120)
        dr.line([tuple(A[i]), tuple(A[j])], fill=cor, width=4)
    for q in B:
        dr.ellipse([q[0] - 3, q[1] - 3, q[0] + 3, q[1] + 3], outline=(255, 0, 255))
    x0, y0 = A.min(0) - 120
    x1, y1 = A.max(0) + 120
    img.crop((int(x0), int(y0), int(x1), int(y1))).save(pasta / 'planta_floripa.jpg', quality=88)
    print('planta:', pasta / 'planta_floripa.jpg')


if __name__ == '__main__':
    main()
