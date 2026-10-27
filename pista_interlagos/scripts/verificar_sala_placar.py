"""A multiplayer race's humans' standings and what comes past the flag (two windows of one browser, &local=1, both on
the automatic pilot, one lap of Interlagos): every window shows the humans only, on the right, at their places in the
whole field, its own pilot marked; the first human in has the car taken to the pit lane at once (parked, on its brakes)
and the cameras on the other human still racing (held short of the line meanwhile), N going round the other cars; the result sheet waits for the other
human. Usage: verificar_sala_placar.py [porta] (a game server there, servidor.py). Screens in the shots folder
(INTERLAGOS_SHOTS, else the temp folder)."""
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
ROOM = f'placar{random.randrange(10**6)}'
SHOTS = Path(os.environ.get('INTERLAGOS_SHOTS') or tempfile.gettempdir()) / 'verificar_sala_placar'
SHOTS.mkdir(parents=True, exist_ok=True)
errors, report = [], {}
ROWS = "interlagosSala.info().standings"
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def watch(page, name):
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 900, 'height': 560})
    context.add_init_script("try{localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,laps:1,camera:'chase'}));}catch{}")
    host = context.new_page()
    watch(host, 'host')
    host.goto(f'{URL}#desafio={ROOM}&local=1&auto=1', wait_until='load')
    wait_js(host, "window.interlagosSala?.info().role==='host'&&window.interlagos&&!document.querySelector('#start').disabled", timeout=60000)
    host.fill('#pilotName', 'Ana')
    host.evaluate("()=>localStorage.setItem('autopobre-pilots-v1',JSON.stringify({selected:'Bia',names:['Bia']}))")
    with context.expect_page() as popup:
        host.evaluate("url=>{window.open(url,'_blank','popup,noopener,width=900,height=560');}", f'{URL}#desafio={ROOM}&local=1&auto=1&carro=64')
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
    pages = {'host': host, 'guest': guest}
    for page in pages.values():
        wait_js(page, "interlagosSala.info().phase==='racing'&&window.interlagos?.ready&&document.querySelector('#raceCountdown').hidden", timeout=90000)
    # The humans kept apart at the flag: the room's race ends for everyone once both are in, and closer than the flag's
    # fade nobody would be parked yet (it failed now and then, the two automatic pilots in a few seconds apart). The
    # host's automatic pilot off for its first 12 s.
    host.evaluate("document.getElementById('mpAuto').click()")
    host.wait_for_timeout(12000)
    host.evaluate("document.getElementById('mpAuto').click()")
    assert host.evaluate("document.getElementById('mpAuto').checked")

    # The humans only, at their places in the whole field, this window's own marked.
    for name, page in pages.items():
        wait_js(page, f"{ROWS}.length===2&&!document.getElementById('mpPlacar').hidden", timeout=20000)
    page_rows = {name: page.evaluate(ROWS) for name, page in pages.items()}
    for name, rows in page_rows.items():
        assert sorted(r['name'] for r in rows) == ['Ana', 'Bia'], rows
        assert [r['mine'] for r in rows].count(True) == 1 and next(r for r in rows if r['mine'])['name'] == ('Ana' if name == 'host' else 'Bia'), rows
        assert len({r['position'] for r in rows}) == 2 and all(1 <= r['position'] <= 15 for r in rows), rows
    host.wait_for_timeout(15000)
    for name, page in pages.items():
        page.screenshot(path=str(SHOTS / f'1_{name}_placar.png'))
    report['placar'] = page_rows

    # The first human in: parked in the pit lane at once, the cameras on the other human, N going round. The other is held
    # short of the line meanwhile (its automatic pilot off, braking): two humans in within the flag's fade end the room's
    # race for everyone before anyone is parked, and a slow window's clock makes their gap at the line anything.
    first = None
    for _ in range(3000):
        for name, page in pages.items():
            if page.evaluate("interlagos.immersiveInfo?.().freeFinished??false"):
                first = name
                break
        if first:
            break
        host.wait_for_timeout(100)
    assert first, 'no human in'
    other = 'guest' if first == 'host' else 'host'
    held = pages[other]
    if held.evaluate("document.getElementById('mpAuto').checked"):
        held.evaluate("document.getElementById('mpAuto').click()")
    held.keyboard.down('KeyS')
    done = pages[first]
    try:
        wait_js(done, "!!interlagosSala.info().parked", timeout=60000)
    except Exception:
        # (what each window was doing, for the failure's report)
        for name, page in pages.items():
            print(name, json.dumps(page.evaluate("(()=>{const i=interlagosSala.info(),m=interlagos.immersiveInfo?.()??{};return {phase:i.phase,ended:i.ended,ff:m.freeFinished??null,laps:interlagos.car.laps,speed:Math.hypot(interlagos.car.vx,interlagos.car.vy),cut:i.cut,lost:i.lost,stops:i.stops,status:document.querySelector('#mpRoom .mp-status')?.textContent,results:!document.querySelector('#raceResults').hidden};})()"), ensure_ascii=False))
        print('page errors', errors[:5])
        raise
    done.wait_for_timeout(1500)
    state = done.evaluate("(()=>{const c=interlagos.car;return {speed:Math.hypot(c.vx,c.vy),pit:!!c.surface.pit,watch:interlagos.watchInfo(),me:interlagosSala.info().number};})()")
    other_number = pages[other].evaluate('interlagosSala.info().number')
    assert state['speed'] < 1, state
    still = not pages[other].evaluate('interlagos.immersiveInfo?.().freeFinished??false')
    if still:
        assert state['watch']['number'] == other_number, (state, other_number)
    done.keyboard.press('KeyN')
    done.wait_for_timeout(300)
    after = done.evaluate('interlagos.watchInfo()')
    assert after['number'] != state['watch']['number'], (state, after)
    done.screenshot(path=str(SHOTS / f'2_{first}_assistindo.png'))
    report['no_box'] = {'quem': first, 'parado_kmh': round(state['speed'] * 3.6, 1), 'pit_lane': state['pit'], 'assistia': state['watch']['number'], 'N_trocou_para': after['number']}

    # The result sheets come once the other human is in too (let go, on its automatic pilot again).
    held.keyboard.up('KeyS')
    held.evaluate("document.getElementById('mpAuto').click()")
    for page in pages.values():
        wait_js(page, "!document.querySelector('#raceResults').hidden", timeout=480000)
    for name, page in pages.items():
        page.screenshot(path=str(SHOTS / f'3_{name}_resultado.png'))
    browser.close()

assert not errors, errors
report['shots'] = str(SHOTS)
print(json.dumps(report, indent=1, ensure_ascii=False))
print('verificar_sala_placar: ok')
