"""Browser check for three menu changes asked on 2026-10-24.

    python verificar_menus_corrida.py [porta]

Track screen: the rivals' level (Adversários) and the gearbox (Câmbio) beside the laps, the time and the weather, the
same preferences as 01 Corrida's Adversários and 04 Controles' Câmbio: each select follows the other, and the choice is
saved. Áudio: no "Usar motor sintetizado" option, and an old save that had it on plays the recorded engines. Gráficos:
Automático's card names the level it picked, large ("→ Alto"), that level's card carries the "Escolhido pelo Automático"
tag, and the summary says the Automático chose it. Shots in renders/menus (or SHOTS_DIR)."""
import json
import os
import sys
from pathlib import Path
from browser_config import browser_executable, browser_args, wait_js
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PORTA = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
SHOTS = Path(os.environ.get('SHOTS_DIR', ROOT / 'renders' / 'menus'))
SHOTS.mkdir(parents=True, exist_ok=True)
errors, failed = [], []
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f' · {detail}' if detail != '' else ''), flush=True)
    if not ok:
        failed.append(name)


def saved():
    return page.evaluate("JSON.parse(localStorage.getItem('opala99-preferences-v1')||'{}')")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    # A save from before: the synthesized engine on (the option this check finds gone).
    context.add_init_script("""if(!sessionStorage.getItem('menus-seeded')){sessionStorage.setItem('menus-seeded','1');
     localStorage.setItem('opala99-audio',JSON.stringify({volume:.55,musicVolume:.35,effectsVolume:1,muted:false,synthEngine:true}));}""")
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    try:
        page.goto(URL, wait_until='networkidle')
        wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
        # --- Áudio.
        page.click('#settingsButton')
        page.click('#tab-audio')
        check('Áudio has no "Usar motor sintetizado"', page.query_selector('#synthEngine') is None and 'sintetizado' not in page.inner_text('#settings-audio'))
        check('an old save with the synthesized engine on plays the recordings', page.evaluate('interlagos.audioInfo().synthEngine') is False)
        # --- Gráficos.
        page.click('#tab-graphics')
        picked = page.inner_text('#gfxLevel-auto .graphics-picked')
        implied = page.eval_on_selector_all('.graphics-level.implied', 'cs=>cs.map(c=>c.dataset.level)')
        tag = page.eval_on_selector_all('.graphics-level', "cs=>cs.filter(c=>getComputedStyle(c.querySelector('.graphics-auto-tag')??document.body).display!=='none'&&c.querySelector('.graphics-auto-tag')).map(c=>c.dataset.level)")
        names = {'baixo': 'Baixo', 'medio': 'Médio', 'alto': 'Alto', 'ultra': 'Ultra'}
        level = implied[0] if implied else None
        check('Automático names the level it picked, large', bool(level) and picked == f'→ {names[level]}', f'{picked!r} for {implied}')
        check('only that level carries the tag', tag == implied and len(tag) == 1, tag)
        summary = page.inner_text('#graphicsSummary')
        check('the summary says the Automático chose it', bool(level) and summary.startswith(f'O Automático escolheu o nível {names[level]}'), summary)
        page.screenshot(path=str(SHOTS / 'graficos_automatico.png'))
        # Another level picked: no tag, the auto card keeps naming what it would pick.
        page.click('#gfxLevel-baixo')
        check('a level picked by hand shows no tag', not page.eval_on_selector_all('.graphics-level.implied', 'cs=>cs.length'))
        page.click('#gfxLevel-auto')
        page.click('#tab-race')
        page.select_option('#aiLevel', 'alto')
        page.click('#settingsClose')
        # --- Track screen.
        page.fill('#pilotName', 'Piloto teste')
        page.click('#start')
        if page.is_visible('#cars'):
            page.click('#carsNext')
        wait_js(page, "!document.querySelector('#singleRace').disabled")
        options = page.eval_on_selector_all('#tracksAiLevel option', 'os=>os.map(o=>[o.value,o.textContent])')
        check('track screen: Adversários with the four levels', options == [['facil', 'Fácil'], ['medio', 'Médio'], ['alto', 'Alto'], ['impossivel', 'Impossível']], options)
        check('it shows the level picked in the settings', page.input_value('#tracksAiLevel') == 'alto')
        page.select_option('#tracksAiLevel', 'impossivel')
        check('picked there, it is saved and the settings follow', saved().get('aiLevel') == 'impossivel' and page.input_value('#aiLevel') == 'impossivel')
        check('track screen: Câmbio, automatic by default', page.input_value('#tracksGearbox') == 'automatico' and page.input_value('#gearbox') == 'automatico')
        page.select_option('#tracksGearbox', 'manual')
        check('picked there, the gearbox is saved and Controles follows', saved().get('gearbox') == 'manual' and page.input_value('#gearbox') == 'manual')
        page.locator('.tracks-side').screenshot(path=str(SHOTS / 'pistas_adversarios_cambio.png'))
        page.set_viewport_size({'width': 844, 'height': 390})
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOTS / 'pistas_celular_deitado.png'))
        page.select_option('#tracksGearbox', 'automatico')
        page.select_option('#tracksAiLevel', 'facil')
        check('and back', saved().get('gearbox') == 'automatico' and saved().get('aiLevel') == 'facil')
        check('no page errors', not errors, errors[:3])
    except Exception as e:
        failed.append(repr(e))
        print('FAIL', repr(e), errors[:3], flush=True)
    finally:
        browser.close()
print(json.dumps({'passed': not failed, 'failed': failed}, ensure_ascii=False))
sys.exit(1 if failed else 0)
