"""The game's frame rate by circuit, graphics level and scene: what medir_pc_fraco.py does for Interlagos on the
integrated video, here for any circuit, on the graphics card and/or the integrated video, through the scenes a player
meets: the pack on the grid, a lap, the night, heavy rain, the cockpit (the mirrors draw the track again) and on foot.

Usage: medir_desempenho.py [port] [out_dir] [--circuitos=floripa] [--niveis=baixo,medio,alto,ultra]
        [--cenarios=largada,volta,noite,chuva,cockpit,a_pe] [--gpu=placa|fraca|ambas] [--segundos=25] [--fixa]
        [--perfil] [--tela=1920x1080]
INTERLAGOS_URL overrides the address; out_dir defaults to cwd/.audit-local/desempenho (resultado.json, plus
perfil_<circuit>_<level>.json with the processor's time by script and function when --perfil).

Per circuit and level, as a player gets it (the level's own settings; --fixa turns dynamic resolution and the FPS limit
off, so the GPU and processor time compare like for like), Corrida única with the whole field, the race's autopilot driving the player's car:
- load: seconds from the click to the green light, the JS heap, the geometries and textures on the video card;
- largada (the pack frozen on the grid): draw calls, triangles and GPU time by part of the scene (perf-probe.js cost);
- every other scene: average FPS, 1% low, worst frame, hitches, the processor's time per frame (average and p99), the
  GPU's, the pixel density dynamic resolution settled on and, sampled along the way, draw calls and triangles;
- --perfil: the processor's own profile (DevTools) during the lap: self time by script file and by function, to see
  which module eats the frame.
--gpu=fraca runs on the notebook's integrated video (Chromium's --force_low_power_gpu: the cheap-PC proxy), placa on
the default one; ambas does both. Run with no other GPU check in parallel. Prints a table at the end.
"""
import json, os, sys, time
from pathlib import Path
from urllib.parse import urlencode
sys.path.insert(0, str(Path(__file__).resolve().parent))
import browser_config  # noqa: E402,F401  headless + in-page pointer lock
from browser_config import GAME_URL, browser_executable, open_menu, wait_js, wait_race_start, enter_track  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

