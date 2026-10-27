"""Eixo retificado: o eixo medido (refinar_eixo.py) refeito em retas retas e curvas de projeto.

    python retificar_eixo.py chapeco

Um autodromo novo e desenhado a regua: retas, clotoides e arcos. Medido numa imagem de 10 m (Sentinel-2), o eixo serpenteia
alguns metros nas retas, um grampo vira duas curvas e a curva de raio constante ondula. Aqui ele e refeito como uma sequencia
de elementos: retas e curvas de curvatura suave (sobe do zero, fica constante, volta ao zero), cada curva do lado e com o
giro das do eixo medido (as dobras de menos de GIRO_MIN viram reta). Comprimentos, giros e rampas sao ajustados (minimos
quadrados) para o eixo novo passar pelo meio do asfalto e fechar a volta; uma curva que ainda fica longe dele vira duas
(curva composta) quando isso melhora o ajuste. Uma perda robusta primeiro (as leituras erradas da faixa pesam pouco), e o
ajuste final sem elas.

O meio do asfalto: em cada estacao do eixo medido, o meio da faixa cinza (asfalto: pouca saturacao, nem claro nem escuro)
que o cruza, na mediana das cenas Sentinel-2 limpas (sentinel2_mediana.tif, baixar_fontes.py --mediana; sem ela, a cena de
sentinel2_rgb.tif). Onde a faixa nao cabe na janela (ao lado do pit lane, num cruzamento), vale o eixo medido, com menos peso.

Onde a medida engana (config 'retificar', 'curvas': de um ponto a outro do eixo medido): o trecho vira uma curva so, do lado
dado. Com 'sem_medida' ele sai do ajuste ao asfalto; com 'raio_m' o patamar da curva tem esse raio (medido na imagem), e
as retas que chegam nela a posicionam. Chapeco: no fim da Reta 2 o asfalto do oval, das areas de escape e da curva 2 e um so
borrao, e o eixo medido descia nele antes de virar a esquerda; a curva 2 e uma esquerda simples (video aereo da pista
pronta, out/2026).

Com 'editor' (o tracado_<c>*.json mais novo do editor de traçado, em fontes/<c>/ ou fontes/<c>/referencias/) a volta
corrigida a mao e a medida no lugar do asfalto da imagem: os mesmos elementos ajustados a ela (as retas dela ficam retas, as
curvas pintadas ponto a ponto viram curvas suaves).

Grava fontes/<c>/eixo_retificado.json no formato de eixo_refinado.json (o eixo, as larguras do medido no ponto mais perto) e
a previa fontes/<c>/retificacao.png; gerar_pista.py o usa quando o config tem 'retificar'.
"""
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import least_squares

from compat_scipy import cKDTree, gaussian_filter1d
from config import CIRCUITOS, pasta_fontes
from gerar_pista import Raster

DS = 2.0
SIGMA_KAPPA = 12          # estacoes (24 m) na curvatura que separa retas de curvas (o eixo medido, com ruido)
SIGMA_KAPPA_EDITOR = 5    # (10 m) na volta do editor, limpa: duas curvas com uma reta curta entre elas ficam duas
K_RETA = 1 / 400          # curvatura abaixo da qual o eixo medido e reta
GIRO_MIN = math.radians(15)
GIRO_COLADO = math.radians(30)
DESVIO_MAX = 2.5          # uma curva mais longe que isso do asfalto (e com mais de 60 m) pode virar duas
DIVIDE_GANHO = .08        # ... se o custo do ajuste cair 8%
FORA_M = 6.0              # meio de asfalto mais longe que isso do modelo robusto: leitura errada, sai do ajuste final
PESO_RAIO = 5.0
PESO_FECHA = 30.0
PESO_MEDIDO = .4          # estacoes sem a faixa na imagem: o eixo medido, com este peso
JANELA_M = 14.0           # meia largura da janela em que se procura a faixa de asfalto
RAMPA_MIN = .15           # cada ponta de curva sobe (e desce) em pelo menos 15% do comprimento dela: nada de quina


