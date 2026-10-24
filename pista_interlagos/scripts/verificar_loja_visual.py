"""The Visual screen's store (teste/visual-shop.js, look-select.js): round the pilot on the Visual screen (the car screen's
Visual tab) stands the team's racewear store, built on the first visit: the lit helmet cabinet with the fitting alcove
right behind the pilot (a calm curtain so the suit stands out), suits face-out and on racks, mannequins, boots and gloves,
the shop's sign and neon, and a fitting mirror that shows the pilot's back (the floor reflects too on Alto and Ultra).

Checks, on a computer (1920x1080) and a phone in landscape (844x390, touch): the store is built and drawn (its info hook),
the mirror drawn, the first visit's cost (build, programs, the longest main-thread task), the alcove behind the pilot
calmer than the helmet wings either side of it (pixels), the Baixo level without the floor's mirror, no page errors.

Usage, from the repo root, with the local server running (port: 8799 unless given):
  python pista_interlagos/scripts/verificar_loja_visual.py [porta]
Screenshots: a temporary folder (printed), or the folder given in LOJA_SHOTS.
"""
import io
import os
import sys
import tempfile
from pathlib import Path
import browser_config  # noqa: F401  (headless, the page's own pointer lock: before any page is made)
from browser_config import browser_executable, browser_args, wait_js, open_menu
from playwright.sync_api import sync_playwright
from PIL import Image

PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = os.environ.get('INTERLAGOS_URL', f'http://127.0.0.1:{PORT}/pista_interlagos/teste/')
OUT = Path(os.environ.get('LOJA_SHOTS') or tempfile.mkdtemp(prefix='loja_visual_'))
OUT.mkdir(parents=True, exist_ok=True)
errors, checks = [], {}
INFO = 'interlagosVisual.info()'
# Long main-thread tasks from the page's start (the first visit's freezes).
LONG_TASKS = """window.__longTasks=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__longTasks.push([e.startTime,e.duration]);}).observe({type:'longtask',buffered:true});}catch{}"""


def check(name, value):
    checks[name] = bool(value)
    print(('ok   ' if value else 'FAIL ') + name, flush=True)
    assert value, name


def shot(page, name):
    path = OUT / f'loja_{name}.png'
    page.screenshot(path=str(path))
    return Image.open(io.BytesIO(path.read_bytes())).convert('RGB')


def colourful(image, box):
    """Mean chroma (max - min of a pixel's channels) and the spread of its brightness over a box of the picture."""
    data = image.crop(tuple(int(v) for v in box)).tobytes()
    pixels = [data[i:i + 3] for i in range(0, len(data), 3)]
    chroma = sum(max(p) - min(p) for p in pixels) / len(pixels)
    light = [sum(p) / 3 for p in pixels]
    mean = sum(light) / len(light)
    spread = (sum((v - mean) ** 2 for v in light) / len(light)) ** .5
    return chroma, spread


