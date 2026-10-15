"""Multiplayer: leaving the room's race, and the races a room does not take over (teste/multiplayer.js
hostRace, main.js fullGrid). Two windows of one browser (&local=1): the host takes the 73 and holds
Corrida única on the grid; the guest (the 64), let in, lands on the car screen, says it waits for
the start and is seated in that race and loads it. While the race still waits, the guest leaves it:
back on its car screen, no longer waiting, its seat given up (the host's 64 a bot again). Waiting
again, it is seated again and loads the race once more. Then it leaves for Modo História (the 99
with the story's own field: no second 99, the 73's driver racing). Then the host leaves its race
for the recon lap: the 99 tours with the whole field, and the 73 is a bot again, not a frozen
remote car under the host's name.

Usage, from the repo root with the local server running: verificar_multiplayer_fora.py [porta]
(INTERLAGOS_SHOTS=pasta keeps the screenshots)."""
import json
import os
import random
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, choose_race

PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
SHOTS = Path(os.environ.get('INTERLAGOS_SHOTS') or tempfile.gettempdir()) / 'verificar_multiplayer_fora'
SHOTS.mkdir(parents=True, exist_ok=True)
ROOM = f'fora{random.randrange(10**6)}'
OPENING = "window.interlagos&&!document.querySelector('#start').disabled&&!document.querySelector('#pilotName').hidden"
STATE = "({phase:interlagosSala.info().phase,holding:interlagosSala.info().holding,raceId:interlagosSala.info().raceId,car:interlagosCarros.info().raceCar,cars:interlagosSala.info().cars.map(c=>({number:c.number,name:c.name,remote:c.remote}))})"
errors = []


def watch(page, name):
    page.on('pageerror', lambda e: (errors.append(f'{name}: {e}'), print(f'{name}: {e}', flush=True)))
    page.set_default_timeout(120000)


def leave(page, screen='tracks'):
    """Out of the race (the pause menu's way out): the host lands on the track screen, a guest on its
    car screen."""
    page.keyboard.press('Escape')
    wait_js(page, "!document.querySelector('#menu').classList.contains('hidden')", timeout=10000)
    page.click('#leaveRace')
    wait_js(page, f"!document.querySelector('#{screen}').classList.contains('hidden')", timeout=30000)


def wait_for_start(page):
    """The guest's "Aguardar início da corrida" on its car screen."""
    page.click('#carsNext')
    wait_js(page, "interlagosSala.info().waiting", timeout=10000)


