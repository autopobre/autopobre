"""Cars' paint and reflections in the browser (teste/car-finish.js, car-reflections.js; the Gráficos tab's
"Reflexos dos carros").

The car screen's studio lights the paint with its own soft boxes; in a race each level applies its
source (Baixo the sky, Médio the circuit baked from the grid, Alto the probe round the player's car,
Ultra the HD probe and the metallic flake), switched live without a long freeze; the probe keeps
redrawing; the player's, a rival's and the distant model's paint wear the map; a restart bakes the grid
again; back on the car screen the studio's map returns. Shots of the black 99 and a coloured rival
beside the main grandstand (chase, close, hood) per level, and the reflection maps; on each level the 99's
tail panel in the close view stays a gloss black (a dark mirror, not the round-2 primer grey).
Usage: verificar_reflexos.py [port]   (INTERLAGOS_URL overrides the address; shots go to
pista_interlagos/renders/reflexos or REFLEXOS_OUT)."""
import base64, json, os, sys, time
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import browser_config  # noqa: F401  (headless + in-page pointer lock)
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, wait_js, wait_race_start, pause_race, start_race
from playwright.sync_api import sync_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else None
URL = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace(':8799', ':' + PORT) if PORT else GAME_URL)
OUT = Path(os.environ.get('REFLEXOS_OUT') or Path(__file__).resolve().parents[1] / 'renders' / 'reflexos')
OUT.mkdir(parents=True, exist_ok=True)
EXPECTED = {'baixo': ('ceu', 'sky', 'sky'), 'medio': ('pista', 'bake', 'bake'), 'alto': ('dinamico', 'probe', 'probe'), 'ultra': ('dinamico_hd', 'probe', 'probe')}
HIDE_UI = 'body *{visibility:hidden!important} #view{visibility:visible!important}'
CAMERA = "m=>{const s=document.getElementById('camera');s.value=m;s.dispatchEvent(new Event('change'));}"
# The player on the main straight beside the grandstand, rival #7 a few metres ahead on its side (race frozen).
PLACE = """([s,d,ds,rd])=>{const c=interlagos.car,a=c.data.samples,near=s=>{let i=0;for(let k=0;k<a.length;k++)if(Math.abs(a[k][0]-s)<Math.abs(a[i][0]-s))i=k;return i;};
 const i=near(s);interlagos.reposition(i);c.x+=a[i][9]*d;c.y+=a[i][10]*d;c.settle();c.vx=c.vy=0;c.awaitingStart=false;
 const m=window.fixtureMode,r=m.rivals.find(r=>r.entry?.number==='7')??m.rivals[0],j=near(s+ds);
 r.car.recover(j);r.car.x+=a[j][9]*rd;r.car.y+=a[j][10]*rd;r.car.settle();r.car.vx=r.car.vy=0;
 for(const o of m.rivals)if(o!==r&&Math.hypot(o.car.x-c.x,o.car.y-c.y)<40)o.car.recover((j+300)%a.length);
 return r.entry?.number??null;}"""
# The longest gap between two animation frames while fn runs (a shader compile freezing the page shows here).
GAPS = """()=>{window.__gap=0;let last=performance.now();const tick=t=>{window.__gap=Math.max(window.__gap,t-last);last=t;if(window.__gapOn)requestAnimationFrame(tick);};window.__gapOn=true;requestAnimationFrame(tick);}"""
errors, results = [], {}


def watch(page):
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)


def check(name, ok, detail=''):
    results[name] = bool(ok)
    print(('PASS ' if ok else 'FAIL ') + name, detail if not ok else '', flush=True)


def reflections(page):
    return page.evaluate('interlagosGraficos.info().reflections')


# The 99's tail panel under the lamps, in the car's frame (x forward, y up, z right): where the last picture drew it
# (interlagos.carScreenPoints), its luma (PIL 'L') in the screenshot, 3 px in from its edges.
TAIL = [[-2.215, .40, -.32], [-2.215, .40, .32], [-2.215, .54, .32], [-2.215, .54, -.32]]


