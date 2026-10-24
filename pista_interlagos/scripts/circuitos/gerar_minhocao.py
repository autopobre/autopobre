"""Circuito do Minhocao: circuito de rua imaginario nas ruas, no elevado e no tunel reais do centro de Sao Paulo.

    python baixar_fontes.py minhocao --referencia   (OSM, ANADEM, Copernicus, WorldCover, Sentinel-2, Esri so p/ medir)
    python gerar_minhocao.py [--planta] [--perfil] [--so-perfil]

Pedido da equipe (11/10/2026), com o tracado escolhido sobre o mapa das ruas: a volta passa POR CIMA e POR BAIXO do
Elevado Presidente Joao Goulart (o Minhocao) e mergulha no tunel da Radial Leste-Oeste sob a Praca Roosevelt.
Largada na Rua Major Sertorio, logo depois de passar sob o Minhocao; a Av. Ipiranga, a Praca da Republica pelo lado
das arvores, a Av. Vieira de Carvalho, o Largo do Arouche, a Av. Duque de Caxias, a Av. Sao Joao, a rampa da Rua
Ana Cintra (de saida, subida ao contrario), 790 m sobre o Minhocao rumo a Roosevelt (a pista sentido bairro, ao
contrario), a descida reta no tunel sob a Consolacao e a praca, a saida na Rua Martins Fontes (uma ligacao de ~30 m
dentro do tunel nao existe: a rampa real so encontra o ramal que sobe para a Consolacao), a Rua Augusta, a Rua Caio
Prado, a Rua Dr. Cesario Mota Junior e de novo a Major Sertorio, que cruza por baixo do proprio Minhocao.

O eixo sao as vias do OpenStreetMap pela volta de pernas (rota_osm.py), esquinas arredondadas e rumo suavizado; no
Minhocao o eixo vai para o meio do tabuleiro (a corrida usa as duas pistas, sem o separador). O perfil: o relevo
(ANADEM) nas ruas; o tabuleiro a ALTURA_TABULEIRO acima do chao sob ele, com a rampa da Ana Cintra e a descida ate o
tunel desenhadas; o tunel a PROFUNDIDADE_TUNEL abaixo da praca. Larguras pelas faixas do OSM, com minimo de corrida.
Muros de concreto com alambrado (circuito de rua); os boxes a direita da Major Sertorio, entre o Minhocao e a
Ipiranga. As edificacoes sao as do OSM com as alturas da Prefeitura (importacao PMSP).

O formato e o de gerar_floripa.py, com:
- `meta.decks`: a rampa, o tabuleiro e a descida (o carro anda no plano da pista ate os muros);
- `meta.tunnels`: o trecho abaixo do chao (trincheira e tunel); o terreno so desce a pista num corredor estreito;
- `meta.deck_band_m`: a faixa livre ao lado do tabuleiro (os predios encostam no Minhocao);
- `scenery.minhocao`: o elevado inteiro (as duas pistas, alem do trecho da volta), os pilares, as rampas e o tunel
  para os modelos (minhocao-structures.js).
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

import gerar_pista as gp
import gerar_floripa as gf
import rota_osm
from compat_scipy import cKDTree, gaussian_filter1d
from config import CIRCUITOS, DADOS, pasta_fontes
from projecao import Transformer

NOME = 'minhocao'
DS = 2.0
PASSO = 4.0
MARGEM = 320.0
# A grade vai mais longe a oeste e ao norte: o Minhocao segue sobre a Sao Joao ate a Praca Marechal Deodoro (e a alca
# de la).
MARGEM_OESTE_EXTRA = 500.0
MARGEM_NORTE_EXTRA = 160.0

# --- A volta por pernas (rota_osm.volta): ponto por onde passa e os nomes de rua preferidos ate ele.
# Vias do Minhocao (OSM): tabuleiro sentido bairro (Roosevelt -> Largo Padre Pericles) e sentido centro.
ELEVADO_BAIRRO = [453860212, 453860211, 679365054, 679365052, 13972603, 936492979, 936492980]
ELEVADO_CENTRO = [936492982, 936492981, 13972584, 679365055, 679365053, 679365056, 453860214, 453860213, 131681593]
RAMPA_ANA_CINTRA = [453860210, 230624850]
TUNEL_RADIAL = [454576373, 554707194, 524256403, 278916124]
SAIDA_MARTINS_FONTES = [278916126, 278916125]
MAJOR_SERTORIO_RETA = [409861328, 409861330, 68280131]
PERNAS = [
    {'rotulo': 'Largada: R. Major Sertório', 'lat': -23.54544, 'lon': -46.6463, 'vias': [409861328, 409861330],
     'prefere': ['Major Sertório', 'Cesário Mot']},
    {'rotulo': 'Praça da República (canto oeste)', 'lat': -23.54379, 'lon': -46.64440, 'filtro': 'República',
     'prefere': ['Major Sertório', 'Ipiranga', 'República']},
    {'rotulo': 'Av. Vieira de Carvalho', 'lat': -23.5416, 'lon': -46.6439, 'filtro': 'Vieira de Carvalho',
     'prefere': ['República', 'Vieira de Carvalho']},
    {'rotulo': 'Largo do Arouche', 'lat': -23.5412, 'lon': -46.6460, 'filtro': 'Arouche', 'prefere': ['Vieira de Carvalho', 'Arouche']},
    {'rotulo': 'Av. Duque de Caxias', 'lat': -23.5402, 'lon': -46.6458, 'filtro': 'Duque de Caxias', 'prefere': ['Arouche', 'Duque de Caxias']},
    {'rotulo': 'Av. São João', 'lat': -23.5392, 'lon': -46.6466, 'filtro': 'São João', 'prefere': ['Duque de Caxias', 'São João']},
    {'rotulo': 'Rampa da R. Ana Cintra', 'lat': -23.53843, 'lon': -46.64845, 'vias': [453860210], 'prefere': ['São João', 'Ana Cintra']},
    {'rotulo': 'Minhocão', 'lat': -23.5440, 'lon': -46.6476, 'vias': [453860212], 'prefere': ['Goulart'],
     'vias_pref': RAMPA_ANA_CINTRA + [453860211, 453860212]},
    {'rotulo': 'Túnel sob a Praça Roosevelt', 'lat': -23.5490, 'lon': -46.6468, 'vias': [278916124], 'prefere': ['Radial', 'Goulart'],
     'vias_pref': TUNEL_RADIAL},
    {'rotulo': 'Saída na R. Martins Fontes', 'lat': -23.54997, 'lon': -46.64628, 'vias': [278916125], 'prefere': ['Radial', 'Ligacao nova'],
     'vias_pref': [278916124] + SAIDA_MARTINS_FONTES, 'proibir': [14409243]},
    {'rotulo': 'R. Augusta', 'lat': -23.5504, 'lon': -46.6475, 'filtro': 'Augusta', 'prefere': ['Martins Fontes', 'Augusta']},
    {'rotulo': 'R. Caio Prado', 'lat': -23.5492, 'lon': -46.6488, 'filtro': 'Caio Prado', 'prefere': ['Augusta', 'Caio Prado']},
    {'rotulo': 'R. Dr. Cesário Mota Júnior', 'lat': -23.5462, 'lon': -46.6496, 'filtro': 'Cesário Mot',
     'prefere': ['Caio Prado', 'Consolação', 'Cesário Mot', 'Maria Borba']},
]
# A rampa real da Martins Fontes desce no ramal do tunel que sobe para a Consolacao (OSM 14409243), nao na galeria
# que vem do Minhocao: a ligacao de ~30 m entre as duas, por baixo da praca, e desenho de jogo.
LIGACOES_NOVAS = [{'nome': 'Ligacao nova no tunel', 'de': (-23.54942, -46.64670), 'de_vias': [278916124, 554707180],
                   'para': (-23.54956, -46.64642), 'para_vias': SAIDA_MARTINS_FONTES}]

# Larguras de corrida (m): o leito do OSM (faixas x 3,3 + 1,2) entre o minimo e o maximo; o tabuleiro do Minhocao
# inteiro (as duas pistas sem o separador, entre os guarda-corpos); a rampa da Ana Cintra alargada para a corrida.
LARG_MIN = 9.5
LARG_MAX = 14.5
LARG_NIVEL = {'elevado': 14.0, 'rampa': 9.5, 'tunel': 11.0, 'ficticia': 10.0}
# Alturas (m): o tabuleiro sobre o chao sob ele (o vao livre das ruas por baixo, ~5 m, mais a laje e as vigas);
# o leito do tunel abaixo da praca (gabarito de ~5 m mais a laje que leva a praca).
ALTURA_TABULEIRO = 6.4            # so para o resto do elevado, fora do trecho medido
PROFUNDIDADE_TUNEL = 7.0
# O leito do tunel fica pelo menos FOLGA_TUNEL abaixo do chao de cima (gabarito de 4,3-4,5 m mais a laje); a boca norte:
# ate ela (vindo do Minhocao) o MDS mede o leito da trincheira aberta.
FOLGA_TUNEL = 5.8
BOCA_NORTE = (-23.54728, -46.64752)
RAMPA_MAX = .10
# A descida do tabuleiro para o tunel desenhada como estrada (alinhar_descida): de DESCIDA_ANTES_M antes da boca norte
# (depois do cruzamento sobre a Major Sertorio) ate a reta do tunel, rampas retas ligadas por curvas verticais de um
# destes raios (m); com 400 m um carro so sai do chao numa lombada acima de 225 km/h.
DESCIDA_ANTES_M = 190.0
RAIOS_VERTICAIS = (400.0, 500.0, 600.0, 800.0, 1000.0)
# As calcadas do centro (m): ficam dentro das quadras viarias do GeoSampa e aplainam junto com o leito das ruas.
CALCADA = 3.5
# A mata das pracas (cobertura) a menos disso do leito vira gramado: nenhum tronco no meio-fio com a copa sobre a rua.
RUA_MATA = 3.0
# A largada: metros depois do cruzamento sob o Minhocao, na Major Sertorio (o grid fica entre o elevado e a linha).
LINHA_APOS_CRUZAMENTO = 150.0


def local(epsg, origem):
    para = Transformer.from_crs(4326, epsg, always_xy=True)

    def f(ll):
        ll = np.asarray(ll, float)
        x, y = para.transform(ll[:, 1], ll[:, 0])
        return np.column_stack([np.asarray(x), np.asarray(y)]) - origem
    return f


def janela_mais_perto(Q, sq, P, sp, janela=60.0, Lp=None):
    """Para cada ponto P (comprimento sp ao longo da volta fechada) o indice do SEGMENTO Q[k] -> Q[k+1] (comprimento sq na
    volta fechada Q) mais perto em planta entre os que passam a menos de `janela` m de volta do ponto: no cruzamento em
    dois niveis o mais perto em planta pode ser o outro nivel; a janela pelo comprimento nao deixa (e os segmentos
    longos, sem vertices, nao a esvaziam)."""
    m = len(Q)
    B = np.roll(Q, -1, 0)
    Lq = sq[-1] + np.linalg.norm(Q[0] - Q[-1])
    Lp = Lp if Lp is not None else sp[-1] + (sp[-1] - sp[-2])
    escala = Lq / Lp
    a0, a1 = sq, np.r_[sq[1:], Lq]
    D = B - Q
    dd = np.maximum(np.sum(D * D, axis=1), 1e-12)
    out = np.empty(len(P), int)
    for i in range(len(P)):
        alvo = sp[i] * escala
        # Distancia (na volta) do alvo ao trecho [a0, a1] de cada segmento.
        dent = np.minimum(np.abs(alvo - a0), np.abs(alvo - a1))
        dent = np.where((alvo >= a0) & (alvo <= a1), 0.0, np.minimum(dent, Lq - dent))
        cand = np.flatnonzero(dent < janela)
        u = np.clip(np.sum((P[i] - Q[cand]) * D[cand], axis=1) / dd[cand], 0, 1)
        e = Q[cand] + D[cand] * u[:, None] - P[i]
        out[i] = cand[np.argmin(np.sum(e * e, axis=1))]
    return out


def comprimentos(Q):
    return np.r_[0, np.cumsum(np.linalg.norm(np.diff(Q, axis=0), axis=1))]


def eixo(c, pasta, epsg):
    para = Transformer.from_crs(4326, epsg, always_xy=True)
    ox, oy = para.transform(c['centro'][1], c['centro'][0])
    origem = np.array([round(ox, -1), round(oy, -1)])
    osm = json.loads((pasta / 'osm.json').read_text(encoding='utf-8'))
    ll, vias, niveis, nomes, marcas, nos, G = rota_osm.volta(osm, PERNAS, LIGACOES_NOVAS)
    loc = local(epsg, origem)
    P0 = loc(ll)
    lanes = []
    for w in vias:
        t = G.vias[w].get('tags', {})
        try:
            lanes.append(float(str(t.get('lanes', '2')).split(';')[0]))
        except ValueError:
            lanes.append(2.0)
    vias, niveis, nomes, lanes = np.array(vias), np.array(niveis), np.array(nomes, dtype=object), np.array(lanes)
    L0 = float(np.linalg.norm(np.diff(np.vstack([P0, P0[:1]]), axis=0), axis=1).sum())
    print(f'volta pelas pernas: {len(P0)} nos, {L0:.0f} m; niveis {dict(zip(*np.unique(niveis, return_counts=True)))}')
    # Eixo: esquinas arredondadas, rumo suavizado (como Floripa).
    R, orig = gf.arredondar(P0)
    P, _, _ = gf.reamostrar_fechado(R)
    P = gf.suavizar_rumo(P)
    P, s, L = gf.reamostrar_fechado(P)
    # Atributos de cada estacao: o no da volta mais perto em planta, dentro de uma janela pelo comprimento (o cruzamento
    # sob o Minhocao poe o outro nivel a poucos metros em planta).
    k = janela_mais_perto(P0, comprimentos(P0), P, s, 60.0, Lp=L)
    attr = {'via': vias[k], 'nivel': niveis[k], 'nome': nomes[k], 'faixas': lanes[k]}
    # No Minhocao o eixo vai para o meio do tabuleiro: metade da distancia a pista do outro sentido.
    o = gf.osm_local(pasta, origem, epsg)
    # A via do outro sentido densa (1 m): os vertices do OSM no tabuleiro ficam a ate ~100 m uns dos outros.
    outro = reamostra_aberta(cadeia(o, ELEVADO_CENTRO), 1.0)[0]
    T, E = gp.quadro(P)
    kd = cKDTree(outro)
    d_outro, j = kd.query(P)
    lat = np.sum((outro[j] - P) * E, axis=1)
    no_tab = attr['nivel'] == 'elevado'
    desl = np.where(no_tab & (d_outro < 20), lat / 2, 0.0)
    desl = gaussian_filter1d(desl, 15 / DS, mode='wrap')
    antigo = P + E * desl[:, None]
    Lv = L
    P, s, L = gf.reamostrar_fechado(antigo)
    kk = janela_mais_perto(antigo, comprimentos(antigo), P, s, 20.0, Lp=L)
    attr = {c_: v_[kk] for c_, v_ in attr.items()}
    # A linha de chegada: LINHA_APOS_CRUZAMENTO m depois do ponto da Major Sertorio sob o tabuleiro.
    reta = np.flatnonzero(np.isin(attr['via'], [230628803] + MAJOR_SERTORIO_RETA + [424389521]))
    tab = np.flatnonzero(attr['nivel'] == 'elevado')
    dist_tab = cKDTree(P[tab]).query(P[reta])[0]
    i_cruz = int(reta[np.argmin(dist_tab)])
    i0 = (i_cruz + int(round(LINHA_APOS_CRUZAMENTO / DS))) % len(P)
    P = np.roll(P, -i0, 0)
    attr = {c_: np.roll(v_, -i0) for c_, v_ in attr.items()}
    s = np.arange(len(P)) * (L / len(P))
    print(f'eixo: {L:.0f} m, {len(P)} estacoes; cruzamento sob o Minhocao a {LINHA_APOS_CRUZAMENTO:.0f} m antes da linha; '
          f'deslocamento ao meio do tabuleiro ate {np.abs(desl).max():.1f} m')
    return P, s, L, attr, origem, P0, G


class Grade:
    """Grade regular gravada por baixar_fontes.py (x0, y1 do canto noroeste, passo, linhas de norte a sul)."""

    def __init__(self, arquivo):
        g = np.load(arquivo)
        self.z = g['z'].astype(float)
        self.x0, self.y1, self.passo = float(g['x0']), float(g['y1']), float(g['passo'])

    def dentro(self, X, Y, borda=60.0):
        ny, nx = self.z.shape
        x1, y0 = self.x0 + nx * self.passo, self.y1 - ny * self.passo
        return np.clip(np.minimum.reduce([X - self.x0, x1 - X, Y - y0, self.y1 - Y]) / borda, 0, 1)

    def __call__(self, X, Y):
        ny, nx = self.z.shape
        fx = np.clip((np.asarray(X, float) - self.x0) / self.passo - .5, 0, nx - 1.001)
        fy = np.clip((self.y1 - np.asarray(Y, float)) / self.passo - .5, 0, ny - 1.001)
        i, j = fy.astype(int), fx.astype(int)
        u, v = fx - j, fy - i
        z = self.z
        return (z[i, j] * (1 - u) + z[i, j + 1] * u) * (1 - v) + (z[i + 1, j] * (1 - u) + z[i + 1, j + 1] * u) * v


class Relevo:
    """O chao: o MDT de 1 m do LiDAR 2020 da Prefeitura (GeoSampa; sob os predios, sem pontos, preenchido em
    baixar_fontes.py) na caixa baixada, o ANADEM (30 m) fora dela, com 60 m de emenda. A superficie (MDS 2020, 0,5 m,
    maior z por celula) so ao longo do Minhocao, para medir o tabuleiro. Coordenadas locais."""

    def __init__(self, pasta, epsg, origem):
        self.o = np.asarray(origem, float)
        self.an = gp.Raster(pasta / 'anadem.tif', epsg)
        self.mdt = Grade(pasta / 'mdt_geosampa_1m.npz')
        self.mds = Grade(pasta / 'mds_minhocao_05m.npz')

    def terreno(self, x, y, ordem=1):
        X, Y = np.asarray(x, float) + self.o[0], np.asarray(y, float) + self.o[1]
        w = self.mdt.dentro(X, Y)
        z = self.an(X, Y, ordem=1)
        if np.any(w > 0):
            z = np.where(w > 0, self.mdt(X, Y) * w + z * (1 - w), z)
        return z

    def superficie(self, x, y):
        X, Y = np.asarray(x, float) + self.o[0], np.asarray(y, float) + self.o[1]
        z = self.mds(X, Y)
        return np.where(self.mds.dentro(X, Y, 1.0) > .99, z, np.nan)


def degrau(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def trecho(mask):
    """Primeiro e ultimo indice (em ordem de volta) do trecho continuo de mask."""
    k = gf.corrida(mask)
    return int(k[0]), int(k[-1])


def medir_tabuleiro(P, E, T, rel, ks, z0):
    """O pavimento ao longo de ks (da rua no pe da rampa da Ana Cintra ate a boca norte do tunel) RASTREADO no MDS 2020:
    em cada estacao, os pontos da superficie numa faixa de +-4 m do eixo e +-1,5 m ao longo; vale o grupo de pontos
    (+-0,4 m) mais perto da previsao pela rampa que vinha, e ele so e aceito a menos de 1 m dela. Assim a medida nao
    salta para o tabuleiro do proprio Minhocao que passa por cima do pe da rampa, nem cai no vao entre as duas pistas que
    descem para o tunel, nem pega carros e postes. z0: o chao no comeco."""
    a, b = np.meshgrid(np.arange(-4, 4.01, 1.0), (-1.5, 0.0, 1.5))
    a, b = a.ravel(), b.ravel()
    out = np.full(len(ks), np.nan)
    z_ant, rampa, passo = z0, 0.0, None
    for n_, i in enumerate(ks):
        prev = z_ant + rampa
        v = rel.superficie(P[i, 0] + E[i, 0] * a + T[i, 0] * b, P[i, 1] + E[i, 1] * a + T[i, 1] * b)
        v = v[np.isfinite(v)]
        if len(v):
            perto = v[np.argmin(np.abs(v - prev))]
            grupo = v[np.abs(v - perto) < .4]
            cand = float(np.median(grupo))
            if abs(cand - prev) < 1.0 and len(grupo) >= 3:
                out[n_] = cand
                rampa = .8 * rampa + .2 * (cand - z_ant)
                z_ant = cand
                continue
        z_ant = prev
    return out


def rampas_e_curvas(ss, pvis, R):
    """Perfil de estrada: rampas retas entre os pontos `pvis` [(s, z), ...] e, em cada ponto interno, uma parabola de raio
    R (curvatura 1/R) centrada nele. s e z de cada ponto podem ser colunas (casos, 1) contra as estacoes ss (1, n).
    Devolve o perfil, as rampas e se as curvas cabem (nenhuma invade a vizinha nem passa das pontas)."""
    S = [np.asarray(p[0], float) for p in pvis]
    Z = [np.asarray(p[1], float) for p in pvis]
    g = [(Z[i + 1] - Z[i]) / (S[i + 1] - S[i]) for i in range(len(S) - 1)]
    out = Z[0] + g[0] * (ss - S[0])
    for i in range(1, len(S) - 1):
        out = np.where(ss >= S[i], Z[i] + g[i] * (ss - S[i]), out)
    cabe = np.ones(np.broadcast_shapes(*[np.shape(v) for v in S + Z]), bool)
    fim = S[0]
    for i in range(1, len(S) - 1):
        L = R * np.abs(g[i] - g[i - 1])
        a = S[i] - L / 2
        cabe &= a >= fim
        fim = S[i] + L / 2
        x = ss - a
        out = np.where((x > 0) & (x < L), Z[i] + g[i - 1] * (ss - S[i]) + (g[i] - g[i - 1]) * x ** 2 / (2 * np.maximum(L, 1e-9)), out)
    cabe &= fim <= S[-1]
    return out, g, cabe


def alinhar_descida(z, s, zc, i_boca, i_cons, i_sobe):
    """A descida do Minhocao para o tunel como uma estrada de verdade (usuario, 24/10: "tanta ondulacao que os carros
    ficam capotando"). O pavimento rastreado no MDS ondula +-0,3 m (juntas, carros, o vao de luz entre as pistas) e o teto
    sob a Rua da Consolacao (o chao de la menos FOLGA_TUNEL) cortava um degrau no leito desenhado: lombadas de 70-90 m de
    raio jogavam o carro no ar a 90 km/h e o vale de 45 m na entrada da galeria o derrubava. De DESCIDA_ANTES_M antes da
    boca norte ate o fim da praca o perfil passa a ser: a tangente do tabuleiro, uma lombada, a rampa reta da descida, um
    vale sob a Consolacao, a rampa do tunel e uma curva suave para a reta do tunel, com o mesmo raio (RAIOS_VERTICAIS) em
    todas. Os vertices (o da lombada, na tangente do tabuleiro; o do vale; o ultimo, na reta do tunel) e o raio saem de
    uma busca em grade: o mais perto do pavimento medido (ate a boca), sempre sob o teto do tunel."""
    ia = i_boca - int(round(DESCIDA_ANTES_M / DS))
    assert 0 < ia < i_boca < i_cons < i_sobe < len(z) - 1, 'a descida para o tunel nao pode passar pela linha de largada'
    k = np.arange(ia, i_sobe + 1)
    ss = s[k][None, :]
    teto = np.where(k >= i_cons, zc[k] - FOLGA_TUNEL, np.inf)
    medido = (k <= i_boca).astype(float)
    sa, za = s[ia], z[ia]
    ga = (z[ia + 1] - z[ia - 1]) / (s[ia + 1] - s[ia - 1])
    # A reta do tunel desenhado, alem do degrau da Consolacao.
    reta = (s > s[i_cons] + 40) & (s <= s[i_sobe])
    sr, zr = s[reta] - s[reta].mean(), z[reta] - z[reta].mean()
    gl = float(np.sum(sr * zr) / np.sum(sr * sr))
    cl = float(z[reta].mean() - gl * s[reta].mean())
    s3 = s[i_sobe] - 20.0
    pontas = (s3, cl + gl * s3), (s[i_sobe] + 1.0, cl + gl * (s[i_sobe] + 1.0))

    def avalia(s1, s2, z2, R):
        zz, g, cabe = rampas_e_curvas(ss, [(sa, za), (s1, za + ga * (s1 - sa)), (s2, z2), *pontas], R)
        ok = cabe & (np.abs(g[1]) <= RAMPA_MAX) & np.all(zz <= teto - .02, axis=1, keepdims=True)
        return np.where(ok[:, 0], np.sum(medido * (zz - z[k]) ** 2, axis=1), np.inf)

    def busca(faixas, R):
        grade = [g_.ravel()[:, None] for g_ in np.meshgrid(*faixas, indexing='ij')]
        custo = np.concatenate([avalia(*(g_[c:c + 20000] for g_ in grade), R) for c in range(0, len(grade[0]), 20000)])
        j = int(np.argmin(custo))
        return custo[j], [float(g_[j, 0]) for g_ in grade]

    melhor = None
    z_baixo = np.min(teto) - 3.0
    for R in RAIOS_VERTICAIS:
        custo, (s1, s2, z2) = busca((np.arange(sa + 4, s[i_boca], 4.0), np.arange(s[i_boca] - 50, s[i_cons] + 60, 4.0),
                                     np.arange(z_baixo, z[i_boca] + 1.0, .1)), R)
        if not np.isfinite(custo):
            continue
        custo, (s1, s2, z2) = busca((np.arange(s1 - 4, s1 + 4.01, 1.0), np.arange(s2 - 4, s2 + 4.01, 1.0),
                                     np.arange(z2 - .1, z2 + .101, .02)), R)
        if melhor is None or custo < melhor[0]:
            melhor = (custo, s1, s2, z2, R)
    assert melhor is not None, 'nenhuma descida cabe sob o teto do tunel'
    custo, s1, s2, z2, R = melhor
    zz, g, _ = rampas_e_curvas(ss, [(sa, za), (s1, za + ga * (s1 - sa)), (s2, z2), *pontas], R)
    zz = zz[0]
    desvio = (zz - z[k])[k <= i_boca]
    kv = np.diff(np.r_[z[ia - 1], zz, z[i_sobe + 1]], 2) / DS ** 2
    print(f'descida para o tunel (s {s[ia]:.0f}-{s[i_sobe]:.0f}): curvas de {R:.0f} m, rampas {100 * float(g[1]):.1f}% e '
          f'{100 * float(g[2]):.1f}% (vale a {z2:.2f} m), desvio do medido {np.sqrt(np.mean(desvio ** 2)):.2f} m (max '
          f'{np.abs(desvio).max():.2f}), curvatura max {1e3 * np.abs(kv).max():.2f}e-3, folga do teto {np.min(teto - zz):.2f} m')
    z = z.copy()
    z[k] = zz
    return z


def perfil(P, E, s, L, attr, rel, G, origem, epsg):
    """Perfil da volta. Nas ruas, o chao do LiDAR 2020 sob a secao (suavizado). Do pe da rampa da Ana Cintra ate a
    trincheira aberta antes da Rua da Consolacao, o pavimento MEDIDO no MDS 2020 (a rampa, o tabuleiro do Minhocao e a
    descida). Sob a Consolacao e a Praca Roosevelt (o MDS so ve a rua e a praca por cima) o leito do tunel e desenhado:
    da boca medida ate a Rua Martins Fontes, nunca a menos de FOLGA_TUNEL abaixo do chao de cima. Rampa maxima,
    alisamento. Devolve z, o chao sob o eixo e os trechos de tabuleiro e de tunel."""
    n = len(P)
    T, _ = gp.quadro(P)
    zc = gf.ao_longo(rel.terreno, P, E)
    zg = gaussian_filter1d(zc, 4 / DS, mode='wrap')
    via, nivel = attr['via'], attr['nivel']
    r0, _ = trecho(np.isin(via, RAMPA_ANA_CINTRA))
    loc = local(epsg, origem)
    perto = lambda lat, lon: int(np.argmin(np.linalg.norm(P - loc([(lat, lon)])[0], axis=1)))
    i_cons = perto(-23.54745, -46.64748)       # a Rua da Consolacao passa por cima: comeca a galeria coberta
    i_boca = perto(*BOCA_NORTE)                # ate aqui o MDS ve o leito (trincheira aberta)
    i_sobe = perto(-23.54895, -46.64686)       # fim da praca: o leito sobe para a Martins Fontes
    i_rua2 = perto(-23.54997, -46.64628)       # a Rua Martins Fontes
    faixa = lambda a_, b_: np.arange(a_, a_ + (b_ - a_) % n + 1) % n
    # --- Medido no MDS: da rampa a boca norte do tunel.
    k_med = faixa(r0, i_boca)
    zs = medir_tabuleiro(P, E, T, rel, k_med, zg[r0])
    ok = np.isfinite(zs)
    print(f'MDS: pavimento medido em {ok.mean():.0%} das {len(k_med)} estacoes da rampa a boca do tunel')
    t_ = np.arange(len(k_med))
    zm = np.interp(t_, t_[ok], zs[ok])
    # Outliers (um onibus, uma arvore sobre a rampa): fora de 0,6 m da mediana movel saem.
    med = np.array([np.median(zm[max(0, i - 6):i + 7]) for i in range(len(zm))])
    bom = np.abs(zm - med) < .6
    zm = np.interp(t_, t_[bom], zm[bom])
    z = zg.copy()
    z[k_med] = gaussian_filter1d(zm, 3 / DS, mode='nearest')
    # Emenda com a rua no pe da rampa (o MDS ali e a propria rua).
    k = faixa((r0 - 10) % n, (r0 + 10) % n)
    w = degrau(np.linspace(0, 1, len(k)))
    z[k] = zg[k] * (1 - w) + z[k] * w
    # --- O tunel desenhado: da boca norte ate a Martins Fontes.
    k_t = faixa(i_boca, i_rua2)
    u = (s[k_t] - s[i_boca]) % L / ((s[i_rua2] - s[i_boca]) % L)
    zl = z[i_boca] * (1 - u) + zg[i_rua2] * u
    teto = np.full(len(k_t), np.inf)
    cob = np.isin(k_t, faixa(i_cons, i_sobe))
    teto[cob] = zc[k_t][cob] - FOLGA_TUNEL
    for _ in range(3):
        zl = np.minimum(zl, teto)
        zl = gaussian_filter1d(zl, 6 / DS, mode='nearest')
        zl[[0, -1]] = z[i_boca], zg[i_rua2]
    z[k_t] = np.minimum(zl, teto)
    # Rampa maxima (corte e aterro, como gerar_chapada) e alisamento.
    limite = RAMPA_MAX * DS
    corte, aterro = z.copy(), z.copy()
    for _ in range(2):
        for i in list(range(n)) + list(range(n - 1, -1, -1)):
            for j_ in (i - 1, (i + 1) % n):
                corte[i] = min(corte[i], corte[j_] + limite)
                aterro[i] = max(aterro[i], aterro[j_] - limite)
    z = gaussian_filter1d((corte + aterro) / 2, 2 / DS, mode='wrap')
    # A descida do tabuleiro ate a reta do tunel: rampas retas e curvas verticais, sem as ondas do MDS nem o degrau do teto.
    z = alinhar_descida(z, s, zc, i_boca, i_cons, i_sobe)
    # O cruzamento: a estacao do tabuleiro sobre a Major Sertorio.
    ms = np.flatnonzero(np.isin(via, MAJOR_SERTORIO_RETA + [230628803, 424389521]))
    tab = np.flatnonzero(nivel == 'elevado')
    d, j = cKDTree(P[ms]).query(P[tab])
    i_dc, i_rua = int(tab[np.argmin(d)]), int(ms[j[np.argmin(d)]])
    folga = z[i_dc] - z[i_rua]
    print(f'perfil: chao {zc.min():.1f} a {zc.max():.1f} m; cruzamento: tabuleiro {z[i_dc]:.1f} m sobre a Major Sertorio '
          f'{z[i_rua]:.1f} m (diferenca {folga:.2f} m, s {s[i_dc]:.0f} e {s[i_rua]:.0f}); tunel: leito {z[k_t].min():.1f} a '
          f'{z[k_t].max():.1f} m, chao por cima ate {zc[k_t].max():.1f} m')
    assert folga > 5.6, 'o Minhocao passa baixo demais sobre a Major Sertorio'
    # O chao dos lados (o mais alto a 14 m do eixo, de cada lado: alem do tabuleiro e das pistas da Amaral Gurgel sob ele): a trincheira e onde a pista corre abaixo dele (as ruas
    # ao lado ficam acima do leito antes da boca norte; na saida sul o chao dos lados so desce ao leito na Martins
    # Fontes); o tabuleiro, o trecho da rampa a descida que nao e trincheira.
    lados = np.max([rel.terreno(P[:, 0] + E[:, 0] * d, P[:, 1] + E[:, 1] * d) for d in (-14.0, 14.0)], axis=0)
    tunel = np.zeros(n, bool)
    tunel[faixa(i_dc, i_rua2)] = True
    tunel &= z < lados - 0.6
    k_t2 = gf.corrida(tunel)
    tunel[:] = False
    tunel[k_t2] = True
    deck = np.zeros(n, bool)
    deck[faixa(r0, (k_t2[0] - 1) % n)] = True
    return z, zc, deck, tunel, {'i_dc': i_dc, 'i_rua': i_rua, 'i_cons': i_cons, 'i_sobe': i_sobe, 'i_rua2': i_rua2,
                                'i_boca': i_boca, 'r0': r0, 'lados': lados}


def leito_geosampa(pasta, origem, P, E):
    """Largura e centro do leito entre os meios-fios, de 2 em 2 m: as quadras viarias editadas do GeoSampa (os poligonos
    das quadras e dos canteiros, restituidos dos meios-fios; as vias sao os vaos entre eles). Em cada estacao um
    transecto de +-14 m: a borda de quadra mais perto de cada lado. Onde falta um lado (esquinas, pracas) fica sem medida."""
    from shapely.geometry import LineString, shape
    from shapely import STRtree
    linhas = []
    for f in json.loads((pasta / 'geosampa_quadras.geojson').read_text(encoding='utf-8'))['features']:
        g = shape(f['geometry'])
        for parte in (g.geoms if g.geom_type.startswith('Multi') else [g]):
            for anel in [parte.exterior, *parte.interiors]:
                linhas.append(LineString(np.array(anel.coords)[:, :2] - origem))
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
    return np.where(ambos, esq - dir_, np.nan), np.where(ambos, (esq + dir_) / 2, np.nan), ambos


def larguras(attr, deck, tunel, n, medida=None):
    """Largura de corrida por estacao: o leito do OSM entre os limites; o tabuleiro inteiro do Minhocao, a rampa e o
    tunel pelas suas medidas; mediana movel e suavizacao."""
    lg = attr['faixas'] * 3.3 + 1.2
    if medida is not None:
        lg = np.where(np.isfinite(medida), medida, lg)
    lg = np.clip(lg, LARG_MIN, LARG_MAX)
    rampa = np.isin(attr['via'], RAMPA_ANA_CINTRA)
    lg = np.where(deck, LARG_NIVEL['elevado'], lg)
    lg = np.where(rampa, LARG_NIVEL['rampa'], lg)
    lg = np.where(tunel, LARG_NIVEL['tunel'], lg)
    lg = np.array([np.median(np.take(lg, np.arange(i - 8, i + 9), mode='wrap')) for i in range(n)])
    return gaussian_filter1d(lg, 8 / DS, mode='wrap')


def faixa_idx(a, b, n):
    return np.arange(a, a + (b - a) % n + 1) % n


def trechos_nomeados(s, attr, L, deck, tunel):
    """Nomes dos trechos da volta (o painel mostra onde o carro esta): a rua de cada estacao, o Minhocao e o tunel."""
    apelido = {'Elevado Presidente João Goulart': 'Minhocão', 'Avenida Radial Leste-Oeste': 'Túnel sob a Praça Roosevelt',
               'AC A RUA ANA CINTRA': 'Rampa da Rua Ana Cintra', 'Rua Doutor Cesário Mota Júnior': 'Rua Dr. Cesário Mota Júnior',
               'Avenida Ipiranga': 'Av. Ipiranga', 'Avenida Vieira de Carvalho': 'Av. Vieira de Carvalho',
               'Avenida Duque de Caxias': 'Av. Duque de Caxias', 'Avenida São João': 'Av. São João', 'Rua Vitória': 'Largo do Arouche'}
    nomes = []
    for i in range(len(s)):
        nm = attr['nome'][i] or ''
        if deck[i] and attr['nivel'][i] in ('elevado', 'rampa'):
            nm = 'Minhocão' if attr['nivel'][i] == 'elevado' else 'Rampa da Rua Ana Cintra'
        elif tunel[i]:
            nm = 'Túnel sob a Praça Roosevelt'
        elif not nm:
            nm = 'Rua Martins Fontes' if np.isin(attr['via'][i], SAIDA_MARTINS_FONTES + [944852952]) else ''
        nomes.append(apelido.get(nm, nm))
    out = []
    for i, nm in enumerate(nomes):
        if nm and (not out or out[-1][1] != nm):
            # Trechos de menos de 30 m (esquinas) nao mudam o nome no painel.
            j = i
            while j < len(nomes) and nomes[j] == nm:
                j += 1
            if (j - i) * DS >= 30 or not out:
                out.append([round(float(s[i]), 1), nm])
    return out


# Arquibancada de circuito de rua: na Major Sertorio, do lado esquerdo, de frente para o grid e os boxes (comeca
# `antes_da_chegada` m antes da linha, blocos de 28 m, lado 1 esquerda, recuo do asfalto ate a frente).
ARQUIBANCADAS = [{'antes_da_chegada': 125.0, 'blocos': 4, 'lado': 1, 'recuo': 7.0}]
PIT = {'inicio': .09, 'antes_do_fim': 22, 'entrada': 50, 'saida': 50, 'largura': 7.2, 'garagens': None,
       'fonte': 'Faixa de boxes de jogo à direita da Rua Major Sertório, entre o Minhocão e a Av. Ipiranga.'}


def ruas_geosampa(pasta, origem):
    """O leito das ruas da cidade (os vaos entre as quadras viarias editadas do GeoSampa: quadras, pracas e canteiros
    restituidos dos meios-fios) dentro da caixa baixada, e a caixa. Coordenadas locais."""
    import shapely
    from shapely.geometry import box, shape
    from shapely.ops import unary_union
    quadras = unary_union([shapely.transform(shape(f['geometry']), lambda c: c - origem)
                           for f in json.loads((pasta / 'geosampa_quadras.geojson').read_text(encoding='utf-8'))['features']])
    cx = json.loads((pasta / 'geosampa.json').read_text(encoding='utf-8'))['caixa_utm']
    caixa = box(cx[0] - origem[0], cx[1] - origem[1], cx[2] - origem[0], cx[3] - origem[1]).buffer(-30)
    return caixa.difference(quadras), caixa


def chao_fixado(P, s, L, z, zc, largura, folga, deck_alto, tunel, pit, rel, MARGEM_, deck=None, ruas=None):
    """A grade do terreno (4 m): o relevo, colado ao plano da pista junto das ruas (o nivel de baixo no cruzamento),
    livre sob o tabuleiro alto (no maximo 2,5 m abaixo dele), e no tunel so num corredor estreito sobre a pista (fora
    dele o chao e a praca e as ruas por cima). O pit como em Floripa. `ruas`: as ruas da cidade com as calcadas
    (ruas_geosampa e CALCADA), aplainadas antes de tudo (gerar_pista.aplainar_ruas)."""
    todos = np.vstack([P, np.array(pit['xy'])])
    x0 = math.floor((todos[:, 0].min() - MARGEM_ - MARGEM_OESTE_EXTRA) / PASSO) * PASSO
    x1 = todos[:, 0].max() + MARGEM_
    y0 = math.floor((todos[:, 1].min() - MARGEM_) / PASSO) * PASSO
    y1 = todos[:, 1].max() + MARGEM_ + MARGEM_NORTE_EXTRA
    nx, ny = int((x1 - x0) / PASSO) + 1, int((y1 - y0) / PASSO) + 1
    gx, gy = x0 + np.arange(nx) * PASSO, y0 + np.arange(ny) * PASSO
    XX, YY = np.meshgrid(gx, gy)
    q = np.column_stack([XX.ravel(), YY.ravel()])
    zt = rel.terreno(q[:, 0], q[:, 1], ordem=1)
    if ruas is not None:
        # As ruas sem o sobe e desce do LiDAR (usuario, 16/10/2026: "as ruas fora da pista estao todas irregulares").
        Zr, peso = gp.aplainar_ruas(zt.reshape(ny, nx), PASSO, gp.distancia_ate(ruas, XX, YY, 8.0))
        mudou = np.abs(Zr.ravel() - zt)
        print(f'ruas aplainadas: {(mudou > .01).sum()} nos ({(peso > .99).sum()} inteiros), mudanca media '
              f'{mudou[mudou > .01].mean():.2f} m, p99 {np.percentile(mudou[mudou > .01], 99):.2f}, max {mudou.max():.2f}')
        zt = Zr.ravel()
    T, E = gp.quadro(P)
    seg = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
    grade = (np.roll(z, -1) - np.roll(z, 1)) / (seg + np.roll(seg, 1))

    def plano(sel, q_):
        idx = np.flatnonzero(sel)
        d, j = cKDTree(P[idx]).query(q_)
        k = idx[j]
        dd = q_ - P[k]
        lat = np.sum(dd * E[k], axis=1)
        along = np.clip(np.sum(dd * T[k], axis=1), -DS, DS)
        return k, d, lat, z[k] + grade[k] * along
    # Nivel de baixo (ruas e tunel): cola o chao no plano da pista. A distancia e a de verdade ate a estacao (as pontas
    # dos trechos abertos, nos fins do tabuleiro, nao estendem o plano da pista em linha reta por centenas de metros).
    baixo = ~deck_alto
    k, dist_b, lat, road = plano(baixo, q)
    fora = dist_b - largura[k] / 2
    parede = np.where(lat < 0, folga[-1][k], folga[1][k])
    peso = np.clip((24 - fora) / 16, 0, 1)
    # No tunel e na trincheira so o corredor da pista desce (ate 5 m atras dos muros: com a grade de 4 m, menos que isso
    # deixa terra no pe das paredes; a laje e as paredes do tunel cobrem a faixa); o resto fica o chao (a praca, as ruas).
    corredor = np.where(fora <= parede + 5.0, 1.0, 0.0)
    peso = np.where(tunel[k], corredor, peso)
    # No tabuleiro baixo (sobre muros cheios: a rampa, a descida) o chao nao sobe ate a pista: so fica abaixo dela sob o
    # asfalto e os muros; os muros do modelo descem ate o chao de verdade.
    sob = (fora <= parede) & deck[k]
    peso = np.where(deck[k], 0.0, peso)
    zt = zt * (1 - peso) + (road - .06) * peso
    zt = np.where(sob, np.minimum(zt, road - .15), zt)
    # Sob e ao lado do tabuleiro alto o chao fica pelo menos 2,5 m abaixo dele (vigas, pilares).
    kd, dist_d, latd, roadd = plano(deck_alto, q)
    forad = dist_d - largura[kd] / 2
    zt = np.where(forad < 12, np.minimum(zt, roadd - 2.5), zt)
    # Pit (como gerar_floripa).
    pit_xy = np.array(pit['xy'])
    dp, ip = cKDTree(pit_xy).query(q)
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
    print(f'terreno {nx}x{ny} ({nx * ny} vertices)')
    return terrain, gx, gy, zt.reshape(ny, nx)


def praca_paga(scenery, pasta, origem, gx, gy, leito=None):
    """O chao da cidade: no centro de Sao Paulo tudo o que nao e praca e calcada, asfalto ou quintal cimentado; o
    WorldCover chama de mata a copa das arvores de rua. Fora das pracas e largos do cadastro do GeoSampa (onde fica a
    cobertura medida: a grama e as arvores da Republica, do Arouche) a cobertura vira chao construido (pavimentado no
    jogo). A Praca Roosevelt e uma laje de concreto (reforma de 2012) sobre o tunel: construido tambem. `leito`
    (ruas_geosampa): a mata que a praca do cadastro leva para cima da rua vira via pavimentada, e a menos de RUA_MATA m
    dela, gramado (o tronco no meio-fio, a copa no meio da rua: usuario, 16/10/2026)."""
    from shapely.geometry import shape
    from shapely import affinity
    import shapely
    cov = scenery['cover']
    classes = np.array(list(cov['classes'])).reshape(cov['ny'], cov['nx'])
    XX, YY = np.meshgrid(gx, gy)
    praca = np.zeros(XX.shape, bool)
    roosevelt = np.zeros(XX.shape, bool)
    for f in json.loads((pasta / 'geosampa_pracas.geojson').read_text(encoding='utf-8'))['features']:
        if not f.get('geometry'):
            continue
        g = affinity.translate(shape(f['geometry']), -origem[0], -origem[1])
        dentro = shapely.contains_xy(g, XX, YY)
        if f['properties'].get('nome') == 'FRANKLIN ROOSEVELT':
            roosevelt |= dentro
        else:
            praca |= dentro
    cidade = ~praca & (classes != '6') & (classes != '7')
    classes[cidade | roosevelt] = '4'
    if leito is not None:
        na_rua, mata = gp.distancia_ate(leito, XX, YY, RUA_MATA), np.isin(classes, ['1', '2'])
        classes[mata & (na_rua <= 0)] = '7'
        classes[mata & (na_rua > 0) & (na_rua <= RUA_MATA)] = '0'
    cov['classes'] = ''.join(classes.ravel())
    print(f'cobertura da cidade: {int(cidade.sum())} celulas construidas, {int(praca.sum())} em pracas, '
          f'{int(roosevelt.sum())} na laje da Praca Roosevelt')


def arvores_rua(pasta, origem, gx, gy, buildings, o, leito=None):
    """As arvores de rua do cadastro do GeoSampa (pontos): as que caem na grade, fora das edificacoes e dos marcos. O jogo
    (landscape.js, scenery.trees) ainda tira as que ficam perto da pista, dos boxes e das arquibancadas. Com o `leito`
    (ruas_geosampa) cada uma leva a distancia do tronco a rua (m, ate 20; o jogo limita a copa por ela: landscape.js
    fitStreet) e as que caem no leito ou no meio-fio saem."""
    from shapely.geometry import Polygon
    from shapely import STRtree
    import shapely
    pts = []
    for f in json.loads((pasta / 'geosampa_arvores.geojson').read_text(encoding='utf-8'))['features']:
        g = f.get('geometry')
        if g and g['type'] == 'Point':
            pts.append(np.array(g['coordinates'][:2]) - origem)
    if not pts:
        return []
    Q = np.array(pts)
    dentro = (Q[:, 0] > gx[0] + 8) & (Q[:, 0] < gx[-1] - 8) & (Q[:, 1] > gy[0] + 8) & (Q[:, 1] < gy[-1] - 8)
    Q = Q[dentro]
    cols = {k: i for i, k in enumerate(buildings['columns'])}
    caixas = []
    for b in buildings['items']:
        x, y, w, d, h_ = b[cols['x']], b[cols['y']], b[cols['w']], b[cols['d']], b[cols['heading']]
        c, s_ = math.cos(h_), math.sin(h_)
        caixas.append(Polygon([(x + c * a * w / 2 - s_ * e * d / 2, y + s_ * a * w / 2 + c * e * d / 2) for a, e in ((-1, -1), (1, -1), (1, 1), (-1, 1))]))
    caixas += [gf.poligono_osm(o, tipo_, id_) for tipo_, id_, *_ in MARCOS.values()]
    arv = STRtree(caixas)
    livre = np.array([not len(arv.query(shapely.Point(q), predicate='intersects')) for q in Q], bool)
    print(f'arvores de rua (GeoSampa): {len(pts)} na caixa, {int(dentro.sum())} na grade, {int(livre.sum())} fora dos predios')
    Q = Q[livre]
    if leito is None:
        return np.round(Q, 2).tolist()
    d = np.minimum(gp.distancia_ate(leito, Q[:, 0], Q[:, 1], 20.0), 20.0)
    fora = d >= .4
    print(f'arvores de rua: {int((~fora).sum())} no leito ou no meio-fio saem; tronco a rua mediana {np.median(d[fora]):.1f} m')
    return [[round(float(x), 2), round(float(y), 2), round(float(r), 1)] for (x, y), r in zip(Q[fora], d[fora])]


def solo_geosampa(pasta, origem, gx, gy, lado=1536):
    """A cor do chao: a ortofoto de 2020 da Prefeitura (GeoSampa, WMS ORTO_RGB_2020, 10 cm), pedida a 1 m por pixel em
    blocos na caixa da grade e reduzida para `lado` px no lado maior (em vez do Sentinel-2 de 10 m: no centro da cidade
    ele mistura telhados, ruas e arvores num marrom so)."""
    import requests
    from PIL import Image
    from config import ASSETS
    x0, y0 = origem[0] + gx[0], origem[1] + gy[0]
    x1, y1 = origem[0] + gx[-1], origem[1] + gy[-1]
    W, H = int(round(x1 - x0)), int(round(y1 - y0))
    img = Image.new('RGB', (W, H))
    cache = pasta / 'geosampa' / 'orto_2020_1m'
    cache.mkdir(parents=True, exist_ok=True)
    bloco = 1000
    for by in range(0, H, bloco):
        for bx in range(0, W, bloco):
            w_, h_ = min(bloco, W - bx), min(bloco, H - by)
            arq = cache / f'{int(x0 + bx)}_{int(y1 - by - h_)}_{w_}x{h_}.jpg'
            if not arq.exists():
                params = {'service': 'WMS', 'version': '1.3.0', 'request': 'GetMap', 'layers': 'ORTO_RGB_2020', 'styles': '',
                          'crs': 'EPSG:31983', 'bbox': f'{x0 + bx},{y1 - by - h_},{x0 + bx + w_},{y1 - by}',
                          'width': w_, 'height': h_, 'format': 'image/jpeg'}
                r = requests.get('https://raster.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wms', params=params,
                                 headers={'User-Agent': 'autopobre-circuitos/1.0 (jogo Auto-Pobre Racing)'}, timeout=300)
                r.raise_for_status()
                if r.content[:2] != bytes([0xff, 0xd8]):
                    raise SystemExit(f'WMS do GeoSampa nao devolveu imagem: {r.text[:200]}')
                arq.write_bytes(r.content)
            img.paste(Image.open(arq).convert('RGB'), (bx, by))
    esc = lado / max(W, H)
    img = img.resize((int(W * esc), int(H * esc)), Image.LANCZOS)
    destino = ASSETS / f'{NOME}_solo.jpg'
    img.save(destino, quality=84, optimize=True)
    print(f'{destino.name}: ortofoto GeoSampa 2020 {W}x{H} m -> {img.size} px, {destino.stat().st_size / 1e3:.0f} kB')


def poligonos_osm(o, filtro):
    """Poligonos (local) das vias fechadas e relacoes multipolygon do OSM que passam no filtro(tags)."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    vias = {v['id']: v for v in o['vias']}
    out = []
    usados = set()
    for r in o['rel']:
        t = r.get('tags', {})
        if not filtro(t):
            continue
        partes = []
        for m in r['members']:
            if m['type'] == 'way' and m.get('role') in ('outer', '') and m['ref'] in vias:
                A = gf.linha_via(o, vias[m['ref']])
                usados.add(m['ref'])
                if len(A) >= 4:
                    partes.append(Polygon(A).buffer(0))
        if partes:
            out.append((unary_union(partes), t))
    for w in o['vias']:
        t = w.get('tags', {})
        if w['id'] in usados or not filtro(t) or w['nodes'][0] != w['nodes'][-1]:
            continue
        A = gf.linha_via(o, w)
        if len(A) >= 4:
            out.append((Polygon(A).buffer(0), t))
    return out


def altura_osm(t, area):
    for chave in ('height', 'building:height'):
        try:
            return float(str(t.get(chave, '')).replace('m', '').replace(',', '.').strip())
        except ValueError:
            pass
    try:
        return 3.1 * float(t['building:levels']) + .8
    except (KeyError, ValueError):
        return None


def edificios(o, P, largura, folga, deck_alto, pit, gx, gy, zgrade, rel, s, L, E):
    """Edificacoes do OSM (no centro de Sao Paulo quase todas com a altura da importacao da Prefeitura, PMSP): fora da
    pista e dos muros (as calcadas ficam), da faixa dos boxes e das garagens; alem da grade, o horizonte da cidade
    (skyline, com o chao de cada uma). O jogo desenha o retangulo orientado minimo da pegada."""
    from shapely.geometry import LineString
    from shapely import STRtree
    n = len(P)
    meio = largura / 2 + np.maximum(folga[-1], folga[1]) + 1.6
    faixa = []
    for i in range(n):
        j = (i + 1) % n
        if np.linalg.norm(P[j] - P[i]) > 5:
            continue
        extra = DECK_BAND if (deck_alto[i] or deck_alto[j]) else 0.0
        faixa.append(LineString([P[i], P[j]]).buffer(max(meio[i], meio[j]) + extra))
    pit_xy = np.array(pit['xy'])
    faixa.append(LineString(pit_xy).buffer(float(max(np.abs(np.array(pit['lo_arr'])).max(), np.array(pit['hi_arr']).max())) + 24))
    # As arquibancadas (19 degraus atras do recuo, o telhado e uma margem) tomam o lugar do que houver ali.
    for a in ARQUIBANCADAS:
        s0 = L - a['antes_da_chegada']
        idx = [i for i in range(n) if (s[i] - s0) % L <= a['blocos'] * 28]
        de, ate = 5.5, a['recuo'] + 17.6
        meio_ = a['lado'] * (largura[idx] / 2 + (de + ate) / 2)
        faixa.append(LineString(P[idx] + E[idx] * meio_[:, None]).buffer((ate - de) / 2 + 12.5))
    arvore = STRtree(faixa)
    from shapely.geometry import Point
    marcos_p = [gf.poligono_osm(o, tipo_, id_) for tipo_, id_, *_ in MARCOS.values()]
    lista, ceu, cont = [], [], {'pista': 0, 'sem_altura': 0, 'fora': 0, 'marco': 0}
    xmin, xmax, ymin, ymax = gx[0] + 8, gx[-1] - 8, gy[0] + 8, gy[-1] - 8
    for p, t in poligonos_osm(o, lambda t: 'building' in t and t.get('building') not in ('no', 'construction')):
        if p.is_empty or p.area < 12:
            continue
        p = max(p.geoms, key=lambda h: h.area) if p.geom_type == 'MultiPolygon' else p
        cx, cy = p.centroid.x, p.centroid.y
        if any(m.contains(Point(cx, cy)) for m in marcos_p):
            cont['marco'] += 1
            continue
        fora = not (xmin < cx < xmax and ymin < cy < ymax)
        if not fora and len(arvore.query(p.minimum_rotated_rectangle, predicate='intersects')):
            cont['pista'] += 1
            continue
        h = altura_osm(t, p.area)
        if h is None or h < 2.2:
            cont['sem_altura'] += 1
            h = 3.4 if p.area < 90 else 7.0 if p.area < 300 else 10.0
        h = min(h, 175.0)
        x, y, w_, d_, rumo = gf.retangulo(p)
        tipo = 'predio' if h >= 10 and p.area >= 60 else 'galpao' if p.area >= 600 else 'casa'
        if fora:
            cont['fora'] += 1
            chao = float(rel.terreno(np.array([x]), np.array([y]))[0])
            ceu.append([x, y, w_, d_, rumo, round(h, 2), tipo, round(chao, 2)])
        else:
            lista.append([x, y, w_, d_, rumo, round(h, 2), tipo, 'osm-pmsp'])
    print(f'edificacoes: {len(lista)} na grade ({sum(1 for e in lista if e[6] == "predio")} predios), '
          f'{len(ceu)} no horizonte; tiradas/ajustes: {cont}')
    return ({'columns': ['x', 'y', 'w', 'd', 'heading', 'h', 'kind', 'source'], 'items': lista},
            {'columns': ['x', 'y', 'w', 'd', 'heading', 'h', 'kind', 'z'], 'items': ceu})


# Marcos com modelo proprio no jogo (minhocao-landmarks.js): vias do OSM (o contorno), a altura (m, ate o topo da
# estrutura principal) e os andares. Fontes: OSM/importacao PMSP, Wikipedia e a pesquisa de 11/10/2026 (o mapa de 2004
# da Prefeitura subestima as torres: o Italia tem 165 m, a torre da Consolacao 75 m). Ficam fora das edificacoes
# genericas (o que tiver o centro dentro do contorno).
MARCOS = {
    'copan': ('way', 8100248, 'Edifício Copan', 118.0, 37),
    'italia': ('way', 251211619, 'Edifício Itália (Terraço Itália)', 165.0, 46),
    'hilton': ('way', 301967702, 'Edifício do Tribunal de Justiça (antigo Hilton)', 110.4, 33),
    'caetano_de_campos': ('way', 46929068, 'Casa Caetano de Campos (Secretaria da Educação)', 18.3, 3),
    'igreja_consolacao': ('way', 204071633, 'Igreja Nossa Senhora da Consolação', 25.6, None),
    'esther': ('way', 352147215, 'Edifício Esther', 42.0, 11),
    'andraus': ('way', 421146429, 'Edifício Andraus', 96.4, 32),
    'coreto_republica': ('way', 1496333548, 'Coreto da Praça da República', 7.0, None),
}
# Alturas que nao sao a do corpo principal (m): a torre da igreja (concluida em 1959), o Andraus com o heliponto, o
# terraco do Italia.
MARCOS_EXTRA = {'igreja_consolacao': {'tower_m': 75.0}, 'andraus': {'total_m': 115.0}, 'italia': {'deck_m': 151.0}}


def marcos(o, rel):
    out = []
    for chave, (tipo, oid, nome, h, andares) in MARCOS.items():
        p = gf.poligono_osm(o, tipo, oid)
        anel = np.array((max(p.geoms, key=lambda g: g.area) if p.geom_type == 'MultiPolygon' else p).exterior.coords)[:, :2]
        x, y, w, d, rumo = gf.retangulo(p)
        chao = rel.terreno(anel[:, 0], anel[:, 1])
        item = {'kind': chave, 'name': nome, 'x': x, 'y': y, 'w': w, 'd': d, 'heading': rumo,
                'ground': round(float(np.min(chao)), 2), 'ground_max': round(float(np.max(chao)), 2),
                'height': h, 'outline': np.round(anel, 2).tolist()}
        if andares:
            item['levels'] = andares
        item.update(MARCOS_EXTRA.get(chave, {}))
        out.append(item)
    print(f'marcos: {", ".join(m["kind"] for m in out)}')
    return out


# Faixa livre ao lado do tabuleiro alto (meta.deck_band_m): os predios encostam no Minhocao.
DECK_BAND = 2.5
LARGURA_TABULEIRO = 15.5          # o tabuleiro inteiro, entre as faces externas dos guarda-corpos
RAMPAS_FORA_DA_VOLTA = {
    'acesso_sao_joao': [38583165, 936855636],          # sobe da Av. Sao Joao para o sentido bairro
    'saida_amaral_gurgel': [15078594, 933888339],      # desce do sentido centro para a Amaral Gurgel
    'saida_consolacao': [14409517, 554708228],         # desce do sentido centro para a Consolacao
    'acesso_marechal_deodoro': [935475710, 15807957],  # sobe da Pc. Marechal Deodoro para o sentido centro
}


def cadeia(o, ids):
    """Polilinha das vias em sequencia (cada uma comeca onde a anterior acaba)."""
    vias = {v['id']: v for v in o['vias']}
    pts = []
    for w in ids:
        A = gf.linha_via(o, vias[w])
        pts.append(A if not pts else A[1:])
    return np.vstack(pts)


def reamostra_aberta(A, passo):
    sa = comprimentos(A)
    u = np.arange(0, sa[-1] + 1e-6, passo)
    return np.column_stack([np.interp(u, sa, A[:, 0]), np.interp(u, sa, A[:, 1])]), u


def estruturas(o, P, s, L, z, largura, deck_alto, deck, tunel, ref, rel, attr):
    """Geometria do Minhocao e do tunel para os modelos (minhocao-structures.js).
    - deck: a linha do meio do tabuleiro inteiro (entre as vias dos dois sentidos), da Praca Roosevelt ao Largo Padre
      Pericles, a cada 4 m: [x, y, z do pavimento, largura]; no trecho da volta o z e o da pista. `lap` diz os trechos
      cobertos pela pista (o jogo ja desenha o asfalto e os muros ali).
    - piers: pilares a cada ~24 m onde o tabuleiro passa alto, fora das ruas que cruzam por baixo (e da Major Sertorio).
    - ramps: as alcas fora da volta, do chao ao tabuleiro.
    - tunnel: o trecho abaixo do chao (s0, s1), a parte coberta (a Consolacao e a praca) e o chao por cima em cada
      estacao (a laje da praca)."""
    from shapely.geometry import LineString
    bairro = cadeia(o, ELEVADO_BAIRRO)
    centro = cadeia(o, ELEVADO_CENTRO)[::-1]          # mesmo sentido (da Roosevelt para o Padre Pericles)
    B, tB = reamostra_aberta(bairro, 4.0)
    j = cKDTree(centro).query(B)[1]
    # Ponto mais perto na outra via (projecao no segmento).
    Cc = []
    for i, p in enumerate(B):
        best, pb = 1e9, None
        for k in (j[i] - 1, j[i]):
            if 0 <= k < len(centro) - 1:
                a, b = centro[k], centro[k + 1]
                d = b - a
                u = np.clip(np.dot(p - a, d) / max(np.dot(d, d), 1e-9), 0, 1)
                qq = a + d * u
                if np.linalg.norm(qq - p) < best:
                    best, pb = np.linalg.norm(qq - p), qq
        Cc.append(pb)
    Cc = np.array(Cc)
    sep = np.linalg.norm(Cc - B, axis=1)
    M = np.where((sep < 22)[:, None], (B + Cc) / 2, B)
    largura_d = np.where(sep < 22, LARGURA_TABULEIRO, 8.5)
    M[:, 0] = gaussian_filter1d(M[:, 0], 2, mode='nearest')
    M[:, 1] = gaussian_filter1d(M[:, 1], 2, mode='nearest')
    chao = gaussian_filter1d(rel.terreno(M[:, 0], M[:, 1]), 10, mode='nearest')
    zd = chao + ALTURA_TABULEIRO
    # No trecho da volta o tabuleiro e a pista: o z dela (estacoes do tabuleiro a menos de 9 m em planta).
    idx = np.flatnonzero(deck_alto)
    d, k = cKDTree(P[idx]).query(M)
    na_volta = d < 9
    # No trecho da volta o meio do tabuleiro E o eixo da pista (o asfalto e os muros do jogo vao em cima dele); emendas
    # suaves (~20 m) para a linha do meio entre as duas vias fora dela.
    peso = np.maximum(na_volta.astype(float), gaussian_filter1d(na_volta.astype(float), 5, mode='nearest'))
    M = M * (1 - peso[:, None]) + P[idx[k]] * peso[:, None]
    zd = zd * (1 - peso) + z[idx[k]] * peso
    largura_d = np.where(na_volta, np.maximum(largura_d, largura[idx[k]] + 2 * (.35 + .6)), largura_d)
    # O fim no Largo Padre Pericles desce ao chao nos ultimos 180 m.
    t_fim = tB[-1] - tB
    zd = np.where(t_fim < 180, chao + (zd - chao) * np.clip(t_fim / 180, 0, 1) ** 1.2, zd)
    # A ponta da Roosevelt: o tabuleiro desce para o tunel com a pista; o lado sentido centro acompanha.
    lap = gf.trechos_de(na_volta, tB, tB[-1] + 4)
    deck_out = np.column_stack([M, zd, largura_d]).round(2).tolist()
    # Pilares: onde o pavimento passa mais de 4 m acima do chao; nao sobre as ruas que cruzam por baixo.
    estradas = []
    for w in o['vias']:
        t = w.get('tags', {})
        if t.get('highway') in rota_osm.DIRIGIVEIS and 'Goulart' not in t.get('name', '') and not t.get('bridge') \
                and not t.get('tunnel') and t.get('layer', '0') in ('0', ''):
            A = gf.linha_via(o, w)
            if len(A) >= 2:
                estradas.append(LineString(A))
    from shapely import STRtree
    from shapely.geometry import Point
    arv = STRtree(estradas)
    kd_volta = cKDTree(P)
    piers = []
    ultimo = -1e9
    T_ = np.gradient(M, axis=0)
    nT = np.linalg.norm(T_, axis=1)
    T_ = np.where((nT > 1e-6)[:, None], T_ / np.maximum(nT, 1e-6)[:, None], np.array([1.0, 0.0]))
    for i in range(len(M)):
        if tB[i] - ultimo < 24 or zd[i] - chao[i] < 4.5 or tB[i] < 30 or t_fim[i] < 30:
            continue
        # Uma rua cruzando por baixo (direcao a mais de 35 graus do tabuleiro) a menos de 7 m: o pilar vai adiante.
        livre = True
        for jx in arv.query(Point(M[i]).buffer(7.5)):
            e = estradas[jx]
            if e.distance(Point(M[i])) > 7.5:
                continue
            cc = np.array(e.coords)
            kq = int(np.argmin(np.linalg.norm(cc - M[i], axis=1)))
            dv = cc[min(kq + 1, len(cc) - 1)] - cc[max(kq - 1, 0)]
            if np.linalg.norm(dv) < 1e-6:
                continue
            if abs(np.dot(dv / np.linalg.norm(dv), T_[i])) < math.cos(math.radians(35)):
                livre = False
                break
        if livre:
            # Nenhuma estacao da volta (rua, rampa ou tabuleiro de baixo) passando sob este ponto do tabuleiro.
            for q in kd_volta.query_ball_point(M[i], largura.max() / 2 + 4):
                if z[q] < zd[i] - 3.0:
                    livre = False
                    break
        if livre:
            piers.append([round(float(M[i, 0]), 2), round(float(M[i, 1]), 2), round(float(chao[i]), 2), round(float(zd[i]), 2),
                          round(float(math.atan2(T_[i, 1], T_[i, 0])), 4)])
            ultimo = tB[i]
    # Alcas fora da volta: do chao ao tabuleiro (a ponta mais perto do tabuleiro sobe a ele).
    kd_deck = cKDTree(M)
    ramps = []
    for nome, ids in RAMPAS_FORA_DA_VOLTA.items():
        A = cadeia(o, ids)
        R_, tR = reamostra_aberta(A, 3.0)
        dA, kA = kd_deck.query(R_[0])
        dZ, kZ = kd_deck.query(R_[-1])
        sobe_no_fim = dZ < dA
        ch = rel.terreno(R_[:, 0], R_[:, 1])
        alvo = zd[kZ] if sobe_no_fim else zd[kA]
        u = tR / tR[-1]
        f = degrau(u if sobe_no_fim else 1 - u)
        zr = ch * (1 - f) + alvo * f
        ramps.append({'kind': nome, 'width': 7.0, 'points': np.column_stack([R_, zr]).round(2).tolist()})
    # Tunel: da descida a saida; coberto da Consolacao ao fim da praca.
    k_t = gf.corrida(tunel)
    st = s[k_t]
    i_cons, i_sobe = ref['i_cons'], ref['i_sobe']
    tunnel = {'s0': round(float(s[k_t[0]]), 1), 's1': round(float(s[k_t[-1]]) + DS, 1),
              'covered': [round(float(s[i_cons] - 14) % L, 1), round(float(s[i_sobe] + 24) % L, 1)],
              'ground': [[round(float(s[i]), 1), round(float(ref['zc'][i]), 2)] for i in k_t]}
    print(f'Minhocao: tabuleiro {tB[-1]:.0f} m ({sum(b - a for a, b in lap):.0f} m na volta), {len(piers)} pilares, '
          f'{len(ramps)} alcas fora da volta; tunel s {tunnel["s0"]}-{tunnel["s1"]}, coberto {tunnel["covered"]}')
    return {'deck': deck_out, 'lap': lap, 'piers': piers, 'ramps': ramps, 'tunnel': tunnel,
            'deck_height_m': ALTURA_TABULEIRO, 'tunnel_depth_m': PROFUNDIDADE_TUNEL}


def main():
    c = CIRCUITOS[NOME]
    pasta = pasta_fontes(NOME)
    epsg = c['epsg']
    P, s, L, attr, origem, P0, G = eixo(c, pasta, epsg)
    n = len(P)
    T, E = gp.quadro(P)
    # --- Leito entre os meios-fios (GeoSampa): nas ruas o eixo vai para o meio dele (ate 3,5 m) e a largura de corrida
    # e a medida; no Minhocao, na rampa e no tunel nada muda.
    lm, cm, ok = leito_geosampa(pasta, origem, P, E)
    rua = (attr['nivel'] == 'rua') & ~np.isin(attr['via'], RAMPA_ANA_CINTRA + SAIDA_MARTINS_FONTES + [944852952])
    rua = gaussian_filter1d(rua.astype(float), 10 / DS, mode='wrap') > .99
    ok &= rua
    idx = np.arange(n)
    desl = np.interp(idx, np.r_[idx[ok] - n, idx[ok], idx[ok] + n], np.r_[cm[ok], cm[ok], cm[ok]])
    desl = gaussian_filter1d(np.where(rua, np.clip(desl, -3.5, 3.5), 0.0), 12 / DS, mode='wrap')
    antigo = P + E * desl[:, None]
    P, s, L = gf.reamostrar_fechado(antigo)
    kk = janela_mais_perto(antigo, comprimentos(antigo), P, s, 20.0, Lp=L)
    attr = {c_: v_[kk] for c_, v_ in attr.items()}
    lm, ok = lm[kk], ok[kk]
    n = len(P)
    T, E = gp.quadro(P)
    medida = np.where(ok, lm, np.nan)
    print(f'meios-fios (GeoSampa): leito medido em {ok.mean():.0%} das estacoes, mediana {np.nanmedian(medida):.1f} m; '
          f'eixo deslocado ate {np.abs(desl).max():.1f} m')
    rel = Relevo(pasta, epsg, origem)
    z, zc, deck, tunel, ref = perfil(P, E, s, L, attr, rel, G, origem, epsg)
    ref['zc'] = zc
    # Alto: sobre pilares (mais de 4,2 m acima do chao dos lados); o resto do tabuleiro anda sobre muros cheios.
    deck_alto = deck & (z - np.minimum(zc, ref['lados']) > 4.2)
    largura = larguras(attr, deck, tunel, n, medida)
    seg = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
    grade = (np.roll(z, -1) - np.roll(z, 1)) / (seg + np.roll(seg, 1))
    kappa = gp.curvatura(P)
    raio = 1 / np.maximum(np.abs(kappa), 1e-6)
    print(f'perfil {z.min():.1f} a {z.max():.1f} m, rampa {100 * grade.min():.1f}% a {100 * grade.max():.1f}%; '
          f'tabuleiro {deck.sum() * DS:.0f} m (alto {deck_alto.sum() * DS:.0f} m), tunel {tunel.sum() * DS:.0f} m; '
          f'largura {largura.min():.1f} a {largura.max():.1f} m')
    if '--perfil' in sys.argv:
        for i in range(0, n, 20):
            print(f'  s={s[i]:6.0f} z={z[i]:6.1f} chao={zc[i]:6.1f} dz={z[i] - zc[i]:5.1f} rampa={100 * grade[i]:5.1f}% '
                  f'larg={largura[i]:4.1f} raio={min(raio[i], 999):4.0f} {attr["nivel"][i]:8s} {attr["nome"][i]}')
    if '--so-perfil' in sys.argv:
        return

    # --- Curvas, caimento e zebras (como Floripa). No tabuleiro e no tunel so o abaulamento, sem zebras.
    especial = deck | tunel
    cv = gp.curvas(kappa, s, L)
    intens = np.clip((300 - raio) / 250, 0, 1)
    bank = -np.sign(kappa) * (.01 + .015 * intens)
    bank = np.where(especial, -np.sign(kappa) * .006, bank)
    bank = gaussian_filter1d(bank, 10 / DS, mode='wrap')
    zebra_d, zebra_e = np.zeros(n), np.zeros(n)
    for cc in cv:
        if cc['raio_min'] > 120:
            continue
        idx = faixa_idx(cc['ini'], cc['fim'], n)
        if especial[idx].any():
            continue
        pico = abs(kappa[cc['apice']])
        dentro = [i for i in idx if abs(kappa[i]) > .7 * pico]
        a = int(np.where(idx == cc['apice'])[0][0])
        saida = list(idx[a:]) + [(idx[-1] + q) % n for q in range(1, 6)]
        (zebra_e if cc['lado'] > 0 else zebra_d)[dentro] = 1
        (zebra_d if cc['lado'] > 0 else zebra_e)[[i for i in saida if abs(kappa[i]) < .8 * pico]] = 1
    print(f'{len(cv)} curvas; raio minimo {min(cc["raio_min"] for cc in cv):.0f} m')
    trechos = trechos_nomeados(s, attr, L, deck, tunel)

    # --- Superficie da pista (pit): estacao mais proxima em planta (a Major Sertorio fica longe do outro nivel).
    kd = cKDTree(P)

    def superficie(q):
        k = kd.query(q)[1]
        dd = q - P[k]
        lat = np.sum(dd * E[k], axis=1)
        along = np.sum(dd * T[k], axis=1)
        return k, (s[k] + along) % L, lat, z[k] + grade[k] * along + bank[k] * lat

    # --- Boxes: a direita da Major Sertorio, do Minhocao a Ipiranga.
    reta = gf.corrida(np.isin(attr['via'], MAJOR_SERTORIO_RETA))
    reta_s = (float(s[reta[0]]), float(s[reta[-1]]))
    pit = gf.pit_direita(dict(PIT), reta_s, P, z, E, T, bank, largura, s, L, superficie)

    # --- Muros de concreto com alambrado (folga do asfalto a face do muro): 0,6 m nas ruas (mais nas curvas fechadas,
    # por fora), 0,35 m no tabuleiro e no tunel. A direita abrem para o pit.
    folga = {}
    for lado in (-1, 1):
        fora_da_curva = (np.sign(kappa) == -lado)
        extra = 2.4 * np.clip((45 - raio) / 30, 0, 1) * fora_da_curva
        folga[lado] = np.where(especial, .35, .6 + extra)
        folga[lado] = gaussian_filter1d(gf.maximum_filter1d_wrap(folga[lado], 9), 6 / DS, mode='wrap')
    a_pit, b_pit = (pit['entry_main_s'] - 25) % L, (pit['exit_main_s'] + 25) % L
    tem_d = ~((s >= a_pit) & (s <= b_pit)) if a_pit < b_pit else ~((s >= a_pit) | (s <= b_pit))
    rails = {'-1': gf.trechos_de(tem_d, s, L), '1': [[0.0, L]]}

    # --- Terreno.
    leito, caixa = ruas_geosampa(pasta, origem)
    terrain, gx, gy, zgrade = chao_fixado(P, s, L, z, zc, largura, folga, deck_alto, tunel, pit, rel, MARGEM, deck,
                                          leito.buffer(CALCADA).intersection(caixa))

    # --- Cenario: cobertura e solo, edificacoes do OSM, o Minhocao e o tunel.
    gp.PASSO = PASSO
    scenery = gp.cenario(NOME, pasta, epsg, np.r_[origem, 0.0], 1.0, gx, gy, P, largura, pit, s, L, T, E, {'arquibancadas': ARQUIBANCADAS})
    praca_paga(scenery, pasta, origem, gx, gy, leito)
    o = gf.osm_local(pasta, origem, epsg)
    scenery['buildings'], scenery['skyline'] = edificios(o, P, largura, folga, deck_alto, pit, gx, gy, zgrade, rel, s, L, E)
    scenery['minhocao'] = estruturas(o, P, s, L, z, largura, deck_alto, deck, tunel, ref, rel, attr)
    scenery['landmarks'] = marcos(o, rel)
    arvores = arvores_rua(pasta, origem, gx, gy, scenery['buildings'], o, leito)
    if arvores:
        scenery['trees'] = {'columns': ['x', 'y', 'road'], 'items': arvores}
    solo_geosampa(pasta, origem, gx, gy)

    frenagens = []
    for cc in cv:
        if cc['raio_min'] < 160:
            a = s[cc['ini']]
            frenagens.append([round(float((a - 120) % L), 1), round(float((a + 25) % L), 1)])
    colunas = ['s_xy_m', 'x_east_m', 'y_north_m', 'z_local_m', 'width_m', 'crossfall_left', 'grade', 'tx', 'ty',
               'left_x', 'left_y', 'fit_rmse_m', 'ground_points', 'kerb_right', 'kerb_left', 'wall_right_m', 'wall_left_m']
    rmse = np.where(especial, 0.0, np.abs(zc - z))
    samples = np.column_stack([s, P, z, largura, bank, grade, T, E, rmse, np.zeros(n), zebra_d, zebra_e, folga[-1], folga[1]])
    comp_3d = float(np.sqrt(np.sum((np.roll(P, -1, 0) - P) ** 2, axis=1) + (np.roll(z, -1) - z) ** 2).sum())
    fontes = json.loads((pasta / 'proveniencia.json').read_text(encoding='utf-8'))
    decks = [[round(float(a), 1), round(float(b), 1)] for a, b in gf.trechos_de(deck, s, L)]
    tunnels = [[round(float(a), 1), round(float(b), 1)] for a, b in gf.trechos_de(tunel, s, L)]
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
        'origin_utm': [float(origem[0]), float(origem[1]), 0.0], 'epsg': epsg, 'altitude_base_m': 0,
        'sections': trechos, 'rails': rails, 'brake_zones': frenagens,
        # Circuito de rua: muros de concreto com alambrado, zebras pintadas no asfalto.
        'barrier': 'street', 'decks': decks, 'tunnels': tunnels, 'deck_band_m': DECK_BAND,
        'kerb_colors': ['#c8201e', '#f1efe8'], 'surface_zones': [],
        'city_angle': gp.angulo_cidade(c, np.r_[origem, 0.0], epsg),
        'imaginary': True, 'street': True,
        'sources': fontes,
        'centreline': 'Vias do OpenStreetMap pela volta de pernas (gerar_minhocao.py, rota_osm.py), esquinas arredondadas, '
                      'rumo suavizado e, no Minhocão, o meio do tabuleiro.',
        'caveat': ('Circuito de rua imaginário: as ruas, o Minhocão, o túnel da Radial Leste-Oeste, o relevo (ANADEM) e os '
                   'prédios (OSM, alturas da Prefeitura) são os reais do centro de São Paulo; a subida pela rampa de saída '
                   'da Ana Cintra e o Minhocão ao contrário, a ligação de 30 m no túnel até a Rua Martins Fontes, as '
                   'larguras de corrida, as alturas do tabuleiro e do túnel, os muros e os boxes na Major Sertório são '
                   'desenho de jogo.'),
    }
    pit_out = {k_: v for k_, v in pit.items() if k_ not in ('xy', 'z_lane', 'lx_ly', 'lo_arr', 'hi_arr')}
    saida = {'meta': meta, 'columns': colunas, 'samples': np.round(samples, 5).tolist(), 'pit': pit_out,
             'terrain': terrain, 'scenery': scenery}
    destino = DADOS / f'pista_{NOME}.json'
    destino.write_text(json.dumps(saida, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    if '--sem-poda' not in sys.argv:
        # As edificacoes que o jogo desenharia sobre uma faixa que ele mantem livre saem pela propria regra dele.
        import subprocess
        from config import RAIZ
        node = RAIZ.parents[1] / 'apps' / 'node-v22.23.2-win-x64' / 'node.exe'
        subprocess.run([str(node) if node.exists() else 'node', str(Path(__file__).with_name('podar_edificios.mjs')), str(destino)], check=True)
    print(f'{destino.name}: {destino.stat().st_size / 1e6:.2f} MB')
    resumo = {k_: meta[k_] for k_ in ('reconstructed_xy_m', 'reconstructed_3d_m', 'elevation_min_m', 'elevation_max_m',
                                      'grade_min_pct', 'grade_max_pct', 'width_min_m', 'width_max_m', 'kerb_m',
                                      'pit_lane_m', 'decks', 'tunnels')}
    print(json.dumps(resumo, indent=1, ensure_ascii=False))


if __name__ == '__main__':
    main()