def check(context, host):
    report = {}
    host.goto(f'{URL}?intro=0&cinema=off#desafio={ROOM}&local=1', wait_until='load', timeout=120000)
    wait_js(host, "window.interlagosSala?.info().role==='host'&&" + OPENING, timeout=60000)
    host.fill('#pilotName', 'Ana Anfitriã')
    # The guest is another window (a background tab would race in slow motion), noopener so it has its
    # own room identity, with its pilot saved as the last one used.
    host.evaluate("name=>localStorage.setItem('autopobre-pilots-v1',JSON.stringify({selected:name,names:[name]}))", 'Bia Convidada')
    with context.expect_page() as popup:
        host.evaluate("url=>{window.open(url,'_blank','popup,noopener,width=800,height=450');}", f'{URL}?intro=0&cinema=off#desafio={ROOM}&local=1&carro=64')
    guest = popup.value
    watch(guest, 'guest')
    guest.wait_for_load_state('load', timeout=120000)
    wait_js(guest, "window.interlagosSala?.info().role==='guest'&&interlagosSala.info().number==='64'", timeout=60000)
    wait_js(guest, "!document.querySelector('#cars').classList.contains('hidden')", timeout=30000)
    wait_for_start(guest)

    # The host takes the 73 and holds Corrida única on the grid; the guest is seated and loads it.
    host.click('#start')
    host.evaluate("interlagosCarros.pick('73')")
    wait_js(host, "interlagosSala.info().number==='73'", timeout=10000)
    host.click('#carsNext')
    host.click('#singleRace')
    wait_js(host, "interlagosSala.info().phase==='waiting'", timeout=240000)
    guest_id = guest.evaluate('interlagosSala.info().id')
    wait_js(host, f"interlagosSala.info().ready.includes({guest_id!r})", timeout=240000)
    seated = report['seated'] = guest.evaluate(STATE)
    assert seated['phase'] == 'waiting' and seated['car'] == '64', seated

    # 1. The guest leaves the race before the start: back on its car screen, picking again; the host
    # gives its seat to a bot. Waiting again, it is seated again and loads the race once more.
    leave(guest, 'cars')
    left = report['left'] = {**guest.evaluate("({waiting:interlagosSala.info().waiting,race:interlagosSala.info().race,button:document.querySelector('#carsNext').innerText})")}
    guest.screenshot(path=str(SHOTS / '1_convidado_saiu.png'))
    assert not left['waiting'] and left['race'] is None and left['button'].startswith('Aguardar início da corrida'), left
    wait_js(host, f"(()=>{{const s=interlagosSala.info();return s.race.seats.length===1&&!s.ready.includes({guest_id!r})&&s.cars.find(c=>c.number==='64')?.remote===false;}})()", timeout=15000)
    assert host.evaluate("interlagosSala.info().phase") == 'waiting', 'the host still holds its race'
    wait_for_start(guest)
    wait_js(host, f"interlagosSala.info().race.seats.length===2&&interlagosSala.info().ready.includes({guest_id!r})", timeout=240000)
    again = report['again'] = guest.evaluate(STATE)
    assert again['phase'] == 'waiting' and again['raceId'] == seated['raceId'] and again['car'] == '64', again

    # 2. Modo História: the 99 and the story's own field (the 73's driver races, no second 99).
    leave(guest, 'cars')
    choose_race(guest, story=True)
    wait_js(guest, "window.interlagos?.ready&&interlagos.immersiveInfo().active", timeout=180000)
    story = report['story'] = guest.evaluate(STATE)
    numbers = [c['number'] for c in story['cars']]
    guest.screenshot(path=str(SHOTS / '2_convidado_historia.png'))
    assert story['car'] == '99' and story['raceId'] is None, story
    assert '99' not in numbers and '73' in numbers and len(numbers) == len(set(numbers)) == 14, numbers

    # 3. The host leaves its race for the recon lap: the whole field, the 73 a bot like the others.
    leave(host)
    host.click('#tracksBack')
    host.click('#carsBack')
    host.click('#settingsButton')
    host.click('#tab-tour')
    host.click('#tour')
    wait_js(host, "window.interlagos?.ready&&!interlagos.state.paused&&interlagos.state.automatic", timeout=180000)
    host.wait_for_timeout(1500)
    tour = report['tour'] = host.evaluate(STATE)
    host.screenshot(path=str(SHOTS / '3_anfitriao_reconhecimento.png'))
    bot = next((c for c in tour['cars'] if c['number'] == '73'), None)
    assert tour['car'] == '99' and tour['raceId'] is None and tour['phase'] == 'lobby', tour
    assert bot and not bot['remote'] and bot['name'] != 'Ana Anfitriã', bot
    assert not any(c['remote'] for c in tour['cars']), tour['cars']
    assert not errors, errors
    return report


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 800, 'height': 450})
    # (try: a noopener popup first opens about:blank, whose opaque origin has no localStorage)
    context.add_init_script("try{localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,laps:1,camera:'chase'}));}catch{}")
    host = context.new_page()
    watch(host, 'host')
    try:
        report = check(context, host)
    except Exception:
        for i, page in enumerate(context.pages):
            try:
                page.screenshot(path=str(SHOTS / f'falha_{i}.png'))
                print(i, json.dumps(page.evaluate("({sala:window.interlagosSala?.info(),menu:document.querySelector('#menu').className,status:document.querySelector('#status').textContent})"), ensure_ascii=False, default=str)[:1500])
            except Exception as err:
                print(i, 'sem estado:', err)
        raise
    browser.close()

print(json.dumps({'room': ROOM, **report, 'shots': str(SHOTS)}, indent=1, ensure_ascii=False))
print('verificar_multiplayer_fora: ok')
