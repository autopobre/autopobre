"""Browser check: the on-screen rear-view mirror of the outside views 1 to 4 (user, 2026-10-24).

    python verificar_retrovisor_tela.py [porta]

A single race at Interlagos: views 1-4 (Perseguição, próxima, distante, Capô) show the small mirror at the top middle
(body.hud-mirror, its picture redrawn behind the car: a rival on the grid behind shows in it), the cockpit (5) keeps its
own mirror and no on-screen one, the TV/aerial/orbit views none; Retrovisores Desligados turns it off. Shots in
renders/retrovisor_tela (or SHOTS_DIR)."""
import os
import sys
from pathlib import Path
from browser_config import browser_executable, browser_args, wait_js, start_race, wait_race_start
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PORTA = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/?intro=0'
SHOTS = Path(os.environ.get('SHOTS_DIR', ROOT / 'renders' / 'retrovisor_tela'))
SHOTS.mkdir(parents=True, exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
failed, errors = [], []
MODES = ['chase', 'close', 'far', 'hood', 'cockpit', 'tv', 'aerial', 'orbit']


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f' · {detail}' if detail != '' else ''), flush=True)
    if not ok:
        failed.append(name)


def fps(page, ms=2500):
    return page.evaluate(f"new Promise(r=>{{let n=0;const t=performance.now();const f=()=>{{n++;if(performance.now()-t<{ms})requestAnimationFrame(f);else r(n*1000/(performance.now()-t));}};requestAnimationFrame(f);}})")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_init_script("""if(!sessionStorage.getItem('espelho')){sessionStorage.setItem('espelho','1');localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,graphics:{level:'alto',overrides:{}}}));}""")
    page = ctx.new_page()
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    try:
        page.goto(URL, wait_until='networkidle')
        wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
        page.fill('#pilotName', 'Piloto espelho')
        page.click('#start'); page.click('#carsNext')
        start_race(page, '#singleRace')
        wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused')
        wait_race_start(page)
        page.click('#view')
        for k, name in enumerate(MODES, start=1):
            page.keyboard.press(f'Digit{k}')
            wait_js(page, f"interlagos.state.mode==='{name}'", timeout=5000)
            page.wait_for_timeout(900)
            shown = page.evaluate("document.body.classList.contains('hud-mirror')")
            check(f'{k} {name}: mirror {"on" if k <= 4 else "off"}', shown == (k <= 4))
            page.screenshot(path=str(SHOTS / f'{k}_{name}.png'))
        # The picture behind the car: the mirror's target is not one flat colour.
        page.keyboard.press('Digit1'); page.wait_for_timeout(800)
        page.screenshot(path=str(SHOTS / 'espelho_detalhe.png'), clip={'x': 520, 'y': 0, 'width': 400, 'height': 90})
        on = fps(page)
        # Retrovisores Desligados: none.
        page.evaluate("interlagosGraficos.set({level:'alto',overrides:{mirrors:'off'}});true"); page.wait_for_timeout(800)
        check('Retrovisores Desligados: no on-screen mirror', not page.evaluate("document.body.classList.contains('hud-mirror')"))
        off = fps(page)
        print(f'fps with the mirror {on:.1f}, without {off:.1f}', flush=True)
        check('no page errors', not errors, errors[:3])
    except Exception as e:
        check('ran to the end', False, repr(e)[:300])
    browser.close()
print('PASSED' if not failed else f'FAILED: {failed}')
sys.exit(1 if failed else 0)
