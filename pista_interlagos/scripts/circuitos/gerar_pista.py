"""Gera dados/pista_<circuito>.json e teste/assets/circuitos/<circuito>_solo.jpg.

    python gerar_pista.py cascavel

Entradas (fontes/<circuito>/, ver baixar_fontes.py e refinar_eixo.py):
  eixo_refinado.json   eixo e larguras (e o pit lane, quando o OSM o traz)
  anadem.tif           relevo do terreno (ANADEM v1, 30 m, sem vegetacao)
  copernicus_dsm.tif   superficie (Copernicus GLO-30), so para validar o perfil
  worldcover.tif       cobertura do solo 2021 (ESA, 10 m)
  sentinel2_rgb.tif    cor real (Sentinel-2 L2A, 10 m) para a cor do chao ao longe
  osm.json, edificios_microsoft.geojson   vias, matas, agua e edificacoes
  mdt_idedf.tif, idedf_*.geojson          (Brasilia) MDT de 1 m, edificacoes com altura, arvores e
                                          o horizonte do cadastro do DF, no lugar do ANADEM e do OSM

O formato segue dados/pista.json de Interlagos (mesmas colunas, bloco `pit`,
grade `terrain`), com `scenery` a mais: cobertura do solo em grade, edificacoes
reais como retangulos orientados e arquibancadas. O perfil longitudinal vem do
ANADEM suavizado (comprimento de onda < ~150 m nao e resolvido por um modelo de
30 m); caimentos, zebras e muros sao escolhas de modelagem por curva.
"""
import json
import math
import sys

import numpy as np
from PIL import Image
from projecao import Transformer
from compat_scipy import (brentq, cKDTree, gaussian_filter, gaussian_filter1d, map_coordinates, maximum_filter1d,
                          minimum_filter1d, uniform_filter1d)

import geo_io
from config import ASSETS, CIRCUITOS, DADOS, pasta_fontes
from muro_barraca import FOLGA_PISTA_M, LARGURA_M, largura_muro, trecho_cheio

PASSO = 4.0          # grade do terreno (m), como Interlagos
# Modelos locais do terreno, numa grade de 2 m (config 'relevo_local' -> arquivo em fontes/<c>/).
MDT_LOCAL = {'idedf_mdt_1m': 'mdt_idedf.tif', 'goiania_curvas_5m': 'mdt_goiania.tif'}
MARGEM = 460.0       # terreno alem da caixa da pista e do pit (m)
DS = 2.0

# --- Por circuito: o que as fontes publicadas dizem e o que e modelagem declarada.
EXTRA = {
    'cascavel': {
        # Nomes na ordem da volta a partir da linha de chegada (curvas detectadas pela geometria).
        # Nomes das curvas pela posicao na volta (s do inicio da curva, a partir da chegada);
        # 'depois' nomeia a reta que comeca depois dela. So o Baciao (curva 1) tem nome
        # publicado; o resto descreve o lugar, sem inventar numeracao oficial.
        'trechos': {385: 'Bacião · curva 1', 1082: 'Dobra da reta oposta', 1239: 'Curva à direita do topo',
                    1538: 'Tangência à direita', 1872: 'Primeira das curvas gêmeas',
                    2066: 'Segunda das curvas gêmeas', 2798: 'Curva para a reta dos boxes'},
        'depois': {385: 'Reta oposta · subida', 2066: 'Reta de trás', 2798: 'Reta dos boxes · concreto, em descida'},
        'reta': 'Reta dos boxes · concreto, em descida',
        'caimento_extra': {'Bacião · curva 1': .045},      # "inclinada"; valor de modelagem
        'arquibancadas': [{'antes_da_chegada': 150, 'blocos': 7, 'lado': -1, 'recuo': 13}],
        'linha_chegada': 'meio_boxes',
        # "Concreto presente na reta de chegada" (Wikipedia; visivel nas placas da imagem).
        'concreto': True,
        'zebras': ['#c8201e', '#f1efe8'],
    },
    'piracicaba': {
        'trechos': {194: 'Curva do paddock', 400: 'Anel externo', 684: 'Entrada do miolo', 839: 'Miolo',
                    1137: 'Grampo do miolo', 1362: 'Grampo interno', 1666: 'Curva da reta principal'},
        'depois': {1666: 'Reta principal'},
        'reta': 'Reta principal',
        'caimento_extra': {},
        # Arquibancada no lado oeste da reta, antes da chegada; paddock e boxes depois dela.
        'arquibancadas': [{'antes_da_chegada': 110, 'blocos': 3, 'lado': 1, 'recuo': 12}],
        'linha_chegada': 0.36,     # fracao da reta principal (a partir do inicio dela)
        'zebras': ['#c8201e', '#f1efe8'],
        # Sem pit lane no OSM: faixa de servico a esquerda da reta, diante do paddock.
        'pit_sintetico': {'lado': 1, 'inicio': .29, 'entrada': 50, 'saida': 50, 'largura': 7.6},
    },
    'chapeco': {
        # Numeracao oficial (12 curvas, 7 a direita e 5 a esquerda, a do diagrama do autodromo) casada com a geometria do
        # eixo corrigido no editor e retificado (retificar_eixo.py): a Reta 2 e reta (a dobra de 26 graus no meio dela era
        # leitura errada do eixo medido), a dobra de 24 graus antes da reta 3 e a curva 4, a varrida longa a esquerda e a
        # curva 7 ("de alta velocidade, com 517 metros e raio aberto constante"). No projeto de 2023 (13 curvas) a dobra
        # da reta 2 contava e a varrida era a curva 8.
        'trechos': {404: 'Curva 1 · grampo', 1224: 'Curva 2', 1388: 'Curva 3', 1586: 'Curva 4', 2098: 'Curva 5 · grampo',
                    2324: 'Curva 6', 2466: 'Curva 7 · alta, raio constante', 2928: 'Curva 8', 3088: 'Curva 9',
                    3162: 'Curva 10', 3264: 'Curva 11', 3382: 'Curva 12'},
        'depois': {404: 'Reta 2', 1586: 'Reta 3', 3382: 'Reta principal'},
        'reta': 'Reta principal',
        'caimento_extra': {},
        # 30 mil lugares divulgados, sem planta publicada: arquibancadas do lado de dentro da
        # reta, de frente para os boxes (aproximacao declarada).
        'arquibancadas': [{'antes_da_chegada': 140, 'blocos': 8, 'lado': -1, 'recuo': 14}],
        'linha_chegada': 'predio_sentinel2',
        'zebras': ['#c8201e', '#f1efe8'],
        # Pit building "fora da area do tracado" (Prefeitura): do lado de fora da reta principal,
        # a esquerda no sentido horario. O OSM nao traz o pit lane; garagens na extensao do predio.
        'pit_sintetico': {'lado': 1, 'inicio': .05, 'antes_do_fim': 130, 'entrada': 60, 'saida': 60, 'largura': 7.6,
                          'fonte': 'Pit lane modelado diante do prédio dos boxes medido no Sentinel-2 (23/09/2026): '
                                   'o OSM ainda não traz a faixa dos boxes de Chapecó.'},
    },
    'brasilia': {
        # 16 curvas publicadas, 9 a direita e 7 a esquerda, sem planta numerada: a deteccao acha 12
        # trechos (6 e 6) e quatro deles tem dois apices separados, cada um uma curva na contagem
        # oficial: o canto de baixo a direita (R 34 m e 125 m), o laco (dois apices de ~65 m), o grampo
        # a direita do miolo (R 44 m e 95 m) e o grampo a esquerda (R 31 m e 75 m). Fecha 9 + 7. A reta
        # de largada, a longa (803 m, do lado leste) e a oposta (do miolo) estao entre elas.
        'trechos': {260: 'Curva 1 · de alta, inclinada a 5°', 1180: 'Curvas 2 e 3', 1548: 'Curva 4',
                    1854: 'Curvas 5 e 6 · o laço', 2310: 'Curva 7', 2639: 'Curva 8', 2908: 'Curva 9',
                    3444: 'Curvas 10 e 11 · grampo', 3715: 'Curva 12', 3987: 'Curvas 13 e 14 · grampo',
                    4453: 'Curva 15', 4905: 'Curva 16'},
        'depois': {260: 'Reta longa · 803 m', 1180: 'Reta de baixo', 2908: 'Reta oposta', 4905: 'Reta de largada'},
        'reta': 'Reta de largada',
        # Curva 1: "de alta velocidade, com 207 metros e inclinacao de 5 graus" (tan 5 = 8,75%).
        'caimento_extra': {'Curva 1 · de alta, inclinada a 5°': .0875},
        # Arquibancadas fixas recuperadas do lado de fora da reta de largada (norte), de frente para os
        # boxes: na imagem, a estrutura antiga diante da linha e os assentos azuis ate ~250 m depois
        # dela, a ~25 m do asfalto, alem do escape e do alambrado.
        'arquibancadas': [{'antes_da_chegada': 60, 'blocos': 11, 'lado': 1, 'recuo': 18}],
        'linha_chegada': 'meio_boxes',
        'zebras': ['#c8201e', '#f1efe8'],
        'fonte_boxes': ('Pit lane: OSM (vias 1450655789, 1450655791 e 32900119, 2025-2026) refinado sobre a imagem '
                        'aérea de 2025; garagens ao longo do pátio de concreto medido na imagem (o prédio antigo '
                        'foi demolido na reforma; 40 boxes novos previstos para 2026).'),
        'eixo_fonte': ('OSM (highway=raceway, via 32900091 redesenhada em fev/2026) refinado sobre a imagem aérea '
                       'de 2025, já com o asfalto novo (scripts/circuitos/refinar_eixo.py)'),
        'ressalva': ('Reconstrução para jogo. Eixo medido sobre imagem aérea; larguras publicadas (15 m na reta de '
                     'largada, 14 m no resto); perfil do MDT de 1 m do DF (IDE/DF, SEDUH) suavizado; caimento, '
                     'zebras e muros são escolhas de modelagem; a inclinação de 5° da curva 1 é a publicada.'),
    },
    'goiania': {
        # 14 curvas publicadas (MotoGP 2026), 9 a direita e 5 a esquerda, sem planta numerada: "a borda externa,
        # da curva 11 a curva 4, so tem curvas a direita" e a 5 e a primeira a esquerda (Motorsport); o asfalto
        # soltou entre as curvas 10 e 12 e ondulou na 4. A deteccao acha 10 trechos; cinco tem dois apices
        # separados por um trecho mais aberto e contam como duas curvas: a 1 (R 90 m) e a 2 (R 125 m) no fim da
        # reta principal, a 6 (R 34 m) e a 7 (R 60 m) no grampo do miolo, a 11 (R 31 m) e a 12 (R 88 m) depois do
        # S, a 13 (R 38 m) e a 14 (R 95-120 m) na curva inclinada antes da reta. Da saida da 14 a curva 1 sao
        # 995 m: a reta de 994 m publicada.
        'trechos': {762: 'Curvas 1 e 2', 1315: 'Curva 3', 1541: 'Curva 4 · grampo', 1873: 'Curva 5',
                    2107: 'Curvas 6 e 7 · grampo', 2311: 'Curva 8', 2611: 'Curva 9', 2717: 'Curva 10',
                    2799: 'Curvas 11 e 12', 3368: 'Curvas 13 e 14 · inclinada'},
        'depois': {762: 'Reta de cima · descida', 2799: 'Reta oposta', 3368: 'Reta principal · subida'},
        'reta': 'Reta principal',
        # "A reta principal [...] precedida de uma curva inclinada" (Band, 2026): sem o angulo publicado, 6%.
        'caimento_extra': {'Curvas 13 e 14 · inclinada': .06},
        # Arquibancada coberta do levantamento da Prefeitura: do lado de fora da reta (esquerda), de 174 a 250 m
        # depois da linha, a 45 m do asfalto, alem da via de servico. As do jogo ficam no mesmo trecho a 20 m.
        'arquibancadas': [{'antes_da_chegada': -170, 'blocos': 3, 'lado': 1, 'recuo': 20}],
        'linha_chegada': 'meio_boxes',
        'zebras': ['#c8201e', '#f1efe8'],
        'fonte_boxes': ('Pit lane: OSM (via 879890871) refinado sobre a ortofoto de 2016 da Prefeitura de Goiânia, com a '
                        'faixa diante das portas das garagens; garagens ao longo dos dois prédios dos boxes medidos na '
                        'imagem aérea de 09/2025 (o novo, de 2025, e o antigo; 30 boxes).'),
        'eixo_fonte': ('OSM (relação de circuito 15921950, vias 288004311 e 288004307) refinado sobre a ortofoto de 2016 '
                       'da Prefeitura de Goiânia (0,25 m) (scripts/circuitos/refinar_eixo.py)'),
        'ressalva': ('Reconstrução para jogo. Eixo medido sobre a ortofoto de 2016 da Prefeitura; larguras publicadas da '
                     'reforma de 2025-26 (15 m na reta principal, 14 m no resto); perfil do modelo das curvas de nível de '
                     '5 m da Prefeitura ajustado ao ANADEM, suavizado; caimento, zebras e muros são escolhas de modelagem.'),
    },
    'guaratiba': {
        # Em projeto (4,71 km, 10 curvas, duas retas principais paralelas), sem planta numerada. A deteccao acha 9
        # trechos; o de 203 graus a esquerda no alto do oeste (a subida do pescoco e o laco) conta como dois. A ultima, o
        # grampo de 180 graus entre as retas paralelas, e a curva 10 do projeto ("Turn 10 club overlooking the last
        # corner and the main straights"), o que confirma o sentido anti-horario.
        'trechos': {394: 'Curva 1', 549: 'Curva 2', 697: 'Curva 3', 1260: 'Curva 4', 1362: 'Curva 5',
                    1577: 'Curvas 6 e 7 · o laço', 2618: 'Curva 8', 3255: 'Curva 9', 4264: 'Curva 10 · grampo'},
        'depois': {1577: 'Reta oeste', 2618: 'Reta sul', 3255: 'Reta paralela', 4264: 'Reta de largada'},
        'reta': 'Reta de largada',
        'caimento_extra': {},
        # A arquibancada grande do render fica do lado de fora da reta oeste (a direita dos carros, que descem para o sul).
        'arquibancadas': [{'antes_da_chegada': 2690, 'blocos': 8, 'lado': -1, 'recuo': 14}],
        'linha_chegada': 'editor',
        'zebras': ['#c8201e', '#f1efe8'],
        # Boxes a direita da reta de largada, diante do predio comprido do render (com o paddock atras, a oeste):
        # garagens de ~270 m antes da linha a ~35 m depois dela.
        'pit_sintetico': {'lado': -1, 'inicio': .04, 'antes_do_fim': 250, 'entrada': 60, 'saida': 60, 'largura': 7.6,
                          'garagens': (-270, 35),
                          'fonte': 'Pit lane modelado diante do prédio dos boxes do render do projeto (Populous/Driven '
                                   'International, 2025): o autódromo ainda não foi construído.'},
        'eixo_fonte': ('Pintado no editor de traçado do jogo sobre o render aéreo oficial do projeto (Populous/Driven '
                       'International, 2025), retificado por uma câmera ajustada à ortofoto de 2025 do IPP (Prefeitura do Rio)'),
        'ressalva': ('Reconstrução para jogo de um autódromo ainda em projeto. Eixo pintado sobre o render oficial retificado; '
                     'extensão oficial de 4,71 km; larguras de grau 1 da FIA (14 m, 15 m na reta de largada); sentido e '
                     'chegada escolhidos pelo render (paddock a oeste da reta de dentro); relevo atual do terreno (ANADEM), '
                     'antes da obra; caimento, zebras, muros e boxes são escolhas de modelagem.'),
    },
    'velocitta': {
        # Traçado de competicao: 12 curvas publicadas, anti-horario, sem planta numerada. A deteccao acha 14 trechos; a dobra a
        # direita no comeco da reta oposta e a do alto, antes do grampo, nao contam. A Caipirinha (2015) faz as curvas 3 e 4, no
        # lugar das originais; a Curva do Guiga, o "saca-rolha" no fim da reta oposta, e "perna a esquerda, depois a direita, o
        # raio mais fechado, e a longa curva final" (Flatout): as curvas 8, 9 e 10. A Curva da Mata margeia a reserva florestal
        # perto do casarao do museu (Flatout), no grampo do Museu, o alto da volta (771 m). A Ferradura (2015) e a 12.
        'trechos': {342: 'Curva 1', 593: 'Curva 2', 795: 'Curva 3 · Caipirinha', 909: 'Curva 4 · Caipirinha', 1165: 'Curva 5',
                    1420: 'Curva 6 · Curva da Mata', 1664: 'Curva 7 · Grampo do Museu', 1798: 'Reta oposta · descida',
                    2275: 'Curva 8 · Curva do Guiga', 2336: 'Curva 9 · Curva do Guiga', 2394: 'Curva 10', 2523: 'Alto do Guiga',
                    2617: 'Curva 11 · grampo', 2869: 'Curva 12 · Ferradura'},
        'depois': {1165: 'Subida da mata', 1664: 'Reta oposta · descida', 2869: 'Reta dos boxes · descida'},
        'reta': 'Reta dos boxes · descida',
        'caimento_extra': {},
        # Sem arquibancada publicada (o publico fica nos camarotes sobre os boxes e nos barrancos): tres blocos do lado de
        # dentro da reta, de frente para os boxes (aproximacao declarada).
        'arquibancadas': [{'antes_da_chegada': 120, 'blocos': 3, 'lado': 1, 'recuo': 14}],
        # A linha branca de lado a lado na cabeceira do grid pintado, logo depois do predio dos boxes (imagem aerea).
        'linha_chegada': 'pit_s',
        'linha_pit_s': 497,
        'zebras': ['#c8201e', '#f1efe8'],
        'fonte_boxes': ('Pit lane: OSM (via 677322173) refinado sobre a imagem aérea; garagens diante do prédio dos boxes medido '
                        'na imagem (8 boxes publicados).'),
        'eixo_fonte': ('OSM (highway=raceway, via 478876097: o traçado de competição, com a Caipirinha e a Ferradura) refinado '
                       'sobre imagem aérea (scripts/circuitos/refinar_eixo.py); os outros trechos de asfalto (vias 1156617273, '
                       '1156617274, 478876098, 750945804, 750945805 e 718141140) medidos do mesmo jeito, fechados no jogo'),
        'ressalva': ('Reconstrução para jogo. Eixo medido sobre imagem aérea: 3.347 m, 2,8% abaixo dos 3.443 m publicados (o '
                     'traçado original mede 3.390 m contra 3.493 m: a diferença é da medição oficial), sem escala para não '
                     'descolar a pista do relevo; perfil do ANADEM (30 m) suavizado; caimento, zebras, muros, barreiras dos '
                     'trechos fechados e arquibancadas são escolhas de modelagem.'),
    },
}


