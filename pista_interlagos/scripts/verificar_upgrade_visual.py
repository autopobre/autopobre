"""Integrated visual/graphics/action smoke. Run with no other GPU check in parallel.

Usage: verificar_upgrade_visual.py [port] [--gpu-only]
INTERLAGOS_URL overrides the address. VISUAL_ACTION_OUT overrides the output folder,
which defaults to cwd/.audit-local/visual-action. Nothing is written to dados/renders.

Loads Curvelo and Cascavel in Low and High, drives with real keyboard input, checks
live material changes, and captures the rendered road/landscape. The Curvelo High
case also checks reduced motion and real action HUD/camera integration. Its short
action fixtures place an actual rival using RaceField's existing puppet hook; all
player physics, collision resolution, RaceAction and HUD updates stay in the game.
The fixture is a reproducible encounter, not a claim about autonomous AI racecraft.
"""
import hashlib
import json
import math
import os
import sys
import time
import traceback
from io import BytesIO
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright
from browser_config import (
    GAME_URL, browser_args, browser_executable, open_menu, wait_js, wait_race_start,
)

GPU_ONLY = '--gpu-only' in sys.argv[1:]
PORT = next((arg for arg in sys.argv[1:] if not arg.startswith('--')), None)
URL = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace(':8799', ':' + PORT) if PORT else GAME_URL)
OUT = Path(os.environ.get('VISUAL_ACTION_OUT') or Path.cwd() / '.audit-local' / 'visual-action').resolve()
REPORT = {'checks': {}, 'cases': {}, 'errors': [], 'screenshots': [], 'limitations': [
    'Headless timing is diagnostic; it does not measure the refresh rate of either physical monitor.',
    'Action encounters use an actual rival with a deterministic puppet path; normal driving is tested separately.',
    'Pixel checks catch empty/black output. Artistic quality still requires reviewing the PNGs.',
]}


def url_for(circuit):
    parts = urlsplit(URL)
    query = dict(parse_qsl(parts.query))
    query.update(circuito=circuit, intro='0')
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def check(name, condition, detail=None):
    REPORT['checks'][name] = {'passed': bool(condition), 'detail': detail}
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    if not condition:
        raise AssertionError(f'{name}: {detail}')


def watch(page, case):
    page.on('pageerror', lambda error: REPORT['errors'].append({'case': case, 'type': 'page', 'message': str(error)}))
    page.on('console', lambda msg: REPORT['errors'].append({'case': case, 'type': 'console', 'message': msg.text})
            if (msg.type == 'error' and not msg.text.startswith('Failed to load resource')) or
            (msg.type == 'warning' and any(term in msg.text for term in ['GL_INVALID', 'Shader Error', 'VALIDATE_STATUS', 'shader compilation'])) else None)
    # The optional radio playlist endpoint can be absent on a local server.
    page.on('response', lambda response: REPORT['errors'].append({'case': case, 'type': 'http', 'message': f'{response.status} {response.url}'})
            if response.status >= 400 and not urlsplit(response.url).path.endswith('tracks.json') else None)


def frames(page, count=4, timeout=30000):
    first = page.evaluate('interlagos.cockpitInfo().renderedFrame')
    return wait_js(page, 'n=>interlagos.cockpitInfo().renderedFrame>=n', arg=first + count, timeout=timeout)


def settled_graphics(page):
    wait_js(page, '!interlagosGraficos.info().compiling', timeout=45000)
    frames(page, 3)


def snapshot(page):
    return page.evaluate('''()=>({state:interlagos.state,camera:interlagos.cameraSnapshot(),
      telemetry:interlagos.telemetry(),surface:interlagos.surfaceInfo(),scenery:interlagos.sceneryInfo(),
      graphics:interlagosGraficos.info(),action:interlagos.actionInfo()})''')