def suave(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def curva(p0, rumo0, comprimento, rampa, giro, n):
    u = np.linspace(0, 1, n)
    forma = np.minimum(suave(u / rampa), suave((1 - u) / rampa))
    area = float(np.sum((forma[1:] + forma[:-1]) / 2 * np.diff(u)))
    k = forma / area * giro / comprimento
    rumo = rumo0 + np.r_[0, np.cumsum((k[1:] + k[:-1]) / 2 * np.diff(u) * comprimento)]
    passo = comprimento / (n - 1)
    d = np.c_[np.cos(rumo[:-1]) + np.cos(rumo[1:]), np.sin(rumo[:-1]) + np.sin(rumo[1:])] / 2 * passo
    return np.asarray(p0, float) + np.r_[[[0.0, 0.0]], np.cumsum(d, 0)], rumo, k


class Modelo:
    """Volta de elementos: reta[0], curva[0], reta[1], ..., curva[m-1], reta[m] (que volta ao comeco). Parametros: x0, y0,
    rumo0, os comprimentos das retas, e de cada curva comprimento, rampa e giro."""

    def __init__(self, lados):
        self.lados = list(lados)
        self.m = len(self.lados)

    def partes(self, v):
        m = self.m
        return v[:3], v[3:4 + m], v[4 + m:4 + 2 * m], v[4 + 2 * m:4 + 3 * m], v[4 + 3 * m:4 + 4 * m]

    def pontos(self, v, passo=1.0):
        (x0, y0, r0), retas, comps, rampas, giros = self.partes(v)
        p, rumo = np.array([x0, y0]), r0
        P, K, elem = [p[None]], [np.zeros(1)], [np.zeros(1, int)]
        for i in range(self.m + 1):
            n = max(2, int(math.ceil(retas[i] / passo)) + 1)
            t = np.linspace(0, retas[i], n)[1:]
            P.append(p + np.c_[np.cos(rumo) * t, np.sin(rumo) * t])
            K.append(np.zeros(len(t)))
            elem.append(np.full(len(t), 2 * i))
            p = p + retas[i] * np.array([math.cos(rumo), math.sin(rumo)])
            if i == self.m:
                break
            n = max(8, int(math.ceil(comps[i] / passo)) + 1)
            Q, rr, k = curva(p, rumo, comps[i], rampas[i], giros[i], n)
            P.append(Q[1:])
            K.append(k[1:])
            elem.append(np.full(n - 1, 2 * i + 1))
            p, rumo = Q[-1], rr[-1]
        return np.vstack(P), np.concatenate(K), np.concatenate(elem), rumo


def distancias(Pm, q):
    """Distancia de cada ponto q a polilinha Pm (fechada), com o lado (positivo a esquerda dela) e o indice do segmento."""
    _, j = cKDTree(Pm).query(q)
    melhor = np.full(len(q), np.inf)
    lado = np.zeros(len(q))
    seg = np.zeros(len(q), int)
    n = len(Pm)
    for dj in (-1, 0):
        a = (j + dj) % n
        b = (a + 1) % n
        d = Pm[b] - Pm[a]
        L2 = np.maximum(np.sum(d * d, 1), 1e-12)
        u = np.clip(np.sum((q - Pm[a]) * d, 1) / L2, 0, 1)
        e = q - (Pm[a] + d * u[:, None])
        dist = np.hypot(e[:, 0], e[:, 1])
        ok = dist < melhor
        melhor[ok] = dist[ok]
        lado[ok] = np.sign(d[ok, 0] * e[ok, 1] - d[ok, 1] * e[ok, 0])
        seg[ok] = a[ok]
    return melhor, lado, seg


def asfalto(rgb):
    """Cara de asfalto (0 a 1) de amostras RGB do Sentinel-2: cinza (pouca saturacao), nem telhado nem concreto claro."""
    mx, mn = rgb.max(0), rgb.min(0)
    sat = (mx - mn) / np.maximum(mx, 1)
    return np.clip((.45 - sat) / .3, 0, 1) * np.clip((200 - mx) / 60, 0, 1)


def centros_da_faixa(M, rasters):
    """Meio da faixa de asfalto que cruza cada estacao de M (na normal, ate JANELA_M para cada lado), e se ela coube inteira
    na janela."""
    n = len(M)
    T = np.roll(M, -1, 0) - np.roll(M, 1, 0)
    T /= np.linalg.norm(T, axis=1)[:, None]
    N = np.c_[-T[:, 1], T[:, 0]]
    off = np.arange(-JANELA_M, JANELA_M + 1e-6, .5)
    Q = M[:, None, :] + N[:, None, :] * off[None, :, None]
    rgb = np.stack([r(Q[..., 0].ravel(), Q[..., 1].ravel(), ordem=3) for r in rasters]).reshape(3, n, len(off))
    v = asfalto(rgb)
    centro = np.zeros(n)
    ok = np.zeros(n, bool)
    meio = len(off) // 2
    for i in range(n):
        on = v[i] > .4
        j = meio
        if not on[j]:
            cand = np.flatnonzero(on)
            if not len(cand):
                continue
            j = cand[np.argmin(np.abs(cand - meio))]
        lo = hi = j
        while lo > 0 and on[lo - 1]:
            lo -= 1
        while hi < len(off) - 1 and on[hi + 1]:
            hi += 1
        if lo == 0 or hi == len(off) - 1:
            continue
        centro[i], ok[i] = (off[lo] + off[hi]) / 2, True
    return M + N * centro[:, None], ok


def corridas(rot):
    n = len(rot)
    out, k = [], 0
    while k < n:
        j = k
        while j < n and rot[j] == rot[k]:
            j += 1
        out.append([k, j - 1, int(rot[k])])
        k = j
    return out


def segmentar(rumo, kap, forcados):
    """Rotulo de cada estacao: 0 reta, +1/-1 curva a esquerda/direita (as dobras de menos de GIRO_MIN viram reta);
    os trechos `forcados` [(indices, lado)] por cima."""
    n = len(kap)
    rot = np.where(np.abs(kap) > K_RETA, np.sign(kap), 0).astype(int)
    fixo = np.zeros(n, bool)
    for idx, lado in forcados:
        rot[idx] = lado
        fixo[idx] = True
    # (Um resto de curva colado a um trecho forcado, a menos de 20 m dele, e a mesma leitura errada dele: vira reta ate
    # GIRO_COLADO.)
    for a, b, lado in corridas(rot):
        if not lado or fixo[a:b + 1].any():
            continue
        giro = abs(rumo[min(b + 1, n - 1)] - rumo[a])
        colado = fixo[np.arange(a - 10, a) % n].any() or fixo[np.arange(b + 1, b + 11) % n].any()
        if giro < GIRO_MIN or colado and giro < GIRO_COLADO:
            rot[a:b + 1] = 0
    return rot


def trecho(M, de, ate):
    """Indices do eixo (fechado) de perto de `de` ate perto de `ate`, no sentido da volta."""
    kd = cKDTree(M)
    a, b = int(kd.query(de)[1]), int(kd.query(ate)[1])
    return np.arange(a, b + 1 if b >= a else b + 1 + len(M)) % len(M)


def tracado_mais_novo(pasta, nome):
    """O tracado_<c>*.json mais novo que o editor salvou na pasta do circuito ou na de referencias."""
    arquivos = sorted([*pasta.glob(f'tracado_{nome}*.json'), *(pasta / 'referencias').glob(f'tracado_{nome}*.json')],
                      key=lambda p: p.stat().st_mtime)
    if not arquivos:
        raise SystemExit(f'nenhum tracado_{nome}*.json em {pasta} nem em {pasta / "referencias"}')
    return arquivos[-1]


def linha_do_editor(arquivo, nome, c):
    """A volta de um tracado_<c>*.json do editor (autopobre-tracado-v1, UTM do circuito) em estacoes de DS m, como
    eixo_do_editor.py: pontos repetidos fora, cantos da polilinha arredondados em 3 m."""
    t = json.loads(arquivo.read_text(encoding='utf-8'))
    if t.get('formato') != 'autopobre-tracado-v1' or t.get('circuito') != nome or t.get('epsg') != c['epsg']:
        raise SystemExit(f'{arquivo.name}: nao e um traçado do editor para {nome} em UTM {c["epsg"]}')
    if not t.get('eixo_fechado') or t.get('sentido') != c['sentido']:
        raise SystemExit(f'{arquivo.name}: a volta precisa estar fechada e no sentido {c["sentido"]}')
    P = np.array(t['eixo'], float)[:, :2]
    P = P[np.r_[True, np.linalg.norm(np.diff(P, axis=0), axis=1) > .5]]
    if np.linalg.norm(P[-1] - P[0]) < .5:
        P = P[:-1]

    def reamostrar(P, passo):
        F = np.vstack([P, P[:1]])
        s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(F, axis=0), axis=1))]
        u = np.linspace(0, s[-1], int(round(s[-1] / passo)), endpoint=False)
        return np.column_stack([np.interp(u, s, F[:, 0]), np.interp(u, s, F[:, 1])])
    return reamostrar(gaussian_filter1d(reamostrar(P, .5), 6, axis=0, mode='wrap'), DS)