def carregar(nome):
    pasta = pasta_fontes(nome)
    # O eixo refeito em retas e curvas de projeto (retificar_eixo.py), onde o config pede.
    arquivo = 'eixo_retificado.json' if CIRCUITOS[nome].get('retificar') else 'eixo_refinado.json'
    eixo = json.loads((pasta / arquivo).read_text(encoding='utf-8'))
    return pasta, eixo


class Raster:
    """Amostra um GeoTIFF (qualquer CRS) em pontos UTM do circuito."""

    def __init__(self, caminho, epsg, banda=1):
        g = geo_io.ler(caminho)
        self.a = g.banda(banda).astype(np.float64)
        self.t = g.transform
        self.nodata = g.nodata
        self.inv = Transformer.from_crs(epsg, g.epsg, always_xy=True)

    def __call__(self, x, y, ordem=3):
        u, v = self.inv.transform(np.asarray(x, float), np.asarray(y, float))
        col, lin = ~self.t * (u, v)
        return map_coordinates(self.a, [np.asarray(lin) - .5, np.asarray(col) - .5], order=ordem, mode='nearest')


def quadro(P, fechado=True):
    T = (np.roll(P, -1, 0) - np.roll(P, 1, 0)) if fechado else np.gradient(P, axis=0)
    T = T / np.linalg.norm(T, axis=1)[:, None]
    return T, np.column_stack([-T[:, 1], T[:, 0]])


def distancia_ate(geom, X, Y, ate):
    """Distancia (m) de cada ponto (X, Y) ate a area `geom` (0 dentro dela), ate `ate` m (alem disso, inf)."""
    import shapely
    pts = []
    for p in (list(geom.geoms) if hasattr(geom, 'geoms') else [geom]):
        if p.geom_type != 'Polygon' or p.is_empty:
            continue
        for anel in [p.exterior, *p.interiors]:
            A = np.array(anel.coords)[:, :2]
            for q, d in zip(A[:-1], np.diff(A, axis=0)):
                m = max(1, int(np.hypot(*d) / .5))
                pts.append(q + d * (np.arange(m)[:, None] / m))
    if not pts:
        return np.full(np.shape(X), np.inf)
    d = cKDTree(np.vstack(pts)).query(np.column_stack([np.ravel(X), np.ravel(Y)]), distance_upper_bound=ate)[0]
    shapely.prepare(geom)
    d[shapely.contains_xy(geom, np.ravel(X), np.ravel(Y))] = 0.0
    return d.reshape(np.shape(X))


def aplainar_ruas(Z, passo, dist, fixo=None, sigma=8.0, borda=8.0, corte=1.0, voltas=4, limite=1.6):
    """As ruas da cidade sem o sobe e desce do levantamento (usuario, 16/10/2026: "as ruas fora da pista estao todas
    irregulares"): o MDT de 1 m tirado nos nos da grade (`passo` m) traz meios-fios, carros e o ruido da restituicao
    para o chao. `dist`: a distancia (m) de cada no ate a area lisa (as ruas e as calcadas; 0 dentro, inf longe).
    Cada no vai a um plano ajustado ao chao em volta (peso gaussiano de `sigma` m), robusto: os pesos de Tukey a `corte` m
    do plano, em `voltas` passadas (a primeira a partir do chao do proprio no, com o dobro do corte). O plano segue as
    rampas e os cruzamentos de verdade e deixa de fora os calombos e o outro nivel: uma via no aterro ou na trincheira ao
    lado de outra (o trevo da Via Expressa, as ruas sob o Minhocao) nao se mistura com ela, e uma rampa entre os dois nao
    vira degrau. Onde os vizinhos ficam numa linha (a rua estreita na diagonal da grade) a inclinacao de lado tende a zero.
    Primeiro a area lisa, so com ela (a rua fica na altura medida dela, sem puxar o chao dos lotes, mais alto); depois a
    beira ate `borda` m, com o chao dela e a rua ja lisa, o peso caindo de 1 a 0 ate la (sem degrau nem vala na emenda,
    e o morrinho entre duas ruas de alturas diferentes fica; lotes, pracas e morros mais longe ficam como medidos).
    A correcao e de ruido: ate `limite`/2 vale inteira, ate `limite` some aos poucos, alem fica o medido; e um no na
    beira entre dois niveis (a borda da trincheira, um muro de arrimo: menos de 80% do peso dos vizinhos no plano dele,
    a metade ou menos) fica como medido, sem o degrau crescer. `fixo`: nos que nem entram nem mudam (o mar).
    Devolve o Z novo e o peso de cada no."""
    ny, nx = Z.shape
    fixo = np.zeros(Z.shape, bool) if fixo is None else fixo
    r = int(math.ceil(2.5 * sigma / passo))
    disco = [(a, b) for a in range(-r, r + 1) for b in range(-r, r + 1) if a * a + b * b <= r * r]
    g_tot = sum(math.exp(-.5 * (a * a + b * b) * (passo / sigma) ** 2) for a, b in disco)

    def plano(Zx, entra, alvo):
        """A correcao de cada no de `alvo` ate o plano robusto dos nos de `entra` em volta (0 fora de `alvo`)."""
        Zp = np.pad(np.where(entra, Zx, np.nan), r, constant_values=np.nan)
        # O plano de cada no: altura nele (h) e inclinacoes (m/m) para leste (ix) e norte (iy); comeca no chao dele.
        h, ix, iy = Zx.astype(float).copy(), np.zeros(Z.shape), np.zeros(Z.shape)
        for volta in range(voltas):
            c = corte * (2 if volta == 0 else 1)
            m = {k: np.zeros(Z.shape) for k in ('1', 'x', 'y', 'xx', 'xy', 'yy', 'z', 'zx', 'zy', 'todos')}
            for a, b in disco:
                zq = Zp[r + a:r + a + ny, r + b:r + b + nx]
                dx, dy = b * passo, a * passo
                u = (zq - (h + ix * dx + iy * dy)) / c
                g = math.exp(-.5 * (dx * dx + dy * dy) / sigma ** 2)
                w = np.nan_to_num(g * np.where(np.abs(u) < 1, (1 - u * u) ** 2, 0.0))
                m['todos'] += g * np.isfinite(zq)
                zq = np.nan_to_num(zq)
                m['1'] += w
                m['x'] += w * dx
                m['y'] += w * dy
                m['xx'] += w * dx * dx
                m['xy'] += w * dx * dy
                m['yy'] += w * dy * dy
                m['z'] += w * zq
                m['zx'] += w * zq * dx
                m['zy'] += w * zq * dy
            ok = (m['1'] > 1e-6) & alvo
            # Minimos quadrados ponderados; a inclinacao paga um pouco (2% da variancia de um disco cheio) para nao sair
            # do nada quando os vizinhos ficam numa linha.
            ridge = .02 * m['1'][ok] * sigma ** 2
            A = np.stack([np.stack([m['1'][ok], m['x'][ok], m['y'][ok]], -1),
                          np.stack([m['x'][ok], m['xx'][ok] + ridge, m['xy'][ok]], -1),
                          np.stack([m['y'][ok], m['xy'][ok], m['yy'][ok] + ridge], -1)], -2)
            sol = np.linalg.solve(A, np.stack([m['z'][ok], m['zx'][ok], m['zy'][ok]], -1)[..., None])[..., 0]
            h[ok], ix[ok], iy[ok] = sol[:, 0], sol[:, 1], sol[:, 2]
        # Menos onde quase nao ha chao do mesmo nivel em volta para dar o plano, na beira entre dois niveis e onde a
        # mudanca passa de um calombo.
        cobre = np.where(ok, m['1'], 0.0) / g_tot
        no_plano = np.where(ok, m['1'], 0.0) / np.maximum(m['todos'], 1e-9)
        return np.where(ok, (h - Zx) * np.clip(cobre / .1, 0, 1) * np.clip((no_plano - .5) / .3, 0, 1)
                        * np.clip(2 - 2 * np.abs(h - Zx) / limite, 0, 1), 0.0)

    lisa = (dist <= 0) & ~fixo
    beira = (dist > 0) & (dist <= borda) & ~fixo
    Z1 = Z + plano(Z, lisa, lisa)
    t = np.clip(1 - dist / borda, 0, 1)
    peso = np.where(lisa, 1.0, np.where(beira, t * t * (3 - 2 * t), 0.0))
    return Z1 + np.where(beira, peso, 0.0) * plano(Z1, lisa | beira, beira), peso


def curva_vertical_minima(z, ds, raio, rampa=None, fechado=True, alcance=150.0, voltas=60, raio_borda=250.0):
    """O perfil sem curvas verticais (lombadas e baixadas) mais fechadas que `raio` m, o mais perto possivel do medido
    (usuario, 24/10/2026, na Alameda Adolfo Konder de Floripa: "um desnivel acentuado que no mundo real nao tem, ta todo
    mundo capotando ali"): onde o levantamento inventa um vale ou um calombo de metros numa rua (o MDT fotogrametrico sob
    as copas de uma alameda), so fica a forma suave. `raio`: um por estacao (inf onde nao vale). Minimos quadrados: cada
    estacao perto da sua altura, e a segunda diferenca paga onde passa do limite, o peso dela subindo a cada passada (ate
    `voltas`) ate caber. Mexe so numa janela de `alcance` m em volta das estacoes com limite (as duas ultimas de cada ponta
    presas): o resto do perfil fica exatamente como estava; na janela, fora delas, nenhuma curva fica mais fechada do que
    era nem que `raio_borda` m (a emenda espalha). `rampa` (m/m): sem passar dessa rampa (a do corte e aterro).
    `fechado`: o perfil da volta (a janela pode passar da linha de chegada)."""
    z = np.asarray(z, float)
    n = len(z)
    raio = np.broadcast_to(np.asarray(raio, float), (n,))
    out = z.copy()
    limitado = np.isfinite(raio)
    if not limitado.any():
        return out
    r = int(math.ceil(alcance / ds))
    janela = maximum_filter1d(limitado.astype(float), 2 * r + 1, mode='wrap' if fechado else 'constant') > 0
    if janela.all():
        trechos = [np.arange(n)]
    else:
        # Trechos continuos da janela; num perfil fechado o que passa da linha de chegada fica inteiro.
        i0 = int(np.flatnonzero(~janela)[0]) + 1 if fechado else 0
        ordem = (np.arange(n) + i0) % n
        trechos, atual = [], []
        for i in ordem:
            if janela[i]:
                atual.append(i)
            elif atual:
                trechos.append(np.array(atual))
                atual = []
        if atual:
            trechos.append(np.array(atual))
    for idx in trechos:
        m = len(idx)
        volta_inteira = m == n and fechado
        z0 = z[idx]
        preso = np.zeros(m, bool)
        if not volta_inteira:
            preso[[0, 1, -2, -1]] = True
        W = np.where(preso, 1e8, 1.0)
        # Segunda diferenca centrada em cada estacao (com vizinhas na janela) e primeira entre vizinhas.
        cen = np.arange(m) if volta_inteira else np.arange(1, m - 1)
        D2 = np.zeros((len(cen), m))
        D2[np.arange(len(cen)), (cen - 1) % m] = 1
        D2[np.arange(len(cen)), cen] = -2
        D2[np.arange(len(cen)), (cen + 1) % m] = 1
        # Na janela, fora das estacoes com limite, a curva nao fica mais fechada do que era (nem que `raio_borda`): sem isso
        # o trecho limitado sai reto e as pontas dele viram quinas.
        lim2 = np.where(limitado[idx[cen]], ds * ds / np.where(limitado, raio, 1.0)[idx[cen]],
                        np.maximum(np.abs(D2 @ z0), ds * ds / raio_borda))
        ant = np.arange(m) if volta_inteira else np.arange(m - 1)
        D1 = np.zeros((len(ant), m))
        D1[np.arange(len(ant)), ant] = -1
        D1[np.arange(len(ant)), (ant + 1) % m] = 1
        lim1 = np.full(len(ant), np.inf if rampa is None else rampa * ds)
        p2, p1 = np.zeros(len(cen)), np.zeros(len(ant))
        zz = z0.copy()
        for _ in range(voltas):
            v2 = np.abs(D2 @ zz) > lim2 * 1.02
            v1 = np.abs(D1 @ zz) > lim1 * 1.005
            if not v2.any() and not v1.any():
                break
            p2[v2] = np.maximum(p2[v2] * 3, 1.0)
            p1[v1] = np.maximum(p1[v1] * 3, 1.0)
            A = np.diag(W) + D2.T @ (p2[:, None] * D2) + D1.T @ (p1[:, None] * D1)
            zz = np.linalg.solve(A, W * z0)
        out[idx] = zz
    return out


