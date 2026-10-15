"""Gráficos tab and performance overlay in the browser, on a computer and a phone.

The tab (levels, a change by hand, restore), each level applied in a race and read back from the
renderer (interlagosGraficos.info()), F3, mirrors off, the scenery rebuilt at the next start, the
choice after a reload, and the phone's Automático (Médio) with the overlay at the top centre.
Usage: verificar_graficos.py [port]   (INTERLAGOS_URL overrides the address; shots go to a temp folder,
or to GRAFICOS_OUT)."""
import json, os, sys, tempfile
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import browser_config  # noqa: F401  (headless + in-page pointer lock)
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, enter_track, wait_race_start, wait_js, pause_race
from playwright.sync_api import sync_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else None
URL = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace(':8799', ':' + PORT) if PORT else GAME_URL)
OUT = Path(os.environ.get('GRAFICOS_OUT') or tempfile.mkdtemp(prefix='graficos_'))
OUT.mkdir(parents=True, exist_ok=True)
SCALE = 1
errors, results = [], {}


def watch(page):
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)
    page.on('response', lambda r: errors.append(f'{r.status} {r.url}') if r.status >= 400 and not r.url.endswith('tracks.json') else None)


def info(page):
    return page.evaluate('interlagosGraficos.info()')


def check(name, ok, detail=''):
    results[name] = bool(ok)
    print(('PASS ' if ok else 'FAIL ') + name, detail if not ok else '', flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    ctx = browser.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=SCALE)
    page = ctx.new_page(); page.set_default_timeout(120000); watch(page)
    open_menu(page, URL)
    g = info(page)
    check('desktop_auto_is_alto', g['level'] == 'alto' and g['auto'] and g['changed'] == [], g)
    page.click('#settingsButton'); page.click('#tab-graphics')
    check('tab_visible', page.is_visible('#settings-graphics') and page.locator('.graphics-level').count() == 5 and page.locator('#graphicsControls select').count() == 20)
    check('high_refresh_choices', page.locator('#gfx-fpsLimit option[value="160"]').count() == 1 and page.locator('#gfx-targetFps option[value="144"]').count() == 1)
    check('race_tab_lost_old_controls', page.locator('#cinematicLevel').count() == 0 and page.locator('#realisticWater').count() == 0)
    page.locator('#settings').screenshot(path=str(OUT / 'aba_graficos_desktop.png'))
    # The cards say which machine each level is for; Automático, what it picked here and why (the video chip).
    cards = {lv: page.inner_text(f'#gfxLevel-{lv} small') for lv in ('auto', 'baixo', 'medio', 'alto', 'ultra')}
    check('cards_name_the_machine', 'vídeo integrado' in cards['baixo'] and 'intermediário' in cards['medio'] and 'placa de vídeo' in cards['alto'] and 'forte' in cards['ultra'], cards)
    check('auto_card_says_why', 'Alto neste computador' in cards['auto'] and g['device']['reason'] in cards['auto'] and g['device']['tier'], {'card': cards['auto'], 'device': g['device']})
    # Manual change in the menu: shows as a change, Restore drops it.
    page.select_option('#gfx-shadows', 'media')
    g = info(page)
    check('manual_change_kept', g['stored'] == {'level': 'auto', 'overrides': {'shadows': 'media'}} and g['changed'] == ['shadows'], g['stored'])
    check('summary_mentions_change', 'Sombras' in page.inner_text('#graphicsSummary') and page.is_visible('#graphicsRestore'))
    page.locator('#settings').screenshot(path=str(OUT / 'aba_graficos_ajustada.png'))
    page.click('#graphicsRestore')
    check('restore_clears', info(page)['stored'] == {'level': 'auto', 'overrides': {}})
    page.click('#settingsClose')
    # Into a race.
    enter_track(page); wait_race_start(page)
    g = info(page)
    check('alto_applied', g['shadow']['size'] == 4096 and g['shadow']['cast'] and g['mirror'] == [1020, 170] and g['cinematic']['level'] == 'full' and g['cinematic']['ao'] and g['cinematic']['lens'] and g['fog'] == [520, 3300] and g['scenery'] == 'completo', json.dumps(g)[:600])
    # F3 cycles the overlay.
    page.keyboard.press('F3')
    check('f3_fps', page.evaluate("interlagosGraficos.info().debug.mode") == 'fps' and page.is_visible('div#debugOverlay') and page.evaluate("document.querySelectorAll('#debugOverlay').length") == 1 and page.evaluate("document.querySelector('#debugMode').value") == 'fps')
    page.keyboard.press('F3'); page.wait_for_timeout(2500)
    d = info(page)['debug']
    check('f3_full', d['mode'] == 'full' and d['fps'] > 1 and len(d['rows']) >= 8, d)
    print('overlay rows:', json.dumps(d['rows'], ensure_ascii=False), flush=True)
    page.screenshot(path=str(OUT / 'telinha_completa_alto.png'))
    per_level = {}
    for level in ['baixo', 'medio', 'alto', 'ultra']:
        page.evaluate("l=>interlagosGraficos.set({level:l,overrides:{}})", level)
        wait_js(page, '!interlagosGraficos.info().compiling')
        page.wait_for_timeout(4000)
        g = info(page)
        per_level[level] = {'fps': round(g['debug']['fps'], 1), 'gpu': g['debug']['gpu'] and round(g['debug']['gpu'], 2), 'cpu': round(g['debug']['cpu'], 2), 'ratio': g['pixelRatio'],
                            'shadow': g['shadow'], 'cinematic': {k: g['cinematic'][k] for k in ('level', 'samples', 'ao', 'lens', 'passes')}, 'fog': g['fog'], 'far': g['far'], 'mirror': g['mirror'], 'water': g['water'], 'fpsLimit': g['fpsLimit']}
        print(level, json.dumps(per_level[level]), flush=True)
        page.screenshot(path=str(OUT / f'nivel_{level}.png'))
    b, u = per_level['baixo'], per_level['ultra']
    check('baixo_applied', not b['shadow']['cast'] and b['cinematic']['level'] == 'off' and b['fog'] == [300, 1600] and b['far'] == 1900 and b['mirror'] == [340, 57] and b['fpsLimit'] == 60, b)
    check('ultra_applied', u['shadow']['size'] >= 4096 and u['shadow']['reach'] == 120 and u['water'] is True and u['fog'] == [700, 4600], u)
    check('simple_has_no_post_effects', b['cinematic']['passes'] == 1 and not b['cinematic']['ao'] and not b['cinematic']['lens'], b['cinematic'])
    check('surface_quality_tracks_preset', page.evaluate('interlagos.surfaceInfo().quality') == 'ultra')
    page.evaluate("interlagosGraficos.set({level:'alto',overrides:{targetFps:160,fpsLimit:120}})")
    wait_js(page, '!interlagosGraficos.info().compiling')
    g = info(page)
    check('dynamic_target_respects_cap_and_screen', 0 < g['resolution']['targetFps'] <= min(120,g['resolution']['cadence']), g['resolution'])
    # Manual settings in a race: mirrors off, light film look, no motion blur, 30 FPS (33 on a 165 Hz screen: whole
    # screen frames, graphics-settings.js FrameLimiter).
    page.evaluate("interlagosGraficos.set({level:'alto',overrides:{mirrors:'off',post:'lite',fpsLimit:30,antialias:0}})")
    page.wait_for_timeout(3500)
    g = info(page)
    check('manual_in_race', g['cinematic']['level'] == 'lite' and g['cinematic']['samples'] == 0 and g['fpsLimit'] == 30 and g['debug']['fps'] < 36, {'c': g['cinematic'], 'fps': g['debug']['fps']})
    # Cockpit with mirrors off renders no mirror pass.
    page.evaluate("interlagosGraficos.set({level:'alto',overrides:{mirrors:'off'}})")
    page.keyboard.press('KeyC'); page.keyboard.press('KeyC'); page.keyboard.press('KeyC')
    page.wait_for_timeout(800)
    mode = page.evaluate('interlagos.state.mode')
    if mode == 'cockpit':
        before = page.evaluate('interlagos.cockpitInfo().mirrorFrame'); page.wait_for_timeout(500)
        check('mirrors_off_skip_pass', page.evaluate('interlagos.cockpitInfo().mirrorFrame') == before)
        page.evaluate("interlagosGraficos.set({level:'alto',overrides:{}})"); page.wait_for_timeout(500)
        check('mirrors_on_render', page.evaluate('interlagos.cockpitInfo().mirrorFrame') > before)
        page.screenshot(path=str(OUT / 'interna_retrovisor.png'))
    else:
        print('camera after 3x C:', mode)
    # A heavy race: Automático steps down one level, says so and remembers it, taking the step at the next pause (never
    # mid-race: its programs compile with the game stopped); a level by hand only gets a hint.
    page.evaluate("interlagosGraficos.set({level:'auto',overrides:{}})")
    g = page.evaluate('interlagosGraficos.heavy()')
    check('auto_step_waits_for_a_pause', g['level'] == 'alto' and g['device']['drop'] == 'medio' and 'Médio' in page.inner_text('#status') and 'pausa' in page.inner_text('#status'), {'level': g['level'], 'device': g['device'], 'status': page.inner_text('#status')})
    page.keyboard.press('KeyP'); wait_js(page, 'interlagos.state.paused')
    g = page.evaluate('interlagosGraficos.info()')
    check('auto_steps_down_once', g['level'] == 'medio' and g['stored'] == {'level': 'auto', 'overrides': {}} and g['device']['drop'] == 'medio', {'level': g['level'], 'device': g['device']})
    page.keyboard.press('KeyP'); wait_js(page, '!interlagos.state.paused')
    g = page.evaluate('interlagosGraficos.forget()')
    check('forget_brings_auto_back', g['level'] == 'alto' and g['device']['drop'] is None, g['device'])
    page.evaluate("interlagosGraficos.set({level:'ultra',overrides:{}})")
    g = page.evaluate('interlagosGraficos.heavy()')
    check('hand_level_only_hinted', g['level'] == 'ultra' and g['stored']['level'] == 'ultra' and 'Alto' in page.inner_text('#status'), page.inner_text('#status'))
    # The rivals' levels of detail follow Detalhe dos carros.
    lods = {}
    for level, near in (('baixo', 7), ('ultra', 32)):
        page.evaluate("l=>interlagosGraficos.set({level:l,overrides:{}})", level); wait_js(page, '!interlagosGraficos.info().compiling'); page.wait_for_timeout(600)
        lods[level] = page.evaluate('interlagos.rivalLod()')
    check('rival_detail_per_level', lods['baixo']['near'] == 7 and lods['ultra']['near'] == 32 and lods['baixo']['far'] < lods['ultra']['far'], lods)
    page.evaluate("interlagosGraficos.set({level:'alto',overrides:{}})")
    # Scenery: a change waits for the next start, then rebuilds the circuit.
    trees = page.evaluate('interlagos.sceneryInfo().trees')
    page.evaluate("interlagosGraficos.set({level:'alto',overrides:{scenery:'basico'}})")
    check('scenery_waits', info(page)['scenery'] == 'completo')
    pause_race(page); page.click('#restartRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused')
    wait_race_start(page)
    g = info(page); fewer = page.evaluate('interlagos.sceneryInfo().trees')
    check('scenery_rebuilt', g['scenery'] == 'basico' and fewer < trees * .85, {'before': trees, 'after': fewer})
    page.evaluate("interlagosGraficos.set({level:'auto',overrides:{}})")
    page.wait_for_timeout(500)
    # Reload keeps the overlay and the level.
    page.evaluate("interlagosGraficos.set({level:'medio',overrides:{water:'realista'}})")
    open_menu(page, URL)
    g = info(page)
    check('reload_keeps', g['stored'] == {'level': 'medio', 'overrides': {'water': 'realista'}} and g['debug']['mode'] == 'full', g['stored'])
    page.evaluate("interlagosGraficos.set({level:'auto',overrides:{}})")
    ctx.close()
    # Phone: Automático is Médio, the overlay sits at the top centre, the tab fits the screen.
    ctx = browser.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True, device_scale_factor=SCALE)
    page = ctx.new_page(); page.set_default_timeout(120000); watch(page)
    open_menu(page, URL)
    g = info(page)
    check('phone_auto_is_medio', g['level'] == 'medio' and g['auto'], g)
    page.tap('#settingsButton' if page.is_visible('#settingsButton') else '#touchMenu'); page.tap('#tab-graphics')
    page.screenshot(path=str(OUT / 'aba_graficos_celular.png'))
    page.locator('#gfxLevel-baixo').scroll_into_view_if_needed(); page.tap('#gfxLevel-baixo')
    check('phone_tap_level', info(page)['stored'] == {'level': 'baixo', 'overrides': {}})
    page.select_option('#debugMode', 'full')
    page.tap('#settingsClose')
    enter_track(page, tap=True); wait_race_start(page); page.wait_for_timeout(2500)
    g = info(page)
    check('phone_baixo_in_race', g['pixelRatio'] <= .75 and not g['shadow']['cast'] and g['cinematic'] is not None and g['debug']['corner'] == 'tc', {'r': g['pixelRatio'], 'corner': g['debug']['corner']})
    box = page.locator('div#debugOverlay').bounding_box()
    check('phone_overlay_inside_screen', box and box['x'] >= 0 and box['x'] + box['width'] <= 844 and box['y'] >= 0, box)
    page.screenshot(path=str(OUT / 'celular_baixo_telinha.png'))
    page.evaluate("interlagosGraficos.set({level:'medio',overrides:{}})"); page.wait_for_timeout(2500)
    page.screenshot(path=str(OUT / 'celular_medio_telinha.png'))
    page.evaluate("interlagosGraficos.set({level:'auto',overrides:{}})")
    ctx.close(); browser.close()

check('no_page_errors', not errors, errors[:10])
(OUT / 'resultado.json').write_text(json.dumps({'results': results, 'levels': per_level, 'errors': errors}, indent=1, ensure_ascii=False), encoding='utf-8')
print('FAILED' if not all(results.values()) else 'ALL PASSED', 'shots in', OUT, flush=True)
sys.exit(0 if all(results.values()) else 1)
