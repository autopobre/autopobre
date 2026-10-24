"""A beira-mar do Autódromo Floripa no navegador: enrocamento, calçadão, trapiches e gente montados, e fotos da orla.

    python verificar_beira_mar.py [porta] [pasta das fotos] [--fotos=a,b,c] [--noite] [--sem-outro] [--leve] [--base] [--custo]

Abre ?circuito=floripa no Treino solo, confere as contagens do módulo beira-mar.js (extras['Beira_mar']: pedras,
palmeiras, postes, bancos, quiosques, trapiches, barcos, pessoas, chamadas de desenho), sem erros na página, e fotografa
a orla da câmera de perseguição em vários pontos da volta (Hercílio Luz, cabeceira da ilha, Paulo Fontes, Colombo
Salles, Estreito) e de vistas baixas no próprio calçadão e da água, mais uma vista alta. --noite repete algumas à noite
(postes acesos). Depois abre o Minhocão (circuito de rua sem data.scenery.city) e confere que ele não tem a beira-mar.
--custo mede chamadas e triângulos da beira-mar em cada foto (interlagosGraficos.cost). --leve abre no nível gráfico Baixo (cenário Básico: só pedras e palmeiras). Fotos em renders/floripa_v2/previas/rodada_01/beira_mar/.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, start_race

args = [a for a in sys.argv[1:] if not a.startswith('--')]
flags = [a for a in sys.argv[1:] if a.startswith('--')]
PORTA = args[0] if args else '8882'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
FOTOS = Path(args[1]) if len(args) > 1 else Path(__file__).resolve().parents[1] / 'renders' / 'floripa_v2' / 'previas' / 'rodada_01' / 'beira_mar'
FOTOS.mkdir(parents=True, exist_ok=True)
ESCOLHA = next((f.split('=', 1)[1].split(',') for f in flags if f.startswith('--fotos=')), None)
erros = []
custos = []

# Câmera de perseguição em s (m da volta) ou vista parada em coordenadas da pista (x leste, y norte, z altura).
FOTOS_ORLA = [
    ('hl_vao_ilha', {'s': 40}),
    ('hl_cabeceira_ilha', {'s': 250}),
    ('ilha_adolfo_konder', {'s': 330}),
    ('paulo_fontes_1000', {'s': 1000}),
    ('paulo_fontes_1300', {'s': 1300}),
    ('colombo_subida', {'s': 1960}),
    ('colombo_cabeceira_ilha', {'s': 2150}),
    ('colombo_meio', {'s': 2500}),
    ('colombo_continente', {'s': 2880}),
    ('estreito_3100', {'s': 3100}),
    ('estreito_4000', {'s': 4010}),
    ('hl_cabeceira_continente', {'s': 4130}),
    ('ponte_hl_ilha', {'de': [24, 276, 34], 'para': [75, 390, 0], 'fov': 50}),
    ('ponte_hl_continente', {'de': [-310, 201, 34], 'para': [-560, 380, 0], 'fov': 50}),
    ('ponte_colombo_aterro', {'de': [225, -255, 24], 'para': [390, -380, 0], 'fov': 50}),
    ('ponte_colombo_estreito', {'de': [-471, -184, 23], 'para': [-400, -40, 0], 'fov': 50}),
    ('calcadao_forte', {'de': [52, 392, 2.6], 'para': [36, 300, 2.0]}),
    ('calcadao_osvaldo', {'de': [212, 92, 2.6], 'para': [150, 160, 1.6]}),
    ('mar_cabeceira_ilha', {'de': [-60, 170, 4], 'para': [90, 240, 3]}),
    ('mar_osvaldo', {'de': [150, 30, 3.5], 'para': [240, 80, 2]}),
    ('mar_aterro', {'de': [230, -380, 3.5], 'para': [380, -350, 2]}),
    ('calcadao_aterro', {'de': [440, -397, 2.6], 'para': [320, -320, 1.8]}),
    ('mar_estreito', {'de': [-260, -40, 4], 'para': [-420, -60, 2]}),
    ('calcadao_estreito', {'de': [-415, -95, 2.6], 'para': [-360, 0, 1.8]}),
    ('trapiches_estreito', {'de': [-470, -250, 3], 'para': [-560, -270, 1.5]}),
    ('trapiche_perto', {'de': [-418, -116, 3], 'para': [-442, -152, 1.2]}),
    ('barcos_estreito', {'de': [-518, -262, 3.2], 'para': [-548, -262, 1]}),
    ('continental_norte', {'de': [-600, 420, 2.6], 'para': [-480, 250, 2.5]}),
    ('mar_continental', {'de': [-420, 380, 5], 'para': [-560, 340, 2]}),
    ('sob_hl_ilha', {'de': [-5, 205, 4], 'para': [40, 272, 4]}),
    ('sob_hl_continente', {'de': [-320, 128, 4], 'para': [-372, 182, 5]}),
    ('sob_colombo_ilha', {'de': [196, -160, 4], 'para': [222, -222, 4]}),
    ('sob_colombo_continente', {'de': [-455, -150, 4], 'para': [-492, -212, 5]}),
    ('alto_ilha', {'de': [-120, 40, 90], 'para': [180, 160, 0]}),
    ('alto_estreito', {'de': [-200, -100, 80], 'para': [-450, -60, 0]}),
]
NOITE = ['ponte_hl_ilha', 'calcadao_osvaldo', 'calcadao_estreito', 'continental_norte', 'kiosks_0']


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def posicionar(page, spec):
    if 's' in spec:
        page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", spec['s'])
        camera(page, spec.get('modo', 'chase'))
        page.wait_for_timeout(1800)
    else:
        page.evaluate("p=>interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true})", {'de': spec['de'], 'para': spec['para'], 'fov': spec.get('fov', 55)})
        page.wait_for_timeout(1600)


def abrir(page, circuito):
    page.goto(URL + f'?circuito={circuito}', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    if '--leve' in flags:
        page.evaluate("interlagosGraficos.set({level:'baixo'});true")
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    start_race(page, '#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.()')
    page.wait_for_timeout(4000)
    return page.evaluate("()=>({circuit:interlagos.circuit,extras:interlagos.sceneryInfo().extras??{},drawCalls:interlagos.state?.drawCalls})")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: print('console', m.type, m.text[:4000] if 'Shader' in m.text else m.text[:300], flush=True) if m.type in ('error', 'warning') else None)
    info = abrir(page, 'floripa')
    if '--leve' in flags:
        print('cenario', page.evaluate("interlagosGraficos.info().scenery"), flush=True)
    assert info['circuit'] == 'floripa', info
    st = info['extras'].get('Beira_mar')
    print('Beira_mar', json.dumps(st, ensure_ascii=False), flush=True)
    falhas = []
    if '--base' not in flags:
        assert st and not st.get('stub'), 'beira-mar.js ainda é o esboço'
        leve = '--leve' in flags
        for chave in ('rocks', 'palms') if leve else ('rocks', 'palms', 'lamps', 'benches', 'piers', 'people'):
            if not st.get(chave, 0) > 0:
                falhas.append(f'sem {chave}')
        if st['drawCalls'] > 15:
            falhas.append(f"chamadas de desenho demais: {st['drawCalls']}")
    lugares = (st or {}).get('spots') or {}
    for tipo in ('decks', 'kiosks', 'gyms', 'ramp', 'boats'):
        for k, q in enumerate(lugares.get(tipo, [])[:2]):
            x, y = q[0], q[1]
            if len(q) > 2:  # com a normal para a terra: de dentro do calçadão, olhando o mar
                FOTOS_ORLA.append((f'{tipo}_{k}', {'de': [x + q[2] * 17 + q[3] * 6, y + q[3] * 17 - q[2] * 6, 3.5], 'para': [x - q[2] * 2, y - q[3] * 2, 0.5], 'fov': 60}))
            else:
                FOTOS_ORLA.append((f'{tipo}_{k}', {'de': [x + 9, y - 9, 3.2], 'para': [x, y, 1.0], 'fov': 60}))
    for nome, spec in FOTOS_ORLA:
        if ESCOLHA and nome not in ESCOLHA and nome.split('_')[0] not in ESCOLHA:
            continue
        posicionar(page, spec)
        page.screenshot(path=str(FOTOS / f'{nome}.png'))
        print('foto', nome, flush=True)
        if '--custo' in flags:
            c = page.evaluate("async()=>{const c=await interlagosGraficos.cost(8);const tot=Object.values(c.parts).reduce((t,q)=>[t[0]+q.calls,t[1]+q.triangles],[0,0]);return {bm:c.parts['Beira_mar']??null,total:tot,passes:c.passes};}")
            print('   custo', nome, json.dumps(c, ensure_ascii=False), flush=True)
            custos.append((nome, c))
    if '--noite' in flags:
        page.evaluate("interlagosClima.set({time:'noite'});true")
        wait_js(page, '!window.interlagosClima.info().compiling', timeout=120000)
        page.evaluate('interlagosClima.settle();true')
        page.wait_for_timeout(2000)
        for nome, spec in FOTOS_ORLA:
            if nome not in NOITE:
                continue
            posicionar(page, spec)
            page.evaluate('interlagosClima.settle();true')
            page.wait_for_timeout(800)
            page.screenshot(path=str(FOTOS / f'{nome}_noite.png'))
            print('foto', nome + '_noite', flush=True)
        page.evaluate("interlagosClima.set({time:'dia'});true")
    page.evaluate('interlagosLuz.photo(null);true')
    if '--sem-outro' not in flags:
        sem = abrir(page, 'minhocao')
        assert sem['circuit'] == 'minhocao', sem
        assert 'Beira_mar' not in sem['extras'], f"o Minhocão montou a beira-mar: {list(sem['extras'])}"
        print('Minhocão sem beira-mar:', list(sem['extras']), flush=True)
    browser.close()
assert not erros, erros
assert not falhas, falhas
print(json.dumps({'passed': True, 'beira_mar': st}, ensure_ascii=False))
