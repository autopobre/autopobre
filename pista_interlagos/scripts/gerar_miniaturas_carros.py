"""Pictures of every car of the car screen's grids, for its strip of cars (car-select.js).

    python gerar_miniaturas_carros.py [porta] [--png PASTA]

Drives the game in a headless browser: the car screen builds each car of the Opala's and the Fusca's fields as it
races (the rivals' paint, numbers and sponsors), and interlagosCarros.snapshot() photographs it alone, front
three-quarters on, on a see-through ground (car-select.js Studio.snapshot). Writes
teste/assets/carros/miniaturas/<modelo>_<número>.webp, plus opala_99_seiva.webp, the 99 in its Seiva · Danilo paint
(the Pintura setting). Run it again whenever a livery, a number or the roster changes; new files also go in
publicacao.py (ASSETS, CAR_THUMBS). --png keeps a PNG copy of each in that folder."""
import base64
import sys
from pathlib import Path
from browser_config import browser_executable, browser_args, wait_js
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8799'
PNG = Path(sys.argv[sys.argv.index('--png') + 1]) if '--png' in sys.argv else None
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
OUT = ROOT / 'teste' / 'assets' / 'carros' / 'miniaturas'
OUT.mkdir(parents=True, exist_ok=True)
if PNG:
    PNG.mkdir(parents=True, exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
errors = []


def save(page, name):
    shot = page.evaluate('interlagosCarros.snapshot()')
    if not shot:
        raise RuntimeError(f'no picture of {name}')
    for kind, folder in (('webp', OUT), ('png', PNG)):
        if folder:
            data = base64.b64decode(shot[kind].split(',', 1)[1])
            (folder / f'{name}.{kind}').write_bytes(data)
    print(f'{name}.webp', (OUT / f'{name}.webp').stat().st_size, 'bytes', flush=True)


def shown(page, model, number):
    wait_js(page, f"(i=>i.live&&i.builtModel==={model!r}&&i.built==={number!r})(interlagosCarros.info())", timeout=60000)
    page.wait_for_timeout(250)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL, wait_until='networkidle')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    if page.is_visible('#pilotName') and not page.input_value('#pilotName'):
        page.fill('#pilotName', 'Miniaturas')
    page.click('#start')
    for model in ('opala', 'fusca'):
        page.click(f'#carModels [data-model="{model}"]')
        numbers = page.evaluate(f"import('./race-roster.js').then(m=>m.rosterOf({model!r}).choices.map(c=>c.number))")
        for number in numbers:
            page.evaluate(f'interlagosCarros.pick({number!r})')
            shown(page, model, number)
            save(page, f'{model}_{number}')
    # The 99 in its other paint: the Pintura setting swaps the Opala's model (main.js openCarScreen).
    page.click('#carModels [data-model="opala"]')
    page.evaluate("interlagosCarros.pick('99')")
    page.click('#carsBack')
    page.click('#settingsButton')
    page.click('#tab-race')
    page.select_option('#livery', 'seiva_danilo')
    page.click('#settingsClose')
    page.click('#start')
    wait_js(page, "interlagosCarros.info().livery==='seiva_danilo'", timeout=60000)
    page.wait_for_timeout(1500)
    shown(page, 'opala', '99')
    save(page, 'opala_99_seiva')
    page.click('#carsBack')
    page.click('#settingsButton')
    page.select_option('#livery', 'assinaturas_omp')
    page.click('#settingsClose')
    browser.close()
print('errors:', errors or 'none')
