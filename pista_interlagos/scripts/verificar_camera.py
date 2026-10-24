"""The follow cameras in a real browser (camera-rig.js): Perseguição and Perseguição próxima sit low behind the
car and frame it big, Perseguição distante keeps the old high view; the lens opens with speed while the eye comes
in (the car keeps its size); in a corner the view looks into it and never dips under the ground, nor in a rollover;
a wall behind the car pulls the camera in; a 20:9 phone sees the car as big as a monitor does; the Fusca is framed
for its size; the story's grid is a low three-quarter shot of the car.

Usage, with the local server running: verificar_camera.py [porta] [pasta das imagens] [todas]
'todas' films the grid shot on every circuit (default: Interlagos and Brasília, whose pits are on the right).
Screens: <pasta>/camera_*.png (default renders/camera); report in dados/validacao_camera.json."""
import json, math, sys, time
from pathlib import Path
import browser_config  # noqa: F401  headless + in-page pointer lock
from browser_config import browser_executable, browser_args, open_menu, wait_js, wait_race_start, choose_race, start_race
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'renders' / 'camera'; OUT.mkdir(parents=True, exist_ok=True)
GRIDS = ['interlagos', 'curvelo', 'cascavel', 'piracicaba', 'chapeco', 'brasilia', 'goiania', 'guaratiba', 'velocitta'] if 'todas' in sys.argv[3:] else ['interlagos', 'brasilia']
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
HIDE_UI = 'body *{visibility:hidden!important} #view{visibility:visible!important}'
CAMERA = "m=>{const s=document.getElementById('camera');s.value=m;s.dispatchEvent(new Event('change'));return true;}"
# [s, lateral (m, + left), speed (m/s), turn (rad, the nose against the road; the speed stays along the road)]
PLACE = """([s,d,speed,turn])=>{const c=interlagos.car,a=c.data.samples;let i=0;for(let k=0;k<a.length;k++)if(Math.abs(a[k][0]-s)<Math.abs(a[i][0]-s))i=k;
 interlagos.reposition(i);const p=a[i];c.x+=p[9]*d;c.y+=p[10]*d;const h=c.heading;c.heading+=turn;c.settle?.();
 c.vx=Math.cos(h)*speed;c.vy=Math.sin(h)*speed;c.gear=speed>40?5:speed>20?3:1;c.awaitingStart=false;return p[4];}"""
SNAP = """(()=>{const s=interlagos.cameraSnapshot(),c=interlagos.car;return {fov:s.fov,baseFov:s.baseFov,aspect:s.aspect,frame:s.frame,carScreen:s.carScreen,rig:s.rig,roll:s.roll,
 position:s.position,car:s.car,ground:s.ground,speed:Math.hypot(c.vx,c.vy)*3.6,heading:c.heading,travel:Math.atan2(c.vy,c.vx),body:c.body.name,mode:interlagos.state.mode};})()"""
# Watches every drawn frame in the page: the camera's lowest height above the ground, the car's place on screen.
WATCH = """()=>{const w=window.cameraWatch={on:true,frames:0,low:Infinity,bad:0,side:0,offscreen:0,roll:0};
 (function tick(){if(!w.on)return;const s=interlagos.cameraSnapshot();w.frames++;if(!s.position.every(Number.isFinite))w.bad++;
  w.low=Math.min(w.low,s.position[1]-s.ground);w.side=Math.max(w.side,Math.abs(s.rig.side));w.roll=Math.max(w.roll,Math.abs(s.roll));
  const b=s.carScreen;if(s.frame&&(!b||b.x1<.02||b.x0>.98||b.y1<.02||b.y0>.98))w.offscreen++;requestAnimationFrame(tick);})();return true;}"""
