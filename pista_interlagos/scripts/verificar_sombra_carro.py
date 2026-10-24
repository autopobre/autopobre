"""The cars' crisp shadow map (car-shadow.js) per graphics level, with pictures to look at.

Usage: verificar_sombra_carro.py [port] [out_dir] [levels comma list]
Defaults: port 8799, out .audit-local/sombra-carro, all four levels. Run with no other GPU check in parallel.

Per level, a Corrida 1x1 at Interlagos, the Opala parked beside the main grandstand and the race held (P):
- the map is drawn only on Alto and Ultra (interlagosLuz.info().car), sized from SHADOW_LEVELS;
  on the grid Ultra also gives the rival beside the Opala its own tile;
- switching it off changes the ground round the car on Alto/Ultra and nothing on Baixo/Médio;
- seen from above, its edges are sharper than the sun map's alone (fewer half-tones across the edge);
- pictures: chase and close at rest, a low side view of the shadow and the view from above.
Pixel numbers are diagnostic beyond the asserts; the pictures are for judging the look.
"""
import json, math, sys
from io import BytesIO
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import browser_config  # noqa: F401  headless + in-page pointer lock
from browser_config import browser_executable, browser_args, open_menu, wait_js, wait_race_start, start_race
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops, ImageFilter, ImageStat

PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else Path.cwd() / '.audit-local' / 'sombra-carro').resolve(); OUT.mkdir(parents=True, exist_ok=True)
LEVELS = sys.argv[3].split(',') if len(sys.argv) > 3 else ['baixo', 'medio', 'alto', 'ultra']
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/?circuito=interlagos&intro=0'
HIDE_UI = 'body *{visibility:hidden!important} #view{visibility:visible!important}'
CAMERA = "m=>{const s=document.getElementById('camera');s.value=m;s.dispatchEvent(new Event('change'));}"
# [s, lateral, speed]: beside the grandstand (blocks span s~4086..4255 on the car's right), at rest.
PLACE = """([s,d,speed])=>{const c=interlagos.car,a=c.data.samples;let i=0;for(let k=0;k<a.length;k++)if(Math.abs(a[k][0]-s)<Math.abs(a[i][0]-s))i=k;
 interlagos.reposition(i);const p=a[i];c.x+=p[9]*d;c.y+=p[10]*d;c.settle?.();
 c.vx=Math.cos(c.heading)*speed;c.vy=Math.sin(c.heading)*speed;c.awaitingStart=false;return i;}"""
# Camera poses in the car's frame (x ahead, y up, z to its right): the sun comes from behind on the
# right on this straight, so the shadow lies on the car's left.
SIDE = {'from': [2.2, 1.3, -5.6], 'at': [-.3, .2, -.8], 'fov': 42}
ABOVE = {'from': [0.0, 9.5, -1.6], 'at': [0.0, 0.0, -1.6], 'fov': 40}
REPORT = {'checks': {}, 'levels': {}}


def check(name, ok, detail=None):
    REPORT['checks'][name] = {'passed': bool(ok), 'detail': detail}
    print(('PASS ' if ok else 'FAIL ') + name, '' if ok else detail, flush=True)


def frames(page, n=4):
    first = page.evaluate('interlagos.cockpitInfo().renderedFrame')
    wait_js(page, 'n=>interlagos.cockpitInfo().renderedFrame>=n', arg=first + n, timeout=60000)


def grab(page, name):
    frames(page, 4)
    data = page.screenshot(path=str(OUT / f'{name}.png'))
    image = Image.open(BytesIO(data)).convert('RGB')
    stats = ImageStat.Stat(image)
    return image, {'brightness': round(sum(stats.mean) / 3, 1), 'variation': round(sum(stats.stddev) / 3, 1)}


def luma(image):
    return image.convert('L')


