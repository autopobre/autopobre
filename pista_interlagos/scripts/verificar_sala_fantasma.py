"""A guest whose line stalls goes see-through (the team's wish, 10-07 and 10-26: as ACC and iRacing do; the netcode
study of 10-07, step 3). Two windows of one browser, &local=1, one lap of Interlagos, both on the automatic pilot. Just
after the start the guest's line stalls three times (nothing it sends reaches the room for 0.45 s: a TCP resend held up,
a weak Wi-Fi); the host's window shows her car see-through, in her team's colour, going through the others, and says so
in its snapshot: her own window tells her ("conexão instável") and her car goes through the others there too. Steady
again for 5 s and clear of the other cars, it is solid again on both. Usage: verificar_sala_fantasma.py [porta] (a game
server there, servidor.py). Screens in the shots folder (INTERLAGOS_SHOTS, else the temp folder)."""
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
ROOM = f'fantasma{random.randrange(10**6)}'
SHOTS = Path(os.environ.get('INTERLAGOS_SHOTS') or tempfile.gettempdir()) / 'verificar_sala_fantasma'
SHOTS.mkdir(parents=True, exist_ok=True)
GUEST_CAR = "interlagosSala.info().cars.find(c=>c.number==='64')"
errors, report = [], {}


def watch(page, name):
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 960, 'height': 600})
    context.add_init_script("try{localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,laps:1,camera:'chase'}));}catch{}")
    host = context.new_page()
    watch(host, 'host')
    host.goto(f'{URL}#desafio={ROOM}&local=1&auto=1', wait_until='load')
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
    wait_js(host, "interlagosSala.info().phase==='waiting'&&!document.querySelector('#mpStart').hidden", timeout=240000)
    gid = guest.evaluate('interlagosSala.info().id')
    wait_js(host, f"interlagosSala.info().ready.includes({gid!r})", timeout=240000)
    host.click('#mpStart')
    for page in (host, guest):
        wait_js(page, "interlagosSala.info().phase==='racing'&&window.interlagos?.ready&&document.querySelector('#raceCountdown').hidden", timeout=90000)
    host.wait_for_timeout(2500)
    assert not host.evaluate(f"{GUEST_CAR}.netGhost"), 'a steady line: solid'

    # Her line stalls three times: nothing she sends reaches the room for 0.45 s each time.
    guest.evaluate("()=>{const send=BroadcastChannel.prototype.postMessage;BroadcastChannel.prototype.postMessage=function(m){if(!window.__quieta)return send.call(this,m);};}")
    for _ in range(3):
        guest.evaluate("()=>{window.__quieta=true;}")
        guest.wait_for_timeout(450)
        guest.evaluate("()=>{window.__quieta=false;}")
        guest.wait_for_timeout(250)
    wait_js(host, f"{GUEST_CAR}.netGhost&&{GUEST_CAR}.seeThrough", timeout=5000)
    wait_js(guest, "interlagosSala.info().ghostMe&&document.querySelector('#mpRoom .mp-status').textContent.includes('instável')", timeout=5000)
    # (the host on the automatic pilot: N takes its cameras round the other cars, up to hers, for a close look)
    for _ in range(16):
        if host.evaluate("interlagos.watchInfo()?.number==='64'"):
            break
        host.keyboard.press('KeyN')
        host.wait_for_timeout(150)
    host.wait_for_timeout(600)
    host.screenshot(path=str(SHOTS / '1_anfitriao_ve_bia_transparente.png'))
    guest.screenshot(path=str(SHOTS / '1_bia_aviso_conexao.png'))
    seen = host.evaluate(f"{GUEST_CAR}")
    report['fantasma'] = {'anfitriao_ve': seen['seeThrough'], 'aviso_dela': guest.inner_text('#mpRoom .mp-status')}

    # Steady again: solid again once 5 s steady and clear of the other cars, on both windows.
    wait_js(host, f"!{GUEST_CAR}.netGhost&&!{GUEST_CAR}.seeThrough", timeout=60000)
    wait_js(guest, "!interlagosSala.info().ghostMe", timeout=10000)
    report['de_volta'] = 'sólido de novo'
    browser.close()

assert not errors, errors
report['shots'] = str(SHOTS)
print(json.dumps(report, indent=1, ensure_ascii=False))
print('verificar_sala_fantasma: ok')