def main():
    nome = sys.argv[1]
    c = CIRCUITOS[nome]
    cfg = c['retificar']
    pasta = pasta_fontes(nome)
    eixo = json.loads((pasta / 'eixo_refinado.json').read_text(encoding='utf-8'))
    imagem = 'sentinel2_mediana.tif' if (pasta / 'sentinel2_mediana.tif').exists() else 'sentinel2_rgb.tif'
    rasters = [Raster(pasta / imagem, c['epsg'], banda=b) for b in (1, 2, 3)]
    if cfg.get('editor'):
        # A volta corrigida a mao no editor de traçado: ela e a medida (cada ponto vale inteiro), as larguras sao as do
        # eixo medido no ponto mais perto.
        arquivo = tracado_mais_novo(pasta, nome)
        M = linha_do_editor(arquivo, nome, c)
        medido = np.array(eixo['eixo'], float)
        larg = np.array(eixo['largura_m'], float)[cKDTree(medido).query(M)[1]]
        obs, ok = M.copy(), np.ones(len(M), bool)
        print(f'volta do editor ({arquivo.name}): {len(M)} estacoes')
    else:
        M = gaussian_filter1d(np.array(eixo['eixo'], float), 2, axis=0, mode='wrap')
        larg = np.array(eixo['largura_m'], float)
        obs, ok = centros_da_faixa(M, rasters)
        print(f'meio do asfalto em {imagem}: {ok.mean():.0%} das estacoes; '
              f'do eixo medido: mediana {np.median(np.linalg.norm(obs[ok] - M[ok], axis=1)):.2f} m')
    n = len(M)
    # Trechos forcados (lado, sem medida, raio).
    forcados, mascara, raios, forcada = [], np.zeros(n, bool), np.zeros(n), np.zeros(n, bool)
    for f in cfg.get('curvas', []):
        idx = trecho(M, np.array(f['de']), np.array(f['ate']))
        forcados.append((idx, f['lado']))
        forcada[idx] = True
        if f.get('sem_medida'):
            mascara[idx] = True
        if f.get('raio_m'):
            raios[idx] = f['raio_m']
        print(f'trecho forcado ({f["lado"]:+d}): {len(idx) * DS:.0f} m' + (f', raio {f["raio_m"]} m' if f.get('raio_m') else ''))
    # Rotulos; a volta comeca no meio da maior reta.
    seg = np.linalg.norm(np.roll(M, -1, 0) - M, axis=1)
    s = np.r_[0, np.cumsum(seg[:-1])]
    L = float(seg.sum())
    T = np.roll(M, -1, 0) - np.roll(M, 1, 0)
    rumo = np.unwrap(np.arctan2(T[:, 1], T[:, 0]))
    kap = gaussian_filter1d(np.gradient(rumo, s), SIGMA_KAPPA_EDITOR if cfg.get('editor') else SIGMA_KAPPA, mode='wrap')
    rot = segmentar(rumo, kap, forcados)
    a, b, _ = max((r for r in corridas(rot) if r[2] == 0), key=lambda r: r[1] - r[0])
    i0 = (a + b) // 2
    M, obs, ok, larg, mascara, raios, forcada, rot = (np.roll(v, -i0, 0) for v in (M, obs, ok, larg, mascara, raios, forcada, rot))
    seg = np.roll(seg, -i0)
    s = np.r_[0, np.cumsum(seg[:-1])]
    T = np.roll(M, -1, 0) - np.roll(M, 1, 0)
    rumo = np.unwrap(np.arctan2(T[:, 1], T[:, 0]))
    curvas_m = [r for r in corridas(rot) if r[2] != 0]
    # Chute: retas e curvas como no medido (a volta comeca e termina numa reta).
    lados = [r[2] for r in curvas_m]
    comps = [s[r[1] + 1] - s[r[0]] for r in curvas_m]
    giros = [rumo[r[1] + 1] - rumo[r[0]] for r in curvas_m]
    retas, prev = [], 0.0
    for r in curvas_m:
        retas.append(max(0.0, s[r[0]] - prev))
        prev = s[r[1] + 1]
    retas.append(max(0.0, L - prev))
    voltas = round(sum(giros) / (2 * math.pi))
    print(f'{len(curvas_m)} curvas ({"".join("E" if lado > 0 else "D" for lado in lados)}), {voltas:+d} volta(s)')
    usa = ~mascara
    q = np.where(ok[:, None], obs, M)[usa]
    w_q = np.where(ok, 1.0, PESO_MEDIDO)[usa]

    w_alinha = np.where(mascara, .2, 1.0)

    def meios(mod, v):
        # A estacao do eixo medido no meio de cada curva do modelo (pela fracao da volta).
        Pm, _, elem, _ = mod.pontos(v)
        sm = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Pm, axis=0), axis=1))]
        out = {}
        for i in range(mod.m):
            j = np.flatnonzero(elem == 2 * i + 1)
            if len(j):
                out[i] = int(np.searchsorted(s, sm[j[len(j) // 2]] / sm[-1] * L)) % n
        return out

    def raio_de(mod, v):
        # As curvas do modelo num trecho forcado de raio dado: {curva: raio}.
        return {i: float(raios[k]) for i, k in meios(mod, v).items() if raios[k]}

    def forcadas_de(mod, v):
        # As curvas do modelo num trecho forcado: como foram desenhadas, nao viram duas.
        return {i for i, k in meios(mod, v).items() if forcada[k]}

    def resolver(lados, retas, comps, giros, rampas, v_antes=None):
        mod = Modelo(lados)
        lo = np.r_[-np.inf, -np.inf, -np.inf, np.zeros(len(retas)), np.full(len(comps), 5.0), np.full(len(comps), RAMPA_MIN),
                   [0 if lado > 0 else -2 * math.pi for lado in lados]]
        hi = np.r_[np.inf, np.inf, np.inf, np.full(len(retas), np.inf), np.full(len(comps), np.inf), np.full(len(comps), .5),
                   [2 * math.pi if lado > 0 else 0 for lado in lados]]
        v0 = np.clip(np.r_[M[0], rumo[0], retas, comps, rampas, giros] if v_antes is None else v_antes, lo + 1e-6, hi - 1e-6)

        def fecha(Pm, rumo_fim, v):
            return np.r_[(Pm[-1] - Pm[0]), 100 * (rumo_fim - v[2] - 2 * math.pi * voltas)] * PESO_FECHA

        def alinhados(v):
            # 1a etapa: cada estacao do eixo medido contra o ponto do modelo na mesma fracao da volta (sem trocar de trecho
            # quando o chute ainda esta longe); o trecho sem medida pesa pouco.
            Pm, _, _, rumo_fim = mod.pontos(v)
            sm = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Pm, axis=0), axis=1))]
            alvo = s / L * sm[-1]
            P = np.column_stack([np.interp(alvo, sm, Pm[:, 0]), np.interp(alvo, sm, Pm[:, 1])])
            return np.concatenate([((P - M) * w_alinha[:, None]).ravel(), fecha(Pm, rumo_fim, v)])

        def residuos(v, ficam=None):
            # 2a etapa: a distancia de cada meio de asfalto ao modelo (o ponto mais perto).
            Pm, _, _, rumo_fim = mod.pontos(v)
            qq, ww = (q, w_q) if ficam is None else (q[ficam], w_q[ficam])
            d, lado, _ = distancias(Pm, qq)
            res = [d * lado * ww]
            # O raio dado de uma curva forcada, no patamar dela.
            for i, raio in com_raio.items():
                comp, rampa, giro = v[4 + mod.m + i], v[4 + 2 * mod.m + i], v[4 + 3 * mod.m + i]
                res.append([(comp * (1 - rampa) / abs(giro) - raio) * PESO_RAIO])
            res.append(fecha(Pm, rumo_fim, v))
            return np.concatenate(res)
        if v_antes is None:
            v0 = least_squares(alinhados, v0, bounds=(lo, hi), x_scale='jac', diff_step=1e-5, max_nfev=400).x
            # Uma curva de raio dado sai desse chute colada ao eixo medido que a imagem desmente: comeca com ele, o que
            # ela cresce tirado das retas dos dois lados (o meio dela fica onde estava).
            for i, raio in raio_de(mod, v0).items():
                novo = abs(v0[4 + 3 * mod.m + i]) * raio / (1 - v0[4 + 2 * mod.m + i])
                delta = novo - v0[4 + mod.m + i]
                v0[4 + mod.m + i] = novo
                for k in (3 + i, 4 + i):
                    v0[k] = max(0.0, v0[k] - delta / 2)
            v0 = np.clip(v0, lo + 1e-6, hi - 1e-6)
        # (As curvas de raio dado, fixas durante o ajuste: o numero de residuos nao muda.)
        com_raio = raio_de(mod, v0)
        # Perda robusta: uma estacao em que a faixa foi mal lida, junto do pit lane ou de um escape, pesa pouco...
        r = least_squares(residuos, v0, bounds=(lo, hi), x_scale='jac', diff_step=1e-5, loss='soft_l1', f_scale=3.0,
                          max_nfev=800)
        # ... e sai do ajuste final (mais de FORA_M do modelo), que pesa todo o resto por igual.
        d = distancias(mod.pontos(r.x)[0], q)[0]
        ficam = d < FORA_M
        r = least_squares(lambda v: residuos(v, ficam), r.x, bounds=(lo, hi), x_scale='jac', diff_step=1e-5, max_nfev=800)
        return mod, r.x, r
    rampas = [.25] * len(comps)
    mod, v, r = resolver(lados, retas, comps, giros, rampas)
    tentadas = set()
    for rodada in range(8):
        Pm, K, elem, _ = mod.pontos(v)
        d, _, sg = distancias(Pm, q)
        _, retas_v, comps_v, rampas_v, giros_v = mod.partes(v)
        print(f'rodada {rodada}: do asfalto: media {np.average(d, weights=w_q):.2f} m, p95 {np.percentile(d, 95):.2f} m, '
              f'max {d.max():.2f} m; custo {r.cost:.1f}')
        # A curva mais longe do asfalto (p90 das estacoes perto dela) vira duas do mesmo lado (curva composta), se o custo
        # cair DIVIDE_GANHO; senao fica como estava e a proxima e tentada.
        piores = {}
        for i in range(mod.m):
            perto = (elem[sg] == 2 * i + 1) & (w_q == 1)
            if perto.any() and comps_v[i] > 60 and i not in forcadas_de(mod, v) and (mod.lados[i], round(comps_v[i])) not in tentadas:
                piores[i] = float(np.percentile(d[perto], 90))
        divide = [i for i, dm in piores.items() if dm > DESVIO_MAX]
        if not divide:
            break
        i = max(divide, key=lambda j: piores[j])
        tentadas.add((mod.lados[i], round(comps_v[i])))
        ld = mod.lados[:i] + [mod.lados[i], mod.lados[i]] + mod.lados[i + 1:]
        rt = list(retas_v[:i + 1]) + [0.0] + list(retas_v[i + 1:])
        cp = list(comps_v[:i]) + [comps_v[i] / 2] * 2 + list(comps_v[i + 1:])
        gr = list(giros_v[:i]) + [giros_v[i] / 2] * 2 + list(giros_v[i + 1:])
        rp = list(rampas_v[:i]) + [rampas_v[i]] * 2 + list(rampas_v[i + 1:])
        mod2, v2, r2 = resolver(ld, rt, cp, gr, rp, np.r_[v[:3], rt, cp, rp, gr])
        ganhou = r2.cost < r.cost * (1 - DIVIDE_GANHO)
        print(f'  curva {i} ({comps_v[i]:.0f} m, desvio p90 {piores[i]:.1f} m) em duas: custo {r2.cost:.1f}'
              f'{"" if ganhou else ", fica uma"}')
        if ganhou:
            mod, v, r = mod2, v2, r2
    lados = mod.lados
    _, retas_v, comps_v, rampas_v, giros_v = mod.partes(v)
    for i in range(mod.m):
        k = abs(giros_v[i]) / (comps_v[i] * (1 - rampas_v[i]))
        print(f'  reta {retas_v[i]:6.1f} m | curva {"E" if lados[i] > 0 else "D"} {comps_v[i]:6.1f} m, giro '
              f'{math.degrees(abs(giros_v[i])):5.1f} graus, raio ~{1 / k:6.1f} m, rampa {rampas_v[i]:.2f}')
    print(f'  reta {retas_v[-1]:6.1f} m')
    # Eixo novo a cada ~2 m, larguras do medido mais perto.
    Pm, K, elem, _ = mod.pontos(v, passo=.25)
    Pm = Pm[:-1]
    sm = np.r_[0, np.cumsum(np.linalg.norm(np.diff(np.vstack([Pm, Pm[:1]]), axis=0), axis=1))]
    Ln = float(sm[-1])
    nn = int(round(Ln / DS))
    st = np.linspace(0, Ln, nn, endpoint=False)
    Q = np.column_stack([np.interp(st, sm, np.r_[Pm[:, 0], Pm[0, 0]]), np.interp(st, sm, np.r_[Pm[:, 1], Pm[0, 1]])])
    larg_n = larg[cKDTree(M).query(Q)[1]]
    dq = distancias(Q, q)[0]
    dm = distancias(Q, M)[0]
    print(f'eixo retificado: {Ln:.1f} m (medido {L:.1f} m), {nn} estacoes; do asfalto: media {np.average(dq, weights=w_q):.2f} m, '
          f'max {dq.max():.2f} m; do eixo medido: media {dm.mean():.2f} m, max {dm.max():.2f} m')
    saida = {**eixo, 'eixo': np.round(Q, 3).tolist(), 'largura_m': np.round(larg_n, 2).tolist(),
             'comprimento_refinado_m': Ln, 'comprimento_medido_m': L,
             'retificacao': {'imagem': imagem,
                             'elementos': [{'reta_m': round(float(retas_v[i]), 2), 'curva_m': round(float(comps_v[i]), 2),
                                            'lado': int(lados[i]), 'giro_graus': round(math.degrees(float(giros_v[i])), 2),
                                            'rampa': round(float(rampas_v[i]), 3)} for i in range(mod.m)]
                             + [{'reta_m': round(float(retas_v[-1]), 2)}],
                             'do_asfalto_medio_m': float(np.average(dq, weights=w_q)), 'do_asfalto_max_m': float(dq.max()),
                             'curvas_forcadas': cfg.get('curvas', [])}}
    (pasta / 'eixo_retificado.json').write_text(json.dumps(saida, ensure_ascii=False), encoding='utf-8')
    previa(pasta, M, obs, ok, Q, s, kap, Pm, K, rasters)


