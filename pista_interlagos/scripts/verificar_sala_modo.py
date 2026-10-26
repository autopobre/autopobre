"""In a multiplayer room only the room's things (the team's wish, 10-26: so many choices left players and hosts lost).
Two windows of one browser (&local=1): on the opening only Modo Corrida (no Modo História, drift arena, circuits'
histories nor records), the car screen without the Fusca tab but with the pilot's look, the host's track screen with the
single race and its laps only, whatever race was picked before (no practice, 1x1, championship, circuit history,
weather nor AI level), the settings
without the recon lap nor the race's rules; the host's card closes the room, a guest's has Sair da sala, which takes her
back to the game alone and out of the host's list. Without a room everything is there. Usage: verificar_sala_modo.py
[porta] (a game server there, servidor.py). Screens in the shots folder (INTERLAGOS_SHOTS, else the temp folder)."""
import json
import os
import random
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js

PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/?intro=0&cinema=off'
ROOM = f'modo{random.randrange(10**6)}'
SHOTS = Path(os.environ.get('INTERLAGOS_SHOTS') or tempfile.gettempdir()) / 'verificar_sala_modo'
SHOTS.mkdir(parents=True, exist_ok=True)
SHOWN = "(()=>{const r={};for(const id of ARG){const e=document.getElementById(id);r[id]=!!e&&e.offsetParent!==null&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';}return r;})()"
errors, report = [], {}


def shown(page, ids):
    return page.evaluate("ids=>{const r={};for(const id of ids){const e=document.getElementById(id);let v=!!e;for(let n=e;v&&n&&n!==document.body;n=n.parentElement){const c=getComputedStyle(n);if(c.display==='none'||n.hidden)v=false;}r[id]=v;}return r;}", ids)


def watch(page, name):
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))


OPENING_GONE = ['storyStart', 'driftStart', 'historiasStart', 'recordsButton']
TRACKS_GONE = ['soloRace', 'duelRace', 'championshipPanel', 'historyStart', 'tracksTime', 'tracksRain', 'tracksAiLevel']
SETTINGS_GONE = ['tab-tour', 'aiLevel', 'raceLaps', 'timeOfDay', 'rainLevel', 'carDamage', 'aceKoyzinho', 'retirements']

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1100, 'height': 680})
    context.add_init_script("try{localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,laps:1,camera:'chase',raceMode:'championship'}));}catch{}")

    # Without a room: everything there.
    plain = context.new_page()
    watch(plain, 'plain')
    plain.goto(URL, wait_until='load')
    wait_js(plain, "window.interlagos&&!document.querySelector('#start').disabled", timeout=60000)
    full = shown(plain, ['start', *OPENING_GONE])
    assert all(full.values()), f'without a room every mode is there: {full}'
    plain.close()

    host = context.new_page()
    watch(host, 'host')
    host.goto(f'{URL}#desafio={ROOM}&local=1', wait_until='load')
    wait_js(host, "window.interlagosSala?.info().role==='host'&&window.interlagos&&!document.querySelector('#start').disabled", timeout=60000)
    host.fill('#pilotName', 'Ana')
    opening = shown(host, ['start', 'settingsButton', *OPENING_GONE])
    assert opening['start'] and opening['settingsButton'] and not any(opening[i] for i in OPENING_GONE), opening
    assert shown(host, ['mpClose'])['mpClose'] and not shown(host, ['mpLeave'])['mpLeave'], 'the host closes the room; it does not just leave'
    host.screenshot(path=str(SHOTS / '1_abertura_sala.png'))
    # The settings: the player's own (camera, controls), none of the race's rules nor the recon lap.
    host.click('#settingsButton')
    wait_js(host, "document.getElementById('settings').open", timeout=10000)
    settings = shown(host, ['camera', 'tab-race', 'tab-controls', *SETTINGS_GONE])
    assert settings['camera'] and settings['tab-controls'] and not any(settings[i] for i in SETTINGS_GONE), settings
    host.screenshot(path=str(SHOTS / '4_config_sala.png'))
    host.click('#settingsClose')
    wait_js(host, "!document.getElementById('settings').open", timeout=10000)
    host.evaluate("()=>localStorage.setItem('autopobre-pilots-v1',JSON.stringify({selected:'Bia',names:['Bia']}))")
    with context.expect_page() as popup:
        host.evaluate("url=>{window.open(url,'_blank','popup,noopener,width=1100,height=680');}", f'{URL}#desafio={ROOM}&local=1&carro=64')
    guest = popup.value
    watch(guest, 'guest')
    guest.wait_for_load_state('load')
    wait_js(guest, "window.interlagosSala?.info().number==='64'&&!document.querySelector('#cars').classList.contains('hidden')", timeout=90000)
    cars = shown(guest, ['carsVisual', 'carModels', 'carsNext', 'mpLeave'])
    assert cars['carsVisual'] and cars['carsNext'] and cars['mpLeave'] and not cars['carModels'], cars
    guest.screenshot(path=str(SHOTS / '2_convidada_carro.png'))

    # The host's track screen: the single race and its laps only.
    host.click('#start')
    wait_js(host, "!document.querySelector('#cars').classList.contains('hidden')", timeout=20000)
    assert not shown(host, ['carModels'])['carModels']
    host.click('#carsNext')
    wait_js(host, "!document.querySelector('#tracks').classList.contains('hidden')", timeout=20000)
    tracks = shown(host, ['singleRace', 'tracksLaps', 'tracksGearbox', *TRACKS_GONE])
    assert tracks['singleRace'] and tracks['tracksLaps'] and tracks['tracksGearbox'] and not any(tracks[i] for i in TRACKS_GONE), tracks
    # (the championship picked before the room: the room's track screen is the single race's, its other tabs gone)
    modes = host.evaluate("({race:document.getElementById('tracks').dataset.race,tabs:[...document.querySelectorAll('#raceModes [data-race]')].filter(t=>getComputedStyle(t).display!=='none').map(t=>t.dataset.race)})")
    assert modes == {'race': 'single', 'tabs': ['single']}, modes
    host.screenshot(path=str(SHOTS / '3_pistas_sala.png'))

    # A guest leaves: the game alone again, and out of the host's list.
    wait_js(host, "interlagosSala.info().members.some(m=>m.name==='Bia')", timeout=20000)
    guest.click('#mpLeave')
    wait_js(guest, "!location.hash.includes('desafio')&&document.readyState==='complete'", timeout=20000)
    guest.wait_for_timeout(2500)
    assert not guest.evaluate("!!window.interlagosSala||document.body.classList.contains('modo-sala')"), 'back in the game alone'
    assert shown(guest, ['storyStart'])['storyStart'], 'with every mode again'
    wait_js(host, "!interlagosSala.info().members.some(m=>m.name==='Bia')", timeout=20000)
    report['modo_sala'] = {'abertura': opening, 'pistas': tracks, 'config': settings, 'saiu': 'ok'}
    browser.close()

assert not errors, errors
report['shots'] = str(SHOTS)
print(json.dumps(report, indent=1, ensure_ascii=False))
print('verificar_sala_modo: ok')
