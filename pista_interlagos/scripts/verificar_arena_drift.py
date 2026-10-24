"""Arena de Drift in the browser: from the opening's button through the car screen into the stadium, a drift scored on
screen, the arena's panel, a challenge, the editor (a cone put down, turned and taken away) and back out to the car
screen. Usage: verificar_arena_drift.py [porta] [pasta das fotos]. Screens: arena_*.jpg in the folder (renders/arena_drift
by default)."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js

PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'renders' / 'arena_drift'
OUT.mkdir(parents=True, exist_ok=True)
errors, result = [], {}


def shot(page, name):
    page.screenshot(path=str(OUT / f'arena_{name}.jpg'), type='jpeg', quality=88)


def info(page):
    return page.evaluate('interlagos.arenaInfo()')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1600, 'height': 900})
    context.add_init_script("""if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.removeItem('opala99-arena-drift-v1');localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'cascavel',immersive:false,camera:'chase'}));}""")
    page = context.new_page()
    page.set_default_timeout(180000)
    page.on('pageerror', lambda e: (errors.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: m.type == 'error' and print('console', m.text, flush=True))
    page.goto(URL + '?intro=0', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    assert page.is_visible('#driftStart'), 'Arena de Drift button on the opening'
    page.fill('#pilotName', 'Piloto Drift')
    page.click('#driftStart')
    wait_js(page, "!document.querySelector('#cars').classList.contains('hidden')")
    assert 'ARENA DE DRIFT' in page.inner_text('#carsMode') and 'Entrar na arena' in page.text_content('#carsNext')
    page.click('#carsNext')
    wait_js(page, "interlagos.ready&&interlagos.circuit==='arena'&&interlagos.arenaInfo()&&document.querySelector('#menu').classList.contains('hidden')", 240000)
    page.wait_for_timeout(1500)
    a = info(page)
    assert a['mode'] == 'livre' and a['layout'] > 5 and a['setup'] == 'opala', a
    assert page.is_visible('#arenaHud') and not page.is_visible('#timing') and not page.is_visible('#fuelGauge')
    assert 'ARENA' in page.inner_text('.session')
    result['start'] = {'layout': a['layout'], 'world': a['world'], 'props': a['props']}
    shot(page, '01_entrada')
    # The player's map of the keys, on screen under the Arena button: 9 / 0 the throttle, − / = the wheel.
    assert page.is_visible('#arenaTune') and page.inner_text('#arenaThrottleValue') == '100%' and page.inner_text('#arenaSteerValue') == '49°'
    page.mouse.click(800, 450)
    for key in ('Digit9', 'Digit9', 'Minus', 'Minus', 'Minus', 'Equal'):
        page.keyboard.press(key)
    page.wait_for_timeout(200)
    t = info(page)
    assert t['tune'] == {'throttle': 0.9, 'steer': 45} and t['carTune'] == {'throttle': 0.9, 'steer': 45.0}, t
    assert page.inner_text('#arenaThrottleValue') == '90%' and page.inner_text('#arenaSteerValue') == '45°'
    assert page.evaluate("JSON.parse(localStorage.getItem('opala99-arena-drift-v1')).tune.steer") == 45
    shot(page, '01b_ajuste')
    for key in ('Digit0', 'Digit0', 'Equal', 'Equal'):
        page.keyboard.press(key)
    page.wait_for_timeout(200)
    assert info(page)['tune'] == {'throttle': 1, 'steer': 49}
    # Drive: speed up, a flick of the handbrake into a left turn, then throttle and a little steering.
    page.mouse.click(800, 450)
    page.keyboard.down('KeyW'); page.wait_for_timeout(2300)
    page.keyboard.down('KeyA'); page.keyboard.down('Space'); page.wait_for_timeout(350); page.keyboard.up('Space')
    peak = 0
    for k in range(12):
        page.wait_for_timeout(150)
        s = info(page)['score']
        peak = max(peak, abs(s['angle']))
        if k == 5:
            shot(page, '02_drift')
    page.keyboard.up('KeyA'); page.keyboard.up('KeyW')
    page.wait_for_timeout(1800)
    s = info(page)['score']
    result['drift'] = {'peakAngle': peak, 'total': s['total'], 'best': s['best'], 'last': s['last']}
    assert peak > 15, f'the car never got sideways ({peak})'
    shot(page, '03_depois')
    # The handbrake: N holds it only while held; the arena shows it pulled.
    page.keyboard.down('KeyN'); page.wait_for_timeout(250)
    assert page.is_visible('#arenaHandbrake') and page.inner_text('#arenaHandbrake') == 'FREIO DE MÃO', 'N holds the handbrake'
    shot(page, '03b_freio_de_mao')
    page.keyboard.up('KeyN'); page.wait_for_timeout(250)
    assert not page.is_visible('#arenaHandbrake'), 'N let go releases it'
    # On the arena Space and Shift hold it too (a keyboard may drop a third key held with W and D: ghosting), and the
    # game itself takes W + D + N together.
    for code in ('Space', 'ShiftLeft', 'KeyB'):
        page.keyboard.down(code); page.wait_for_timeout(250)
        assert page.is_visible('#arenaHandbrake'), f'{code} holds the handbrake'
        page.keyboard.up(code); page.wait_for_timeout(250)
        assert not page.is_visible('#arenaHandbrake'), f'{code} let go releases it'
    page.keyboard.down('KeyW'); page.keyboard.down('KeyD'); page.keyboard.down('KeyN'); page.wait_for_timeout(250)
    assert page.is_visible('#arenaHandbrake'), 'W + D + N together'
    page.keyboard.up('KeyN'); page.keyboard.up('KeyD'); page.keyboard.up('KeyW'); page.wait_for_timeout(600)
    assert not page.is_visible('#arenaHandbrake')
    # The panel (T): free drive, layouts, challenges.
    page.keyboard.press('KeyT')
    wait_js(page, "interlagos.arenaInfo().panel")
    assert page.locator('[data-arena-challenge]').count() == 5 and page.locator('[data-arena-preset]').count() == 6
    shot(page, '04_painel')
    page.click('[data-arena-challenge=qualificacao]')
    wait_js(page, "!interlagos.arenaInfo().panel&&interlagos.arenaInfo().mode==='qualificacao'")
    page.wait_for_timeout(1200)
    assert page.is_visible('#arenaChallenge')
    shot(page, '05_desafio')
    # Zerinho ao lado do cone: from the challenge's spot, ↑ and ← held (away from the cone), whole turns are counted.
    page.keyboard.press('KeyT'); wait_js(page, "interlagos.arenaInfo().panel")
    page.click('[data-arena-challenge=zerinho]')
    wait_js(page, "!interlagos.arenaInfo().panel&&interlagos.arenaInfo().mode==='zerinho'")
    page.mouse.click(800, 450)
    page.keyboard.down('ArrowUp'); page.keyboard.down('ArrowLeft'); page.wait_for_timeout(9000)
    z = info(page)
    shot(page, '05b_zerinho')
    page.keyboard.up('ArrowLeft'); page.keyboard.up('ArrowUp')
    assert z['challenge']['current'] >= 1 and z['world']['knocked'] == 0 and z['score']['drifting'], z['challenge']
    result['zerinho'] = {'giros': z['challenge']['current'], 'pontos': z['score']['points']}
    # "Ver a IA fazer": the AI drives the cone in the middle with the keys lit on screen; its laps are not the player's
    # record, and the first driving key gives the car back with the player's own tune.
    page.keyboard.press('KeyT'); wait_js(page, "interlagos.arenaInfo().panel")
    page.click('[data-arena-demo=rosquinha]')
    wait_js(page, "interlagos.arenaInfo().demo==='rosquinha'&&!interlagos.arenaInfo().panel")
    assert page.is_visible('#arenaDemo') and page.inner_text('#arenaThrottleValue') == '65%' and page.inner_text('#arenaSteerValue') == '22°'
    page.wait_for_timeout(16000)
    d = info(page)
    shot(page, '05c_ia_rosquinha')
    assert d['challenge']['current'] >= 1.5 and d['world']['knocked'] == 0 and d['carTune'] == {'throttle': 0.65, 'steer': 22.0}, (d['challenge'], d['carTune'])
    page.keyboard.press('ArrowUp'); page.wait_for_timeout(300)
    d2 = info(page)
    assert d2['demo'] is None and not page.is_visible('#arenaDemo') and d2['carTune'] == {'throttle': 1, 'steer': 49.0} and 'rosquinha' not in d2['bests'], d2
    assert page.inner_text('#arenaThrottleValue') == '100%' and page.inner_text('#arenaSteerValue') == '49°'
    result['ia'] = {'voltas': d['challenge']['current']}
    # The editor: back to the player's arena, seen from above; a cone put down, turned, taken away.
    page.keyboard.press('KeyT'); wait_js(page, "interlagos.arenaInfo().panel")
    page.click('#arenaEdit')
    wait_js(page, "interlagos.arenaInfo().editing&&interlagos.arenaInfo().mode==='livre'")
    page.wait_for_timeout(1200)
    before = info(page)['layout']
    shot(page, '06_editor')
    page.click('[data-arena-tool=cone]')
    page.mouse.click(1000, 450)
    page.wait_for_timeout(400)
    after = info(page)
    assert after['layout'] == before + 1 and after['selected'] is not None, after
    page.keyboard.press('KeyE')
    page.click('[data-arena-tool=ilha]')
    page.mouse.click(1250, 300)
    page.wait_for_timeout(500)
    shot(page, '07_editor_itens')
    page.keyboard.press('Delete')
    page.wait_for_timeout(300)
    assert info(page)['layout'] == before + 1
    saved = page.evaluate("JSON.parse(localStorage.getItem('opala99-arena-drift-v1')).layout.items.length")
    assert saved == before + 1, saved
    page.click('#arenaDone')
    wait_js(page, "!interlagos.arenaInfo().editing")
    page.wait_for_timeout(800)
    shot(page, '08_volta')
    result['editor'] = {'before': before, 'after': info(page)['layout']}
    # Out: Escape opens the menu, Sair da arena goes back to the car screen; the circuit chosen before is back.
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    if not page.is_visible('#leaveRace'):
        page.keyboard.press('Escape'); page.wait_for_timeout(300)
    assert page.inner_text('#leaveRace') == 'Sair da arena'
    page.click('#leaveRace')
    wait_js(page, "!document.querySelector('#cars').classList.contains('hidden')")
    assert page.evaluate("new URL(location.href).searchParams.get('circuito')") in (None, 'cascavel')
    assert page.evaluate("JSON.parse(localStorage.getItem('opala99-preferences-v1')).circuit") == 'cascavel'
    assert not page.is_visible('#arenaHud')
    browser.close()
result['errors'] = errors
print(json.dumps(result, ensure_ascii=False))
assert not errors, errors
