"""A multiplayer room (two windows of one browser, &local=1) with each pilot's own look and a pilot out of his car:
each pilot races in the look saved on his Visual screen, and the other window dresses his driver at the wheel in it;
mid-race the guest gets out (F): the host's window shows her on foot, in her look, her driver's seat empty and her
car's driver's door open, and her chat line reaches it (its balloon goes over her while she is out); back in, she is
gone from the road and the door shuts. Usage: verificar_sala_a_pe.py [porta] (a game server there, servidor.py). Screens in the
shots folder (INTERLAGOS_SHOTS, else the temp folder)."""
import json
import os
import random
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, start_race

PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/?intro=0&cinema=off'
ROOM = f'ape{random.randrange(10**6)}'
SHOTS = Path(os.environ.get('INTERLAGOS_SHOTS') or tempfile.gettempdir()) / 'verificar_sala_a_pe'
SHOTS.mkdir(parents=True, exist_ok=True)
# Each pilot's look (pilot-look.js), saved in this browser as the Visual screen saves it.
LOOKS = {'ana': {'gender': 'homem', 'suit': 'verde', 'gloves': 'branca', 'hair': 'curto', 'hairColor': 'preto', 'beard': 'bigode', 'helmet': 'listra', 'helmetColor': 'branco', 'helmetDetail': 'verde', 'visor': 'azul'},
         'bia': {'gender': 'mulher', 'suit': 'roxo', 'gloves': 'amarela', 'hair': 'rabo', 'hairColor': 'ruivo', 'beard': 'sem', 'helmet': 'topo', 'helmetColor': 'rosa', 'helmetDetail': 'roxo', 'visor': 'dourada'}}
KEY = lambda look: '|'.join(look[k] for k in ('gender', 'suit', 'gloves', 'hair', 'hairColor', 'beard', 'helmet', 'helmetColor', 'helmetDetail', 'visor'))
DOOR_BIT = 1 << 3   # car-openings.js SHARED_OPENINGS: the driver's door
errors, report = [], {}


def watch(page, name):
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 900, 'height': 520})
    context.add_init_script("try{localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,laps:2,camera:'chase'}));localStorage.setItem('autopobre-visual-v1',JSON.stringify({pilots:" + json.dumps(LOOKS) + "}));}catch{}")
    host = context.new_page()
    watch(host, 'host')
    host.goto(f'{URL}#desafio={ROOM}&local=1', wait_until='load')
    wait_js(host, "window.interlagosSala?.info().role==='host'&&window.interlagos&&!document.querySelector('#start').disabled", timeout=60000)
    host.fill('#pilotName', 'Ana')
    host.evaluate("()=>localStorage.setItem('autopobre-pilots-v1',JSON.stringify({selected:'Bia',names:['Bia']}))")
    with context.expect_page() as popup:
        host.evaluate("url=>{window.open(url,'_blank','popup,noopener,width=900,height=520');}", f'{URL}#desafio={ROOM}&local=1&carro=64')
    guest = popup.value
    watch(guest, 'guest')
    guest.wait_for_load_state('load')
    wait_js(guest, "window.interlagosSala?.info().role==='guest'&&interlagosSala.info().number==='64'&&!document.querySelector('#cars').classList.contains('hidden')", timeout=90000)
    guest.click('#carsNext')
    wait_js(host, "interlagosSala.info().members.some(m=>m.name==='Bia'&&m.wait)", timeout=20000)
    host.click('#start')
    wait_js(host, "!document.querySelector('#cars').classList.contains('hidden')", timeout=20000)
    host.click('#carsNext')
    start_race(host, '#singleRace')
    wait_js(host, "interlagosSala.info().phase==='waiting'&&!document.querySelector('#mpStart').hidden", timeout=240000)
    gid = guest.evaluate('interlagosSala.info().id')
    wait_js(host, f"interlagosSala.info().ready.includes({gid!r})", timeout=240000)
    host.click('#mpStart')
    for page in (host, guest):
        wait_js(page, "interlagosSala.info().phase==='racing'&&window.interlagos?.ready&&document.querySelector('#raceCountdown').hidden", timeout=90000)

    # Each window dresses the other's driver at the wheel in the other's own look.
    wait_js(host, f"interlagosSala.info().drivers.some(d=>d.number==='64'&&d.look==={KEY(LOOKS['bia'])!r})", timeout=15000)
    hnum = host.evaluate('interlagosSala.info().number')
    wait_js(guest, f"interlagosSala.info().drivers.some(d=>d.number==={hnum!r}&&d.look==={KEY(LOOKS['ana'])!r})", timeout=15000)
    report['pilotos_no_carro'] = 'ok'

    # The guest gets out: the host sees her on foot, in her look, by her car with its door open.
    guest.keyboard.press('KeyF')
    wait_js(guest, "interlagos.walkInfo()?.active===true", timeout=60000)
    wait_js(host, f"interlagosSala.info().walkers.some(w=>w.number==='64'&&w.look==={KEY(LOOKS['bia'])!r})", timeout=15000)
    wait_js(host, f"interlagosSala.info().parts.some(p=>p.number==='64'&&(p.mask&{DOOR_BIT}))", timeout=15000)
    host.wait_for_timeout(1500)
    info = host.evaluate("interlagosSala.info()")
    hero = guest.evaluate("interlagos.walkInfo().hero")
    walker = next(w for w in info['walkers'] if w['number'] == '64')
    gap = ((walker['x'] - hero[0]) ** 2 + (walker['y'] + hero[2]) ** 2) ** .5
    assert gap < 2, f'the host shows her where she stands ({gap:.2f} m off)'
    report['a_pe'] = {'distancia_do_mostrado_m': round(gap, 2), 'porta': next(p['open'] for p in info['parts'] if p['number'] == '64')}
    # Her chat line reaches the host (its balloon over her: multiplayer.js chatAnchor).
    guest.keyboard.press('t')
    wait_js(guest, "document.activeElement?.id==='mpChatText'", timeout=5000)
    guest.keyboard.type('olha o capô')
    guest.keyboard.press('Enter')
    wait_js(host, "interlagosSala.info().chat.lines.some(l=>l.text==='olha o capô')", timeout=10000)
    host.wait_for_timeout(400)
    host.screenshot(path=str(SHOTS / '1_anfitriao_ve_a_pe.png'))
    guest.screenshot(path=str(SHOTS / '1_convidada_a_pe.png'))

    # Back in: gone from the road, the door shuts.
    guest.keyboard.press('KeyF')
    wait_js(guest, "interlagos.walkInfo()?.active===false", timeout=60000)
    wait_js(host, "!interlagosSala.info().walkers.some(w=>w.number==='64')", timeout=15000)
    wait_js(host, f"interlagosSala.info().parts.some(p=>p.number==='64'&&!(p.mask&{DOOR_BIT})&&!p.open.length)", timeout=20000)
    report['de_volta'] = 'ok'
    browser.close()

assert not errors, errors
report['shots'] = str(SHOTS)
print(json.dumps(report, indent=1, ensure_ascii=False))
print('verificar_sala_a_pe: ok')