def edge_sharpness(on, off):
    """Where the car's map changes the picture: the share of half-tones between shade and sun.

    A crisp edge leaves few pixels between the two; a soft one a wide band of them. The sun map's
    dithered edge would fool a plain gradient, so both pictures are blurred by a pixel first."""
    diff = ImageChops.difference(luma(on), luma(off))
    mask = diff.point(lambda v: 255 if v > 6 else 0).filter(ImageFilter.MaxFilter(9)).tobytes()
    out = {}
    for label, image in (('on', on), ('off', off)):
        values = sorted(v for v, m in zip(luma(image).filter(ImageFilter.GaussianBlur(1)).tobytes(), mask) if m)
        if not values:
            out[label] = 0.0
            continue
        lo, hi = values[len(values) // 10], values[len(values) * 9 // 10]
        out[label] = round(sum(1 for v in values if lo + .3 * (hi - lo) < v < lo + .7 * (hi - lo)) / len(values), 3)
    out['changed'] = sum(1 for m in mask if m)
    out['meanDiff'] = round(ImageStat.Stat(diff).mean[0], 3)
    out['maxDiff'] = diff.getextrema()[1]
    return out


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    for level in LEVELS:
        ctx = browser.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1, reduced_motion='no-preference')
        prefs = {'circuit': 'interlagos', 'immersive': False, 'duelRival': '73', 'camera': 'chase', 'debugOverlay': 'off',
                 'graphics': {'level': level, 'overrides': {'dynamicResolution': False}}}
        ctx.add_init_script('localStorage.setItem("opala99-preferences-v1",JSON.stringify(' + json.dumps(prefs) + '));')
        page = ctx.new_page(); page.set_default_timeout(180000)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if (m.type == 'error' and not m.text.startswith('Failed to load resource')) or
                (m.type == 'warning' and any(t in m.text for t in ('GL_INVALID', 'Shader Error', 'VALIDATE_STATUS'))) else None)
        open_menu(page, URL, timeout=180000)
        if page.is_visible('#pilotName') and not page.input_value('#pilotName'):
            page.fill('#pilotName', 'Sombra')
        page.click('#start')
        if page.is_visible('#cars'):
            page.click('#carsNext')
        start_race(page, '#duelRace')
        wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused', timeout=180000)
        page.evaluate('interlagos.skipIntro()')
        wait_js(page, "!document.querySelector('#raceCountdown').hidden", timeout=30000)
        wait_js(page, '!interlagosGraficos.info().compiling', timeout=60000)
        # On the grid, the 1x1 rival beside the Opala: Ultra gives it a tile of its own too.
        grid = page.evaluate('interlagosLuz.info().car')
        check(f'{level}_grid_tiles', grid['cars'] == {'alto': 1, 'ultra': 2}.get(level, 0), grid)
        wait_race_start(page)
        page.evaluate(PLACE, [4170, -1.5, 0])
        page.wait_for_timeout(2500)   # eye adaptation settles (it holds while the race is held)
        page.keyboard.press('KeyP')
        wait_js(page, 'interlagos.state.paused')
        page.add_style_tag(content=HIDE_UI)
        frames(page, 3)
        row = {'light': page.evaluate('interlagosLuz.info()'), 'shots': {}}
        car = row['light']['car']
        expected = level in ('alto', 'ultra')
        check(f'{level}_car_map_only_on_alto_ultra', car['active'] == expected and (car['drawCalls'] > 0) == expected, car)
        if expected:
            check(f'{level}_car_map_size', car['tile'] == 1024 and car['reach'] > 3 and car['texelCm'] < 1.2, car)
        _, row['shots']['chase'] = grab(page, f'{level}_chase')
        page.evaluate(CAMERA, 'close'); page.wait_for_timeout(1200)
        _, row['shots']['close'] = grab(page, f'{level}_close')
        page.evaluate('pose=>interlagosLuz.photo(pose)', SIDE); page.wait_for_timeout(1200)
        _, row['shots']['side'] = grab(page, f'{level}_lado')
        page.evaluate('pose=>interlagosLuz.photo(pose)', ABOVE); page.wait_for_timeout(1500)
        on, row['shots']['above'] = grab(page, f'{level}_cima')
        page.evaluate("interlagosLuz.set({carShadow:{off:true}});true"); page.wait_for_timeout(300)
        off, _ = grab(page, f'{level}_cima_sem_mapa')
        page.evaluate("interlagosLuz.set({carShadow:{off:false}});true")
        page.evaluate('interlagosLuz.photo(null)')
        sharp = edge_sharpness(on, off)
        row['edges'] = sharp
        if expected:
            check(f'{level}_car_map_changes_ground', sharp['changed'] > 400 and sharp['meanDiff'] > .05, sharp)
            check(f'{level}_car_map_sharper_edges', sharp['on'] < sharp['off'] * .75, sharp)
        else:
            check(f'{level}_no_car_map_no_change', sharp['maxDiff'] <= 2, sharp)
        for name, shot in row['shots'].items():
            check(f'{level}_{name}_image_ok', 8 < shot['brightness'] < 247 and shot['variation'] > 10, shot)
        check(f'{level}_no_errors', not errors, errors[:5])
        row['errors'] = errors[:5]
        REPORT['levels'][level] = row
        print(level, json.dumps({'car': car, 'edges': sharp, 'shots': row['shots']}, ensure_ascii=False), flush=True)
        ctx.close()
    browser.close()

(OUT / 'resultado.json').write_text(json.dumps(REPORT, indent=1, ensure_ascii=False), encoding='utf-8')
W, H = 640, 360
for kind in ('chase', 'close', 'lado', 'cima'):
    shots = [OUT / f'{lv}_{kind}.png' for lv in LEVELS if (OUT / f'{lv}_{kind}.png').exists()]
    if shots:
        from PIL import ImageDraw
        mosaic = Image.new('RGB', (2 * W, ((len(shots) + 1) // 2) * H), (20, 20, 20)); draw = ImageDraw.Draw(mosaic)
        for i, s in enumerate(shots):
            x, y = (i % 2) * W, (i // 2) * H
            mosaic.paste(Image.open(s).convert('RGB').resize((W, H)), (x, y)); draw.text((x + 8, y + 6), s.stem, fill=(255, 255, 0))
        mosaic.save(OUT / f'mosaico_{kind}.jpg', quality=86)
failed = [k for k, v in REPORT['checks'].items() if not v['passed']]
print('sombra do carro:', 'OK' if not failed else 'FALHOU ' + ', '.join(failed), OUT)
sys.exit(1 if failed else 0)
