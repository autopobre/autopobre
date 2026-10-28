"""Ligacoes de projeto entre dois pontos de uma volta: curvas de curvatura suave que saem da volta tangentes a ela e voltam
a ela tangentes (a ligacao de um traçado variante, gerar_variante.py; os atalhos dos traçados alternativos de um autodromo,
gerar_pista.py). Sem dependencia das outras ferramentas: a volta entra como uma funcao ponto(s) -> (ponto, tangente).
"""
import math

import numpy as np


def suave(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def rumo_de(t):
    return math.atan2(t[1], t[0])


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
    destino(desloc) -> (ponto, tangente). sentido: -1 curva a direita, 1 a esquerda."""
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


def ligacao(ponto, de_s, ate_s, rampa, sentido=-1, comprimento=160.0):
    """A ligacao que sai da volta em de_s e volta a ela perto de ate_s (o ajuste acha onde fecha): pontos, rumos e
    curvaturas finas, o comprimento, o s em que ela volta e o giro."""
    pA, tA = ponto(de_s)
    (comp, desloc), giro = fechar_curva(pA, rumo_de(tA), lambda d: ponto(ate_s + d), rampa, (comprimento, 0.0), sentido)
    P, rumo, k = curva_suave(pA, rumo_de(tA), comp, rampa, giro)
    return P, rumo, k, comp, ate_s + desloc, giro
