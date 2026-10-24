"""Pintura das ruas do Autódromo Floripa (city-streets.js): faixas, faixas de pedestre, retenção, tampas e remendos.

    python verificar_pintura_cidade.py [porta] [pasta das fotos] [--sem-fotos] [--sem-leve]

Abre ?circuito=floripa no Treino solo e confere o que o módulo montou (extras['Pintura_cidade']: metros de faixa nas
ruas e na volta, faixas de pedestre, linhas de retenção, tampas, bocas de lobo, remendos, rachaduras; tiles e draw
calls), sem erros na página. Fotografa a volta (perseguição, cockpit, longe) e as ruas do centro do chão e do alto
(pintura_*.png na pasta dada, mais pintura_mosaico.jpg). Depois abre no nível gráfico Baixo (cenário Básico: só as
linhas e as faixas de pedestre, nada de detalhe) e confere que um circuito sem cidade (o Minhocão) não monta nada disto.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, start_race

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8799'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[1]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'renders' / 'floripa_v2' / 'previas' / 'rodada_01' / 'pintura'
FOTOS.mkdir(parents=True, exist_ok=True)
HIDE_UI = 'body *{visibility:hidden!important} #view{visibility:visible!important}'
erros = []

# Alturas do terreno do arquivo da pista (a câmera do chão fica 1,5 m acima; o jogo ajusta o chão em poucos cm).
DADOS = json.loads((RAIZ / 'dados' / 'pista_floripa.json').read_text(encoding='utf-8'))
T = DADOS['terrain']


def chao(x, y):
    fx = min(max((x - T['x0']) / T['step'], 0), T['nx'] - 1.001)
    fy = min(max((y - T['y0']) / T['step'], 0), T['ny'] - 1.001)
    ix, iy = int(fx), int(fy)
    u, v, k, z = fx - ix, fy - iy, iy * T['nx'] + ix, T['z']
    return (z[k] * (1 - u) + z[k + 1] * u) * (1 - v) + (z[k + T['nx']] * (1 - u) + z[k + T['nx'] + 1] * u) * v


def rua(x, y, x2, y2, h=1.5, baixa=2.5):
    """Do chão em (x, y) olhando para (x2, y2), um pouco para baixo."""
    return {'from': [x, y, chao(x, y) + h], 'at': [x2, y2, chao(x2, y2) + h - baixa], 'fov': 55}


def obliqua(x, y, d=7, h=10, fov=50):
    return {'from': [x - d, y - d, chao(x, y) + h], 'at': [x, y, chao(x, y)], 'fov': fov}


VOLTA = [('ponte_hl', 100, 'chase'), ('ponte_hl_cockpit', 100, 'cockpit'), ('adolfo_konder_faixa', 528, 'chase'),
         ('hoepcke_semaforo', 650, 'chase'), ('hoepcke_longe', 640, 'far'), ('claudino_retencao', 878, 'chase'),
         ('paulo_fontes_faixas', 1150, 'chase'), ('colombo_salles', 1960, 'chase'), ('rua_14_de_julho', 3554, 'chase'),
         ('ivo_silveira', 3898, 'chase')]
CIDADE = [('rua_padre_roma', rua(735, 142, 750.9, 167.4, baixa=3)), ('rua_felipe_schmidt', rua(880, 115, 904.6, 97.8)),
          ('rua_conselheiro_mafra', rua(610, 185, 629.2, 168.9, h=1.4, baixa=2)),
          ('cruzamento_tolentino', {'from': [630, 10, 30], 'at': [672, 58, 3.5], 'fov': 55}),
          ('cruzamento_padre_roma_alto', {'from': [745, 160, 75], 'at': [770, 195, 16], 'fov': 50}),
          ('pare', obliqua(280.9, 150.4)), ('onibus', obliqua(792.8, 228.3)), ('setas', obliqua(185.8, 167.6, 9, 12)),
          ('tampa_de_bueiro', obliqua(684.5, 63.3, 2.5, 3.5)), ('boca_de_lobo', obliqua(688.6, 80.1, 2.5, 3.5)),
          ('remendo', obliqua(661.8, -22, 3, 4.5)), ('cruzamento_hoepcke', obliqua(497.4, 232, 8, 11)),
          ('onibus_e_linha_amarela', obliqua(653, 59.8, 9, 12)),
          ('centro_alto', {'from': [520, -80, 140], 'at': [760, 150, 5], 'fov': 55})]


def abrir(page, circuito, nivel=None):
    page.goto(URL + f'?circuito={circuito}', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    if nivel:
        page.evaluate("v=>{interlagosGraficos.set({level:v,overrides:{dynamicResolution:false}});return true}", nivel)
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    start_race(page, '#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.()')
    page.wait_for_timeout(4000)
    return page.evaluate("()=>({circuit:interlagos.circuit,extras:interlagos.sceneryInfo().extras??{}})")


def foto(page, nome):
    page.screenshot(path=str(FOTOS / f'pintura_{nome}.png'))
    print('foto', nome, flush=True)


def nova_pagina(browser):
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(300000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: print('console', m.type, m.text[:200], flush=True) if m.type == 'error' else None)
    return page


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = nova_pagina(browser)
    info = abrir(page, 'floripa')
    assert info['circuit'] == 'floripa', info
    st = info['extras'].get('Pintura_cidade')
    print(json.dumps(st, ensure_ascii=False), flush=True)
    assert st and not st.get('stub'), 'Pintura_cidade não montou'
    for chave, minimo in [('streetLinesM', 5000), ('dashes', 500), ('crosswalks', 50), ('crosswalkBars', 300), ('stopLines', 20),
                          ('pare', 1), ('arrows', 5), ('onibus', 5), ('lapLinesM', 1500), ('lapCrosswalks', 5), ('lapStopLines', 2),
                          ('manholes', 200), ('drains', 100), ('patches', 100), ('cracks', 100), ('oil', 20)]:
        assert st.get(chave, 0) >= minimo, (chave, st.get(chave), minimo)
    assert st['chunks'] > 0 and st['triangles'] > 0
    # Só os tiles perto do olho são desenhados (update): poucos draw calls.
    page.evaluate("s=>{const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));return true}", 1150)
    page.wait_for_timeout(1500)
    vistos = page.evaluate("interlagos.sceneryInfo().extras.Pintura_cidade.drawCalls")
    print('draw calls na Paulo Fontes:', vistos, flush=True)
    assert vistos <= 12, vistos
    if '--sem-fotos' not in sys.argv:
        page.add_style_tag(content=HIDE_UI)
        for nome, s, modo in VOLTA:
            page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));return true}", s)
            page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));return true}", modo)
            page.wait_for_timeout(1800)
            foto(page, nome)
        for nome, pose in CIDADE:
            page.evaluate("p=>{interlagosLuz.photo({from:p.from,at:p.at,fov:p.fov,world:true});return true}", pose)
            page.wait_for_timeout(1600)
            foto(page, nome)
        page.evaluate('interlagosLuz.photo(null);true')
    page.close()
    # Cenário Básico (nível Baixo): as linhas e as faixas ficam, os detalhes não.
    if '--sem-leve' not in sys.argv:
        page = nova_pagina(browser)
        leve = abrir(page, 'floripa', 'baixo')['extras'].get('Pintura_cidade')
        print('Baixo:', json.dumps(leve, ensure_ascii=False), flush=True)
        assert leve and leve['light'] and leve['crosswalks'] > 0 and leve['streetLinesM'] > 0 and leve['lapLinesM'] > 0, leve
        assert leve['manholes'] == 0 and leve['patches'] == 0 and leve['pare'] == 0, leve
        assert leve['triangles'] < st['triangles'], (leve['triangles'], st['triangles'])
        page.close()
    # Um circuito de rua sem data.scenery.city (o Minhocão): nada deste módulo.
    page = nova_pagina(browser)
    sem = abrir(page, 'minhocao')
    assert sem['circuit'] == 'minhocao', sem
    assert 'Pintura_cidade' not in sem['extras'], list(sem['extras'])
    print('Minhocão sem pintura da cidade', flush=True)
    browser.close()

if '--sem-fotos' not in sys.argv:
    try:
        from PIL import Image
        nomes = [n for n, _, _ in VOLTA] + [n for n, _ in CIDADE]
        ims = [Image.open(FOTOS / f'pintura_{n}.png').convert('RGB').resize((640, 360)) for n in nomes]
        cols = 4
        mosaico = Image.new('RGB', (640 * cols, 360 * ((len(ims) + cols - 1) // cols)), 'black')
        for k, im in enumerate(ims):
            mosaico.paste(im, ((k % cols) * 640, (k // cols) * 360))
        mosaico.save(FOTOS / 'pintura_mosaico.jpg', quality=85)
        print('mosaico', FOTOS / 'pintura_mosaico.jpg')
    except ImportError:
        print('(sem Pillow: mosaico não montado)')
assert not erros, erros
print(json.dumps({'passed': True}, ensure_ascii=False))
