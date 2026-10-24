"""A cinematic picture of every circuit for the track screen (menus.css .track-photo, main.js showCircuitPhoto).

    python gerar_fotos_pistas.py [porta] [circuito ...] [--png PASTA]
    python gerar_fotos_pistas.py --regrade PASTA     (grades again the frames a --png run kept, no browser)

Drives the game in a headless browser: each circuit is loaded at Ultra, at the golden hour (Fim de tarde, dry), in a
solo practice (no rivals), the page's controls hidden; the camera is held over the circuit (interlagosLuz.photo, track
frame) on a line set against the sun's (side and back light: long shadows, the haze lit), far enough to see the whole
lap. The frame is cut to the track screen's wide band (the far horizon mostly out: the city's far blocks stand in the
haze there) and graded as a film still: contrast, warm highlights over teal shadows, a soft bloom and a vignette.
Writes teste/assets/circuitos/cenas/<circuito>.webp; --png keeps the untouched frame. Run it again after a circuit's
scenery changes; new circuits also go in publicacao.py (CIRCUIT_SCENES)."""
import json
import math
import sys
from pathlib import Path
from browser_config import browser_executable, browser_args, wait_js, start_race
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
def option(name):
    return Path(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else None


PNG, REGRADE = option('--png'), option('--regrade')
args = [a for a in sys.argv[1:] if not a.startswith('--') and Path(a) not in (PNG, REGRADE)]
PORTA = args[0] if args else '8799'
WANTED = args[1:]
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
OUT = ROOT / 'teste' / 'assets' / 'circuitos' / 'cenas'
OUT.mkdir(parents=True, exist_ok=True)
if PNG:
    PNG.mkdir(parents=True, exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
# The camera against the sun (degrees round from the sun's bearing: 180 = straight into it), its distance in lap
# spans and its height in degrees over the circuit. A circuit can have its own.
VIEW = (140, .95, 30)
VIEWS = {'minhocao': (120, .42, 30)}  # the elevated road among the blocks: from closer
SIZE = (1600, 728)


def grade(frame):
    """The film look: the wide band, contrast and colour, warm highlights over teal shadows, a bloom, a vignette."""
    im = frame.convert('RGB')
    w, h = im.size
    band = round(w * SIZE[1] / SIZE[0])
    top = round((h - band) * .62)
    im = im.crop((0, top, w, top + band)).resize(SIZE, Image.LANCZOS)
    im = ImageEnhance.Contrast(im).enhance(1.1)
    im = ImageEnhance.Color(im).enhance(1.12)
    luma = im.convert('L')
    shadows = luma.point(lambda v: round(max(0, 120 - v) * .55))
    highlights = luma.point(lambda v: round(max(0, v - 120) * .32))
    im = Image.composite(Image.new('RGB', SIZE, (14, 52, 58)), im, shadows)
    im = Image.composite(Image.new('RGB', SIZE, (255, 196, 120)), im, highlights)
    glow = luma.point(lambda v: 255 if v > 200 else round(max(0, v - 150) * 5)).filter(ImageFilter.GaussianBlur(26))
    bloom = Image.composite(im, Image.new('RGB', SIZE), glow).filter(ImageFilter.GaussianBlur(18))
    im = Image.blend(im, ImageChops.screen(im, bloom), .26)
    vignette = Image.new('L', SIZE, 0)
    ImageDraw.Draw(vignette).ellipse((-SIZE[0] * .18, -SIZE[1] * .32, SIZE[0] * 1.18, SIZE[1] * 1.32), fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(120))
    return Image.composite(im, ImageEnhance.Brightness(im).enhance(.45), vignette)


def shoot(browser, cid):
    prefs = json.dumps({'graphics': {'level': 'ultra', 'overrides': {}}, 'timeOfDay': 'fim_de_tarde', 'rain': 'seco', 'circuit': cid, 'immersive': False})
    ctx = browser.new_context(viewport={'width': 1920, 'height': 1080})
    ctx.add_init_script(f"if(!sessionStorage.getItem('cena')){{sessionStorage.setItem('cena','1');localStorage.setItem('opala99-preferences-v1',{json.dumps(prefs)});}}")
    page = ctx.new_page()
    page.set_default_timeout(400000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(f'{URL}?circuito={cid}&intro=0', wait_until='networkidle')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Fotografo')
    page.click('#start')
    page.click('#carsNext')
    start_race(page, '#soloRace')
    wait_js(page, f"window.interlagos?.ready&&interlagos.circuit==={cid!r}&&!interlagos.state.paused", timeout=400000)
    page.add_style_tag(content='body>*:not(#view){visibility:hidden!important}')
    page.wait_for_timeout(2500)
    x0, x1, y0, y1, z = page.evaluate("(()=>{const a=interlagos.car.data.samples;let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z=0;for(const r of a){x0=Math.min(x0,r[1]);x1=Math.max(x1,r[1]);y0=Math.min(y0,r[2]);y1=Math.max(y1,r[2]);z+=r[3];}return [x0,x1,y0,y1,z/a.length];})()")
    sun = page.evaluate('interlagosLuz.info().sun.direction')
    turn, reach, height = VIEWS.get(cid, VIEW)
    cx, cy, span = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0)
    a = math.atan2(-sun[2], sun[0]) + math.radians(turn)
    dist = span * reach
    frm = [cx + math.cos(a) * dist, cy + math.sin(a) * dist, z + dist * math.tan(math.radians(height))]
    page.evaluate(f"interlagosLuz.photo({{from:{frm},at:[{cx},{cy},{z}],fov:38,world:true}})")
    page.wait_for_timeout(2500)
    page.evaluate('interlagosClima.settle()')
    page.wait_for_timeout(1500)
    raw = OUT / f'_{cid}.png'
    page.locator('#view').screenshot(path=str(raw))
    ctx.close()
    frame = Image.open(raw)
    if PNG:
        frame.save(PNG / f'{cid}.png')
    grade(frame).save(OUT / f'{cid}.webp', 'WEBP', quality=80, method=6)
    raw.unlink()
    print(f'{cid}.webp', (OUT / f'{cid}.webp').stat().st_size, 'bytes', 'span', round(span), 'errors', errors[:2], flush=True)


def main():
    if REGRADE:
        for frame in sorted(REGRADE.glob('*.png')):
            grade(Image.open(frame)).save(OUT / f'{frame.stem}.webp', 'WEBP', quality=80, method=6)
            print(f'{frame.stem}.webp', (OUT / f'{frame.stem}.webp').stat().st_size, 'bytes', flush=True)
        return
    with sync_playwright() as p:
        run(p)


def run(p):
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page()
    page.goto(URL, wait_until='networkidle')
    circuits = page.evaluate("import('./circuits.js').then(m=>Object.keys(m.CIRCUITS))")
    page.close()
    for cid in circuits:
        if not WANTED or cid in WANTED:
            shoot(browser, cid)
    browser.close()


if __name__ == '__main__':
    main()
