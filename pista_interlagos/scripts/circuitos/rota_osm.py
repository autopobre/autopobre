"""Volta por pernas sobre o grafo das vias do OpenStreetMap (circuitos de rua desenhados sobre o mapa).

Cada perna e um ponto por onde a volta passa (perto de uma via com certo nome ou de certas vias) e os nomes de rua
preferidos ate ele; entre as pernas vale o menor caminho (Dijkstra) em que as vias preferidas custam o comprimento
e as outras `outro` vezes mais. A contramao custa um pouco mais (a corrida fecha as ruas, mas a mao da via escolhe a
pista certa de uma avenida de duas pistas); uma aresta ja usada custa 30 vezes mais (a volta nao repete rua).
Ligacoes que nao existem (`ficticias`) entram no grafo como arestas retas.

Devolve a sequencia de nos (lat, lon), a via de cada trecho e o nivel dele: 'elevado' (Elevado Presidente Joao
Goulart), 'rampa' (alca em ponte), 'viaduto', 'tunel', 'ficticia' ou 'rua'.
"""
import heapq
import math

DIRIGIVEIS = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street',
              'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}


class Grafo:
    def __init__(self, osm, extra=()):
        self.nos = {e['id']: (e['lat'], e['lon']) for e in osm['elements'] if e['type'] == 'node'}
        self.vias = {e['id']: e for e in osm['elements'] if e['type'] == 'way'}
        self.adj = {}
        for w in self.vias.values():
            t = w.get('tags', {})
            if t.get('highway') not in DIRIGIVEIS and t.get('highway') not in extra:
                continue
            ow = t.get('oneway', 'yes' if t.get('junction') in ('roundabout', 'circular') else 'no')
            ns = [n for n in w['nodes'] if n in self.nos]
            for a, b in zip(ns, ns[1:]):
                L = self.dist(a, b)
                self.adj.setdefault(a, []).append((b, w['id'], L, ow != '-1'))
                self.adj.setdefault(b, []).append((a, w['id'], L, ow in ('no', '-1')))

    def dist(self, a, b):
        (la1, lo1), (la2, lo2) = self.nos[a], self.nos[b]
        return math.hypot((la2 - la1) * 111320, (lo2 - lo1) * 111320 * math.cos(math.radians(la1)))

    def nome(self, wid):
        return self.vias[wid].get('tags', {}).get('name', '')

    def nivel(self, wid):
        t = self.vias[wid].get('tags', {})
        if t.get('highway') == 'ficticia':
            return 'ficticia'
        if 'Goulart' in t.get('name', ''):
            return 'elevado'
        if t.get('bridge') and t.get('highway', '').endswith('_link'):
            return 'rampa'
        if t.get('bridge'):
            return 'viaduto'
        if t.get('tunnel'):
            return 'tunel'
        return 'rua'

    def perto(self, lat, lon, filtro=None, vias=None):
        melhor, dm = None, 1e18
        for a, lst in self.adj.items():
            if filtro or vias:
                if not any((filtro and filtro.lower() in self.nome(w).lower()) or (vias and w in vias) for _, w, _, _ in lst):
                    continue
            la, lo = self.nos[a]
            dd = ((la - lat) * 111320) ** 2 + ((lo - lon) * 111320 * math.cos(math.radians(lat))) ** 2
            if dd < dm:
                melhor, dm = a, dd
        return melhor, math.sqrt(dm)

    def ligar(self, nome, de, para):
        """Aresta reta nova (uma ligacao que nao existe), nos dois sentidos."""
        wid = -1000 - sum(1 for v in self.vias if v < 0)
        self.vias[wid] = {'id': wid, 'nodes': [de, para], 'tags': {'name': nome, 'highway': 'ficticia'}}
        L = self.dist(de, para)
        self.adj.setdefault(de, []).append((para, wid, L, True))
        self.adj.setdefault(para, []).append((de, wid, L, True))
        return wid

    def rota(self, a, b, prefere=(), vias_pref=(), usados=frozenset(), contramao=1.6, outro=4.0, proibir=frozenset()):
        dist, prev, fila = {a: 0.0}, {}, [(0.0, a)]
        while fila:
            d0, u = heapq.heappop(fila)
            if u == b:
                break
            if d0 > dist.get(u, 1e18):
                continue
            for v, w, L, sentido in self.adj.get(u, []):
                if w in proibir:
                    continue
                nm = self.nome(w).lower()
                f = 1.0 if (any(p.lower() in nm for p in prefere if p) or w in vias_pref) else outro
                if not sentido:
                    f *= contramao
                if (u, v) in usados or (v, u) in usados:
                    f *= 30
                nd = d0 + L * f
                if nd < dist.get(v, 1e18):
                    dist[v] = nd
                    prev[v] = (u, w)
                    heapq.heappush(fila, (nd, v))
        if b not in prev and a != b:
            raise SystemExit(f'sem caminho {a} -> {b}')
        nos_c, vias_c, x = [b], [], b
        while x != a:
            u, w = prev[x]
            nos_c.append(u)
            vias_c.append(w)
            x = u
        return nos_c[::-1], vias_c[::-1]


def volta(osm, pernas, ficticias=(), proibir=(), extra=()):
    """A volta fechada pelas pernas. ficticias: [{'nome', 'de': (lat, lon), 'de_vias', 'para': (lat, lon), 'para_vias'}].
    Devolve (nos [(lat, lon)], vias [id por trecho], niveis, nomes, marcas {rotulo: indice do no})."""
    G = Grafo(osm, extra)
    for f in ficticias:
        a, _ = G.perto(*f['de'], filtro=f.get('de_filtro'), vias=set(f.get('de_vias', [])) or None)
        b, _ = G.perto(*f['para'], filtro=f.get('para_filtro'), vias=set(f.get('para_vias', [])) or None)
        G.ligar(f['nome'], a, b)
    pontos = []
    for p in pernas:
        n, d = G.perto(p['lat'], p['lon'], filtro=p.get('filtro'), vias=set(p.get('vias', [])) or None)
        if d > 120:
            raise SystemExit(f"perna '{p['rotulo']}' a {d:.0f} m da via pedida")
        pontos.append((n, p))
    nos, vias, usados, marcas = [pontos[0][0]], [], set(), {}
    for (a, pa), (b, pb) in zip(pontos, pontos[1:] + pontos[:1]):
        marcas[pa['rotulo']] = len(nos) - 1
        ns, ws = G.rota(a, b, prefere=pb.get('prefere', ()), vias_pref=set(pb.get('vias', [])) | set(pb.get('vias_pref', [])),
                        usados=frozenset(usados), outro=pb.get('outro', 4.0),
                        proibir=frozenset(pb.get('proibir', [])) | frozenset(proibir))
        usados.update(zip(ns, ns[1:]))
        nos += ns[1:]
        vias += ws
    nos = nos[:-1]          # o ultimo no e o primeiro (volta fechada)
    return ([G.nos[n] for n in nos], vias, [G.nivel(w) for w in vias], [G.nome(w) for w in vias], marcas, nos, G)
