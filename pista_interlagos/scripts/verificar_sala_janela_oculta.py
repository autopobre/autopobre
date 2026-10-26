"""A multiplayer race where a pilot past the flag hides her window (the team's test, 10-26: a guest's window
hidden long after her flag, a bot took her car round again beside the host on its last lap, and into the pits).
Two windows of one browser, &local=1, one lap of Interlagos; the guest on the automatic pilot, the host standing on
the grid. As the guest crosses the line her window goes quiet (as a hidden window does: a browser stops its frames;
here nothing it sends reaches the room, a headless browser runs a frozen page on): the host's window puts her car in
its parking spot in the pit lane and keeps it there, stopped, finished, never a bot's; her window heard again (it
has parked the car itself meanwhile, on the same spot), the host takes its states again (the jump to the pit lane is
taken for a finished car at rest on its spot), the car still there. Usage: verificar_sala_janela_oculta.py [porta]
(a game server there, servidor.py). Screens in the shots folder (INTERLAGOS_SHOTS, else the temp folder)."""
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
ROOM = f'oculta{random.randrange(10**6)}'
SHOTS = Path(os.environ.get('INTERLAGOS_SHOTS') or tempfile.gettempdir()) / 'verificar_sala_janela_oculta'
SHOTS.mkdir(parents=True, exist_ok=True)
GUEST_CAR = "interlagosSala.info().cars.find(c=>c.number==='64')"
errors, report = [], {}


def watch(page, name):
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))


def guest_car(page):
    return page.evaluate(GUEST_CAR)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 900, 'height': 560})
    context.add_init_script("try{localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,laps:1,camera:'chase'}));}catch{}")
    host = context.new_page()
    watch(host, 'host')
    host.goto(f'{URL}#desafio={ROOM}&local=1', wait_until='load')
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
    for page in (host, guest):
        wait_js(page, "interlagosSala.info().phase==='racing'&&window.interlagos?.ready&&document.querySelector('#raceCountdown').hidden", timeout=90000)

    # The guest crosses the line; her window goes quiet there, before it parks the car itself.
    # (a second past the line: the host has had her crossing; her own window parks the car only once the flag's fade
    # is over)
    wait_js(guest, "interlagos.immersiveInfo?.().freeFinished===true", timeout=400000)
    guest.wait_for_timeout(1000)
    assert not guest.evaluate('interlagosSala.info().parked'), 'quiet before her window parks the car itself'
    guest.evaluate("()=>{const send=BroadcastChannel.prototype.postMessage;BroadcastChannel.prototype.postMessage=function(m){if(!window.__quieta)return send.call(this,m);};window.__quieta=true;}")
    wait_js(host, "interlagosSala.info().remotes.find(r=>r.number==='64')?.age>2", timeout=15000)
    try:
        wait_js(host, f"{GUEST_CAR}?.parked===true", timeout=30000)
    except Exception:
        print(json.dumps(host.evaluate(f"({{car:{GUEST_CAR},remote:interlagosSala.info().remotes.find(r=>r.number==='64'),phase:interlagosSala.info().phase,trail:interlagosSala.info().trail}})"), indent=1, ensure_ascii=False))
        host.screenshot(path=str(SHOTS / 'falha_anfitriao.png'))
        raise
    first = guest_car(host)
    host.wait_for_timeout(25000)
    later = guest_car(host)
    moved = ((later['x'] - first['x']) ** 2 + (later['y'] - first['y']) ** 2) ** .5
    host.screenshot(path=str(SHOTS / '1_anfitriao_carro_dela_no_box.png'))
    assert later['parked'] and later['finished'] and not later['retired'], later
    assert later['pit'], f'parked in the pit lane: {later}'
    assert moved < .5 and later['speed'] < .5, f'stays there ({moved:.2f} m, {later["speed"]:.2f} m/s)'
    report['janela_oculta'] = {'no_box': later['pit'], 'andou_m': round(moved, 2), 'velocidade': round(later['speed'], 2)}

    # Her window heard again: it has parked the car itself, on the same spot; the host takes her states again.
    guest.evaluate("()=>{window.__quieta=false;}")
    try:
        wait_js(guest, "interlagosSala.info().parked===true", timeout=30000)
    except Exception:
        print(json.dumps(guest.evaluate("(()=>{const i=interlagosSala.info(),m=interlagos.immersiveInfo?.()??{};return {phase:i.phase,parked:i.parked,problem:i.problem,role:i.role,cut:i.cut,lost:i.lost,paused:i.paused,finished:m.freeFinished,finishing:m.finishing,visible:document.visibilityState,frames:null,trail:i.trail.slice(-12)};})()"), indent=1, ensure_ascii=False))
        print('raf', guest.evaluate("()=>new Promise(r=>{let n=0;const f=()=>{n++;requestAnimationFrame(f)};requestAnimationFrame(f);setTimeout(()=>r(n),1000)})"))
        guest.screenshot(path=str(SHOTS / 'falha_convidada.png'))
        raise
    wait_js(host, f"{GUEST_CAR}?.parked===false&&interlagosSala.info().remotes.find(r=>r.number==='64')?.age<1", timeout=30000)
    host.wait_for_timeout(10000)
    back = guest_car(host)
    shift = ((back['x'] - first['x']) ** 2 + (back['y'] - first['y']) ** 2) ** .5
    age = host.evaluate("interlagosSala.info().remotes.find(r=>r.number==='64').age")
    assert shift < 1 and back['speed'] < .5 and back['finished'] and not back['retired'], (shift, back)
    assert age < 1, f'her states taken at the parking spot (age {age:.1f} s)'
    report['de_volta'] = {'mesmo_lugar_m': round(shift, 2), 'idade_estados_s': round(age, 2)}
    guest.screenshot(path=str(SHOTS / '2_convidada_de_volta.png'))
    browser.close()

assert not errors, errors
report['shots'] = str(SHOTS)
print(json.dumps(report, indent=1, ensure_ascii=False))
print('verificar_sala_janela_oculta: ok')
