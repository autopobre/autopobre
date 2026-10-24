"""Browser check for Central #17's cockpit and tank (race-roster.js LUIZAO_CARS, cockpit.js setLuizao, fuel.js TANK).

Modo Corrida in the #73 (Konrad Viehmann's): the switch bank and the relay board without the Luizão Racing logo; in
the #70 (Kleber Eletric's), with it. Both start at Interlagos with the HUD's tank at 15 L. Screenshots from the cockpit
view (key 5). Honours INTERLAGOS_URL (default: the 8799 server); screenshots in SHOTS_DIR (default renders/)."""
import json
import os
from pathlib import Path
from browser_config import browser_executable, browser_args, wait_js, open_menu, wait_race_start, GAME_URL
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
SHOTS = Path(os.environ.get('SHOTS_DIR', ROOT / 'renders'))
report = {'errors': [], 'checks': {}, 'cars': {}}


def check(name, value, detail=None):
    report['checks'][name] = bool(value)
    print(name, bool(value), flush=True)
    assert value, (name, detail)


def race_in(browser, number):
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    if not page.input_value('#pilotName'):
        page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    wait_js(page, "interlagosCarros.info().live", timeout=180000)
    page.evaluate(f"interlagosCarros.pick('{number}')")
    page.click('#carsNext')
    page.click('#singleRace')
    wait_js(page, 'interlagos.ready&&!interlagos.state.paused', timeout=240000)
    info = page.evaluate("()=>({luizao:interlagos.cockpitInfo().luizao,raceCar:interlagosCarros.info().raceCar,tank:document.querySelector('#fuelTank').textContent,bar:+document.querySelector('#fuelBar').max})")
    wait_race_start(page)
    page.keyboard.press('Digit5')
    page.wait_for_timeout(1200)
    page.screenshot(path=str(SHOTS / f'painel_luizao_{number}.png'))
    report['cars'][number] = info
    page.close()
    return info


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    other = race_in(browser, '73')
    check('no_logo_in_other_cars', other['raceCar'] == '73' and other['luizao'] is False, other)
    kleber = race_in(browser, '70')
    check('logo_in_luizao_cars', kleber['raceCar'] == '70' and kleber['luizao'] is True, kleber)
    check('tank_is_15_litres', all(i['tank'] == '15 L' and i['bar'] == 15 for i in (other, kleber)), report['cars'])
    browser.close()
print(json.dumps(report, indent=1, ensure_ascii=False), flush=True)
assert not report['errors'], report['errors']
print('Luizão Racing logo only in its cars, 15 L tank: verified')
