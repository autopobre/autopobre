"""Cost of each weather on the GPU and the frame (Alto, fixed resolution): drives a few seconds per weather and reads
the performance overlay (debug-overlay.js) and the draw calls.

Uso: python scripts/medir_clima.py [porta] [climas] [nivel]
  climas: horario/chuva separados por virgula (padrao: dia/seco,fim_de_tarde/seco,noite/seco,dia/chuva,noite/chuva)
"""
import json
import sys
from playwright.sync_api import sync_playwright
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, race_options, enter_track, wait_race_start, wait_js

PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
WEATHERS = (sys.argv[2] if len(sys.argv) > 2 else 'dia/seco,fim_de_tarde/seco,noite/seco,dia/chuva,noite/chuva').split(',')
LEVEL = sys.argv[3] if len(sys.argv) > 3 else 'alto'
URL = GAME_URL.replace(':8799', ':' + PORT) + '?circuito=interlagos'
results, errors = {}, []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args() + ['--use-angle=d3d11'], headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append(str(e)))
    open_menu(page, URL)
    page.evaluate("l=>window.interlagosGraficos.set({level:l,overrides:{dynamicResolution:false}})", LEVEL)
    page.evaluate("()=>{const s=document.getElementById('debugMode');s.value='full';s.dispatchEvent(new Event('change'));return true;}")
    race_options(page, camera='chase')
    enter_track(page, 'Piloto medida')
    wait_race_start(page)
    for weather in WEATHERS:
        time, rain = weather.split('/')
        page.evaluate('w=>window.interlagosClima.set(w)', {'time': time, 'rain': rain})
        wait_js(page, '!window.interlagosClima.info().compiling', timeout=90000)
        page.evaluate('interlagos.reposition(0)')
        page.keyboard.down('KeyW')
        page.wait_for_timeout(4000)
        samples = []
        for _ in range(8):
            page.wait_for_timeout(500)
            samples.append(page.evaluate('(()=>{const d=window.interlagosGraficos.info().debug;return {fps:d.fps,ms:d.ms,gpu:d.gpu??null,calls:window.interlagos.state?.drawCalls??null};})()'))
        page.keyboard.up('KeyW')
        med = lambda k: sorted(s[k] for s in samples if s[k] is not None)[len(samples) // 2] if any(s[k] is not None for s in samples) else None
        results[weather] = {k: med(k) for k in ('fps', 'ms', 'gpu', 'calls')}
        print(weather, results[weather], flush=True)
    browser.close()
print(json.dumps({'level': LEVEL, 'results': results, 'errors': errors[:5]}, ensure_ascii=False))