def shot(page, name):
    frames(page, 2)
    state = snapshot(page)
    camera = state['camera']
    numbers = camera['position'] + camera['direction'] + [camera['fov'], camera['ground']]
    check(name + '_camera_finite', all(isinstance(v, (int, float)) and math.isfinite(v) for v in numbers), camera)
    check(name + '_camera_above_ground', camera['position'][1] > camera['ground'] - .25, camera)
    check(name + '_drawing_scene', state['state']['drawCalls'] > 5 and not state['state']['paused'], state['state'])
    data = page.screenshot(path=str(OUT / (name + '.png')), timeout=30000)
    image = Image.open(BytesIO(data)).convert('RGB')
    width, height = image.size
    # Exclude most HUD elements; inspect the central world image.
    crop = image.crop((int(width * .25), int(height * .15), int(width * .9), int(height * .88)))
    stats = ImageStat.Stat(crop)
    variation = sum(stats.stddev) / 3
    brightness = sum(stats.mean) / 3
    check(name + '_nonempty_image', len(data) > 25000 and variation > 14 and 8 < brightness < 247,
          {'bytes': len(data), 'variation': variation, 'brightness': brightness})
    REPORT['screenshots'].append({'name': name, 'path': str(OUT / (name + '.png')),
                                  'sha256': hashlib.sha256(data).hexdigest(), 'variation': variation,
                                  'brightness': brightness, 'state': state})
    return state


def open_graphics(page):
    page.click('#menuButton')
    page.click('#tab-graphics')


def resume_settings(page):
    page.click('#settingsResume')
    wait_js(page, '!interlagos.state.paused')
    settled_graphics(page)


def camera_ui(page, mode):
    page.click('#menuButton')
    page.click('#tab-race')
    page.select_option('#camera', mode)
    resume_settings(page)
    check('camera_select_' + mode, page.evaluate('interlagos.state.mode') == mode)


def begin_duel(page):
    if page.is_visible('#pilotName') and not page.input_value('#pilotName'):
        page.fill('#pilotName', 'Verificacao visual')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    page.click('#duelRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused', timeout=180000)
    page.evaluate('interlagos.skipIntro()')
    wait_race_start(page)
    settled_graphics(page)


# A forward 150 m corridor with the least heading change, far enough from the
# timing line to avoid the starting grid. Positions come from actual track data.
STRAIGHT = '''()=>{
 const a=interlagos.car.data.samples,n=a.length;let best=null;
 const angle=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
 for(let i=0;i<n;i+=4){const p=a[i];if(p[0]<130||p[4]<9)continue;
  const h=Math.atan2(p[8],p[7]);let cost=0;
  for(let k=1;k<=75;k+=5){const q=a[(i+k)%n];cost=Math.max(cost,angle(h,Math.atan2(q[8],q[7])));}
  if(!best||cost<best.curvature)best={index:i,s:p[0],curvature:cost,width:p[4]};
 }return best??{index:Math.floor(n*.2),s:0,curvature:0,width:0};
}'''


def place(page, index, speed=0):
    page.evaluate('''({index,speed})=>{interlagos.reposition(index);const c=interlagos.car;
      c.vx=Math.cos(c.heading)*speed;c.vy=Math.sin(c.heading)*speed;c.gear=speed>25?3:1;c.awaitingStart=false;
    }''', {'index': index, 'speed': speed})


def driving(page, name, straight):
    camera_ui(page, 'chase')
    place(page, straight['index'], 28)
    start = snapshot(page)
    frame = page.evaluate('interlagos.cockpitInfo().renderedFrame')
    wall = time.monotonic()
    page.keyboard.down('KeyW')
    try:
        page.wait_for_timeout(1600)
        after = shot(page, name + '_driving')
    finally:
        page.keyboard.up('KeyW')
    elapsed = time.monotonic() - wall
    drawn = page.evaluate('interlagos.cockpitInfo().renderedFrame') - frame
    distance = math.hypot(after['telemetry']['x'] - start['telemetry']['x'], after['telemetry']['y'] - start['telemetry']['y'])
    check(name + '_keyboard_drives', distance > 15 and after['telemetry']['speed'] > 30,
          {'distance': distance, 'speedKmh': after['telemetry']['speed']})
    check(name + '_driving_stays_on_road', after['telemetry']['onRoad'], after['telemetry'])
    return {'distance': distance, 'elapsedSeconds': elapsed, 'renderedFrames': drawn,
            'observedFramesPerSecond': drawn / elapsed, 'before': start['telemetry'], 'after': after['telemetry']}


