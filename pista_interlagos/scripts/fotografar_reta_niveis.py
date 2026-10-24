"""Chase camera at speed on the Interlagos main straight beside the grandstand, per graphics level:
before/after shots, a mosaic per view and the frame cost of each level.

Usage: fotografar_reta_niveis.py <port> <out_dir> [levels comma list] [device scale] [overrides JSON]
Each level loads in a fresh context (scenery is built per level), Treino solo, no rivals. Overrides
are added to every level (e.g. '{"cameraMotion":0}' for pixel-aligned A/B shots).
Output: <level>_chase_movendo/_parado.png, <level>_close_parado.png, mosaico_*.jpg, resultado.json.
"""
import json, math, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import browser_config  # noqa: F401  headless + in-page pointer lock
from browser_config import browser_executable, browser_args, open_menu, wait_js, wait_race_start, start_race
from playwright.sync_api import sync_playwright

PORT = sys.argv[1]
OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
LEVELS = sys.argv[3].split(',') if len(sys.argv) > 3 else ['baixo', 'medio', 'alto', 'ultra']
DSF = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0   # device pixel ratio of the emulated screen (1.5/2 lets Alto/Ultra densities apply)
EXTRA = json.loads(sys.argv[5]) if len(sys.argv) > 5 else {}   # graphics overrides for every level
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/?circuito=interlagos&intro=0'
HIDE_UI = 'body *{visibility:hidden!important} #view{visibility:visible!important}'
S_START, SPEED, LATERAL = 4100, 55, -1.5   # grandstand blocks span s~4086..4255 on the car's right
CAMERA = "m=>{const s=document.getElementById('camera');s.value=m;s.dispatchEvent(new Event('change'));}"
PLACE = """([s,d,speed])=>{const c=interlagos.car,a=c.data.samples;let i=0;for(let k=0;k<a.length;k++)if(Math.abs(a[k][0]-s)<Math.abs(a[i][0]-s))i=k;
 interlagos.reposition(i);const p=a[i];c.x+=p[9]*d;c.y+=p[10]*d;c.settle?.();
 c.vx=Math.cos(c.heading)*speed;c.vy=Math.sin(c.heading)*speed;c.gear=5;c.awaitingStart=false;return i;}"""


def frames(page, n):
    first = page.evaluate('interlagos.cockpitInfo().renderedFrame')
    wait_js(page, 'n=>interlagos.cockpitInfo().renderedFrame>=n', arg=first + n, timeout=60000)


def measure(page, seconds=3.0):
    page.wait_for_timeout(int(seconds * 1000))
    g = page.evaluate('interlagosGraficos.info()')
    snap = page.evaluate('interlagos.cameraSnapshot()')
    d = g['debug']
    rows = dict(d['rows'])
    dist = math.dist(snap['position'], snap['car'])
    # Rough on-screen height of a 1.4 m tall car at the camera distance (vertical fov).
    frac = 1.4 / (2 * dist * math.tan(math.radians(snap['fov']) / 2))
    return {'fps': round(d['fps'], 1), 'gpuMs': d['gpu'] and round(d['gpu'], 2), 'cpuMs': round(d['cpu'], 2), 'low1': round(d['low'], 1),
            'pixelRatio': g['pixelRatio'], 'imagem': rows.get('Imagem'), 'desenho': rows.get('Desenho'), 'naPlaca': rows.get('Na placa'),
            'cinematic': {k: g['cinematic'][k] for k in ('level', 'passes', 'samples', 'ao', 'lens', 'width', 'height', 'quality')},
            'shadow': g['shadow'], 'fog': g['fog'], 'camera': {'fov': round(snap['fov'], 2), 'distance': round(dist, 2), 'carScreenHeight': round(frac, 3)}}


