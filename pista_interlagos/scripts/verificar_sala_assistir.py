"""A host who only watches its room's race (Só assistir; the team's wish, 10-26). Two windows of one browser (&local=1),
one lap of Interlagos: the host picks Só assiste on the track screen (its room line's box ticked while the race waits),
the guest races on the automatic pilot. While she still picks her car the host's start waits, saying so (Enter too). From
the start the host's car is parked in the pit lane, out of sight and touching nothing on both screens, and the host's
cameras follow the guest; its room line says it watches, with Encerrar corrida at hand, nothing of its own car shows
(lap, place, fuel, its tools) and its keys move nothing (W held: still on its spot, no lap of its own). The guest in, the race is over for everyone: the host's sheet says it watched (no row of
its own) and has her own time, never an estimate; the guest's has no row for the host's car. Usage:
verificar_sala_assistir.py [porta] (a game server there, servidor.py). Screens in the shots folder (INTERLAGOS_SHOTS,
else the temp folder)."""
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
ROOM = f'assiste{random.randrange(10**6)}'
SHOTS = Path(os.environ.get('INTERLAGOS_SHOTS') or tempfile.gettempdir()) / 'verificar_sala_assistir'
SHOTS.mkdir(parents=True, exist_ok=True)
STATUS = "document.querySelector('#mpRoom .mp-status').textContent"
RESULTS = "!document.querySelector('#raceResults').hidden"
ROWS = "[...document.querySelectorAll('#raceResults tbody tr')].map(r=>r.textContent)"
errors, report = [], {}
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def watch(page, name):
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1000, 'height': 620})
    context.add_init_script("try{localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,laps:1,camera:'chase'}));}catch{}")
    host = context.new_page()
    watch(host, 'host')
    # (its automatic pilot ticked too: never switched on for a host who watches)
    host.goto(f'{URL}#desafio={ROOM}&local=1&auto=1', wait_until='load')
    wait_js(host, "window.interlagosSala?.info().role==='host'&&window.interlagos&&!document.querySelector('#start').disabled", timeout=60000)
    host.fill('#pilotName', 'Ana')
    host.evaluate("()=>localStorage.setItem('autopobre-pilots-v1',JSON.stringify({selected:'Bia',names:['Bia']}))")
    with context.expect_page() as popup:
        host.evaluate("url=>{window.open(url,'_blank','popup,noopener,width=1000,height=620');}", f'{URL}#desafio={ROOM}&local=1&auto=1&carro=64')
    guest = popup.value
    watch(guest, 'guest')
    guest.wait_for_load_state('load')
    wait_js(guest, "window.interlagosSala?.info().number==='64'&&!document.querySelector('#cars').classList.contains('hidden')", timeout=90000)
    wait_js(host, "interlagosSala.info().members.some(m=>m.name==='Bia')", timeout=20000)
    host.click('#start')
    wait_js(host, "!document.querySelector('#cars').classList.contains('hidden')", timeout=20000)
    host.click('#carsNext')
    # The host's part, on the track screen beside the laps; the room line, while the race waits, says the same.
    host.wait_for_selector('#tracksWatch', state='visible')
    host.select_option('#tracksWatch', 'assiste')
    start_race(host, '#singleRace')
    wait_js(host, "interlagosSala.info().phase==='waiting'&&!document.querySelector('#mpStart').hidden", timeout=240000)
    wait_js(host, "document.getElementById('mpWatch').checked&&!document.getElementById('mpWatch').closest('label').hidden", timeout=5000)
    # Nobody ready to race yet (she still picks her car): the start waits, saying so, Enter as well (the team's try, 10-27:
    # started like that, the host raced instead of watching, its car standing there).
    wait_js(host, "document.getElementById('mpStart').disabled&&document.getElementById('mpStart').textContent.includes('esperando um piloto')", timeout=10000)
    host.keyboard.press('Enter')
    host.wait_for_timeout(1000)
    assert host.evaluate("interlagosSala.info().phase") == 'waiting', 'Enter started a race with nobody to watch'
    host.screenshot(path=str(SHOTS / '0_anfitriao_esperando_piloto.png'))
    guest.click('#carsNext')
    gid = guest.evaluate('interlagosSala.info().id')
    wait_js(host, f"interlagosSala.info().ready.includes({gid!r})", timeout=240000)
    wait_js(guest, "interlagosSala.info().race?.assiste===true", timeout=10000)
    wait_js(host, "!document.getElementById('mpStart').disabled", timeout=5000)
    host.click('#mpStart')
    for page in (host, guest):
        wait_js(page, "interlagosSala.info().phase==='racing'&&window.interlagos?.ready&&document.querySelector('#raceCountdown').hidden", timeout=90000)

    # From the start: the host's car parked and out of sight, its cameras on her, its line saying it watches.
    wait_js(host, "interlagosSala.info().watching&&interlagosSala.info().parked&&interlagosSala.info().ownHidden", timeout=15000)
    wait_js(host, "interlagos.watchInfo()?.number==='64'", timeout=15000)
    try:
        wait_js(host, f"{STATUS}.includes('Você está assistindo')&&!document.getElementById('mpEnd').hidden", timeout=10000)
    except Exception:
        print(json.dumps(host.evaluate(f"({{status:{STATUS},end:document.getElementById('mpEnd').hidden,phase:interlagosSala.info().phase,role:interlagosSala.info().role,problem:interlagosSala.info().problem,paused:interlagosSala.info().paused,cls:document.getElementById('mpRoom').className}})"), ensure_ascii=False))
        host.screenshot(path=str(SHOTS / 'falha_linha.png'))
        raise
    host.wait_for_timeout(4000)
    me = host.evaluate("interlagosSala.info().me")
    assert (me['vx'] ** 2 + me['vy'] ** 2) ** .5 < .5, f'the host\'s car stands parked: {me}'
    # Its keys move nothing (a habit, a slip beside N): W held a second, the car still on its spot.
    host.keyboard.down('KeyW')
    host.wait_for_timeout(1500)
    host.keyboard.up('KeyW')
    moved = host.evaluate("p=>{const m=interlagosSala.info().me;return Math.hypot(m.x-p.x,m.y-p.y);}", me)
    assert moved < .3, f'W moved the watching host\'s car {moved:.2f} m'
    assert host.evaluate("document.getElementById('watchButton').hidden&&document.getElementById('tourBadge').hidden"), 'no automatic pilot for a host who watches'
    assert host.evaluate("interlagos.watchInfo()?.number") == '64', 'its cameras still on her after W'
    seen = guest.evaluate("interlagosSala.info().cars.find(c=>c.number==='99')")
    assert seen['hidden'] and seen['netGhost'], f'her screen: the host\'s car out of sight, touching nothing: {seen}'
    # ...nor in her place: a field of 14 racing (the team's try, 10-27: last, she read 14º / 15).
    place = guest.evaluate("document.getElementById('racePosition').textContent")
    assert place.endswith('/ 14'), f'her place counts the host\'s parked car: {place}'
    assert not host.evaluate("interlagosSala.info().standings.some(r=>r.number==='99')"), 'no tower row for the host'
    shown = host.evaluate("['#timing','#fuelGauge','#skinButton','#ghostButton','#mpAuto'].filter(q=>document.querySelector(q)?.getClientRects().length)")
    assert not shown, f'none of its own car on the host\'s screen: {shown}'
    report['assistindo'] = {'linha': host.evaluate(STATUS), 'camera': host.evaluate("interlagos.watchInfo().number")}
    host.screenshot(path=str(SHOTS / '1_anfitriao_assistindo.png'))
    guest.screenshot(path=str(SHOTS / '1_convidada_correndo.png'))

    # Her flag: over for everyone; the host's sheet says it watched, hers has no row for the host's car.
    for page in (host, guest):
        wait_js(page, RESULTS, timeout=480000)
    assert host.inner_text('#resultsPlace') == 'VOCÊ ASSISTIU À CORRIDA', host.inner_text('#resultsPlace')
    assert not any('VOCÊ' in r for r in host.evaluate(ROWS)), 'no row of its own'
    hers = [r for r in host.evaluate(ROWS) if 'Bia' in r]
    assert hers and '≈' not in hers[0] and '—' not in hers[0], f'her own time and lap on the host\'s sheet, not an estimate: {hers}'
    rows = guest.evaluate(ROWS)
    assert not any(r.strip().startswith(('15º99', '99')) or 'Ana' in r for r in rows), f'no row for the host\'s car: {rows}'
    assert guest.inner_text('#resultsPlace').endswith('/ 14'), guest.inner_text('#resultsPlace')
    report['resultado'] = {'anfitriao': host.inner_text('#resultsPlace'), 'linhas_convidada': len(rows)}
    host.screenshot(path=str(SHOTS / '2_anfitriao_resultado.png'))
    guest.screenshot(path=str(SHOTS / '2_convidada_resultado.png'))
    browser.close()

assert not errors, errors
report['shots'] = str(SHOTS)
print(json.dumps(report, indent=1, ensure_ascii=False))
print('verificar_sala_assistir: ok')