def material_switches(page, case):
    values = []
    for material, detail in [('baixo', 0), ('medio', 1), ('ultra', 3), ('alto', 2)]:
        open_graphics(page)
        page.select_option('#gfx-materials', material)
        resume_settings(page)
        info = page.evaluate('interlagos.surfaceInfo()')
        selected = page.evaluate('interlagosGraficos.info().values.materials')
        check(f'{case}_material_{material}', selected == material and info['quality'] == material and info['detail'] == detail, info)
        values.append(info)
    return values


def comfortable_camera(page, straight, case):
    camera_ui(page, 'hood')
    page.emulate_media(reduced_motion='reduce')
    wait_js(page, '!interlagosGraficos.info().cinematic.features.motionBlur')
    place(page, straight['index'], 43)
    frames(page, 12)
    reduced = shot(page, case + '_reduced_motion')
    # With the motion off the lens stays at the view's own (camera-rig.js baseFov: the hood's 53 at 16:10).
    check(case + '_os_reduced_motion', abs(reduced['camera']['fov'] - reduced['camera']['baseFov']) < .05 and
          not reduced['graphics']['cinematic']['features']['motionBlur'], reduced['camera'])
    page.emulate_media(reduced_motion='no-preference')
    open_graphics(page)
    page.select_option('#gfx-cameraMotion', '0')
    resume_settings(page)
    place(page, straight['index'], 43)
    frames(page, 12)
    manual = shot(page, case + '_camera_motion_off')
    check(case + '_manual_camera_motion_off', manual['graphics']['values']['cameraMotion'] == 0 and
          abs(manual['camera']['fov'] - manual['camera']['baseFov']) < .05, manual['camera'])
    # Restore a normal High driving camera before measuring the action response.
    open_graphics(page)
    page.select_option('#gfx-cameraMotion', '1')
    resume_settings(page)
    camera_ui(page, 'chase')
    return {'os': reduced['camera'], 'manual': manual['camera']}


CAPTURE_FIXTURE = '''async()=>{
 const {ImmersiveMode}=await import('./immersive-mode.js');
 const {RaceAction}=await import('./race-action.js');
 let mode,action;const modeInfo=ImmersiveMode.prototype.info,actionInfo=RaceAction.prototype.info;
 try{
  ImmersiveMode.prototype.info=function(){mode=this;return modeInfo.call(this);};
  RaceAction.prototype.info=function(){action=this;return actionInfo.call(this);};
  interlagos.immersiveInfo();interlagos.actionInfo();
 }finally{ImmersiveMode.prototype.info=modeInfo;RaceAction.prototype.info=actionInfo;}
 if(!mode?.rivals.length||!action)throw new Error('Action fixture needs a live rival and RaceAction');
 const fixture=window.__visualActionFixture={mode,action,events:[],phase:null,
  puppets:mode.rivals.map(r=>r.puppet),update:action.update};
 action.update=function(...args){const result=fixture.update.apply(this,args);
  if(this.event)fixture.events.push({...this.event,phase:fixture.phase,time:this.time,
    speed:Math.hypot(interlagos.car.vx,interlagos.car.vy),collisions:mode.field.collisions});return result;};
 return {rival:mode.rivals[0].entry.number,count:mode.rivals.length};
}'''

SETUP_ENCOUNTER = '''({kind,index})=>{
 const f=window.__visualActionFixture,m=f.mode,player=interlagos.car;
 interlagos.reposition(index);player.vx=Math.cos(player.heading)*34;player.vy=Math.sin(player.heading)*34;
 player.gear=3;player.awaitingStart=false;f.action.reset();f.phase=kind;f.elapsed=0;
 m.knock=0;m.field.cooldowns.clear();
 // Put any other entrants well away from this corridor, without changing the roster.
 for(let i=1;i<m.rivals.length;i++){const r=m.rivals[i];r.car.reset((index+Math.floor(player.n*.5)+i*7)%player.n);
  r.puppet=()=>({throttle:0,brake:0,steer:0});}
 const rival=m.rivals[0];rival.finished=false;rival.car.reset(index);
 rival.puppet=(r,dt)=>{
  f.elapsed+=dt;const p=interlagos.car,c=Math.cos(p.heading),s=Math.sin(p.heading);
  const closing=kind==='near'?13:kind==='impact'?18:0;
  const ahead=kind==='duel'?1:8-closing*f.elapsed,side=kind==='impact'?0:2.65;
  Object.assign(r.car,{x:p.x+c*ahead-s*side,y:p.y+s*ahead+c*side,heading:p.heading,
   vx:p.vx-c*closing,vy:p.vy-s*closing,yaw:0,awaitingStart:false});r.car.settle();
  r.progress=m.freePlayerProgress+ahead;r.lastS=r.car.surface.s;
  return {throttle:0,brake:0,steer:0};
 };
 return {kind,index,beforeCollisions:m.field.collisions};
}'''

