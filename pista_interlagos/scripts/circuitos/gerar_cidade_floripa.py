"""Autodromo Floripa: a cidade de verdade em volta da volta (o passo final de gerar_floripa.py, que o chama sozinho).

    python gerar_cidade_floripa.py [--planta]      (refaz so a cidade sobre fontes/floripa/pista_floripa_base.json)

Pedido da equipe (15/10/2026): que a cidade pareca a cidade real adaptada para a corrida, como Monaco: a beira-mar, as
ruas de verdade e as ruas que cruzam a pista fechadas com bloqueios improvisados. A volta, o perfil, o terreno, os
boxes e as pontes sao os que gerar_floripa.py grava em fontes/floripa/pista_floripa_base.json (copiados como estao);
este script acrescenta `scenery.city` e grava dados/pista_floripa.json:

- o mapa da cidade (uma imagem de 1 m/px sobre a grade do terreno, campos de distancia com sinal): o leito das ruas
  (o asfalto entre os meios-fios do GeoFloripa, medido por transectos sobre o eixo de cada via do OSM), as calcadas, as
  pracas e o calcadao da beira-mar, as ciclovias, os gramados e os estacionamentos. O chao do jogo (landscape.js,
  LAND_CITY) desenha cada um com a borda nitida em qualquer distancia;
- as vias (eixo, largura, faixas, mao unica) para as pinturas de faixa, e as faixas da propria pista;
- faixas de pedestre, semaforos e pontos de onibus (nos do OSM), placas de rua nas esquinas;
- os bloqueios: onde cada rua de verdade encontra os muros da pista, uma linha de barreiras atravessada nela;
- postes com fiacao, arvores de calcada e de praca, carros estacionados, a linha da costa (enrocamento, palmeiras);
- as zonas de passeio (meta.roam, PASSEIO): aberturas nos muros (meta.rails) para pedacos da cidade onde o carro pode
  rodar no treino, com bloqueios, gradis e muros de lote em toda a borda sem fachada (physics.js RoamWorld).

Tudo em coordenadas locais (x leste, y norte, m), como o resto do arquivo.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from shapely import STRtree
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, shape
from shapely.ops import unary_union
import shapely
from shapely import affinity
from shapely.prepared import prep
import shapely.geometry.polygon

import gerar_floripa as gf
import gerar_pista as gp
from compat_scipy import cKDTree
from config import ASSETS, CIRCUITOS, DADOS, pasta_fontes

NOME = 'floripa'
BASE = 'floripa'
PX = 1.0           # m por pixel do mapa da cidade
GAP = 8            # linhas entre os dois mapas na imagem
FAIXA = 4.0        # m: alcance de cada campo de distancia (+-), 32 niveis por metro em 8 bits

# Vias de carro do OSM: largura de faixa (m) e numero de faixas sem a etiqueta `lanes`.
VEICULO = {'motorway': (3.5, 2), 'motorway_link': (3.6, 1), 'trunk': (3.4, 2), 'trunk_link': (3.5, 1),
           'primary': (3.3, 2), 'primary_link': (3.4, 1), 'secondary': (3.2, 2), 'secondary_link': (3.3, 1),
           'tertiary': (3.1, 2), 'tertiary_link': (3.2, 1), 'residential': (3.0, 2), 'unclassified': (3.0, 2),
           'living_street': (2.8, 2), 'service': (2.8, 1), 'busway': (3.4, 1)}
# Calcada de cada lado (m) por classe; as vias expressas e de servico nao tem (a beira-mar ganha o calcadao pela costa).
CALCADA = {'primary': 3.0, 'secondary': 3.0, 'tertiary': 2.7, 'residential': 2.3, 'unclassified': 2.3, 'living_street': 2.2,
           'primary_link': 2.0, 'secondary_link': 2.0, 'tertiary_link': 2.0}
# Vias "grandes" (sem poste de concreto: iluminacao propria, sem carro estacionado).
EXPRESSA = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'busway'}
ESTACIONA = {'secondary', 'tertiary', 'residential', 'unclassified', 'living_street'}
PEDESTRE = {'footway': 2.0, 'pedestrian': 4.0, 'path': 1.6, 'steps': 2.4, 'corridor': 2.0}
COSTA_CALCADAO = 20.0     # m de terra junto a linha da costa que viram calcadao (fora do leito e dos predios)
# Zonas de passeio (pedido da equipe, 15/10/2026: "tem muita cidade e o jogo nao deixa o carro sair da pista; precisa de
# uns pontos onde da para sair e passear pelo mapa, com um limite, nas areas mais detalhadas"). Em cada uma, onde uma rua de
# verdade encontra os muros (`lado` da volta, procurada no trecho `janela` de s), o muro se abre na largura do leito; dali o
# carro anda por um pedaco da cidade: o anel (`area`, contorno grosso tracado por dentro das quadras, cortado pelo mar e
# pela faixa da corrida), fechado por bloqueios nas ruas que cruzam a sua borda (street-closures.js), por gradis onde a
# borda corta praca, gramado, a orla ou o fundo dos boxes e por muros de lote na divisa dos terrenos sem fachada (nenhuma
# parede invisivel: bordas_passeio). A fisica (physics.js, meta.roam) usa o anel como limite, os predios
# como paredes e o muro pelo lado de fora. Aberturas longe das zonas de freada e das curvas rapidas: os rivais seguem a
# linha deles e nunca entram (testar_circuitos_abertos.mjs floripa).
PASSEIO = [
    {'name': 'centro', 'label': 'Centro', 'lado': 1, 'janela': (1244, 1266),
     'area': [676, -100, 678, -26, 640, 12, 600, 96, 590, 112, 640, 170, 706, 214, 800, 205, 842, 120, 846, 20, 818, -100]},
    {'name': 'aterro', 'label': 'Aterro · Parque Náutico', 'lado': -1, 'janela': (879, 914),
     'area': [400, 82, 340, 102, 272, 68, 222, 0, 222, -228, 336, -228, 426, -120, 442, -40, 408, 12]},
    {'name': 'estreito', 'label': 'Estreito', 'lado': -1, 'janela': (3590, 3645),
     'area': [-990, 95, -945, 165, -880, 198, -790, 178, -696, 150, -688, 40, -748, -62, -852, -68, -945, -60, -990, 0]},
    # O Parque da Luz (usuario, 15/10/2026: "faz uma entrada ali tambem pra ir no parque da luz! pode por a entrada um pouco
    # antes de comecar a curva, na calcada"): na calcada da Alameda Adolfo Konder, com o parque a esquerda, pouco antes da
    # curva para a direita do fim do parque (s ~570). Sem rua ali: a boca e o chao aberto (`chao` 'livre': calcada e
    # gramado) e so `largura` m dele, o trecho mais perto da curva. A zona e o parque inteiro e a calcada dele ao longo dos muros.
    {'name': 'parque_da_luz', 'label': 'Parque da Luz', 'lado': 1, 'janela': (528, 556), 'chao': 'livre', 'largura': 12,
     'area': [247, 303, 257, 314, 261, 314, 267, 331, 283, 441, 290, 444, 333, 488, 342, 484, 332, 460, 331, 443, 356, 475, 359, 476,
              506, 372, 455, 296, 407, 313, 396, 293, 421, 290, 438, 285, 428, 273, 411, 277, 389, 276, 270, 251, 263, 253, 256, 262,
              253, 274, 253, 295]},
]


def log(*a):
    print(*a, flush=True)


def rumo_de(A):
    d = np.gradient(A, axis=0)
    n = np.linalg.norm(d, axis=1)
    n[n == 0] = 1
    return d / n[:, None]


def reamostrar(A, ds):
    seg = np.linalg.norm(np.diff(A, axis=0), axis=1)
    s = np.r_[0, np.cumsum(seg)]
    if s[-1] < 1e-6:
        return A[:1], s[:1]
    m = max(2, int(math.ceil(s[-1] / ds)) + 1)
    u = np.linspace(0, s[-1], m)
    return np.column_stack([np.interp(u, s, A[:, 0]), np.interp(u, s, A[:, 1])]), u


class Cidade:
    def __init__(self):
        c = CIRCUITOS[BASE]
        self.pasta = pasta_fontes(BASE)
        self.epsg = c['epsg']
        # A volta como gerar_floripa.py a deixou (sem cidade): o ponto de partida de toda vez.
        self.base = json.loads((self.pasta / f'pista_{BASE}_base.json').read_text(encoding='utf-8'))
        self.origem = np.array(self.base['meta']['origin_utm'][:2], float)
        t = self.base['terrain']
        self.t = t
        self.Z = np.array(t['z'], float).reshape(t['ny'], t['nx'])
        self.x0, self.y0 = t['x0'], t['y0']
        self.W, self.H = (t['nx'] - 1) * t['step'], (t['ny'] - 1) * t['step']
        self.grade = box(self.x0, self.y0, self.x0 + self.W, self.y0 + self.H)
        self.o = gf.osm_local(self.pasta, self.origem, self.epsg)
        a = np.array(self.base['samples'])
        self.A = a
        self.L = self.base['meta']['reconstructed_xy_m']
        eixo = np.load(self.pasta / 'eixo_floripa.npz')
        assert len(eixo['P']) == len(a) and np.abs(eixo['P'] - a[:, 1:3]).max() < 1e-3, 'eixo_floripa.npz nao e o da pista atual'
        self.via_pista = eixo['via']
        self.cadeia = {abs(w) for w in gf.CADEIA}

    # ---- utilidades ----
    def chao(self, x, y):
        """Terreno do arquivo (bilinear na grade)."""
        t = self.t
        fx = np.clip((np.asarray(x) - self.x0) / t['step'], 0, t['nx'] - 1.001)
        fy = np.clip((np.asarray(y) - self.y0) / t['step'], 0, t['ny'] - 1.001)
        i, j = fx.astype(int), fy.astype(int)
        u, v = fx - i, fy - j
        Z = self.Z
        return (Z[j, i] * (1 - u) + Z[j, i + 1] * u) * (1 - v) + (Z[j + 1, i] * (1 - u) + Z[j + 1, i + 1] * u) * v

    def mar(self, x, y):
        return self.chao(x, y) < .3

    # ---- a pista ----
    def pista(self):
        """O asfalto da volta, o corredor ate o fundo dos muros, e a faixa dos boxes."""
        a = self.A
        n = len(a)
        P, Eh, w = a[:, 1:3], a[:, 9:11], a[:, 4]
        wr, wl = a[:, 15], a[:, 16]
        quads, corr = [], []
        for i in range(n):
            j = (i + 1) % n
            if np.linalg.norm(P[j] - P[i]) > 6:
                continue
            q = [P[i] - Eh[i] * w[i] / 2, P[j] - Eh[j] * w[j] / 2, P[j] + Eh[j] * w[j] / 2, P[i] + Eh[i] * w[i] / 2]
            quads.append(Polygon(q).buffer(.05))
            # Ate o fundo do bloco de concreto (0,75 m) e mais um pouco: ali nada da cidade fica em pe.
            r = [P[i] - Eh[i] * (w[i] / 2 + wr[i] + 1.0), P[j] - Eh[j] * (w[j] / 2 + wr[j] + 1.0),
                 P[j] + Eh[j] * (w[j] / 2 + wl[j] + 1.0), P[i] + Eh[i] * (w[i] / 2 + wl[i] + 1.0)]
            corr.append(Polygon(r).buffer(.05))
        self.asfalto_pista = unary_union(quads)
        self.corredor = unary_union(corr)
        pit = self.base['pit']
        c = {k: i for i, k in enumerate(pit['columns'])}
        ps = np.array(pit['samples'])
        pq = []
        for i in range(len(ps) - 1):
            p, q = ps[i], ps[i + 1]
            at = lambda r, d: (r[c['x']] + r[c['lx']] * d, r[c['y']] + r[c['ly']] * d)
            pq.append(Polygon([at(p, p[c['lo']]), at(q, q[c['lo']]), at(q, q[c['hi']]), at(p, p[c['hi']])]).buffer(.05))
        self.boxes = unary_union(pq)
        # Garagens e patio dos boxes (o lado de fora, hi + 20 m) e as arquibancadas: nada da cidade ali.
        gq = []
        for i in range(len(ps) - 1):
            p, q = ps[i], ps[i + 1]
            at = lambda r, d: (r[c['x']] + r[c['lx']] * d, r[c['y']] + r[c['ly']] * d)
            gq.append(Polygon([at(p, p[c['hi']]), at(q, q[c['hi']]), at(q, q[c['hi']] + 22), at(p, p[c['hi']] + 22)]).buffer(.05))
        self.garagens = unary_union(gq)
        log(f'pista: asfalto {self.asfalto_pista.area:.0f} m2, corredor dos muros {self.corredor.area:.0f} m2, boxes {self.boxes.area:.0f} m2')

    # ---- edificios desenhados (retangulos orientados) ----
    def predios(self):
        b = self.base['scenery']['buildings']
        c = {k: i for i, k in enumerate(b['columns'])}
        out = []
        for it in b['items']:
            x, y, w, d, h = it[c['x']], it[c['y']], it[c['w']], it[c['d']], it[c['heading']]
            cs, sn = math.cos(h), math.sin(h)
            out.append(Polygon([(x + cs * u * w / 2 - sn * v * d / 2, y + sn * u * w / 2 + cs * v * d / 2) for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]))
        self.retangulos = out
        self.predios_u = unary_union(out)
        # Marcos com modelo proprio (rodoviaria, TICEN, mercado...): o contorno do OSM.
        marcos = []
        for m in self.base['scenery']['landmarks']:
            if 'outline' in m and m['kind'] != 'parque_da_luz':
                marcos.append(Polygon(m['outline']).buffer(1.0))
        self.marcos = unary_union(marcos)
        self.ocupado = unary_union([self.predios_u, self.marcos])
        self.ocupado_t = STRtree([g for g in (list(self.ocupado.geoms) if hasattr(self.ocupado, 'geoms') else [self.ocupado])])
        log(f'predios desenhados: {len(out)}; marcos {len(marcos)}')

    # ---- vias ----
    def vias(self):
        """As vias de carro do OSM na grade: eixo de 2 em 2 m, largura e deslocamento do meio do leito pelos meios-fios."""
        from shapely.geometry import LineString as LS
        meio = []
        for f in json.loads((self.pasta / 'geofloripa_meiofio.geojson').read_text(encoding='utf-8'))['features']:
            g = shape(f['geometry'])
            for parte in (g.geoms if g.geom_type.startswith('Multi') else [g]):
                meio.append(LS(np.array(parte.coords)[:, :2] - self.origem))
        self.meiofio = meio
        arv = STRtree(meio)
        dentro = self.grade.buffer(60)
        ruas = []
        no_vias = {}
        for w in self.o['vias']:
            tg = w.get('tags', {})
            hw = tg.get('highway')
            if hw not in VEICULO:
                continue
            if tg.get('bridge') not in (None, 'no') or tg.get('tunnel') not in (None, 'no') or tg.get('layer', '0') not in ('0', '-0'):
                continue
            if tg.get('area') == 'yes':
                continue
            A = gf.linha_via(self.o, w)
            if len(A) < 2:
                continue
            if not LineString(A).intersects(dentro):
                continue
            lw, ln = VEICULO[hw]
            mao = tg.get('oneway') in ('yes', '1', 'true') or tg.get('junction') == 'roundabout' or hw.endswith('_link') and tg.get('oneway') != 'no'
            try:
                faixas = int(float(tg.get('lanes', '').split(';')[0]))
            except ValueError:
                faixas = 1 if mao else ln
            if hw == 'service':
                faixas = min(faixas, 2)
            est = faixas * lw + (.5 if hw != 'service' else .2)
            Q, s = reamostrar(A, 2.0)
            if len(Q) < 2:
                continue
            T = rumo_de(Q)
            N = np.column_stack([-T[:, 1], T[:, 0]])          # esquerda
            esq, dir_ = np.full(len(Q), np.nan), np.full(len(Q), np.nan)
            alcance = min(16.0, est * 1.4 + 2)
            for i in range(len(Q)):
                tr = LS([Q[i] - N[i] * alcance, Q[i] + N[i] * alcance])
                for j in arv.query(tr, predicate='intersects'):
                    x = tr.intersection(meio[j])
                    for p in ([x] if x.geom_type == 'Point' else list(getattr(x, 'geoms', []))):
                        if p.geom_type != 'Point':
                            continue
                        d = (p.x - Q[i, 0]) * N[i, 0] + (p.y - Q[i, 1]) * N[i, 1]
                        if d > .8:
                            esq[i] = d if np.isnan(esq[i]) else min(esq[i], d)
                        elif d < -.8:
                            dir_[i] = d if np.isnan(dir_[i]) else max(dir_[i], d)
            ok = np.isfinite(esq) & np.isfinite(dir_) & ((esq - dir_) > est * .55) & ((esq - dir_) < est * 2.2 + 3)
            larg = np.where(ok, esq - dir_, np.nan)
            cen = np.where(ok, (esq + dir_) / 2, np.nan)
            if ok.sum() >= max(2, .3 * len(Q)):
                k = np.arange(len(Q))
                larg = np.interp(k, k[ok], larg[ok])
                cen = np.interp(k, k[ok], cen[ok])
                # Mediana corrida (5 estacoes): uma garagem ou uma esquina nao abre o leito.
                larg = np.array([np.median(larg[max(0, i - 3):i + 4]) for i in range(len(Q))])
                cen = np.array([np.median(cen[max(0, i - 3):i + 4]) for i in range(len(Q))])
                cen = np.clip(cen, -3.0, 3.0)
                fonte = 'meiofio'
            else:
                larg = np.full(len(Q), est)
                cen = np.zeros(len(Q))
                fonte = 'osm'
            larg = np.clip(larg, 3.0, 26.0)
            cal = CALCADA.get(hw, 0.0)
            sw = tg.get('sidewalk', '')
            lados = {'no': (0, 0), 'none': (0, 0), 'separate': (0, 0), 'left': (1, 0), 'right': (0, 1), 'both': (1, 1)}.get(sw, (1, 1))
            pista = w['id'] in self.cadeia
            r = {'id': w['id'], 'hw': hw, 'nome': tg.get('name', ''), 'mao': bool(mao), 'faixas': int(faixas), 'P': Q, 'T': T, 'N': N,
                 'larg': larg, 'cen': cen, 'cal_e': cal * lados[0], 'cal_d': cal * lados[1], 'fonte': fonte, 'pista': pista,
                 'nos': [n for n in w['nodes'] if n in self.o['pos']], 'aceso': tg.get('lit') == 'yes'}
            ruas.append(r)
            for n in r['nos']:
                no_vias.setdefault(n, []).append(len(ruas) - 1)
        self.ruas = ruas
        self.no_vias = no_vias
        # Esquinas: nos de duas ou mais vias (ou a ponta de uma no meio de outra).
        self.esquinas = [n for n, v in no_vias.items() if len(set(v)) >= 2]
        ex = np.array([self.o['pos'][n] for n in self.esquinas]) if self.esquinas else np.zeros((0, 2))
        self.esq_kd = cKDTree(ex) if len(ex) else None
        self.esq_xy = ex
        med = sum(1 for r in ruas if r['fonte'] == 'meiofio')
        log(f'vias de carro: {len(ruas)} ({med} medidas nos meios-fios), {sum(len(r["P"]) for r in ruas) * 2 / 1000:.1f} km; esquinas {len(self.esquinas)}')

    def bordas(self, r):
        """Bordas esquerda e direita do leito de uma via."""
        e = r['P'] + r['N'] * (r['cen'] + r['larg'] / 2)[:, None]
        d = r['P'] + r['N'] * (r['cen'] - r['larg'] / 2)[:, None]
        return e, d

    def faixa(self, A, B, d0, d1, N):
        """Poligonos (quads) entre os deslocamentos d0 e d1 (por estacao) ao longo de uma linha."""
        out = []
        for i in range(len(A) - 1):
            q = [A[i] + N[i] * d0[i], A[i + 1] + N[i + 1] * d0[i + 1], A[i + 1] + N[i + 1] * d1[i + 1], A[i] + N[i] * d1[i]]
            p = Polygon(q)
            if not p.is_valid:
                p = p.buffer(0)
            if p.area > .01:
                out.append(p)
        return out

    # ---- regioes do mapa ----
    def regioes(self):
        pecas = []
        calc = []
        for r in self.ruas:
            P, N, c, w = r['P'], r['N'], r['cen'], r['larg']
            if len(P) < 2:
                continue
            pecas += self.faixa(P, None, c - w / 2, c + w / 2, N)
            if r['cal_e'] > 0:
                calc += self.faixa(P, None, c + w / 2 - .1, c + w / 2 + r['cal_e'], N)
            if r['cal_d'] > 0:
                calc += self.faixa(P, None, c - w / 2 - r['cal_d'], c - w / 2 + .1, N)
        ruas = unary_union(pecas)
        # Concordancia das esquinas (fecho morfologico de 3 m): o meio-fio faz a curva.
        ruas = ruas.buffer(3.0, join_style='round').buffer(-3.0, join_style='round')
        # As ilhas e canteiros (aneis fechados de meio-fio sem predio dentro) voltam a ser canteiro.
        ilhas = []
        for ln in self.meiofio:
            if ln.is_ring and len(ln.coords) >= 4:
                p = Polygon(ln.coords).buffer(0)
                if 6 < p.area < 6000 and not self.predios_u.intersects(p.buffer(-.5)):
                    ilhas.append(p)
        ilhas_u = unary_union(ilhas).intersection(ruas) if ilhas else Polygon()
        ruas = ruas.difference(ilhas_u)
        self.ruas_u = ruas
        estrada = unary_union([ruas, self.asfalto_pista, self.boxes])
        self.leito = estrada
        # Calcadas: as faixas de cada lado e os caminhos de pedestre do OSM (os que cruzam ruas viram so a faixa).
        ped, ped_praca = [], []
        verdes = []
        estac = []
        for w in self.o['vias']:
            tg = w.get('tags', {})
            A = gf.linha_via(self.o, w)
            if len(A) < 2:
                continue
            hw = tg.get('highway')
            if hw in PEDESTRE and tg.get('footway') != 'crossing' and tg.get('bridge') in (None, 'no'):
                fechado = w['nodes'][0] == w['nodes'][-1] and len(A) >= 4
                if hw == 'pedestrian' and fechado and tg.get('area') == 'yes':
                    ped_praca.append(Polygon(A).buffer(0))
                else:
                    g = LineString(A).buffer(PEDESTRE[hw] / 2, cap_style='round')
                    (ped_praca if hw in ('pedestrian', 'path', 'steps') else ped).append(g)
            fechado = w['nodes'][0] == w['nodes'][-1] and len(A) >= 4
            if not fechado:
                continue
            if tg.get('leisure') in ('park', 'garden', 'playground', 'pitch') or tg.get('landuse') in ('grass', 'village_green', 'recreation_ground') \
                    or tg.get('natural') in ('scrub', 'grassland'):
                verdes.append(Polygon(A).buffer(0))
            if tg.get('amenity') == 'parking' and tg.get('parking', 'surface') in ('surface', 'yes') and tg.get('building') is None:
                estac.append(Polygon(A).buffer(0))
        pracas = []
        for f in json.loads((self.pasta / 'geofloripa_parques.geojson').read_text(encoding='utf-8'))['features']:
            g = affinity.translate(shape(f['geometry']), -self.origem[0], -self.origem[1]).buffer(0)
            pracas.append(g)
        pracas_u = unary_union(pracas) if pracas else Polygon()
        costa = self.costa_linhas()
        terra_costa = unary_union([LineString(c).buffer(COSTA_CALCADAO, cap_style='flat', single_sided=True) for c in costa]) if costa else Polygon()
        mar_u = self.mar_poligono()
        tirar = unary_union([estrada, self.ocupado, mar_u])
        calcada = unary_union(calc + ped).difference(tirar)
        verde = unary_union(verdes + [pracas_u.difference(unary_union(ped_praca + ped))]).difference(tirar)
        # Pracas: os caminhos dentro delas e as areas de pedestre; o calcadao: a faixa de terra junto da costa.
        praca = unary_union(ped_praca + [p for p in ped if p.intersects(pracas_u)] + [terra_costa.difference(verde)]).difference(tirar)
        ciclo = []
        for w in self.o['vias']:
            tg = w.get('tags', {})
            if tg.get('highway') == 'cycleway' and tg.get('bridge') in (None, 'no'):
                A = gf.linha_via(self.o, w)
                if len(A) >= 2:
                    ciclo.append(LineString(A).buffer(1.3, cap_style='flat'))
        ciclovia = unary_union(ciclo).difference(unary_union([estrada, self.ocupado, mar_u])).buffer(-.5).buffer(.5) if ciclo else Polygon()
        estacion = unary_union(estac).difference(unary_union([estrada, self.ocupado, mar_u, calcada])) if estac else Polygon()
        self.calcada, self.praca, self.verde, self.ciclovia, self.estacionamento, self.ilhas = calcada, praca, verde, ciclovia, estacion, ilhas_u
        self.mar_u = mar_u
        self.costa = costa
        log('regioes (m2): ' + ', '.join(f'{k} {g.area:.0f}' for k, g in (('leito', estrada), ('calcada', calcada), ('praca', praca), ('verde', verde),
                                                                         ('ciclovia', ciclovia), ('estacionamento', estacion), ('ilhas', ilhas_u))))

    def aplainar(self):
        """As ruas sem o sobe e desce do MDT (usuario, 16/10/2026: "as ruas fora da pista estao todas irregulares";
        gerar_pista.aplainar_ruas): o leito das ruas, as calcadas, os canteiros, as ciclovias e os estacionamentos ficam
        lisos, e o chao emenda com os lotes em 8 m. A volta e a faixa colada nela (ate 8 m alem do asfalto) e os boxes ficam
        como gerar_floripa.py os deixou; sob as pontes altas o chao continua no maximo 2,5 m abaixo do tabuleiro."""
        t = self.t
        XX, YY = np.meshgrid(self.x0 + np.arange(t['nx']) * t['step'], self.y0 + np.arange(t['ny']) * t['step'])
        q = np.column_stack([XX.ravel(), YY.ravel()])
        a = self.A
        k = cKDTree(a[:, 1:3]).query(q)[1]
        dd = q - a[k, 1:3]
        lat = np.sum(dd * a[k, 9:11], axis=1)
        road = (a[k, 3] + a[k, 6] * np.sum(dd * a[k, 7:9], axis=1) + a[k, 5] * lat).reshape(self.Z.shape)
        fora = (np.abs(lat) - a[k, 4] / 2).reshape(self.Z.shape)
        tab = np.zeros(len(a), bool)
        for s0, s1 in self.base['meta']['decks']:
            tab |= (a[:, 0] >= s0) & (a[:, 0] <= s1)
        sob = tab[k].reshape(self.Z.shape) & (road - self.Z > 3.0)
        dentro = lambda g: shapely.contains_xy(g, XX, YY)
        lisa = unary_union([self.ruas_u, self.calcada, self.ilhas, self.ciclovia, self.estacionamento, self.boxes])
        Z, peso = gp.aplainar_ruas(self.Z, t['step'], gp.distancia_ate(lisa, XX, YY, 8.0), fixo=self.Z < .3)
        manter = ((fora < 8) & ~sob) | dentro(unary_union([self.boxes.buffer(8), self.garagens]))
        Z = np.where(manter, self.Z, Z)
        Z = np.where(sob & (fora < 12), np.minimum(Z, road - 2.5), Z)
        mudou = np.abs(Z - self.Z)
        log(f'ruas aplainadas: {(mudou > .01).sum()} nos ({(peso > .99).sum()} inteiros), mudanca media {mudou[mudou > .01].mean():.2f} m, '
            f'p99 {np.percentile(mudou[mudou > .01], 99):.2f}, max {mudou.max():.2f}')
        self.Z = Z

    def costa_linhas(self):
        """A linha da costa do OSM dentro da grade (terra a esquerda), em trechos continuos."""
        out = []
        g = self.grade.buffer(-2)
        for w in self.o['vias']:
            if w.get('tags', {}).get('natural') != 'coastline':
                continue
            A = gf.linha_via(self.o, w)
            if len(A) < 2:
                continue
            x = LineString(A).intersection(g)
            for parte in (x.geoms if hasattr(x, 'geoms') else [x]):
                if parte.geom_type == 'LineString' and parte.length > 8:
                    out.append(np.array(parte.coords))
        return out

    def mar_poligono(self):
        """O mar pela grade do terreno (abaixo de 0,3 m), em poligonos de 4 m simplificados."""
        t = self.t
        M = (self.Z < .3).astype(np.uint8)
        from shapely.geometry import box as bx
        cells = []
        ny, nx = M.shape
        for j in range(ny - 1):
            row = M[j]
            i = 0
            while i < nx - 1:
                if row[i]:
                    k = i
                    while k < nx - 1 and row[k]:
                        k += 1
                    cells.append(bx(self.x0 + i * t['step'] - t['step'] / 2, self.y0 + j * t['step'] - t['step'] / 2,
                                    self.x0 + k * t['step'] - t['step'] / 2, self.y0 + (j + 1) * t['step'] - t['step'] / 2))
                    i = k
                else:
                    i += 1
        return unary_union(cells).simplify(.5)

    # ---- campos de distancia ----
    def campo(self, geom, nome):
        """Distancia com sinal ate a borda de geom (negativa dentro), nos centros dos pixels, codificada em 8 bits."""
        nx, ny = int(math.ceil(self.W / PX)), int(math.ceil(self.H / PX))
        if geom.is_empty:
            return np.full((ny, nx), 255, np.uint8)
        polys = list(geom.geoms) if hasattr(geom, 'geoms') else [geom]
        polys = [p for p in polys if p.geom_type == 'Polygon' and p.area > .05]
        # Dentro/fora: preenchimento em 1 m (linha 0 = norte), corrigido perto da borda pelo teste exato.
        img = Image.new('L', (nx, ny), 0)
        dr = ImageDraw.Draw(img)
        pix = lambda c: [((x - self.x0) / PX - .5, (self.y0 + self.H - y) / PX - .5) for x, y in c]
        for p in polys:
            dr.polygon(pix(p.exterior.coords), fill=1)
            for h in p.interiors:
                dr.polygon(pix(h.coords), fill=0)
        dentro = np.array(img, bool)
        # Pontos da borda de 10 em 10 cm.
        pts = []
        for p in polys:
            for anel in [p.exterior, *p.interiors]:
                A = np.array(anel.coords)
                d = np.diff(A, axis=0)
                L = np.linalg.norm(d, axis=1)
                for a, dd, l in zip(A[:-1], d, L):
                    m = max(1, int(l / .1))
                    pts.append(a + dd * (np.arange(m)[:, None] / m))
        pts = np.vstack(pts)
        kd = cKDTree(pts)
        xs = self.x0 + (np.arange(nx) + .5) * PX
        ys = self.y0 + self.H - (np.arange(ny) + .5) * PX
        XX, YY = np.meshgrid(xs, ys)
        q = np.column_stack([XX.ravel(), YY.ravel()])
        dist, _ = kd.query(q, distance_upper_bound=FAIXA + 1)
        dist = np.minimum(dist, FAIXA + 1).reshape(ny, nx)
        perto = dist < 1.6
        if perto.any():
            idx = np.flatnonzero(perto.ravel())
            exato = shapely.contains_xy(geom, q[idx, 0], q[idx, 1])
            dd = dentro.ravel().copy()
            dd[idx] = exato
            dentro = dd.reshape(ny, nx)
        sdf = np.where(dentro, -dist, dist)
        v = np.clip(np.round(127.5 + sdf / FAIXA * 127.5), 0, 255).astype(np.uint8)
        log(f'campo {nome}: {dentro.mean():.1%} dentro, {len(pts)} pontos de borda')
        return v

    def mapa(self):
        a = np.dstack([self.campo(self.leito, 'leito'), self.campo(self.calcada, 'calcada'), self.campo(self.praca, 'praca')])
        b = np.dstack([self.campo(self.ciclovia, 'ciclovia'), self.campo(self.verde, 'verde'),
                       self.campo(unary_union([self.estacionamento, self.ilhas]), 'estacionamento')])
        # Uma imagem so (o chao do jogo ja usa quase todas as unidades de textura do aparelho, a noite mais ainda): o mapa
        # A em cima, o B embaixo, separados por GAP linhas que repetem as bordas (o filtro e os mipmaps nao misturam os dois).
        m = np.concatenate([a, np.repeat(a[-1:], GAP // 2, 0), np.repeat(b[:1], GAP - GAP // 2, 0), b], 0)
        arq = ASSETS / f'{NOME}_cidade.png'
        Image.fromarray(m, 'RGB').save(arq.with_suffix('.tmp.png'), optimize=True)
        import os
        os.replace(arq.with_suffix('.tmp.png'), arq)
        log(f'{arq.name}: {m.shape[1]}x{m.shape[0]} px, {arq.stat().st_size / 1e6:.2f} MB')
        return arq.name, a.shape[0]

    # ---- pontos e mobiliario ----
    def livre(self, x, y, raio=.6, calcada=True):
        """Um ponto onde algo pode ficar em pe: fora do leito, dos predios, do mar e do corredor dos muros."""
        p = Point(x, y)
        if self.corredor_buf.contains(p) or self.leito_p.contains(p):
            return False
        if len(self.ocupado_t.query(p.buffer(raio), predicate='intersects')):
            return False
        if self.mar(np.array([x]), np.array([y]))[0]:
            return False
        if self.garagens.buffer(4).contains(p) or self.boxes.buffer(3).contains(p):
            return False
        return True

    def tabuleiro_alto(self, j):
        """A estacao j esta num tabuleiro de ponte mais de 4 m acima do chao."""
        s = self.A[j, 0]
        if not any(a <= s <= b for a, b in self.base['meta']['decks']):
            return False
        return self.A[j, 3] - float(self.chao(np.array([self.A[j, 1]]), np.array([self.A[j, 2]]))[0]) > 4

    def na_grade(self, x, y, margem=4):
        return self.x0 + margem < x < self.x0 + self.W - margem and self.y0 + margem < y < self.y0 + self.H - margem

    def perto_de_esquina(self, x, y, r):
        if self.esq_kd is None:
            return False
        d, _ = self.esq_kd.query([x, y])
        return d < r

    def preparar_pontos(self):
        self.corredor_buf = prep(self.corredor.buffer(.3))
        self.leito_p = prep(self.leito)
        self.calcada_p = prep(self.calcada.buffer(.2))

    def faixas_e_semaforos(self):
        """Faixas de pedestre, semaforos e pontos de onibus dos nos do OSM sobre as vias de carro."""
        nos = {}
        for e in json.loads((self.pasta / 'osm.json').read_text(encoding='utf-8'))['elements']:
            if e['type'] == 'node' and e.get('tags'):
                nos[e['id']] = e['tags']
        faixas, semaf, pontos, pista_faixas, pista_semaf, pista_pontos = [], [], [], [], [], []
        kd_pista = cKDTree(self.A[:, 1:3])
        for ri, r in enumerate(self.ruas):
            Pn = np.array([self.o['pos'][n] for n in r['nos']])
            for k, n in enumerate(r['nos']):
                tg = nos.get(n)
                if not tg:
                    continue
                x, y = Pn[k]
                i = int(np.argmin(np.linalg.norm(r['P'] - Pn[k], axis=1)))
                tx, ty = r['T'][i]
                w = float(r['larg'][i])
                c = float(r['cen'][i])
                cx, cy = x + r['N'][i, 0] * c, y + r['N'][i, 1] * c
                hd = round(math.atan2(ty, tx), 3)
                cruz = tg.get('crossing', '')
                if tg.get('highway') == 'crossing' and cruz not in ('unmarked', 'no', 'informal'):
                    if r['pista']:
                        d, j = kd_pista.query([cx, cy])
                        if d < 8:
                            pista_faixas.append([round(float(self.A[j, 0]), 1), 'semaforo' if 'traffic_signals' in cruz else 'zebra'])
                    else:
                        faixas.append([round(cx, 2), round(cy, 2), hd, round(w, 2)])
                if tg.get('highway') == 'traffic_signals' or 'traffic_signals' in tg.get('highway', ''):
                    if r['pista']:
                        d, j = kd_pista.query([cx, cy])
                        if d < 8:
                            pista_semaf.append(round(float(self.A[j, 0]), 1))
                    else:
                        semaf.append([round(cx, 2), round(cy, 2), hd, round(w, 2), 1 if r['mao'] else 0])
                if tg.get('public_transport') == 'stop_position' or tg.get('highway') == 'bus_stop':
                    if r['pista']:
                        d, j = kd_pista.query([cx, cy])
                        if d < 10:
                            # O lado: o do no quando ele esta fora do eixo; senao a direita do sentido do onibus (o da via no
                            # OSM numa mao unica, comparado ao da volta).
                            lat = (x - self.A[j, 1]) * self.A[j, 9] + (y - self.A[j, 2]) * self.A[j, 10]
                            mesmo = (tx * self.A[j, 7] + ty * self.A[j, 8]) > 0
                            lado = (1 if lat > 0 else -1) if abs(lat) > 1.5 else (-1 if (mesmo or not r['mao']) else 1)
                            pista_pontos.append((round(float(self.A[j, 0]), 1), lado))
                    else:
                        # O abrigo na calcada da direita (o sentido da via).
                        lado = -1
                        off = w / 2 + max(1.2, min(2.0, r['cal_d'] * .6 if r['cal_d'] else 1.4))
                        px_, py_ = cx + r['N'][i, 0] * off * lado, cy + r['N'][i, 1] * off * lado
                        if self.livre(px_, py_, .9):
                            pontos.append([round(px_, 2), round(py_, 2), hd])
        # Dedupe (o OSM marca um semaforo por sentido as vezes).
        def dedupe(lst, r):
            out = []
            for it in lst:
                if all(math.hypot(it[0] - o[0], it[1] - o[1]) > r for o in out):
                    out.append(it)
            return out
        self.faixas_l, self.semaf_l, self.pontos_l = dedupe(faixas, 4), dedupe(semaf, 6), dedupe(pontos, 15)
        self.pista_faixas = sorted({tuple(x) for x in pista_faixas})
        self.pista_semaf = sorted(set(pista_semaf))
        self.pista_pontos = sorted({p_[0]: p_ for p_ in pista_pontos}.values())
        log(f'faixas de pedestre {len(self.faixas_l)} (+{len(self.pista_faixas)} na pista), semaforos {len(self.semaf_l)} (+{len(self.pista_semaf)}), '
            f'pontos de onibus {len(self.pontos_l)} (+{len(self.pista_pontos)})')

    def bloqueios(self):
        """Onde cada rua de verdade encontra o corredor dos muros: uma linha de barreiras atravessada nela, alguns metros
        para fora, olhando para longe da pista."""
        borda = self.corredor.boundary
        out = []
        for r in self.ruas:
            if r['pista'] or r['hw'] in ('motorway', 'motorway_link'):
                continue
            P = r['P']
            if len(P) < 3:
                continue
            dentro = np.array([self.corredor.contains(Point(p)) for p in P])
            if not dentro.any() or dentro.all():
                continue
            s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
            for i in range(len(P) - 1):
                if dentro[i] == dentro[i + 1]:
                    continue
                # Sai (dentro -> fora) andando para frente, ou entra (fora -> dentro): o bloqueio fica do lado de fora.
                sentido = 1 if dentro[i] else -1
                k0 = i + 1 if sentido > 0 else i
                # Quanto de rua sobra do lado de fora ate a ponta da via (uma entrada de garagem nao conta).
                resto = (s[-1] - s[k0]) if sentido > 0 else s[k0]
                if resto < 9 and r['hw'] == 'service':
                    continue
                # O angulo com a pista: rua paralela que encosta no muro nao e cruzamento.
                d, j = cKDTree(self.A[:, 1:3]).query(P[k0])
                tp = self.A[j, 7:9]
                tv = r['T'][k0] * sentido
                if abs(tv @ tp) > .93:
                    continue
                # Rua que passa por baixo do tabuleiro de uma ponte (a corrida vai la em cima): fica aberta.
                if self.tabuleiro_alto(j):
                    continue
                dist = 5.5 if r['hw'] != 'service' else 3.5
                # Andar `dist` m para fora a partir da borda.
                alvo = s[k0] + sentido * dist
                alvo = min(max(alvo, 0), s[-1])
                x = float(np.interp(alvo, s, P[:, 0]))
                y = float(np.interp(alvo, s, P[:, 1]))
                kk = int(np.argmin(np.abs(s - alvo)))
                w = float(r['larg'][kk])
                c = float(r['cen'][kk])
                x += r['N'][kk, 0] * c
                y += r['N'][kk, 1] * c
                hd = math.atan2(tv[1], tv[0])
                lado = 1 if ((x - self.A[j, 1]) * self.A[j, 9] + (y - self.A[j, 2]) * self.A[j, 10]) > 0 else -1
                out.append({'x': round(x, 2), 'y': round(y, 2), 'heading': round(hd, 3), 'width': round(w + .6, 2), 's': round(float(self.A[j, 0]), 1),
                            'side': lado, 'name': r['nome'], 'kind': r['hw'], 'lanes': r['faixas'], 'oneway': r['mao'], 'street': r['id'],
                            # Mao unica: o transito vem para a pista (+1, a via do OSM entra no corredor) ou sai dela (-1); 0 nas duas maos.
                            'flow': (1 if sentido < 0 else -1) if r['mao'] else 0,
                            'room': round(float(min(resto - dist, 80)), 1)})
        # Duas vias que chegam ao mesmo ponto: um bloqueio so.
        final = []
        for b in sorted(out, key=lambda b: -b['width']):
            if all(math.hypot(b['x'] - o['x'], b['y'] - o['y']) > 7 for o in final):
                final.append(b)
        final.sort(key=lambda b: b['s'])
        self.bloqueios_l = final
        log(f'bloqueios: {len(final)} ruas fechadas ({", ".join(sorted({b["name"] for b in final if b["name"]}))[:300]})')

    def passeio(self):
        """A cidade aberta ao carro (meta.roam; usuario, 15/10/2026: "ta cheio de ruas legais pra andar na cidade, deixa o
        carro ir; se nao fica um mapa cheio de detalhes que ninguem nunca ve"): as aberturas nos muros (PASSEIO: onde uma
        rua de verdade, ou a calcada do Parque da Luz, encontra os muros) levam a cidade inteira, toda a terra firme da grade
        (sem o mar), fora da faixa da corrida, dos boxes, dos predios (as pegadas que o jogo desenha) e dos marcos. A volta
        corta a cidade em pedacos (de um lado e do outro dos muros, a ilha e o continente): cada pedaco que uma abertura
        alcanca e uma zona (o anel: o contorno e os predios como buracos). Na borda da grade, onde a cidade continua, as
        ruas ficam fechadas por bloqueios; os bloqueios das ruas que encontram os muros da volta ficam (solidos,
        street-closures.js), menos o da rua de cada abertura. O que fica em pe no resto da borda (gradis na orla, na borda
        da grade e sob os viadutos) vem depois da poda dos predios: bordas_passeio."""
        import base64
        a, n, L = self.A, len(self.A), self.L
        # A faixa da corrida ate a face dos muros (sem o bloco): o anel de cada zona comeca nela.
        quads = []
        for i in range(n):
            j = (i + 1) % n
            if np.linalg.norm(a[j, 1:3] - a[i, 1:3]) > 6:
                continue
            f = lambda r, sd: r[1:3] + r[9:11] * sd * (r[4] / 2 + (r[16] if sd > 0 else r[15]))
            quads.append(Polygon([f(a[i], -1), f(a[j], -1), f(a[j], 1), f(a[i], 1)]).buffer(.02))
        faixa = unary_union(quads)
        # O mar da grade do terreno vem em degraus de 4 m: fechado em 10 m (cada degrau cheio ate a ponta de terra mais
        # funda) e simplificado, a borda da zona na orla corre lisa, sempre para dentro da terra que o mar de verdade.
        self.mar_liso = self.mar_u.buffer(10).buffer(-10).simplify(1.5)
        area_p = self.grade.buffer(-6)
        terra = area_p.difference(self.mar_liso.buffer(1.2))
        boca = self.leito.difference(self.asfalto_pista.buffer(.3))
        # (Fechado em 4 m: os canteiros e as faixas de terreno estreitas entre duas pistas, sem predio, tambem se passa.)
        livre = unary_union([self.leito, self.calcada, self.praca, self.verde, self.ciclovia, self.estacionamento, self.ilhas]).buffer(4).buffer(-4)
        boca_livre = livre.difference(self.asfalto_pista.buffer(.3))
        fora_boxes = unary_union([self.boxes.buffer(2), self.garagens])
        self.faixa_passeio, self.fora_boxes, self.areas_passeio = faixa, fora_boxes, {}
        # Os predios como o jogo os desenha (as pegadas reais, edificios3d) e os marcos com modelo proprio.
        pegadas = [Polygon(np.array(e[3], float).reshape(-1, 2)).buffer(0) for e in self.edificios_l]
        cheio = unary_union([unary_union([g for g in pegadas if not g.is_empty]), self.marcos])
        S = a[:, 0]
        arvore = cKDTree(a[:, 1:3])

        def ponto(s, extra, lado):
            """O ponto da face do muro em s (do lado `lado`), mais `extra` m para fora."""
            s = s % L
            i = int(np.searchsorted(S, s, side='right') - 1)
            j = (i + 1) % n
            u = (s - S[i]) / ((S[j] if j else L) - S[i])
            r = a[i] + (a[j] - a[i]) * u
            nl = r[9:11] / np.linalg.norm(r[9:11])
            return r[1:3] + nl * lado * (r[4] / 2 + (r[16] if lado > 0 else r[15]) + extra)
        rails = {k: [list(x) for x in v] for k, v in self.base['meta']['rails'].items()}
        # 1. As bocas: na linha do muro, onde o leito da rua que chega comeca logo atras dele (a 7 m e a 10 m para fora ja e
        # leito, sem predio no caminho: a calcada e o canteiro entre o muro e a rua se atravessam); `chao` 'livre': calcada e
        # gramado bastam (o Parque da Luz).
        self.bocas_l, bocas = [], []
        for z in PASSEIO:
            lado = z['lado']
            ss = np.arange(z['janela'][0], z['janela'][1], .25)
            chao = boca_livre if z.get('chao') == 'livre' else boca
            ok = [chao.contains(Point(ponto(s, 7, lado))) and chao.contains(Point(ponto(s, 10, lado)))
                  and not any(self.ocupado.contains(Point(ponto(s, e, lado))) for e in (.4, 2, 4, 6)) for s in ss]
            runs, k = [], 0
            while k < len(ss):
                if ok[k]:
                    e = k
                    while e + 1 < len(ss) and ok[e + 1]:
                        e += 1
                    runs.append((ss[k], ss[e]))
                    k = e + 1
                else:
                    k += 1
            assert runs, f'passeio {z["name"]}: nenhuma rua encontra o muro entre s={z["janela"]}'
            r0, r1 = max(runs, key=lambda r: r[1] - r[0])
            if z.get('largura') and r1 - r0 > z['largura']:
                r0 = r1 - z['largura']
            s0, s1 = round(float(r0) - .4, 1), round(float(r1) + .4, 1)
            self.bocas_l += [[float(v) for v in ponto(s, 3, lado)] for s in np.arange(s0, s1 + .01, 3)]
            # (Um pouco para dentro da faixa: o carro que sai pela abertura ja esta na zona.)
            boca_q = Polygon([ponto(s0, -.4, lado), ponto(s1, -.4, lado), ponto(s1, 3, lado), ponto(s0, 3, lado)])
            bocas.append({'z': z, 'lado': lado, 's0': s0, 's1': s1, 'q': boca_q, 'alvo': Point(ponto((s0 + s1) / 2, 3.5, lado))})
            # A abertura nos muros.
            chave = '1' if lado > 0 else '-1'
            secs = []
            for f0, f1 in rails[chave]:
                if f1 <= s0 or f0 >= s1:
                    secs.append([f0, f1])
                    continue
                if f0 < s0:
                    secs.append([f0, s0])
                if f1 > s1:
                    secs.append([s1, f1])
            rails[chave] = secs
        # 2. A cidade: a terra firme fora da faixa, dos boxes, dos predios e dos marcos, e as bocas; em pedacos.
        cidade = terra.difference(faixa).difference(fora_boxes).difference(cheio)
        cidade = unary_union([cidade] + [m['q'] for m in bocas]).buffer(.05).buffer(-.05)
        partes = list(cidade.geoms) if hasattr(cidade, 'geoms') else [cidade]
        corte = area_p.exterior.buffer(.6)
        zonas, novos = [], []
        for parte in sorted(partes, key=lambda g: -g.area):
            ms = [m for m in bocas if parte.distance(m['alvo']) < .5]
            if not ms:
                continue
            anel = Polygon(parte.exterior, [h for h in parte.interiors if Polygon(h).area > 3]).simplify(.15)
            anel = shapely.geometry.polygon.orient(anel, 1.0)
            borda = anel.boundary
            nome = ms[0]['z']['name']
            self.areas_passeio[nome] = area_p
            loops = [np.array(anel.exterior.coords)[:-1]] + [np.array(h.coords)[:-1] for h in anel.interiors]
            segs = [(Lp[m], Lp[(m + 1) % len(Lp)]) for Lp in loops for m in range(len(Lp))]
            seg_t = STRtree([LineString(sg) for sg in segs])
            # 3. As ruas que saem da grade (onde a cidade continua alem do terreno detalhado): um bloqueio sobre a borda.
            cruz = []
            for r in self.ruas:
                if r['pista'] or r['hw'] in ('motorway', 'motorway_link'):
                    continue
                e = r['P'] + r['N'] * r['cen'][:, None]
                if len(e) < 2:
                    continue
                x = LineString(e).intersection(borda)
                for p in ([x] if x.geom_type == 'Point' else list(getattr(x, 'geoms', []))):
                    if p.geom_type != 'Point' or faixa.distance(p) < 8 or not corte.contains(p):
                        continue
                    q = int(seg_t.nearest(p))
                    u = segs[q][1] - segs[q][0]
                    u = u / np.linalg.norm(u)
                    fora = np.array([u[1], -u[0]])
                    k = int(np.argmin(np.linalg.norm(e - [p.x, p.y], axis=1)))
                    tv = r['T'][k]
                    w = float(r['larg'][k]) / max(abs(float(tv @ fora)), .55) + .6
                    sv = np.r_[0, np.cumsum(np.linalg.norm(np.diff(e, axis=0), axis=1))]
                    sentido = 1 if tv @ fora > 0 else -1
                    resto = (sv[-1] - sv[k]) if sentido > 0 else sv[k]
                    xy = np.array([p.x, p.y]) + fora * .7
                    _, j = arvore.query(xy)
                    ld = 1 if ((xy[0] - a[j, 1]) * a[j, 9] + (xy[1] - a[j, 2]) * a[j, 10]) > 0 else -1
                    cruz.append({'x': round(float(xy[0]), 2), 'y': round(float(xy[1]), 2), 'heading': round(math.atan2(fora[1], fora[0]), 3),
                                 'width': round(w, 2), 's': round(float(a[j, 0]), 1), 'side': ld, 'name': r['nome'], 'kind': r['hw'],
                                 'lanes': r['faixas'], 'oneway': r['mao'], 'street': r['id'],
                                 'flow': (-sentido if r['mao'] else 0), 'room': round(float(min(max(resto - 1, 0), 30)), 1), 'zone': nome})
            final = []
            for b in sorted(cruz, key=lambda b: -b['width']):
                if all(math.hypot(b['x'] - o['x'], b['y'] - o['y']) > 7 for o in final):
                    final.append(b)
            novos += final
            # 4. O gramado (2 m por celula, um bit cada): ali o carro roda na grama.
            x0, y0, x1, y1 = anel.bounds
            st = 2.0
            nx, ny = int(math.ceil((x1 - x0) / st)), int(math.ceil((y1 - y0) / st))
            gx, gy = np.meshgrid(x0 + (np.arange(nx) + .5) * st, y0 + (np.arange(ny) + .5) * st)
            bits = shapely.contains_xy(self.verde, gx.ravel(), gy.ravel()).astype(np.uint8)
            grama = {'x0': round(x0, 2), 'y0': round(y0, 2), 'step': st, 'nx': nx, 'ny': ny,
                     'bits': base64.b64encode(np.packbits(bits).tobytes()).decode('ascii')}
            zonas.append({'name': nome, 'label': ' · '.join(m['z']['label'] for m in ms),
                          'gaps': [{'side': m['lado'], 's0': m['s0'], 's1': m['s1']} for m in ms],
                          'ring': [[round(float(v), 2) for xy in Lp for v in xy] for Lp in loops], 'fences': [], 'walls': [], 'grass': grama})
            log(f'passeio {nome}: aberturas {", ".join(f"{m["s0"]}-{m["s1"]} (lado {m["lado"]})" for m in ms)}, anel {anel.area / 1e6:.2f} km2 '
                f'({sum(len(Lp) for Lp in loops)} vertices, {len(loops) - 1} buracos), {len(final)} bloqueios na borda da grade, grama {int(bits.sum()) * 4} m2')
        # Os bloqueios das ruas que encontram os muros ficam dentro da cidade (solidos); sai so o da rua de cada abertura.
        tirar = {k for k, b in enumerate(self.bloqueios_l) if any(m['q'].distance(Point(b['x'], b['y'])) < 10 for m in bocas)}
        self.bloqueios_l = sorted([b for k, b in enumerate(self.bloqueios_l) if k not in tirar] + novos, key=lambda b: b['s'])
        self.passeio_l = zonas
        self.rails = rails
        log(f'passeio: {len(zonas)} zonas, {len(tirar)} bloqueios das aberturas tirados, {len(novos)} novos na borda da grade')

    def bordas_passeio(self, d):
        """O que fica em pe em cada trecho da borda das zonas de passeio (pedido do usuario, 15/10/2026: "nos lugares que
        tem barreira invisivel coloca algum objeto pra sinalizar que o carro/pessoa vai bater"). Feito sobre o arquivo ja
        podado (d): fachada so conta a pegada que o jogo desenha. A borda, metro a metro (de meio em meio): junto a uma
        fachada, a um marco ou a faixa da corrida (o proprio muro) nada se acrescenta; onde o contorno grosso da zona corta
        a cidade (ruas, pracas, gramados), na orla e no fundo dos boxes, gradis da organizacao (`fences`; nas ruas os
        bloqueios de street-closures.js ja estao e os gradis nao se repetem ali); o resto e divisa de lote, o fim da calcada
        sem fachada: muros de lote (`walls`), 'frente' com um predio logo atras (mureta com grade: a fachada aparece) e
        'lote' sem (muro alto, blocos, tapume); onde a borda encosta direto no leito, sem calcada e sem casa por perto (os
        canteiros entre as alcas das pontes), 'canteiro': barreiras da organizacao (Jersey, plastico). Cada trecho avanca meio metro sobre os
        vizinhos (nada de fresta na quina)."""
        from shapely.ops import substring
        B = d['scenery']['city']['buildings']
        kr = B['columns'].index('ring')
        pols = []
        for it in B['items']:
            r = np.array(it[kr], float).reshape(-1, 2)
            if len(r) >= 3:
                pols.append(Polygon(r).buffer(0))
        predios = unary_union(pols)
        fachada = prep(predios.buffer(.9))
        perto_predio, longe_predio = prep(predios.buffer(6)), prep(predios.buffer(20))
        marcos = [Polygon(m['outline']).buffer(0) for m in d['scenery']['landmarks'] if m.get('outline') and m['kind'] != 'parque_da_luz']
        marco = prep(unary_union(marcos).buffer(1.5)) if marcos else None
        pista = prep(self.faixa_passeio.buffer(1.5))
        orla = prep(self.mar_liso.buffer(1.2 + 1.5))
        boxes = prep(self.fora_boxes.buffer(1.5))
        leito = prep(self.leito)
        # Sob um viaduto da volta (o tabuleiro a mais de 3 m do chao: a cabeceira da Colombo Salles no Aterro) a borda da
        # faixa e so chao: gradis ali tambem.
        decks = self.base['meta'].get('decks') or []
        no_tabuleiro = lambda s_: any((d0 <= s_ <= d1) if d0 <= d1 else (s_ >= d0 or s_ <= d1) for d0, d1 in decks)
        perto_volta = cKDTree(self.A[:, 1:3])
        GRADIL, PASSO, AVANCO = {'corte', 'orla', 'boxes', 'viaduto'}, .5, .5
        for z in d['meta']['roam']['zones']:
            corte = prep(self.areas_passeio[z['name']].exterior.buffer(.8))
            fences, walls, metros = [], [], {}
            for r in z['ring']:
                P = np.array(r, float).reshape(-1, 2)
                anel = LineString(np.vstack([P, P[:1]]))
                Lr = anel.length
                if Lr < 1:
                    continue
                ts = np.arange(0, Lr, PASSO) + PASSO / 2
                cl = []
                for t in ts:
                    p = anel.interpolate(t)
                    if pista.contains(p):
                        _, iv = perto_volta.query([p.x, p.y])
                        k = 'viaduto' if no_tabuleiro(self.A[iv, 0]) and self.A[iv, 3] - float(self.chao(p.x, p.y)) > 3 else 'pista'
                    elif fachada.contains(p):
                        k = 'fachada'
                    elif marco and marco.contains(p):
                        k = 'marco'
                    elif orla.contains(p):
                        k = 'orla'
                    elif corte.contains(p):
                        k = 'corte'
                    elif boxes.contains(p):
                        k = 'boxes'
                    elif perto_predio.contains(p):
                        k = 'frente'
                    else:
                        # Do lado de dentro (a esquerda do anel), 1,5 m: asfalto e meio-fio de canteiro, calcada e divisa de lote.
                        q = anel.interpolate(min(t + .3, Lr))
                        ux, uy = q.x - p.x, q.y - p.y
                        u = math.hypot(ux, uy) or 1
                        k = 'canteiro' if not longe_predio.contains(p) and leito.contains(Point(p.x - uy / u * 1.5, p.y + ux / u * 1.5)) else 'lote'
                    cl.append(k)
                    metros[k] = metros.get(k, 0) + PASSO
                grupo = lambda k: 'gradil' if k in GRADIL else k if k in ('frente', 'lote', 'canteiro') else None
                g = [grupo(k) for k in cl]
                n = len(g)
                # Trechos seguidos do mesmo grupo (o anel e fechado: comeca numa troca de grupo).
                ini = next((i for i in range(n) if g[i] != g[i - 1]), None)
                if ini is None:
                    trechos = [(0, n, g[0])] if g[0] else []
                    fechado = True
                else:
                    trechos, i, fechado = [], ini, False
                    while i < ini + n:
                        j = i
                        while j + 1 < ini + n and g[(j + 1) % n] == g[i % n]:
                            j += 1
                        if g[i % n]:
                            trechos.append((i, j + 1, g[i % n]))
                        i = j + 1
                # A volta dobrada: um trecho que passa do fim do anel continua no comeco.
                dobro = LineString(np.vstack([P, P, P[:1]]))
                # (A distancia ao longo do anel da amostra i, contada da volta em que ela cai: a ultima amostra e mais curta.)
                tt = lambda i: (i // n) * Lr + (i % n) * PASSO
                for i0, i1, kind in trechos:
                    t0, t1 = tt(i0), min(tt(i1 - 1) + PASSO, (i1 - 1) // n * Lr + Lr)
                    if not fechado:
                        antes, depois = cl[(i0 - 1) % n], cl[i1 % n]
                        t0 -= 0 if antes == 'pista' else AVANCO
                        t1 += 0 if depois == 'pista' else AVANCO
                    if t0 < 0:
                        t0, t1 = t0 + Lr, t1 + Lr
                    linha = substring(dobro, t0, min(t1, t0 + Lr)).simplify(.06)
                    xy = [round(float(v), 2) for q in linha.coords for v in q]
                    if len(xy) < 4:
                        continue
                    if kind == 'gradil':
                        fences.append(xy)
                    else:
                        walls.append({'kind': kind, 'line': xy})
            z['fences'], z['walls'] = fences, walls
            log(f'bordas {z["name"]}: ' + ', '.join(f'{k} {v:.0f} m' for k, v in sorted(metros.items(), key=lambda kv: -kv[1]))
                + f'; {len(fences)} gradis ({sum(LineString(np.array(f).reshape(-1, 2)).length for f in fences):.0f} m), '
                f'{len(walls)} muros ({sum(LineString(np.array(w["line"]).reshape(-1, 2)).length for w in walls):.0f} m)')

    def postes(self):
        """Postes de concreto com fiacao ao longo das vias (um lado de cada via), lampada no braco; nas avenidas grandes
        e na volta, postes de luz de aco."""
        rng = np.random.default_rng(7)
        out, fios = [], []
        perto_bloq = cKDTree(np.array([[b['x'], b['y']] for b in self.bloqueios_l] + self.bocas_l)) if self.bloqueios_l else None
        perto_fx = cKDTree(np.array([f[:2] for f in self.faixas_l])) if self.faixas_l else None
        for r in self.ruas:
            if r['hw'] in EXPRESSA or (r['hw'] == 'service' and not r['nome']):
                continue
            P, N, T = r['P'], r['N'], r['T']
            s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
            if s[-1] < 20:
                continue
            lado = 1 if (r['id'] % 2) else -1
            passo = 34 + (r['id'] % 7)
            u = (r['id'] * 13) % int(passo)
            ultimo = None
            while u < s[-1]:
                k = int(np.argmin(np.abs(s - u)))
                w, c = float(r['larg'][k]), float(r['cen'][k])
                cal = r['cal_e'] if lado > 0 else r['cal_d']
                off = c + lado * (w / 2 + .45)
                x, y = P[k] + N[k] * off
                ok = self.na_grade(x, y) and self.livre(x, y, .35) and not self.perto_de_esquina(x, y, 7)
                if ok and perto_fx is not None and perto_fx.query([x, y])[0] < 5:
                    ok = False
                if ok and perto_bloq is not None and perto_bloq.query([x, y])[0] < 8:
                    ok = False
                if ok:
                    hd = math.atan2(-N[k, 1] * lado, -N[k, 0] * lado)      # o braco aponta para a rua
                    out.append([round(float(x), 2), round(float(y), 2), round(hd, 3), 1 if r['pista'] else 0])
                    if ultimo is not None and math.hypot(x - ultimo[0], y - ultimo[1]) < 55:
                        fios.append([ultimo[2], len(out) - 1])
                    ultimo = (x, y, len(out) - 1)
                    u += passo + rng.uniform(-3, 3)
                else:
                    u += 4
                    if ultimo is not None and math.hypot(P[k][0] - ultimo[0], P[k][1] - ultimo[1]) > 50:
                        ultimo = None
        self.postes_l, self.fios_l = out, fios
        log(f'postes {len(out)}, vaos de fio {len(fios)}')

    def arvores(self):
        """Arvores de calcada (largas o bastante) e de praca, longe dos postes, das faixas e dos bloqueios."""
        rng = np.random.default_rng(11)
        postes = cKDTree(np.array([p[:2] for p in self.postes_l])) if self.postes_l else None
        evitar = [f[:2] for f in self.faixas_l] + [s[:2] for s in self.semaf_l] + [p[:2] for p in self.pontos_l] + [[b['x'], b['y']] for b in self.bloqueios_l] + self.bocas_l
        ev = cKDTree(np.array(evitar)) if evitar else None
        out = []
        for r in self.ruas:
            for lado, cal in ((1, r['cal_e']), (-1, r['cal_d'])):
                if cal < 2.5:
                    continue
                P, N = r['P'], r['N']
                s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
                u = rng.uniform(2, 9)
                while u < s[-1]:
                    k = int(np.argmin(np.abs(s - u)))
                    w, c = float(r['larg'][k]), float(r['cen'][k])
                    x, y = P[k] + N[k] * (c + lado * (w / 2 + .85))
                    ok = self.livre(x, y, 1.2) and self.calcada_p.contains(Point(x, y)) and not self.perto_de_esquina(x, y, 9)
                    if ok and postes is not None and postes.query([x, y])[0] < 3.5:
                        ok = False
                    if ok and ev is not None and ev.query([x, y])[0] < 6:
                        ok = False
                    if ok and rng.random() < .72:
                        out.append([round(float(x), 2), round(float(y), 2)])
                    u += rng.uniform(8, 14)
        # Pracas e gramados: espalhadas, uma a cada ~110 m2.
        verde = self.verde
        n0 = len(out)
        for p in (list(verde.geoms) if hasattr(verde, 'geoms') else [verde]):
            if p.is_empty or p.area < 60:
                continue
            m = int(p.area / 110)
            x0, y0, x1, y1 = p.bounds
            xs = rng.uniform(x0, x1, m * 3)
            ys = rng.uniform(y0, y1, m * 3)
            den = shapely.contains_xy(p.buffer(-1.5), xs, ys)
            for x, y in list(zip(xs[den], ys[den]))[:m]:
                if self.livre(x, y, 1.0) and (postes is None or postes.query([x, y])[0] > 3):
                    out.append([round(float(x), 2), round(float(y), 2)])
        self.arvores_l = out
        log(f'arvores: {n0} de calcada, {len(out) - n0} de praca')

    def estacionados(self):
        """Carros parados junto ao meio-fio nas ruas de bairro (nao na volta, nem perto de esquina, faixa ou bloqueio)."""
        rng = np.random.default_rng(23)
        evitar = [f[:2] for f in self.faixas_l] + [s[:2] for s in self.semaf_l] + [p[:2] for p in self.pontos_l]
        ev = cKDTree(np.array(evitar)) if evitar else None
        bl = cKDTree(np.array([[b['x'], b['y']] for b in self.bloqueios_l] + self.bocas_l)) if self.bloqueios_l else None
        out = []
        for r in self.ruas:
            if r['pista'] or r['hw'] not in ESTACIONA:
                continue
            for lado in (-1, 1):
                if not r['mao'] and lado > 0 and rng.random() < .5:
                    continue
                P, N, T = r['P'], r['N'], r['T']
                s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
                u = rng.uniform(4, 10)
                while u < s[-1] - 4:
                    k = int(np.argmin(np.abs(s - u)))
                    w, c = float(r['larg'][k]), float(r['cen'][k])
                    if w < 6.2:
                        u += 6
                        continue
                    x, y = P[k] + N[k] * (c + lado * (w / 2 - 1.15))
                    ok = self.na_grade(x, y) and not self.perto_de_esquina(x, y, 11) and not self.corredor_buf.contains(Point(x, y))
                    if ok and ev is not None and ev.query([x, y])[0] < 7:
                        ok = False
                    if ok and bl is not None and bl.query([x, y])[0] < 12:
                        ok = False
                    if ok and not self.leito_p.contains(Point(x, y)):
                        ok = False
                    if ok and rng.random() < .62:
                        sentido = 1 if (lado < 0 or r['mao']) else -1
                        hd = math.atan2(T[k, 1] * sentido, T[k, 0] * sentido)
                        out.append([round(float(x), 2), round(float(y), 2), round(hd, 3)])
                        u += rng.uniform(5.3, 6.4)
                    else:
                        u += rng.uniform(4, 9)
        self.estacionados_l = out
        log(f'carros estacionados: {len(out)}')

    def placas(self):
        """Placas com o nome das ruas nas esquinas de duas vias com nome (uma por esquina)."""
        out = []
        for n in self.esquinas:
            vias = sorted(set(self.no_vias[n]))
            nomes = []
            for v in vias:
                if self.ruas[v]['nome'] and self.ruas[v]['nome'] not in nomes and self.ruas[v]['hw'] not in EXPRESSA:
                    nomes.append(self.ruas[v]['nome'])
            if len(nomes) < 2:
                continue
            x, y = self.o['pos'][n]
            r0 = max(float(np.median(self.ruas[v]['larg'])) for v in vias)
            feito = False
            for a in np.linspace(math.pi / 4, 2 * math.pi + math.pi / 4, 8, endpoint=False):
                px_, py_ = x + math.cos(a) * (r0 / 2 + 2.6), y + math.sin(a) * (r0 / 2 + 2.6)
                if self.livre(px_, py_, .3) and self.calcada_p.contains(Point(px_, py_)):
                    out.append([round(px_, 2), round(py_, 2), round(a, 3), nomes[0], nomes[1]])
                    feito = True
                    break
        dd = []
        for p in out:
            if all(math.hypot(p[0] - q[0], p[1] - q[1]) > 20 for q in dd):
                dd.append(p)
        self.placas_l = dd
        log(f'placas de rua: {len(dd)}')

    def faixas_da_pista(self):
        """Por estacao da volta: as faixas e a mao da via real (para pintar as divisoes de faixa no asfalto)."""
        tags = {w['id']: w.get('tags', {}) for w in self.o['vias']}
        out = []
        for i, v in enumerate(self.via_pista):
            tg = tags.get(int(v), {})
            mao = tg.get('oneway') in ('yes', '1') or str(tg.get('highway', '')).endswith('_link')
            try:
                fx = int(float(tg.get('lanes', '').split(';')[0]))
            except ValueError:
                fx = 1 if mao else 2
            out.append([fx, 1 if mao else 0])
        # Em trechos (s0, faixas, mao) para nao repetir.
        trechos = []
        for i, (fx, mao) in enumerate(out):
            if not trechos or trechos[-1][1:] != [fx, mao]:
                trechos.append([round(float(self.A[i, 0]), 1), fx, mao])
        self.pista_faixas_trechos = trechos
        log(f'faixas da volta: {len(trechos)} trechos')

    def edificios3d(self):
        """As pegadas reais do cadastro (GeoFloripa) das edificacoes que gerar_floripa.py da como retangulos (as mesmas, ja podadas
        pelas faixas do jogo: casadas pelo centro do retangulo), com a altura dela e o tipo do OSM quando mapeado, para o
        modulo de predios (city-buildings.js) extrudar o contorno de verdade."""
        b = self.base['scenery']['buildings']
        c = {k: i for i, k in enumerate(b['columns'])}
        kept = np.array([[it[c['x']], it[c['y']]] for it in b['items']])
        kd = cKDTree(kept)
        tipos, osm_p = [], []
        for w in self.o['vias']:
            tg = w.get('tags', {})
            if 'building' in tg and w['nodes'][0] == w['nodes'][-1]:
                A = gf.linha_via(self.o, w)
                if len(A) >= 4:
                    osm_p.append(Polygon(A).buffer(0))
                    tipos.append(tg.get('building') if tg.get('building') != 'yes' else (tg.get('amenity') or tg.get('shop') and 'retail' or 'yes'))
        osm_t = STRtree(osm_p)
        out, usados = [], set()
        for f in json.loads((self.pasta / 'geofloripa_edificacoes.geojson').read_text(encoding='utf-8'))['features']:
            g = affinity.translate(shape(f['geometry']), -self.origem[0], -self.origem[1]).buffer(0)
            if g.is_empty or g.area < 12:
                continue
            p = max(g.geoms, key=lambda h: h.area) if g.geom_type == 'MultiPolygon' else g
            r = p.minimum_rotated_rectangle.centroid
            dd, k = kd.query([round(r.x, 2), round(r.y, 2)])
            if dd > .06 or k in usados:
                continue
            usados.add(k)
            it = b['items'][k]
            q = Polygon(p.exterior).simplify(.25, preserve_topology=True)
            if q.is_empty or not q.is_valid or len(q.exterior.coords) < 4:
                continue
            q = shapely.geometry.polygon.orient(q, 1.0)
            hit = osm_t.query(p.representative_point(), predicate='intersects')
            tipo = tipos[hit[0]] if len(hit) else ''
            anel = np.round(np.array(q.exterior.coords)[:-1], 2).ravel().tolist()
            out.append([round(float(it[c['h']]), 2), it[c['kind']], tipo or '', anel, it[c['x']], it[c['y']]])
        self.edificios_l = out
        log(f'pegadas reais: {len(out)} de {len(kept)} retangulos (tipos do OSM em {sum(1 for e in out if e[2])})')

    def lugares(self):
        """Os lugares do OSM mapeados como contornos (amenity, shop, tourism, historic): o centro, o tipo, se e historico e os
        andares. Sem os nomes (comercios de verdade nao aparecem no jogo); para as mesas de bar na calcada, as fachadas
        antigas e o que mais a cidade souber de cada predio."""
        out = []
        for w in self.o['vias']:
            tg = w.get('tags', {})
            amenity = tg.get('amenity')
            if amenity in ('parking', 'parking_entrance', 'bench', 'motorcycle_parking', 'bicycle_parking', 'fountain'):
                amenity = None
            tipo = amenity or (('shop:' + tg['shop']) if tg.get('shop') else None) or tg.get('tourism')
            hist = tg.get('historic')
            if not tipo and not hist:
                continue
            A = gf.linha_via(self.o, w)
            if len(A) < 3:
                continue
            g = Polygon(A).buffer(0) if (w['nodes'][0] == w['nodes'][-1] and len(A) >= 4) else LineString(A)
            c = g.centroid
            if g.is_empty or not self.na_grade(c.x, c.y, 2):
                continue
            try:
                andares = int(float(tg.get('building:levels', '0')))
            except ValueError:
                andares = 0
            out.append([round(c.x, 2), round(c.y, 2), tipo or '', hist or '', andares])
        self.lugares_l = out
        log(f'lugares do OSM: {len(out)} ({sum(1 for x in out if x[3])} historicos)')

    def pracas(self):
        """As pracas e parques perto da volta (GeoFloripa e OSM, ate 400 m dela, mais de 300 m2): contorno, area, distancia e o
        nome publico, para quem quiser por ali uma fan zone, bancos ou gente."""
        lap = LineString(self.A[:, 1:3])
        cands = []
        for f in json.loads((self.pasta / 'geofloripa_parques.geojson').read_text(encoding='utf-8'))['features']:
            g = affinity.translate(shape(f['geometry']), -self.origem[0], -self.origem[1]).buffer(0)
            cands.append((g, f['properties'].get('nome_popular') or ''))
        for w in self.o['vias']:
            tg = w.get('tags', {})
            if tg.get('leisure') in ('park', 'garden') or tg.get('place') == 'square' or (tg.get('highway') == 'pedestrian' and tg.get('area') == 'yes'):
                A = gf.linha_via(self.o, w)
                if len(A) >= 4 and w['nodes'][0] == w['nodes'][-1]:
                    cands.append((Polygon(A).buffer(0), tg.get('name', '')))
        out = []
        for g, nome in cands:
            for q in (list(g.geoms) if hasattr(g, 'geoms') else [g]):
                if q.geom_type != 'Polygon' or q.area < 300:
                    continue
                q = q.difference(self.leito).difference(self.corredor.buffer(2))
                for r in (list(q.geoms) if hasattr(q, 'geoms') else [q]):
                    if r.geom_type != 'Polygon' or r.area < 300 or not self.na_grade(r.centroid.x, r.centroid.y, 2):
                        continue
                    dist = r.distance(lap)
                    if dist > 400:
                        continue
                    if any(r.symmetric_difference(o_['_g']).area < .2 * r.area for o_ in out):
                        continue
                    anel = np.round(np.array(r.simplify(.5).exterior.coords)[:-1], 2).ravel().tolist()
                    out.append({'_g': r, 'ring': anel, 'area': round(r.area), 'dist': round(dist, 1), 'name': nome})
        out.sort(key=lambda o_: o_['dist'])
        for o_ in out:
            del o_['_g']
        self.pracas_l = out
        log(f'pracas perto da volta: {len(out)} ({", ".join(o_["name"] for o_ in out[:8] if o_["name"])})')

    def trapiches(self):
        """Trapiches e piers do OSM (man_made=pier) na grade: linha (largura da etiqueta ou 2,5 m) ou contorno fechado."""
        out = []
        for w in self.o['vias']:
            tg = w.get('tags', {})
            if tg.get('man_made') != 'pier':
                continue
            A = gf.linha_via(self.o, w)
            if len(A) < 2 or not LineString(A).intersects(self.grade):
                continue
            fechado = w['nodes'][0] == w['nodes'][-1] and len(A) >= 4
            try:
                larg = float(tg.get('width', '2.5'))
            except ValueError:
                larg = 2.5
            out.append({'points': np.round(A, 2).tolist(), 'closed': fechado, 'width': larg, 'name': tg.get('name', '')})
        self.trapiches_l = out
        log(f'trapiches: {len(out)}')

    def vias_saida(self):
        out = []
        for r in self.ruas:
            if r['pista']:
                continue
            e = r['P'] + r['N'] * r['cen'][:, None]
            out.append({'id': r['id'], 'name': r['nome'], 'kind': r['hw'], 'lanes': r['faixas'], 'oneway': r['mao'],
                        'points': np.round(np.column_stack([e, r['larg']]), 2)[::2 if len(e) > 6 else 1].tolist()})
        return out

    def planta(self, arq):
        """Conferencia local: as regioes desenhadas sobre a grade."""
        S = 1.0
        img = Image.new('RGB', (int(self.W * S), int(self.H * S)), (40, 36, 30))
        dr = ImageDraw.Draw(img)
        px = lambda c: [((x - self.x0) * S, (self.H - (y - self.y0)) * S) for x, y in c]

        def pinta(g, cor):
            m = Image.new('L', img.size, 0)
            dm = ImageDraw.Draw(m)
            for p in (list(g.geoms) if hasattr(g, 'geoms') else [g]):
                if p.geom_type != 'Polygon' or p.is_empty:
                    continue
                dm.polygon(px(p.exterior.coords), fill=255)
                for h in p.interiors:
                    dm.polygon(px(h.coords), fill=0)
            img.paste(Image.new('RGB', img.size, cor), (0, 0), m)
        pinta(self.mar_u, (30, 60, 110))
        pinta(self.verde, (60, 110, 50))
        pinta(self.praca, (200, 190, 160))
        pinta(self.calcada, (170, 170, 165))
        pinta(self.estacionamento, (90, 90, 95))
        pinta(self.leito, (60, 60, 64))
        pinta(self.ciclovia, (170, 50, 40))
        pinta(self.predios_u, (120, 80, 60))
        pinta(self.corredor.difference(self.asfalto_pista), (230, 230, 230))
        for b in self.bloqueios_l:
            x, y = px([(b['x'], b['y'])])[0]
            dr.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(255, 0, 0))
        for p in self.postes_l:
            x, y = px([p[:2]])[0]
            dr.point((x, y), fill=(255, 255, 0))
        for p in self.arvores_l:
            x, y = px([p[:2]])[0]
            dr.ellipse([x - 1.5, y - 1.5, x + 1.5, y + 1.5], fill=(20, 200, 40))
        for p in self.estacionados_l:
            x, y = px([p[:2]])[0]
            dr.rectangle([x - 1, y - 1, x + 1, y + 1], fill=(0, 200, 255))
        for f in self.faixas_l:
            x, y = px([f[:2]])[0]
            dr.rectangle([x - 2, y - 2, x + 2, y + 2], outline=(255, 255, 255))
        for s in self.semaf_l:
            x, y = px([s[:2]])[0]
            dr.ellipse([x - 3, y - 3, x + 3, y + 3], outline=(255, 160, 0))
        img.save(arq, quality=90)
        log(f'planta: {arq}')


def main():
    cid = Cidade()
    cid.pista()
    cid.predios()
    cid.vias()
    cid.regioes()
    cid.aplainar()
    cid.preparar_pontos()
    cid.faixas_e_semaforos()
    cid.bloqueios()
    cid.edificios3d()
    cid.passeio()
    cid.postes()
    cid.arvores()
    cid.estacionados()
    cid.placas()
    cid.faixas_da_pista()
    cid.trapiches()
    cid.lugares()
    cid.pracas()
    if '--planta' in sys.argv:
        cid.planta(cid.pasta / 'planta_cidade_floripa.jpg')
    mapas = cid.mapa()
    d = cid.base
    # O chao com as ruas aplainadas (Cidade.aplainar).
    d['terrain']['z'] = np.round(cid.Z, 2).ravel().tolist()
    meta = d['meta']
    # Os muros de uma cidade fechada para a corrida: blocos de concreto cru, sem a pintura de autodromo (street-walls.js).
    meta['wall_paint'] = 'bare'
    meta['city'] = True
    # As zonas de passeio (physics.js meta.roam) e os muros abertos nas bocas das ruas delas.
    meta['roam'] = {'zones': cid.passeio_l}
    meta['rails'] = cid.rails
    meta['caveat'] = meta['caveat'] + (' A cidade: as ruas, calçadas, praças, ciclovias, faixas de pedestre, semáforos e pontos de ônibus '
                                       'são os do OSM e do GeoFloripa; bloqueios, postes, árvores de calçada e carros parados são desenho de jogo.')
    city = {
        'map': {'file': mapas[0], 'rows': mapas[1], 'gap': GAP, 'x0': cid.x0, 'y0': cid.y0, 'width': cid.W, 'height': cid.H, 'px': PX, 'range': FAIXA,
                'channels': [['road', 'sidewalk', 'plaza'], ['cycleway', 'green', 'parking']]},
        'streets': cid.vias_saida(),
        'crossings': {'columns': ['x', 'y', 'heading', 'width'], 'items': cid.faixas_l},
        'signals': {'columns': ['x', 'y', 'heading', 'width', 'oneway'], 'items': cid.semaf_l},
        'stops': {'columns': ['x', 'y', 'heading'], 'items': cid.pontos_l},
        'closures': cid.bloqueios_l,
        'poles': {'columns': ['x', 'y', 'heading', 'track'], 'items': cid.postes_l, 'wires': cid.fios_l},
        'parked': {'columns': ['x', 'y', 'heading'], 'items': cid.estacionados_l},
        'plates': {'columns': ['x', 'y', 'heading', 'name_a', 'name_b'], 'items': cid.placas_l},
        'coast': [np.round(c, 2).tolist() for c in cid.costa],
        'piers': cid.trapiches_l,
        'pois': {'columns': ['x', 'y', 'kind', 'historic', 'levels'], 'items': cid.lugares_l},
        'squares': cid.pracas_l,
        'buildings': {'columns': ['h', 'kind', 'type', 'ring', 'x', 'y'], 'items': cid.edificios_l},
        'track': {'lanes': {'columns': ['s', 'lanes', 'oneway'], 'items': cid.pista_faixas_trechos},
                  'crossings': [list(x) for x in cid.pista_faixas], 'signals': cid.pista_semaf, 'stops': [p_[0] for p_ in cid.pista_pontos],
                  'stop_sides': [p_[1] for p_ in cid.pista_pontos]},
    }
    d['scenery']['city'] = city
    # As arvores de calcada e de praca entram pelas arvores mapeadas (landscape.js: scenery.trees), postes para o Opala.
    d['scenery']['trees'] = {'columns': ['x', 'y'], 'items': cid.arvores_l}
    destino = DADOS / f'pista_{NOME}.json'
    tmp = destino.with_suffix('.tmp')
    tmp.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    import os, time
    # As edificacoes que o jogo desenharia sobre o que ele poe atras dos muros (com a cidade os outdoors fogem das ruas
    # fechadas e mudam de lugar): a mesma poda de gerar_floripa.py (podar_edificios.mjs) e as pegadas reais seguem os
    # retangulos que ficam.
    import subprocess
    from config import RAIZ
    # O Node portatil da pasta apps (acima do repositorio, tambem de dentro de uma worktree), senao o do PATH.
    node = next((q / 'apps' / 'node-v22.23.2-win-x64' / 'node.exe' for q in RAIZ.parents if (q / 'apps' / 'node-v22.23.2-win-x64' / 'node.exe').exists()), 'node')
    subprocess.run([str(node), str(Path(__file__).with_name('podar_edificios.mjs')), str(tmp)], check=True)
    d = json.loads(tmp.read_text(encoding='utf-8'))
    bc = {k: i for i, k in enumerate(d['scenery']['buildings']['columns'])}
    ficam = {(it[bc['x']], it[bc['y']]) for it in d['scenery']['buildings']['items']}
    cb = d['scenery']['city']['buildings']
    antes = len(cb['items'])
    cb['items'] = [it for it in cb['items'] if (it[4], it[5]) in ficam]
    log(f'pegadas reais depois da poda: {len(cb["items"])} de {antes}')
    cid.bordas_passeio(d)
    tmp.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    for _ in range(20):
        try:
            os.replace(tmp, destino)
            break
        except PermissionError:
            time.sleep(.5)
    log(f'{destino.name}: {destino.stat().st_size / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
