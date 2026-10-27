"""Gera dados/pista_<variante>.json: outro traçado de um autodromo ja montado (config.VARIANTES).

    python gerar_variante.py chapecooval

O lugar e o arquivo da pista base (dados/pista_<base>.json, gerar_pista.py): terreno, cobertura, edificacoes,
arquibancadas, predio dos boxes e a escala dele ficam como estao. Muda a volta de corrida: os trechos da volta base que o
traçado usa, na mesma ordem e com o mesmo perfil, mais as ligacoes que ele tem e a base nao (medidas na imagem, ver o
config). O resto da volta base vira trecho fechado (closed_roads: desenhado e fechado por barreiras, como os outros
traçados de Velocitta), e a entrada antiga do pit lane tambem, quando o traçado entra nos boxes por outro lugar.

Chapeco, o oval (config 'chapecooval'): reta principal, curva 1, Reta 2 e a ligacao da Reta 2 com a reta principal antes da
curva 2. A entrada dos boxes do traçado completo fica no fim da reta principal, que o oval nao percorre: a faixa nova sai
por fora da ligacao e entra no pit lane antes das garagens (ficcao de jogabilidade, como os boxes de Curvelo).
"""
import json
import math
import sys

import numpy as np
from compat_scipy import cKDTree, gaussian_filter1d

from config import DADOS, VARIANTES
from gerar_pista import (BARREIRA_M, BARREIRA_SOBRA, DS, completar_pit, curvas, curvatura, main_s_monotono, quadro)

# Colunas da volta (as de gerar_pista.py).
S_, X_, Y_, Z_, W_, BANK_, GRADE_, TX_, TY_, LX_, LY_, RMSE_, PONTOS_, ZD_, ZE_ = range(15)
# A faixa dos boxes nova longe de uma barreira de trecho fechado (m alem da borda pavimentada dela).
FOLGA_PIT_BARREIRA = 3.0
# O chao colado as vias novas: o plano delas ate RAMPA_CHAO_M da borda, do relevo da base ate o plano entre la e CHAO_M.
CHAO_M, RAMPA_CHAO_M = 22.0, 6.0


