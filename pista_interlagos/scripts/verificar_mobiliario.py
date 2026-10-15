"""Mobiliário urbano do Autódromo Floripa (teste/city-furniture.js) no navegador: postes e fiação, semáforos piscando, pontos de
ônibus, placas de rua e o miúdo das calçadas, montados sem erros, e fotos da volta e das calçadas, de dia e de noite.

    python verificar_mobiliario.py [porta] [pasta das fotos] [--sem-fotos] [--sem-outro]

Abre ?circuito=floripa no Treino solo, confere as contagens do módulo (interlagos.sceneryInfo().extras.Mobiliario_urbano),
o custo (malhas mostradas, triângulos, chamadas de desenho), fotografa a câmera de perseguição a cada ~300 m e nas
cabeceiras das pontes, vistas baixas das calçadas (semáforo, ponto de ônibus, placa, banca, orelhão, poste), uma vista alta
e a noite (lâmpadas e o amarelo piscando). Depois confere que um circuito sem cidade (o Minhocão) não monta nada disso.
"""
import json
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8882'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
FOTOS = Path(args[1]) if len(args) > 1 else Path(__file__).resolve().parents[1] / 'renders/floripa_v2/previas/rodada_01/mobiliario'
FOTOS.mkdir(parents=True, exist_ok=True)
erros = []


def abrir(page, circuito):
    page.goto(URL + f'?circuito={circuito}', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    page.click('#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.()')
    page.wait_for_timeout(4000)


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=2000):
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", s)
    camera(page, modo)
    page.wait_for_timeout(espera)


def vista(page, de, para, fov=55, espera=1800):
    """Câmera parada; de/para em coordenadas da pista, z acima do chão de cada ponto."""
    g = page.evaluate("p=>[interlagos.car.terrain(p[0][0],p[0][1]),interlagos.car.terrain(p[1][0],p[1][1])]", [de, para])
    page.evaluate("p=>interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true})",
                  {'de': [de[0], de[1], de[2] + g[0]], 'para': [para[0], para[1], para[2] + g[1]], 'fov': fov})
    page.wait_for_timeout(espera)


def mob(page):
    return page.evaluate("()=>interlagos.sceneryInfo().extras?.Mobiliario_urbano??null")


