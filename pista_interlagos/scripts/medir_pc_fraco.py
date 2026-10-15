"""The game on a cheap PC: Baixo and Médio measured on the integrated video of a two-GPU notebook (Chromium's
--force_low_power_gpu, set here through INTERLAGOS_LOW_POWER_GPU; on a one-GPU machine it is that GPU).
Run with no other GPU check in parallel.

Usage: medir_pc_fraco.py [port] [out_dir] [--segundos=N] [--placa] [--niveis=baixo,medio]
INTERLAGOS_URL overrides the address; out_dir defaults to cwd/.audit-local/pc-fraco (resultado.json).

Per level, as a player gets it (the level's own settings, dynamic resolution on), a 1920x1080 window, Interlagos,
Corrida única with the whole field (15 cars), the race's autopilot driving the player's car through the lap:
- the frames' average rate, 1% low (the mean of the slowest 1% as a rate), worst frame and hitches (graphics overlay
  record, debug-overlay.js frameStats), the GPU and processor time per frame, the pixel density it settled on;
- the frozen start (the pack bunched on the grid): draw calls, triangles and GPU time by part of the scene
  (perf-probe.js cost);
- Automático on this video: the level it picks and why (graphics-settings.js gpuTier).
Targets on integrated video: Baixo 60 FPS average and 45 FPS 1% low, Médio 30 FPS average. Under a target by more
than 10% fails; within 10%, or on other hardware (a graphics card answers instead: run without the low-power
GPU), it only warns. --placa: Alto and Ultra on the default GPU instead, the frame pacing (1% low at least 3/4 of
the average) as a warning, for the level-independent hitch.
"""
import json, os, sys
from pathlib import Path
from urllib.parse import urlencode
sys.path.insert(0, str(Path(__file__).resolve().parent))
FLAGS = {a.split('=')[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
PLACA = bool(FLAGS.get('--placa'))
if not PLACA:
    os.environ.setdefault('INTERLAGOS_LOW_POWER_GPU', '1')
import browser_config  # noqa: E402  headless + in-page pointer lock
from browser_config import GAME_URL, browser_args, browser_executable, open_menu, wait_js, wait_race_start, enter_track  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
PORT = ARGS[0] if ARGS else None
BASE = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace(':8799', ':' + PORT) if PORT else GAME_URL)
URL = BASE.split('?')[0] + '?' + urlencode({'circuito': 'interlagos', 'intro': '0'})
OUT = Path(ARGS[1] if len(ARGS) > 1 else Path.cwd() / '.audit-local' / 'pc-fraco').resolve(); OUT.mkdir(parents=True, exist_ok=True)
SECONDS = float(FLAGS.get('--segundos', 100))
LEVELS = str(FLAGS.get('--niveis', 'alto,ultra' if PLACA else 'baixo,medio')).split(',')
TARGETS = {'baixo': {'fps': 60, 'low1': 45}, 'medio': {'fps': 30}, 'alto': {}, 'ultra': {}}
REPORT = {'checks': {}, 'warnings': [], 'levels': {}, 'errors': []}


def check(name, condition, detail=None, warn=False):
    """A target missed by more than 10% fails; a near miss or other hardware only warns."""
    REPORT['checks'][name] = {'passed': bool(condition), 'warning': bool(warn and not condition), 'detail': detail}
    tag = 'PASS' if condition else 'WARN' if warn else 'FAIL'
    print(f'{tag} {name}', json.dumps(detail, ensure_ascii=False)[:300] if detail is not None else '', flush=True)
    if not condition:
        (REPORT['warnings'].append(name) if warn else REPORT.setdefault('failed', []).append(name))


def measure(browser, level):
    ctx = browser.new_context(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1, reduced_motion='no-preference')
    prefs = {'circuit': 'interlagos', 'immersive': False, 'camera': 'chase', 'laps': 3, 'debugOverlay': 'full', 'graphics': {'level': level, 'overrides': {}}}
    ctx.add_init_script('localStorage.setItem("opala99-preferences-v1",JSON.stringify(' + json.dumps(prefs) + '));')
    page = ctx.new_page(); page.set_default_timeout(240000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)
    open_menu(page, URL, timeout=240000)
    page.wait_for_timeout(2000)   # a player looks at the menu: the screen's rate gets measured there
    enter_track(page, pilot='Piloto PC simples', timeout=240000)
    page.evaluate('interlagos.skipIntro()')
    wait_race_start(page, timeout=60000)
    wait_js(page, '!interlagosGraficos.info().compiling', timeout=60000)
    # The pack on the grid, frozen: what each part of the scene costs.
    page.keyboard.press('KeyP'); wait_js(page, 'interlagos.state.paused')
    page.wait_for_timeout(3000)
    start = page.evaluate('interlagosGraficos.info().debug')
    cost = page.evaluate('interlagosGraficos.cost(20)')
    page.keyboard.press('KeyP'); wait_js(page, '!interlagos.state.paused')
    page.evaluate('interlagos.setTour(true);interlagosGraficos.record(true);true')
    page.wait_for_timeout(int(SECONDS * 1000))
    frames = page.evaluate('interlagosGraficos.record(false)')
    info = page.evaluate('interlagosGraficos.info()')
    rows = dict(info['debug']['rows'])
    result = {'frames': frames, 'gpuMs': info['resolution']['gpuMs'] and round(info['resolution']['gpuMs'], 2), 'pixelRatio': info['pixelRatio'],
              'resolutionChanges': info['resolution'].get('changes'), 'device': info.get('device'), 'renderer': rows.get('Placa'),
              'start': {'fps': round(start['fps'], 1), 'gpuMs': start['gpu'] and round(start['gpu'], 2), 'cpuMs': round(start['cpu'], 2), 'desenho': dict(start['rows']).get('Desenho')},
              'parts': dict(list(cost['parts'].items())[:12]), 'errors': errors[:5]}
    ctx.close()
    return result


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    for level in LEVELS:
        r = REPORT['levels'][level] = measure(browser, level)
        f = r['frames']
        print(level, json.dumps({k: f[k] for k in ('fps', 'low1', 'worst', 'hitches', 'cpu')}), 'gpu', r['gpuMs'], 'ratio', r['pixelRatio'], r['renderer'], flush=True)
        integrated = (r.get('device') or {}).get('tier') in ('fraca', 'software', 'media')
        for key, goal in TARGETS[level].items():
            got = f[key]
            check(f'{level}_{key}_{goal}', got >= goal, {'got': got, 'goal': goal, 'renderer': r['renderer']}, warn=got >= goal * .9 or not integrated)
        if PLACA:
            check(f'{level}_ritmo_1pct_low', f['low1'] >= .75 * f['fps'], {'low1': f['low1'], 'fps': f['fps'], 'worst': f['worst']}, warn=True)
        REPORT['errors'] += r['errors']
    # Automático on this video: integrated video lands on Baixo (Médio for the stronger ones).
    device = next(iter(REPORT['levels'].values())).get('device') or {}
    REPORT['automatico'] = device
    if not PLACA:
        tier, picked = device.get('tier'), device.get('level')
        want = 'baixo' if tier in ('fraca', 'software') else 'medio' if tier == 'media' else picked
        check('automatico_pelo_video', picked == want, device)
    browser.close()

(OUT / 'resultado.json').write_text(json.dumps(REPORT, indent=1, ensure_ascii=False), encoding='utf-8')
check('no_page_errors', not REPORT['errors'], REPORT['errors'][:5])
print('pc fraco:', 'FALHOU ' + ', '.join(REPORT.get('failed', [])) if REPORT.get('failed') else 'ok' + (f" (avisos: {', '.join(REPORT['warnings'])})" if REPORT['warnings'] else ''), OUT)
sys.exit(1 if REPORT.get('failed') else 0)
