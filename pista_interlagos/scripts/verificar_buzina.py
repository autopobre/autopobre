"""The horn in the browser (car-horn.js): H held at the wheel sounds the Opala's pair of horns for as long as it is held
and lets go into the dying note; a quick tap is a short honk; from the cockpit it is softer; on foot H does nothing;
the Fusca sounds its own. Prints the loudness of the horn beside the engine flat out, to keep them in balance. On
phones the held Buzina sits in the bottom left corner, clear of the bar and the pads (renders/buzina_celular_*.png).
Usage: verificar_buzina.py [port] (default 8799; INTERLAGOS_URL overrides the address).
"""
import os
import sys
from pathlib import Path

from browser_config import GAME_URL, browser_args, browser_executable, enter_track, open_menu, wait_js, wait_race_start
from playwright.sync_api import sync_playwright

url = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace('8799', sys.argv[1]) if len(sys.argv) > 1 else GAME_URL)
errors, failed = [], []
HORN = 'interlagos.audioInfo().horn'


def check(name, ok, detail=''):
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (' - ' + str(detail) if detail != '' else ''), flush=True)
    if not ok:
        failed.append(name)


def race(page, fusca=False):
    # The race's music off: the horn is measured against the engine alone.
    page.add_init_script("localStorage.setItem('opala99-audio',JSON.stringify({volume:.55,musicMuted:true}))")
    open_menu(page, url)
    page.fill('#pilotName', 'Piloto buzina')
    page.click('#start')
    page.click(f'#carModels [data-model="{"fusca" if fusca else "opala"}"]')
    enter_track(page)
    page.keyboard.press('KeyS')
    wait_js(page, "interlagos.audioInfo().context==='running'")
    wait_js(page, f'{HORN}?.ready||!!{HORN}?.error', timeout=60000)
    check('horns loaded', page.evaluate(f'{HORN}.ready'), page.evaluate(f'{HORN}.error'))
    wait_race_start(page)
    page.wait_for_timeout(800)


def alone(total, idle):
    """The horn's own level under the music and the engine (levels add as powers)."""
    return round(max(0, total ** 2 - idle ** 2) ** .5, 4)


def rms(page, seconds=.6):
    values = []
    for _ in range(int(seconds / .05)):
        values.append(page.evaluate('interlagos.audioInfo().rms'))
        page.wait_for_timeout(50)
    return sum(values) / len(values)


