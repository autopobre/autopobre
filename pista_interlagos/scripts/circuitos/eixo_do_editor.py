"""Leva o traçado pintado no editor (teste/editor-tracado.html) para a entrada do gerador da pista.

    python eixo_do_editor.py guaratiba [arquivo]

Entrada: o tracado_<circuito>*.json mais novo em fontes/<circuito>/referencias/ (ou o arquivo dado), no formato
autopobre-tracado-v1, no UTM do circuito. Saida: fontes/<circuito>/eixo_refinado.json, como o de refinar_eixo.py
(estacoes de 2 m, larguras), mais a linha de chegada pintada (`chegada`, UTM) e a fonte. O eixo do editor e uma
polilinha: pontos repetidos saem, os cantos dela ganham um arredondamento de poucos metros (gaussiana de 3 m ao longo
do eixo, que deixa as retas retas) e o gerar_pista.py alisa o rumo como faz com os outros eixos.
"""
import json
import sys
from pathlib import Path

import numpy as np
from compat_scipy import gaussian_filter1d

from config import CIRCUITOS, pasta_fontes

DS = 2.0
SUAVE_M = 3.0


def mais_novo(pasta, nome):
    arquivos = sorted((pasta / 'referencias').glob(f'tracado_{nome}*.json'), key=lambda p: p.stat().st_mtime)
    if not arquivos:
        raise SystemExit(f'nenhum tracado_{nome}*.json em {pasta / "referencias"}')
    return arquivos[-1]


def reamostrar(P, passo):
    F = np.vstack([P, P[:1]])
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(F, axis=0), axis=1))]
    n = int(round(s[-1] / passo))
    t = np.linspace(0, s[-1], n, endpoint=False)
    return np.column_stack([np.interp(t, s, F[:, 0]), np.interp(t, s, F[:, 1])]), float(s[-1])


def main():
    nome = sys.argv[1]
    c = CIRCUITOS[nome]
    pasta = pasta_fontes(nome)
    arquivo = Path(sys.argv[2]) if len(sys.argv) > 2 else mais_novo(pasta, nome)
    t = json.loads(arquivo.read_text(encoding='utf-8'))
    if t.get('formato') != 'autopobre-tracado-v1' or t.get('circuito') != nome:
        raise SystemExit(f'{arquivo.name}: nao e um traçado do editor para {nome}')
    if t.get('sistema') != 'utm' or t.get('epsg') != c['epsg']:
        raise SystemExit(f'{arquivo.name}: em {t.get("sistema")} {t.get("epsg")}, o circuito em UTM {c["epsg"]}')
    if not t.get('eixo_fechado'):
        raise SystemExit(f'{arquivo.name}: a volta nao esta fechada')
    P = np.array(t['eixo'], float)
    # Largura de cada ponto (ferramenta Largura do editor): entre um ponto e o proximo ela vai em linha reta.
    Wp = np.array(t['largura_m'], float) if t.get('largura_m') and len(t['largura_m']) == len(P) else None
    # Pontos repetidos (a volta fechada em cima do primeiro ponto) e voltas no sentido contrario ao configurado.
    manter = np.r_[True, np.linalg.norm(np.diff(P, axis=0), axis=1) > .5]
    P = P[manter]
    Wp = Wp[manter] if Wp is not None else None
    if np.linalg.norm(P[-1] - P[0]) < .5:
        P = P[:-1]
        Wp = Wp[:-1] if Wp is not None else None
    area = .5 * np.sum(P[:, 0] * np.roll(P[:, 1], -1) - np.roll(P[:, 0], -1) * P[:, 1])
    sentido = 'anti-horario' if area > 0 else 'horario'
    if sentido != c['sentido']:
        raise SystemExit(f'{arquivo.name}: volta {sentido}, o circuito e {c["sentido"]} (inverta no editor ou na config)')
    fino, L_pintado = reamostrar(P, .5)
    fino = gaussian_filter1d(fino, SUAVE_M / .5, axis=0, mode='wrap')
    eixo, L = reamostrar(fino, DS)
    desvio = max(np.min(np.linalg.norm(eixo - p, axis=1)) for p in P)
    if Wp is not None:
        # A mesma reta do editor, ponto a ponto, levada as estacoes de 2 m pela distancia ao longo da volta (a do eixo
        # alisado, na proporcao da pintada: o arredondamento dos cantos encurta a volta uns metros).
        s_p = np.r_[0, np.cumsum(np.linalg.norm(np.diff(np.vstack([P, P[:1]]), axis=0), axis=1))]
        s_est = np.arange(len(eixo)) * L / len(eixo) * (L_pintado / L)
        largura = np.interp(s_est, s_p, np.r_[Wp, Wp[:1]])
    else:
        largura = np.full(len(eixo), float(c.get('largura_m') or t.get('largura_mostrada_m') or 13.0))
    saida = {'circuito': nome, 'epsg': c['epsg'], 'passo_m': DS, 'comprimento_osm_m': None,
             'comprimento_refinado_m': L, 'comprimento_pintado_m': L_pintado,
             'eixo': np.round(eixo, 3).tolist(), 'largura_m': np.round(largura, 2).tolist(),
             'fonte': {'arquivo': arquivo.name, 'salvo_em': t.get('salvo_em'), 'ferramenta': t.get('ferramenta')},
             # Larguras pintadas valem mais que as publicadas da config (gerar_pista.py).
             'largura_do_editor': Wp is not None}
    if t.get('chegada'):
        saida['chegada'] = [round(float(v), 3) for v in t['chegada']]
    if len(t.get('pit') or []) > 1:
        saida['pit_pintado'] = t['pit']
    (pasta / 'eixo_refinado.json').write_text(json.dumps(saida), encoding='utf-8')
    print(f'{arquivo.name}: {len(P)} pontos, volta {L_pintado:.0f} m pintada -> {len(eixo)} estacoes, {L:.0f} m '
          f'(cantos arredondados, ate {desvio:.1f} m do ponto pintado); chegada {"sim" if t.get("chegada") else "nao"}; '
          f'larguras {"pintadas, %.1f a %.1f m" % (largura.min(), largura.max()) if Wp is not None else "da config"}')


if __name__ == '__main__':
    main()
