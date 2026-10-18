"""Bandeiras, varetas e placas de frenagem no jogo real (trackside-flags.js): quantas voam em cada
nível gráfico (Sensação de velocidade, ao vivo), o vento do carro do jogador numa flâmula, a vareta
atropelada, o 'passBy' ao passar rente a uma placa, a pausa congelando o pano e cada circuito
montando as suas sem erros.

Uso: python scripts/verificar_bandeiras.py [pasta_fotos] [--sem-circuitos]
Run from the repository root; INTERLAGOS_URL points at a server other than the default one.
Writes resultado.json, the shots and mosaico.jpg to pasta_fotos (default .audit-local/bandeiras)."""
import json
import math
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, wait_js, wait_race_start

BASE = os.environ.get('INTERLAGOS_URL', GAME_URL)
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = Path(ARGS[0]).resolve() if ARGS else Path(__file__).resolve().parents[2] / '.audit-local' / 'bandeiras'
OUT.mkdir(parents=True, exist_ok=True)
CIRCUITS = [] if '--sem-circuitos' in sys.argv else ['curvelo', 'cascavel', 'piracicaba', 'chapeco', 'brasilia', 'goiania', 'chapada', 'minhocao', 'pampulha']
HIDE_UI = 'body *{visibility:hidden!important} #view{visibility:visible!important}'
FLAGS = 'interlagos.sceneryInfo().flags'
# The player's car at lap distance s, d metres left of the centre line, running along the track.
PLACE = """([s,d,speed])=>{const c=interlagos.car,a=c.data.samples;let i=0;for(let k=0;k<a.length;k++)if(Math.abs(a[k][0]-s)<Math.abs(a[i][0]-s))i=k;
 interlagos.reposition(i);const p=a[i];c.x+=p[9]*d;c.y+=p[10]*d;c.settle?.();
 c.vx=Math.cos(c.heading)*speed;c.vy=Math.sin(c.heading)*speed;c.gear=speed>45?5:speed>30?4:3;c.awaitingStart=false;return p[4];}"""
# The flags drawn now, the exit rods and the brake boards, from the game's own plan.
SPOTS = """async()=>{const {flagPlan}=await import('./trackside-flags.js');const plan=flagPlan(interlagos.car.data),drawn=interlagos.sceneryInfo().flags.drawn;
 const pick=t=>({s:t.s,d:t.d,index:t.index,tier:t.tier});
 return {length:plan.length,pennants:plan.items.filter(t=>t.kind==='pennant'&&t.index<drawn).map(pick),rods:plan.items.filter(t=>t.kind==='rod'&&t.index<drawn&&t.tier===2).map(pick),
  boards:plan.boards.map(b=>({s:b.s,d:b.d,metres:b.metres}))};}"""
PRESETS = "async()=>{const g=await import('./graphics-settings.js');return Object.fromEntries(Object.entries(g.GRAPHICS_PRESETS).map(([k,v])=>[k,v.speedEffects]));}"
report = {'checks': {}, 'levels': {}, 'circuits': {}, 'errors': []}
shots = []


def check(name, ok, detail=None):
    report['checks'][name] = {'ok': bool(ok), 'detail': detail}
    print(name, bool(ok), json.dumps(detail, ensure_ascii=False) if detail is not None else '', flush=True)
    assert ok, f'{name}: {detail}'


def start(browser, circuit, level, overrides=None):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 720}, reduced_motion='no-preference')
    prefs = {'circuit': circuit, 'immersive': False, 'camera': 'chase',
             'graphics': {'level': level, 'overrides': {'dynamicResolution': False, **(overrides or {})}}}
    ctx.add_init_script('localStorage.setItem("opala99-preferences-v1",JSON.stringify(' + json.dumps(prefs) + '));')
    page = ctx.new_page(); page.set_default_timeout(180000)
    page.on('pageerror', lambda e: report['errors'].append(f'{circuit}: {e}'))
    page.on('console', lambda m: report['errors'].append(f'{circuit}: {m.text}') if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)
    open_menu(page, f'{BASE}?circuito={circuit}&intro=0', timeout=180000)
    if page.is_visible('#pilotName') and not page.input_value('#pilotName'):
        page.fill('#pilotName', 'Piloto bandeiras')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    page.click('#soloRace')   # Treino solo: the track to ourselves
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused', timeout=180000)
    page.evaluate('interlagos.skipIntro()')
    wait_race_start(page)
    wait_js(page, '!interlagosGraficos.info().compiling', timeout=60000)
    return ctx, page


def drive(page, s, d, speed, seconds, throttle=True):
    width = page.evaluate(PLACE, [s, d, speed])
    if throttle:
        page.keyboard.down('KeyW')
    page.wait_for_timeout(int(seconds * 1000))
    if throttle:
        page.keyboard.up('KeyW')
    return width


def shot(page, name):
    style = page.add_style_tag(content=HIDE_UI)
    path = OUT / f'{len(shots):02d}_{name}.png'
    page.screenshot(path=str(path)); shots.append(path)
    style.evaluate('e=>e.remove()')