def curvatura(P, janela=10.0):
    T, _ = quadro(P)
    rumo = np.unwrap(np.arctan2(T[:, 1], T[:, 0]))
    k = int(janela / DS)
    giro = (np.roll(rumo, -k) - np.roll(rumo, k))
    # O desenrolar deixa um salto de 2*pi na emenda do laco.
    giro = (giro + np.pi) % (2 * np.pi) - np.pi
    return gaussian_filter1d(giro / (2 * k * DS), 2, mode='wrap')


def curvas(kappa, s, L):
    """Curvas: trechos com raio menor que 350 m e giro total acima de 20 graus."""
    n = len(kappa)
    em = np.abs(kappa) > 1 / 350
    lista = []
    if em.all():
        return lista
    ini = np.argmin(em)
    k = 0
    while k < n:
        i = (ini + k) % n
        if em[i]:
            j = k
            while j < n and em[(ini + j) % n] and np.sign(kappa[(ini + j) % n]) == np.sign(kappa[i]):
                j += 1
            idx = [(ini + q) % n for q in range(k, j)]
            giro = abs(np.sum(kappa[idx])) * DS
            if giro > math.radians(20):
                apice = idx[int(np.argmax(np.abs(kappa[idx])))]
                lista.append({'ini': idx[0], 'fim': idx[-1], 'apice': apice, 'lado': int(np.sign(kappa[apice])),
                              'raio_min': float(1 / abs(kappa[apice])), 'giro_graus': float(math.degrees(giro))})
            k = j
        else:
            k += 1
    # Curvas separadas por menos de 25 m no mesmo sentido viram uma so.
    unidas = []
    for c in sorted(lista, key=lambda c: s[c['ini']]):
        if unidas and c['lado'] == unidas[-1]['lado'] and (s[c['ini']] - s[unidas[-1]['fim']]) % L < 25:
            u = unidas[-1]
            u['fim'] = c['fim']
            u['giro_graus'] += c['giro_graus']
            if c['raio_min'] < u['raio_min']:
                u['raio_min'], u['apice'] = c['raio_min'], c['apice']
        else:
            unidas.append(dict(c))
    return unidas


def alisar_rumo(P):
    """Suaviza o rumo do eixo fechado com uma gaussiana que vai de 40 m nas retas a 5 m nas
    curvas fechadas, reintegra o tracado, fecha o laco e o realinha (rotacao e translacao)
    ao eixo medido. Remove o serpentear das retas sem abrir os grampos."""
    n = len(P)
    seg = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
    L = seg.sum()
    s = np.r_[0, np.cumsum(seg[:-1])]
    d = np.roll(P, -1, 0) - P
    th = np.unwrap(np.arctan2(d[:, 1], d[:, 0]))
    volta = np.round((th[-1] - th[0] + (np.arctan2(*(d[0, ::-1])) - np.arctan2(*(d[-1, ::-1])))) / (2 * np.pi))
    tendencia = 2 * np.pi * volta * s / L
    base = th - tendencia
    sigmas = [2.5, 5, 10, 20]            # estacoes de 2 m: 5, 10, 20, 40 m
    versoes = [gaussian_filter1d(base, sg, mode='wrap') for sg in sigmas]
    kap = np.abs(np.gradient(gaussian_filter1d(base, 10, mode='wrap') + tendencia, s))
    # Peso de cada versao pela curvatura local (raio 100 m -> 5 m; raio > 600 m -> 40 m).
    nivel = np.clip(np.interp(np.log(np.maximum(kap, 1e-5)), np.log([1 / 600, 1 / 300, 1 / 150, 1 / 60]), [3, 2, 1, 0]), 0, 3)
    nivel = gaussian_filter1d(nivel, 10, mode='wrap')
    V = np.array(versoes)
    k0 = np.floor(nivel).astype(int).clip(0, 2)
    f = nivel - k0
    thn = V[k0, np.arange(n)] * (1 - f) + V[k0 + 1, np.arange(n)] * f + tendencia
    Q = np.zeros_like(P)
    Q[0] = P[0]
    for i in range(1, n):
        Q[i] = Q[i - 1] + seg[i - 1] * np.array([math.cos(thn[i - 1]), math.sin(thn[i - 1])])
    fim = Q[-1] + seg[-1] * np.array([math.cos(thn[-1]), math.sin(thn[-1])])
    Q -= np.outer(s / L, fim - P[0]) - 0
    # Realinha ao medido: rotacao e translacao de minimos quadrados.
    cp, cq = P.mean(0), Q.mean(0)
    H = (Q - cq).T @ (P - cp)
    U, _, Vt = np.linalg.svd(H)
    R = Vt.T @ U.T
    Q = (Q - cq) @ R.T + cp
    # A deriva da integracao e lenta: devolve o residuo de baixa frequencia (100 m).
    for _ in range(3):
        Q = Q + gaussian_filter1d(P - Q, 50, axis=0, mode='wrap')
    # Estacoes igualmente espacadas ao longo do eixo alisado (mesma contagem).
    from compat_scipy import CubicSpline
    fechado = np.vstack([Q, Q[:1]])
    sq = np.r_[0, np.cumsum(np.linalg.norm(np.diff(fechado, axis=0), axis=1))]
    cs = CubicSpline(sq, fechado, bc_type='periodic')
    Q = cs(np.linspace(0, sq[-1], n, endpoint=False))
    desvio = cKDTree(P).query(Q)[0]
    print(f'eixo alisado: desvio do medido media {desvio.mean():.2f} m, max {desvio.max():.2f} m')
    return Q