report = {}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    for level in LEVELS:
        ctx = browser.new_context(viewport={'width': round(1920 / DSF), 'height': round(1080 / DSF)}, device_scale_factor=DSF, reduced_motion='no-preference')
        prefs = {'circuit': 'interlagos', 'immersive': False, 'camera': 'chase', 'debugOverlay': 'full',
                 'graphics': {'level': level, 'overrides': {'dynamicResolution': False, **EXTRA}}}
        ctx.add_init_script('localStorage.setItem("opala99-preferences-v1",JSON.stringify(' + json.dumps(prefs) + '));')
        page = ctx.new_page(); page.set_default_timeout(180000)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)
        t0 = time.monotonic()
        open_menu(page, URL, timeout=180000)
        t_menu = time.monotonic() - t0
        if page.is_visible('#pilotName') and not page.input_value('#pilotName'):
            page.fill('#pilotName', 'Piloto reta')
        page.click('#start')
        if page.is_visible('#cars'):
            page.click('#carsNext')
        t1 = time.monotonic()
        start_race(page, '#soloRace')
        wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused', timeout=180000)
        t_load = time.monotonic() - t1
        page.evaluate('interlagos.skipIntro()')
        wait_race_start(page)
        wait_js(page, '!interlagosGraficos.info().compiling', timeout=60000)
        t_ready = time.monotonic() - t1
        scenery = page.evaluate('({trees:interlagos.sceneryInfo().trees,grassTufts:interlagos.sceneryInfo().grassTufts??0,fans:interlagos.sceneryInfo().fans,surface:interlagos.surfaceInfo().quality})')
        index = page.evaluate(PLACE, [S_START, LATERAL, SPEED])
        frames(page, 3)
        before = page.evaluate('interlagos.cockpitInfo().renderedFrame'); w0 = time.monotonic()
        page.keyboard.down('KeyW')
        page.wait_for_timeout(1000)
        tele = page.evaluate('interlagos.telemetry()')
        moving_fps = (page.evaluate('interlagos.cockpitInfo().renderedFrame') - before) / (time.monotonic() - w0)
        page.screenshot(path=str(OUT / f'{level}_chase_movendo.png'))
        page.keyboard.press('KeyP')   # hold(): race frozen on screen, frame loop keeps drawing
        page.keyboard.up('KeyW')
        wait_js(page, 'interlagos.state.paused')
        style = page.add_style_tag(content=HIDE_UI)
        frozen = measure(page, 3.0)
        page.screenshot(path=str(OUT / f'{level}_chase_parado.png'))
        page.evaluate(CAMERA, 'close')
        close = measure(page, 2.5)
        page.screenshot(path=str(OUT / f'{level}_close_parado.png'))
        report[level] = {'index': index, 'telemetry': {k: tele[k] for k in ('s', 'speed', 'onRoad')}, 'movingFps': round(moving_fps, 1),
                         'seconds': {'menu': round(t_menu, 1), 'loadCircuit': round(t_load, 1), 'toDrivable': round(t_ready, 1)},
                         'scenery': scenery, 'chase': frozen, 'close': close, 'errors': errors[:5]}
        print(level, json.dumps(report[level], ensure_ascii=False), flush=True)
        ctx.close()
    browser.close()

(OUT / 'resultado.json').write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding='utf-8')
from PIL import Image, ImageDraw
for kind in ('chase_parado', 'close_parado', 'chase_movendo'):
    shots = [OUT / f'{lv}_{kind}.png' for lv in LEVELS if (OUT / f'{lv}_{kind}.png').exists()]
    if not shots:
        continue
    W, H = 960, 540
    mosaic = Image.new('RGB', (2 * W, ((len(shots) + 1) // 2) * H), (20, 20, 20)); draw = ImageDraw.Draw(mosaic)
    for i, s in enumerate(shots):
        x, y = (i % 2) * W, (i // 2) * H
        mosaic.paste(Image.open(s).convert('RGB').resize((W, H)), (x, y)); draw.text((x + 8, y + 6), s.stem, fill=(255, 255, 0))
    mosaic.save(OUT / f'mosaico_{kind}.jpg', quality=86)
print('done', OUT)