FLAGS = {a.split('=')[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
PORT = ARGS[0] if ARGS else None
BASE = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace(':8799', ':' + PORT) if PORT else GAME_URL)
OUT = Path(ARGS[1] if len(ARGS) > 1 else Path.cwd() / '.audit-local' / 'desempenho').resolve(); OUT.mkdir(parents=True, exist_ok=True)
CIRCUITS = str(FLAGS.get('--circuitos', 'floripa')).split(',')
LEVELS = str(FLAGS.get('--niveis', 'baixo,medio,alto,ultra')).split(',')
SCENES = str(FLAGS.get('--cenarios', 'largada,volta,noite,chuva,cockpit,a_pe')).split(',')
GPUS = {'ambas': ['fraca', 'placa']}.get(FLAGS.get('--gpu', 'placa'), [FLAGS.get('--gpu', 'placa')])
SECONDS = float(FLAGS.get('--segundos', 25))
FIXED = bool(FLAGS.get('--fixa'))
PROFILE = bool(FLAGS.get('--perfil'))
W, H = (int(v) for v in str(FLAGS.get('--tela', '1920x1080')).split('x'))
REPORT = {'args': sys.argv[1:], 'runs': [], 'errors': []}

# Draw calls and triangles of the last frame, from the overlay's rows (debug-overlay.js lines()).
SAMPLE = """(()=>{const d=interlagosGraficos.info().debug,rows=Object.fromEntries(d.rows);return {fps:d.fps,cpu:d.cpu,gpu:d.gpu,desenho:rows['Desenho']??null,ratio:interlagosGraficos.info().pixelRatio};})()"""
MEMORY = """(()=>{const m=performance.memory;return {heapMB:m?Math.round(m.usedJSHeapSize/1048576):null,rows:Object.fromEntries(interlagosGraficos.info().debug.rows)};})()"""


def record(page, seconds, cdp=None):
    """Frames over `seconds`, with the overlay sampled every 2 s for the draw calls."""
    if cdp:
        cdp.send('Profiler.enable'); cdp.send('Profiler.setSamplingInterval', {'interval': 500}); cdp.send('Profiler.start')
    page.evaluate('interlagosGraficos.record(true);true')
    samples, end = [], time.monotonic() + seconds
    while time.monotonic() < end:
        page.wait_for_timeout(2000)
        samples.append(page.evaluate(SAMPLE))
    frames = page.evaluate('interlagosGraficos.record(false)')
    profile = cdp.send('Profiler.stop')['profile'] if cdp else None
    info = page.evaluate('(()=>{const i=interlagosGraficos.info();return {gpuMs:i.resolution.gpuMs,ratio:i.pixelRatio,changes:i.resolution.changes};})()')
    return {'frames': frames, 'gpuMs': info['gpuMs'] and round(info['gpuMs'], 2), 'pixelRatio': info['ratio'], 'resolutionChanges': info['changes'],
            'desenho': [s['desenho'] for s in samples], 'gpuSamples': [s['gpu'] and round(s['gpu'], 1) for s in samples]}, profile


def summarize_profile(profile, top=25):
    """Self time by script file and by function (ms over the recording)."""
    nodes = {n['id']: n for n in profile['nodes']}
    dts = profile.get('timeDeltas', [])
    self_us = {}
    for sample, dt in zip(profile.get('samples', []), dts):
        self_us[sample] = self_us.get(sample, 0) + max(0, dt)
    by_file, by_fn = {}, {}
    for nid, us in self_us.items():
        cf = nodes[nid]['callFrame']
        url = cf.get('url', '').rsplit('/', 1)[-1] or f"({cf.get('functionName') or 'program'})"
        fn = f"{url}:{cf.get('functionName') or '(anon)'}:{cf.get('lineNumber', 0) + 1}"
        by_file[url] = by_file.get(url, 0) + us
        by_fn[fn] = by_fn.get(fn, 0) + us
    total = sum(self_us.values()) or 1
    order = lambda t: {k: [round(v / 1000), round(100 * v / total, 1)] for k, v in sorted(t.items(), key=lambda kv: -kv[1])[:top]}
    return {'totalMs': round(total / 1000), 'files': order(by_file), 'functions': order(by_fn)}


def measure(browser, gpu, circuit, level):
    ctx = browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1, reduced_motion='no-preference')
    overrides = {'dynamicResolution': False, 'fpsLimit': 0} if FIXED else {}
    prefs = {'circuit': circuit, 'immersive': False, 'camera': 'chase', 'laps': 3, 'debugOverlay': 'full', 'timeOfDay': 'dia', 'rain': 'seco',
             'graphics': {'level': level, 'overrides': overrides}}
    ctx.add_init_script('localStorage.setItem("opala99-preferences-v1",JSON.stringify(' + json.dumps(prefs) + '));')
    page = ctx.new_page(); page.set_default_timeout(300000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)
    url = BASE.split('?')[0] + '?' + urlencode({'circuito': circuit, 'intro': '0'})
    open_menu(page, url, timeout=300000)
    page.wait_for_timeout(1500)   # the screen's rate gets measured on the menu
    t0 = time.monotonic()
    enter_track(page, pilot='Piloto medida', timeout=300000)
    page.evaluate('interlagos.skipIntro()')
    wait_race_start(page, timeout=90000)
    wait_js(page, '!interlagosGraficos.info().compiling', timeout=90000)
    run = {'gpu': gpu, 'circuit': circuit, 'level': level, 'load_s': round(time.monotonic() - t0, 1), 'scenes': {}, 'errors': errors}
    mem = page.evaluate(MEMORY)
    run['memory'] = {'heapMB': mem['heapMB'], 'naPlaca': mem['rows'].get('Na placa'), 'placa': mem['rows'].get('Placa')}
    run['device'] = page.evaluate('interlagosGraficos.info().device')
    cdp = ctx.new_cdp_session(page) if PROFILE else None
    for scene in SCENES:
        try:
            if scene == 'largada':
                page.keyboard.press('KeyP'); wait_js(page, 'interlagos.state.paused')
                page.wait_for_timeout(2500)
                d = page.evaluate('interlagosGraficos.info().debug')
                cost = page.evaluate('interlagosGraficos.cost(20)')
                page.keyboard.press('KeyP'); wait_js(page, '!interlagos.state.paused')
                run['scenes'][scene] = {'fps': round(d['fps'], 1), 'gpuMs': d['gpu'] and round(d['gpu'], 2), 'cpuMs': round(d['cpu'], 2),
                                        'desenho': dict(d['rows']).get('Desenho'), 'passes': cost['passes'], 'parts': dict(list(cost['parts'].items())[:16])}
            elif scene in ('volta', 'noite', 'chuva', 'cockpit'):
                weather = {'noite': {'time': 'noite', 'rain': 'seco'}, 'chuva': {'time': 'dia', 'rain': 'chuva'}}.get(scene, {'time': 'dia', 'rain': 'seco'})
                page.evaluate('w=>{interlagosClima.set(w);return true;}', weather)
                wait_js(page, '!interlagosGraficos.info().compiling&&!interlagosClima.info().compiling', timeout=90000)
                want = 'cockpit' if scene == 'cockpit' else 'chase'
                if page.evaluate('interlagos.state.mode') != want:
                    page.evaluate("document.getElementById('cockpitButton').click();true")
                page.evaluate('interlagos.setTour(true);true')
                page.wait_for_timeout(1500)
                stats, profile = record(page, SECONDS, cdp if scene == 'volta' else None)
                run['scenes'][scene] = stats
                if profile:
                    summary = summarize_profile(profile)
                    run['scenes'][scene]['perfil'] = {'totalMs': summary['totalMs'], 'files': dict(list(summary['files'].items())[:12])}
                    (OUT / f'perfil_{gpu}_{circuit}_{level}.json').write_text(json.dumps(summary, indent=1, ensure_ascii=False), encoding='utf-8')
            elif scene == 'a_pe':
                page.evaluate("w=>{interlagosClima.set(w);return true;}", {'time': 'dia', 'rain': 'seco'})
                if page.evaluate('interlagos.state.mode') == 'cockpit':
                    page.evaluate("document.getElementById('cockpitButton').click();true")
                page.evaluate('interlagos.setTour(false);true')
                page.keyboard.press('KeyF')
                wait_js(page, 'interlagos.walkInfo().active', timeout=30000)
                page.keyboard.down('KeyW'); page.mouse.move(W / 2, H / 2)
                page.wait_for_timeout(800)
                stats, _ = record(page, SECONDS)
                page.keyboard.up('KeyW')
                run['scenes'][scene] = stats
        except Exception as e:  # one scene failing leaves the others measured
            run['scenes'][scene] = {'error': str(e)[:300]}
    ctx.close()
    return run