def previa(pasta, M, obs, ok, Q, s, kap, Pm, K, rasters):
    """Planta sobre a imagem (eixo medido em vermelho, meio do asfalto em verde, retificado em amarelo) e as curvaturas ao
    longo da volta (medida em vermelho, retificada em amarelo)."""
    lo, hi = M.min(0) - 30, M.max(0) + 30
    esc = 2.0
    W, H = int((hi[0] - lo[0]) * esc), int((hi[1] - lo[1]) * esc)
    gx = lo[0] + (np.arange(W) + .5) / esc
    gy = hi[1] - (np.arange(H) + .5) / esc
    X, Y = np.meshgrid(gx, gy)
    rgb = np.stack([r(X.ravel(), Y.ravel(), ordem=1).reshape(H, W) for r in rasters], -1)
    im = Image.fromarray(np.clip(rgb * .8, 0, 255).astype(np.uint8))
    tela = Image.new('RGB', (W, H + 260), (24, 26, 28))
    tela.paste(im, (0, 0))
    dr = ImageDraw.Draw(tela)
    pt = lambda p: ((p[0] - lo[0]) * esc, (hi[1] - p[1]) * esc)
    dr.line([pt(p) for p in M] + [pt(M[0])], fill=(230, 60, 60), width=1)
    for p in obs[ok]:
        x, y = pt(p)
        dr.point((x, y), fill=(80, 240, 120))
    dr.line([pt(p) for p in Q] + [pt(Q[0])], fill=(250, 220, 40), width=2)
    y0 = H + 10
    sm = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Pm, axis=0), axis=1))]
    Yk = lambda k: y0 + 120 - np.clip(k, -.03, .03) * 4000
    dr.line([(0, y0 + 120), (W, y0 + 120)], fill=(90, 90, 90))
    dr.line([(a / s[-1] * W, Yk(b)) for a, b in zip(s, kap)], fill=(230, 60, 60))
    dr.line([(a / sm[-1] * W, Yk(b)) for a, b in zip(sm, K)], fill=(250, 220, 40))
    tela.save(pasta / 'retificacao.png')


if __name__ == '__main__':
    main()
