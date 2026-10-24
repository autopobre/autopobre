"""The car screen's garage up close on a wheel (car-select.js studio, car-garage.js, car-finish.js): the Opala turned
side on, the camera zoomed on its front wheel, the car turned by hand a sixth of a degree per frame (about what the
turntable turns between two frames up close). What showed there (user, 10-24: "o brilho interno na roda do Opala fica
piscando"): the rim's barrel and the tyre's bead are the same surface in the model, and seen inside the barrel they
fought pixel by pixel, a glittering band that changed every frame; the near-mirror rims also swept the garage's thin
light tubes. Fixed by a depth bias on the tyres and a satin rim in the garage (car-finish.js, owner 'estudio').

Checks, on Alto and Médio (1920x1080): bright one-frame flashes (a pixel 40 levels over both its neighbours in time)
inside the barrel behind the spokes stay few, and over the whole wheel stay under a bound; no page errors.

Usage, from the repo root, with the local server running (port: 8799 unless given):
  python pista_interlagos/scripts/verificar_roda_garagem.py [porta]
Frames: a temporary folder (printed), or the folder given in RODA_SHOTS.
"""
import io
import json
import os
import sys
import tempfile
from pathlib import Path
import browser_config  # noqa: F401  (headless, the page's own pointer lock: before any page is made)
from browser_config import browser_executable, browser_args, wait_js
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops

PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = os.environ.get('INTERLAGOS_URL', f'http://127.0.0.1:{PORT}/pista_interlagos/teste/')
OUT = Path(os.environ.get('RODA_SHOTS') or tempfile.mkdtemp(prefix='roda_garagem_'))
OUT.mkdir(parents=True, exist_ok=True)
# The car turned side on (a 175 px drag from its first yaw), the zoom aimed at the front wheel (fractions of the stage),
# the wheel's box on the screen after it and, inside it, the barrel's lower half seen through the spokes.
TURN, AIM, NOTCHES = 175, (.797, .697), 8
WHEEL, BARREL = (1080, 380, 1720, 960), (200, 280, 420, 500)
FRAMES, STEP, SPIKE = 20, .3, 40
# Before the fix: about 80 flashes a frame in the barrel on Médio (15 on Alto), 350-470 over the wheel; after: 2-3 and 160-200.
LIMITS = {'barrel': 12, 'wheel': 300}
errors, checks = [], {}


def check(name, value):
    checks[name] = bool(value)
    print(('ok   ' if value else 'FAIL ') + name, flush=True)
    assert value, name


def flashes(frames, box=None):
    """Mean count per frame of pixels brighter by SPIKE than both the frame before and the one after."""
    if box:
        frames = [f.crop(box) for f in frames]
    counts = []
    for before, now, after in zip(frames, frames[1:], frames[2:]):
        over = ImageChops.subtract(now, ImageChops.lighter(before, after)).point(lambda v: 255 if v > SPIKE else 0)
        counts.append(over.histogram()[255])
    return sum(counts) / max(1, len(counts))


def run(p, level):
    prefs = json.dumps({'graphics': {'level': level, 'overrides': {}}, 'carStill': True})
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1920, 'height': 1080})
    context.add_init_script(f"localStorage.setItem('opala99-preferences-v1',{json.dumps(prefs)});")
    page = context.new_page(); page.set_default_timeout(180000)
    page.on('pageerror', lambda e: errors.append(f'{level}: {e}'))
    page.goto(URL, wait_until='networkidle')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Roda'); page.click('#start')
    wait_js(page, "interlagosCarros.info().live", timeout=180000); page.wait_for_timeout(1500)
    stage = page.locator('#carStage').bounding_box(); cx, cy = stage['x'] + stage['width'] / 2, stage['y'] + stage['height'] / 2
    page.mouse.move(cx, cy); page.mouse.down()
    for k in range(1, 11):
        page.mouse.move(cx + TURN * k / 10, cy)
    page.mouse.up(); page.wait_for_timeout(600)
    page.mouse.move(stage['x'] + stage['width'] * AIM[0], stage['y'] + stage['height'] * AIM[1])
    for _ in range(NOTCHES):
        page.mouse.wheel(0, -120); page.wait_for_timeout(40)
    page.wait_for_timeout(2500)
    frames = []
    for i in range(FRAMES):
        page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx + STEP, cy); page.mouse.up()
        page.wait_for_timeout(120)
        frames.append(Image.open(io.BytesIO(page.screenshot())).convert('L').crop(WHEEL))
    frames[0].save(OUT / f'roda_{level}.png')
    browser.close()
    barrel, wheel = flashes(frames, BARREL), flashes(frames)
    print(f'{level}: flashes a frame, barrel {barrel:.1f}, whole wheel {wheel:.1f}', flush=True)
    check(f'{level}: the barrel behind the spokes does not glitter (< {LIMITS["barrel"]})', barrel < LIMITS['barrel'])
    check(f'{level}: the wheel does not sparkle as the car turns (< {LIMITS["wheel"]})', wheel < LIMITS['wheel'])


with sync_playwright() as p:
    for level in ('alto', 'medio'):
        run(p, level)
check('no page errors', not errors)
print('frames in', OUT)
