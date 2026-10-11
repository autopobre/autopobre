"""Number keys pick the camera straight away in a real race, in the menu's order.

1 chase, 2 close, 3 far, 4 hood, 5 cockpit, 6 TV, 7 aerial, 8 orbit (the numpad too); the pick is
remembered like C's. The numbers no longer steer, and the controller's D-pad (synthetic 1 and 3)
leaves the camera alone. Usage:
  verificar_camera_numeros.py [port]   (default 8799; INTERLAGOS_URL overrides the whole address)
"""
import json, os, sys
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, open_menu, enter_track, wait_race_start, GAME_URL

URL = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace('8799', sys.argv[1]) if len(sys.argv) > 1 else GAME_URL)
VIEWS = ['chase', 'close', 'far', 'hood', 'cockpit', 'tv', 'aerial', 'orbit']
report = {'errors': [], 'steps': {}}


def step(name, value=True):
    report['steps'][name] = value
    print(name, json.dumps(value), flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    enter_track(page)
    wait_race_start(page)
    # The real car keeps driving; its step only records the command it was given.
    page.evaluate("()=>{const c=interlagos.car,step=c.step.bind(c);c.step=(input,dt)=>{window.lastInput={...input};return step(input,dt);};}")
    command = "lastInput.left-lastInput.right"
    page.keyboard.down('KeyW')

    def view(key, expected):
        page.keyboard.press(key)
        page.wait_for_timeout(300)
        got = {'camera': page.input_value('#camera'), 'command': page.evaluate(command)}
        assert got == {'camera': expected, 'command': 0}, (key, got)
        step(f'key {key}', got)

    for i, name in enumerate(VIEWS):
        view(f'Digit{i + 1}', name)
    view('Numpad4', 'hood')
    view('Digit1', 'chase')
    # The pick is remembered for the next race, like C's.
    stored = page.evaluate("Object.keys(localStorage).map(k=>localStorage.getItem(k)).find(v=>v&&v.includes('\"camera\"'))")
    assert stored and '"camera":"chase"' in stored, stored
    step('remembered')
    # The controller's D-pad sends synthetic 1 / 3: the camera stays.
    view('Digit3', 'far')
    page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit1',key:'1',bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{code:'Digit1',key:'1',bubbles:true}));true")
    page.wait_for_timeout(300)
    assert page.input_value('#camera') == 'far', page.input_value('#camera')
    step('D-pad leaves the camera alone')
    page.keyboard.up('KeyW')
    browser.close()

assert not report['errors'], report['errors']
print('OK')
