"""Chapada dos Sonhos no navegador: carrega sem erros, paredao, beirada e vale montados, queda e volta a pista.

    python verificar_chapada.py [porta] [pasta das fotos]

Abre o circuito pelo seletor (?circuito=chapada) no Treino solo, confere o cenario (paredao, aneis do vale,
arvores, arquibancadas, nada de pista do lado do abismo), fotografa a pista em varios pontos e cameras e joga o
carro para fora da beirada: ele cai, a camera fica na beirada, e alguns segundos depois o carro volta a pista,
parado, com a volta fora do recorde. Fotos em renders/chapada_*.png (ou na pasta dada).
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js

PORTA = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
FOTOS = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[1] / 'renders'
FOTOS.mkdir(parents=True, exist_ok=True)
erros = []


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=1800):
    """O carro parado na estacao mais proxima de s (m da volta), na camera dada."""
    page.evaluate("s=>{const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", s)
    camera(page, modo)
    page.wait_for_timeout(espera)


def foto(page, nome):
    page.screenshot(path=str(FOTOS / f'chapada_{nome}.png'))
    print('foto', nome, flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: print('console', m.type, m.text, flush=True) if m.type in ('error', 'warning') else None)
    page.goto(URL + '?circuito=chapada', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    assert page.get_attribute('[data-circuit="chapada"]', 'aria-pressed') == 'true'
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    page.click('#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.()')
    page.wait_for_timeout(5000)
    info = page.evaluate("()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'chapada', info
    sc = info['scenery']
    print(json.dumps({k: sc.get(k) for k in ('trees', 'houses', 'fans', 'chunks', 'circuit', 'far', 'stands')}, ensure_ascii=False), flush=True)
    assert sc['circuit']['cliff']['edge'] > 1000, sc['circuit']
    assert sc['far'] and sc['far']['vertices'] > 100000, sc.get('far')
    foto(page, 'largada')
    # A pista: a curva 1 de frente para o abismo, o paredao leste, o bico, a borda sul, o S do Mirante.
    for s, modo, nome in [(560, 'chase', 'curva1_chegada'), (700, 'far', 'curva1'), (1150, 'chase', 'paredao_leste'),
                          (1560, 'chase', 'bico_chegada'), (1640, 'aerial', 'bico_alto'), (2200, 'chase', 'borda_sul'),
                          (2200, 'cockpit', 'borda_sul_cockpit'), (2200, 'far', 'borda_sul_longe'), (2620, 'chase', 's_mirante'),
                          (3300, 'chase', 'borda_oeste'), (3300, 'orbit', 'borda_oeste_orbita')]:
        em(page, s, modo)
        foto(page, nome)
    # Quedas em cinco pontos da beirada: virado 26 graus para o abismo a 90 km/h, sem ninguem no volante. O carro
    # cai, explode la embaixo (em camera lenta) e volta a pista; a camera nunca fica atras do relevo ou das copas.
    resumo = {}
    for s, nome in [(2200, 'borda_sul'), (1150, 'paredao_leste'), (1660, 'bico'), (2760, 's_mirante'), (3300, 'borda_oeste')]:
        em(page, s, 'chase', 800)
        page.evaluate("""()=>{const c=interlagos.car;c.heading+=.45;c.vx=25*Math.cos(c.heading);c.vy=25*Math.sin(c.heading);c.stepX=c.x;c.stepY=c.y;}""")
        estados, impacto, inicio, n = [], None, None, 0
        for k in range(80):
            page.wait_for_timeout(250)
            e = page.evaluate("()=>{const c=interlagos.car,f=interlagos.fallInfo();return {fall:!!c.fall,hit:!!c.fall?.hit,falls:c.falls??0,lapFell:!!c.lapFell,z:+c.z.toFixed(1),abyss:!!c.surface.abyss,boom:interlagos.explosionInfo()?.explosions??0,slow:f.timeScale,shot:f.shot,sight:f.sight==null?null:+f.sight.toFixed(1)}}")
            estados.append(e)
            if e['fall'] and inicio is None:
                inicio = k
            if e['hit'] and impacto is None:
                impacto = k
            if k in ([inicio + 3] if inicio is not None else []) + ([impacto + d for d in (2, 5, 9)] if impacto is not None else []):
                foto(page, f'queda_{nome}_{n}')
                n += 1
            if e['falls'] and not e['fall'] and impacto is not None and k > impacto + 6:
                break
        apos = [e['sight'] for e in estados if e['shot'] and e['sight'] is not None]
        antes = [e['sight'] for e in estados if e['fall'] and not e['shot'] and e['sight'] is not None]
        resumo[nome] = {'impacto': impacto, 'explosoes': estados[-1]['boom'], 'visivel_explosao': f"{sum(v >= -.5 for v in apos)}/{len(apos)}",
                        'visivel_queda': f"{sum(v >= -1 for v in antes)}/{len(antes)}", 'pior': min(apos + antes) if apos + antes else None}
        print(nome, json.dumps(resumo[nome]), flush=True)
        assert impacto is not None, f'{nome}: o carro bateu la embaixo'
        assert max(e['z'] for e in estados) < 520, f'{nome}: o carro nunca sobe acima da pista'
        assert any(e['slow'] < .5 for e in estados), f'{nome}: camera lenta no impacto'
        assert apos and sum(v >= -.5 for v in apos) >= .9 * len(apos), f'{nome}: a explosao fica a vista'
        assert estados[-1]['lapFell'] and not estados[-1]['abyss'], f'{nome}: de volta a pista'
    assert page.evaluate('interlagos.explosionInfo().explosions') >= 5
    browser.close()
assert not erros, erros
print(json.dumps({'passed': True}, ensure_ascii=False))
