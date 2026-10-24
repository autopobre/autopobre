"""Kléber Eletric's box in Modo História, in a real browser (story-scene.js, stage 2 of pedidos #3/#4).

Round 1 of the season opens on the welcome played at the door of Kléber's garage (#70): the stage shows,
the camera leaves the paddock, the lines are subtitles under the scene and the HUD is gone; Stevan is in
street clothes there and in Kléber's loaned black overalls in the paddock afterwards (also at the wheel).
Then the overalls given back (Stevan in his red ones, the bag changing hands, Kléber as a businessman)
and a deadline missed. Screenshots of every line go to the given folder.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_cena_kleber.py [pasta_das_fotos] [circuito]
"""
from browser_config import browser_executable, browser_args, wait_js, open_menu, GAME_URL, start_race
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, sys
ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'renders' / 'cena_kleber'
CIRCUIT = sys.argv[2] if len(sys.argv) > 2 else None
SHOTS.mkdir(parents=True, exist_ok=True)
report = {'errors': [], 'checks': {}}
HOOK = '''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();return true;}'''


def check(name, value):
    report['checks'][name] = bool(value); print(name, bool(value), flush=True); assert value, name


def frames(page, n=4):
    for _ in range(n): page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')


def shot(page, name, settle=900):
    page.wait_for_timeout(settle); frames(page); page.screenshot(path=str(SHOTS / f'{name}.png'))


def scene(page): return page.evaluate('fixtureMode.visual.storyScene.info()')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args())
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    try:
        open_menu(page, URL)
        page.fill('#pilotName', 'Stevan')
        page.click('#storyStart')
        wait_js(page, "!document.querySelector('#championshipStart').disabled")
        if CIRCUIT:
            page.evaluate(f"window.interlagosHistoria.race&&(document.querySelector('[data-circuit=\"{CIRCUIT}\"]')?.click(),true)")
            page.evaluate('window.interlagosHistoria.race()')
        else:
            start_race(page, '#championshipStart')
        wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused')
        page.evaluate(HOOK); wait_js(page, "fixtureMode.state.phase==='crowd'")
        page.evaluate('interlagos.skipIntro?.()'); frames(page)
        info = scene(page)
        check('welcome_on_stage', info['active'] and info['act'] == 'intro' and info['outfit'] == 'civil' and info['kleberLook'] == 'pilot')
        check('cutscene_hides_hud', page.evaluate("document.body.classList.contains('story-cutscene')&&getComputedStyle(document.querySelector('#immersiveHud')).display==='none'"))
        check('subtitle_under_scene', page.evaluate("(()=>{const r=document.querySelector('#immersivePanel').getBoundingClientRect();return document.querySelector('#immersivePanel').classList.contains('career-cutscene')&&r.top>innerHeight*.55})()"))
        cam = page.evaluate('fixtureMode.camera.position.toArray()')
        k = info['kleber']
        check('camera_at_kleber_box', ((cam[0] - k[0]) ** 2 + (cam[2] - k[2]) ** 2) ** .5 < 12)
        check('paddock_pilot_out_of_sight', not page.evaluate('fixtureMode.visual.hero.visible'))
        for i in range(7):
            info = scene(page)
            shot(page, f'40_boas_vindas_{i + 1}_{info["view"]}')
            page.keyboard.press('Enter')
        frames(page)
        check('first_challenge_after_talk', page.evaluate("fixtureMode.state.sceneCard()?.type==='challenge'") and not scene(page)['active'])
        page.keyboard.press('Enter'); frames(page)
        check('paddock_back_in_loaned_overalls', page.evaluate("fixtureMode.visual.hero.visible&&fixtureMode.visual.outfit==='emprestado'&&!document.body.classList.contains('story-cutscene')"))
        shot(page, '41_paddock_macacao_emprestado')
        check('driver_wears_loaned_suit', page.evaluate("fixtureMode.visual.driver.info().suit==='emprestado'"))
        # The overalls given back: Stevan in his own red ones, the bag goes to Kléber, the businessman.
        page.evaluate("""async()=>{const m=await import('./story-career.js');const s=fixtureMode.state;s.openScene('report',m.DONE_LINES.macacao.map((l,i)=>m.lineCard(l,'macacao','done',i)));fixtureMode.ui();}""")
        frames(page)
        info = scene(page)
        check('return_scene', info['active'] and info['act'] == 'done' and info['outfit'] == 'proprio' and info['kleberLook'] == 'business' and info['bag'] == 'pilot')
        shot(page, '42_devolucao_1_entrega', 1400)
        page.keyboard.press('Enter'); page.wait_for_timeout(1500); frames(page)
        check('bag_to_kleber', scene(page)['bag'] == 'kleber')
        shot(page, '43_devolucao_2_recebe', 200)
        # Then Kléber's jokes about the overalls, ending on his support (story-career.js DONE_LINES.macacao).
        for i in range(2, 6):
            page.keyboard.press('Enter'); frames(page)
            shot(page, f'43_devolucao_{i + 1}_{scene(page)["view"]}')
        check('bag_stays_with_kleber', scene(page)['bag'] == 'kleber' and scene(page)['index'] == 5)
        page.keyboard.press('Enter'); frames(page)
        # A deadline missed: Stevan still in the loaned overalls.
        page.evaluate("""async()=>{const m=await import('./story-career.js');const s=fixtureMode.state;s.openScene('report',m.MISSED_LINES.macacao.map((l,i)=>m.lineCard(l,'macacao','missed',i)));fixtureMode.ui();}""")
        frames(page)
        info = scene(page)
        check('missed_scene', info['active'] and info['act'] == 'missed' and info['outfit'] == 'emprestado' and info['kleberLook'] == 'pilot')
        for i in range(3):
            shot(page, f'44_prazo_{i + 1}_{scene(page)["view"]}')
            page.keyboard.press('Enter')
        frames(page)
        check('scene_closed', not scene(page)['active'] and not page.evaluate("document.body.classList.contains('story-cutscene')"))
        report['circuit'] = page.evaluate('interlagos.circuit')
    finally:
        browser.close()
check('no_page_errors', not report['errors'])
print(json.dumps(report, ensure_ascii=False, indent=1))