def main():
    nome = sys.argv[1]
    c, x = CIRCUITOS[nome], EXTRA[nome]
    pasta, eixo = carregar(nome)
    epsg = c['epsg']
    anadem = Raster(pasta / 'anadem.tif', epsg)
    # Relevo: o ANADEM (30 m) ou, em Brasilia, o MDT de 1 m do DF numa grade de 2 m (baixar_fontes.py
    # --idedf), e em Goiania o modelo das curvas de nivel de 5 m da Prefeitura (--goiania), que entao
    # serve a pista e ao terreno; o ANADEM fica so para comparar.
    mdt = MDT_LOCAL.get(c.get('relevo_local'))
    local = mdt is not None
    relevo = Raster(pasta / mdt, epsg) if local else anadem
    # Superficie das vias: o relevo suavizado em 2D (~18 m no ANADEM, 4 m no MDT local). Trechos
    # vizinhos da volta leem a mesma superficie e ficam coerentes entre si; o terreno longe das
    # vias usa o original.
    vias_dem = Raster(pasta / (mdt if local else 'anadem.tif'), epsg)
    # Goiania (suavizacao_m: 2D e ao longo da volta): as curvas de 5 m nao resolvem ondulacoes de menos de
    # ~30 m, e um degrau entre curvas vizinhas virava rampa de 8% na entrada da curva 4.
    suave_2d, suave_volta = c.get('suavizacao_m', (4.0, 6.0) if local else (None, 12.0))
    vias_dem.a = gaussian_filter(vias_dem.a, suave_2d / 2.0 if local else .6, mode='nearest')
    cop = Raster(pasta / 'copernicus_dsm.tif', epsg)

    # O eixo medido ondula (nos do OSM, ruido da deteccao): suaviza o rumo, forte nas retas.
    P = alisar_rumo(gaussian_filter1d(np.array(eixo['eixo']), 2, axis=0, mode='wrap'))
    # Larguras pintadas no editor (eixo_do_editor.py) podem ir alem das medidas: escapes asfaltados, uma reta de largada larga.
    largura = np.clip(np.array(eixo['largura_m']), 8.0, 25.0 if eixo.get('largura_do_editor') else 16.0)
    largura = uniform_filter1d(largura, 15, mode='wrap')
    n = len(P)
    seg = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
    s_bruto = np.r_[0, np.cumsum(seg[:-1])]
    L_bruto = float(seg.sum())
    boxes = eixo.get('boxes')
    Pb = np.array(boxes['eixo']) if boxes else None

    # --- Linha de chegada: s = 0 na reta principal (meio do predio dos boxes, ou meio da reta).
    T, E = quadro(P)
    kappa = curvatura(P)
    reta = np.abs(curvatura(P, 30.0)) < 1 / 700
    # Maior trecho reto do circuito: rumo dentro de +-4 graus do rumo medio do trecho.
    Ts = gaussian_filter1d(T, 5, axis=0, mode='wrap')
    rumo = np.unwrap(np.arctan2(Ts[:, 1], Ts[:, 0]))
    rumo2 = np.r_[rumo, rumo + (rumo[-1] - rumo[0] + (rumo[1] - rumo[0]))]
    melhor = (0, 0)
    for a0 in range(n):
        b0 = a0
        while b0 + 1 < a0 + n and np.ptp(rumo2[a0:b0 + 2]) < math.radians(8):
            b0 += 1
        if b0 - a0 > melhor[0]:
            melhor = (b0 - a0, a0)
    reta_ini, reta_n = melhor[1], melhor[0]
    if x['linha_chegada'] == 'meio_boxes' and Pb is not None:
        # Diante do meio do predio das garagens (medido na imagem, refinar_eixo.py).
        sb = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Pb, axis=0), axis=1))]
        meio = int(np.searchsorted(sb, sum(boxes['garagens_s']) / 2))
        i0 = int(cKDTree(P).query(Pb[meio])[1])
    elif x['linha_chegada'] == 'pit_s' and Pb is not None:
        # A linha pintada vista na imagem, na cabeceira do grid, pela distancia ao longo do pit lane (contada da entrada).
        sb = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Pb, axis=0), axis=1))]
        i0 = int(cKDTree(P).query(Pb[int(np.searchsorted(sb, x['linha_pit_s']))])[1])
    elif x['linha_chegada'] == 'editor':
        # Linha pintada no editor de traçado (eixo_do_editor.py); a reta principal e o trecho reto que a contem.
        i0 = int(cKDTree(P).query(np.array(eixo['chegada']))[1])
    elif x['linha_chegada'] == 'predio_sentinel2':
        # Sem pit lane no OSM e sem imagem aerea da pista pronta (Chapeco): o predio dos boxes e
        # a faixa clara (telhado e concreto) do lado dos boxes da maior reta, no Sentinel-2. A
        # linha fica diante do meio dele e as garagens ocupam a extensao medida.
        ini, fim = predio_sentinel2(pasta, epsg, P, E, reta_ini, reta_n, x['pit_sintetico']['lado'])
        i0 = ((ini + fim) // 2) % n
        x['reta_principal'] = ((reta_ini - (ini + fim) // 2) * DS, (reta_ini + reta_n - (ini + fim) // 2) * DS)
        x['pit_sintetico']['garagens'] = ((ini - (ini + fim) // 2) * DS, (fim - (ini + fim) // 2) * DS)
    else:
        runs = [(reta_n, (reta_ini + reta_n // 2) % n)]
        comp, meio = max(runs)
        frac = x['linha_chegada'] if isinstance(x['linha_chegada'], float) else .5
        i0 = (meio - comp // 2 + int(frac * comp)) % n
        x['reta_principal'] = (-frac * comp * DS, (1 - frac) * comp * DS)
    # Reta de chegada em s (relativo a linha): o trecho reto que contem a linha.
    cru = np.arctan2(Ts[:, 1], Ts[:, 0])
    desvio = lambda j: abs((cru[j % n] - cru[i0] + np.pi) % (2 * np.pi) - np.pi)
    ida = volta = 0
    while ida < n // 2 and desvio(i0 + ida + 1) < math.radians(5):
        ida += 1
    while volta < n // 2 and desvio(i0 - volta - 1) < math.radians(5):
        volta += 1
    reta_s = (-volta * DS, ida * DS)
    x.setdefault('reta_principal', reta_s)
    P = np.roll(P, -i0, 0)
    largura = np.roll(largura, -i0)

    # --- Relevo: ANADEM ao longo do eixo, suavizado; Copernicus so para comparar.
    z_anadem = anadem(P[:, 0], P[:, 1])
    z_relevo = relevo(P[:, 0], P[:, 1], ordem=1) if local else z_anadem
    z_cop = cop(P[:, 0], P[:, 1])
    # Ao longo da volta: 12 m no ANADEM; 6 m no MDT de 1 m, que resolve as ondulacoes da pista; 15 m nas
    # curvas de 5 m de Goiania.
    z_abs = gaussian_filter1d(vias_dem(P[:, 0], P[:, 1]), suave_volta / DS, mode='wrap')
    desnivel_terreno = float(np.ptp(z_abs))
    if c.get('desnivel_m'):
        # Pista mais nova que os modelos de terreno (ANADEM e Copernicus sao de antes da obra): a
        # terraplanagem cortou os altos e aterrou os baixos. O perfil do terreno natural e
        # comprimido em torno da media ate o desnivel publicado (Chapeco: 23 m do terreno, que o
        # projeto de 2023 citava, para os 18,5 m da pista pronta).
        media = float(z_abs.mean())
        z_abs = media + (z_abs - media) * (c['desnivel_m'] / desnivel_terreno)
    piso = relevo.a[relevo.a > -1000]
    if c.get('base_na_grade'):
        # So o relevo da caixa do terreno do jogo: um vale fundo alem dela (Chapeco: o rio a 264 m,
        # 1,5 km ao sul, 300 m abaixo da pista) deixaria a pista a 330 m de altura local.
        gx_, gy_ = (np.arange(P[:, k].min() - MARGEM, P[:, k].max() + MARGEM, 30.0) for k in (0, 1))
        GX, GY = np.meshgrid(gx_, gy_)
        piso = relevo(GX.ravel(), GY.ravel(), ordem=1)
    base = math.floor((min(z_abs.min(), np.percentile(piso, 1)) - 5) / 10) * 10
    origem = np.array([round(float(P[:, 0].mean()) / 10) * 10, round(float(P[:, 1].mean()) / 10) * 10, float(base)])
    xy = P - origem[:2]
    z = z_abs - base

    # --- Escala: so se a diferenca para a extensao oficial for pequena (< 2%).
    delta = np.roll(xy, -1, 0) - xy
    dz = np.roll(z, -1) - z
    comp3d = lambda k: float(np.sqrt(np.sum((delta * k) ** 2, axis=1) + dz ** 2).sum())
    escala = 1.0
    if abs(comp3d(1) / c['extensao_m'] - 1) < .02:
        escala = brentq(lambda k: comp3d(k) - c['extensao_m'], .97, 1.03)
    xy *= escala
    largura *= escala
    ds = np.linalg.norm(np.roll(xy, -1, 0) - xy, axis=1)
    s = np.r_[0, np.cumsum(ds[:-1])]
    L = float(ds.sum())
    T, E = quadro(xy)
    if c.get('largura_publicada') and not eixo.get('largura_do_editor'):
        # Larguras publicadas no lugar das medidas (Brasilia: 15 m na reta de largada, 14 m no resto):
        # na imagem as areas de escape pavimentadas encostam no asfalto e alargam a medida. Transicao
        # de 40 m nas pontas da reta.
        resto, reta = c['largura_publicada']
        sr = np.where(s > L / 2, s - L, s)
        na_reta = np.clip(np.minimum(sr - reta_s[0] * escala, reta_s[1] * escala - sr) / 40 + .5, 0, 1)
        largura = resto + (reta - resto) * na_reta
    grade = (np.roll(z, -1) - np.roll(z, 1)) / (ds + np.roll(ds, 1))
    kappa = curvatura(xy)

    # --- Trechos da volta que correm lado a lado (a reta do miolo do ECPA desce junto a
    # reta principal): um canteiro de 2 m entre os asfaltos, e sem guard-rail entre eles.
    arv = cKDTree(xy)
    vizinho = np.full(n, np.inf)
    lado_viz = {-1: np.zeros(n, bool), 1: np.zeros(n, bool)}
    for i in range(n):
        for j in arv.query_ball_point(xy[i], 45):
            sep = abs(s[j] - s[i])
            if min(sep, L - sep) < 60:
                continue
            d = xy[j] - xy[i]
            e, ao = d @ E[i], d @ T[i]
            vizinho[i] = min(vizinho[i], np.hypot(e, ao))
            if abs(ao) < 12 and abs(e) < largura[i] / 2 + 5 + 8 + 3:
                lado_viz[1 if e > 0 else -1][i] = True
    largura = np.minimum(largura, np.maximum(8.0, vizinho - 2.0))
    largura = np.minimum(largura, gaussian_filter1d(largura, 3, mode='wrap'))
    # Curvas muito fechadas: a zebra de dentro (1 m alem da borda) fica a pelo menos 3,5 m do
    # centro da curva. A entrada do miolo do ECPA sai do anel externo por um entroncamento:
    # a largura medida ali (16 m) somava o asfalto do anel que segue reto, e o raio de 10 m
    # deixava a borda de dentro a 2 m do centro (a imagem mostra ~12 m de asfalto na perna).
    # O raio e o das tangentes finais, estacao a estacao (o que o carro sente).
    rumo_t = np.arctan2(T[:, 1], T[:, 0])
    giro_t = (np.roll(rumo_t, -1) - rumo_t + np.pi) % (2 * np.pi) - np.pi
    raio_loc = 1 / np.maximum(np.abs(gaussian_filter1d(giro_t / ds, 1, mode='wrap')), 1e-6)
    teto_largura = gaussian_filter1d(minimum_filter1d(2 * (raio_loc - 1.0 - 3.5), 15, mode='wrap'), 3, mode='wrap')
    largura = np.minimum(largura, np.maximum(8.0, teto_largura))
    # O DEM de 30 m nao separa dois asfaltos a poucos metros um do outro: entre trechos lado
    # a lado a diferenca de altura fica limitada a um talude de 25% no canteiro; cada perfil
    # cede metade do excesso, com a correcao espalhada suavemente ao longo da volta.
    for _ in range(4):
        corr = np.zeros(n)
        peso_c = np.zeros(n)
        for i in range(n):
            melhor = None
            for j in arv.query_ball_point(xy[i], 35):
                sep = abs(s[j] - s[i])
                if min(sep, L - sep) < 60:
                    continue
                dd = float(np.hypot(*(xy[j] - xy[i])))
                if melhor is None or dd < melhor[0]:
                    melhor = (dd, j)
            if melhor is None:
                continue
            dd, j = melhor
            vao = max(0.5, dd - largura[i] / 2 - largura[j] / 2)
            excesso = abs(z[i] - z[j]) - max(.4, .25 * vao)
            if excesso > 0:
                corr[i] += -np.sign(z[i] - z[j]) * excesso / 2
                peso_c[i] = 1
        if not peso_c.any():
            break
        z = z + gaussian_filter1d(corr, 6, mode='wrap') * 1.0
    grade = (np.roll(z, -1) - np.roll(z, 1)) / (ds + np.roll(ds, 1))

    # --- Curvas, trechos, caimento e zebras.
    cv = curvas(kappa, s, L)
    def nome_curva(sv, tabela):
        perto = min(tabela, key=lambda q: abs(q - sv)) if tabela else None
        return perto if perto is not None and abs(perto - sv) < 120 else None
    trechos = [[0.0, x['reta']]]
    nomes_cv = []
    for k, cc in enumerate(cv):
        chave = nome_curva(float(s[cc['ini']]), x['trechos'])
        nomes_cv.append(x['trechos'][chave] if chave is not None else 'Curva')
        trechos.append([round(float(s[cc['ini']]), 1), nomes_cv[-1]])
        if chave in x['depois']:
            trechos.append([round(float(s[cc['fim']]) + 15, 1), x['depois'][chave]])
    trechos.sort()
    print(f'{len(cv)} curvas detectadas:')
    for k, cc in enumerate(cv):
        print(f'  s={s[cc["ini"]]:7.1f}  {"esq" if cc["lado"] > 0 else "dir"}  raio min {cc["raio_min"]:6.1f} m  '
              f'giro {cc["giro_graus"]:5.1f} graus  {nomes_cv[k]}')

    # Caimento de projeto: o lado de dentro da curva mais baixo (ate 2,5%), 1% nas retas.
    raio = 1 / np.maximum(np.abs(kappa), 1e-6)
    intens = np.clip((400 - raio) / 300, 0, 1)
    bank = -np.sign(kappa) * (.01 + .015 * intens)
    for k, cc in enumerate(cv):
        extra = x['caimento_extra'].get(nomes_cv[k])
        if extra:
            idx = np.arange(cc['ini'], cc['fim'] + 1) if cc['fim'] >= cc['ini'] else np.r_[cc['ini']:n, 0:cc['fim'] + 1]
            bank[idx] = -cc['lado'] * extra
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

    validacao = {
        'anadem_menos_copernicus_mediana_m': float(np.median(z_anadem - z_cop)),
        'anadem_menos_copernicus_p95_abs_m': float(np.percentile(np.abs(z_anadem - z_cop), 95)),
        'suavizacao_residuo_rms_m': float(np.sqrt(np.mean((z_relevo - z_abs) ** 2))),
        **({'mdt_local_menos_anadem_mediana_m': float(np.median(z_relevo - z_anadem)),
            'mdt_local_menos_anadem_p95_abs_m': float(np.percentile(np.abs(z_relevo - z_anadem), 95))} if local else {}),
    }

    # --- Pit lane.
    pit = None
    kd = cKDTree(xy)

    def superficie(q):
        k = kd.query(q)[1]
        dd = q - xy[k]
        lat = np.sum(dd * E[k], axis=1)
        along = np.sum(dd * T[k], axis=1)
        return k, (s[k] + along) % L, lat, z[k] + grade[k] * along + bank[k] * lat

    if Pb is not None:
        pxy = (Pb - origem[:2]) * escala
        pw = np.clip(np.array(boxes['largura_m']), 6.0, 9.5) * escala
        pit = montar_pit(pxy, pw, xy, z, E, T, bank, largura, s, L, superficie, vias_dem, origem, base, escala,
                         fonte=x.get('fonte_boxes', 'Pit lane: OSM (way 628049496) refinado sobre imagem aérea de 2025; '
                                                    'garagens sob a cobertura, medidas nos transectos.'),
                         garagens_s=boxes['garagens_s'], lado=c.get('lado_boxes', 1), folga_min=c.get('folga_minima_boxes_m'),
                         trecho_folga=c.get('trecho_folga_boxes_s'), ponta_folga=c.get('muro_boxes_ponta_m', 1.0))
    elif x.get('pit_sintetico'):
        cfg = dict(x['pit_sintetico'])
        if cfg.get('garagens'):
            cfg['garagens'] = [v * escala for v in cfg['garagens']]
        pit = pit_sintetico(cfg, [v * escala for v in x['reta_principal']], xy, z, E, T, bank, largura, s, L, superficie)

    # --- Trechos fechados (Velocitta): o resto do asfalto do autodromo, fora do traçado de corrida.
    fechados = montar_fechados(eixo.get('fechados', []), origem, escala, vias_dem, base, superficie, largura) \
        if c.get('trechos_fechados') else []

    # --- Terreno: ANADEM na grade de 4 m; perto das vias segue o plano da pista.
    pontos = [xy] + ([np.array(pit['xy'])] if pit else []) + [np.array(f['samples'])[:, 1:3] for f in fechados]
    todos = np.vstack(pontos)
    x0 = math.floor((todos[:, 0].min() - MARGEM) / PASSO) * PASSO
    y0 = math.floor((todos[:, 1].min() - MARGEM) / PASSO) * PASSO
    nx = int((todos[:, 0].max() + MARGEM - x0) / PASSO) + 1
    ny = int((todos[:, 1].max() + MARGEM - y0) / PASSO) + 1
    gx = x0 + np.arange(nx) * PASSO
    gy = y0 + np.arange(ny) * PASSO
    XX, YY = np.meshgrid(gx, gy)
    q = np.column_stack([XX.ravel(), YY.ravel()])
    dem = relevo(q[:, 0] / escala + origem[0], q[:, 1] / escala + origem[1], ordem=1 if local else 3) - base
    k, _, lat, road = superficie(q)
    fora = np.abs(lat) - largura[k] / 2
    # Entre dois trechos da volta que passam perto (a menos de 26 m das bordas), o chao
    # vai de um plano ao outro em talude continuo, em vez de trocar de colar num degrau.
    dist, viz = kd.query(q, k=48, distance_upper_bound=60)
    outro = np.full(len(q), -1)
    for col in range(1, viz.shape[1]):
        j = viz[:, col]
        ok = (j < len(xy)) & (outro < 0)
        ds = np.abs(s[np.minimum(j, len(xy) - 1)] - s[k])
        ok &= np.minimum(ds, L - ds) > 60
        outro[ok] = j[ok]
    tem2 = outro >= 0
    j2 = np.where(tem2, outro, 0)
    d2 = q - xy[j2]
    lat2 = np.sum(d2 * E[j2], axis=1)
    along2 = np.sum(d2 * T[j2], axis=1)
    fora2 = np.where(tem2, np.abs(lat2) - largura[j2] / 2, np.inf)
    road2 = z[j2] + grade[j2] * along2 + bank[j2] * lat2
    duplo = tem2 & (fora2 < 26) & (fora > 0)
    f1, f2 = np.maximum(fora, 0), np.maximum(fora2, 0)
    w2 = np.where(duplo, f1 / np.maximum(f1 + f2, 1e-6), 0)
    road = road * (1 - w2) + road2 * w2
    fora_min = np.where(duplo, np.minimum(fora, fora2), fora)
    peso = np.clip((26 - fora_min) / 20, 0, 1)
    zt = dem * (1 - peso) + (road - .06) * peso
    if pit:
        pk = cKDTree(np.array(pit['xy']))
        dp, ip = pk.query(q)
        pz = np.array(pit['z_lane'])
        pl = np.array(pit['lx_ly'])
        plat = np.sum((q - np.array(pit['xy'])[ip]) * pl[ip], axis=1)
        pout = np.maximum(np.maximum(pit['lo_arr'][ip] - plat, plat - pit['hi_arr'][ip]), 0)
        # So ao lado da faixa: alem das pontas do pit (entrada, saida) vale o terreno da pista.
        pt_ = np.gradient(np.array(pit['xy']), axis=0)
        pt_ /= np.linalg.norm(pt_, axis=1)[:, None]
        adiante = np.sum((q - np.array(pit['xy'])[ip]) * pt_[ip], axis=1)
        ponta = ((ip == 0) & (adiante < -1)) | ((ip == len(pz) - 1) & (adiante > 1))
        ppeso = np.clip((22 - pout) / 16, 0, 1) * (dp < 60) * ~ponta
        usa = (ppeso > 0) & ((pout < fora) | (ppeso > peso))
        zt = np.where(usa, dem * (1 - ppeso) + (pz[ip] - .06) * ppeso, zt)
        fora = np.minimum(fora, np.where(ppeso > 0, pout, np.inf))
    zt = colar_fechados(q, zt, dem, fechados, fora)
    terrain ={'x0': float(x0), 'y0': float(y0), 'step': PASSO, 'nx': nx, 'ny': ny, 'z': np.round(zt, 2).tolist()}

    # --- Cenario: cobertura do solo, edificacoes reais, arquibancadas.
    scenery = cenario(nome, pasta, epsg, origem, escala, gx, gy, xy, largura, pit, s, L, T, E, x, fechados)
    solo(nome, pasta, epsg, origem, escala, gx, gy)

    # --- Muros/guard-rails: dos dois lados, menos do lado do pit enquanto ele corre junto
    # e onde outro trecho da volta passa ao lado.
    def trechos_de(mask):
        runs, k = [], 0
        while k < n:
            j = k
            while j < n and mask[j] == mask[k]:
                j += 1
            if mask[k] and (j - k) * DS >= 30:
                runs.append([float(s[k]), float(s[j - 1]) + DS if j < n else L])
            k = j
        return runs
    tem = {lado: gaussian_filter1d((~lado_viz[lado]).astype(float), 4, mode='wrap') > .98 for lado in (-1, 1)}
    if pit:
        a, b = (pit['entry_main_s'] - 25) % L, (pit['exit_main_s'] + 25) % L
        fora_pit = ~((s >= a) | (s <= b)) if a > b else ~((s >= a) & (s <= b))
        lado_pit = c.get('lado_boxes', 1)     # a esquerda da pista; a direita em Brasilia
        tem[lado_pit] = tem[lado_pit] & fora_pit
    rails = {str(lado): [[round(f, 1), round(t, 1)] for f, t in trechos_de(tem[lado])] for lado in (-1, 1)}
    frenagens = []
    for cc in cv:
        if cc['raio_min'] < 160:
            a = s[cc['ini']]
            frenagens.append([round(float((a - 120) % L), 1), round(float((a + 25) % L), 1)])

    colunas = ['s_xy_m', 'x_east_m', 'y_north_m', 'z_local_m', 'width_m', 'crossfall_left', 'grade', 'tx', 'ty',
               'left_x', 'left_y', 'fit_rmse_m', 'ground_points', 'kerb_right', 'kerb_left']
    rmse = np.abs(z_relevo - z_abs)
    samples = np.column_stack([s, xy, z, largura, bank, grade, T, E, rmse, np.zeros(n), zebra_d, zebra_e])
    comp_3d = float(np.sqrt(np.sum((np.roll(xy, -1, 0) - xy) ** 2, axis=1) + (np.roll(z, -1) - z) ** 2).sum())
    fontes = json.loads((pasta / 'proveniencia.json').read_text(encoding='utf-8'))
    meta = {
        'id': nome, 'name': c['nome'], 'nominal_m': c['extensao_m'], 'direction': c['sentido'],
        'reconstructed_xy_m': L, 'reconstructed_3d_m': comp_3d,
        'measured_centreline_m': float(eixo['comprimento_refinado_m']),
        'osm_centreline_m': float(eixo['comprimento_osm_m']) if eixo.get('comprimento_osm_m') is not None else None,
        'horizontal_scale_to_nominal': escala, 'difference_nominal_pct': 100 * (comp_3d / c['extensao_m'] - 1),
        'elevation_min_m': float(z_abs.min()), 'elevation_max_m': float(z_abs.max()),
        'elevation_range_m': float(np.ptp(z_abs)), 'grade_min_pct': float(100 * grade.min()),
        'grade_max_pct': float(100 * grade.max()), 'width_min_m': float(largura.min()),
        'width_max_m': float(largura.max()), 'kerb_m': float((zebra_d.sum() + zebra_e.sum()) * DS),
        'pit_lane_m': float(pit['length_m']) if pit else None, 'samples': n,
        'origin_utm': origem.tolist(), 'epsg': epsg, 'altitude_base_m': base,
        'sections': trechos, 'rails': rails, 'brake_zones': frenagens,
        'kerb_colors': x.get('zebras'),
        # Concreto na reta de chegada; os ultimos 100 m antes da curva ficam de asfalto (frenagem).
        'surface_zones': ([{'from': round(reta_s[0] * escala, 1), 'to': round(reta_s[1] * escala - 100, 1), 'kind': 'concreto'}]
                          if x.get('concreto') else []),
        'city_angle': angulo_cidade(c, origem, epsg),
        # Horizonte do jogo (landscape.js): 'rural' longe da cidade (Chapeco fica a 20 km do centro).
        **({'horizon': c['horizonte']} if c.get('horizonte') else {}),
        **({'natural_relief_m': desnivel_terreno} if c.get('desnivel_m') else {}),
        # Terreno de baixada, quase plano de verdade (Guaratiba): os testes nao pedem o desnivel de um circuito de morro.
        **({'flat_site': True} if c.get('terreno_plano') else {}),
        'elevation_check': validacao, 'sources': fontes,
        'centreline': x.get('eixo_fonte', 'OSM (highway=raceway) refinado sobre imagem aérea de 2025 (scripts/circuitos/refinar_eixo.py)'),
        'caveat': x.get('ressalva') or ('Reconstrução para jogo. Eixo e larguras medidos sobre imagem aérea; perfil do ANADEM (30 m) '
                   'suavizado; caimento, zebras e muros são escolhas de modelagem.'),
    }
    if pit:
        pit = {k: v for k, v in pit.items() if k not in ('xy', 'z_lane', 'lx_ly', 'lo_arr', 'hi_arr')}
    saida = {'meta': meta, 'columns': colunas, 'samples': np.round(samples, 5).tolist(), 'pit': pit,
             'terrain': terrain, 'scenery': scenery}
    if pit is None:
        del saida['pit']
    if fechados:
        # O asfalto fora do traçado de corrida (closed-roads.js): desenhado, com o chao colado nele, e fechado por barreiras.
        saida['closed_roads'] = fechados
    destino = DADOS / f'pista_{nome}.json'
    destino.write_text(json.dumps(saida, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    print(f'{destino.name}: {destino.stat().st_size / 1e6:.2f} MB')
    resumo = {k: meta[k] for k in ('reconstructed_xy_m', 'reconstructed_3d_m', 'horizontal_scale_to_nominal',
                                    'difference_nominal_pct', 'elevation_min_m', 'elevation_max_m', 'elevation_range_m',
                                    'grade_min_pct', 'grade_max_pct', 'width_min_m', 'width_max_m', 'kerb_m',
                                    'pit_lane_m', 'altitude_base_m', 'elevation_check')}
    print(json.dumps(resumo, indent=1, ensure_ascii=False))


def angulo_cidade(c, origem, epsg):
    """Direcao do centro da cidade (radianos, x leste, y norte), para o horizonte urbano."""
    lat, lon = c['centro_cidade']
    x, y = Transformer.from_crs(4326, epsg, always_xy=True).transform(lon, lat)
    return round(math.atan2(y - origem[1], x - origem[0]), 4)


def ramp(v, a, b):
    return np.clip((v - a) / (b - a), 0, 1)


def projetar_main_s(pxy, pt, superficie, L):
    """Distancia de volta enquanto o carro esta no pit: projetada onde ele corre junto
    da pista, interpolada onde se afasta (sempre crescente)."""
    k, main_s, lat, _ = superficie(pxy)
    return k, main_s, lat


def completar_pit(pxy, pw_lo, pw_hi, pz, pbank, main_s, gap, garagens, superficie, fonte, entry_open, wall_nose, wall_end, L,
                  muro_trechos, reverso=False, gap_bruto=None):
    """Bloco do pit no formato de Interlagos: estacoes ao longo da faixa com as garagens do lado
    positivo (a esquerda de quem anda no sentido das estacoes). Com os boxes a direita da pista
    (Brasilia) as estacoes chegam do fim para o comeco da faixa (reverso): o bloco fica girado de
    meia volta, nao espelhado, e `reversed` avisa o jogo que os carros andam no sentido contrario
    ao das estacoes (pit-lane.js, race-field.js, interlagos-pit.js)."""
    ps = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pxy, axis=0), axis=1))]
    pt, pl = quadro(pxy, fechado=False)
    end = float(ps[-1])
    pgrade = np.gradient(pz, ps)
    lane_lo, lane_hi = pw_lo.copy(), pw_hi.copy()
    g0, g1 = garagens
    zona_g = ramp(ps, g0 - 30, g0 - 10) * (1 - ramp(ps, g1 + 5, g1 + 25))
    fast_hi = lane_hi * (1 - zona_g) + (lane_lo + .52 * (lane_hi - lane_lo)) * zona_g
    bays = max(1, round((g1 - g0) / 13))
    bay = (g1 - g0) / bays
    BOX99 = bays // 2
    s99 = g0 + (BOX99 + .5) * bay
    s_cafe = s99 - bay
    DEPTH = 16.0
    front = float(np.interp(s99, ps, lane_hi))

    def at(sv, d):
        cc = np.array([np.interp(sv, ps, pxy[:, 0]), np.interp(sv, ps, pxy[:, 1])])
        nn = np.array([np.interp(sv, ps, pl[:, 0]), np.interp(sv, ps, pl[:, 1])])
        nn /= np.linalg.norm(nn)
        qq = cc + nn * d
        return [round(float(qq[0]), 3), round(float(qq[1]), 3), round(float(np.interp(sv, ps, pz) + np.interp(sv, ps, pbank) * d), 3)]

    def poly(off, a, b, esp):
        m = (ps >= a) & (ps <= b)
        qq = pxy[m] + pl[m] * off[m][:, None]
        zp = pz[m] + pbank[m] * off[m]
        return np.column_stack([qq, zp, np.broadcast_to(esp, ps.shape)[m]]).round(3).tolist()

    box_walls = [at(s99 + bay / 2, front + .2), at(s99 + bay / 2, front + DEPTH + .3), at(s_cafe - bay / 2, front + DEPTH + .3),
                 at(s_cafe - bay / 2, front + .2), at(s99 - bay / 2, front + .2)]
    rail = [[at(s99 - bay / 2, front + .6), at(s99 - bay / 2, front + 4.3)], [at(s99 - bay / 2, front + 5.7), at(s99 - bay / 2, front + DEPTH)]]
    dentro = np.abs(ps - s99) <= bay / 2 - .45
    paved_hi = lane_hi.copy()
    paved_hi[dentro] = front + DEPTH
    zona_garagem = (ps >= g0 - 12) & (ps <= g1 + 4)
    externo = lane_hi + np.where(zona_garagem, .35, 1.5)
    # Muro dos boxes entre a pista e o pit (regra de Interlagos): onde a folga passa de 6 m
    # ele afina ate 0,6 m, 1,5 m longe da faixa; ate 6 m ocupa a folga como plataforma de
    # concreto (a banca da equipe do Box 99 fica sobre ela), a 0,6 m de cada via.
    folga = np.maximum(gap, 0)
    recuo = .6 + .9 * ramp(folga, 6, 9)
    esp = np.where(folga <= 6, np.maximum(folga - 1.2, .6), np.clip(4.8 - (folga - 6) * 1.4, .6, 4.8))
    # Sob a banca do Box 99 o muro alarga para o lado da pista principal (muro_barraca.py): onde a
    # folga e grande ele ficaria a 0,6 m e a banca iria parar do outro lado do alambrado. Sem
    # passar da face da pista a 0,6 m do asfalto: onde a folga e curta a banca fica mais estreita.
    esp = largura_muro(ps, s99, esp, folga - recuo - FOLGA_PISTA_M)
    cheio = trecho_cheio(ps, s99)
    if cheio.any() and esp[cheio].min() < LARGURA_M - 1e-3:
        print(f'AVISO: folga de {folga[cheio].min():.1f} m entre os boxes e a pista no Box 99: o muro da banca '
              f'fica com {esp[cheio].min():.1f} m (a banca pede {LARGURA_M:.1f} m) para nao invadir a pista')
    muro_off = lane_lo - recuo - esp / 2
    walls = []
    for a, b in muro_trechos:
        walls.append({'name': 'Muro_boxes', 'points': poly(muro_off, a, b, esp), 'height': 1.05, 'fence': 2.6, 'fence_side': -1})
    # O muro externo para 20 m antes da ponta da saida (a faixa volta para a pista) e 6 m da entrada.
    a0, a1 = (20, end - 6) if reverso else (6, end - 20)
    if gap_bruto is not None:
        # Um eixo medido (OSM) nasce no meio da pista e a cruza em diagonal ate correr ao lado dela: o muro externo so onde
        # a faixa inteira ja saiu do asfalto da volta (Velocitta: na entrada ele ficava 1,2 m dentro da pista).
        na_pista = gap_bruto < 0
        antes, depois = np.flatnonzero(na_pista & (ps < g0)), np.flatnonzero(na_pista & (ps > g1))
        if len(antes):
            a0 = max(a0, float(ps[min(antes[-1] + 1, len(ps) - 1)]))
        if len(depois):
            a1 = min(a1, float(ps[depois[0] - 1]))
    walls += [{'name': 'Muro_externo_boxes', 'points': poly(externo, a0, s99 - bay / 2, .4), 'height': 1.0, 'fence': 0},
              {'name': 'Muro_externo_boxes', 'points': poly(externo, s99 + bay / 2, a1, .4), 'height': 1.0, 'fence': 0},
              {'name': 'Box99_paredes', 'points': [qq + [.3] for qq in box_walls], 'height': 5.2, 'fence': 0},
              *({'name': 'Box99_divisoria', 'points': [qq + [.12] for qq in r], 'height': 1.1, 'fence': 0} for r in rail)]
    amostras = np.column_stack([ps, pxy, pz, pw_lo, paved_hi, pbank, pgrade, pt, pl, main_s, lane_lo, lane_hi, fast_hi, gap])
    return {
        'columns': ['s', 'x', 'y', 'z', 'lo', 'hi', 'bank', 'grade', 'tx', 'ty', 'lx', 'ly', 'main_s', 'lane_lo', 'lane_hi', 'fast_hi', 'gap'],
        'samples': np.round(amostras, 4).tolist(), 'length_m': end, 'entry_open': float(entry_open),
        'wall_nose': float(wall_nose), 'wall_end': float(wall_end),
        'garages': [round(float(g0), 2), round(float(g1), 2)],
        # 60 km/h diante das garagens, so onde a faixa ja corre separada da pista por muro.
        # (40 m antes das garagens no sentido dos carros, 15 m depois; no bloco reverso, ao contrario em s.)
        'limit': {'from': float(max(g0 - (15 if reverso else 40), ps[np.argmax(gap > 1.0)] + 5)),
                  'to': float(min(g1 + (40 if reverso else 15), ps[len(gap) - 1 - np.argmax(gap[::-1] > 1.0)] - 5)), 'kmh': 60},
        'walls': walls,
        'box99': {'index': BOX99, 's': float(s99), 'bay': float(bay), 'cafe_s': float(s_cafe), 'front': front, 'depth': DEPTH},
        'entry_main_s': float(main_s[-1] if reverso else main_s[0]), 'exit_main_s': float(main_s[0] if reverso else main_s[-1]),
        'source': fonte, **({'reversed': True} if reverso else {}),
        # So para montar o terreno (removidos antes de gravar).
        'xy': pxy.tolist(), 'z_lane': pz.tolist(), 'lx_ly': pl.tolist(), 'lo_arr': pw_lo, 'hi_arr': paved_hi,
    }


# Trechos fechados: a barreira de uma boca fica onde ela inteira passa BARREIRA_M da borda da pista (atras do guard-rail,
# que esta a 5 m, quando ha um; sem ele, ao lado do pit, e ela que fecha), com BARREIRA_SOBRA m alem de cada borda do
# trecho.
BARREIRA_M = 6.5
BARREIRA_SOBRA = .8


def montar_fechados(lista, origem, escala, vias_dem, base, superficie, largura):
    """Trechos de asfalto fora do traçado de corrida (Velocitta: o laco das curvas 3 e 4 originais, a ultima curva original,
    as ligacoes dos circuitos curtos, o acesso do museu), medidos por refinar_eixo.py. Perfil do relevo suavizado, colado ao
    plano da pista onde corre perto dela (como o pit lane); zebras do lado de dentro das curvas fechadas; barreiras onde
    cada um sai da pista (o jogo desenha as barreiras e os carros batem nelas: closed-roads.js, physics.js)."""
    trechos = []
    for f in lista:
        P0 = (np.array(f['eixo']) - origem[:2]) * escala
        s0 = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P0, axis=0), axis=1))]
        ss = np.arange(0, s0[-1] + 1e-6, DS)
        if s0[-1] - ss[-1] > .5:
            ss = np.r_[ss, s0[-1]]
        P = np.column_stack([np.interp(ss, s0, P0[:, 0]), np.interp(ss, s0, P0[:, 1])])
        w = np.interp(ss, s0, np.array(f['largura_m']) * escala)
        w = np.clip(gaussian_filter1d(w, 5, mode='nearest'), 5.0, 14.0)
        T, E = quadro(P, fechado=False)
        k, _, lat, z_pista = superficie(P)
        gap = np.abs(lat) - largura[k] / 2
        zd = gaussian_filter1d(vias_dem(P[:, 0] / escala + origem[0], P[:, 1] / escala + origem[1]) - base, 12 / DS, mode='nearest')
        junto = gaussian_filter1d(np.clip((14 - np.maximum(gap, 0)) / 8, 0, 1), 5, mode='nearest')
        z = zd * (1 - junto) + z_pista * junto
        # Zebras: do lado de dentro onde o raio fica abaixo de 100 m (so nos trechos de traçado e nas ligacoes).
        rumo = np.unwrap(np.arctan2(T[:, 1], T[:, 0]))
        kappa = gaussian_filter1d(np.gradient(rumo, ss), 2, mode='nearest')
        curva = (np.abs(kappa) > 1 / 100) & (f['tipo'] != 'servico')
        zebra_e = (curva & (kappa > 0)).astype(float)
        zebra_d = (curva & (kappa < 0)).astype(float)
        # Folga da barreira em cada estacao: a menor distancia ate a borda da pista entre as pontas e o meio dela.
        meia = w / 2 + BARREIRA_SOBRA
        kk, _, ll, _ = superficie(np.vstack([P - E * meia[:, None], P, P + E * meia[:, None]]))
        folga = (np.abs(ll) - largura[kk] / 2).reshape(3, -1).min(0)
        trechos.append((f, ss, P, E, w, z, zebra_d, zebra_e, gap, folga))
    # Um trecho onde a barreira nunca cabe alem de BARREIRA_M (a ligacao curta, 38 m colados a pista) e area de escape
    # aberta: onde ele encosta noutro trecho, a barreira desse outro fica alem da juncao.
    juncoes = {}
    for f, ss, P, E, w, z, *_, folga in trechos:
        if folga.max() >= BARREIRA_M:
            continue
        for g in trechos:
            if g[0] is f:
                continue
            Pg = g[2]
            for ponta in (P[0], P[-1]):
                dist = np.linalg.norm(Pg - ponta, axis=1)
                j = int(np.argmin(dist))
                if dist[j] < g[4][j] / 2:
                    juncoes.setdefault(g[0]['id'], []).append(float(g[1][j]))
    saida = []
    for f, ss, P, E, w, z, zebra_d, zebra_e, gap, folga in trechos:
        # Barreiras: cada passagem da faixa de BARREIRA_M em volta da pista (as pontas, e o cruzamento do laco das curvas 3 e
        # 4 com a Caipirinha), na estacao de fora, afastada ate a barreira inteira ficar alem dela e alem das juncoes abertas.
        meia = w / 2 + BARREIRA_SOBRA
        barreiras = []
        fora = gap >= BARREIRA_M
        bocas = [(i, 1) if fora[i] else (i - 1, -1) for i in range(1, len(P)) if fora[i] != fora[i - 1]]
        for i, passo in bocas:
            # (Cada juncao aberta vale para a boca mais perto dela.)
            minhas = [sj for sj in juncoes.get(f['id'], []) if min(bocas, key=lambda b: abs(ss[b[0]] - sj))[0] == i]
            antes = lambda j: any((ss[j] - sj) * passo < 8 for sj in minhas)
            j = i
            while 0 <= j < len(P) and (folga[j] < BARREIRA_M or antes(j)):
                j += passo
            if not 0 <= j < len(P):
                continue
            a, b = P[j] - E[j] * meia[j], P[j] + E[j] * meia[j]
            barreiras.append([round(float(v), 3) for v in (*a, *b)] + [round(float(z[j]), 3)])
        amostras = np.column_stack([ss, P, z, w, E, zebra_d, zebra_e, gap])
        saida.append({'id': f['id'], 'name': f['nome'], 'kind': f['tipo'], 'osm_way': f['via_osm'], 'length_m': float(ss[-1]),
                      'columns': ['s', 'x', 'y', 'z', 'width', 'lx', 'ly', 'kerb_right', 'kerb_left', 'gap'],
                      'samples': np.round(amostras, 4).tolist(),
                      'barriers': {'columns': ['x1', 'y1', 'x2', 'y2', 'z'], 'items': barreiras}})
        print(f'  fechado {f["id"]}: {ss[-1]:.0f} m, largura {w.mean():.1f} m, z {z.min():.1f}-{z.max():.1f}, '
              f'zebras {(zebra_d.sum() + zebra_e.sum()) * DS:.0f} m, {len(barreiras)} barreira(s)')
    return saida


def colar_fechados(q, zt, dem, fechados, fora):
    """Terreno colado aos trechos fechados (como ao pit lane): onde o trecho esta mais perto que a pista (fora: distancia ate a
    borda dela), o chao vai do plano do trecho ao relevo em 20 m. Junto da pista vale o plano dela: o trecho entra de 2 a 8 m
    da borda (nas bocas e no cruzamento com a Caipirinha, a rampa da pista deixava o plano do trecho meio metro fora)."""
    if not fechados:
        return zt
    cols = fechados[0]['columns']
    ix, iy, iz, iw, ilx, ily = (cols.index(c) for c in ('x', 'y', 'z', 'width', 'lx', 'ly'))
    A = np.vstack([np.array(f['samples']) for f in fechados])
    ponta = np.concatenate([np.r_[-1, np.zeros(len(f['samples']) - 2), 1] for f in fechados])
    dist, i = cKDTree(A[:, [ix, iy]]).query(q, distance_upper_bound=60)
    ok = np.isfinite(dist)
    i = np.where(ok, i, 0)
    d = q - A[i][:, [ix, iy]]
    lat = d[:, 0] * A[i, ilx] + d[:, 1] * A[i, ily]
    adiante = d[:, 0] * A[i, ily] - d[:, 1] * A[i, ilx]       # ao longo do trecho (tangente = normal girada)
    alem = (ponta[i] < 0) & (adiante < -1) | (ponta[i] > 0) & (adiante > 1)
    out = np.maximum(np.abs(lat) - A[i, iw] / 2, 0)
    peso = np.clip((20 - out) / 16, 0, 1) * ok * ~alem
    usa = (peso > 0) & (out < fora)
    longe = np.clip((fora - 2) / 6, 0, 1)
    return np.where(usa, zt * (1 - longe) + (dem * (1 - peso) + (A[i, iz] - .06) * peso) * longe, zt)


def main_s_monotono(ps, main_s, lat, pt, T, k, L):
    align = pt[:, 0] * T[k, 0] + pt[:, 1] * T[k, 1]
    unwrapped = np.unwrap(main_s, period=L)
    confiavel = (np.abs(lat) < 25) & (align > .97)
    confiavel[[0, -1]] = True
    a_s, a_u = [], []
    for a, u in zip(ps[confiavel], unwrapped[confiavel]):
        if not a_u or u > a_u[-1] + .01:
            a_s.append(a)
            a_u.append(u)
    return np.interp(ps, a_s, a_u) % L


def montar_pit(pxy, pw, xy, z, E, T, bank, largura, s, L, superficie, vias_dem, origem, base, escala, fonte, garagens_s,
               lado=1, folga_min=None, trecho_folga=None, ponta_folga=1.0):
    """Pit lane medido (Cascavel, Brasilia): perfil do relevo, juntando-se ao plano da pista nas
    pontas. lado: 1 com os boxes a esquerda da pista no sentido da corrida, -1 a direita. trecho_folga: s do pit lane
    (da entrada) onde a folga minima vale alem das garagens (Velocitta: do predio dos boxes ate a saida). ponta_folga: folga
    ate a pista (m) onde nasce o muro dos boxes na entrada."""
    # Reamostra a cada 2 m.
    ps0 = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pxy, axis=0), axis=1))]
    ps = np.arange(0, ps0[-1] + 1e-6, DS)
    pxy = np.column_stack([np.interp(ps, ps0, pxy[:, 0]), np.interp(ps, ps0, pxy[:, 1])])
    pw = np.interp(ps, ps0, pw)
    pt, pl = quadro(pxy, fechado=False)
    k, main_s, lat, z_main = superficie(pxy)
    gap_bruto = lado * lat - pw / 2 - largura[k] / 2
    gap = np.maximum(0, gap_bruto)
    if folga_min:
        # Plataforma do muro diante das garagens, como no ECPA e em Chapeco: a banca da equipe do Box 99
        # pede o muro de 3,4 m a 0,6 m de cada via. Onde a faixa medida corre mais perto da pista ela se
        # afasta o que falta (Brasilia: ~0,3 m), com transicao suave.
        g0_, g1_ = (v * escala for v in garagens_s)
        zona = (ps > g0_ - 40) & (ps < g1_ + 40)
        if trecho_folga:
            zona |= (ps > trecho_folga[0] * escala) & (ps < trecho_folga[1] * escala)
        falta = np.where(zona, np.maximum(0, folga_min - gap), 0)
        falta = gaussian_filter1d(maximum_filter1d(falta, 41, mode='nearest'), 8, mode='nearest')
        pxy = pxy + (lado * falta)[:, None] * E[k]
        pt, pl = quadro(pxy, fechado=False)
        k, main_s, lat, z_main = superficie(pxy)
        gap_bruto = lado * lat - pw / 2 - largura[k] / 2
        gap = np.maximum(0, gap_bruto)
        print(f'pit lane afastado ate {falta.max():.2f} m da pista diante das garagens (folga minima {folga_min} m)')
    # Perfil: relevo suavizado; onde corre a menos de 12 m da pista segue o plano dela.
    zd = vias_dem(pxy[:, 0] / escala + origem[0], pxy[:, 1] / escala + origem[1]) - base
    zd = gaussian_filter1d(zd, 12 / DS, mode='nearest')
    junto = gaussian_filter1d(np.clip((14 - gap) / 8, 0, 1), 5, mode='nearest')
    pz = zd * (1 - junto) + z_main * junto
    kb = k
    pbank = bank[kb] * (pt[:, 0] * T[kb, 0] + pt[:, 1] * T[kb, 1]) * junto
    main_s = main_s_monotono(ps, main_s, lat, pt, T, k, L)
    lo, hi = -pw / 2, pw / 2
    # Garagens: o predio medido na imagem (telhado claro do lado de dentro do pit).
    g0, g1 = (v * escala for v in garagens_s)
    abertura = float(ps[np.argmax(gap > .3)])
    muro = gap > 1.0
    muro_idx = np.flatnonzero(muro & (ps > abertura))
    trechos = np.split(muro_idx, np.flatnonzero(np.diff(muro_idx) > 2) + 1)
    muro_trechos = [(ps[t[0]], ps[t[-1]]) for t in trechos if len(t) and (ps[t[-1]] - ps[t[0]]) > 30 and gap[t].min() < 8]
    if muro_trechos and ponta_folga > 1.0:
        # A ponta do muro so onde a faixa ja se afastou ponta_folga da pista (Velocitta: a entrada fica do lado de fora da
        # curva 11 e, com 1 m, a ponta ficava a 1,8 m da borda, de frente para quem abre a curva); antes dela, o zebrado.
        a, b = muro_trechos[0]
        longe = (ps >= a) & (ps <= b) & (gap >= ponta_folga)
        if longe.any():
            muro_trechos[0] = (float(ps[np.argmax(longe)]), b)
    wall_nose = muro_trechos[0][0] if muro_trechos else abertura
    wall_end = muro_trechos[-1][1] if muro_trechos else ps[-1] - 40
    print(f'pit lane {ps[-1]:.0f} m: entra em s={main_s[0]:.0f}, volta em s={main_s[-1]:.0f}; garagens {g0:.0f}-{g1:.0f} m; '
          f'muro {[(round(a), round(b)) for a, b in muro_trechos]}')
    if lado < 0:
        # Boxes a direita: as estacoes vao da saida para a entrada, com as garagens a esquerda delas
        # (meia volta do bloco; o caimento troca de sinal com o eixo lateral).
        fim = float(ps[-1])
        pxy, pz, pbank, main_s, gap, gap_bruto = pxy[::-1], pz[::-1], -pbank[::-1], main_s[::-1], gap[::-1], gap_bruto[::-1]
        lo, hi = -hi[::-1], -lo[::-1]
        g0, g1 = fim - g1, fim - g0
        # Mesmo sentido de antes: wall_nose do lado da entrada, wall_end do lado da saida.
        abertura, wall_nose, wall_end = fim - abertura, fim - wall_nose, fim - wall_end
        muro_trechos = [(fim - b, fim - a) for a, b in reversed(muro_trechos)]
    return completar_pit(pxy, lo, hi, pz, pbank, main_s, gap, (g0, g1), superficie, fonte, abertura, wall_nose, wall_end, L,
                         muro_trechos, reverso=lado < 0, gap_bruto=gap_bruto)