def foto(page, nome):
    page.screenshot(path=str(FOTOS / f'{nome}.png'))
    m = page.evaluate("()=>{const m=interlagos.sceneryInfo().extras?.Mobiliario_urbano;return {calls:interlagos.state?.drawCalls,shown:m?.shown,tris:m?.shownTriangles}}")
    print('foto', nome, json.dumps(m), flush=True)
    return m


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(300000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: print('console', m.type, m.text[:300], flush=True) if m.type == 'error' else None)
    abrir(page, 'floripa')
    assert page.evaluate('interlagos.circuit') == 'floripa'
    st = mob(page)
    print(json.dumps(st, ensure_ascii=False), flush=True)
    assert st, 'sem Mobiliario_urbano nos extras'
    for chave in ('poles', 'spans', 'cables', 'drops', 'signalPosts', 'signalHeads', 'trackSignals', 'shelters', 'busSigns', 'plates',
                  'bins', 'hydrants', 'bollards', 'parkingSigns', 'benches', 'kiosks', 'orelhoes', 'meshes', 'lampPools'):
        assert (st.get(chave) or 0) > 0, f'{chave} = {st.get(chave)}'
    # Cada semáforo de verdade das ruas da volta ganha o braço sobre a pista (no máximo um sem lugar).
    reais = page.evaluate("()=>interlagos.car.data.scenery.city.track?.signals?.length??0")
    assert st['trackSignals'] >= reais - 1, (st['trackSignals'], reais)
    onde = st['where']
    mostrados = []
    if '--sem-fotos' not in sys.argv:
        # A câmera de perseguição pela volta, a cada ~300 m, e nas cabeceiras das duas pontes.
        L = page.evaluate('interlagos.car.data?.meta?.reconstructed_xy_m??4442')
        for s in [*range(120, int(L), 300), 345, 1860, 3080, 3965]:
            em(page, s)
            mostrados.append(foto(page, f'volta_{s:04d}'))
        # O semáforo da volta, piscando sobre a pista, visto ao chegar.
        if 'trackSignal' in onde:
            # Da pista, 30 m antes, à altura dos olhos de quem pilota.
            x, y, i = onde['trackSignal'][:3]
            p0 = page.evaluate("i=>{const a=interlagos.car.a,p=a[(i-15+a.length)%a.length];return [p[1],p[2]]}", i)
            vista(page, [p0[0], p0[1], 1.3], [x, y, 5.5], 55)
            foto(page, 'semaforo_da_volta')
        # Vistas baixas das calçadas, do lado de quem anda ou espera.
        if 'signal' in onde:
            # Do meio da faixa, como quem chega ao cruzamento (a calçada tem árvores).
            x, y, fx, fy, w, rx, ry = onde['signal'][:7]
            vista(page, [x + rx * w * .45 + fx * 20, y + ry * w * .45 + fy * 20, 1.4], [x + rx * 3, y + ry * 3, 4.5], 50)
            foto(page, 'semaforo_rua_lateral')
        if 'shelter' in onde:
            x, y, ax, ay, bx, by = onde['shelter'][:6]
            vista(page, [x + bx * 7 + ax * 4, y + by * 7 + ay * 4, 1.7], [x + bx * .8, y + by * .8, 1.3])
            foto(page, 'ponto_de_onibus')
        if 'plate' in onde:
            x, y = onde['plate'][:2]
            vista(page, [x + 3, y + 2.5, 1.7], [x, y, 2.7], 50)
            foto(page, 'placa_de_rua')
        if 'kiosk' in onde:
            x, y, fx, fy = onde['kiosk'][:4]
            vista(page, [x + fx * 9 + fy * 3, y + fy * 9 - fx * 3, 1.7], [x + fx, y + fy, 1.3])
            foto(page, 'banca')
        if 'orelhao' in onde:
            x, y, nx, ny = onde['orelhao'][:4]
            vista(page, [x - nx * 3.5 + ny * 1.5, y - ny * 3.5 - nx * 1.5, 1.6], [x, y, 1.7], 50)
            foto(page, 'orelhao')
        for chave in ('lapPole', 'pole'):
            if chave in onde:
                x, y, h = onde[chave][:3]
                ux, uy = math.cos(h), math.sin(h)
                vista(page, [x + ux * 6 + uy * 9, y + uy * 6 - ux * 9, 1.7], [x - uy * 4, y + ux * 4, 7], 55)
                foto(page, f'poste_{chave}')
        if 'pole' in onde:
            x, y = onde['pole'][:2]
            vista(page, [x - 160, y - 220, 120], [x, y, 0], 50)
            foto(page, 'alto')
        # A noite: as lâmpadas de LED (e as de sódio antigas), a luz no chão e o amarelo piscando.
        page.evaluate("interlagosClima.set({time:'noite'})")
        wait_js(page, '!window.interlagosClima.info().compiling', timeout=120000)
        page.wait_for_timeout(2000)
        for s in (870, 1025, 3550):
            em(page, s)
            foto(page, f'noite_{s:04d}')
        if 'signal' in onde:
            x, y, fx, fy, w, rx, ry = onde['signal'][:7]
            vista(page, [x + rx * w * .45 + fx * 20, y + ry * w * .45 + fy * 20, 1.4], [x + rx * 3, y + ry * 3, 4.5], 50)
            foto(page, 'noite_rua_lateral')
        page.evaluate("interlagosClima.set({time:'dia'})")
    # O custo: malhas do módulo na tela e, por quadro, as chamadas de desenho e os triângulos dele em todos os passes
    # (a imagem, a sombra do sol e as capturas de reflexo dos carros), em três pontos da volta (perf-probe.js).
    if mostrados:
        print('malhas mostradas: max', max(m['shown'] for m in mostrados), 'triangulos max', max(m['tris'] for m in mostrados), flush=True)
    for s in (420, 1020, 3550):
        em(page, s, espera=1500)
        custo = page.evaluate("async()=>{const c=await interlagosGraficos.cost(12);const m=Object.entries(c.materials).filter(([k])=>k.startsWith('Mobiliario'));return {total:c.parts['Mobiliario_urbano'],materiais:Object.fromEntries(m)}}")
        print('custo', s, json.dumps(custo, ensure_ascii=False), flush=True)
        assert custo['total']['calls'] <= 30, custo
    # Um circuito de rua sem data.scenery.city (o Minhocão): nada deste módulo.
    if '--sem-outro' not in sys.argv:
        abrir(page, 'minhocao')
        extras = page.evaluate("()=>Object.keys(interlagos.sceneryInfo().extras??{})")
        print('Minhocão extras', extras, flush=True)
        assert 'Mobiliario_urbano' not in extras, extras
    browser.close()
assert not erros, erros
print(json.dumps({'passed': True, 'stats': {k: st[k] for k in ('poles', 'lapPoles', 'spans', 'cables', 'drops', 'signalPosts', 'trackSignals', 'shelters', 'plates', 'meshes', 'triangles')}}, ensure_ascii=False))