STOP_WATCH = "(()=>{cameraWatch.on=false;const {on,...w}=cameraWatch;return w;})()"
# A bank that throws the car into the air and over (verificar_capotagem.py's search).
FIND_RAMP = '''()=>{const car=interlagos.car,Probe=car.constructor,data=car.data,idle={throttle:1,brake:0,left:0,right:0,reverse:0,handbrake:0};let best=null;
 for(let i=0;i<data.samples.length;i+=24)for(const side of [-1,1]){const c=new Probe(data);c.reset(i);const p=c.surface;c.heading=Math.atan2(p.ty,p.tx)+side*.45;c.x+=p.lx*side*3;c.y+=p.ly*side*3;c.vx=Math.cos(c.heading)*160/3.6;c.vy=Math.sin(c.heading)*160/3.6;c.settle();
  let air=0,longest=0,minUp=1;for(let k=0;k<600;k++){c.step(idle,1/120);if(c.wallImpactSpeed>0)break;air=c.wheelsDown===0&&!c.hullContact?air+1/120:0;longest=Math.max(longest,air);minUp=Math.min(minUp,c.upright);}
  const score=longest+(minUp<0?1:0);if(!best||score>best.score)best={i,side,score,longest,minUp};}
 return best;}'''
LAUNCH = '''spot=>{const c=interlagos.car;interlagos.reposition(spot.i);const p=c.surface;c.heading=Math.atan2(p.ty,p.tx)+spot.side*.45;c.x+=p.lx*spot.side*3;c.y+=p.ly*spot.side*3;
 c.vx=Math.cos(c.heading)*160/3.6;c.vy=Math.sin(c.heading)*160/3.6;c.settle();return true;}'''
