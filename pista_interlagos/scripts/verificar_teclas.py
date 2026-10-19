"""Teclado do seu jeito in the browser: the Controles tab lists every command, a click and a key change it (a key
another command had swaps), Esc cancels without closing the settings, Backspace empties a place, the menu's keys
are refused; it is saved and back after a reload; in a race the new key drives and the old one does not, the
screen names the new key; Restaurar as teclas padrão brings everything back.
Usage:
  verificar_teclas.py [port]   (default 8799; INTERLAGOS_URL overrides the whole address)
"""
import json, os, sys
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, wait_race_start, pause_race, GAME_URL

URL = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace('8799', sys.argv[1]) if len(sys.argv) > 1 else GAME_URL)
SHOTS = os.environ.get('TECLAS_SHOTS')
report = {'errors': [], 'steps': {}}


def step(name, value=True):
    report['steps'][name] = value
    print(name, json.dumps(value, ensure_ascii=False), flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 900})
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    note = lambda: page.text_content('#keysNote')
    slot = lambda action, n=0: f'#keyBindings button[data-id="{action}"][data-slot="{n}"]'
    saved = "JSON.parse(localStorage.getItem('opala99-teclas-v1')||'null')"

    page.click('#settingsButton')
    page.click('#tab-controls')
    rows = page.evaluate("document.querySelectorAll('#keyBindings .keys-row').length")
    assert rows == 39, rows
    assert page.text_content(slot('acelerar')) == 'W' and page.text_content(slot('acelerar', 1)) == '↑'
    step('list', rows)
    if SHOTS:
        page.screenshot(path=os.path.join(SHOTS, 'teclas_lista.png'))

    # Acelerar on I: Partida (I) gets W.
    page.click(slot('acelerar'))
    assert page.text_content(slot('acelerar')) == 'Aperte…', page.text_content(slot('acelerar'))
    page.keyboard.press('KeyI')
    assert page.text_content(slot('acelerar')) == 'I' and page.text_content(slot('partida')) == 'W', note()
    assert 'I agora é Acelerar' in note() and 'Partida ficou com W' in note(), note()
    step('swap', note())
    # Esc cancels without closing the settings; the menu's keys are refused and the key is still awaited.
    page.click(slot('freioMao'))
    page.keyboard.press('Tab')
    assert 'escolha outra' in note() and page.text_content(slot('freioMao')) == 'Aperte…', note()
    page.keyboard.press('Escape')
    page.wait_for_timeout(200)
    assert page.evaluate("document.querySelector('#settings').open"), 'Esc closed the settings'
    assert page.text_content(slot('freioMao')) == 'Espaço' and note() == 'Nada mudou.', note()
    # M while picking is the key, not the mute.
    page.click(slot('freioMao'))
    page.keyboard.press('KeyK')
    assert page.text_content(slot('freioMao')) == 'K', note()
    # Backspace empties the second key.
    page.click(slot('acelerar', 1))
    page.keyboard.press('Backspace')
    assert page.text_content(slot('acelerar', 1)) == '+', page.text_content(slot('acelerar', 1))
    step('cancel, refuse, clear', note())
    keys = page.evaluate(saved)
    assert keys['keys']['acelerar'] == ['KeyI', None] and keys['keys']['partida'] == ['KeyW', None] and keys['keys']['freioMao'] == ['KeyK', None], keys
    assert page.evaluate("document.querySelector('#keyBindings button[data-id=\"acelerar\"]').closest('.keys-row').classList.contains('changed')")
    step('saved', keys['keys'])
    if SHOTS:
        page.screenshot(path=os.path.join(SHOTS, 'teclas_mudadas.png'))

    # Back after a reload.
    open_menu(page, URL)
    page.click('#settingsButton')
    page.click('#tab-controls')
    assert page.text_content(slot('acelerar')) == 'I' and page.text_content(slot('freioMao')) == 'K'
    assert page.evaluate("[...document.querySelectorAll('footer [data-key=\"KeyW\"]')].map(k=>k.textContent).join()") == 'I'
    step('after reload', page.text_content('footer div'))
    page.click('#settingsClose')

    # In a race: I accelerates, W no longer does (W is the starter now).
    enter_track(page)
    wait_race_start(page)
    page.evaluate("()=>{const c=interlagos.car,step=c.step.bind(c);c.step=(input,dt)=>{window.lastInput={...input};return step(input,dt);};return true;}")
    speed = "Math.hypot(interlagos.car.vx,interlagos.car.vy)*3.6"
    page.keyboard.down('KeyW')
    page.wait_for_timeout(700)
    assert page.evaluate("lastInput.throttle") == 0 and page.evaluate("lastInput.ignition") == 1, page.evaluate("lastInput")
    page.keyboard.up('KeyW')
    page.keyboard.down('KeyI')
    wait_js(page, f"lastInput.throttle===1&&{speed}>10", timeout=20000)
    page.keyboard.up('KeyI')
    step('race', {'kmh': round(page.evaluate(speed), 1)})
    # The handbrake on K: Space pulls nothing.
    page.keyboard.press('Space')
    page.wait_for_timeout(300)
    assert page.evaluate("lastInput.handbrake") == 0
    page.keyboard.press('KeyK')
    wait_js(page, "lastInput.handbrake===1", timeout=5000)
    page.keyboard.press('KeyK')
    wait_js(page, "lastInput.handbrake===0", timeout=5000)
    step('handbrake', True)
    # A status line names the player's key (the wipers: J, unchanged; the ghost: G).
    page.keyboard.press('KeyJ')
    wait_js(page, "/J (liga|desliga)/.test(document.querySelector('#status').textContent)", timeout=5000)

    # Restaurar as teclas padrão.
    pause_race(page)
    page.click('#settingsButton')
    page.click('#tab-controls')
    page.click('#keysReset')
    assert page.text_content(slot('acelerar')) == 'W' and page.text_content(slot('freioMao')) == 'Espaço' and page.text_content(slot('acelerar', 1)) == '↑'
    assert page.evaluate(saved) is None
    assert 'voltaram ao padrão' in note(), note()
    assert page.evaluate("document.querySelectorAll('#keyBindings .keys-row.changed').length") == 0
    step('reset', note())
    page.click('#settingsClose')
    enter_track(page)
    page.keyboard.down('KeyW')
    wait_js(page, "lastInput.throttle===1", timeout=5000)
    page.keyboard.up('KeyW')
    step('W again', True)

    # A hostile save (markup as key names, unknown commands, odd codes): the names come out inert, nothing runs, a
    # command saved with no valid key has none (Restaurar gives it back).
    page.evaluate("""()=>{localStorage.setItem('opala99-teclas-v1',JSON.stringify({keys:{acao:['Backquote',null],frear:['<img src=x onerror=window.pwned=1>',null],
     voar:['KeyK',null]},printed:{Backquote:'<',KeyE:'<img src=x onerror=window.pwned=1>'}}));return true;}""")
    open_menu(page, URL)
    page.click('#settingsButton')
    page.click('#tab-controls')
    assert page.text_content(slot('acao')) == '‹' and page.text_content(slot('frear')) == '—', [page.text_content(slot('acao')), page.text_content(slot('frear'))]
    assert page.evaluate("document.querySelectorAll('#keyBindings img, footer img').length") == 0
    assert not page.evaluate("!!window.pwned")
    step('hostile save', page.text_content(slot('acao')))
    page.click('#keysReset')
    assert not report['errors'], report['errors']
    browser.close()
print('verificar_teclas: ok')