def predio_sentinel2(pasta, epsg, P, E, reta_ini, reta_n, lado):
    """Estacoes (sem dar a volta no indice) onde o predio dos boxes acompanha a maior reta.

    Na cor real do Sentinel-2 (10 m) o telhado e o concreto novo saturam (~250 contra ~90 do
    asfalto e da terra). Em cada estacao da reta vale o mais claro entre 12 e 40 m do eixo, do
    lado dos boxes; o predio e o maior trecho continuo acima de 180, aparado onde cai abaixo
    da metade entre o fundo e o pico."""
    s2 = Raster(pasta / 'sentinel2_rgb.tif', epsg, banda=1)
    bandas = [s2.a]
    for b in (2, 3):
        bandas.append(Raster(pasta / 'sentinel2_rgb.tif', epsg, banda=b).a)
    s2.a = np.mean(bandas, axis=0)
    idx = np.arange(reta_ini, reta_ini + reta_n + 1)
    i = idx % len(P)
    d = np.arange(12, 40.1, 1.0)
    q = P[i][:, None, :] + lado * d[None, :, None] * E[i][:, None, :]
    claro = gaussian_filter1d(s2(q[..., 0], q[..., 1], ordem=1).max(1), 2)
    acima = claro > 180
    if not acima.any():
        raise SystemExit('predio dos boxes nao encontrado no Sentinel-2')
    runs, k = [], 0
    while k < len(acima):
        j = k
        while j < len(acima) and acima[j] == acima[k]:
            j += 1
        if acima[k]:
            runs.append((j - k, k, j - 1))
        k = j
    _, a, b = max(runs)
    corte = (np.median(claro) + claro[a:b + 1].max()) / 2
    while a > 0 and claro[a - 1] > corte:
        a -= 1
    while b < len(claro) - 1 and claro[b + 1] > corte:
        b += 1
    print(f'predio dos boxes no Sentinel-2: {(b - a) * DS:.0f} m ao longo da reta '
          f'(pico {claro[a:b + 1].max():.0f}, fundo {np.median(claro):.0f})')
    return int(idx[a]), int(idx[b])