def graphics(page, level, **overrides):
    page.evaluate('v=>{interlagosGraficos.set(v);return true}', {'level': level, 'overrides': {'dynamicResolution': False, **overrides}})
    wait_js(page, '!interlagosGraficos.info().compiling', timeout=60000)
    page.wait_for_timeout(300)
    return page.evaluate(FLAGS)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    try:
        ctx, page = start(browser, 'interlagos', 'alto')
        presets = page.evaluate(PRESETS)
        # --- Live per level: the preset's Sensação de velocidade, and that level's share of the flags.
        drawn = []
        for level in ['baixo', 'medio', 'alto', 'ultra']:
            f = graphics(page, level)
            report['levels'][level] = {k: f[k] for k in ('level', 'drawn', 'rods', 'boards')}
            check(f'{level}_flies_its_preset', f['level'] == presets[level] and f['drawn'] == f['perLevel'][presets[level]] and f['boards'] > 0, report['levels'][level])
            drawn.append(f['drawn'])
            drive(page, 1080, -3.5, 56, .9)
            shot(page, f'nivel_{level}')
        check('more_flags_up_the_levels', drawn == sorted(drawn) and drawn[0] < drawn[-1], drawn)
        f = graphics(page, 'alto', speedEffects='off')
        check('off_keeps_still_marshal_flags', f['level'] == 'off' and f['drawn'] == f['perLevel']['off'] == f['kinds']['marshal'], {'drawn': f['drawn']})
        f = graphics(page, 'alto')
        spots = page.evaluate(SPOTS)
        # --- A car flying by a pennant on the back straight stirs it.
        pennant = next(t for t in spots['pennants'] if 800 < t['s'] < 1300)
        before = page.evaluate(FLAGS)
        drive(page, pennant['s'] - 70, math.copysign(2.5, pennant['d']), 55, 1.8)
        after = page.evaluate(FLAGS)
        check('pass_recorded_when_the_player_drives_by', after['playerPasses'] > before['playerPasses'], {'pennant': pennant, 'passes': after['playerPasses'] - before['playerPasses'], 'last': after['last']})
        shot(page, 'flamula_depois_da_passagem')
        # --- Run over a corner-exit rod: knocked flat (it springs back by itself, no physics).
        knocked = None
        for rod in spots['rods'][:6]:
            before = page.evaluate(FLAGS)
            drive(page, rod['s'] - 16, rod['d'], 20, 1.4, throttle=False)
            if page.evaluate(FLAGS)['knocks'] > before['knocks']:
                knocked = rod
                break
        check('rod_knocked_when_run_over', knocked, knocked)
        shot(page, 'vareta_atropelada')
        # --- Close by a brake board at speed: the player hears it flick past.
        board = spots['boards'][0]
        before, sound = page.evaluate(FLAGS), page.evaluate("interlagos.audioInfo().effects?.counts?.passBy??0")
        drive(page, board['s'] - 60, board['d'] - math.copysign(3.2, board['d']), 50, 1.7)
        after, heard = page.evaluate(FLAGS), page.evaluate("interlagos.audioInfo().effects?.counts?.passBy??0")
        check('whoosh_past_a_board', after['whooshes'] > before['whooshes'] and heard > sound, {'board': board, 'whooshes': after['whooshes'] - before['whooshes'], 'sounds': heard - sound})
        shot(page, 'placa_de_frenagem')
        # --- Paused (P): the cloth's clock stops.
        page.keyboard.press('KeyP'); wait_js(page, 'interlagos.state.paused')
        t0 = page.evaluate(FLAGS)['time']; page.wait_for_timeout(600); t1 = page.evaluate(FLAGS)['time']
        check('paused_flags_frozen', t0 == t1, [t0, t1])
        page.keyboard.press('KeyP'); wait_js(page, '!interlagos.state.paused')
        page.wait_for_timeout(400)
        check('flags_run_again_after_pause', page.evaluate(FLAGS)['time'] > t1)
        # --- Where people look: the grandstand roof and the start gantry.
        drive(page, 4040, -3, 40, .6)
        shot(page, 'arquibancada')
        drive(page, 4235, 1, 45, .9)
        shot(page, 'largada')
        report['interlagos'] = page.evaluate(FLAGS)
        ctx.close()
        # --- Every other circuit builds its own (placement is checked in testar_bandeiras.mjs).
        for circuit in CIRCUITS:
            ctx, page = start(browser, circuit, 'alto')
            f = page.evaluate(FLAGS)
            length = page.evaluate('interlagos.car.data.meta.reconstructed_xy_m')
            drive(page, length - 90, 0, 50, 1.6)
            g = page.evaluate(FLAGS)
            report['circuits'][circuit] = {'drawn': f['drawn'], 'kinds': f['kinds'], 'boards': f['boards'], 'passesToTheLine': g['passes'] - f['passes']}
            check(f'{circuit}_flags_built', f['level'] == 'completa' and f['drawn'] == f['perLevel']['completa'] > 20 and f['boards'] > 0, report['circuits'][circuit])
            shot(page, f'circuito_{circuit}')
            ctx.close()
        check('no_browser_errors', not report['errors'], report['errors'][:5])
        report['passed'] = True
    finally:
        report.setdefault('passed', False)
        (OUT / 'resultado.json').write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding='utf-8')
        browser.close()
        if shots:
            from PIL import Image, ImageDraw
            W, H, cols = 640, 360, 3
            mosaic = Image.new('RGB', (cols * W, ((len(shots) + cols - 1) // cols) * H), (20, 20, 20)); draw = ImageDraw.Draw(mosaic)
            for i, path in enumerate(shots):
                x, y = (i % cols) * W, (i // cols) * H
                mosaic.paste(Image.open(path).convert('RGB').resize((W, H)), (x, y)); draw.text((x + 6, y + 4), path.stem, fill=(255, 255, 0))
            mosaic.save(OUT / 'mosaico.jpg', quality=86)
print('verificar_bandeiras:', 'ok' if report['passed'] else 'FALHOU', OUT)