RESTORE_FIXTURE = '''()=>{const f=window.__visualActionFixture;if(!f)return;
 f.action.update=f.update;f.mode.rivals.forEach((r,i)=>{if(f.puppets[i])r.puppet=f.puppets[i];else delete r.puppet;});
}'''


def action_encounters(page, straight, case):
    captured = page.evaluate(CAPTURE_FIXTURE)
    results = {'fixture': captured, 'encounters': {}}
    try:
        for kind in ['near', 'duel', 'impact']:
            started = page.evaluate(SETUP_ENCOUNTER, {'kind': kind, 'index': straight['index']})
            event = wait_js(page, '''kind=>window.__visualActionFixture.events.find(e=>e.phase===kind&&e.kind===kind)''',
                            arg=kind, timeout=15000)
            visible = page.evaluate('''kind=>{const n=document.querySelector('#raceAction');return !!n&&!n.hidden&&n.dataset.kind===kind}''', kind)
            check(case + '_action_' + kind, visible and event['speed'] > 18, event)
            if kind == 'impact':
                check(case + '_impact_uses_collision_physics', event['collisions'] > started['beforeCollisions'], event)
            state = shot(page, case + '_action_' + kind)
            # Speed and the action open the chase lens past its own (55 at 16:10), never wider than 92° side to side
            # (camera-rig.js MAX_SPEED_HFOV, applied after the kick and the punches; 95° only on a 20:9 phone).
            wide = math.degrees(2 * math.atan(math.tan(math.radians(state['camera']['fov']) / 2) * state['camera']['aspect']))
            check(case + '_action_camera_' + kind, state['camera']['fov'] > state['camera']['baseFov'] + 1 and wide < (92.1 if state['camera']['aspect'] <= 16 / 9 + .01 else 95.1), {**state['camera'], 'horizontalFov': round(wide, 1)})
            results['encounters'][kind] = {'event': event, 'camera': state['camera'], 'action': state['action']}
    finally:
        page.evaluate(RESTORE_FIXTURE)
    return results


def gpu_timing(page, straight, case):
    place(page, straight['index'])
    page.evaluate("interlagosGraficos.set({level:'alto',overrides:{dynamicResolution:true,targetFps:160}})")
    settled_graphics(page)
    for _ in range(3):
        if page.evaluate('interlagosGraficos.info().debug.mode') == 'full':
            break
        page.keyboard.press('F3')
    check(case + '_gpu_overlay_full', page.evaluate('interlagosGraficos.info().debug.mode') == 'full')
    page.wait_for_timeout(2000)
    shown = page.evaluate('interlagosGraficos.info()')
    page.keyboard.press('F3')
    check(case + '_gpu_overlay_off', page.evaluate('interlagosGraficos.info().debug.mode') == 'off')
    page.wait_for_timeout(2000)
    hidden = page.evaluate('interlagosGraficos.info()')
    resolution = hidden['resolution']
    check(case + '_gpu_timing_survives_hidden_overlay', resolution.get('gpuMs', 0) > 0,
          {'shown': shown['resolution'], 'hidden': resolution})
    check(case + '_gpu_dynamic_resolution_bounds', resolution['min'] - .001 <= hidden['pixelRatio'] <= resolution['max'] + .001
          and hidden['values']['targetFps'] == 160 and 0 < resolution['targetFps'] <= 160,
          {'ratio': hidden['pixelRatio'], 'requestedTarget': hidden['values']['targetFps'], **resolution})
    return {'shown': shown, 'hidden': hidden}


