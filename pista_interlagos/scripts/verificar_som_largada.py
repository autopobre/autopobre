"""Browser check for the blip on the grid (user, 10-24): held at the start, the throttle revs the engine free and,
let go, the revs wind down on the flywheel ("VRUMMMM") instead of dropping to idle at once ("VRU").

Modo Corrida's countdown and the story's grid: the throttle held revs the heard engine in neutral to about 4150 rpm
(not first gear's fixed launch note); half a second after letting go it is still above 2000 rpm, and it settles at
idle within two seconds. The heard revs also drive the rev counter.
Honours INTERLAGOS_URL (default: the 8799 server)."""
import json
import os
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, GAME_URL
from playwright.sync_api import sync_playwright

URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
HOOK = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;
ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();return true;}"""
SAMPLE = "()=>{const a=interlagos.audioInfo();return {t:performance.now(),rpm:a.rpm,gear:a.gear,context:a.context}}"
report = {'errors': [], 'checks': {}}


def check(name, value, detail=None):
    report['checks'][name] = bool(value)
    print(name, bool(value), flush=True)
    assert value, (name, detail)


def blip(page, tag):
    """The throttle held for 0.6 s, then let go: the heard revs over the next 2.5 s."""
    page.keyboard.down('KeyW')
    page.wait_for_timeout(600)
    top = page.evaluate(SAMPLE)
    page.keyboard.up('KeyW')
    after = []
    for _ in range(50):
        after.append(page.evaluate(SAMPLE))
        page.wait_for_timeout(50)
    t0 = after[0]['t']
    at = lambda s: next((o for o in after if o['t'] - t0 >= s * 1000), after[-1])
    report[tag] = {'top': top, 'half': at(.5), 'two': at(2), 'running': top['context']}
    check(tag + '_revs_free_in_neutral', top['gear'] == 'N' and top['rpm'] > 3900, top)
    check(tag + '_tail_after_letting_go', at(.5)['rpm'] > 2000 and at(.5)['gear'] == 'N', at(.5))
    check(tag + '_settles_at_idle', abs(at(2)['rpm'] - 950) < 1, at(2))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args() + ['--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    enter_track(page)
    page.evaluate(HOOK)
    wait_js(page, 'fixtureMode.freeCountdown>0', timeout=60000)
    page.evaluate('fixtureMode.freeCountdown=30')
    page.mouse.click(640, 400)
    check('audio_running', page.evaluate("interlagos.audioInfo().context") == 'running')
    blip(page, 'countdown')
    check('car_still_held', page.evaluate("fixtureMode.freeCountdown>0&&Math.hypot(interlagos.car.vx,interlagos.car.vy)<.01"))
    page.close()
    # The story's grid, after the engine caught.
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    enter_track(page, story=True)
    page.evaluate(HOOK)
    page.evaluate("()=>{const s=fixtureMode.state;s.scene=null;s.phase='grid';s.countdown=30;fixtureMode.sync();}")
    page.mouse.click(640, 400)
    page.wait_for_timeout(300)
    blip(page, 'grid')
    browser.close()
print(json.dumps(report, indent=1, ensure_ascii=False), flush=True)
assert not report['errors'], report['errors']
print('the blip on the grid revs free and winds down slowly: verified')
