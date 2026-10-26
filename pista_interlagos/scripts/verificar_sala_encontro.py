"""The room's meeting at the Tia's café in the Box 99 (the team's wish, 10-26), in two windows of one browser
(&local=1, one lap of Interlagos): while the start waits both pilots are on foot by the café, apart, the frozen 3 off
the screen, each seeing the other (in the same clothes on either screen); the guest walks to the counter, opens the Tia's menu (E), buys a coffee and a pão
de queijo (1, 2) from the team's money, sips (E), and the host sees them in her hands; F there only says who calls
everyone to the cars. The host's Todos para os carros puts each pilot in their car on the grid for the 3, 2, 1 (hands
empty). Past her flag (the guest on the automatic pilot) F takes her to the café, the host sees her there, and F
again back to the cameras on the race. Usage: verificar_sala_encontro.py [porta] (a game server there,
servidor.py). Screens in the shots folder (INTERLAGOS_SHOTS, else the temp folder)."""
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
ROOM = f'encontro{random.randrange(10**6)}'
SHOTS = Path(os.environ.get('INTERLAGOS_SHOTS') or tempfile.gettempdir()) / 'verificar_sala_encontro'
SHOTS.mkdir(parents=True, exist_ok=True)
WALK = 'interlagos.walkInfo()'
errors, report = [], {}


def watch(page, name):
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))