def run_case(browser, circuit, level):
    case = f'{circuit}_{level}'
    context = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1,
                                  reduced_motion='no-preference')
    # A fresh context isolates preference writes, profiles and results from the user's browser.
    overrides = {'dynamicResolution': False}
    if level == 'alto':
        overrides['resolution'] = 1
    preferences = {'circuit': circuit, 'immersive': False, 'duelRival': '73', 'camera': 'chase',
                   'graphics': {'level': level, 'overrides': overrides}}
    context.add_init_script('localStorage.setItem("opala99-preferences-v1",JSON.stringify(' + json.dumps(preferences) + '));')
    page = context.new_page()
    page.set_default_timeout(180000)
    watch(page, case)
    result = REPORT['cases'][case] = {}
    try:
        open_menu(page, url_for(circuit), timeout=180000)
        begin_duel(page)
        check(case + '_correct_circuit', page.evaluate('interlagos.circuit') == circuit)
        graphics = page.evaluate('interlagosGraficos.info()')
        scenery = page.evaluate('interlagos.sceneryInfo()')
        expected = 'basico' if level == 'baixo' else 'completo'
        check(case + '_scenery_loaded', graphics['scenery'] == expected and
              (scenery.get('grassTufts', 0) == 0 if level == 'baixo' else scenery.get('grassTufts', 0) > 0), scenery)
        check(case + '_shader_profile', graphics['cinematic']['level'] == ('off' if level == 'baixo' else 'full'), graphics['cinematic'])
        surface = page.evaluate('interlagos.surfaceInfo()')
        check(case + '_material_profile', surface['quality'] == level and surface['detail'] == (0 if level == 'baixo' else 2), surface)
        straight = page.evaluate(STRAIGHT)
        result.update(straight=straight, graphics=graphics, scenery=scenery, surface=surface)
        if GPU_ONLY:
            # Also keep one native-resolution image before the adaptive stress step.
            place(page, page.evaluate('Math.floor(interlagos.car.n*.18)'))
            shot(page, case + '_grass_final')
            result['gpuTiming'] = gpu_timing(page, straight, case)
            case_errors = [e for e in REPORT['errors'] if e['case'] == case]
            check(case + '_no_browser_errors', not case_errors, case_errors)
            return
        for mode, fraction in [('chase', .18), ('hood', .58)]:
            camera_ui(page, mode)
            index = page.evaluate('f=>Math.floor(interlagos.car.n*f)', fraction)
            place(page, index)
            shot(page, case + '_' + mode + '_landscape')
        result['driving'] = driving(page, case, straight)
        if level == 'alto':
            result['materials'] = material_switches(page, case)
        if circuit == 'curvelo' and level == 'alto':
            result['comfort'] = comfortable_camera(page, straight, case)
            result['actions'] = action_encounters(page, straight, case)
            result['gpuTiming'] = gpu_timing(page, straight, case)
        case_errors = [e for e in REPORT['errors'] if e['case'] == case]
        check(case + '_no_browser_errors', not case_errors, case_errors)
    except Exception:
        result['failure'] = traceback.format_exc()
        REPORT['checks'][case + '_completed'] = {'passed': False, 'detail': result['failure']}
        print(result['failure'], flush=True)
        try:
            page.screenshot(path=str(OUT / (case + '_failure.png')), timeout=10000)
        except Exception:
            pass
    finally:
        context.close()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
            try:
                for circuit in (['curvelo'] if GPU_ONLY else ['curvelo', 'cascavel']):
                    for level in (['alto'] if GPU_ONLY else ['baixo', 'alto']):
                        run_case(browser, circuit, level)
            finally:
                browser.close()
    except Exception:
        REPORT['errors'].append({'case': 'runner', 'type': 'exception', 'message': traceback.format_exc()})
    passed = len(REPORT['cases']) == (1 if GPU_ONLY else 4) and bool(REPORT['checks']) and all(item['passed'] for item in REPORT['checks'].values()) and not REPORT['errors']
    REPORT['passed'] = passed
    (OUT / ('resultado_gpu.json' if GPU_ONLY else 'resultado.json')).write_text(json.dumps(REPORT, indent=2, ensure_ascii=False), encoding='utf-8')
    print(('ALL PASSED' if passed else 'FAILED') + ': ' + str(OUT), flush=True)
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main())
