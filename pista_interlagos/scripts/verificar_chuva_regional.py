"""Browser check for Aleatório's regional rain (Central #10, weather.js rainOdds, rain-climate.js).

A championship round with a date races its city's month: the story's Old Stock 2026 opens in Brasília on 21 and
22 March, so the draw's rain is read at Brasília's March odds; a single race at Interlagos (no date) at São Paulo's
year. Both races' rain is the draw's roll at those odds.
Honours INTERLAGOS_URL (default: the 8799 server)."""
import json
import os
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, GAME_URL
from playwright.sync_api import sync_playwright

URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
ODDS = "async([id,month])=>{const {rainOdds}=await import('./weather.js');return rainOdds(id,month);}"
report = {'errors': []}


def rain_at(roll, odds):
    edge = 0
    for level in ('seco', 'garoa', 'chuva'):
        edge += odds[level]
        if roll < edge:
            return level
    return 'chuva'


def close(a, b):
    return all(abs(a[k] - b[k]) < 1e-9 for k in ('seco', 'garoa', 'chuva'))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    for name, story, championship, circuit, month in [('oldstock_brasilia_march', True, True, 'brasilia', 2), ('single_interlagos_year', False, False, 'interlagos', None)]:
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        context.add_init_script("""localStorage.setItem('opala99-preferences-v1',JSON.stringify({timeOfDay:'aleatorio',rain:'aleatorio',circuit:'interlagos',carModel:'opala'}));""")
        page = context.new_page()
        page.set_default_timeout(180000)
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        open_menu(page, URL)
        enter_track(page, 'Piloto chuva', story=story, championship=championship)
        wait_js(page, f"window.interlagos?.ready&&interlagos.circuit==='{circuit}'", timeout=180000)
        got = page.evaluate('window.interlagosClima.info()')
        want = page.evaluate(ODDS, [circuit, month])
        report[name] = {'odds': got['odds'], 'want': want, 'roll': got['roll'], 'rain': got['rain'], 'draw': got['draw']}
        assert close(got['odds'], want), (name, got['odds'], want)
        assert got['rain'] == got['draw']['rain'] == rain_at(got['roll'], want), (name, got)
        print(name, True, flush=True)
        context.close()
    browser.close()
print(json.dumps(report, indent=1, ensure_ascii=False), flush=True)
assert not report['errors'], report['errors']
print("Aleatório's rain at the city's month (dated round) and year (single race): verified")