def walk(page):
    return page.evaluate(WALK)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 960, 'height': 600})
    context.add_init_script("try{localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,laps:1,camera:'chase'}));}catch{}")
    host = context.new_page()
    watch(host, 'host')
    host.goto(f'{URL}#desafio={ROOM}&local=1', wait_until='load')
    wait_js(host, "window.interlagosSala?.info().role==='host'&&window.interlagos&&!document.querySelector('#start').disabled", timeout=60000)
    host.fill('#pilotName', 'Ana')
    host.evaluate("()=>localStorage.setItem('autopobre-pilots-v1',JSON.stringify({selected:'Bia',names:['Bia']}))")
    with context.expect_page() as popup:
        host.evaluate("url=>{window.open(url,'_blank','popup,noopener,width=960,height=600');}", f'{URL}#desafio={ROOM}&local=1&auto=1&carro=64')
    guest = popup.value
    watch(guest, 'guest')
    guest.wait_for_load_state('load')
    wait_js(guest, "window.interlagosSala?.info().number==='64'&&!document.querySelector('#cars').classList.contains('hidden')", timeout=90000)
    guest.click('#carsNext')
    wait_js(host, "interlagosSala.info().members.some(m=>m.name==='Bia'&&m.wait)", timeout=20000)
    host.click('#start')
    wait_js(host, "!document.querySelector('#cars').classList.contains('hidden')", timeout=20000)
    host.click('#carsNext')
    start_race(host, '#singleRace')

    # While the start waits: both on foot by the café, apart, each seeing the other, no frozen 3.
    for page in (host, guest):
        wait_js(page, f"interlagosSala.info().phase==='waiting'&&{WALK}?.active===true&&!!{WALK}.away", timeout=240000)
    gid = guest.evaluate('interlagosSala.info().id')
    wait_js(host, f"interlagosSala.info().ready.includes({gid!r})", timeout=240000)
    wait_js(host, "interlagosSala.info().walkers.some(w=>w.number==='64')", timeout=15000)
    hnum = host.evaluate('interlagosSala.info().number')
    wait_js(guest, f"interlagosSala.info().walkers.some(w=>w.number==={hnum!r})", timeout=15000)
    a, b = walk(host), walk(guest)
    apart = ((a['hero'][0] - b['hero'][0]) ** 2 + (a['hero'][2] - b['hero'][2]) ** 2) ** .5
    assert apart > .8, f'each at a spot of their own ({apart:.2f} m)'
    assert a['cafe']['distance'] < 8 and b['cafe']['distance'] < 8, (a['cafe'], b['cafe'])
    assert host.evaluate("document.body.classList.contains('mp-encontro')&&getComputedStyle(document.getElementById('raceCountdown')).visibility==='hidden'"), 'no frozen 3 meanwhile'
    assert 'Todos para os carros' in host.inner_text('#mpStart'), host.inner_text('#mpStart')
    assert a['cafe']['wallet'] == 450, a['cafe']
    # Without a look of her own, Bia wears her car's team colours: the same on the host's screen as on her own (the
    # team's report, 10-26: orange on hers, the 99's red on the host's).
    own_top = guest.evaluate("JSON.parse(interlagos.walker().outfitKey).top")
    seen_top = host.evaluate("interlagosSala.info().walkers.find(w=>w.number==='64').top")
    assert own_top == seen_top and own_top != host.evaluate("JSON.parse(interlagos.walker().outfitKey).top"), (own_top, seen_top)
    report['encontro'] = {'distancia_entre_eles_m': round(apart, 2), 'ana_do_balcao_m': round(a['cafe']['distance'], 2), 'bia_do_balcao_m': round(b['cafe']['distance'], 2)}

    # The guest at the counter: the menu, a coffee and a pão de queijo, a sip; the host sees them in her hands.
    guest.keyboard.down('KeyW')
    try:
        wait_js(guest, f"{WALK}.cafe.near", timeout=8000)
    finally:
        guest.keyboard.up('KeyW')
    guest.wait_for_timeout(300)
    guest.keyboard.press('KeyE')
    wait_js(guest, f"{WALK}.cafe.menu&&!document.getElementById('walkMenu').hidden", timeout=5000)
    guest.keyboard.press('Digit1')
    guest.keyboard.press('Digit2')
    wait_js(guest, f"{WALK}.cafe.held.length===2", timeout=5000)
    bought = walk(guest)['cafe']
    assert [h[0] for h in bought['held']] == ['cafe', 'pao'] and abs(bought['wallet'] - 440) < .01, bought
    guest.screenshot(path=str(SHOTS / '1_bia_cardapio.png'))
    guest.keyboard.press('KeyE')
    wait_js(guest, f"!{WALK}.cafe.menu", timeout=5000)
    guest.keyboard.press('KeyE')
    wait_js(guest, f"{WALK}.cafe.eating", timeout=3000)
    wait_js(host, "interlagosSala.info().walkers.some(w=>w.number==='64'&&w.held.length===2)", timeout=10000)
    seen = host.evaluate("interlagosSala.info().walkers.find(w=>w.number==='64')")
    assert sorted(h[0] for h in seen['held']) == ['cafe', 'pao'], seen
    guest.keyboard.press('KeyF')
    wait_js(guest, f"{WALK}.message.includes('anfitrião')", timeout=3000)
    assert walk(guest)['active'], 'F at the meeting: still on foot'
    host.wait_for_timeout(800)
    host.screenshot(path=str(SHOTS / '2_ana_ve_bia_no_cafe.png'))
    guest.screenshot(path=str(SHOTS / '2_bia_no_cafe.png'))
    report['lanche'] = {'comprou': bought['held'], 'verba': bought['wallet'], 'anfitria_ve': seen['held']}

    # A change of clothes while the start waits (the team's wish, 10-26): V opens the Visual screen over the meeting, a
    # purple suit chosen there shows on the host's screen at once, and back at the café she wears it.
    guest.keyboard.press('KeyV')
    wait_js(guest, "interlagosVisual.info().screen==='visual'&&document.body.classList.contains('visual-open')&&interlagosVisual.info().from==='cafe'", timeout=10000)
    assert walk(guest)['active'], 'still on foot at the café behind the Visual screen'
    guest.evaluate("()=>{const i=document.querySelector('#visual [data-field=\"suit\"] input[value=\"roxo\"]');i.click();}")
    wait_js(guest, "interlagosVisual.info().look?.suit==='roxo'", timeout=5000)
    guest.wait_for_timeout(1200)
    guest.screenshot(path=str(SHOTS / '2_bia_trocando_de_roupa.png'))
    wait_js(host, "(()=>{const w=interlagosSala.info().walkers.find(w=>w.number==='64');return !!w&&w.look.includes('roxo');})()", timeout=10000)
    guest.click('#visualDone')
    wait_js(guest, "interlagosVisual.info().screen!=='visual'&&!document.body.classList.contains('visual-open')", timeout=5000)
    assert walk(guest)['active'] and walk(guest)['away'], 'back at the café'
    new_top = guest.evaluate("JSON.parse(interlagos.walker().outfitKey).top")
    seen_new = host.evaluate("interlagosSala.info().walkers.find(w=>w.number==='64').top")
    assert new_top != own_top and new_top == seen_new, (own_top, new_top, seen_new)
    host.wait_for_timeout(600)
    host.screenshot(path=str(SHOTS / '2_ana_ve_bia_de_roxo.png'))
    report['troca_de_roupa'] = {'antes': own_top, 'depois': new_top}

    # Everyone to the cars: each pilot in their car on the grid for the 3, 2, 1, hands empty.
    host.click('#mpStart')
    for page in (host, guest):
        wait_js(page, f"interlagosSala.info().phase==='racing'&&{WALK}?.active===false", timeout=30000)
    for page in (host, guest):
        wait_js(page, "window.interlagos?.ready&&document.querySelector('#raceCountdown').hidden&&!document.body.classList.contains('mp-encontro')", timeout=60000)
    assert walk(guest)['cafe']['held'] == [], 'nothing in hand at the wheel'
    report['largada'] = 'ok'

    # Past her flag: F to the café (the host sees her there), F back to the cameras on the race.
    wait_js(guest, "interlagosSala.info().parked===true", timeout=400000)
    guest.keyboard.press('KeyF')
    wait_js(guest, f"{WALK}?.active===true&&({WALK}.away||'').includes('LANCHONETE')", timeout=10000)
    wait_js(host, "interlagosSala.info().walkers.some(w=>w.number==='64')", timeout=10000)
    assert 'lanchonete' in guest.inner_text('#mpRoom .mp-status').lower(), guest.inner_text('#mpRoom .mp-status')
    guest.wait_for_timeout(800)
    guest.screenshot(path=str(SHOTS / '3_bia_terminou_no_cafe.png'))
    guest.keyboard.press('KeyF')
    wait_js(guest, f"{WALK}?.active===false&&interlagos.watchInfo()?.number==={hnum!r}", timeout=10000)
    report['depois_da_bandeirada'] = 'café e de volta às câmeras'
    browser.close()

assert not errors, errors
report['shots'] = str(SHOTS)
print(json.dumps(report, indent=1, ensure_ascii=False))
print('verificar_sala_encontro: ok')