def suave(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def volta_em(A, L, s, colunas):
    """Valores das colunas da volta em s (interpolados entre as estacoes; s em [0, L))."""
    s = np.asarray(s, float) % L
    ss = np.r_[A[:, S_], L]
    return np.column_stack([np.interp(s, ss, np.r_[A[:, c], A[0, c]]) for c in colunas])


def rumo_de(t):
    return math.atan2(t[1], t[0])


def s_de(base, ponto):
    """Distancia na volta base do ponto (UTM) mais perto dele: o config fala em pontos do lugar, que nao mudam quando o eixo
    da base e refeito."""
    A = np.array(base['samples'], float)
    m = base['meta']
    q = (np.asarray(ponto, float) - np.array(m['origin_utm'][:2])) * m['horizontal_scale_to_nominal']
    i = int(np.argmin(np.hypot(A[:, X_] - q[0], A[:, Y_] - q[1])))
    t = A[i, [TX_, TY_]] / np.hypot(A[i, TX_], A[i, TY_])
    return float((A[i, S_] + (q - A[i, [X_, Y_]]) @ t) % m['reconstructed_xy_m'])


def curva_suave(p0, rumo0, comprimento, rampa, giro, n=2001):
    """Curva de curvatura suave: cresce de 0 no primeiro `rampa` do comprimento, fica e volta a 0 no ultimo; o giro total e
    `giro` (rad, negativo a direita). Devolve pontos, rumos e curvaturas em n estacoes."""
    u = np.linspace(0, 1, n)
    forma = np.minimum(suave(u / rampa), suave((1 - u) / rampa)) if rampa > 0 else np.ones(n)
    area = float(np.sum((forma[1:] + forma[:-1]) / 2 * np.diff(u)))
    k = forma / area * giro / comprimento
    rumo = rumo0 + np.r_[0, np.cumsum((k[1:] + k[:-1]) / 2 * np.diff(u) * comprimento)]
    passo = comprimento / (n - 1)
    d = np.c_[np.cos(rumo[:-1]) + np.cos(rumo[1:]), np.sin(rumo[:-1]) + np.sin(rumo[1:])] / 2 * passo
    return np.asarray(p0, float) + np.r_[[[0.0, 0.0]], np.cumsum(d, 0)], rumo, k


def fechar_curva(p0, rumo0, destino, rampa, chute, sentido=-1):
    """Ajusta (comprimento, deslocamento ao longo do destino) para a curva suave sair de p0 no rumo0 e chegar tangente ao
    destino(desloc) -> (ponto, tangente). sentido: -1 curva a direita."""
    v = np.array(chute, float)

    def residuo(v):
        q, t = destino(v[1])
        giro = (rumo_de(t) - rumo0) % (2 * math.pi)
        if sentido < 0:
            giro -= 2 * math.pi
        P, _, _ = curva_suave(p0, rumo0, v[0], rampa, giro)
        return P[-1] - q, giro

    for _ in range(40):
        r, _ = residuo(v)
        if np.hypot(*r) < 1e-6:
            break
        J = np.zeros((2, 2))
        for j, h in enumerate((1e-3, 1e-3)):
            dv = np.zeros(2)
            dv[j] = h
            J[:, j] = (residuo(v + dv)[0] - r) / h
        v = v - np.linalg.solve(J, r)
    r, giro = residuo(v)
    if np.hypot(*r) > 1e-3:
        raise SystemExit(f'a curva nao fechou (erro {np.hypot(*r):.3f} m)')
    return v, giro


def reamostrar(P, valores, passo=DS):
    """Polilinha P (com colunas extras `valores`) reamostrada a cada ~passo m, pontas mantidas."""
    s0 = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    n = max(1, int(round(s0[-1] / passo)))
    ss = np.linspace(0, s0[-1], n + 1)
    Q = np.column_stack([np.interp(ss, s0, P[:, 0]), np.interp(ss, s0, P[:, 1])])
    return ss, Q, [np.interp(ss, s0, v) for v in valores]


def terreno_em(T, x, y):
    """Relevo da grade do arquivo (bilinear), como o jogo o le."""
    Z = np.asarray(T['z'], float).reshape(T['ny'], T['nx'])
    fx = np.clip((np.asarray(x) - T['x0']) / T['step'], 0, T['nx'] - 1.001)
    fy = np.clip((np.asarray(y) - T['y0']) / T['step'], 0, T['ny'] - 1.001)
    i, j = fy.astype(int), fx.astype(int)
    u, v = fx - j, fy - i
    return (Z[i, j] * (1 - u) + Z[i, j + 1] * u) * (1 - v) + (Z[i + 1, j] * (1 - u) + Z[i + 1, j + 1] * u) * v


def hermite(z0, g0, z1, g1, comprimento, t):
    """Perfil cubico de z0 (declive g0) a z1 (declive g1) ao longo de `comprimento` m (t de 0 a 1)."""
    h00, h10, h01, h11 = 2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t, -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2
    return h00 * z0 + h10 * comprimento * g0 + h01 * z1 + h11 * comprimento * g1


def montar_volta(base, cfg):
    """A volta do traçado: volta base de 0 a de_s, a ligacao, volta base de ate_s ao fim. Devolve as estacoes (colunas de
    gerar_pista.py), o comprimento, as pontas da ligacao na volta base e na nova, e as curvaturas dela."""
    A = np.array(base['samples'], float)
    Lb = base['meta']['reconstructed_xy_m']
    lig = cfg['ligacao']
    sA, s_ate = s_de(base, lig['de']), s_de(base, lig['ate'])
    pA, tA = volta_em(A, Lb, sA, (X_, Y_))[0], volta_em(A, Lb, sA, (TX_, TY_))[0]

    def na_reta(desloc):
        q = volta_em(A, Lb, s_ate + desloc, (X_, Y_, TX_, TY_))[0]
        return q[:2], q[2:] / np.hypot(q[2], q[3])

    (comp, desloc), giro = fechar_curva(pA, rumo_de(tA), na_reta, lig['rampa'], (160.0, 0.0))
    sJ = s_ate + desloc
    P, rumo, k = curva_suave(pA, rumo_de(tA), comp, lig['rampa'], giro)
    u_fino = np.linspace(0, 1, len(P))
    ss, Q, (rq, kq, uq) = reamostrar(P, (rumo, k, u_fino))
    print(f'ligacao: {comp:.1f} m, de s={sA:.1f} a s={sJ:.1f} da volta base, giro {math.degrees(giro):.1f} graus, '
          f'raio minimo {1 / np.abs(k).max():.1f} m')
    # Pontas: largura, cota e declive da volta base; o perfil da ligacao e cubico entre elas (Hermite, mesmos declives).
    (wA, zA, gA), (wJ, zJ, gJ) = volta_em(A, Lb, [sA, sJ], (W_, Z_, GRADE_))
    t = ss / comp
    largura = wA + (wJ - wA) * suave(t)
    z = hermite(zA, gA, zJ, gJ, comp, t)
    nova = np.zeros((len(Q), 15))
    nova[:, X_], nova[:, Y_], nova[:, Z_], nova[:, W_] = Q[:, 0], Q[:, 1], z, largura
    nova[:, TX_], nova[:, TY_] = np.cos(rq), np.sin(rq)
    nova[:, LX_], nova[:, LY_] = -np.sin(rq), np.cos(rq)
    # (As pontas da volta base a menos de 1 m das da ligacao saem: nenhuma estacao colada na outra.)
    antes = A[A[:, S_] < sA - 1.0]
    depois = A[A[:, S_] > sJ + 1.0]
    V = np.vstack([antes, nova, depois])
    xy = V[:, [X_, Y_]]
    passos = np.linalg.norm(np.diff(np.vstack([xy, xy[:1]]), axis=0), axis=1)
    V[:, S_] = np.r_[0, np.cumsum(passos[:-1])]
    L = float(passos.sum())
    i0, i1 = len(antes), len(antes) + len(nova) - 1
    return V, L, (sA, sJ), (i0, i1), kq


def recompor_perfil(V, L, i0, i1):
    """Declive de novo em toda a volta; caimento e zebras da regra de gerar_pista.py na ligacao e ate 40 m dela (fora disso,
    os da volta base)."""
    n = len(V)
    xy = V[:, [X_, Y_]]
    ds = np.linalg.norm(np.roll(xy, -1, 0) - xy, axis=1)
    V[:, GRADE_] = (np.roll(V[:, Z_], -1) - np.roll(V[:, Z_], 1)) / (ds + np.roll(ds, 1))
    kappa = curvatura(xy)
    raio = 1 / np.maximum(np.abs(kappa), 1e-6)
    intens = np.clip((400 - raio) / 300, 0, 1)
    bank = gaussian_filter1d(-np.sign(kappa) * (.01 + .015 * intens), 10 / DS, mode='wrap')
    s = V[:, S_]
    perto = np.minimum(np.clip((s - (s[i0] - 40)) / 25, 0, 1), np.clip(((s[i1] + 40) - s) / 25, 0, 1))
    perto = suave(perto)
    V[:, BANK_] = V[:, BANK_] * (1 - perto) + bank * perto
    # Zebras: dentro da curva onde o raio passa de 70% do pico, por fora na saida (como gerar_pista.py).
    cv = curvas(kappa, s, L)
    janela = (s >= s[i0] - 40) & (s <= s[i1] + 40)
    zd, ze = np.zeros(n), np.zeros(n)
    for cc in cv:
        if cc['raio_min'] > 160:
            continue
        idx = np.arange(cc['ini'], cc['fim'] + 1) if cc['fim'] >= cc['ini'] else np.r_[cc['ini']:n, 0:cc['fim'] + 1]
        pico = abs(kappa[cc['apice']])
        dentro = [i for i in idx if abs(kappa[i]) > .7 * pico]
        a = int(np.where(idx == cc['apice'])[0][0])
        saida = list(idx[a:]) + [(idx[-1] + q) % n for q in range(1, 6)]
        (ze if cc['lado'] > 0 else zd)[dentro] = 1
        (zd if cc['lado'] > 0 else ze)[[i for i in saida if abs(kappa[i]) < .8 * pico]] = 1
    V[janela, ZD_], V[janela, ZE_] = zd[janela], ze[janela]
    return kappa, cv


def superficie_de(V, L):
    xy, T, E = V[:, [X_, Y_]], V[:, [TX_, TY_]], V[:, [LX_, LY_]]
    s, z, grade, bank = V[:, S_], V[:, Z_], V[:, GRADE_], V[:, BANK_]
    kd = cKDTree(xy)

    def superficie(q):
        q = np.atleast_2d(q)
        k = kd.query(q)[1]
        dd = q - xy[k]
        lat = np.sum(dd * E[k], axis=1)
        along = np.sum(dd * T[k], axis=1)
        return k, (s[k] + along) % L, lat, z[k] + grade[k] * along + bank[k] * lat
    return superficie


def montar_pit(base, cfg, V, L, superficie, i0, i1):
    """A faixa dos boxes do traçado: a entrada nova, da ligacao ao pit lane da base, e o pit lane da base dali em diante
    (garagens, Box 99 e saida como estao). Como gerar_pista.montar_pit, com a volta do traçado."""
    P0 = base['pit']
    c = {nome: i for i, nome in enumerate(P0['columns'])}
    B = np.array(P0['samples'], float)
    e = cfg['pit_entrada']
    pw = float(B[0, c['hi']] - B[0, c['lo']])
    # Saida da ligacao: na borda de fora, a faixa encostada nela por dentro (como pit_sintetico nas pontas).
    i = i0 + int(round(e['fracao'] * (i1 - i0)))
    p = V[i]
    p0 = np.array([p[X_], p[Y_]]) + np.array([p[LX_], p[LY_]]) * (p[W_] / 2 - pw / 2 + .3)
    rumo0 = rumo_de((p[TX_], p[TY_]))
    # Chegada: o ponto `ate` (UTM) no pit lane da base, no rumo dele. A faixa nova segue reto da ligacao e vira a direita
    # numa curva suave ate la: o ajuste acha a reta e a curva (o pit lane corre 14 m por fora da reta principal e as
    # garagens comecam logo depois da ligacao, uma curva so, do tamanho da da ligacao, chegava no meio delas).
    m = base['meta']
    q = (np.asarray(e['ate'], float) - np.array(m['origin_utm'][:2])) * m['horizontal_scale_to_nominal']
    j = int(np.argmin(np.hypot(B[:, c['x']] - q[0], B[:, c['y']] - q[1])))
    tj = B[j, [c['tx'], c['ty']]] / np.hypot(B[j, c['tx']], B[j, c['ty']])
    sj = float(B[j, c['s']] + (q - B[j, [c['x'], c['y']]]) @ tj)
    alvo = np.array([np.interp(sj, B[:, c['s']], B[:, c[k]]) for k in ('x', 'y')])
    giro = (rumo_de(tj) - rumo0) % (2 * math.pi) - 2 * math.pi

    def entrada(v):
        reta, comp = v
        Q, _, k = curva_suave(p0 + reta * np.array([math.cos(rumo0), math.sin(rumo0)]), rumo0, comp, e['rampa'], giro)
        return np.vstack([p0, Q]), k
    v = np.array([20.0, 40.0])
    for _ in range(40):
        r = entrada(v)[0][-1] - alvo
        if np.hypot(*r) < 1e-6:
            break
        J = np.column_stack([(entrada(v + dv)[0][-1] - alvo - r) / 1e-3 for dv in (np.array([1e-3, 0]), np.array([0, 1e-3]))])
        v = v - np.linalg.solve(J, r)
    P, k = entrada(v)
    if np.hypot(*(P[-1] - alvo)) > 1e-3 or v.min() < 0:
        raise SystemExit(f'a entrada dos boxes nao fecha (reta {v[0]:.1f} m, curva {v[1]:.1f} m)')
    comp = float(v.sum())
    print(f'entrada dos boxes: {comp:.1f} m (reta {v[0]:.1f}, curva {v[1]:.1f}), da ligacao (s={p[S_]:.0f}) ao pit lane da '
          f'base em {sj:.1f} m, giro {math.degrees(giro):.1f} graus, raio minimo {1 / np.abs(k).max():.1f} m')
    resto = B[B[:, c['s']] > sj + 1.0]
    trilha = np.vstack([P, resto[:, [c['x'], c['y']]]])
    ps, pxy, _ = reamostrar(trilha, ())
    pt, pl = quadro(pxy, fechado=False)
    k, main_s, lat, z_main = superficie(pxy)
    largura = V[:, W_]
    pw_arr = np.full(len(ps), pw)
    gap_bruto = lat - pw_arr / 2 - largura[k] / 2
    gap = np.maximum(0, gap_bruto)
    # Perfil: o relevo da base (colado as vias dela: a reta principal fechada que a faixa cruza, o pit lane antigo);
    # perto da volta, o plano dela. Junto da reta principal, como na base (pit_sintetico), o plano da pista.
    zd = gaussian_filter1d(terreno_em(base['terrain'], pxy[:, 0], pxy[:, 1]) + .06, 12 / DS, mode='nearest')
    junto = gaussian_filter1d(np.clip((14 - gap) / 8, 0, 1), 5, mode='nearest')
    pz = zd * (1 - junto) + z_main * junto
    T = V[:, [TX_, TY_]]
    pbank = V[k, BANK_] * (pt[:, 0] * T[k, 0] + pt[:, 1] * T[k, 1]) * junto
    main_s = main_s_monotono(ps, main_s, lat, pt, T, k, L)
    lo, hi = -pw_arr / 2, pw_arr / 2
    # Garagens: as da base, no s da faixa nova.
    g0, g1 = (comp + (g - sj) for g in P0['garages'])
    abertura = float(ps[np.argmax(gap > .3)])
    muro_idx = np.flatnonzero((gap > 1.0) & (ps > abertura))
    trechos = np.split(muro_idx, np.flatnonzero(np.diff(muro_idx) > 2) + 1)
    muro_trechos = [(ps[t[0]], ps[t[-1]]) for t in trechos if len(t) and (ps[t[-1]] - ps[t[0]]) > 30 and gap[t].min() < 8]
    wall_nose = muro_trechos[0][0] if muro_trechos else abertura
    wall_end = muro_trechos[-1][1] if muro_trechos else ps[-1] - 40
    print(f'pit lane {ps[-1]:.0f} m: entra em s={main_s[0]:.0f}, volta em s={main_s[-1]:.0f}; garagens {g0:.0f}-{g1:.0f} m; '
          f'muro {[(round(a), round(b)) for a, b in muro_trechos]}')
    fonte = (P0['source'] + ' No oval, a entrada sai por fora da curva 2 (a ligação) e cruza o fim da reta principal, '
             'fechado: ficção de jogabilidade, a entrada do traçado completo fica no fim da reta, que o oval não percorre.')
    pit = completar_pit(pxy, lo, hi, pz, pbank, main_s, gap, (g0, g1), superficie, fonte, abertura, wall_nose, wall_end, L,
                        muro_trechos, reverso=False, gap_bruto=gap_bruto)
    return pit, sj, comp


def montar_fechados(base, V, L, sA, sJ, superficie, pit, sj_antigo):
    """O resto do traçado base (de sA a sJ) e a entrada antiga dos boxes (ate sj_antigo do pit lane da base), fechados:
    barreiras onde cada um sai da volta (regra de gerar_pista.montar_fechados: a barreira inteira a BARREIRA_M da borda),
    longe tambem da faixa dos boxes nova."""
    A = np.array(base['samples'], float)
    Lb = base['meta']['reconstructed_xy_m']
    largura = V[:, W_]
    pxy = np.array(pit['xy'])
    pmeia = (np.array(pit['hi_arr']) - np.array(pit['lo_arr'])) / 2
    pkd = cKDTree(pxy)
    trechos = []
    # A volta base de sA a sJ, com o perfil, as larguras e as zebras dela.
    ss = np.r_[sA, A[(A[:, S_] > sA + 1.0) & (A[:, S_] < sJ - 1.0), S_], sJ]
    R = volta_em(A, Lb, ss, (X_, Y_, Z_, W_, LX_, LY_, ZD_, ZE_))
    trechos.append({'id': 'curvas_2_a_12', 'nome': 'Curvas 2 a 12 do traçado completo', 'tipo': 'tracado',
                    's': ss - sA, 'P': R[:, :2], 'z': R[:, 2], 'w': R[:, 3], 'E': R[:, 4:6], 'zd': R[:, 6], 'ze': R[:, 7]})
    # A entrada antiga do pit lane, da reta principal ate onde a faixa nova chega nele.
    P0 = base['pit']
    c = {nome: i for i, nome in enumerate(P0['columns'])}
    B = np.array(P0['samples'], float)
    B = B[B[:, c['s']] <= sj_antigo + 2]
    trechos.append({'id': 'entrada_antiga_boxes', 'nome': 'Entrada dos boxes do traçado completo', 'tipo': 'servico',
                    's': B[:, c['s']], 'P': B[:, [c['x'], c['y']]], 'z': B[:, c['z']], 'w': B[:, c['hi']] - B[:, c['lo']],
                    'E': B[:, [c['lx'], c['ly']]], 'zd': np.zeros(len(B)), 'ze': np.zeros(len(B))})
    saida = []
    for f in trechos:
        P, E, w = f['P'], f['E'], f['w']
        k, _, lat, _ = superficie(P)
        gap = np.abs(lat) - largura[k] / 2
        meia = w / 2 + BARREIRA_SOBRA
        pontas = np.vstack([P - E * meia[:, None], P, P + E * meia[:, None]])
        kk, _, ll, _ = superficie(pontas)
        folga = (np.abs(ll) - largura[kk] / 2).reshape(3, -1).min(0)
        dp, ip = pkd.query(pontas)
        livre = (dp - pmeia[ip]).reshape(3, -1).min(0) >= FOLGA_PIT_BARREIRA
        # (Fora da volta e da faixa dos boxes nova: a entrada antiga corre ao lado da volta, a 4,6 m, e encontra a nova.)
        fora = (gap >= BARREIRA_M) & livre
        bocas = [(i, 1) if fora[i] else (i - 1, -1) for i in range(1, len(P)) if fora[i] != fora[i - 1]]
        barreiras = []
        for i, passo in bocas:
            j = i
            while 0 <= j < len(P) and (folga[j] < BARREIRA_M or not livre[j]):
                j += passo
            if not 0 <= j < len(P):
                continue
            a, b = P[j] - E[j] * meia[j], P[j] + E[j] * meia[j]
            barreiras.append([round(float(v), 3) for v in (*a, *b)] + [round(float(f['z'][j]), 3)])
        amostras = np.column_stack([f['s'] - f['s'][0], P, f['z'], w, E, f['zd'], f['ze'], gap])
        saida.append({'id': f['id'], 'name': f['nome'], 'kind': f['tipo'], 'osm_way': None, 'length_m': float(f['s'][-1] - f['s'][0]),
                      'columns': ['s', 'x', 'y', 'z', 'width', 'lx', 'ly', 'kerb_right', 'kerb_left', 'gap'],
                      'samples': np.round(amostras, 4).tolist(),
                      'barriers': {'columns': ['x1', 'y1', 'x2', 'y2', 'z'], 'items': barreiras}})
        print(f'  fechado {f["id"]}: {f["s"][-1] - f["s"][0]:.0f} m, {len(barreiras)} barreira(s) '
              f'{[(round(b[0]), round(b[1])) for b in barreiras]}')
    return saida


def colar_terreno(T, vias):
    """Chao colado as vias novas (a ligacao, a entrada dos boxes): o plano delas ate RAMPA_CHAO_M alem da borda, dai ate
    CHAO_M de volta ao relevo da base; alem das pontas de cada via vale o chao de antes (colado as vias da base)."""
    Z = np.asarray(T['z'], float).reshape(T['ny'], T['nx'])
    gx = T['x0'] + np.arange(T['nx']) * T['step']
    gy = T['y0'] + np.arange(T['ny']) * T['step']
    peso_max = np.zeros_like(Z)
    alvo = Z.copy()
    for P, Tg, E, z, meia, bank in vias:
        kd = cKDTree(P)
        x0, x1 = P[:, 0].min() - CHAO_M - 20, P[:, 0].max() + CHAO_M + 20
        y0, y1 = P[:, 1].min() - CHAO_M - 20, P[:, 1].max() + CHAO_M + 20
        jx = np.flatnonzero((gx >= x0) & (gx <= x1))
        iy = np.flatnonzero((gy >= y0) & (gy <= y1))
        XX, YY = np.meshgrid(gx[jx], gy[iy])
        q = np.column_stack([XX.ravel(), YY.ravel()])
        dist, k = kd.query(q)
        d = q - P[k]
        lat = np.sum(d * E[k], axis=1)
        adiante = np.sum(d * Tg[k], axis=1)
        ponta = ((k == 0) & (adiante < -1)) | ((k == len(P) - 1) & (adiante > 1))
        fora = np.maximum(np.abs(lat) - meia[k], 0)
        peso = np.clip((CHAO_M - fora) / (CHAO_M - RAMPA_CHAO_M), 0, 1) * ~ponta
        zv = z[k] + bank[k] * lat - .06
        sub = np.ix_(iy, jx)
        pm, al = peso_max[sub].ravel(), alvo[sub].ravel()
        melhor = peso > pm
        al[melhor] = zv[melhor]
        pm[melhor] = peso[melhor]
        peso_max[sub], alvo[sub] = pm.reshape(len(iy), len(jx)), al.reshape(len(iy), len(jx))
    p = suave(peso_max)
    novo = Z * (1 - p) + alvo * p
    print(f'chao colado as vias novas: {np.count_nonzero(peso_max > 0)} pontos da grade, '
          f'mudanca maxima {np.abs(novo - Z).max():.2f} m')
    return {**T, 'z': np.round(novo, 2).ravel().tolist()}


def main():
    nome = sys.argv[1] if len(sys.argv) > 1 else 'chapecooval'
    cfg = VARIANTES[nome]
    base = json.loads((DADOS / f'pista_{cfg["base"]}.json').read_text(encoding='utf-8'))
    mb = base['meta']
    V, L, (sA, sJ), (i0, i1), _ = montar_volta(base, cfg)
    kappa, cv = recompor_perfil(V, L, i0, i1)
    superficie = superficie_de(V, L)
    pit, sj_antigo, comp_entrada = montar_pit(base, cfg, V, L, superficie, i0, i1)
    fechados = montar_fechados(base, V, L, sA, sJ, superficie, pit, sj_antigo)
    s = V[:, S_]
    n = len(V)
    # Trechos: os da volta base antes da ligacao, a ligacao (a curva detectada nela) e a reta principal depois.
    meio = (i0 + i1) // 2
    da_ligacao = [cc for cc in cv if cc['ini'] <= meio <= cc['fim']]
    ini = float(s[da_ligacao[0]['ini']]) if da_ligacao else float(s[i0])
    fim = float(s[da_ligacao[0]['fim']]) if da_ligacao else float(s[i1])
    trechos = [t for t in mb['sections'] if t[0] < ini - 1 and t[0] < sA - 1]
    # (A base repete 'Reta 2' antes da curva 2, onde a reta entra na frenagem: sem a curva 2 dela, fica uma so.)
    trechos = [t for k, t in enumerate(trechos) if not k or t[1] != trechos[k - 1][1]]
    trechos += [[round(ini, 1), cfg['ligacao']['nome']], [round(fim + 15, 1), trechos[0][1]]]
    # Guard-rails: dos dois lados, menos do lado dos boxes (a esquerda) da entrada a saida deles (25 m antes e depois), e
    # menos onde um trecho fechado sai da volta: o guard-rail para 10 m antes da boca e volta onde o trecho ja passou
    # BARREIRA_M + 5 m da borda (a ponta do guard-rail se abre ate 10 m da pista nos ultimos 24 m: na boca da curva 2 do
    # oval ela ficava atras da barreira do trecho, que o carro achava antes do guard-rail); pedacos de menos de 30 m saem.
    a, b = (pit['entry_main_s'] - 25) % L, (pit['exit_main_s'] + 25) % L
    rails = {'-1': [[0.0, L]], '1': [[b, a]] if b < a else []}
    for f in fechados:
        F = np.array(f['samples'])
        for ponta in (F, F[::-1]):
            k, sb, lat, _ = superficie(ponta[:, 1:3])
            longe = np.abs(lat) - V[k, W_] / 2 >= BARREIRA_M + 5
            if longe[0] or longe.all() or not longe.any():
                continue
            lado, s0, s1 = '1' if lat[int(np.argmax(np.abs(lat) > 2))] > 0 else '-1', sb[0], sb[int(np.argmax(longe))]
            de, ate = (s0 - 10, s1) if (s1 - s0) % L < L / 2 else (s1, s0 + 10)
            cortado = []
            for x, y in rails[lado]:
                cortado += [[x, min(y, de)]] if x < de else []
                cortado += [[max(x, ate), y]] if y > ate else []
            rails[lado] = cortado
    rails = {lado: [[round(x, 1), round(y, 1)] for x, y in r if y - x >= 30] for lado, r in rails.items()}
    frenagens = [[round(float((s[cc['ini']] - 120) % L), 1), round(float((s[cc['ini']] + 25) % L), 1)]
                 for cc in cv if cc['raio_min'] < 160]
    xy, z = V[:, [X_, Y_]], V[:, Z_]
    comp_3d = float(np.sqrt(np.sum((np.roll(xy, -1, 0) - xy) ** 2, axis=1) + (np.roll(z, -1) - z) ** 2).sum())
    escala = mb['horizontal_scale_to_nominal']
    base_alt = mb['altitude_base_m']
    meta = {
        **mb,
        'id': nome, 'name': cfg['nome'], 'nominal_m': cfg['extensao_m'], 'variant_of': cfg['base'],
        'reconstructed_xy_m': L, 'reconstructed_3d_m': comp_3d,
        # Medido na imagem, sem a escala do complexo (a volta base levada a extensao publicada dela).
        'measured_centreline_m': L / escala, 'osm_centreline_m': None,
        'difference_nominal_pct': 100 * (comp_3d / cfg['extensao_m'] - 1),
        'elevation_min_m': float(z.min() + base_alt), 'elevation_max_m': float(z.max() + base_alt),
        'elevation_range_m': float(np.ptp(z)), 'grade_min_pct': float(100 * V[:, GRADE_].min()),
        'grade_max_pct': float(100 * V[:, GRADE_].max()), 'width_min_m': float(V[:, W_].min()),
        'width_max_m': float(V[:, W_].max()), 'kerb_m': float((V[:, ZD_].sum() + V[:, ZE_].sum()) * DS),
        'pit_lane_m': float(pit['length_m']), 'samples': n,
        'sections': trechos, 'rails': rails, 'brake_zones': frenagens,
        'centreline': (f'Trechos do traçado completo ({mb["centreline"]}) e a ligação da Reta 2 com a reta principal, medida '
                       'na mediana de 5 cenas Sentinel-2 (ago a out/2026) (scripts/circuitos/gerar_variante.py)'),
        'caveat': mb['caveat'] + (' A ligação do oval e a entrada dos boxes dele (fictícia) são desenhadas sobre a imagem de '
                                  '10 m; o perfil delas liga o das retas.'),
    }
    terreno = colar_terreno(base['terrain'], [
        (V[i0:i1 + 1, [X_, Y_]], V[i0:i1 + 1, [TX_, TY_]], V[i0:i1 + 1, [LX_, LY_]], V[i0:i1 + 1, Z_], V[i0:i1 + 1, W_] / 2,
         V[i0:i1 + 1, BANK_]),
        _via_pit(pit, comp_entrada)])
    pit = {k: v for k, v in pit.items() if k not in ('xy', 'z_lane', 'lx_ly', 'lo_arr', 'hi_arr')}
    saida = {'meta': meta, 'columns': base['columns'], 'samples': np.round(V, 5).tolist(), 'pit': pit,
             'terrain': terreno, 'scenery': base['scenery'], 'closed_roads': fechados}
    destino = DADOS / f'pista_{nome}.json'
    destino.write_text(json.dumps(saida, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    print(f'{destino.name}: {destino.stat().st_size / 1e6:.2f} MB')
    print(json.dumps({k: meta[k] for k in ('reconstructed_xy_m', 'reconstructed_3d_m', 'measured_centreline_m',
                                            'difference_nominal_pct', 'elevation_range_m', 'grade_min_pct', 'grade_max_pct',
                                            'width_min_m', 'width_max_m', 'kerb_m', 'pit_lane_m', 'sections', 'rails',
                                            'brake_zones')}, indent=1, ensure_ascii=False))


def _via_pit(pit, comp_entrada):
    """A entrada nova dos boxes como via para colar o chao (ate 10 m alem de onde ela chega no pit lane antigo)."""
    m = int(math.ceil((comp_entrada + 10) / DS)) + 1
    P = np.array(pit['xy'])[:m]
    Tg, E = quadro(P, fechado=False)
    meia = (np.array(pit['hi_arr']) - np.array(pit['lo_arr']))[:m] / 2
    return P, Tg, E, np.array(pit['z_lane'])[:m], meia, np.zeros(m)


if __name__ == '__main__':
    main()
