"""The sound bench (teste/bancada-som.html, /dev/ only) in the browser.

The Opala and Fusca tabs switch the car and its sounds; gear by gear, the engaged gear is marked and its settings
change the sound only in that gear (second gear's volume at zero silences the engine in second); pasted settings
apply; "Usar estes ajustes no jogo" reaches the game, whose Áudio tab links the bench (a build with the bench).
Usage: verificar_bancada_som.py [port] (default 8799; INTERLAGOS_URL overrides the game's address).
"""
import os
import sys

from browser_config import GAME_URL, browser_args, browser_executable, open_menu, wait_js
from playwright.sync_api import sync_playwright

game = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace('8799', sys.argv[1]) if len(sys.argv) > 1 else GAME_URL)
bench = game.split('#')[0].rstrip('/') + '/bancada-som.html'
errors, failed = [], []


def check(name, ok, detail=''):
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (' - ' + str(detail) if detail != '' else ''), flush=True)
    if not ok:
        failed.append(name)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args() + ['--autoplay-policy=no-user-gesture-required'])
    context = browser.new_context(viewport={'width': 1366, 'height': 900})
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and '404' not in m.text else None)
    info = lambda: page.evaluate('window.bancada.audio().info()')

    def rms(seconds=.5):
        values = []
        for _ in range(int(seconds / .05)):
            values.append(info()['rms'])
            page.wait_for_timeout(50)
        return sum(values) / len(values)

    try:
        page.goto(bench)
        page.click('#startButton')
        wait_js(page, 'window.bancada.audio()?.info().engine?.ready', timeout=40000)
        check('the Opala tab plays the Opala', info()['tuning']['car'] == 'opala' and info()['engine']['bank'] == 'loops_m3', info()['tuning'])
        page.click('#tabFusca')
        wait_js(page, "window.bancada.audio().info().engine?.bank==='loops_fusca'&&window.bancada.audio().info().tuning.car==='fusca'", timeout=20000)
        check('the Fusca tab plays the Fusca, with its own settings', page.text_content('#settingsTitle') == 'Ajustes do Fusca')
        page.click('#tabOpala')
        wait_js(page, "window.bancada.audio().info().engine?.bank==='loops_m3'", timeout=20000)
        page.keyboard.down('KeyW')
        wait_js(page, 'window.bancada.audio().info().gear===2', timeout=20000)
        page.wait_for_timeout(300)
        live = page.evaluate("document.querySelector('#gearChips button.live')?.dataset.gear")
        check('the engaged gear is marked and followed', live == '2' and page.evaluate("document.querySelector('#gearChips button.on')?.dataset.gear") == '2', live)
        loud = rms()
        page.evaluate("window.bancada.setValue('m2Volume',0)")
        page.keyboard.up('KeyW')
        page.evaluate("Object.assign(window.bancada.car,{vx:72/3.6,gear:2,shiftTimer:0})")
        page.keyboard.down('KeyW')
        page.wait_for_timeout(250)
        quiet = rms(.3) if info()['gear'] == 2 else None
        check('second gear at volume 0 silences the engine in second', quiet is not None and quiet < loud * .35, {'loud': round(loud, 4), 'quiet': quiet and round(quiet, 4)})
        page.evaluate("window.bancada.setValue('m2Volume',1)")
        page.keyboard.up('KeyW')
        page.click('#paste')
        page.fill('#pasteText', '{"som":"auto-pobre-racing","versao":1,"opala":{"engine":1.3},"fusca":{"idleLoop":2}}')
        page.click('#pasteApply')
        state = page.evaluate('({o:window.bancada.state.opala.engine,f:window.bancada.state.fusca.idleLoop,changed:document.querySelector(\'.row[data-key="engine"]\').classList.contains("changed")})')
        check('pasted settings apply to both cars', state['o'] == 1.3 and state['f'] == 2 and state['changed'], state)
        page.check('#useInGame')
        game_page = context.new_page()
        game_page.on('pageerror', lambda e: errors.append(str(e)))
        open_menu(game_page, game)
        source = game_page.evaluate('interlagos.audioInfo().tuning')
        game_page.click('#settingsButton' if game_page.is_visible('#settingsButton') else '#menuButton')
        game_page.click('#tab-audio')
        check('"usar no jogo": the game plays the bench sets, and Áudio links the bench', source['source'] == 'bancada' and game_page.is_visible('#soundBench a'), source)
        game_page.close()
        page.uncheck('#useInGame')
        page.evaluate("for(const car of ['opala','fusca'])Object.assign(window.bancada.state[car],{engine:.8,idleLoop:1});window.bancada.setValue('engine',.8)")
        check('no browser errors', not errors, errors[:5])
    except Exception as e:
        failed.append(repr(e))
        print('FAIL', repr(e), errors[:5], flush=True)
    finally:
        if len(sys.argv) > 2:
            page.screenshot(path=sys.argv[2], full_page=True)
        browser.close()
print('all passed' if not failed else f'{len(failed)} failed: {failed}')
sys.exit(1 if failed else 0)
