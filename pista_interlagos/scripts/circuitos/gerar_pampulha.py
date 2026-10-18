"""Circuito da Pampulha: circuito de rua imaginario na orla da Lagoa da Pampulha e em volta do Mineirao (Belo Horizonte).

    python baixar_fontes.py pampulha            (OSM, ANADEM, Copernicus, WorldCover, Sentinel-2, edificacoes Microsoft)
    python gerar_pampulha.py [--planta] [--perfil] [--so-perfil]

Pedido #8 da Central de Projetos (17/10/2026), com o tracado desenhado no mapa: largada na Av. Coronel Oscar Paschoal rumo
a lagoa, pela pista oeste, com o Mineirao a direita (os boxes ficam na reta da orla norte); a orla inteira da lagoa (Av.
Otacilio Negrao de Lima e, sobre a barragem, a pista da Av. Dom Pedro I do lado da agua) no sentido horario, de volta a
rotatoria da orla com a Oscar Paschoal; o primeiro quarteirao da Oscar Paschoal (o unico usado nos dois sentidos, com o
canteiro), a Av. Antonio Abrahao Caram, a Av. Rei Pele e a Av. Presidente Carlos Luz em volta do Mineirao no sentido
horario, de volta a reta. Sem canteiros centrais nem rotatorias no resto: a pista ocupa a avenida (ate LARG_MAX).
Corridas de uma volta so (meta.laps).

O eixo sao as vias do OpenStreetMap pelas pernas (rota_osm.py), com as esquinas arredondadas e o rumo suavizado; nas
avenidas de duas pistas o eixo vai para o meio delas (corredor()).
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

import gerar_floripa as gf
import gerar_minhocao as gm
import gerar_pista as gp
import rota_osm
from compat_scipy import cKDTree, gaussian_filter1d
from config import CIRCUITOS, pasta_fontes
from projecao import Transformer

NOME = 'pampulha'
DS = 2.0
PASSO = 5.0
SEMENTE = 99

O = ['Otacílio', 'Otacilío']
# Vias da volta que ficam com a propria pista (sem juntar a pista paralela): a reta principal (a pista oeste da Oscar
# Paschoal; a leste desce para a Abrahao Caram no fim da volta), o primeiro quarteirao (as duas pistas sao trechos diferentes da volta) e a
# barragem (entre a pista da agua e a outra corre o BRT).
RETA_OESTE = [961683916, 961683915, 251869870]
QUARTEIRAO_OESTE = [4893832]
QUARTEIRAO_LESTE = [219413200, 60007105]
BARRAGEM = [227132115, 227132875]
SO_PROPRIA = RETA_OESTE + QUARTEIRAO_OESTE + QUARTEIRAO_LESTE + BARRAGEM
PERNAS = [
    {'rotulo': 'largada', 'lat': -19.8670, 'lon': -43.9727, 'vias': [251869870],
     'vias_pref': [251869870, 1389975077, 1389975076, 541741506, 541741507]},
    # Pela pista oeste do primeiro quarteirao ate a rotatoria, a esquerda na orla (a leste e a da volta).
    {'rotulo': 'orla_sul', 'lat': -19.86283, 'lon': -43.9760, 'filtro': 'Otacílio', 'prefere': O,
     'vias_pref': RETA_OESTE + QUARTEIRAO_OESTE + [222068909], 'proibir': QUARTEIRAO_LESTE + [325549597, 4497890, 223929578]},
    # A rua em frente a Igrejinha (o laco em volta da ponta da peninsula, entre a igreja e a lagoa), em vez da avenida
    # atras dela (pedido da equipe depois da rodada 1). No OSM e via de pedestres: entra no grafo como rua (RUAS_LIBERADAS).
    {'rotulo': 'igrejinha', 'lat': -19.85855, 'lon': -43.9792, 'vias': [364055129], 'prefere': O},
    {'rotulo': 'parque_ecologico', 'lat': -19.8597, 'lon': -43.9942, 'filtro': 'Otacílio', 'prefere': O},
    {'rotulo': 'baixo_oeste', 'lat': -19.8611, 'lon': -43.9976, 'filtro': 'Otacílio', 'prefere': O},
    {'rotulo': 'braco_oeste_sul', 'lat': -19.8539, 'lon': -44.0060, 'filtro': 'Otacílio', 'prefere': O},
    {'rotulo': 'braco_oeste_norte', 'lat': -19.8510, 'lon': -44.0057, 'filtro': 'Otacílio', 'prefere': O},
    {'rotulo': 'braco_noroeste', 'lat': -19.8454, 'lon': -43.9993, 'filtro': 'Otacílio', 'prefere': O},
    {'rotulo': 'braco_norte', 'lat': -19.8383, 'lon': -43.9943, 'filtro': 'Otacílio', 'prefere': O},
    {'rotulo': 'baia_norte', 'lat': -19.8479, 'lon': -43.9750, 'filtro': 'Otacílio', 'prefere': O},
    {'rotulo': 'braco_nordeste', 'lat': -19.8436, 'lon': -43.9690, 'filtro': 'Otacílio', 'prefere': O},
    {'rotulo': 'barragem', 'lat': -19.84638, 'lon': -43.96697, 'vias': BARRAGEM, 'prefere': O},
    {'rotulo': 'braco_sul_leste', 'lat': -19.8608, 'lon': -43.9752, 'filtro': 'Otacílio', 'prefere': O},
    {'rotulo': 'primeiro_quarteirao', 'lat': -19.8634, 'lon': -43.9739, 'vias': [219413200], 'prefere': O},
    {'rotulo': 'abrahao_caram', 'lat': -19.8636, 'lon': -43.9720, 'vias': [342969879]},
    {'rotulo': 'rei_pele', 'lat': -19.8660, 'lon': -43.9692, 'vias': [541741502, 219413195], 'prefere': ['Rei Pel']},
    {'rotulo': 'carlos_luz', 'lat': -19.8690, 'lon': -43.9705, 'vias': [253082643, 541741503, 31489335], 'prefere': ['Carlos Luz']},
]
LARG_MIN = 10.0
# Vias que o OSM marca de pedestres e a volta usa como rua: a da frente da Igrejinha.
RUAS_LIBERADAS = {364055129}
LARGURA_RAMPA = .1
LARG_MAX = 20.0
# Canteiro mais largo que isto (entre os meios-fios das duas pistas) separa avenidas, nao e canteiro de avenida.
CANTEIRO_MAX = 14.0
# Largura de uma faixa de rolamento e o que sobra para a sarjeta (m).
FAIXA_M = 3.3
SARJETA_M = .6
FAIXAS_PADRAO = {'trunk': 3, 'primary': 3, 'secondary': 2, 'tertiary': 2, 'unclassified': 2, 'residential': 2}


def faixas(t):
    try:
        n = float(str(t.get('lanes', '')).split(';')[0])
    except ValueError:
        n = 0.0
    if not n:
        n = FAIXAS_PADRAO.get(t.get('highway'), 2)
        if t.get('oneway') == 'yes' and t.get('highway') in ('tertiary', 'secondary'):
            n = 2
    return n


def nome_base(nm):
    """O nome da avenida sem titulo nem acento (as pistas de uma avenida as vezes tem grafias diferentes)."""
    import unicodedata
    nm = unicodedata.normalize('NFKD', nm or '').encode('ascii', 'ignore').decode().lower()
    for t in ('avenida ', 'doutor ', 'presidente ', 'coronel '):
        nm = nm.replace(t, '')
    return nm.strip()


def corredor(P, E, T, via, G, origem, epsg, pista_propria):
    """O leito da avenida em cada estacao pelas pistas do OSM: o transecto de +-34 m corta as vias dirigiveis quase
    paralelas a volta; a partir da pista da propria volta, juntam-se as pistas de MESMO nome (o canteiro entre elas sai)
    com canteiro de ate CANTEIRO_MAX m. Cada pista ocupa as faixas dela (FAIXA_M) mais a sarjeta. Devolve, por estacao,
    as bordas esquerda/direita do leito (lateral, m; esquerda positiva) e quantas pistas foram juntas."""
    from shapely.geometry import LineString
    from shapely import STRtree
    para = Transformer.from_crs(4326, epsg, always_xy=True)
    linhas, info = [], []
    for w, v in G.vias.items():
        t = v.get('tags', {})
        if t.get('highway') not in rota_osm.DIRIGIVEIS or t.get('area') == 'yes':
            continue
        ll = np.array([G.nos[n] for n in v['nodes'] if n in G.nos])
        if len(ll) < 2:
            continue
        x, y = para.transform(ll[:, 1], ll[:, 0])
        linhas.append(LineString(np.column_stack([x, y]) - origem))
        info.append((w, nome_base(t.get('name', '')), faixas(t) * FAIXA_M / 2 + SARJETA_M))
    arv = STRtree(linhas)
    n = len(P)
    esq, dir_, npistas = np.full(n, np.nan), np.full(n, np.nan), np.zeros(n, int)
    for i in range(n):
        tr = LineString([P[i] - E[i] * 34, P[i] + E[i] * 34])
        cortes = []
        for j in arv.query(tr, predicate='intersects'):
            x = tr.intersection(linhas[j])
            for p in ([x] if x.geom_type == 'Point' else list(getattr(x, 'geoms', []))):
                if p.geom_type != 'Point':
                    continue
                # Rumo da via no ponto de corte: so as quase paralelas a volta (30 graus) contam.
                lj = linhas[j]
                f = lj.project(p)
                a, b = lj.interpolate(max(0, f - 2)), lj.interpolate(min(lj.length, f + 2))
                d = np.array([b.x - a.x, b.y - a.y])
                if np.linalg.norm(d) < 1e-6 or abs(d @ T[i]) / np.linalg.norm(d) < math.cos(math.radians(30)):
                    continue
                cortes.append(((p.x - P[i, 0]) * E[i, 0] + (p.y - P[i, 1]) * E[i, 1], info[j]))
        if not cortes:
            continue
        cortes.sort(key=lambda c_: c_[0])
        # A pista da volta: a via da estacao (ou o corte mais perto do eixo).
        k0 = min(range(len(cortes)), key=lambda q: (cortes[q][1][0] != via[i], abs(cortes[q][0])))
        if abs(cortes[k0][0]) > 6:
            continue
        lo = cortes[k0][0] - cortes[k0][1][2]
        hi = cortes[k0][0] + cortes[k0][1][2]
        nm = cortes[k0][1][1]
        cont = 1
        if not pista_propria[i] and nm:
            for passo in (-1, 1):
                q = k0 + passo
                borda = lo if passo < 0 else hi
                while 0 <= q < len(cortes):
                    d_, (w_, nm_, hw_) = cortes[q]
                    if nm_ == nm and (borda - (d_ + hw_) if passo < 0 else (d_ - hw_) - borda) <= CANTEIRO_MAX:
                        if passo < 0:
                            lo = min(lo, d_ - hw_)
                            borda = lo
                        else:
                            hi = max(hi, d_ + hw_)
                            borda = hi
                        cont += 1
                    elif nm_ == nm or abs(d_) > 30:
                        break
                    q += passo
        esq[i], dir_[i], npistas[i] = hi, lo, cont
    print(f'corredor: medido em {np.isfinite(esq).mean():.0%} das estacoes; avenidas de duas pistas em '
          f'{(npistas > 1).mean():.0%} da volta')
    return esq, dir_, npistas


SIGMA_RUMO = 8.0
# A rotatoria da orla com a Oscar Paschoal (a ilha separa a reta, que vira para a orla, da volta que desce o quarteirao).
ROTATORIA_MANTIDA = {4683178, 1443130092, 1443130093}
# Trechos desenhados (desenho de jogo): a volta entre os nos `de` e `ate` (os mais perto deles no trecho `s` das pernas,
# m) troca o caminho do OSM por linhas e arcos. A primeira curva: da pista oeste da Oscar Paschoal (OSM 4893832) para o
# meio da avenida da orla na ponta da lagoa (as duas pistas 222068909 e 223929578, sem o canteiro), um arco de `raio` m
# pelo gramado da esquina sudoeste da rotatoria (pelo anel do OSM era um grampo de 9 m encostado na volta que desce o
# quarteirao pela pista leste).
TRECHOS = [
    {'nome': 'primeira curva', 's': (0, 1500), 'raio': 25.0, 'largura': 12.0,
     'reta': {'via': 4893832, 'antes_m': 90.0},
     'orla': {'vias': (222068909, 223929578), 'via': 222068909, 'corta_fim_m': 20.0}},
]


def sem_bicos(P, vias, giro_max=75.0, curto=15.0, volta=120.0):
    """Tira os nos que fazem bico (o caminho vira mais de `giro_max` graus num no com um dos lados curto, ou mais de
    `volta` graus num no so): os nos de ilhas e triangulos de cruzamento, por onde a rota passava indo e voltando (na
    entrada da rua da Igrejinha ela ia ate a avenida e voltava). Os quase repetidos (0,5 m) tambem."""
    P, vias = P.copy(), np.array(vias)
    tirados = 0
    while True:
        n = len(P)
        a, c = np.roll(P, 1, 0), np.roll(P, -1, 0)
        u, w = P - a, c - P
        lu, lw = np.linalg.norm(u, axis=1), np.linalg.norm(w, axis=1)
        giro = np.degrees(np.abs(np.arctan2(u[:, 0] * w[:, 1] - u[:, 1] * w[:, 0], np.sum(u * w, axis=1))))
        ruim = ((giro > giro_max) & (np.minimum(lu, lw) < curto)) | (giro > volta) | (lw < .5)
        if not ruim.any():
            break
        j = int(np.flatnonzero(ruim)[np.argmax(giro[ruim])])
        P, vias = np.delete(P, j, 0), np.delete(vias, j)
        tirados += 1
    print(f'bicos tirados do caminho: {tirados} nos')
    return P, vias


def mediana_movel(v, tam):
    h = tam // 2
    ext = np.r_[v[-h:], v, v[:h]]
    return np.array([np.median(ext[i:i + tam]) for i in range(len(v))])


def desenhar_trechos(P0, vias, G, origem, para):
    """Troca o caminho do OSM de cada TRECHOS pelo desenhado: a reta pela linha da via `reta` ate a tangente, o arco e o
    meio das duas pistas da `orla` ate a ponta oeste dela. Devolve o poligono, as vias por vertice, os trechos desenhados
    (pontos) e a largura deles."""
    def xy(w):
        ll = np.array([G.nos[n] for n in G.vias[w]['nodes'] if n in G.nos])
        x, y = para.transform(ll[:, 1], ll[:, 0])
        return np.column_stack([x, y]) - origem
    desenhos = []
    for tr in TRECHOS:
        r = xy(tr['reta']['via'])
        # A pista oeste corre para o sul no OSM: o rumo da corrida e do ultimo no para o primeiro.
        dm = (r[0] - r[-1]) / np.linalg.norm(r[0] - r[-1])
        a_, b_ = (xy(w) for w in tr['orla']['vias'])
        # O meio da avenida (ela faz um arco na ponta da lagoa): as duas pistas a partir da ponta junto da reta,
        # reamostradas pela fracao do comprimento, e a media delas.
        a_, b_ = (c_ if np.linalg.norm(c_[0] - r[0]) < np.linalg.norm(c_[-1] - r[0]) else c_[::-1] for c_ in (a_, b_))
        u = np.linspace(0, 1, 121)

        def pela_fracao(c_):
            sc_ = gm.comprimentos(c_)
            return np.column_stack([np.interp(u * sc_[-1], sc_, c_[:, k]) for k in (0, 1)])
        meio = (pela_fracao(a_) + pela_fracao(b_)) / 2
        q_leste, q_oeste = meio[0], meio[-1]
        # O rumo da orla junto da esquina: os primeiros 40 m do meio.
        d40 = meio[min(len(meio) - 1, int(40 / (gm.comprimentos(meio)[-1] / (len(meio) - 1))))] - meio[0]
        do = d40 / np.linalg.norm(d40)
        A = np.array([dm, -do]).T
        tt = np.linalg.solve(A, q_leste - r[-1])
        X = r[-1] + dm * tt[0]
        giro = math.acos(float(np.clip(dm @ do, -1, 1)))
        tang = tr['raio'] * math.tan(giro / 2)
        t1, t2 = X - dm * tang, X + do * tang
        h = 4 / 3 * math.tan(giro / 4) * tr['raio']
        m = max(12, int(giro * tr['raio']))
        q_ = np.linspace(0, 1, m + 1)[:, None]
        arco = (1 - q_) ** 3 * t1 + 3 * (1 - q_) ** 2 * q_ * (t1 + dm * h) + 3 * (1 - q_) * q_ ** 2 * (t2 - do * h) + q_ ** 3 * t2
        ini = X - dm * tr['reta']['antes_m']
        reta = ini + dm * np.arange(0, tr['reta']['antes_m'] - tang, 2.0)[:, None]
        # Do fim do arco segue o meio da avenida, a partir do ponto dele mais perto da tangente.
        j2 = int(np.argmin(np.linalg.norm(meio - t2, axis=1)))
        # Sem os ultimos `corta_fim_m` m: a ponta oeste das duas pistas cai alem do no onde a orla oeste comeca (o
        # caminho voltava em bico para ele).
        sm_ = gm.comprimentos(meio)
        orla = meio[j2 + 1:][sm_[j2 + 1:] < sm_[-1] - tr['orla'].get('corta_fim_m', 0.0)]
        Q = np.vstack([reta, arco, orla])
        wq = np.r_[np.full(len(reta) + len(arco) // 2, tr['reta']['via']), np.full(len(Q) - len(reta) - len(arco) // 2, tr['orla']['via'])]
        seg = np.linalg.norm(np.roll(P0, -1, 0) - P0, axis=1)
        sc = np.r_[0, np.cumsum(seg)[:-1]]
        dentro = (sc >= tr['s'][0]) & (sc <= tr['s'][1])
        i0 = int(np.argmin(np.where(dentro, np.linalg.norm(P0 - ini, axis=1), np.inf)))
        i1 = int(np.argmin(np.where(dentro, np.linalg.norm(P0 - q_oeste, axis=1), np.inf)))
        assert i0 < i1, 'trecho desenhado ao contrario'
        P0 = np.vstack([P0[:i0], Q, P0[i1 + 1:]])
        vias = np.r_[vias[:i0], wq, vias[i1 + 1:]]
        # O no do OSM logo depois do trecho desenhado (a esquina seguinte).
        desenhos.append((Q, tr['largura'], P0[i0 + len(Q)].copy()))
        print(f"trecho desenhado {tr['nome']}: giro {math.degrees(giro):.0f} graus, raio {tr['raio']:.0f} m, "
              f"{i1 - i0 + 1} nos do OSM trocados por {len(Q)}")
    return P0, vias, desenhos


def eixo(c, pasta, epsg):
    para = Transformer.from_crs(4326, epsg, always_xy=True)
    ox, oy = para.transform(c['centro'][1], c['centro'][0])
    origem = np.array([round(ox, -1), round(oy, -1)])
    osm = json.loads((pasta / 'osm.json').read_text(encoding='utf-8'))
    for e_ in osm['elements']:
        if e_['type'] == 'way' and e_['id'] in RUAS_LIBERADAS:
            e_.setdefault('tags', {})['highway'] = 'unclassified'
    ll, vias, niveis, nomes, marcas, nos, G = rota_osm.volta(osm, PERNAS)
    loc = gm.local(epsg, origem)
    P0 = loc(ll)
    vias = np.array(vias)
    # Sem rotatorias (pedido): os nos do anel saem e a volta passa reto pela ilha, de onde entra a onde sai. Fica so a
    # da orla com a Oscar Paschoal, a ponta do canteiro do primeiro quarteirao: a reta contorna a ilha pelo sudoeste
    # (ESQUINAS) e a volta pelo leste.
    anel = set()
    for w, v in G.vias.items():
        if v.get('tags', {}).get('junction') in ('roundabout', 'circular') and w not in ROTATORIA_MANTIDA:
            anel.update(v['nodes'])
    fica = np.array([n not in anel for n in nos])
    print(f'rotatorias tiradas: {int((~fica).sum())} nos do anel')
    P0, vias = P0[fica], vias[fica]
    P0, vias, desenhos = desenhar_trechos(P0, vias, G, origem, para)
    P0, vias = sem_bicos(P0, vias)
    desenhos = [d_[:2] for d_ in desenhos]
    L0 = float(np.linalg.norm(np.diff(np.vstack([P0, P0[:1]]), axis=0), axis=1).sum())
    print(f'volta pelas pernas: {len(P0)} nos, {L0:.0f} m')
    R, orig = gf.arredondar(P0)
    P, _, _ = gf.reamostrar_fechado(R)
    P = gf.suavizar_rumo(P, SIGMA_RUMO)
    P, s, L = gf.reamostrar_fechado(P)
    k = gm.janela_mais_perto(P0, gm.comprimentos(P0), P, s, 60.0, Lp=L)
    via = vias[k]
    # Estacoes dos trechos desenhados: ali o eixo e o desenhado, sem ir ao meio do leito, e a largura e a dada.
    esquina = np.zeros(len(P), bool)
    larg_desenho = np.full(len(P), np.nan)
    for Q, lg in desenhos:
        perto = cKDTree(Q).query(P)[0] < 3.0
        esquina |= perto
        larg_desenho[perto] = lg
    # O eixo no meio do leito da avenida (sem o canteiro), ate 9 m de deslocamento; mediana de 60 m antes da gaussiana
    # (um cruzamento ou uma ilha no meio de um quarteirao nao puxa o eixo).
    T, E = gp.quadro(P)
    propria = np.isin(via, SO_PROPRIA)
    esq, dir_, npistas = corredor(P, E, T, via, G, origem, epsg, propria)
    ok = np.isfinite(esq)
    idx = np.arange(len(P))
    meio = np.where(ok, (esq + dir_) / 2, np.nan)
    meio = np.where(esquina, 0.0, meio)
    ok = ok | esquina
    desl = np.interp(idx, np.r_[idx[ok] - len(P), idx[ok], idx[ok] + len(P)], np.r_[meio[ok], meio[ok], meio[ok]])
    desl = mediana_movel(np.clip(desl, -9, 9), 31)
    desl = gaussian_filter1d(desl, 14 / DS, mode='wrap')
    antigo = P + E * desl[:, None]
    P, s, L = gf.reamostrar_fechado(antigo)
    kk = gm.janela_mais_perto(antigo, gm.comprimentos(antigo), P, s, 20.0, Lp=L)
    via, esq, dir_, npistas, larg_desenho = via[kk], (esq - desl)[kk], (dir_ - desl)[kk], npistas[kk], larg_desenho[kk]
    leito = np.where(np.isfinite(larg_desenho), larg_desenho, esq - dir_)
    print(f'eixo: {L:.0f} m, {len(P)} estacoes; deslocamento ao meio do leito ate {np.abs(desl).max():.1f} m; '
          f'leito mediano {np.nanmedian(leito):.1f} m (max {np.nanmax(leito):.1f})')
    return P, s, L, via, leito, origem, P0, G


def planta(pasta, P, P0, origem, epsg, raio, largura, destino=None):
    """O eixo e as bordas da pista sobre a referencia Esri (conferencia local), colorido pelo raio."""
    from PIL import Image, ImageDraw
    Image.MAX_IMAGE_PIXELS = None
    ref = json.loads((pasta / 'referencia_esri.json').read_text())
    img = Image.open(pasta / 'referencia_esri.jpg').convert('RGB')
    de = Transformer.from_crs(epsg, 4326, always_xy=True)
    z, tx0, ty0 = ref['z'], ref['tx0'], ref['ty0']

    def px(Q):
        lon, lat = de.transform(Q[:, 0] + origem[0], Q[:, 1] + origem[1])
        lon, lat = np.asarray(lon), np.asarray(lat)
        k = 2 ** z
        return np.column_stack([((lon + 180) / 360 * k - tx0) * 256,
                                ((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * k - ty0) * 256])
    T, E = gp.quadro(P)
    A = px(P)
    dr = ImageDraw.Draw(img)
    for lado in (-1, 1):
        B = px(P + E * (lado * largura / 2)[:, None])
        dr.line([tuple(q) for q in B] + [tuple(B[0])], fill=(255, 255, 255), width=1)
    for i in range(len(A)):
        j = (i + 1) % len(A)
        r = raio[i]
        cor = (255, 40, 40) if r < 15 else (255, 160, 0) if r < 30 else (255, 255, 0) if r < 80 else (0, 255, 120)
        dr.line([tuple(A[i]), tuple(A[j])], fill=cor, width=2)
    x0, y0 = A.min(0) - 80
    x1, y1 = A.max(0) + 80
    destino = destino or pasta / 'planta_pampulha.jpg'
    img.crop((int(x0), int(y0), int(x1), int(y1))).save(destino, quality=88)
    print('planta:', destino)


def main():
    c = CIRCUITOS[NOME]
    pasta = pasta_fontes(NOME)
    epsg = c['epsg']
    P, s, L, via, leito, ORIGEM, P0, G = eixo(c, pasta, epsg)
    n = len(P)
    T, E = gp.quadro(P)
    kappa = gp.curvatura(P)
    raio = 1 / np.maximum(np.abs(kappa), 1e-6)
    larg_osm = np.array([faixas(G.vias[w].get('tags', {})) * FAIXA_M + 2 * SARJETA_M if w in G.vias else 10.0 for w in via])
    medida = np.where(np.isfinite(leito), leito, larg_osm)
    medida = np.array([np.median(np.take(medida, np.arange(i - 10, i + 11), mode='wrap')) for i in range(n)])
    largura = gaussian_filter1d(np.clip(medida, LARG_MIN, LARG_MAX), 10 / DS, mode='wrap')
    passo_max = LARGURA_RAMPA * DS
    for _ in range(2):
        for i in range(n):
            largura[i] = min(largura[i], largura[i - 1] + passo_max)
        for i in range(n - 1, -1, -1):
            largura[i] = min(largura[i], largura[(i + 1) % n] + passo_max)
    print(f'largura {largura.min():.1f} a {largura.max():.1f} m (mediana {np.median(largura):.1f})')
    # --- A linha de chegada: LINHA da reta principal (a pista oeste da Oscar Paschoal), a partir da Carlos Luz.
    reta = gf.corrida(np.isin(via, RETA_OESTE))
    i0 = int(reta[int(LINHA * (len(reta) - 1))])
    P, via, largura, leito = np.roll(P, -i0, 0), np.roll(via, -i0), np.roll(largura, -i0), np.roll(leito, -i0)
    s = np.arange(n) * (L / n)
    T, E = gp.quadro(P)
    kappa = gp.curvatura(P)
    raio = 1 / np.maximum(np.abs(kappa), 1e-6)
    if '--planta' in sys.argv:
        planta(pasta, P, P0, ORIGEM, epsg, raio, largura)
    np.savez(pasta / 'eixo_pampulha.npz', P=P, via=via, larg=largura, origem=ORIGEM, P0=P0)
    rel = Relevo(pasta, epsg, ORIGEM)
    lago = lagoa(pasta, ORIGEM)
    pontes, tab = pontes_da_volta(pasta, ORIGEM, P, largura, s, L)
    z, z_dem = perfil(P, E, s, L, tab, rel)
    seg = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
    grade = (np.roll(z, -1) - np.roll(z, 1)) / (seg + np.roll(seg, 1))
    print(f'perfil {z.min() + BASE:.1f} a {z.max() + BASE:.1f} m, rampa {100 * grade.min():.1f}% a {100 * grade.max():.1f}%; '
          f'pontes {pontes}')
    if '--perfil' in sys.argv:
        for i in range(0, n, 50):
            print(f'  s={s[i]:6.0f} z={z[i] + BASE:6.1f} chao={z_dem[i] + BASE:7.1f} larg={largura[i]:5.1f} raio={min(raio[i], 999):5.0f} via={via[i]}')
    if '--so-perfil' in sys.argv:
        return

    # --- Curvas, caimento e zebras (como Floripa).
    cv = gp.curvas(kappa, s, L)
    intens = np.clip((300 - raio) / 250, 0, 1)
    bank = gaussian_filter1d(-np.sign(kappa) * (.01 + .015 * intens), 10 / DS, mode='wrap')
    zebra_d, zebra_e = np.zeros(n), np.zeros(n)
    for cc in cv:
        if cc['raio_min'] > 120:
            continue
        idx = np.arange(cc['ini'], cc['fim'] + 1) if cc['fim'] >= cc['ini'] else np.r_[cc['ini']:n, 0:cc['fim'] + 1]
        pico = abs(kappa[cc['apice']])
        dentro = [i for i in idx if abs(kappa[i]) > .7 * pico]
        a = int(np.where(idx == cc['apice'])[0][0])
        saida = list(idx[a:]) + [(idx[-1] + q) % n for q in range(1, 6)]
        (zebra_e if cc['lado'] > 0 else zebra_d)[dentro] = 1
        (zebra_d if cc['lado'] > 0 else zebra_e)[[i for i in saida if abs(kappa[i]) < .8 * pico]] = 1
    print(f'{len(cv)} curvas ({sum(1 for cc in cv if cc["raio_min"] < 30)} de menos de 30 m de raio)')
    kd = cKDTree(P)

    def superficie(q):
        k = kd.query(q)[1]
        dd = q - P[k]
        lat = np.sum(dd * E[k], axis=1)
        along = np.sum(dd * T[k], axis=1)
        return k, (s[k] + along) % L, lat, z[k] + grade[k] * along + bank[k] * lat

    # --- Boxes: na reta da margem norte (a mais longa da orla), a esquerda, do lado da cidade; a lagoa fica a direita. Na
    # rodada 1 ficavam na pista leste da Oscar Paschoal e tapavam o Mineirao da largada (pedido da equipe).
    reta = gf.corrida(np.isin(via, RETA_OESTE))
    reta_s = (float(s[reta[0]]), float(s[reta[-1]]))
    pit_reta = tuple(s_perto(P, s, ORIGEM, epsg, ll_) for ll_ in PIT_RETA)
    pit = pit_esquerda(dict(PIT), pit_reta, P, z, E, T, bank, largura, s, L, superficie)

    # --- Muros de concreto com alambrado dos dois lados; a direita abrem para o pit.
    folga = {}
    for lado in (-1, 1):
        fora_da_curva = (np.sign(kappa) == -lado)
        extra = 2.4 * np.clip((45 - raio) / 30, 0, 1) * fora_da_curva
        folga[lado] = gaussian_filter1d(gf.maximum_filter1d_wrap(.6 + extra, 9), 6 / DS, mode='wrap')
    a_pit, b_pit = (pit['entry_main_s'] - 25) % L, (pit['exit_main_s'] + 25) % L
    tem_e = ~((s >= a_pit) & (s <= b_pit)) if a_pit < b_pit else ~((s >= a_pit) | (s <= b_pit))
    rails = {'-1': [[0.0, L]], '1': gf.trechos_de(tem_e, s, L)}
    # --- O Mineirao aberto ao carro (pedido da equipe): um vao no muro direito da reta da largada leva a esplanada (o
    # miolo cercado pela volta) e um tunel sob as arquibancadas ao gramado (physics.js meta.roam, como o passeio de Floripa).
    roam, vao, miolo = passeio_mineirao(P, s, L, E, largura, via, ORIGEM)
    tem_d = ~((s >= vao[0]) & (s <= vao[1])) if vao[0] < vao[1] else ~((s >= vao[0]) | (s <= vao[1]))
    rails['-1'] = gf.trechos_de(tem_d, s, L)

    # --- Terreno: o LiDAR (2 m) na grade de 5 m, colado ao plano da pista junto dela; a lagoa com um fundo desenhado.
    todos = np.vstack([P, np.array(pit['xy'])])
    x0 = math.floor((todos[:, 0].min() - MARGEM) / PASSO) * PASSO
    x1 = todos[:, 0].max() + MARGEM
    y0 = math.floor((todos[:, 1].min() - MARGEM) / PASSO) * PASSO
    y1 = todos[:, 1].max() + MARGEM
    nx, ny = int((x1 - x0) / PASSO) + 1, int((y1 - y0) / PASSO) + 1
    gx, gy = x0 + np.arange(nx) * PASSO, y0 + np.arange(ny) * PASSO
    XX, YY = np.meshgrid(gx, gy)
    q = np.column_stack([XX.ravel(), YY.ravel()])
    zt = rel.terreno(q[:, 0], q[:, 1])
    marcos_ = marcos(pasta, ORIGEM, rel)
    mineirao = next(m_ for m_ in marcos_ if m_['kind'] == 'mineirao')
    zt, mineirao['ground'] = esplanada(q, zt, (ny, nx), miolo, P, z)
    mineirao['stadium'] = {'centre': list(ESTADIO['centro']), 'heading': round(ESTADIO['rumo'], 5), 'roof_semi': list(ESTADIO['semi']),
                           'facade_semi': list(TUNEL['fachada_semi']), 'floor_semi': list(TUNEL['campo_semi']),
                           'tunnel': {'heading': round(math.radians(TUNEL['rumo_graus']), 5), 'width': TUNEL['largura'],
                                      'height': TUNEL['altura']}}
    k, _, lat, road = superficie(q)
    fora = np.abs(lat) - largura[k] / 2
    agua, zt = fundo_da_lagoa(lago, q, zt, (ny, nx), fora)
    sob_tabuleiro = tab[k] & (road - zt > 3.0)
    peso = np.clip((24 - fora) / 16, 0, 1) * ~sob_tabuleiro * ~agua
    zt = zt * (1 - peso) + (road - .06) * peso
    zt = np.where(sob_tabuleiro & (fora < 12), np.minimum(zt, road - 2.5), zt)
    pit_xy = np.array(pit['xy'])
    dp, ip = cKDTree(pit_xy).query(q)
    pl = np.array(pit['lx_ly'])
    plat = np.sum((q - pit_xy[ip]) * pl[ip], axis=1)
    pout = np.maximum(np.maximum(pit['lo_arr'][ip] - plat, plat - pit['hi_arr'][ip]), 0)
    pt_ = np.gradient(pit_xy, axis=0)
    pt_ /= np.linalg.norm(pt_, axis=1)[:, None]
    adiante = np.sum((q - pit_xy[ip]) * pt_[ip], axis=1)
    ponta = ((ip == 0) & (adiante < -1)) | ((ip == len(pit_xy) - 1) & (adiante > 1))
    # (Nunca sobre a lagoa: os boxes da orla norte ficam a ~25 m da agua do outro lado da pista.)
    ppeso = np.clip((26 - pout) / 16, 0, 1) * (dp < 60) * ~ponta * ~agua
    pz = np.array(pit['z_lane'])
    usa = (ppeso > 0) & ((pout < fora) | (ppeso > peso))
    zt = np.where(usa, zt * (1 - ppeso) + (pz[ip] - .06) * ppeso, zt)
    terrain = {'x0': float(x0), 'y0': float(y0), 'step': PASSO, 'nx': nx, 'ny': ny, 'z': np.round(zt, 2).tolist()}
    print(f'terreno {nx}x{ny} ({nx * ny} vertices), {agua.mean():.0%} de lagoa')

    # --- Cenario: cobertura (a lagoa e agua), edificacoes do cadastro, marcos, horizonte.
    gp.PASSO = PASSO
    arquibancadas = [{'antes_da_chegada': round(a_['antes'], 1), 'blocos': a_['blocos'], 'lado': a_['lado'], 'recuo': a_['recuo']}
                     for a_ in ARQUIBANCADAS]
    scenery = gp.cenario(NOME, pasta, epsg, np.r_[ORIGEM, 0.0], 1.0, gx, gy, P, largura, pit, s, L, T, E, {'arquibancadas': arquibancadas})
    classes = np.array(list(scenery['cover']['classes'])).reshape(ny, nx)
    classes[agua.reshape(ny, nx)] = '6'
    classes[(~agua.reshape(ny, nx)) & (classes == '6')] = '0'
    clareiras(classes, q, marcos_, miolo)
    scenery['cover']['classes'] = ''.join(classes.ravel())
    scenery['landmarks'] = marcos_
    scenery['buildings'], scenery['skyline'] = edificios(pasta, ORIGEM, P, largura, folga, pit, gx, gy, agua.reshape(ny, nx), rel,
                                                         s, E, scenery['landmarks'])
    solo_orto(pasta, ORIGEM, gx, gy)
    if '--sem-aneis' not in sys.argv:
        scenery['far'] = aneis_pampulha(pasta, epsg, ORIGEM, '--longe' in sys.argv)

    frenagens = []
    for cc in cv:
        if cc['raio_min'] < 160:
            a = s[cc['ini']]
            frenagens.append([round(float((a - 120) % L), 1), round(float((a + 25) % L), 1)])
    colunas = ['s_xy_m', 'x_east_m', 'y_north_m', 'z_local_m', 'width_m', 'crossfall_left', 'grade', 'tx', 'ty',
               'left_x', 'left_y', 'fit_rmse_m', 'ground_points', 'kerb_right', 'kerb_left', 'wall_right_m', 'wall_left_m']
    rmse = np.where(tab, 0.0, np.abs(z_dem - z))
    samples = np.column_stack([s, P, z, largura, bank, grade, T, E, rmse, np.zeros(n), zebra_d, zebra_e, folga[-1], folga[1]])
    scenery['fauna'] = pontos_fauna(pasta, ORIGEM, samples, terrain, scenery['cover']['classes'])
    comp_3d = float(np.sqrt(np.sum((np.roll(P, -1, 0) - P) ** 2, axis=1) + (np.roll(z, -1) - z) ** 2).sum())
    fontes = json.loads((pasta / 'proveniencia.json').read_text(encoding='utf-8'))
    decks = [[round(float(a_), 1), round(float(b_), 1)] for a_, b_ in pontes]
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
        'origin_utm': [float(ORIGEM[0]), float(ORIGEM[1]), BASE], 'epsg': epsg, 'altitude_base_m': BASE,
        'sections': sorted(trechos_nomeados(P, s, via, G, ORIGEM, epsg) + [[round(reta_s[0], 1), 'Av. Coronel Oscar Paschoal · Mineirão'],
                                                                          [round(pit_reta[0], 1), 'Orla · reta dos boxes']]),
        'rails': rails, 'brake_zones': frenagens,
        'barrier': 'street', 'kerb_colors': ['#c8201e', '#f1efe8'], 'surface_zones': [], 'roam': roam,
        'city_angle': gp.angulo_cidade(c, np.r_[ORIGEM, 0.0], epsg),
        'imaginary': True, 'street': True,
        # A lagoa: o plano da agua no nivel dela, so sobre a mascara de agua (classe '6' da cobertura): abaixo da
        # barragem o vale fica mais baixo que a agua e seco.
        'sea_level_m': round(NIVEL_LAGOA - BASE, 2), 'lake': True,
        # Corridas de uma volta so (pedido): a volta tem mais de 20 km.
        'laps': 1,
        **({'decks': decks} if decks else {}),
        'sources': fontes,
        'centreline': 'Vias do OpenStreetMap pelas pernas (gerar_pampulha.py), sem rotatórias, no meio das avenidas sem canteiro.',
        'caveat': ('Circuito de rua imaginário: as ruas, o relevo (LiDAR 2015 da Prefeitura), a lagoa e as edificações '
                   '(BHGeo / PRODABEL) são os reais de Belo Horizonte; larguras de corrida, a primeira curva, os muros e os '
                   'boxes na reta da orla norte são desenho de jogo.'),
    }
    pit = {k_: v for k_, v in pit.items() if k_ not in ('xy', 'z_lane', 'lx_ly', 'lo_arr', 'hi_arr')}
    saida = {'meta': meta, 'columns': colunas, 'samples': np.round(samples, 5).tolist(), 'pit': pit,
             'terrain': terrain, 'scenery': scenery}
    # Gravado ao lado e trocado no fim (o jogo pode estar lendo o arquivo durante os ~8 min da geracao).
    final = gp.DADOS / f'pista_{NOME}.json'
    destino = final.with_name(final.name + '.tmp')
    destino.write_text(json.dumps(saida, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    import subprocess
    from config import RAIZ
    node = next((q_ / 'apps' / 'node-v22.23.2-win-x64' / 'node.exe' for q_ in RAIZ.parents if (q_ / 'apps' / 'node-v22.23.2-win-x64' / 'node.exe').exists()), 'node')
    subprocess.run([str(node), str(Path(__file__).with_name('podar_edificios.mjs')), str(destino)], check=True)
    import os
    os.replace(destino, final)
    print(f'{final.name}: {final.stat().st_size / 1e6:.2f} MB')
    resumo = {k_: meta[k_] for k_ in ('reconstructed_xy_m', 'reconstructed_3d_m', 'elevation_min_m', 'elevation_max_m',
                                      'elevation_range_m', 'grade_min_pct', 'grade_max_pct', 'width_min_m', 'width_max_m',
                                      'kerb_m', 'pit_lane_m')}
    print(json.dumps(resumo, indent=1, ensure_ascii=False))


BASE = 800.0
# A lagoa do BHGeo chega a 1 m do asfalto em alguns trechos da orla: ali fica um acostamento colado na pista, de pelo
# menos uma celula da grade (5 m) alem do metro depois da borda, onde o jogo confere que o chao encontra a pista.
AGUA_LONGE_M = 8.5
# Nivel da agua: os pontos do LiDAR de 2015 sobre a lagoa leem 800,76 a 800,85 m (o vertedouro foi alteado a 801,3 m).
NIVEL_LAGOA = 800.8
MARGEM = 300.0
RAMPA_MAX = .12
# Fracao da reta principal (a partir da Carlos Luz) onde fica a linha de chegada: o grid atras dela, na reta.
LINHA = .28
# Arquibancadas de circuito de rua, do lado oeste da reta (o gramado em frente ao Mineirao): `antes` m antes da linha.
ARQUIBANCADAS = [{'antes': 70.0, 'blocos': 5, 'lado': 1, 'recuo': 7.0}]
# Faixa dos boxes na reta da margem norte (entre o Braco das Garcas e o Iate): de PIT_RETA[0] a PIT_RETA[1] (lat, lon,
# ~700 m), comecando `inicio` dela e terminando `antes_do_fim` m antes; entrada e saida (m), largura.
PIT_RETA = [(-19.8432, -43.9915), (-19.8470, -43.9862)]
PIT = {'inicio': .02, 'antes_do_fim': 20, 'entrada': 60, 'saida': 60, 'largura': 8.0, 'garagens': None,
       'fonte': 'Faixa de boxes de jogo na reta da orla norte, do lado da cidade, com a lagoa em frente (a reta da largada, '
                'na Av. Coronel Oscar Paschoal, fica aberta para o Mineirão).'}
# O estadio medido na ortofoto de 20 cm (pampulha-estadios.js): centro, semi-eixos da borda da cobertura e rumo do eixo
# maior. A esplanada em volta vira uma praca que desce suave ate as ruas, com o estadio num patamar.
ESTADIO = {'centro': (877.5, -1612.5), 'semi': (138.0, 108.5), 'rumo': math.radians(79.0), 'folga_m': 14.0}
# O estadio para o carro: a fachada no chao (elipse dentro da borda da cobertura), o piso do campo e o tunel (largura e
# altura livres, rumo do eixo a partir do centro, o semi-eixo menor para oeste, de frente para a reta); `vao_m`: a abertura
# no muro direito da reta, onde o eixo do tunel encontra a pista. O gramado oficial (105 x 68 m) e grama (menos aderencia).
TUNEL = {'fachada_semi': (130.0, 100.0), 'campo_semi': (83.0, 53.5), 'rumo_graus': 169.0, 'largura': 10.0, 'altura': 5.2,
         'vao_m': 16.0, 'gramado': (105.0, 68.0)}
# Clareira em volta do Mineirinho (a mata do parque o escondia da volta).
CLAREIRA_MINEIRINHO_M = 45.0


def elipse(c, semi, rumo, n=180):
    th = np.linspace(0, 2 * math.pi, n, endpoint=False)
    u, v = semi[0] * np.cos(th), semi[1] * np.sin(th)
    return np.column_stack([c[0] + u * math.cos(rumo) - v * math.sin(rumo), c[1] + u * math.sin(rumo) + v * math.cos(rumo)])


def passeio_mineirao(P, s, L, E, largura, via, origem):
    """meta.roam com uma zona, a do Mineirao. O contorno: 1 m para dentro da borda direita do asfalto em volta do miolo
    (Abrahao Caram, Rei Pele, Carlos Luz e a reta, como em Floripa: ali o carro esta no corredor da volta e o contorno nao
    conta), fechado na esquina da Abrahao Caram com a Oscar Paschoal por um corte atravessando a pista leste (fences: um
    bloqueio desenhado pelo modelo do estadio). Dentro, o estadio e um bloco (a fachada menos o campo, aberto pelo tunel).
    O vao no muro direito da reta onde o eixo do tunel a encontra. Devolve (roam, (s0, s1) do vao, o contorno)."""
    from shapely.geometry import Polygon, LineString, box
    from shapely import affinity
    import base64
    n = len(P)
    abr = np.flatnonzero(via == 342969879)
    reta = gf.corrida(np.isin(via, RETA_OESTE))
    i_a = int((abr[0] + 8) % n)           # 16 m depois da esquina, ja na Abrahao Caram
    i_b = int(reta[-1] - 8)               # 16 m antes do cruzamento, ainda na reta
    idx = np.arange(i_a, i_b + n + 1) % n if i_b < i_a else np.arange(i_a, i_b + 1)
    borda = P[idx] - E[idx] * (largura[idx] / 2 - 1.0)[:, None]
    contorno = Polygon(borda).buffer(0)
    if contorno.geom_type == 'MultiPolygon':
        contorno = max(contorno.geoms, key=lambda g_: g_.area)
    c = np.array(ESTADIO['centro'])
    r = ESTADIO['rumo']
    fachada = Polygon(elipse(c, TUNEL['fachada_semi'], r))
    campo = Polygon(elipse(c, TUNEL['campo_semi'], r))
    ang = math.radians(TUNEL['rumo_graus'])
    d = np.array([math.cos(ang), math.sin(ang)])
    corredor = LineString([c, c + d * (TUNEL['fachada_semi'][0] + 20)]).buffer(TUNEL['largura'] / 2, cap_style=2)
    bloco = fachada.difference(campo).difference(corredor).buffer(0)
    assert bloco.geom_type == 'Polygon' and len(bloco.interiors) == 0, 'o estadio com o tunel devia ser um C'
    assert contorno.contains(fachada), 'o estadio passa do contorno do passeio'
    # O vao: a estacao da reta mais perto do eixo do tunel prolongado.
    eixo = LineString([c, c + d * 400])
    k = reta[np.argmin([eixo.distance(LineString([P[i], P[(i + 1) % n]])) for i in reta])]
    vao = ((s[k] - TUNEL['vao_m'] / 2) % L, (s[k] + TUNEL['vao_m'] / 2) % L)
    anel = lambda g_, ccw: np.round(np.array(g_.exterior.coords[:-1]) if (g_.exterior.is_ccw == ccw) else np.array(g_.exterior.coords[:-1])[::-1], 2)
    fora = anel(contorno, True)
    dentro = anel(bloco, False)
    # Grama: o gramado oficial no meio do campo (bits por celula de 2 m na caixa do contorno).
    gl, gw = TUNEL['gramado']
    gramado = affinity.rotate(box(-gl / 2, -gw / 2, gl / 2, gw / 2), r, origin=(0, 0), use_radians=True)
    gramado = affinity.translate(gramado, c[0], c[1])
    x0, y0, x1, y1 = contorno.bounds
    passo = 2.0
    nx_, ny_ = int(math.ceil((x1 - x0) / passo)), int(math.ceil((y1 - y0) / passo))
    import shapely
    XX, YY = np.meshgrid(x0 + (np.arange(nx_) + .5) * passo, y0 + (np.arange(ny_) + .5) * passo)
    bits = shapely.contains_xy(gramado, XX.ravel(), YY.ravel())
    corte = [round(float(v_), 2) for v_ in np.r_[borda[-1], borda[0]]]
    zona = {'name': 'mineirao', 'label': 'Mineirão', 'gaps': [{'side': -1, 's0': round(float(vao[0]), 1), 's1': round(float(vao[1]), 1)}],
            'ring': [fora.ravel().tolist(), dentro.ravel().tolist()], 'fences': [corte], 'walls': [],
            'grass': {'x0': round(float(x0), 2), 'y0': round(float(y0), 2), 'step': passo, 'nx': nx_, 'ny': ny_,
                      'bits': base64.b64encode(np.packbits(bits).tobytes()).decode()}}
    print(f'passeio do Mineirao: miolo de {contorno.area / 1e4:.1f} ha, estadio {bloco.area / 1e4:.1f} ha com tunel de '
          f'{TUNEL["largura"]:.0f} m; vao no muro direito da reta em s={vao[0]:.0f}-{vao[1]:.0f}; corte de '
          f'{np.linalg.norm(borda[-1] - borda[0]):.0f} m na esquina da Abrahao Caram')
    return {'zones': [zona]}, vao, contorno


def s_perto(P, s, origem, epsg, ll):
    x, y = Transformer.from_crs(4326, epsg, always_xy=True).transform(ll[1], ll[0])
    return float(s[int(np.argmin(np.hypot(P[:, 0] - (x - origem[0]), P[:, 1] - (y - origem[1]))))])


def esplanada(q, zt, forma, miolo, P, z):
    """A esplanada do Mineirao sem os barrancos: em todo o miolo cercado pela volta (o contorno do passeio, da borda do
    asfalto da reta, da Abrahao Caram, da Rei Pele e da Carlos Luz; o laser tinha o estadio e montes em volta dele como
    chao), o chao vira uma superficie harmonica que encosta nas ruas em volta (a 15 cm acima do perfil da volta mais
    perto) e num patamar plano sob o estadio (a elipse da cobertura mais `folga_m`), na altura mediana das ruas. Devolve o
    chao e a altura do patamar (o `ground` do marco)."""
    import shapely
    poly = miolo
    pts = shapely.points(q[:, 0], q[:, 1])
    dentro = shapely.contains_xy(poly, q[:, 0], q[:, 1])
    borda = dentro & (shapely.distance(poly.exterior, pts) < 6.0)
    zb = z[cKDTree(P).query(q[borda])[1]] + .15
    cx, cy = ESTADIO['centro']
    a, b = ESTADIO['semi']
    r = ESTADIO['rumo']
    dx, dy = q[:, 0] - cx, q[:, 1] - cy
    u, v = dx * math.cos(r) + dy * math.sin(r), -dx * math.sin(r) + dy * math.cos(r)
    f = ESTADIO['folga_m']
    patamar = dentro & ((u / (a + f)) ** 2 + (v / (b + f)) ** 2 <= 1)
    base = float(np.median(zb))
    Z = zt.reshape(forma).copy()
    D, B, PD = dentro.reshape(forma), borda.reshape(forma), patamar.reshape(forma)
    livre = D & ~B & ~PD
    Z[B] = zb
    Z[PD] = base
    Z[livre] = base
    js, is_ = np.nonzero(D)
    j0, j1, i0, i1 = js.min() - 1, js.max() + 2, is_.min() - 1, is_.max() + 2
    sub, lv = Z[j0:j1, i0:i1], livre[j0:j1, i0:i1]
    for _ in range(3000):
        m = (np.roll(sub, 1, 0) + np.roll(sub, -1, 0) + np.roll(sub, 1, 1) + np.roll(sub, -1, 1)) / 4
        sub[lv] = m[lv]
    Z[j0:j1, i0:i1] = sub
    antes = zt.reshape(forma)[D]
    print(f'esplanada do Mineirao: patamar a {base + BASE:.1f} m (era {np.median(antes) + BASE:.1f}); chao baixou ate '
          f'{np.max(antes - Z[D]):.1f} m, subiu ate {np.max(Z[D] - antes):.1f} m')
    return Z.ravel(), round(base, 2)


def clareiras(classes, q, marcos_, miolo):
    """Sem mata no miolo do Mineirao (piso de concreto; as ruas ficam) nem a CLAREIRA_MINEIRINHO_M m do Mineirinho
    (grama)."""
    import shapely
    from shapely.geometry import Polygon
    C = classes.ravel()
    for m_ in marcos_:
        if m_['kind'] == 'mineirao':
            sel = shapely.contains_xy(miolo, q[:, 0], q[:, 1])
            C[sel & np.isin(C, list('0123'))] = '4'
        if m_['kind'] == 'mineirinho':
            sel = shapely.contains_xy(Polygon(m_['outline']).buffer(CLAREIRA_MINEIRINHO_M), q[:, 0], q[:, 1])
            print(f'clareira do Mineirinho: {int((sel & np.isin(C, ["1", "2"])).sum())} celulas de mata viram grama')
            C[sel & np.isin(C, ['1', '2'])] = '0'
    classes[:] = C.reshape(classes.shape)


def pit_esquerda(cfg, reta, P, z, E, T, bank, largura, s, L, superficie):
    """Faixa de servico a esquerda da reta (como pit_sintetico de gerar_pista, com o centro e a normal interpolados em
    s: o passo das estacoes nao e exatamente 2 m e a busca por indice repetia pontos)."""
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
    print(f'reta dos boxes: s de {r0:.0f} a {r1:.0f} m ({r1 - r0:.0f} m); faixa de {a:.0f} a {b:.0f}')
    assert tot > fe + fs + 60, 'reta curta demais para a faixa dos boxes'
    blend = np.where(t_ < fe, 0.5 - 0.5 * np.cos(np.pi * np.clip(t_ / fe, 0, 1)),
                     np.where(t_ > tot - fs, 0.5 + 0.5 * np.cos(np.pi * np.clip((t_ - (tot - fs)) / fs, 0, 1)), 1.0))
    borda = larg / 2 - cfg['largura'] / 2 + .3
    off = borda + (off_final - borda) * blend
    pxy = centro + nrm * off[:, None]
    pw = np.full(len(us), cfg['largura'])
    ps = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pxy, axis=0), axis=1))]
    k, _, lat, z_main = superficie(pxy)
    pbank = bank[k]
    main_s = sm.copy()
    gap = np.maximum(0, np.abs(lat) - pw / 2 - largura[k] / 2)
    lo, hi = -pw / 2, pw / 2
    par = np.flatnonzero(blend > .999)
    g0, g1 = ps[par[0]] + 12, ps[par[-1]] - 12
    abertura = float(ps[np.argmax(gap > .3)])
    muro_idx = np.flatnonzero(gap > 1.3)
    muro_trechos = [(ps[muro_idx[0]], ps[muro_idx[-1]])] if len(muro_idx) else []
    print(f'pit {ps[-1]:.0f} m: entra em s={main_s[0]:.0f}, volta em s={main_s[-1]:.0f}; garagens {g0:.0f}-{g1:.0f} m da entrada')
    return gp.completar_pit(pxy, lo, hi, z_main, pbank, main_s, gap, (g0, g1), superficie, cfg['fonte'], abertura,
                            muro_trechos[0][0] if muro_trechos else abertura, muro_trechos[0][1] if muro_trechos else ps[-1] - 40,
                            L, muro_trechos)


class Relevo:
    """O chao: o MDT de 2 m do LiDAR 2015 da Prefeitura (BHGeo; o vazio sob predios e agua preenchido em
    baixar_fontes.py) na caixa baixada, o ANADEM (30 m) fora dela, com 60 m de emenda. Coordenadas locais; z em relacao a
    BASE."""

    def __init__(self, pasta, epsg, origem):
        self.o = np.asarray(origem, float)
        self.an = gp.Raster(pasta / 'anadem.tif', epsg)
        self.mdt = gm.Grade(pasta / 'mdt_bhgeo_2m.npz')

    def terreno(self, x, y, ordem=1):
        X, Y = np.asarray(x, float) + self.o[0], np.asarray(y, float) + self.o[1]
        w = self.mdt.dentro(X, Y)
        z = self.an(X, Y, ordem=1)
        if np.any(w > 0):
            z = np.where(w > 0, self.mdt(X, Y) * w + z * (1 - w), z)
        return z - BASE


def lagoa(pasta, origem):
    """A lagoa (BHGeo LAGOA_PAMPULHA: o espelho d'agua), em coordenadas locais."""
    from shapely.geometry import shape
    from shapely.ops import unary_union
    from shapely import affinity
    partes = [shape(f['geometry']) for f in json.loads((pasta / 'bhgeo_lagoa.geojson').read_text(encoding='utf-8'))['features']]
    lago = affinity.translate(unary_union(partes).buffer(0), -origem[0], -origem[1])
    # So o espelho principal: os outros poligonos da camada sao pocos e lagoinhas longe da orla (zoologico, parques).
    if lago.geom_type == 'MultiPolygon':
        lago = max(lago.geoms, key=lambda g_: g_.area)
    print(f'lagoa: {lago.area / 1e6:.2f} km2 (o maior de {len(partes)} poligonos do BHGeo)')
    return lago


def fundo_da_lagoa(lago, q, zt, forma, fora):
    """Agua onde a grade cai na lagoa; o fundo desce com a distancia da margem (1 m junto dela, ~5 m a 70 m, 14 m no
    maximo: profundidade media de ~5 m e maxima de 15-16 m publicadas, sem batimetria aberta), suavizado. A terra junto da
    agua fica pelo menos 15 cm acima dela."""
    import shapely
    from compat_scipy import gaussian_filter
    agua = shapely.contains_xy(lago, q[:, 0], q[:, 1]) & (fora > AGUA_LONGE_M)
    nivel = NIVEL_LAGOA - BASE
    W = agua.reshape(forma)
    beira = W & ~(np.roll(W, 1, 0) & np.roll(W, -1, 0) & np.roll(W, 1, 1) & np.roll(W, -1, 1))
    d = np.zeros(len(q))
    d[agua] = cKDTree(q[beira.ravel()]).query(q[agua])[0]
    prof = gaussian_filter(np.where(agua, np.minimum(1.0 + .058 * d, 14.0), 0.0).reshape(forma), 2).ravel()
    zt = np.where(agua, nivel - np.maximum(prof, .8), zt)
    terra_d = cKDTree(q[beira.ravel()]).query(q)[0]
    zt = np.where(~agua & (terra_d < 15), np.maximum(zt, nivel + .15), zt)
    print(f'lagoa: {agua.mean():.1%} da grade, fundo ate {prof[agua].max():.1f} m (medio {prof[agua].mean():.1f} m)')
    return agua, zt


def pontes_da_volta(pasta, origem, P, largura, s, L):
    """Trechos da volta sobre pontes e viadutos do cadastro do BHGeo (LOGRADOURO_OBRA_DE_ARTE, tipo PONTE ou VIADUTO): o
    eixo a menos de meia largura + 1 m da obra. Ali o perfil corre reto entre as cabeceiras; as de mais de 6 m vao para
    meta.decks (o terreno nao cola nelas)."""
    from shapely.geometry import shape
    from shapely import STRtree, affinity
    import shapely
    obras = [affinity.translate(shape(f['geometry']), -origem[0], -origem[1])
             for f in json.loads((pasta / 'bhgeo_obras_de_arte.geojson').read_text(encoding='utf-8'))['features']
             if f['properties'].get('TIPO_OBRA_DE_ARTE') in ('PONTE', 'VIADUTO')]
    arv = STRtree(obras)
    dist = np.full(len(P), np.inf)
    idx, dd = arv.query_nearest(shapely.points(P[:, 0], P[:, 1]), return_distance=True, all_matches=False)
    dist[idx[0]] = dd
    tab = dist < largura / 2 + 1.0
    pontes = gf.trechos_de(tab, s, L, minimo=6.0)
    print(f'pontes e viadutos sob a volta: {[(round(a_), round(b_ - a_)) for a_, b_ in pontes]}')
    return pontes, tab


def perfil(P, E, s, L, tab, rel):
    """O chao de 2 m sob a secao da pista (mediana de 5 pontos), suavizado; nas pontes, reto entre as cabeceiras; rampa
    maxima de RAMPA_MAX por corte e aterro."""
    n = len(P)
    zt = gf.ao_longo(rel.terreno, P, E)
    z = zt.copy()
    idx = np.arange(n)
    if tab.any():
        z[tab] = np.interp(idx[tab], np.r_[idx[~tab] - n, idx[~tab], idx[~tab] + n], np.r_[z[~tab], z[~tab], z[~tab]])
    z = gaussian_filter1d(z, 6 / DS, mode='wrap')
    limite = RAMPA_MAX * DS
    corte, aterro = z.copy(), z.copy()
    for _ in range(2):
        for i in list(range(n)) + list(range(n - 1, -1, -1)):
            for j in (i - 1, (i + 1) % n):
                corte[i] = min(corte[i], corte[j] + limite)
                aterro[i] = max(aterro[i], aterro[j] - limite)
    z = gaussian_filter1d((corte + aterro) / 2, 3 / DS, mode='wrap')
    return z, zt


# Os trechos da volta pelos lugares (o painel mostra onde o carro esta): o nome entra no ponto da volta mais perto.
TRECHOS_NOMES = [
    ((-19.8665, -43.9729), 'Av. Coronel Oscar Paschoal'),
    ((-19.8628, -43.9762), 'Orla · Igrejinha da Pampulha'),
    ((-19.8560, -43.9850), 'Orla · Praça de Iemanjá'),
    ((-19.8575, -43.9930), 'Orla · Parque Ecológico'),
    ((-19.8611, -43.9976), 'Orla · Zoológico'),
    ((-19.8510, -44.0057), 'Orla · Braço do Zoológico'),
    ((-19.8454, -43.9993), 'Orla · Mirante do Sabiá'),
    ((-19.8383, -43.9943), 'Orla · Braço das Garças'),
    ((-19.8479, -43.9783), 'Orla · Iate Tênis Clube'),
    ((-19.8436, -43.9690), 'Orla · Mirante Bandeirantes'),
    ((-19.84638, -43.96697), 'Barragem da Pampulha'),
    ((-19.8540, -43.9690), 'Orla · Casa do Baile'),
    ((-19.8634, -43.9739), 'Av. Coronel Oscar Paschoal · descida'),
    ((-19.8630, -43.9715), 'Av. Antônio Abrahão Caram'),
    ((-19.8650, -43.9696), 'Av. Rei Pelé · Mineirão'),
    ((-19.8693, -43.9705), 'Av. Presidente Carlos Luz'),
]


def trechos_nomeados(P, s, via, G, origem, epsg):
    para = Transformer.from_crs(4326, epsg, always_xy=True)
    out = [[0.0, 'Av. Coronel Oscar Paschoal · largada']]
    for (la, lo), nome in TRECHOS_NOMES[1:]:
        x, y = para.transform(lo, la)
        i = int(np.argmin(np.hypot(P[:, 0] - (x - origem[0]), P[:, 1] - (y - origem[1]))))
        out.append([round(float(s[i]), 1), nome])
    return sorted(out)


# Marcos com modelo proprio no jogo (pampulha-*.js), pelas pegadas do cadastro do BHGeo que contem estes pontos.
MARCOS = {
    'mineirao': ((-19.86528, -43.97032), 'Estádio Governador Magalhães Pinto (Mineirão)'),
    'mineirinho': ((-19.86117, -43.97276), 'Ginásio Jornalista Felipe Drummond (Mineirinho)'),
    'igrejinha': ((-19.85860, -43.97860), 'Igreja de São Francisco de Assis (Igrejinha da Pampulha)'),
}


def marcos(pasta, origem, rel):
    """As pegadas do cadastro (EDIFICACAO, com a altura do laser) dos MARCOS: o maior poligono que contem o ponto ou o
    mais perto dele (ate 40 m)."""
    from shapely.geometry import shape, Point
    from shapely import affinity
    para = Transformer.from_crs(4326, 31983, always_xy=True)
    feats = json.loads((pasta / 'bhgeo_edificacoes.geojson').read_text(encoding='utf-8'))['features']
    geoms = [affinity.translate(shape(f['geometry']).buffer(0), -origem[0], -origem[1]) for f in feats]
    out = []
    for chave, ((la, lo), nome) in MARCOS.items():
        x, y = para.transform(lo, la)
        p = Point(x - origem[0], y - origem[1])
        cand = [(g.distance(p), -g.area, i) for i, g in enumerate(geoms) if g.distance(p) < 40]
        if not cand:
            print(f'marco {chave}: sem pegada no cadastro a 40 m')
            continue
        _, _, i = min(cand)
        g = geoms[i]
        g = max(g.geoms, key=lambda h: h.area) if g.geom_type == 'MultiPolygon' else g
        pr = feats[i]['properties']
        cx, cy, w, d, rumo = gf.retangulo(g)
        out.append({'kind': chave, 'name': nome, 'x': cx, 'y': cy, 'w': w, 'd': d, 'heading': rumo,
                    'ground': round(float(rel.terreno(np.array([cx]), np.array([cy]))[0]), 2),
                    'height': round(float(pr.get('ALT_EST_MAXMDE_MINMDT') or 0), 2),
                    'roof': round(float(pr.get('ALT_EST_MODAMDE_MINMDT') or 0), 2),
                    'outline': np.round(np.array(g.exterior.coords)[:, :2], 2).tolist()})
        print(f"marco {chave}: pegada de {g.area:.0f} m2, altura {out[-1]['height']} m (telhado tipico {out[-1]['roof']} m)")
    return out


def edificios(pasta, origem, P, largura, folga, pit, gx, gy, agua, rel, s, E, marcos_):
    """Edificacoes do cadastro do BHGeo (2015) com a altura do laser (o telhado tipico, ALT_EST_MODAMDE_MINMDT). Na grade
    e a ate PERTO_M da pista: as do jogo (landscape.js), fora da faixa da pista e dos boxes, das arquibancadas, dos marcos
    e da lagoa; alem: o horizonte (skyline) so as de pelo menos SKYLINE_MIN_M de altura."""
    from shapely.geometry import LineString, Polygon, shape
    from shapely import STRtree, affinity
    n = len(P)
    meio = largura / 2 + np.maximum(folga[-1], folga[1]) + 1.6
    faixa = [LineString([P[i], P[(i + 1) % n]]).buffer(max(meio[i], meio[(i + 1) % n])) for i in range(n)]
    pit_xy = np.array(pit['xy'])
    faixa.append(LineString(pit_xy).buffer(float(max(np.abs(np.array(pit['lo_arr'])).max(), np.array(pit['hi_arr']).max())) + 24))
    for a in ARQUIBANCADAS:
        idx = [i for i in range(n) if (s[i] - (s[-1] + DS - a['antes'])) % (s[-1] + DS) <= a['blocos'] * 28]
        de, ate = 5.5, a['recuo'] + 17.6
        meio_ = a['lado'] * (largura[idx] / 2 + (de + ate) / 2)
        faixa.append(LineString(P[idx] + E[idx] * meio_[:, None]).buffer((ate - de) / 2 + 12.5))
    arv = STRtree(faixa)
    marcos_t = STRtree([Polygon(m['outline']).buffer(2) for m in marcos_])
    kd = cKDTree(P)
    lista, ceu, cont = [], [], {'pista': 0, 'marco': 0, 'lagoa': 0, 'baixa_longe': 0}
    xmin, xmax, ymin, ymax = gx[0] + 8, gx[-1] - 8, gy[0] + 8, gy[-1] - 8
    passo = gx[1] - gx[0]
    for f in json.loads((pasta / 'bhgeo_edificacoes.geojson').read_text(encoding='utf-8'))['features']:
        g = affinity.translate(shape(f['geometry']), -origem[0], -origem[1]).buffer(0)
        if g.is_empty or g.area < 12:
            continue
        p = max(g.geoms, key=lambda h: h.area) if g.geom_type == 'MultiPolygon' else g
        pr = f['properties']
        h = float(pr.get('ALT_EST_MODAMDE_MINMDT') or 0)
        if h < 2.2:
            h = 3.4
        h = min(h, 120.0)
        cx, cy = p.centroid.x, p.centroid.y
        if len(marcos_t.query(p.centroid, predicate='intersects')):
            cont['marco'] += 1
            continue
        dentro = xmin < cx < xmax and ymin < cy < ymax
        perto = kd.query([cx, cy])[0] < PERTO_M
        if dentro and len(arv.query(p.minimum_rotated_rectangle, predicate='intersects')):
            cont['pista'] += 1
            continue
        if dentro and agua[int(round((cy - gy[0]) / passo)), int(round((cx - gx[0]) / passo))]:
            cont['lagoa'] += 1
            continue
        x, y, w_, d_, rumo = gf.retangulo(p)
        area = p.area
        tipo = 'predio' if h >= 12 and area >= 120 else 'galpao' if area >= 600 else 'casa'
        if dentro and perto:
            lista.append([x, y, w_, d_, rumo, round(h, 2), tipo, 'bhgeo'])
        elif h >= SKYLINE_MIN_M:
            chao = float(pr.get('COTA_MIN_MDT') or (rel.terreno(np.array([x]), np.array([y]))[0] + BASE)) - BASE
            ceu.append([x, y, w_, d_, rumo, round(h, 2), tipo, round(chao, 2)])
        else:
            cont['baixa_longe'] += 1
    print(f'edificacoes do cadastro: {len(lista)} no jogo ({sum(1 for e in lista if e[6] == "predio")} predios), '
          f'{len(ceu)} no horizonte, tiradas: {cont}')
    return ({'columns': ['x', 'y', 'w', 'd', 'heading', 'h', 'kind', 'source'], 'items': lista},
            {'columns': ['x', 'y', 'w', 'd', 'heading', 'h', 'kind', 'z'], 'items': ceu})


def aneis_pampulha(pasta, epsg, origem, baixar):
    """Os aneis de relevo e cor alem da grade (far-terrain.js), como em Floripa: os morros de Belo Horizonte, a Serra do
    Curral ao sul e a Serra da Piedade a leste, ate 22 km (ANADEM e Sentinel-2)."""
    import gerar_chapada as gc
    gc.NOME, gc.ORIGEM = NOME, np.array(origem, float)
    gc.COP_TILE = CIRCUITOS[NOME]['copernicus']
    gc.ANEIS = gf.ANEIS
    return gc.aneis(pasta, epsg, BASE, baixar)


# Os bichos da lagoa (pedido: capivaras num ponto sorteado da lagoa por corrida, trocando de ponto entre as corridas, e as
# vezes um jacare gordo repousando): pontos de margem do lado da lagoa, entre o muro e a agua, vistos da pista. Brejos e
# margens com vegetacao primeiro (onde eles estariam de verdade), espalhados pela volta.
FAUNA = {'passo_m': 10.0, 'busca_m': 60.0, 'espaco_min_m': 5.0, 'espaco_max_m': 45.0, 'da_agua_m': 2.5,
         'entre_pontos_m': 500.0, 'pontos': 16, 'brejo_m': 15.0}


def pontos_fauna(pasta, origem, amostras, terrain, classes):
    """Pontos de margem para os bichos (pampulha-fauna.js): a cada `passo_m` da volta, do lado direito (a lagoa fica a
    direita no sentido horario), da face de tras do muro ate a agua da lagoa (no maximo `busca_m`); onde sobra entre
    `espaco_min_m` e `espaco_max_m` de margem, um ponto a `da_agua_m` m da agua, no chao seco (ate 3,5 m acima dela) e
    nao calcado. Os melhores (brejo do BHGeo a menos de `brejo_m`, vegetacao, espaco) e espacados de `entre_pontos_m` na
    volta. Cada ponto: x, y, z do chao, heading (da margem para a agua), s da volta, room (margem livre), brejo."""
    import shapely
    from shapely.geometry import shape
    from shapely.ops import unary_union
    from shapely import affinity
    A = np.asarray(amostras, float)
    n, L = len(A), float(A[-1, 0] + (A[1, 0] - A[0, 0]))
    P, w, E, parede = A[:, 1:3], A[:, 4], A[:, 9:11], A[:, 15]
    lago = lagoa(pasta, origem)
    brejos = affinity.translate(unary_union([shape(f['geometry']) for f in json.loads(
        (pasta / 'bhgeo_brejos.geojson').read_text(encoding='utf-8'))['features']]).buffer(0), -origem[0], -origem[1])
    nx, ny, x0, y0, st = terrain['nx'], terrain['ny'], terrain['x0'], terrain['y0'], terrain['step']
    Z = np.asarray(terrain['z'], float).reshape(ny, nx)
    C = np.array(list(classes)).reshape(ny, nx)
    nivel = NIVEL_LAGOA - BASE

    def chao(x, y):
        fx, fy = min(max((x - x0) / st, 0), nx - 1.001), min(max((y - y0) / st, 0), ny - 1.001)
        i, j = int(fx), int(fy)
        u, v = fx - i, fy - j
        return (Z[j, i] * (1 - u) + Z[j, i + 1] * u) * (1 - v) + (Z[j + 1, i] * (1 - u) + Z[j + 1, i + 1] * u) * v
    cands = []
    for i in range(0, n, max(1, int(round(FAUNA['passo_m'] / (L / n))))):
        nrm = -E[i] / (np.linalg.norm(E[i]) or 1)
        inicio = w[i] / 2 + parede[i] + 1.5
        d = np.arange(inicio, inicio + FAUNA['busca_m'], .5)
        q = P[i] + nrm * d[:, None]
        agua = shapely.contains_xy(lago, q[:, 0], q[:, 1])
        if not agua.any():
            continue
        k = int(np.argmax(agua))
        espaco = d[k] - inicio
        if not FAUNA['espaco_min_m'] <= espaco <= FAUNA['espaco_max_m']:
            continue
        b = P[i] + nrm * (d[k] - FAUNA['da_agua_m'])
        zb = chao(*b)
        cl = C[int(round((b[1] - y0) / st)), int(round((b[0] - x0) / st))]
        if not (nivel + .1 <= zb <= nivel + 3.5) or cl in '467':
            continue
        brejo = brejos.distance(shapely.Point(b)) < FAUNA['brejo_m']
        nota = 2.0 * brejo + (cl in '0125') + min(espaco, 25) / 25
        cands.append((nota, float(A[i, 0]), {'x': round(float(b[0]), 2), 'y': round(float(b[1]), 2), 'z': round(float(zb), 2),
                                            'heading': round(math.atan2(nrm[1], nrm[0]), 4), 's': round(float(A[i, 0]), 1),
                                            'room': round(float(espaco), 1), 'brejo': bool(brejo)}))
    # Espalhados pela volta: a melhor margem de cada um de `pontos` trechos iguais (os brejos mapeados ficam longe da orla;
    # a vegetacao e o espaco decidem), sem dois a menos de `entre_pontos_m`.
    escolhidos = []
    for b_ in range(FAUNA['pontos']):
        no_trecho = [c_ for c_ in cands if b_ * L / FAUNA['pontos'] <= c_[1] < (b_ + 1) * L / FAUNA['pontos']]
        for nota, s_, ponto in sorted(no_trecho, key=lambda c_: -c_[0]):
            if all(min(abs(s_ - e[0]), L - abs(s_ - e[0])) >= FAUNA['entre_pontos_m'] for e in escolhidos):
                escolhidos.append((s_, ponto))
                break
    pontos = [p_ for _, p_ in sorted(escolhidos, key=lambda e: e[0])]
    print(f'bichos da lagoa: {len(cands)} pontos de margem, {len(pontos)} escolhidos ({sum(p_["brejo"] for p_ in pontos)} em brejo)')
    return {'spots': pontos, 'lake_level': round(nivel, 2)}


PERTO_M = 250.0
SKYLINE_MIN_M = 7.0


def solo_orto(pasta, origem, gx, gy, lado=3072):
    """A cor do chao: a ortofoto de 2015 do BHGeo (baixada a 1 m) recortada na grade, `lado` px no lado maior."""
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    info = json.loads((pasta / 'bhgeo.json').read_text(encoding='utf-8'))['ortofoto_2015']
    img = Image.open(pasta / info['arquivo'])
    px = info['px']
    X0, Y1 = origem[0] + gx[0], origem[1] + gy[-1]
    X1, Y0 = origem[0] + gx[-1], origem[1] + gy[0]
    caixa = (int(round((X0 - info['x0']) / px)), int(round((info['y1'] - Y1) / px)),
             int(round((X1 - info['x0']) / px)), int(round((info['y1'] - Y0) / px)))
    rec = img.crop(caixa)
    w, h = rec.size
    rec = rec.resize((lado, int(lado * h / w)) if w >= h else (int(lado * w / h), lado), Image.LANCZOS)
    destino = gp.ASSETS / f'{NOME}_solo.jpg'
    rec.save(destino, quality=84)
    print(f'{destino.name}: {rec.size} ({(X1 - X0) / rec.size[0]:.2f} m/px)')


if __name__ == '__main__':
    main()
