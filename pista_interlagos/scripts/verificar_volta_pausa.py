"""Browser check: back from a pause the race counts 3, 2, 1 with the picture frozen, then goes on (user, 2026-10-24).

    python verificar_volta_pausa.py [porta]

A solo practice at Interlagos, the car driven a few seconds. P pauses (badge), P again: the count shows 3 2 1 and the car
does not move during it, the throttle held meanwhile drives off at the go (VAI!). Escape's menu and Voltar à pista: the
same count. P during the count pauses again (badge back, no count), Escape during it opens the menu. A new race has only
its own start countdown, no resume count. Shots in renders/volta_pausa (or SHOTS_DIR)."""
import os
import sys
from pathlib import Path
from browser_config import browser_executable, browser_args, wait_js, start_race, wait_race_start
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PORTA = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/?intro=0'
SHOTS = Path(os.environ.get('SHOTS_DIR', ROOT / 'renders' / 'volta_pausa'))
SHOTS.mkdir(parents=True, exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
failed, errors = [], []
WATCH = """window.seen=[];new MutationObserver(()=>{const t=document.querySelector('#countdownNumber').textContent,c=document.querySelector('#raceCountdown');
 if(!c.hidden&&seen[seen.length-1]!==t)seen.push(t);}).observe(document.querySelector('#raceCountdown'),{subtree:true,childList:true,characterData:true,attributes:true});true"""
POS = "[interlagos.car.x,interlagos.car.y,interlagos.car.clock]"


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f' · {detail}' if detail != '' else ''), flush=True)
    if not ok:
        failed.append(name)


def counted(page, how, resume, shot=None):
    """The count after a resume: frozen while it runs, 3 2 1 then VAI!, the car on the move after it."""
    page.evaluate('window.seen=[];true')
    resume()
    page.keyboard.down('KeyW')
    wait_js(page, 'interlagos.state.resuming', timeout=3000)
    a = page.evaluate(POS)
    if shot:
        page.screenshot(path=str(SHOTS / shot))
    page.wait_for_timeout(400)
    b = page.evaluate(POS)
    check(f'{how}: frozen under the count', a == b and page.evaluate('interlagos.state.paused'), [a, b])
    check(f'{how}: the menu and the badge stay hidden', page.evaluate("document.querySelector('#menu').classList.contains('hidden')&&document.querySelector('#pauseBadge').hidden"))
    wait_js(page, '!interlagos.state.paused', timeout=4000)
    page.wait_for_timeout(700)
    c = page.evaluate(POS)
    page.keyboard.up('KeyW')
    seen = page.evaluate('seen')
    check(f'{how}: 3 2 1 VAI!', seen[:4] == ['3', '2', '1', 'VAI!'], seen)
    check(f'{how}: the throttle held during it drives off at the go', abs(c[0] - b[0]) + abs(c[1] - b[1]) > .5, [b, c])


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_init_script("""if(!sessionStorage.getItem('pausa')){sessionStorage.setItem('pausa','1');localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false}));}""")
    page = ctx.new_page()
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    try:
        page.goto(URL, wait_until='networkidle')
        wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
        page.fill('#pilotName', 'Piloto pausa')
        page.click('#start'); page.click('#carsNext')
        start_race(page, '#soloRace')
        wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused')
        wait_race_start(page)
        page.evaluate(WATCH)
        page.click('#view')
        page.keyboard.down('KeyW'); page.wait_for_timeout(2500); page.keyboard.up('KeyW')
        # P, P.
        page.keyboard.press('KeyP'); wait_js(page, 'interlagos.state.paused')
        check('P: the badge, no count', page.is_visible('#pauseBadge') and not page.evaluate('interlagos.state.resuming'))
        page.wait_for_timeout(600)
        counted(page, 'P', lambda: page.keyboard.press('KeyP'), 'contagem.png')
        # Escape's menu, then Voltar à pista.
        page.keyboard.press('Escape')
        try:
            wait_js(page, "!document.querySelector('#menu').classList.contains('hidden')", timeout=1500)
        except TimeoutError:
            page.keyboard.press('Escape')
        wait_js(page, "!document.querySelector('#menu').classList.contains('hidden')")
        counted(page, 'Voltar à pista', lambda: page.click('#resume'))
        # P during the count pauses again; Escape during it opens the menu.
        page.keyboard.press('KeyP'); wait_js(page, 'interlagos.state.paused')
        page.keyboard.press('KeyP'); wait_js(page, 'interlagos.state.resuming', timeout=3000)
        page.keyboard.press('KeyP'); page.wait_for_timeout(200)
        check('P during the count: paused again under the badge', page.evaluate('interlagos.state.paused&&!interlagos.state.resuming') and page.is_visible('#pauseBadge') and page.is_hidden('#raceCountdown'))
        page.wait_for_timeout(2200)
        check('…and it stays paused', page.evaluate('interlagos.state.paused'))
        page.keyboard.press('KeyP'); wait_js(page, 'interlagos.state.resuming', timeout=3000)
        page.keyboard.press('Escape'); page.wait_for_timeout(250)
        check('Escape during the count: the menu', page.evaluate("interlagos.state.paused&&!interlagos.state.resuming&&!document.querySelector('#menu').classList.contains('hidden')"))
        # A new race: its own start countdown only (Recomeçar).
        page.evaluate('window.seen=[];true')
        page.click('#restartRace')
        wait_js(page, "interlagos.ready&&!interlagos.state.paused&&!interlagos.state.resuming")
        page.wait_for_timeout(300)
        check('Recomeçar: no resume count', not page.evaluate('interlagos.state.resuming'))
        check('no page errors', not errors, errors[:3])
    except Exception as e:
        check('ran to the end', False, repr(e)[:300])
    browser.close()
print('PASSED' if not failed else f'FAILED: {failed}')
sys.exit(1 if failed else 0)