def row(run, scene):
    s = run['scenes'].get(scene) or {}
    if 'error' in s:
        return f"{run['gpu']:5} {run['circuit']:10} {run['level']:6} {scene:8} ERRO {s['error'][:80]}"
    if scene == 'largada':
        return f"{run['gpu']:5} {run['circuit']:10} {run['level']:6} {scene:8} fps {s.get('fps'):6} cpu {s.get('cpuMs'):6} gpu {s.get('gpuMs')}  {s.get('desenho')}"
    f = s.get('frames') or {}
    return (f"{run['gpu']:5} {run['circuit']:10} {run['level']:6} {scene:8} fps {f.get('fps'):6} low1 {f.get('low1'):6} worst {f.get('worst'):6} "
            f"hitch {f.get('hitches'):3} cpu {f.get('cpu'):5}/{f.get('cpuP99'):5} gpu {s.get('gpuMs')} ratio {s.get('pixelRatio')}")


with sync_playwright() as p:
    for gpu in GPUS:
        args = ['--enable-webgl', '--ignore-gpu-blocklist'] + (['--force_low_power_gpu'] if gpu == 'fraca' else [])
        browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=args)
        for circuit in CIRCUITS:
            for level in LEVELS:
                try:
                    run = measure(browser, gpu, circuit, level)
                except Exception as e:
                    run = {'gpu': gpu, 'circuit': circuit, 'level': level, 'scenes': {}, 'errors': [f'run: {e}'[:400]]}
                REPORT['runs'].append(run)
                print(f"== {gpu} {circuit} {level}: carga {run.get('load_s')} s, heap {run.get('memory', {}).get('heapMB')} MB, {(run.get('device') or {}).get('renderer', '')[:60]}", flush=True)
                for scene in SCENES:
                    if scene in run['scenes']:
                        print(row(run, scene), flush=True)
                if run['errors']:
                    print('   erros:', run['errors'][:3], flush=True)
                (OUT / 'resultado.json').write_text(json.dumps(REPORT, indent=1, ensure_ascii=False), encoding='utf-8')
        browser.close()

print('\n'.join(row(r, s) for r in REPORT['runs'] for s in SCENES if s in r['scenes']))
print('desempenho:', OUT)
