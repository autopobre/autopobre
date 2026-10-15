"""O cartão-postal noturno do Autódromo Floripa no navegador: a Hercílio Luz iluminada, os postes das pontes, as luzes
dos mastros do Morro da Cruz, os reflexos na baía e a cidade distante acesa.

    python verificar_noite_floripa.py [porta] [pasta das fotos] [--fotos=a,b,c] [--tempos=noite,fim_de_tarde,dia]
                                       [--sem-outro] [--leve] [--custo] [--antes] [--ponte=rosa] [--isolar]

Abre ?circuito=floripa no Treino solo, confere as contagens da noite (extras['Pontes_Floripa'].night,
extras['Marcos_Floripa'].night, extras['Mar'].night), que de dia nada disso aparece (nível 0) e que ao anoitecer o nível
chega aos módulos (fim de tarde .45, noite 1), sem erros na página, e fotografa cada vista em cada horário pedido
(padrão: noite e fim de tarde; dia só se pedido, para comparar com o antes). Depois abre o Minhocão (sem pontes de
Floripa) e confere que nada disto é montado ali. --leve abre no nível gráfico Baixo (cenário Básico). --custo mede as
chamadas de desenho da cena em cada foto. --antes só fotografa (sem conferir nada: as fotos de antes da noite).
--ponte=<esquema> abre com ?ponte= (dourado, branco, rosa, azul, verde_amarelo, festa: a iluminação da Hercílio Luz).
--isolar troca os módulos irmãos da rodada que estiverem pela metade (sem a função exportada) por módulos vazios. Fotos em renders/floripa_v2/previas/rodada_02/noite/<horario>_<vista>.png.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js

args = [a for a in sys.argv[1:] if not a.startswith('--')]
flags = [a for a in sys.argv[1:] if a.startswith('--')]
PORTA = args[0] if args else '8883'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
FOTOS = Path(args[1]) if len(args) > 1 else Path(__file__).resolve().parents[1] / 'renders' / 'floripa_v2' / 'previas' / 'rodada_02' / 'noite'
FOTOS.mkdir(parents=True, exist_ok=True)
ESCOLHA = next((f.split('=', 1)[1].split(',') for f in flags if f.startswith('--fotos=')), None)
TEMPOS = next((f.split('=', 1)[1].split(',') for f in flags if f.startswith('--tempos=')), ['noite', 'fim_de_tarde'])
erros = []
custos = []

# Câmera de perseguição/cockpit/longe em s (m da volta) ou vista parada em coordenadas da pista (x leste, y norte, z altura).
# A Hercílio Luz: torre do continente em (-362, 178), da ilha em (-32, 249), tabuleiro a ~29-30 m.
VISTAS = [
    ('grid_ponte', {'s': 4380}),
    ('vao_central', {'s': 60}),
    ('vao_cockpit', {'s': 0, 'modo': 'cockpit'}),
    ('cabeceira_ilha', {'s': 300}),
    ('paulo_fontes', {'s': 1200}),
    ('colombo_subida', {'s': 1960}),
    ('colombo_meio', {'s': 2400}),
    ('colombo_continente', {'s': 2800}),
    ('estreito', {'s': 3550}),
    ('cabeceira_continente', {'s': 4050}),
    ('postal_colombo', {'de': [-260, -175, 26], 'para': [-197, 213, 42], 'fov': 50}),
    ('postal_norte', {'de': [-60, 760, 14], 'para': [-200, 213, 36], 'fov': 50}),
    ('postal_forte', {'de': [52, 392, 2.6], 'para': [-197, 213, 30], 'fov': 55}),
    ('postal_continente', {'de': [-600, 420, 3], 'para': [-197, 213, 34], 'fov': 55}),
    ('torre_ilha', {'de': [10, 236, 31.5], 'para': [-32, 249, 60], 'fov': 60}),
    ('mar_baixo', {'de': [-120, 60, 3], 'para': [-230, 230, 20], 'fov': 60}),
    ('colombo_lado', {'de': [150, -60, 8], 'para': [-150, -220, 15], 'fov': 55}),
    ('morro_da_cruz', {'de': [-300, 650, 60], 'para': [3050, 600, 290], 'fov': 35}),
    ('baia_alto', {'de': [-1100, -900, 260], 'para': [0, 150, 0], 'fov': 55}),
    ('ilha_alto', {'de': [-150, -250, 140], 'para': [1400, -150, 30], 'fov': 55}),
    ('continente_alto', {'de': [100, 300, 120], 'para': [-1600, 0, 0], 'fov': 55}),
]


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def posicionar(page, spec):
    if 's' in spec:
        page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", spec['s'])
        camera(page, spec.get('modo', 'chase'))
        page.wait_for_timeout(2200)
    else:
        page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});true}", {'de': spec['de'], 'para': spec['para'], 'fov': spec.get('fov', 50)})
        page.wait_for_timeout(2000)


# --isolar: os módulos irmãos desta rodada (vida, trânsito, corrida na cidade) em obra no meio de uma edição viram
# módulos vazios (só para fotografar a noite enquanto outro construtor salva o dele pela metade).
IRMAOS = {'city-life.js': ('createCityLife', 'Vida_cidade'), 'city-traffic.js': ('createCityTraffic', 'Transito_cidade'), 'city-race.js': ('createCityRace', 'Corrida_na_cidade')}


def isolar(route):
    nome = route.request.url.split('?')[0].rsplit('/', 1)[-1]
    funcao, raiz = IRMAOS[nome]
    resposta = route.fetch()
    texto = resposta.text()
    if f'export function {funcao}' in texto or f'export async function {funcao}' in texto:
        route.fulfill(response=resposta)
        return
    print('modulo vazio no lugar de', nome, flush=True)
    route.fulfill(status=200, content_type='text/javascript', body=f"import * as THREE from 'three';export function {funcao}(){{const root=new THREE.Group();root.name='{raiz}';return {{root,stats:{{stub:true}}}};}}")


PONTE = next((f.split('=', 1)[1] for f in flags if f.startswith('--ponte=')), None)


def abrir(page, circuito):
    if '--isolar' in flags:
        for nome in IRMAOS:
            page.route(f'**/{nome}*', isolar)
    page.goto(URL + f'?circuito={circuito}' + (f'&ponte={PONTE}' if PONTE else ''), wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    if '--leve' in flags:
        page.evaluate("interlagosGraficos.set('baixo');true")
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    page.click('#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.()')
    page.wait_for_timeout(4000)


# Os materiais que só a noite desenha (sea-water.js nightLights/waterGlints e as poças de luz das pontes).
NOTURNOS = ('Pontes_luzes', 'Pontes_reflexos', 'Pontes_luz_no_tabuleiro', 'Marcos_luzes_mastros_noite', 'Cidade_luzes_longe',
            'Cidade_reflexos', 'Barcos_luzes', 'Barcos_reflexos', 'Beira_mar_reflexos')


def desenhados(page):
    """Os materiais noturnos desenhados em alguns quadros (interlagosGraficos.cost: chamadas por parte · material)."""
    mats = page.evaluate('async()=>Object.keys((await interlagosGraficos.cost(4)).materials)')
    return sorted({n for m in mats for n in NOTURNOS if m.endswith(' · ' + n)})


def noite(page):
    sc = page.evaluate('()=>interlagos.sceneryInfo().extras||{}')
    return {k: (sc.get(k) or {}).get('night') for k in ('Pontes_Floripa', 'Marcos_Floripa', 'Mar')}


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text[:300]), print('console', m.type, m.text[:300], flush=True)) if m.type == 'error' else None)
    abrir(page, 'floripa')
    page.evaluate("interlagosClima.set({time:'dia',rain:'seco'});true")
    page.wait_for_timeout(1500)
    extras = page.evaluate('()=>interlagos.sceneryInfo().extras||{}')
    for nome in ('Pontes_Floripa', 'Marcos_Floripa', 'Mar'):
        assert nome in extras, (nome, list(extras))
    pontes, marcos, mar = extras['Pontes_Floripa'], extras['Marcos_Floripa'], extras['Mar']
    resumo = {'pontes': pontes.get('night'), 'marcos': marcos.get('night'), 'mar': mar.get('night')}
    print(json.dumps(resumo, ensure_ascii=False), flush=True)
    pn, mn, sn = pontes.get('night') or {}, marcos.get('night') or {}, mar.get('night') or {}
    checar = '--antes' not in flags
    assert not checar or pn.get('silhouette', 0) > 0 and pn.get('hangers', 0) > 0 and pn.get('lamps', 0) > 0, pn
    assert not checar or mn.get('mastLights', 0) > 0 and mn.get('cityLights', 0) > 0, mn
    assert not checar or sn.get('glints', 0) > 0 and sn.get('anchorLights', 0) > 0, sn
    for k, v in noite(page).items():
        assert not checar or (v and v.get('level') == 0), ('de dia o nível é 0', k, v)
    # De dia nada da noite é desenhado (o dia fica como era).
    d = desenhados(page)
    print('de dia, materiais noturnos desenhados:', d, flush=True)
    assert not checar or not d, d
    for tempo in TEMPOS:
        page.evaluate("t=>{interlagosClima.set({time:t});true}", tempo)
        # Uma troca de horário que acende ou apaga faróis compila programas em fatias (main.js precompileGraphics).
        page.wait_for_timeout(1500)
        wait_js(page, '!interlagosClima.info().compiling', timeout=60000)
        page.wait_for_timeout(3000)
        alvo = {'dia': 0, 'fim_de_tarde': .45, 'noite': 1}[tempo]
        estado = noite(page)
        print(tempo, json.dumps(estado, ensure_ascii=False), flush=True)
        for k, v in estado.items():
            assert not checar or v and abs(v.get('level', -1) - alvo) < 1e-6, (tempo, k, v)
        if alvo > 0:
            d = desenhados(page)
            print(tempo, 'materiais noturnos desenhados:', d, flush=True)
            assert not checar or {'Pontes_luzes', 'Pontes_reflexos', 'Marcos_luzes_mastros_noite', 'Cidade_luzes_longe', 'Barcos_luzes'} <= set(d), d
        for nome, spec in VISTAS:
            if ESCOLHA and nome not in ESCOLHA:
                continue
            posicionar(page, spec)
            page.screenshot(path=str(FOTOS / (f'{tempo}_{PONTE}_{nome}.png' if PONTE and PONTE != 'dourado' else f'{tempo}_{nome}.png')))
            if '--custo' in flags:
                c = page.evaluate("async()=>{const c=await interlagosGraficos.cost(8),q=c.parts,tot=Object.values(q).reduce((t,v)=>[t[0]+v.calls,t[1]+v.triangles],[0,0]);return {pontes:q['Pontes_Floripa']??null,marcos:q['Marcos_Floripa']??null,mar:q['Mar']??null,total:tot};}")
                custos.append((tempo, nome, c))
            print('foto', tempo, nome, flush=True)
        page.evaluate('interlagosLuz.photo(null);true')
    page.evaluate("interlagosClima.set({time:'dia'});true")
    page.wait_for_timeout(1500)
    for k, v in noite(page).items():
        assert not checar or (v and v.get('level') == 0), ('de volta ao dia', k, v)
    d = desenhados(page)
    assert not checar or not d, ('de volta ao dia', d)
    if '--sem-outro' not in flags:
        abrir(page, 'minhocao')
        ex = page.evaluate('()=>interlagos.sceneryInfo().extras||{}')
        assert 'Pontes_Floripa' not in ex and 'Marcos_Floripa' not in ex and 'Mar' not in ex, list(ex)
        print('minhocao sem a noite de Floripa:', list(ex), flush=True)
    browser.close()
for c in custos:
    print('custo', json.dumps(c, ensure_ascii=False))
assert not erros, erros
print(json.dumps({'passed': True}, ensure_ascii=False))