def honk(page, seconds):
    page.keyboard.down('KeyH')
    page.wait_for_timeout(150)
    level = rms(page, seconds)
    on = page.evaluate(HORN)
    page.keyboard.up('KeyH')
    return level, on


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args() + ['--autoplay-policy=no-user-gesture-required'])
    try:
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.set_default_timeout(90000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        race(page)
        idle = rms(page)
        held, on = honk(page, 1.6)
        check("H held: the Opala's horn sounds the whole time", on['on'] and on['last'] == 'opala' and on['honks'] == 1 and alone(held, idle) > .08,
              {'idle': round(idle, 4), 'horn': round(held, 4), 'alone': alone(held, idle), 'info': on})
        page.wait_for_timeout(900)
        after = rms(page, .4)
        check('let go, it dies away', not page.evaluate(f'{HORN}.on') and after < held * .4, {'after': round(after, 4)})
        page.keyboard.press('KeyH')
        page.wait_for_timeout(120)
        page.keyboard.press('KeyH')
        page.wait_for_timeout(700)
        check('two quick taps, two honks', page.evaluate(f'{HORN}.honks') == 3, page.evaluate(HORN))
        page.keyboard.press('Digit5')
        page.wait_for_timeout(600)
        inside, _ = honk(page, .8)
        check('from the cockpit, softer', inside < held * .9, {'cockpit': round(inside, 4), 'chase': round(held, 4)})
        page.keyboard.press('Digit1')
        page.wait_for_timeout(900)
        page.keyboard.down('KeyW')
        wait_js(page, 'interlagos.audioInfo().rpm>5000', timeout=20000)
        engine = rms(page, .6)
        page.keyboard.up('KeyW')
        print(f'     loudness: idle {idle:.4f}, engine flat out {engine:.4f}, horn alone {alone(held, idle)}', flush=True)
        page.keyboard.press('Space')
        wait_js(page, 'Math.hypot(interlagos.car.vx,interlagos.car.vy)<.3', timeout=30000)
        page.keyboard.press('Space')
        page.keyboard.press('KeyF')
        wait_js(page, 'interlagos.walkInfo()?.active', timeout=20000)
        honks = page.evaluate(f'{HORN}.honks')
        page.keyboard.down('KeyH')
        page.wait_for_timeout(500)
        page.keyboard.up('KeyH')
        check('on foot, H does nothing', page.evaluate(f'{HORN}.honks') == honks and not page.evaluate(f'{HORN}.on'), page.evaluate(HORN))
        page.close()

        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.set_default_timeout(90000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        race(page, fusca=True)
        idle = rms(page)
        held, on = honk(page, 1.2)
        page.wait_for_timeout(900)
        page.keyboard.down('KeyW')
        wait_js(page, 'interlagos.audioInfo().rpm>4500', timeout=20000)
        engine = rms(page, .6)
        page.keyboard.up('KeyW')
        print(f'     Fusca loudness: idle {idle:.4f}, engine flat out {engine:.4f}, horn alone {alone(held, idle)}', flush=True)
        # (its idle is a loud low rumble and its horn a thin high note, as loud to the ear as a little under the Opala's
        # pair: gerar_buzinas.py evens them out in dB(A); a plain level reads it lower)
        check("the Fusca sounds its own", on['on'] and on['last'] == 'fusca' and alone(held, idle) > .04, {'idle': round(idle, 4), 'horn': round(held, 4), 'alone': alone(held, idle), 'info': on})
        page.close()

        # Phones: Buzina in the bottom left corner, held by a finger, on screen and clear of the bottom bar (night and rain
        # widen it with Faróis and Limpador) and of the steering and pedal pads with the 34 px their touch reaches past them;
        # gone on foot.
        for width, height, weather in ((844, 390, ''), (667, 375, ",timeOfDay:'noite',rain:'chuva'")):
            phone = browser.new_context(viewport={'width': width, 'height': height}, has_touch=True, is_mobile=True, device_scale_factor=2)
            phone.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,camera:'chase',laps:3%s}));" % weather)
            page = phone.new_page()
            page.set_default_timeout(120000)
            page.on('pageerror', lambda e: errors.append(str(e)))
            open_menu(page, url)
            enter_track(page, tap=True)
            wait_race_start(page)
            boxes = page.evaluate("""Object.fromEntries(['#touchHorn','.touch-toolbar','.touch-steering','.touch-pedals','#telemetry','#mapcard'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();
              return [s,r.width?[r.left,r.top,r.right,r.bottom]:null];}))""")
            horn = boxes['#touchHorn']
            near = lambda r, m=0: r and r[0] - m < horn[2] and horn[0] < r[2] + m and r[1] - m < horn[3] and horn[1] < r[3] + m
            hits = [s for s in ('.touch-toolbar', '#telemetry', '#mapcard') if near(boxes[s])] + [s for s in ('.touch-steering', '.touch-pedals') if near(boxes[s], 34)]
            check(f'{width}x{height}: Buzina in the corner, on screen, clear of the bar and the pads', horn and horn[0] >= 0 and horn[3] <= height and not hits,
                  {'horn': [round(v) for v in horn], 'bar': [round(v) for v in boxes['.touch-toolbar']], 'over': hits})
            # (the page's key names fill <kbd data-key>, never a button's words)
            check(f'{width}x{height}: the buttons keep their words', page.inner_text('#touchHorn') == 'Buzina' and page.evaluate("document.querySelector('#touchLookBack').textContent") == 'OLHAR TRÁS')
            cdp = phone.new_cdp_session(page)
            x, y = (horn[0] + horn[2]) / 2, (horn[1] + horn[3]) / 2
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
            page.wait_for_timeout(500)
            held = page.evaluate(f'{HORN}.on')
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
            page.wait_for_timeout(200)
            check(f'{width}x{height}: a finger on Buzina honks while it stays', held and not page.evaluate(f'{HORN}.on'), page.evaluate(HORN))
            page.screenshot(path=str(Path(__file__).resolve().parents[1] / f'renders/buzina_celular_{width}.png'))
            page.tap('#touchExit')
            wait_js(page, 'interlagos.walkInfo()?.active', timeout=15000)
            page.wait_for_timeout(300)
            check(f'{width}x{height}: on foot, no Buzina', not page.is_visible('#touchHorn'))
            phone.close()
    finally:
        browser.close()

errors = [e for e in errors if 'tracks.json' not in e]
check('no page errors', not errors, errors[:5])
print('FAILED: ' + ', '.join(failed) if failed else 'Horn passed.')
sys.exit(1 if failed else 0)