def tail_luma(page, path):
    from PIL import Image, ImageDraw, ImageFilter, ImageStat
    pts = page.evaluate('q=>typeof interlagos.carScreenPoints==="function"?interlagos.carScreenPoints(q):null', TAIL)
    if not pts or any(abs(p[2]) > 1 for p in pts):
        return None
    img = Image.open(path).convert('L'); mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).polygon([(p[0], p[1]) for p in pts], fill=255); mask = mask.filter(ImageFilter.MinFilter(7))
    stat = ImageStat.Stat(img, mask)
    if not stat.count[0]:
        return None
    hist = img.histogram(mask); total = sum(hist); seen = 0; p5 = p95 = None
    for v, n in enumerate(hist):
        seen += n
        if p5 is None and seen >= total * .05:
            p5 = v
        if p95 is None and seen >= total * .95:
            p95 = v
    return {'mean': round(stat.mean[0], 1), 'p5': p5, 'p95': p95, 'px': int(stat.count[0])}


def save_map(page, name):
    snap = page.evaluate('interlagosGraficos.reflectionSnapshot()')
    if snap:
        (OUT / f'mapa_{name}.png').write_bytes(base64.b64decode(snap['url'].split(',')[1]))
    return snap and snap['means']


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    ctx = browser.new_context(viewport={'width': 1600, 'height': 900}, reduced_motion='no-preference')
    prefs = {'circuit': 'interlagos', 'immersive': False, 'camera': 'chase', 'graphics': {'level': 'alto', 'overrides': {'dynamicResolution': False, 'cameraMotion': 0}}}
    ctx.add_init_script('localStorage.setItem("opala99-preferences-v1",JSON.stringify(' + json.dumps(prefs) + '));')
    page = ctx.new_page(); page.set_default_timeout(180000); watch(page)
    open_menu(page, URL + '?circuito=interlagos&intro=0', timeout=180000)
    page.evaluate("""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const info=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return info.call(this);};}""")
    if page.is_visible('#pilotName') and not page.input_value('#pilotName'):
        page.fill('#pilotName', 'Piloto reflexos')
    page.click('#start')
    # The car screen: the studio's soft boxes, not a circuit's map.
    wait_js(page, "!document.querySelector('#cars').classList.contains('hidden')")
    wait_js(page, "interlagosGraficos.info().reflections?.owner==='estudio'", timeout=60000)
    page.wait_for_timeout(1500)
    r = reflections(page)
    check('studio_lends_its_map', r['owner'] == 'estudio' and r['envSource'] == 'outro', r)
    page.screenshot(path=str(OUT / 'estudio.png'))
    page.click('#carsNext'); start_race(page, '#singleRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused', timeout=180000)
    page.evaluate('interlagos.skipIntro()'); wait_race_start(page, timeout=60000)
    wait_js(page, '!interlagosGraficos.info().compiling', timeout=60000)
    page.evaluate('interlagos.immersiveInfo();true')
    r = reflections(page)
    check('race_takes_its_map_back', r['owner'] == 'corrida' and r['envSource'] == 'probe', r)
    page.keyboard.press('KeyP'); wait_js(page, 'interlagos.state.paused')
    rival = page.evaluate(PLACE, [4130, -1.2, 8.5, -4.6])
    page.wait_for_timeout(1200)
    style = page.add_style_tag(content=HIDE_UI)
    per_level = {}
    for level in ['baixo', 'medio', 'alto', 'ultra']:
        key, source, env = EXPECTED[level]
        page.evaluate(GAPS)
        t0 = time.monotonic()
        page.evaluate("l=>{interlagosGraficos.set({level:l,overrides:{dynamicResolution:false,cameraMotion:0}});}", level)
        wait_js(page, '!interlagosGraficos.info().compiling', timeout=60000)
        page.wait_for_timeout(1500)
        gap = page.evaluate('window.__gapOn=false;window.__gap')
        r = reflections(page); paint = page.evaluate('interlagos.carPaintInfo()')
        if source == 'probe':
            try:
                wait_js(page, 'n=>interlagosGraficos.info().reflections.updates>n+1', arg=r['updates'], timeout=20000)
            except TimeoutError:
                pass
        later = reflections(page)
        per_level[level] = {'switchS': round(time.monotonic() - t0, 2), 'maxFrameGapMs': round(gap), 'reflections': r,
                            'paint': {k: paint[k] for k in ('profile', 'samples', 'coatRoughness', 'coatEnv', 'flake', 'withEnv', 'materials')}, 'player': paint['player'], 'rival': paint['rival'], 'far': paint['far']}
        print(level, json.dumps(per_level[level], ensure_ascii=False), flush=True)
        check(f'{level}_source', r['level'] == key and r['source'] == source and r['envSource'] == env and r['owner'] == 'corrida', r)
        check(f'{level}_paint_wears_map', all(paint[k] and paint[k]['env'] and paint[k]['patched'] for k in ('player', 'rival')) and paint['far']['env'] and paint['far']['clearcoat'] >= .95, paint)
        check(f'{level}_finish', paint['profile'] == level and paint['player']['name'] == 'Pintura_preta' and paint['player']['clearcoat'] >= .95 and paint['player']['flake'] == (level == 'ultra'), paint['player'])
        check(f'{level}_no_long_freeze', gap < 1500, gap)
        if source == 'probe':
            check(f'{level}_probe_redraws', later['updates'] > r['updates'] and later['faces'] > r['faces'] and r['size'] == (256 if level == 'alto' else 512), (r, later))
        if source == 'bake':
            check(f'{level}_grid_baked', r['bakes'] >= 1, r)
        means = save_map(page, level)
        if means:
            # A real capture: the asphalt below darker than the sky above (probe), something drawn (bake).
            check(f'{level}_map_has_the_circuit', (means[3] < means[2] and min(means) > .005) if len(means) == 6 else means[0] > .02, means)
        for cam in ('chase', 'close', 'hood'):
            page.evaluate(CAMERA, cam); page.wait_for_timeout(1200)
            page.screenshot(path=str(OUT / f'{level}_{cam}.png'))
            if cam == 'close':
                tail = tail_luma(page, OUT / f'{level}_{cam}.png')
                per_level[level]['tail'] = tail
                # Gloss black, not gunmetal: the camera-facing tail panel a dark mirror (round 2: L 36-55, a primer grey).
                # Here the sun is ahead: the tail mirrors the car's own shadow behind it, near black is right.
                check(f'{level}_gloss_black_tail', tail and 1 <= tail['mean'] <= 30, tail)
        page.evaluate(CAMERA, 'chase')
    check('flake_only_on_ultra', [per_level[l]['paint']['flake'] for l in per_level] == [0, 0, 0, 1])
    check('player_paint_hex_kept', all(per_level[l]['player']['color'] == per_level['baixo']['player']['color'] for l in per_level), [per_level[l]['player']['color'] for l in per_level])
    check('coat_floor_without_msaa', per_level['medio']['paint']['samples'] == 0 and per_level['medio']['paint']['coatRoughness'] >= .085 and per_level['alto']['paint']['coatRoughness'] < per_level['medio']['paint']['coatRoughness'], {l: per_level[l]['paint']['coatRoughness'] for l in per_level})
    style.evaluate('s=>s.remove()')
    # A restart (clearCircuit) bakes the grid again and keeps the maps the cars still wear.
    page.evaluate("interlagosGraficos.set({level:'medio',overrides:{}})")
    wait_js(page, '!interlagosGraficos.info().compiling', timeout=60000)
    bakes = reflections(page)['bakes']
    page.keyboard.press('KeyP')
    pause_race(page); page.click('#restartRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused', timeout=180000)
    wait_race_start(page, timeout=60000); page.wait_for_timeout(1500)
    r = reflections(page)
    check('restart_bakes_again', r['envSource'] == 'bake' and r['bakes'] > bakes and page.evaluate('interlagos.carPaintInfo().player.env'), r)
    # Back on the car screen: the studio's map again, never the circuit's.
    page.evaluate('interlagos.immersiveInfo();fixtureMode.onMainMenu();true')
    wait_js(page, "!document.querySelector('#tracks').classList.contains('hidden')")
    page.click('#tracksBack')
    wait_js(page, "!document.querySelector('#cars').classList.contains('hidden')")
    wait_js(page, "interlagosGraficos.info().reflections?.owner==='estudio'", timeout=60000)
    r = reflections(page)
    check('studio_after_race', r['owner'] == 'estudio' and r['envSource'] == 'outro', r)
    page.wait_for_timeout(800); page.screenshot(path=str(OUT / 'estudio_depois.png'))
    page.evaluate("interlagosGraficos.set({level:'auto',overrides:{}})")
    browser.close()

check('no_page_errors', not errors, errors[:5])
(OUT / 'resultado.json').write_text(json.dumps({'results': results, 'levels': per_level, 'errors': errors[:20]}, indent=1, ensure_ascii=False), encoding='utf-8')
print('shots in', OUT)
failed = [k for k, v in results.items() if not v]
print('FAILED: ' + ', '.join(failed) if failed else 'Reflections passed: studio map on the car screen, each level its source live, the probe redraws, paint of the 99, a rival and the distant model on the map, restart rebakes, studio after the race.')
sys.exit(1 if failed else 0)