def pit_sintetico(cfg, reta, xy, z, E, T, bank, largura, s, L, superficie):
    """Faixa de servico paralela a reta principal (aproximacao declarada)."""
    lado = cfg['lado']
    r0, r1 = reta
    a = r0 + cfg['inicio'] * (r1 - r0)
    # A faixa termina perto do fim da reta (ECPA) ou antes da frenagem da curva seguinte.
    b = r1 - cfg.get('antes_do_fim', 4)
    print(f'reta principal: s de {r0:.0f} a {r1:.0f} m; faixa dos boxes de {a:.0f} a {b:.0f}')
    us = np.arange(a, b + 1e-6, DS)
    sm = us % L
    idx = np.clip(np.searchsorted(s, sm) - 1, 0, len(s) - 1)
    # Esticada ate a extensao oficial (Guaratiba, x1,008) a volta tem estacoes de mais de 2 m e a mesma estacao vinha duas
    # vezes: ponto repetido na faixa, declive NaN. Fica so a primeira (ECPA e Chapeco nao repetem e nao mudam).
    unica = np.r_[True, np.diff(idx) != 0]
    us, sm, idx = us[unica], sm[unica], idx[unica]
    # Plataforma de 4,6 m entre a pista e a faixa (muro dos boxes e banca da equipe).
    off_final = largura[idx] / 2 + 4.6 + cfg['largura'] / 2
    t = us - a
    tot = b - a
    fe, fs = cfg['entrada'], cfg['saida']
    assert tot > fe + fs + 60, 'reta curta demais para a faixa dos boxes'
    blend = np.where(t < fe, 0.5 - 0.5 * np.cos(np.pi * np.clip(t / fe, 0, 1)),
                     np.where(t > tot - fs, 0.5 + 0.5 * np.cos(np.pi * np.clip((t - (tot - fs)) / fs, 0, 1)), 1.0))
    # Nas pontas a faixa nasce/morre dentro da pista (encosta a borda).
    borda = largura[idx] / 2 - cfg['largura'] / 2 + .3
    off = lado * (borda + (off_final - borda) * blend)
    pxy = xy[idx] + E[idx] * off[:, None]
    pw = np.full(len(us), cfg['largura'])
    ps = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pxy, axis=0), axis=1))]
    pt, pl = quadro(pxy, fechado=False)
    k, main_s, lat, z_main = superficie(pxy)
    pz = z_main
    pbank = bank[k]
    main_s = sm.copy()
    gap = np.maximum(0, np.abs(lat) - pw / 2 - largura[k] / 2)
    lo, hi = -pw / 2, pw / 2
    par = np.flatnonzero(blend > .999)
    g0, g1 = ps[par[0]] + 12, ps[par[-1]] - 12
    if cfg.get('garagens'):
        # Extensao medida do predio (s da volta, relativo a linha), levada para a faixa.
        g0, g1 = (float(np.interp(v, us, ps)) for v in cfg['garagens'])
    abertura = float(ps[np.argmax(gap > .3)])
    muro_idx = np.flatnonzero(gap > 1.3)
    muro_trechos = [(ps[muro_idx[0]], ps[muro_idx[-1]])] if len(muro_idx) else []
    wall_nose = muro_trechos[0][0] if muro_trechos else abertura
    wall_end = muro_trechos[0][1] if muro_trechos else ps[-1] - 40
    print(f'pit sintetico {ps[-1]:.0f} m: entra em s={main_s[0]:.0f}, volta em s={main_s[-1]:.0f}; garagens {g0:.0f}-{g1:.0f} m')
    if lado < 0:
        # Boxes a direita (Guaratiba): como em montar_pit, as estacoes vao da saida para a entrada, com as garagens a
        # esquerda delas (meia volta do bloco; o caimento troca de sinal com o eixo lateral).
        fim = float(ps[-1])
        pxy, pz, pbank, main_s, gap = pxy[::-1], pz[::-1], -pbank[::-1], main_s[::-1], gap[::-1]
        lo, hi = -hi[::-1], -lo[::-1]
        g0, g1 = fim - g1, fim - g0
        abertura, wall_nose, wall_end = fim - abertura, fim - wall_nose, fim - wall_end
        muro_trechos = [(fim - b, fim - a) for a, b in reversed(muro_trechos)]
    return completar_pit(pxy, lo, hi, pz, pbank, main_s, gap, (g0, g1), superficie,
                         cfg.get('fonte', 'Faixa de serviço fictícia ao lado da reta principal, diante do paddock: o ECPA não tem pit lane mapeado.'),
                         abertura, wall_nose, wall_end, L, muro_trechos, reverso=lado < 0)


