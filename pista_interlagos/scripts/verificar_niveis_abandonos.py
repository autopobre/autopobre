"""Browser check for the rivals' level menu and the breakdowns ("Abandonos"), both in 01 Corrida.

Level: Fácil by default; picking Impossível in the settings is saved and the next start races the
harder field (every rival drives clean, rated by the pilots' table, and the grid list shows the table).
Breakdowns: on by default; the free race draws one to four. One is forced a few seconds in: the car
pulls off onto the grass, stops, smokes (motor) and, at the flag, the result sheet classifies it DNF
("ABANDONOU · motor"). A recon lap then watches a broken car (key N, chase camera) for the picture.
Honours INTERLAGOS_URL (default: the 8799 server)."""
import json
import os
from pathlib import Path
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, wait_race_start, GAME_URL
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
SHOTS = Path(os.environ.get('SHOTS_DIR', ROOT / 'renders'))
HOOK = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;
ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();return true;}"""
FIELD = """()=>{const f=fixtureMode.field;return {level:f.level,retirements:f.retirements,
 clean:f.rivals.every(r=>r.style.clean&&r.style.level==='impossivel'),breakdowns:f.rivals.filter(r=>r.breakdown).length,
 rivals:f.rivals.map(r=>({number:r.entry.number,skill:r.entry.skill,grip:r.style.cornerGrip}))};}"""
# Break the rival just ahead of the player's car now (a motor failure), wherever it is.
BREAK = """async number=>{const {BREAKDOWNS}=await import('./race-field.js');const m=fixtureMode,f=m.field,L=m.data.meta.reconstructed_xy_m,laps=m.freeTotalLaps||m.laps||3,r=f.rivals.find(q=>q.entry.number===number);
 r.breakdown={...BREAKDOWNS.find(b=>b.kind==='motor'),at:Math.max(0,r.progress-f.gridLeadIn)/(laps*L)};return r.breakdown.at;}"""
BROKEN = """number=>{const r=fixtureMode.field.rivals.find(q=>q.entry.number===number),s=r.car.surface;
 return {retired:!!r.retired,kind:r.broken?.kind??null,off:Math.abs(s.d)-s.width/2,onRoad:s.onRoad,speed:Math.hypot(r.car.vx,r.car.vy),smokeLeft:r.broken?.smokeLeft??0,finished:r.finished};}"""
report = {'errors': []}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
    open_menu(page, URL)
    page.click('#settingsButton')
    page.click('#tab-race')
    assert page.input_value('#aiLevel') == 'facil', 'the level starts at Fácil'
    assert [o for o in page.eval_on_selector_all('#aiLevel option', 'os=>os.map(o=>o.textContent)')] == ['Fácil', 'Médio', 'Alto', 'Impossível']
    assert page.is_checked('#retirements'), 'breakdowns start switched on'
    page.select_option('#aiLevel', 'impossivel')
    page.screenshot(path=str(SHOTS / 'niveis_menu.png'))
    page.click('#settingsClose')
    saved = page.evaluate("JSON.parse(localStorage.getItem('opala99-preferences-v1'))")
    assert saved['aiLevel'] == 'impossivel' and saved['retirements'] is True, saved
    enter_track(page)
    roster = page.evaluate("document.querySelector('#gridRoster').textContent")
    assert 'Koyzinho” Bechtold · Nível 10/10' in roster and 'Aloísio Bueno · Nível 5/10' in roster, roster
    page.evaluate(HOOK)
    field = page.evaluate(FIELD)
    report['field'] = {k: v for k, v in field.items() if k != 'rivals'}
    assert field['level'] == 'impossivel' and field['clean'], field
    assert field['retirements'] and 1 <= field['breakdowns'] <= 4, field
    wait_race_start(page)
    wait_js(page, 'fixtureMode.field.time>12', timeout=120000)
    # The rival furthest back is still close to the player: break it and follow it off the road.
    number = page.evaluate('fixtureMode.field.rivals.slice().sort((a,b)=>a.progress-b.progress)[0].entry.number')
    report['forced'] = number
    page.evaluate(BREAK, number)
    wait_js(page, f"fixtureMode.field.rivals.find(q=>q.entry.number==='{number}').retired", timeout=30000)
    smoke = page.evaluate('interlagos.smokeInfo().active')
    wait_js(page, f"(()=>{{const r=fixtureMode.field.rivals.find(q=>q.entry.number==='{number}');return Math.hypot(r.car.vx,r.car.vy)<.3&&!r.car.surface.onRoad;}})()", timeout=60000)
    parked = page.evaluate(BROKEN, number)
    # The plume starts a few frames after the breakdown (8 puffs a second): count it again parked.
    smoke = max(smoke, page.evaluate('interlagos.smokeInfo().active'))
    report['parked'] = parked
    report['smokeWhileBroken'] = smoke
    assert parked['kind'] == 'motor' and not parked['onRoad'] and 1.5 < parked['off'] < 8 and not parked['finished'], parked
    assert smoke > 0 and parked['smokeLeft'] > 0, 'a blown engine smokes'
    # The flag: the sheet puts the broken car at the bottom, DNF, with what broke.
    page.evaluate('()=>{const m=fixtureMode;m.freeFinished=true;m.freePosition=1+m.rivals.filter(r=>r.finished).length;m.beginFinish(m.freePosition);}')
    wait_js(page, "!document.querySelector('#raceResults').hidden", timeout=60000)
    rows = page.eval_on_selector_all('#raceResults tbody tr', 'rs=>rs.map(r=>[...r.children].map(c=>c.textContent))')
    report['sheet'] = rows[-3:]
    mine = [r for r in rows if r[1] == number]
    assert mine and mine[0][0] == 'DNF' and mine[0][4] == 'ABANDONOU · motor', mine
    assert rows.index(mine[0]) >= len(rows) - field['breakdowns'] - 1, 'retirements are classified last'
    page.screenshot(path=str(SHOTS / 'abandonos_resultado.png'))
    page.close()
    # Recon lap (same settings): watch a rival, break it and film it on the grass from the chase camera.
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    page.fill('#pilotName', 'Piloto reconhecimento')
    page.click('#settingsButton')
    page.click('#tab-tour')
    page.click('#tour')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused&&interlagos.state.automatic', timeout=180000)
    page.evaluate("()=>{const s=document.querySelector('#camera');s.value='chase';s.dispatchEvent(new Event('change'));}")
    page.evaluate(HOOK)
    page.wait_for_timeout(8000)
    page.keyboard.press('KeyN')
    watched = page.evaluate('interlagos.watchInfo().number')
    report['watched'] = watched
    page.evaluate(BREAK, watched)
    wait_js(page, f"(()=>{{const r=fixtureMode.field.rivals.find(q=>q.entry.number==='{watched}');return r.retired&&Math.hypot(r.car.vx,r.car.vy)<.3;}})()", timeout=60000)
    page.wait_for_timeout(1500)
    report['watchedParked'] = page.evaluate(BROKEN, watched)
    page.screenshot(path=str(SHOTS / 'abandonos_grama.png'))
    browser.close()
print(json.dumps(report, indent=1, ensure_ascii=False), flush=True)
assert not report['errors'], report['errors']
print('level menu, Impossível field, breakdown parked on the grass with smoke, DNF on the sheet: verified')
