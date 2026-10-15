"""A vida nas ruas do Autódromo Floripa no navegador: pedestres, pontos de ônibus, botecos e ambulantes, e fotos.

    python verificar_vida.py [porta] [pasta das fotos] [--fotos=a,b,c] [--noite] [--chuva] [--sem-outro] [--leve] [--custo]

Abre ?circuito=floripa no Treino solo, confere as contagens do módulo city-life.js (extras['Vida_cidade']: pessoas,
pedestres, cachorros, mesas, cadeiras, guarda-sóis, ambulantes, gente nos pontos, chamadas de desenho), sem erros na
página, e fotografa: a câmera de perseguição em alguns pontos da volta, vistas baixas das calçadas (botecos, ambulantes,
pontos de ônibus, as ruas do Centro e do Estreito) e uma vista alta. --noite repete algumas à noite (botecos cheios,
varais de lâmpadas acesos, menos gente andando); --chuva com chuva forte (guarda-chuvas, mesas abertas vazias).
Depois abre o Minhocão (sem data.scenery.city) e confere que ele não monta a vida da cidade. --custo mede chamadas e
triângulos do módulo em cada foto (interlagosGraficos.cost). --leve abre no nível gráfico Baixo (cenário Básico).
Fotos em renders/floripa_v2/previas/rodada_02/vida/.
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
FOTOS = Path(args[1]) if len(args) > 1 else Path(__file__).resolve().parents[1] / 'renders' / 'floripa_v2' / 'previas' / 'rodada_02' / 'vida'
FOTOS.mkdir(parents=True, exist_ok=True)
ESCOLHA = next((f.split('=', 1)[1].split(',') for f in flags if f.startswith('--fotos=')), None)
erros = []
desenhos = []

# Câmera de perseguição em s (m da volta) ou vista parada em coordenadas da pista (x leste, y norte, z altura).
FOTOS_VIDA = [
    ('volta_hoepcke', {'s': 560}),
    ('volta_paulo_fontes', {'s': 1000}),
    ('volta_rodoviaria', {'s': 1500}),
    ('volta_estreito', {'s': 3300}),
    ('alto_centro', {'de': [640, -40, 60], 'para': [820, 120, 0], 'fov': 50}),
]
NOITE = ['boteco_0', 'boteco_1', 'boteco_2', 'calcada_0', 'calcada_1', 'volta_hoepcke', 'vendor_0', 'perto_0']
CHUVA = ['calcada_0', 'calcada_1', 'boteco_0', 'stop_0', 'volta_paulo_fontes', 'perto_0']


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def posicionar(page, spec):
    if 's' in spec:
        page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", spec['s'])
        camera(page, spec.get('modo', 'chase'))
        page.wait_for_timeout(1800)
    else:
        # Alturas sobre o chão visível (o Centro fica a 3-25 m sobre o mar): o módulo dá o chão sob um ponto.
        page.evaluate("""p=>{const g=interlagos.sceneryInfo().extras.Vida_cidade.groundAt,up=q=>[q[0],q[1],q[2]+(g(q[0],q[1])??0)];
         return interlagosLuz.photo({from:up(p.de),at:up(p.para),fov:p.fov,world:true});}""", {'de': spec['de'], 'para': spec['para'], 'fov': spec.get('fov', 55)})
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
    page.click('#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.()')
    page.wait_for_timeout(4000)
    return page.evaluate("()=>({circuit:interlagos.circuit,extras:interlagos.sceneryInfo().extras??{}})")


def foto(page, nome, spec, sufixo=''):
    posicionar(page, spec)
    page.screenshot(path=str(FOTOS / f'{nome}{sufixo}.png'))
    vis = page.evaluate("()=>{const v=interlagos.sceneryInfo().extras?.Vida_cidade;return v?[v.visible,v.drawsNow,v.trianglesNow]:null}")
    print('foto', nome + sufixo, 'pessoas visíveis, chamadas, triângulos:', vis, flush=True)
    if vis:
        desenhos.append((nome + sufixo, vis[1], vis[2]))
    if '--custo' in flags:
        c = page.evaluate("async()=>{const c=await interlagosGraficos.cost(8);return {vida:c.parts['Vida_cidade']??null};}")
        print('   custo', nome + sufixo, json.dumps(c, ensure_ascii=False), flush=True)


VIZINHOS = {'city-race.js': ('createCityRace', 'Corrida_na_cidade'), 'city-traffic.js': ('createCityTraffic', 'Transito_cidade')}


def vizinho(route):
    """Um módulo irmão (outro construtor) no meio de uma edição, sem a sua função: um esboço no lugar, só neste teste."""
    nome = route.request.url.split('?')[0].rsplit('/', 1)[-1]
    funcao, raiz = VIZINHOS[nome]
    resposta = route.fetch()
    corpo = resposta.text()
    if f'function {funcao}' in corpo:
        route.fulfill(response=resposta, body=corpo)
        return
    print(f'esboço no lugar de {nome} (sem {funcao})', flush=True)
    route.fulfill(status=200, content_type='text/javascript', body=f"import * as THREE from 'three';\nexport function {funcao}(){{const root=new THREE.Group();root.name='{raiz}';return {{root,stats:{{stub:true}}}};}}\n")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    for arquivo in VIZINHOS:
        page.route(f'**/teste/{arquivo}*', vizinho)
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: print('console', m.type, m.text[:4000] if 'Shader' in m.text or 'shader' in m.text else m.text[:300], flush=True) if m.type in ('error', 'warning') else None)
    info = abrir(page, 'floripa')
    assert info['circuit'] == 'floripa', info
    st = info['extras'].get('Vida_cidade')
    resumo = {k: v for k, v in (st or {}).items() if k not in ('where',)}
    print('Vida_cidade', json.dumps(resumo, ensure_ascii=False), flush=True)
    falhas = []
    assert st and not st.get('stub'), 'city-life.js ainda é o esboço'
    leve = '--leve' in flags
    for chave in ('people', 'walkers', 'lanes', 'tables', 'chairs', 'vendors', 'shelters', 'waiting') if not leve else ('people', 'walkers'):
        if not st.get(chave, 0) > 0:
            falhas.append(f'sem {chave}')
    if not leve and not st.get('dogs', 0) > 0:
        falhas.append('sem cachorros')
    lugares = page.evaluate("()=>interlagos.sceneryInfo().extras?.Vida_cidade?.where??{}")
    for k, q in enumerate((lugares.get('boteco') or [])[:5]):
        x, y, a = q
        import math
        fx, fy = math.cos(a), math.sin(a)  # para a fachada
        FOTOS_VIDA.append((f'boteco_{k}', {'de': [x - fx * 7 - fy * 6, y - fy * 7 + fx * 6, 2.0], 'para': [x, y, 0.8], 'fov': 55}))
    for k, q in enumerate((lugares.get('vendor') or [])[:6]):
        kind, x, y, a = q
        import math
        fx, fy = math.cos(a), math.sin(a)
        FOTOS_VIDA.append((f'vendor_{k}', {'de': [x - fx * 6 + fy * 4, y - fy * 6 - fx * 4, 1.9], 'para': [x, y, 1.0], 'fov': 55}))
    for k, q in enumerate((lugares.get('stop') or [])[:3]):
        x, y, a = q
        import math
        fx, fy = math.cos(a), math.sin(a)  # para a rua
        FOTOS_VIDA.append((f'stop_{k}', {'de': [x + fx * 6 - fy * 5, y + fy * 6 + fx * 5, 1.8], 'para': [x, y, 1.0], 'fov': 55}))
    for k, q in enumerate((lugares.get('lane') or [])[:5]):
        x0, y0, x1, y1, nx, ny = q  # do meio da calçada, olhando ao longo dela
        FOTOS_VIDA.append((f'calcada_{k}', {'de': [x0 - nx * .6, y0 - ny * .6, 1.65], 'para': [x1, y1, 1.1], 'fov': 55}))
    # Da pista: a câmera de perseguição chegando aos botecos e ambulantes mais perto da volta.
    perto = page.evaluate("""w=>{const a=interlagos.car.a,out=[];for(const q of [...(w.boteco||[]),...(w.vendor||[]).map(v=>v.slice(1))]){
     let b=1e9,s=0;for(const p of a){const d=Math.hypot(p[1]-q[0],p[2]-q[1]);if(d<b){b=d;s=p[0];}}if(b<70)out.push([s,b]);}return out.sort((x,y)=>x[1]-y[1]).slice(0,4);}""", lugares)
    for k, (s, _) in enumerate(perto):
        FOTOS_VIDA.append((f'perto_{k}', {'s': max(0, s - 30)}))
    for nome, spec in FOTOS_VIDA:
        if ESCOLHA and nome not in ESCOLHA and nome.split('_')[0] not in ESCOLHA:
            continue
        foto(page, nome, spec)
    if '--noite' in flags:
        page.evaluate("interlagosClima.set({time:'noite'});true")
        wait_js(page, '!window.interlagosClima.info().compiling', timeout=120000)
        page.evaluate('interlagosClima.settle?.();true')
        page.wait_for_timeout(2500)
        noite = page.evaluate("()=>interlagos.sceneryInfo().extras?.Vida_cidade")
        print('noite', json.dumps({k: noite.get(k) for k in ('night', 'visible')}), flush=True)
        for nome, spec in FOTOS_VIDA:
            if nome in NOITE:
                foto(page, nome, spec, '_noite')
        page.evaluate("interlagosClima.set({time:'dia'});true")
        page.wait_for_timeout(1500)
    if '--chuva' in flags:
        page.evaluate("interlagosClima.set({rain:'chuva'});true")
        wait_js(page, '!window.interlagosClima.info().compiling', timeout=120000)
        page.wait_for_timeout(3500)
        chuva = page.evaluate("()=>interlagos.sceneryInfo().extras?.Vida_cidade")
        print('chuva', json.dumps({k: chuva.get(k) for k in ('rain', 'visible')}), flush=True)
        if not chuva.get('rain'):
            falhas.append('a vida não viu a chuva')
        for nome, spec in FOTOS_VIDA:
            if nome in CHUVA:
                foto(page, nome, spec, '_chuva')
        page.evaluate("interlagosClima.set({rain:'seco'});true")
    page.evaluate('interlagosLuz.photo(null);true')
    if '--sem-outro' not in flags:
        sem = abrir(page, 'minhocao')
        assert sem['circuit'] == 'minhocao', sem
        assert 'Vida_cidade' not in sem['extras'], f"o Minhocão montou a vida da cidade: {list(sem['extras'])}"
        print('Minhocão sem a vida da cidade:', list(sem['extras']), flush=True)
    browser.close()
if desenhos:
    pior = max(desenhos, key=lambda d: d[1])
    print('mais chamadas numa foto:', pior, 'mais triângulos:', max(desenhos, key=lambda d: d[2]), flush=True)
    if pior[1] > 15:
        falhas.append(f'chamadas demais em {pior[0]}: {pior[1]}')
assert not erros, erros
assert not falhas, falhas
print(json.dumps({'passed': True, 'vida': resumo}, ensure_ascii=False))