# --- Cenario -------------------------------------------------------------------------
# Classes da cobertura do solo (um caractere por celula da grade):
# '0' campo/grama  '1' mata  '2' arbusto/cerrado  '3' lavoura  '4' construido
# '5' solo exposto  '6' agua  '7' pavimento (vias OSM)
WORLDCOVER = {10: '1', 20: '2', 30: '0', 40: '3', 50: '4', 60: '5', 70: '5', 80: '6', 90: '0', 95: '1', 100: '0'}


def cenario(nome, pasta, epsg, origem, escala, gx, gy, xy, largura, pit, s, L, T, E, x, fechados=()):
    from shapely.geometry import Polygon, LineString, Point
    from shapely import prepared
    para_local = Transformer.from_crs(4326, epsg, always_xy=True)
    loc = lambda lon, lat: ((np.array(para_local.transform(lon, lat)).T - origem[:2]) * escala)

    # Cobertura: WorldCover (10 m, vizinho mais proximo) na grade de 4 m.
    wc = Raster(pasta / 'worldcover.tif', epsg)
    XX, YY = np.meshgrid(gx, gy)
    cls = wc(XX.ravel() / escala + origem[0], YY.ravel() / escala + origem[1], ordem=0).astype(int)
    cover = np.array([WORLDCOVER.get(v, '0') for v in cls]).reshape(XX.shape)

    osm = json.loads((pasta / 'osm.json').read_text(encoding='utf-8'))
    nos = {e['id']: (e['lon'], e['lat']) for e in osm['elements'] if e['type'] == 'node'}
    vias = [e for e in osm['elements'] if e['type'] == 'way']

    def geom(w):
        pts = [nos[n] for n in w['nodes'] if n in nos]
        if len(pts) < 2:
            return None
        arr = np.array(pts)
        return loc(arr[:, 0], arr[:, 1])

    import shapely

    def pinta(poly, ch):
        if not poly.is_valid:
            poly = poly.buffer(0)
        mnx, mny, mxx, mxy = poly.bounds
        i0, i1 = max(0, int((mnx - gx[0]) / PASSO)), min(len(gx) - 1, int((mxx - gx[0]) / PASSO) + 1)
        j0, j1 = max(0, int((mny - gy[0]) / PASSO)), min(len(gy) - 1, int((mxy - gy[0]) / PASSO) + 1)
        if i1 < i0 or j1 < j0:
            return
        sx, sy = np.meshgrid(gx[i0:i1 + 1], gy[j0:j1 + 1])
        dentro = shapely.contains_xy(poly, sx, sy)
        bloco = cover[j0:j1 + 1, i0:i1 + 1]
        bloco[dentro] = ch

    classe_area = {('natural', 'wood'): '1', ('landuse', 'forest'): '1', ('natural', 'scrub'): '2',
                   ('landuse', 'farmland'): '3', ('landuse', 'meadow'): '0', ('landuse', 'grass'): '0',
                   ('natural', 'grassland'): '0', ('natural', 'water'): '6', ('landuse', 'residential'): None,
                   ('landuse', 'industrial'): None}
    for w in vias:
        t = w.get('tags', {})
        for (kk, vv), ch in classe_area.items():
            if ch and t.get(kk) == vv and w['nodes'][0] == w['nodes'][-1]:
                g = geom(w)
                if g is not None and len(g) >= 4:
                    pinta(Polygon(g), ch)
    if CIRCUITOS[nome].get('edificios_locais') == 'goiania':
        # Matas e cerrado mapeados pela Prefeitura de Goiania (tipos 1 a 3: "Cerrado, Mata, Reflorestamento").
        from shapely.geometry import shape
        for f in json.loads((pasta / 'goiania_vegetacao.geojson').read_text(encoding='utf-8'))['features']:
            if f.get('geometry') and f['properties'].get('tp_veg') in (1, 2, 3):
                g = shape(f['geometry'])
                for parte in (g.geoms if g.geom_type == 'MultiPolygon' else [g]):
                    pinta(Polygon((np.array(parte.exterior.coords)[:, :2] - origem[:2]) * escala), '1')
    larg_via = {'motorway': 11, 'trunk': 10, 'primary': 9, 'secondary': 8, 'tertiary': 7, 'motorway_link': 6,
                'primary_link': 6, 'trunk_link': 6, 'secondary_link': 6, 'tertiary_link': 6, 'unclassified': 6,
                'residential': 6, 'service': 4}
    for w in vias:
        t = w.get('tags', {})
        hw = t.get('highway')
        if hw in larg_via and t.get('area') != 'yes':
            g = geom(w)
            if g is not None:
                pinta(LineString(g).buffer(larg_via[hw] / 2), '7')

    c = CIRCUITOS[nome]
    foto = foto_referencia(pasta, epsg) if c.get('edificios_locais') == 'idedf' else None
    if foto is not None:
        # A cobertura de 2021 e anterior a reforma: mata ou arbusto onde a imagem de 2025 mostra terra
        # vermelha exposta vira solo exposto (o miolo do autodromo foi terraplenado).
        XX4, YY4 = np.meshgrid(gx, gy)
        ux, uy = XX4 / escala + origem[0], YY4 / escala + origem[1]
        terra = np.mean([terra_na_foto(foto, ux + dx, uy + dy) for dx, dy in ((0, 0), (1.5, 0), (-1.5, 0), (0, 1.5), (0, -1.5))], axis=0)
        cx_, cy_ = foto.px(ux, uy)
        na_foto = (cx_ > 2) & (cy_ > 2) & (cx_ < foto.img.shape[1] - 3) & (cy_ < foto.img.shape[0] - 3)
        exposto = na_foto & (terra > .6) & np.isin(cover, ['0', '1', '2', '3'])
        cover[exposto] = '5'
        print(f'cobertura conferida na imagem de 2025: {int(exposto.sum())} celulas viram solo exposto')
    # Edificacoes: OSM primeiro; da Microsoft so as que nao caem sobre uma do OSM. Onde ha cadastro
    # local com altura (DF), ele substitui os dois.
    bandas = [(LineString(np.vstack([xy, xy[:1]])), np.median(largura) / 2 + 16)]
    if pit:
        bandas.append((LineString(np.array(pit['xy'])), 34))
        # Atras das garagens o jogo reserva a cobertura (23 m alem do piso, que no Box 99 vai 16 m alem da faixa: ate ~43 m
        # do eixo dela, track-clearance.js sceneryBands 'boxes').
        ps_, g0_, g1_ = np.array(pit['samples'])[:, 0], *pit['garages']
        junto_g = (ps_ >= g0_ - 5) & (ps_ <= g1_ + 5)
        if junto_g.sum() > 1:
            bandas.append((LineString(np.array(pit['xy'])[junto_g]), 46))
    for f in fechados:
        A = np.array(f['samples'])
        bandas.append((LineString(A[:, 1:3]), float(A[:, 4].max()) / 2 + 4))
    livre =lambda g: all(g.distance(linha) > folga for linha, folga in bandas)
    # As arquibancadas do jogo (track-clearance.js standLayout: blocos de 28 m, 19 degraus) tomam o
    # lugar do que houver ali (Brasilia: a estrutura velha da arquibancada coberta).
    for cfg in x['arquibancadas']:
        s0 = L - cfg['antes_da_chegada']
        idx = [i for i in range(len(s)) if (s[i] - s0) % L <= cfg['blocos'] * 28]
        if len(idx) > 1:
            meio = cfg['lado'] * (largura[idx] / 2 + cfg['recuo'] + 9)
            bandas.append((LineString(xy[idx] + E[idx] * meio[:, None]), 13))
    edificios, polys_osm, cidade = [], [], []
    if c.get('edificios_locais') == 'idedf':
        for loc_, alt_, fonte_, redondo_, nome_ in edificios_idedf(pasta, origem, escala, foto, xy):
            edificios.append((loc_, alt_, 'idedf-redondo' if redondo_ else 'idedf'))
        vias_edif = []
    else:
        vias_edif = vias
        if c.get('edificios_locais') == 'goiania':
            # Os predios do autodromo levantados pela Prefeitura vem antes do OSM e da Microsoft.
            cidade = equipamentos_goiania(pasta, origem, escala)
            edificios += cidade
            polys_osm += [p for p, _, _ in cidade]
    idx_cidade = [prepared.prep(p) for p, _, _ in cidade]
    for w in vias_edif:
        t = w.get('tags', {})
        if 'building' in t and w['nodes'][0] == w['nodes'][-1]:
            g = geom(w)
            if g is None or len(g) < 4:
                continue
            p = Polygon(g).buffer(0)
            if p.area < 12 or any(q.contains(p.centroid) for q in idx_cidade):
                continue
            polys_osm.append(p)
            alt = None
            try:
                alt = float(str(t.get('height', '')).replace('m', '').strip())
            except ValueError:
                pass
            if alt is None and t.get('building:levels'):
                try:
                    alt = 3.1 * float(t['building:levels']) + .8
                except ValueError:
                    pass
            edificios.append((p, alt, 'osm'))
    ms = pasta / 'edificios_microsoft.geojson'
    if ms.exists() and c.get('edificios_locais') != 'idedf':
        idx_osm = [prepared.prep(p) for p in polys_osm]
        for f in json.loads(ms.read_text(encoding='utf-8'))['features']:
            anel = np.array(f['geometry']['coordinates'][0])
            p = Polygon(loc(anel[:, 0], anel[:, 1])).buffer(0)
            if p.area < 12 or any(pp.contains(p.centroid) for pp in idx_osm):
                continue
            h = f['properties'].get('height', -1)
            edificios.append((p, h if h and h > 0 else None, 'microsoft'))
    if c.get('edificios_locais') == 'goiania':
        edificios = alturas_goiania(pasta, origem, escala, edificios)
    lista = []
    xmin, xmax, ymin, ymax = gx[0] + 10, gx[-1] - 10, gy[0] + 10, gy[-1] - 10
    for p, alt, fonte in edificios:
        cx, cy = p.centroid.x, p.centroid.y
        if not (xmin < cx < xmax and ymin < cy < ymax) or not livre(p) or (fonte == 'goiania' and alt is None):
            continue
        r = p.minimum_rotated_rectangle
        q = np.array(r.exterior.coords)[:4]
        a, b = q[1] - q[0], q[2] - q[1]
        la, lb = np.linalg.norm(a), np.linalg.norm(b)
        rumo = math.atan2(a[1], a[0])
        area = p.area
        if alt is None:
            alt = 3.4 if area < 90 else 5.8 if area < 250 else 7.5 if area < 1200 else 9.5
        # Galpao (telhado plano): grande, ou comprido e estreito (no DF, estruturas de 4 x 130 m ao longo
        # da reta longa nao levam telhado de telha).
        tipo = 'galpao' if area >= 600 or (fonte.startswith('idedf') and max(la, lb) > 4 * min(la, lb)) else 'casa'
        if fonte == 'idedf-redondo':
            # Estadio Mane Garrincha, ginasios: um tambor com o diametro do contorno.
            fonte, tipo = 'idedf', 'redondo'
            la = lb = 2 * math.sqrt(Polygon(p.exterior.coords).area / math.pi)
        elif (fonte == 'idedf' or '+' in fonte) and alt >= 12 and area >= 250:
            # Altura de cadastro (DF; Goiania: pavimentos do lote ou edificio em altura): bloco de apartamentos.
            tipo = 'predio'
        lista.append([round(cx, 2), round(cy, 2), round(la, 2), round(lb, 2), round(rumo, 4), round(alt, 2), tipo, fonte])
        # Pinta o chao sob a edificacao como construido.
        pinta(p, '4')
    # O asfalto da pista e do pit e desenhado pelo jogo; a cobertura so marca o entorno.
    arq = []
    for cfg in x['arquibancadas']:
        arq.append({'first_s': cfg['antes_da_chegada'], 'blocks': cfg['blocos'], 'side': cfg['lado'], 'gap': cfg['recuo']})
    contagem = {ch: int((cover == ch).sum()) for ch in '01234567'}
    arvores = arvores_idedf(pasta, origem, escala, gx, gy, bandas, foto) if c.get('edificios_locais') == 'idedf' else []
    print(f'cenario: {len(lista)} edificacoes ({sum(1 for e in lista if e[7].startswith("osm"))} OSM, '
          f'{sum(1 for e in lista if e[7] == "idedf")} IDE/DF, {sum(1 for e in lista if e[7] == "goiania")} da Prefeitura de Goiania, '
          f'{sum(1 for e in lista if "+" in e[7])} com pavimentos do cadastro), {len(arvores)} arvores isoladas, cobertura {contagem}')
    return {'cover': {'x0': float(gx[0]), 'y0': float(gy[0]), 'step': PASSO, 'nx': len(gx), 'ny': len(gy),
                      'classes': ''.join(cover.ravel()),
                      'legend': {'0': 'campo', '1': 'mata', '2': 'arbusto', '3': 'lavoura', '4': 'construido',
                                 '5': 'solo exposto', '6': 'agua', '7': 'via pavimentada'}},
            'buildings': {'columns': ['x', 'y', 'w', 'd', 'heading', 'h', 'kind', 'source'], 'items': lista},
            'stands': arq,
            **({'trees': {'columns': ['x', 'y'], 'items': arvores}} if arvores else {}),
            **(skyline_idedf(pasta, epsg, origem, escala, gx, gy, c) if c.get('edificios_locais') == 'idedf' else {}),
            **(skyline_goiania(pasta, origem, escala, gx, gy) if c.get('edificios_locais') == 'goiania' else {})}


# Predios do autodromo de Goiania no levantamento da Prefeitura (Grande Equipamento) e a altura de
# modelagem de cada um; pistas, patios e o heliponto nao sao edificacoes. A arquibancada coberta (None)
# so tira do cenario o que o OSM e a Microsoft tem ali: o jogo monta as proprias arquibancadas.
ALTURA_EQUIPAMENTO = {'Boxes': 7.0, 'Garagens': 6.0, 'Administração': 8.0, 'Cronometragem': 13.0, 'Portão de Entrada': 5.0,
                      'Arquibancada': None, 'Hangar Aeromodelos RC': 6.0}