def open_visual(page, pilot):
    open_menu(page, URL)
    page.fill('#pilotName', pilot)
    page.click('#start')
    wait_js(page, 'window.interlagosCarros?.info().live', timeout=120000)
    started = page.evaluate('performance.now()')
    page.click('#carsVisual')
    wait_js(page, f'{INFO}.live&&{INFO}.store?.frames>20', timeout=60000)
    live = page.evaluate('performance.now()') - started
    longest = page.evaluate('s=>Math.max(0,...window.__longTasks.filter(t=>t[0]+t[1]>=s).map(t=>t[1]))', started)
    return live, longest


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())

    # A computer at Alto: the floor's mirror and the fitting mirror.
    context = browser.new_context(viewport={'width': 1920, 'height': 1080})
    context.add_init_script(LONG_TASKS)
    context.add_init_script("if(!sessionStorage.getItem('loja-seeded')){sessionStorage.setItem('loja-seeded','1');localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,camera:'cockpit',laps:3}));}")
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    live, longest = open_visual(page, 'Loja Visual')
    page.evaluate("interlagosGraficos.set({level:'alto',overrides:{}});true")
    page.wait_for_timeout(3000)
    store = page.evaluate(INFO)['store']
    timing = store['timing']
    print(f"  first visit: live {live:.0f} ms after the click; pilot {timing['pilot']} ms, store {timing['store']} ms (built {store['buildMs']} ms), "
          f"programs {timing['compile']} ms ({timing['programs']} in all); longest task {longest:.0f} ms", flush=True)
    check('the store is built round the pilot (helmets, mannequins, the alcove)', store['built'] and store['helmets'] >= 12 and store['mannequins'] == 2 and store['alcove'])
    check(f"the store is drawn ({store['frames']} frames, {store['calls']} draw calls in {store['passes']} pictures)", store['frames'] > 20 and store['calls'] > 40)
    check('Alto: the floor and the fitting mirror reflect the store', store['floorMirror'] and store['mirrorShown'] and store['passes'] == 3)
    check(f"the first visit stays light (store {timing['store']} ms, programs {timing['compile']} ms, longest task {longest:.0f} ms)",
          timing['store'] < 1500 and timing['compile'] < 4000 and longest < 1500)
    page.evaluate("interlagosVisual.view('corpo',0)")
    page.wait_for_timeout(1500)
    image = shot(page, '01_frente')
    # Behind the pilot (left of his arm, above the helmet in his hand) the alcove's curtain; farther out the helmet cabinet.
    stage = page.locator('#visualStage').bounding_box()
    cx, w, top, h = stage['x'] + stage['width'] / 2, stage['width'], stage['y'], stage['height']
    alcove = colourful(image, (cx - .26 * w, top + .15 * h, cx - .19 * w, top + .5 * h))
    wing = colourful(image, (cx - .5 * w, top + .15 * h, cx - .33 * w, top + .5 * h))
    print(f'  behind the pilot: chroma {alcove[0]:.1f}, spread {alcove[1]:.1f}; helmet wing: chroma {wing[0]:.1f}, spread {wing[1]:.1f}', flush=True)
    check('the alcove behind the pilot is calmer than the helmet wing beside it', alcove[0] < wing[0] * .75 and alcove[1] < wing[1])
    page.evaluate("interlagosVisual.view('corpo',3.14)")
    page.wait_for_timeout(1500)
    shot(page, '02_costas')
    page.evaluate("interlagosVisual.view('cabeca',0)")
    page.wait_for_timeout(1500)
    shot(page, '03_cabeca')
    page.evaluate("interlagosVisual.view('corpo')")
    # Baixo: no floor mirror, the fitting mirror still (cheap: drawn in its rectangle only).
    page.evaluate("interlagosGraficos.set({level:'baixo',overrides:{}});true")
    page.wait_for_timeout(3000)
    store = page.evaluate(INFO)['store']
    check('Baixo: no floor mirror, the fitting mirror still shows the pilot', not store['floorMirror'] and store['mirrorShown'] and store['passes'] == 2)
    shot(page, '04_baixo')
    page.keyboard.press('Escape')
    wait_js(page, "interlagosVisual.info().screen==='cars'")
    check('Escape: back to the car screen, its garage drawn again', page.evaluate('interlagosCarros.info().live'))
    context.close()

    # A phone in landscape.
    context = browser.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=3, is_mobile=True, has_touch=True)
    context.add_init_script(LONG_TASKS)
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    live, longest = open_visual(page, 'Loja Fone')
    store = page.evaluate(INFO)['store']
    print(f"  phone: live {live:.0f} ms after the click; store {store['timing']['store']} ms, programs {store['timing']['compile']} ms; longest task {longest:.0f} ms", flush=True)
    check('phone: the store is built and drawn, the fitting mirror too', store['built'] and store['frames'] > 20 and store['mirrorShown'])
    page.wait_for_timeout(1200)
    shot(page, '05_fone')
    context.close()
    browser.close()

check(f'no page errors ({errors[:3]})', not errors)
print(f'{sum(checks.values())}/{len(checks)} checks passed; screenshots in {OUT}')