GRID = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js'),old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();
 const s=fixtureMode.state;s.cash=300;s.phase='starting';fixtureMode.sync();s.phase='grid';s.countdown=60;fixtureMode.sync();return true;}"""
report = {'errors': [], 'checks': {}, 'views': {}}


def check(name, value, detail=None):
    report['checks'][name] = bool(value); print(name, bool(value), '' if detail is None else json.dumps(detail, ensure_ascii=False), flush=True)
    assert value, (name, detail)


def frames(page, n):
    first = page.evaluate('interlagos.cockpitInfo().renderedFrame')
    wait_js(page, 'n=>interlagos.cockpitInfo().renderedFrame>=n', arg=first + n, timeout=60000)


def shot(page, name):
    page.add_style_tag(content=HIDE_UI); frames(page, 2)
    page.screenshot(path=str(OUT / f'camera_{name}.png'))
    page.evaluate("()=>{for(const s of document.querySelectorAll('style'))if(s.textContent.includes('visibility:hidden!important'))s.remove();return true;}")


def snap(page, name=None):
    s = page.evaluate(SNAP)
    if name:
        report['views'][name] = {k: s[k] for k in ('mode', 'frame', 'fov', 'baseFov', 'aspect', 'carScreen', 'speed', 'body')}
        print(name, json.dumps(report['views'][name]), flush=True)
    return s


def hfov(fov, aspect):
    return math.degrees(2 * math.atan(math.tan(math.radians(fov) / 2) * aspect))


def vfov(h, aspect):
    return math.degrees(2 * math.atan(math.tan(math.radians(h) / 2) / aspect))


def race(browser, w, h, level='alto', mobile=False, circuit='interlagos', **prefs):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, is_mobile=mobile, has_touch=mobile, reduced_motion='no-preference')
    stored = {'circuit': circuit, 'immersive': False, 'camera': 'chase', 'graphics': {'level': level, 'overrides': {'dynamicResolution': False}}, **prefs}
    if mobile:
        stored['graphics'] = {'level': 'auto', 'overrides': {'dynamicResolution': False}}
    ctx.add_init_script('localStorage.setItem("opala99-preferences-v1",JSON.stringify(' + json.dumps(stored) + '));')
    page = ctx.new_page(); page.set_default_timeout(180000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)
    open_menu(page, URL + f'?circuito={circuit}&intro=0', timeout=180000)
    press = page.tap if mobile else page.click
    if page.is_visible('#pilotName') and not page.input_value('#pilotName'):
        page.fill('#pilotName', 'Piloto camera')
    press('#start')
    if page.is_visible('#cars'):
        press('#carsNext')
    start_race(page, '#soloRace', mobile)
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused', timeout=180000)
    page.evaluate('interlagos.skipIntro()'); wait_race_start(page)
    wait_js(page, '!interlagosGraficos.info().compiling', timeout=60000)
    return ctx, page


def at_rest(page, mode, s=4100, lateral=-1.5, turn=0, n=50):
    page.evaluate(CAMERA, mode); page.evaluate(PLACE, [s, lateral, 0, turn]); frames(page, n)


def at_speed(page, mode, name):
    """200 km/h on the main straight beside the grandstand, frozen with P (the camera keeps its speed lens)."""
    page.evaluate(CAMERA, mode); page.evaluate(PLACE, [4100, -1.5, 55, 0]); frames(page, 2)
    page.keyboard.down('KeyW'); page.wait_for_timeout(1000)
    page.keyboard.press('KeyP'); page.keyboard.up('KeyW'); wait_js(page, 'interlagos.state.paused'); page.wait_for_timeout(500)
    s = snap(page, name); shot(page, name); page.keyboard.press('KeyP'); wait_js(page, '!interlagos.state.paused')
    return s


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    try:
        # A 16:9 monitor on Alto (full camera motion).
        ctx, page = race(browser, 1600, 900)
        modes = []
        for _ in range(8):
            page.keyboard.press('KeyC'); modes.append(page.evaluate('interlagos.state.mode'))
        check('c_cycles_eight_views_far_after_close', modes == ['close', 'far', 'hood', 'cockpit', 'tv', 'aerial', 'orbit', 'chase'], modes)
        rest = {}
        for mode, lo, hi in (('chase', .2, .3), ('close', .32, .45), ('far', .09, .16)):
            at_rest(page, mode); rest[mode] = s = snap(page, 'rest_' + mode); shot(page, 'parado_' + mode); b = s['carScreen']
            check(f'{mode}_frames_the_car_at_rest', s['frame'] == mode and lo < b['width'] < hi and b['x0'] > .02 and b['x1'] < .98 and .3 < b['y0'] and b['y1'] < .97, b)
            check(f'{mode}_lens_is_its_own_at_16_9', abs(s['fov'] - s['baseFov']) < .05 and s['baseFov'] == {'chase': 55, 'close': 56, 'far': 58}[mode], [s['fov'], s['baseFov']])
        check('chase_and_close_sit_low', rest['chase']['position'][1] - rest['chase']['ground'] < 2.3 and rest['close']['position'][1] - rest['close']['ground'] < 1.9 and rest['far']['position'][1] - rest['far']['ground'] > 3.2)
        for mode in ('chase', 'close', 'far'):
            s = at_speed(page, mode, 'velocidade_' + mode); b = s['carScreen']
            # About 6° (camera-rig.js kick), never past 92° side to side (MAX_SPEED_HFOV: close and far reach it first,
            # far with only about 2.4° to open).
            check(f'{mode}_lens_opens_at_200', s['speed'] > 180 and s['fov'] > min(s['baseFov'] + 4.5, vfov(92, s['aspect']) - .3) and hfov(s['fov'], s['aspect']) < 92.1, [s['speed'], s['fov'], round(hfov(s['fov'], s['aspect']), 1)])
            check(f'{mode}_dolly_keeps_the_car_size', b['width'] > rest[mode]['carScreen']['width'] * .88, [b['width'], rest[mode]['carScreen']['width']])
        # Driving fast the view trembles a little (turns only); with Movimento da câmera off it is still and the lens stays.
        page.evaluate(CAMERA, 'chase'); page.evaluate(PLACE, [4100, -1.5, 55, 0]); page.keyboard.down('KeyW'); page.evaluate(WATCH); page.wait_for_timeout(700)
        trembling = page.evaluate(STOP_WATCH); page.keyboard.up('KeyW')
        check('fast_view_trembles_a_little', 1e-5 < trembling['roll'] < .012, trembling)
        page.evaluate("interlagosGraficos.set({level:'alto',overrides:{dynamicResolution:false,cameraMotion:0}});true")
        # (the lens eases back to its own in about two seconds)
        page.evaluate(PLACE, [4100, -1.5, 55, 0]); page.keyboard.down('KeyW')
        wait_js(page, '(s=>Math.abs(s.fov-s.baseFov)<.04)(interlagos.cameraSnapshot())', timeout=20000); page.evaluate(WATCH); page.wait_for_timeout(500)
        still = page.evaluate(STOP_WATCH); s = snap(page); page.keyboard.up('KeyW')
        check('motion_off_still_view_and_lens', still['roll'] < 1e-7 and abs(s['fov'] - s['baseFov']) < .05 and s['speed'] > 150, [still, s['fov']])
        page.evaluate("interlagosGraficos.set({level:'alto',overrides:{dynamicResolution:false}});true")
        # Through the S do Senna on the autopilot: the aim looks into the corners, the car stays on screen, the eye above the ground.
        for mode in ('chase', 'close'):
            page.evaluate(CAMERA, mode); page.evaluate(PLACE, [60, 0, 42, 0]); page.evaluate('interlagos.setTour(true)'); page.evaluate(WATCH)
            # (by the car's way along the track, not the clock: a busy GPU only slows it down)
            taken = False; t0 = time.monotonic()
            while time.monotonic() - t0 < 60:
                side, along = page.evaluate('[Math.abs(interlagos.cameraSnapshot().rig.side),interlagos.car.surface.s]')
                if not taken and side > .6:
                    page.keyboard.press('KeyP'); wait_js(page, 'interlagos.state.paused'); snap(page, 'curva_' + mode); shot(page, 'curva_' + mode); page.keyboard.press('KeyP'); taken = True
                if along > 900:
                    break
                page.wait_for_timeout(40)
            corner = page.evaluate(STOP_WATCH); page.evaluate('interlagos.setTour(false)')
            check(f'{mode}_looks_into_the_corners', taken and corner['side'] > .6, corner)
            check(f'{mode}_corner_car_on_screen_eye_above_ground', corner['offscreen'] == 0 and corner['bad'] == 0 and corner['low'] > .3, corner)
        # Sliding: the view aims between the nose and the travel, so the car's flank shows.
        page.evaluate(CAMERA, 'chase'); page.evaluate(PLACE, [4110, -1.5, 36, .5]); frames(page, 1)
        page.keyboard.down('KeyA'); page.keyboard.down('KeyW'); page.wait_for_timeout(450); page.keyboard.press('KeyP'); page.keyboard.up('KeyA'); page.keyboard.up('KeyW')
        wait_js(page, 'interlagos.state.paused'); s = snap(page, 'derrapagem'); shot(page, 'derrapagem'); page.keyboard.press('KeyP')
        slip = math.atan2(math.sin(s['travel'] - s['heading']), math.cos(s['travel'] - s['heading'])); aim = math.atan2(math.sin(s['rig']['yaw'] - s['heading']), math.cos(s['rig']['yaw'] - s['heading']))
        check('drift_view_turns_toward_the_travel', abs(slip) > .15 and aim * slip > 0 and abs(aim) < abs(slip), [slip, aim])
        # Stopped at the edge of the road with the nose to the middle: a wall or rail behind pulls the camera in front of it.
        pulled = None
        for s_at, side in ((4150, -1), (4150, 1), (30, 1), (30, -1), (200, 1), (200, -1)):
            width = page.evaluate(PLACE, [s_at, 0, 0, 0])
            at_rest(page, 'chase', s_at, side * (width / 2 - .8), -side * math.pi / 2, 30); s = snap(page)
            reach = math.dist(s['position'][::2], s['car'][::2])
            if reach < 4.2:
                pulled = {'s': s_at, 'side': side, 'reach': round(reach, 2), 'height': round(s['position'][1] - s['car'][1], 2)}; shot(page, 'muro'); break
        check('wall_behind_pulls_the_camera_in', pulled, pulled)
        # Pulled in past the tail, the eye rises over the roof instead of entering the body.
        check('pulled_in_eye_stays_out_of_the_car', pulled['reach'] > 2.7 or pulled['height'] > 1.9, pulled)
        # A launch off a bank that rolls the car: the camera stays above the ground all the way.
        spot = page.evaluate(FIND_RAMP); page.evaluate(CAMERA, 'close'); page.keyboard.down('KeyW'); page.evaluate(LAUNCH, spot); page.evaluate(WATCH)
        wait_js(page, 't=>interlagos.car.clock>t', arg=page.evaluate('interlagos.car.clock') + 5, timeout=60000)   # five seconds of the race's own time
        roll = page.evaluate(STOP_WATCH); page.keyboard.up('KeyW'); report['rollover'] = {'spot': spot, **roll}
        check('rollover_camera_above_ground', roll['bad'] == 0 and roll['low'] > .3 and roll['frames'] > 30, report['rollover'])
        check('no_page_errors_desktop', not report['errors'], report['errors'][:3])
        ctx.close()

        # A 20:9 phone in landscape (Automático = Médio): the lens loses height instead of opening into a panorama.
        ctx, page = race(browser, 866, 390, mobile=True)
        level = page.evaluate('interlagosGraficos.info().level')
        at_rest(page, 'chase'); s = snap(page, 'celular_chase'); shot(page, 'celular_chase'); b = s['carScreen']
        check('phone_is_medio', level == 'medio', level)
        check('phone_lens_at_most_90_wide', hfov(s['baseFov'], s['aspect']) < 90.5 and s['aspect'] > 2.1, [s['baseFov'], s['aspect']])
        check('phone_car_as_big_as_on_a_monitor', b['width'] > rest['chase']['carScreen']['width'] * .85 and b['y1'] < .95, b)
        at_rest(page, 'close'); s = snap(page, 'celular_close'); shot(page, 'celular_close')
        check('phone_close_bumper_on_screen', s['carScreen']['y1'] < .96, s['carScreen'])
        # Médio's Reduzido camera motion still opens the lens (the kick is not the shake), up to 95° side to side (a
        # 20:9 phone, 90° wide at rest, keeps the old ceiling: camera-rig.js PHONE_SPEED_HFOV).
        s = at_speed(page, 'chase', 'celular_velocidade_chase')
        check('phone_lens_opens_at_200', s['speed'] > 180 and s['fov'] > s['baseFov'] + 3 and hfov(s['fov'], s['aspect']) < 95.1, [s['fov'], s['baseFov'], round(hfov(s['fov'], s['aspect']), 1)])
        ctx.close()

        # The Fusca: framed closer for its size, as tall on screen as the Opala.
        ctx, page = race(browser, 1600, 900, carModel='fusca')
        wait_js(page, "interlagos.car.body.name==='fusca'", timeout=60000)
        at_rest(page, 'chase'); s = snap(page, 'fusca_chase'); shot(page, 'fusca_chase'); b = s['carScreen']; o = rest['chase']['carScreen']
        check('fusca_framed_for_its_size', b['width'] > o['width'] * .55 and b['height'] > o['height'] * .95 and b['y1'] < .97, [b, o])
        at_rest(page, 'close'); snap(page, 'fusca_close'); shot(page, 'fusca_close')
        ctx.close()

        # The story's grid: a low rear three-quarter shot from the side away from the pits.
        for circuit in GRIDS:
            ctx = browser.new_context(viewport={'width': 1600, 'height': 900}, device_scale_factor=1)
            ctx.add_init_script('localStorage.setItem("opala99-preferences-v1",JSON.stringify(' + json.dumps({'circuit': circuit, 'immersive': True, 'camera': 'chase', 'graphics': {'level': 'alto', 'overrides': {'dynamicResolution': False}}}) + '));')
            page = ctx.new_page(); page.set_default_timeout(180000); page.on('pageerror', lambda e: report['errors'].append(str(e)))
            open_menu(page, URL + f'?circuito={circuit}&intro=0', timeout=180000)
            if page.is_visible('#pilotName') and not page.input_value('#pilotName'):
                page.fill('#pilotName', 'Piloto grid')
            choose_race(page, story=True); wait_js(page, 'window.interlagos?.ready', timeout=180000)
            # The career's cards (Kléber's welcome) come before the paddock, as browser_config.enter_track skips them.
            page.evaluate('window.interlagosHistoria.skipCards()')
            page.evaluate(GRID); frames(page, 40); s = snap(page, 'grid_' + circuit); shot(page, 'grid_' + circuit); b = s['carScreen']
            check(f'grid_hero_{circuit}', s['frame'] == 'grid' and s['baseFov'] == 48 and .4 < b['width'] < .65 and b['x0'] > -.02 and b['x1'] < 1.02 and .3 < b['y0'] and b['y1'] < .9 and s['position'][1] - s['ground'] > .5, b)
            ctx.close()
        check('no_page_errors', not report['errors'], report['errors'][:3])
        report['passed'] = True
    finally:
        report['passed'] = report.get('passed', False)
        (ROOT / 'dados' / 'validacao_camera.json').write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding='utf-8')
        browser.close()
print('Câmeras verificadas:', OUT)