def equipamentos_goiania(pasta, origem, escala):
    from shapely.geometry import Polygon, shape
    saida = []
    for f in json.loads((pasta / 'goiania_equipamentos.geojson').read_text(encoding='utf-8'))['features']:
        nome = f['properties'].get('nm_gre')
        if nome not in ALTURA_EQUIPAMENTO or not f.get('geometry'):
            continue
        alt = ALTURA_EQUIPAMENTO[nome]
        g = shape(f['geometry'])
        for parte in (g.geoms if g.geom_type == 'MultiPolygon' else [g]):
            saida.append((Polygon((np.array(parte.exterior.coords)[:, :2] - origem[:2]) * escala).buffer(0), alt, 'goiania'))
    return saida


def alturas_goiania(pasta, origem, escala, edificios):
    """Altura das pegadas OSM e Microsoft pelos dados da Prefeitura de Goiania: um edificio em altura
    dentro da pegada (numero de pavimentos do cadastro de edificios em altura) ou, senao, o numero de
    pavimentos do lote do cadastro imobiliario que contem o centro dela."""
    from shapely import STRtree
    from shapely.geometry import Point, Polygon, shape
    lotes, pav = [], []
    for f in json.loads((pasta / 'goiania_lotes.geojson').read_text(encoding='utf-8'))['features']:
        n = f['properties'].get('nrpaviment') or 0
        if n > 0 and f.get('geometry'):
            g = shape(f['geometry'])
            for parte in (g.geoms if g.geom_type == 'MultiPolygon' else [g]):
                lotes.append(Polygon((np.array(parte.exterior.coords)[:, :2] - origem[:2]) * escala).buffer(0))
                pav.append(n)
    arvore = STRtree(lotes) if lotes else None
    torres = [(Point((np.array(f['geometry']['coordinates'][:2]) - origem[:2]) * escala), f['properties'].get('NR_PAV') or 0)
              for f in json.loads((pasta / 'goiania_torres.geojson').read_text(encoding='utf-8'))['features']]
    saida, n_torre, n_lote = [], 0, 0
    for p, alt, fonte in edificios:
        if alt is None and fonte in ('osm', 'microsoft'):
            dentro = [n for q, n in torres if n and p.contains(q)]
            if dentro:
                alt, fonte, n_torre = 3.0 * max(dentro) + 3.0, fonte + '+torre', n_torre + 1
            elif arvore is not None:
                for k in arvore.query(p.centroid, predicate='within'):
                    alt, fonte, n_lote = 3.1 * pav[k] + .8, fonte + '+cadastro', n_lote + 1
                    break
        saida.append((p, alt, fonte))
    print(f'Prefeitura de Goiania: altura de {n_torre} pegadas pelos edificios em altura e de {n_lote} pelos lotes do cadastro')
    return saida


def skyline_goiania(pasta, origem, escala, gx, gy):
    """O horizonte de Goiania alem da grade do terreno (landscape.js createHorizon): os edificios em altura
    do cadastro da Prefeitura (numero de pavimentos) com as pegadas da Microsoft que os contem, ou um bloco
    do tamanho dos apartamentos onde nao ha pegada (Jardim Goias, Marista, Bueno, Centro), e as casas e
    galpoes da Microsoft ate 2,2 km do centro (os bairros em volta do autodromo)."""
    from shapely.geometry import Point, Polygon
    from projecao import Transformer
    T = Transformer.from_crs(4326, 31982, always_xy=True)
    fora = lambda x, y: not (gx[0] - 20 < x < gx[-1] + 20 and gy[0] - 20 < y < gy[-1] + 20)
    torres = json.loads((pasta / 'goiania_torres.geojson').read_text(encoding='utf-8'))['features']

    def retangulo(anel_lonlat):
        a = np.array(anel_lonlat)
        u, v = T.transform(a[:, 0], a[:, 1])
        p = Polygon((np.column_stack([u, v]) - origem[:2]) * escala).buffer(0)
        q = np.array(p.minimum_rotated_rectangle.exterior.coords)[:4]
        e1, e2 = q[1] - q[0], q[2] - q[1]
        return p, float(np.linalg.norm(e1)), float(np.linalg.norm(e2)), math.atan2(e1[1], e1[0])
    itens, com_pegada = [], set()
    for f in json.loads((pasta / 'goiania_torres_microsoft.geojson').read_text(encoding='utf-8'))['features']:
        p, la, lb, rumo = retangulo(f['geometry']['coordinates'][0])
        com_pegada.update(f['properties']['torres'])
        pav = max(torres[k]['properties'].get('NR_PAV') or 4 for k in f['properties']['torres'])
        if fora(p.centroid.x, p.centroid.y):
            itens.append([round(p.centroid.x, 1), round(p.centroid.y, 1), round(la, 1), round(lb, 1), round(rumo, 3), round(3.0 * pav + 3, 1), 'predio'])
    for k, f in enumerate(torres):
        if k in com_pegada:
            continue
        x, y = (np.array(f['geometry']['coordinates'][:2]) - origem[:2]) * escala
        a = f['properties']
        pav = a.get('NR_PAV') or 4
        # Sem pegada: um bloco com a area do andar tipo (apartamentos do andar x 90 m2 mais a circulacao).
        lado = math.sqrt(float(np.clip((a.get('TL_APT') or 4 * pav) / pav * 90 + 120, 250, 1200)))
        if fora(x, y):
            itens.append([round(float(x), 1), round(float(y), 1), round(lado, 1), round(lado, 1), 0.0, round(3.0 * pav + 3, 1), 'predio'])
    n_torres = len(itens)
    for f in json.loads((pasta / 'goiania_casas_microsoft.geojson').read_text(encoding='utf-8'))['features']:
        p, la, lb, rumo = retangulo(f['geometry']['coordinates'][0])
        area = p.area
        if area < 40 or not fora(p.centroid.x, p.centroid.y):
            continue
        alt = 3.4 if area < 90 else 5.8 if area < 250 else 7.5 if area < 1200 else 9.5
        itens.append([round(p.centroid.x, 1), round(p.centroid.y, 1), round(la, 1), round(lb, 1), round(rumo, 3), alt,
                      'galpao' if area >= 600 else 'casa'])
    print(f'horizonte: {n_torres} edificios em altura da Prefeitura de Goiania e {len(itens) - n_torres} casas e galpoes da Microsoft alem do terreno')
    return {'skyline': {'columns': ['x', 'y', 'w', 'd', 'heading', 'h', 'kind'], 'items': itens,
                        'source': 'Prefeitura de Goiânia, edifícios em altura (nº de pavimentos), com pegadas do Microsoft Building Footprints; '
                                  'casas e galpões até 2,2 km pelas pegadas da Microsoft'}}


def skyline_idedf(pasta, epsg, origem, escala, gx, gy, c):
    """O horizonte da cidade alem da grade do terreno (landscape.js createHorizon): os predios altos ou
    grandes do cadastro do DF ate 3,5 km, como retangulos orientados (redondos como tambor), e os marcos
    da cidade (config 'marcos': a Torre de TV)."""
    from shapely.geometry import shape, Polygon
    feicoes = json.loads((pasta / 'idedf_skyline.geojson').read_text(encoding='utf-8'))['features']
    itens = []
    for f in feicoes:
        if not f.get('geometry'):
            continue
        g = shape(f['geometry']).buffer(0)
        a = f['properties']
        for parte in (list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]):
            if parte.area < 40:
                continue
            ext = Polygon(parte.exterior.coords)
            loc = Polygon((np.array(ext.exterior.coords)[:, :2] - origem[:2]) * escala)
            cx, cy = loc.centroid.x, loc.centroid.y
            # So o que fica fora do terreno do jogo (dentro dele estao as edificacoes do cenario).
            if gx[0] - 20 < cx < gx[-1] + 20 and gy[0] - 20 < cy < gy[-1] + 20:
                continue
            alt = a.get('ed_alt_aprox') or 3.1 * (a.get('ed_num_pav') or 1) + .8
            q = np.array(loc.minimum_rotated_rectangle.exterior.coords)[:4]
            u, v = q[1] - q[0], q[2] - q[1]
            la, lb, rumo = float(np.linalg.norm(u)), float(np.linalg.norm(v)), math.atan2(u[1], u[0])
            circ = 4 * math.pi * ext.area / ext.length ** 2
            tipo = 'redondo' if circ > .82 and ext.area > 1500 else 'predio' if alt >= 9 else 'galpao'
            if tipo == 'redondo':
                la = lb = 2 * math.sqrt(loc.area / math.pi)
            itens.append([round(cx, 1), round(cy, 1), round(la, 1), round(lb, 1), round(rumo, 3), round(float(alt), 1), tipo])
    para_local = Transformer.from_crs(4326, epsg, always_xy=True)
    marcos = []
    for m in c.get('marcos', []):
        x, y = para_local.transform(m['lon'], m['lat'])
        marcos.append({'name': m['nome'], 'kind': m['tipo'], 'x': round((x - origem[0]) * escala, 1),
                       'y': round((y - origem[1]) * escala, 1), 'h': m['altura_m']})
    print(f'horizonte: {len(itens)} edificacoes do cadastro do DF alem do terreno, marcos {[m["name"] for m in marcos]}')
    return {'skyline': {'columns': ['x', 'y', 'w', 'd', 'heading', 'h', 'kind'], 'items': itens,
                        'source': 'IDE/DF, cadastro territorial (edificações com altura >= 9 m ou área >= 1.500 m²)'},
            'landmarks': marcos}


def foto_referencia(pasta, epsg):
    """Imagem aerea de referencia (Esri), so para conferir o que existe hoje; None se nao baixada."""
    if not (pasta / 'referencia_esri.jpg').exists():
        return None
    from refinar_eixo import Referencia
    return Referencia(pasta, epsg)


def terra_na_foto(foto, X, Y):
    """Fracao de terra vermelha exposta (muito saturada, vermelho acima do verde) nos pontos UTM."""
    f = foto.rgb(np.asarray(X, float), np.asarray(Y, float))
    sat = f.max(-1) - f.min(-1)
    return ((sat > 70) & (f[..., 0] > f[..., 1] + 35)).astype(float)


def verde_na_foto(foto, X, Y):
    """Copa de arvore nos pontos UTM: verde escuro (verde acima do vermelho, pouca luz)."""
    f = foto.rgb(np.asarray(X, float), np.asarray(Y, float))
    return ((f[..., 1] > f[..., 0] + 4) & (f.mean(-1) < 120)).astype(float)


def edificios_idedf(pasta, origem, escala, foto, xy):
    """Edificacoes do cadastro territorial do DF (IDE/DF) com a altura aproximada do cadastro. Perto
    da pista (300 m) so as que a imagem de 2025 ainda mostra: a reforma demoliu o predio antigo dos
    boxes e outras construcoes, onde ficou terra ou concreto."""
    from shapely.geometry import shape, Polygon
    feicoes = json.loads((pasta / 'idedf_edificacoes.geojson').read_text(encoding='utf-8'))['features']
    pista = cKDTree(xy)
    saida, demolidos = [], 0
    for f in feicoes:
        if not f.get('geometry'):
            continue
        g = shape(f['geometry']).buffer(0)
        partes = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
        a = f['properties']
        for parte in partes:
            if parte.area < 12:
                continue
            ext = Polygon(parte.exterior.coords)
            loc = Polygon((np.array(ext.exterior.coords)[:, :2] - origem[:2]) * escala)
            alt = a.get('ed_alt_aprox')
            if not alt or alt <= 0:
                alt = 3.1 * (a.get('ed_num_pav') or 1) + .8
            if foto is not None and pista.query([loc.centroid.x, loc.centroid.y])[0] < 300:
                minx, miny, maxx, maxy = ext.bounds
                gx_, gy_ = np.meshgrid(np.linspace(minx, maxx, 9), np.linspace(miny, maxy, 9))
                import shapely
                dentro = shapely.contains_xy(ext, gx_, gy_)
                if dentro.sum() >= 4 and terra_na_foto(foto, gx_[dentro], gy_[dentro]).mean() > .5:
                    demolidos += 1
                    continue
            # Redondo (estadio, ginasio): circularidade do contorno externo.
            circ = 4 * math.pi * ext.area / ext.length ** 2
            saida.append((loc, float(alt), 'idedf', circ > .82 and ext.area > 1500, a.get('ed_nome')))
    print(f'IDE/DF: {len(saida)} edificacoes, {demolidos} demolidas segundo a imagem de 2025')
    return saida


def arvores_idedf(pasta, origem, escala, gx, gy, bandas, foto):
    """Arvores isoladas da cartografia do DF (2016) que a imagem de 2025 ainda mostra, longe das vias."""
    from shapely.geometry import Point
    feicoes = json.loads((pasta / 'idedf_arvores.geojson').read_text(encoding='utf-8'))['features']
    pts = np.array([f['geometry']['coordinates'][:2] for f in feicoes if f.get('geometry')])
    if not len(pts):
        return []
    if foto is not None:
        # A copa num raio de 2 m (9 pontos): a arvore continua la se metade deles e verde.
        off = np.array([[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4]])
        q = pts[:, None, :] + off[None]
        viva = verde_na_foto(foto, q[..., 0], q[..., 1]).mean(1) >= .5
        pts = pts[viva]
    loc = (pts - origem[:2]) * escala
    dentro = (loc[:, 0] > gx[0] + 5) & (loc[:, 0] < gx[-1] - 5) & (loc[:, 1] > gy[0] + 5) & (loc[:, 1] < gy[-1] - 5)
    loc = loc[dentro]
    livre = [p for p in loc if all(Point(p).distance(linha) > folga - 6 for linha, folga in bandas)]
    return [[round(float(x_), 2), round(float(y_), 2)] for x_, y_ in livre]


def solo(nome, pasta, epsg, origem, escala, gx, gy):
    """Cor do chao: Sentinel-2 (10 m) reprojetado na caixa do terreno, 2 m por pixel."""
    px = 2.0
    w = int((gx[-1] - gx[0]) / px)
    h = int((gy[-1] - gy[0]) / px)
    # Grade local (sem escala) em coordenadas UTM do circuito.
    x0, y1, passo = origem[0] + gx[0] / escala, origem[1] + gy[-1] / escala, px / escala
    out = np.zeros((3, h, w), np.uint8)
    if geo_io.rasterio is not None:
        from rasterio.transform import from_origin
        from rasterio.warp import reproject, Resampling
        with geo_io.rasterio.open(pasta / 'sentinel2_rgb.tif') as src:
            rgb = src.read()
            for b in range(3):
                reproject(rgb[b], out[b], src_transform=src.transform, src_crs=src.crs, dst_transform=from_origin(x0, y1, passo, passo),
                          dst_crs=f'EPSG:{epsg}', resampling=Resampling.cubic)
    else:
        # Sem o GDAL: o centro de cada pixel levado ao CRS da cena e amostrado em B-spline cubica.
        g = geo_io.ler(pasta / 'sentinel2_rgb.tif')
        XX, YY = np.meshgrid(x0 + (np.arange(w) + .5) * passo, y1 - (np.arange(h) + .5) * passo)
        u, v = Transformer.from_crs(epsg, g.epsg, always_xy=True).transform(XX, YY)
        col, lin = ~g.transform * (u, v)
        for b in range(3):
            out[b] = np.clip(np.round(map_coordinates(g.a[b].astype(float), [lin - .5, col - .5], order=3)), 0, 255)
    img = Image.fromarray(np.moveaxis(out, 0, -1))
    ASSETS.mkdir(parents=True, exist_ok=True)
    lado = 1024
    img = img.resize((lado, int(lado * h / w)) if w >= h else (int(lado * w / h), lado), Image.LANCZOS)
    destino = ASSETS / f'{nome}_solo.jpg'
    img.save(destino, quality=86)
    print(f'{destino.name}: {img.size}')


if __name__ == '__main__':
    main()
