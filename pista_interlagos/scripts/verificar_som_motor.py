"""Recorded engine, tyres and pops in the browser (engine-loops.js, tyre-sounds.js).

A single race at Interlagos in the Opala: its loops and idle load and replace the synthesized engine, the rivals
on the grid are heard through their own voices, first gear's sound starts at half the rev counter, the throttle
opens and shuts the engine's layers (and shutting it at speed is the engine braking, still heard, not silence),
a lift at high revs pops in the exhaust, a slide screeches. Usage: verificar_som_motor.py [port] (default 8799; INTERLAGOS_URL overrides the address).
"""
import os
import sys

from browser_config import GAME_URL, browser_args, browser_executable, enter_track, open_menu, wait_js, wait_race_start
from playwright.sync_api import sync_playwright

url = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace('8799', sys.argv[1]) if len(sys.argv) > 1 else GAME_URL)
errors, failed = [], []


def check(name, ok, detail=''):
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (' - ' + str(detail) if detail != '' else ''), flush=True)
    if not ok:
        failed.append(name)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args() + ['--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.set_default_timeout(90000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    info = lambda: page.evaluate('interlagos.audioInfo()')

    def rms(seconds=.6):
        values = []
        for _ in range(int(seconds / .05)):
            values.append(info()['rms'])
            page.wait_for_timeout(50)
        return sum(values) / len(values)

    try:
        open_menu(page, url)
        enter_track(page)
        page.keyboard.press('KeyS')
        wait_js(page, "interlagos.audioInfo().context==='running'")
        wait_js(page, 'interlagos.audioInfo().engine?.ready&&interlagos.audioInfo().tyres?.ready||!!interlagos.audioInfo().engine?.error||!!interlagos.audioInfo().tyres?.error', timeout=60000)
        a = info()
        check('recordings loaded', a['engine']['ready'] and a['tyres']['ready'], {'engine': a['engine']['error'], 'tyres': a['tyres']['error']})
        check("the Opala's sounds: inline-six loops, Opala idle", a['engine']['bank'] == 'loops_m3' and a['engine']['idle'] == 'lenta_opala', (a['engine']['bank'], a['engine']['idle']))
        wait_js(page, 'interlagos.audioInfo().engine.voices[1].gain>0', timeout=8000)
        check('nearest rival on the grid heard through its own engine voice', info()['engine']['voices'][1]['gain'] > 0, info()['engine']['voices'][1])
        wait_race_start(page)
        page.keyboard.down('KeyW')
        page.wait_for_timeout(600)
        a = info()
        check('first gear sounds from half the rev counter at once', a['gear'] == 1 and a['rpm'] > .45 * 7400, {'gear': a['gear'], 'rpm': round(a['rpm'])})
        wait_js(page, 'interlagos.audioInfo().rpm>4500', timeout=20000)
        on = rms()
        a = info()
        check('throttle open: open layer, engine loud', a['engine']['voices'][0]['load'] > .8 and on > .01, {'rpm': a['rpm'], 'load': a['engine']['voices'][0]['load'], 'rms': round(on, 4)})
        page.keyboard.up('KeyW')
        page.wait_for_timeout(250)
        off = rms(.4)
        a = info()
        check('throttle shut at speed: closed layer, engine braking still heard', a['engine']['voices'][0]['load'] < .1 and off > on * .2, {'rpm': a['rpm'], 'rms on': round(on, 4), 'rms off': round(off, 4)})
        pops = a['tyres']['pops']
        for _ in range(6):
            page.keyboard.down('KeyW')
            wait_js(page, 'interlagos.audioInfo().rpm>5200', timeout=20000)
            page.keyboard.up('KeyW')
            page.wait_for_timeout(700)
            if info()['tyres']['pops'] > pops:
                break
        check('lifting at high revs pops in the exhaust', info()['tyres']['pops'] > pops, info()['tyres']['pops'] - pops)
        page.evaluate('interlagos.reposition(600);const c=interlagos.car;c.vx=Math.cos(c.heading)*65/3.6;c.vy=Math.sin(c.heading)*65/3.6;true')
        page.keyboard.press('Space')
        page.keyboard.down('KeyA')
        wait_js(page, 'interlagos.audioInfo().tyres.loops.arrasta>.05||interlagos.audioInfo().tyres.loops.canta>.05', timeout=8000)
        check('a slide screeches', True, info()['tyres']['loops'])
        page.keyboard.up('KeyA')
        page.keyboard.press('Space')
        page.keyboard.press('KeyP')
        wait_js(page, 'interlagos.audioInfo().paused')
        page.wait_for_timeout(300)
        a = info()
        page.keyboard.press('Escape')
        page.click('#settingsButton')
        page.click('#tab-audio')
        page.check('#synthEngine')
        wait_js(page, 'interlagos.audioInfo().synthEngine&&interlagos.audioInfo().engine===null', timeout=5000)
        check('Áudio: "Usar motor sintetizado" swaps the recordings for the old engine', info()['engine'] is None)
        page.uncheck('#synthEngine')
        wait_js(page, 'interlagos.audioInfo().engine?.ready', timeout=20000)
        check('and unchecked, the recordings come back', info()['engine']['bank'] == 'loops_m3' and not info()['synthEngine'])
        check('pause silences the recorded engine and tyres', a['engine']['voices'][0]['gain'] == 0 and not any(v > 0 for v in a['tyres']['loops'].values()), a['engine']['voices'][0])
        check('no browser errors', not errors, errors[:5])
    except Exception as e:
        failed.append(repr(e))
        print('FAIL', repr(e), errors[:5], flush=True)
    finally:
        browser.close()
print('all passed' if not failed else f'{len(failed)} failed: {failed}')
sys.exit(1 if failed else 0)
