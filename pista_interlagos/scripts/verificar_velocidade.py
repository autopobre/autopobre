"""'Sensação de velocidade' in the real game (speed-particles.js, kerb-contact.js, tyre-smoke.js rings,
verge grass wake). Run with no other GPU check in parallel.

Usage: verificar_velocidade.py [port] [out_dir]
INTERLAGOS_URL overrides the address; out_dir defaults to cwd/.audit-local/velocidade (shots + relatorio.json).

Interlagos, Corrida única, on a virtual clock (every step is one 1/60 s frame, so shots are frame-exact):
- Médio and Alto: the air specks per level (24 dark ones / 120, one draw), live switches to Desligada and back;
- Médio: a rival held on the grass beside the back straight (RaceField's puppet hook) throws dust and the
  near road smears (the phones' road smear); at Leve both stop;
- Alto: the speed smear follows the camera (none on a paused frame) and the specks stay below the horizon, never
  against the sky, and never across the followed car;
- Alto: the player rides the Curva do Sol kerb: kerbRide, the rumble loop on the kerb's side, light-motor
  pulses on a (fake) pad, the camera's kerb jolt (more than the car's own heave: A/B with Movimento de câmera off),
  a faint grit puff from the player's own wheels (none on a wet kerb), no gravel noise and no dirt cloud; back on
  the asphalt it dies away;
- Alto: a rival runs through the verge grass with the race held (P): the grass by the rival changes when
  the wake is switched off (Média) and comes back exactly when switched on again (Completa).
"""
import json, math, os, sys
from io import BytesIO
from pathlib import Path
from urllib.parse import urlencode
sys.path.insert(0, str(Path(__file__).resolve().parent))
import browser_config  # noqa: F401  headless + in-page pointer lock
from browser_config import GAME_URL, browser_args, browser_executable, open_menu, wait_js, wait_race_start, start_race
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
PORT = ARGS[0] if ARGS else None
BASE = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace(':8799', ':' + PORT) if PORT else GAME_URL)
URL = BASE.split('?')[0] + '?' + urlencode({'circuito': 'interlagos', 'intro': '0'})
OUT = Path(ARGS[1] if len(ARGS) > 1 else Path.cwd() / '.audit-local' / 'velocidade').resolve(); OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'checks': {}, 'errors': [], 'info': {}}
HIDE_UI = 'body *{visibility:hidden!important} #view{visibility:visible!important}'
CAMERA = "m=>{const s=document.getElementById('camera');s.value=m;s.dispatchEvent(new Event('change'));return true;}"
HOOK = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const info=ImmersiveMode.prototype.info;
 try{ImmersiveMode.prototype.info=function(){window.__speedFixture=this;return info.call(this);};interlagos.immersiveInfo();}finally{ImmersiveMode.prototype.info=info;}return !!window.__speedFixture;}"""
# rAF and performance.now on a virtual clock: __step(n) runs n frames of 1/60 s.
CLOCK = """()=>{let t=performance.now(),queue=[];performance.now=()=>t;
 window.requestAnimationFrame=cb=>{queue.push(cb);return queue.length;};
 window.__step=n=>{for(let k=0;k<n;k++){t+=1000/60;const q=queue;queue=[];for(const cb of q)cb(t);}return true;};return true;}"""
# who -1: the player (reposition), else rival who. d: metres to the left of the centre line.
PUT = """([who,s,d,speed])=>{const m=window.__speedFixture,c=who<0?interlagos.car:m.rivals[who].car,a=c.data.samples;let i=0;for(let k=0;k<a.length;k++)if(Math.abs(a[k][0]-s)<Math.abs(a[i][0]-s))i=k;
 if(who<0)interlagos.reposition(i);else c.reset(i);const p=a[i];c.x=p[1]+p[9]*d;c.y=p[2]+p[10]*d;c.heading=Math.atan2(p[8],p[7]);c.settle();c.index=i;
 c.vx=Math.cos(c.heading)*speed;c.vy=Math.sin(c.heading)*speed;c.gear=who<0?5:4;c.awaitingStart=false;if(who>=0)m.rivals[who].lastS=c.surface.s;return p[4];}"""
# A rival held at a lateral offset along the track at constant speed; the others parked far away.
DRIVE = """([who,s0,d,v])=>{const m=window.__speedFixture,r=m.rivals[who],a=r.car.data.samples,n=a.length;let s=s0;
 m.rivals.forEach((o,k)=>{if(k!==who){o.car.reset((300+k*11)%n);o.puppet=()=>({throttle:0,brake:0,steer:0});}});
 const at=s=>{let lo=0,hi=n-1;while(hi-lo>1){const k=(lo+hi)>>1;if(a[k][0]<=s)lo=k;else hi=k;}return lo;};
 r.puppet=(r,dt)=>{s+=v*dt;const i=at(s),p=a[i],q=a[(i+1)%n],f=(s-p[0])/Math.max(.01,q[0]-p[0]),h=Math.atan2(p[8]+(q[8]-p[8])*f,p[7]+(q[7]-p[7])*f);
  Object.assign(r.car,{x:p[1]+(q[1]-p[1])*f+(p[9]+(q[9]-p[9])*f)*d,y:p[2]+(q[2]-p[2])*f+(p[10]+(q[10]-p[10])*f)*d,heading:h,vx:Math.cos(h)*v,vy:Math.sin(h)*v,yaw:0,awaitingStart:false});
  r.car.settle();r.lastS=r.car.surface.s;return {throttle:1,brake:0,steer:0};};return true;}"""
# A standard pad whose rumble effects are recorded (as verificar_controle.py does), plugged in for the kerb.
FAKE_PAD = """(()=>{const pad={connected:false,axes:[0,0,0,0],buttons:Array(17).fill(0),effects:[]};window.fakePad=pad;
 Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>pad.connected?[{id:'Xbox 360 Controller (XInput STANDARD GAMEPAD)',index:0,mapping:'standard',connected:true,timestamp:performance.now(),
  axes:[...pad.axes],buttons:pad.buttons.map(v=>({pressed:v>.5,touched:v>0,value:v})),
  vibrationActuator:{playEffect:(type,params)=>{pad.effects.push({type,...params});return Promise.resolve('complete');}}}]:[]});})()"""
# The live AirMotes (caught on its next update, as the fixture above catches ImmersiveMode): its
# alpha 0 hides the specks without touching anything else.
HIDE_MOTES = """async()=>{const {AirMotes}=await import('./speed-particles.js');const update=AirMotes.prototype.update;let motes=null;
 AirMotes.prototype.update=function(...args){motes=this;return update.apply(this,args);};try{__step(1);}finally{AirMotes.prototype.update=update;}
 if(motes)motes.alpha=0;return !!motes;}"""
# The same specks drawn solid magenta (a new fragment program, for this check only): where they land shows plainly.
MARK_MOTES = """async()=>{const {AirMotes}=await import('./speed-particles.js');const update=AirMotes.prototype.update;let motes=null;
 AirMotes.prototype.update=function(...args){motes=this;return update.apply(this,args);};try{__step(1);}finally{AirMotes.prototype.update=update;}
 if(!motes)return false;window.__marked={motes,shader:motes.material.fragmentShader};motes.material.fragmentShader=motes.material.fragmentShader.replace('gl_FragColor=vec4(vTint*effectLight,a);','gl_FragColor=vec4(8.,0.,8.,1.);');motes.material.needsUpdate=true;return true;}"""
UNMARK_MOTES = "(()=>{const m=window.__marked;if(m){m.motes.material.fragmentShader=m.shader;m.motes.material.needsUpdate=true;}return true;})()"


def check(name, condition, detail=None):
    REPORT['checks'][name] = {'passed': bool(condition), 'detail': detail}
    print(('PASS ' if condition else 'FAIL ') + name, json.dumps(detail, ensure_ascii=False)[:300] if detail is not None else '', flush=True)
    if not condition:
        raise AssertionError(f'{name}: {detail}')


def step(page, n):
    page.evaluate(f'__step({n})')


def speed(page):
    return page.evaluate('interlagos.speedInfo()')


def compiled(page):
    # A weather change's new programs compile in slices while the race holds (main.js graphicsCompiling): frames on.
    for _ in range(600):
        if not page.evaluate('interlagosGraficos.info().compiling'):
            return
        step(page, 1); page.wait_for_timeout(50)
    raise AssertionError('still compiling')


def shot(page, name):
    data = page.screenshot(path=str(OUT / f'{name}.png'))
    return Image.open(BytesIO(data)).convert('RGB')


def set_effects(page, level, value):
    page.evaluate('v=>{interlagosGraficos.set(v);return true;}', {'level': level, 'overrides': {'dynamicResolution': False, 'speedEffects': value}})


def start(browser, level):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1, reduced_motion='no-preference')
    prefs = {'circuit': 'interlagos', 'immersive': False, 'camera': 'chase', 'graphics': {'level': level, 'overrides': {'dynamicResolution': False}}}
    ctx.add_init_script('localStorage.setItem("opala99-preferences-v1",JSON.stringify(' + json.dumps(prefs) + '));')
    ctx.add_init_script(FAKE_PAD)
    page = ctx.new_page(); page.set_default_timeout(180000)
    page.on('pageerror', lambda e: REPORT['errors'].append(f'{level} page: {e}'))
    page.on('console', lambda m: REPORT['errors'].append(f'{level} console: {m.text}') if (m.type == 'error' and not m.text.startswith('Failed to load resource')) or
            (m.type == 'warning' and any(t in m.text for t in ['GL_INVALID', 'Shader Error', 'VALIDATE_STATUS', 'shader compilation'])) else None)
    open_menu(page, URL, timeout=180000)
    if page.is_visible('#pilotName') and not page.input_value('#pilotName'):
        page.fill('#pilotName', 'Verificacao velocidade')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    start_race(page, '#singleRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused', timeout=180000)
    page.evaluate('interlagos.skipIntro()')
    wait_race_start(page)
    wait_js(page, '!interlagosGraficos.info().compiling', timeout=60000)
    check(f'{level}_fixture', page.evaluate(HOOK))
    wait_js(page, 'window.__speedFixture.field.time>1', timeout=60000)
    page.add_style_tag(content=HIDE_UI)
    page.evaluate(CLOCK)
    page.wait_for_timeout(300)
    return ctx, page


def motes_per_level(page, level, expected):
    info = speed(page)
    check(f'{level}_motes', info['motes']['count'] == expected and info['motes']['visible'] and info['drawCalls'] == 1, info['motes'])
    set_effects(page, level, 'off'); step(page, 2); off = speed(page)
    check(f'{level}_motes_off_live', off['motes']['count'] == 0 and not off['motes']['visible'] and off['drawCalls'] == 0 and not off['rivalDust'], off['motes'])
    set_effects(page, level, 'completa'); step(page, 2); full = speed(page)
    check(f'{level}_motes_completa_live', 100 <= full['motes']['count'] <= 130 and full['grassWake'] and not page.evaluate('interlagosGraficos.info().compiling'), full['motes'])
    set_effects(page, level, {'medio': 'media', 'alto': 'completa'}[level]); step(page, 2)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    # ---------------- Médio (phones): 24 dark specks, the rivals' dust, no grass.
    ctx, page = start(browser, 'medio')
    motes_per_level(page, 'medio', 24)
    check('medio_no_grass', (page.evaluate('interlagos.sceneryInfo().grassTufts') or 0) == 0)
    page.evaluate(CAMERA, 'chase')
    w = page.evaluate(PUT, [-1, 1000, -1.0, 42])
    page.evaluate(PUT, [0, 1017, 0, 40]); page.evaluate(DRIVE, [0, 1017, -(w / 2 + 1.9), 40])
    step(page, 50)
    dust = speed(page)['particles']
    check('medio_rival_dust', dust['dust'] > 12, dust)
    # Médio's film look has no full smear: Média streams the near road instead (cinematic.js ROAD_SMEAR); Leve does not.
    road = page.evaluate('interlagosGraficos.info().cinematic.smear')
    check('medio_road_smear', road['road'] and road['strength'] > .2 and not page.evaluate('interlagosGraficos.info().cinematic.features.motionBlur'), road)
    shot(page, 'medio_poeira_rival')
    # In the bonnet view the own car's box is the whole screen: the road smear would throw every tap away, so it is off.
    page.evaluate(CAMERA, 'hood'); step(page, 3)
    road = page.evaluate('interlagosGraficos.info().cinematic.smear')
    check('medio_hood_no_road_smear', not road['road'] and road['strength'] == 0, road)
    page.evaluate(CAMERA, 'chase'); step(page, 3)
    set_effects(page, 'medio', 'leve'); step(page, 2); before = speed(page)['particles']['total']; step(page, 40)
    check('leve_no_rival_dust', speed(page)['particles']['total'] == before, {'before': before, 'after': speed(page)['particles']['total']})
    road = page.evaluate('interlagosGraficos.info().cinematic.smear')
    check('leve_no_road_smear', not road['road'] and road['strength'] == 0, road)
    REPORT['info']['medio'] = speed(page)
    ctx.close()

    # ---------------- Alto: 120 specks, kerb rumble, grass wake.
    ctx, page = start(browser, 'alto')
    motes_per_level(page, 'alto', 120)
    check('alto_grass', page.evaluate('interlagos.sceneryInfo().grassTufts') > 1000)
    # Straight at 200 km/h: the specks stream past (the streak follows the camera's speed).
    page.evaluate(CAMERA, 'chase'); page.evaluate(PUT, [-1, 4100, -1.5, 55]); page.keyboard.down('KeyW'); step(page, 40)
    straight = speed(page)
    check('alto_streaks_at_speed', .4 < straight['motes']['streak'] < 1.31 and straight['motes']['speed'] > 45, straight['motes'])
    shot(page, 'alto_reta_200')
    # The speed smear rides on the camera's own motion (cinematic.js SPEED_SMEAR): full at 200 km/h, nothing on a
    # paused frame, and back over a few frames once the race goes on (a cut or a pause starts it from nothing).
    smear = lambda: page.evaluate('interlagosGraficos.info().cinematic.smear')
    moving = smear(); page.keyboard.press('KeyP'); step(page, 2); held = smear()
    # Held, the specks stand where they were: they change the picture below the horizon, never the sky above it, and
    # never the followed car's box (after the lens has settled: it keeps easing to its speed width while held). For
    # the A/B they are drawn solid magenta (thin dark dust would hide in the grass), then hidden.
    step(page, 240); shot(page, 'alto_reta_200_parado')
    check('motes_marked', page.evaluate(MARK_MOTES)); step(page, 1)
    with_motes = shot(page, 'alto_reta_200_parado_marcado'); box = speed(page)['motes']['carBox']
    check('motes_hidden_for_sky_check', page.evaluate(HIDE_MOTES)); step(page, 1)
    without = shot(page, 'alto_reta_200_parado_sem_ar')
    page.evaluate("async()=>{const {AirMotes}=await import('./speed-particles.js');const u=AirMotes.prototype.update;AirMotes.prototype.update=function(...a){this.alpha=1;AirMotes.prototype.update=u;return u.apply(this,a);};return true;}")
    diff = ImageChops.difference(with_motes, without).convert('L'); w, h = diff.size
    sky = sum(diff.crop((0, 0, w, int(h * .4))).histogram()[9:]); road = sum(diff.crop((0, int(h * .5), w, h)).histogram()[9:])
    car = sum(diff.crop((int(box[0] * w), int((1 - box[3]) * h), int(box[2] * w), int((1 - box[1]) * h))).histogram()[9:]) if box else None
    REPORT['info']['motes_where'] = {'sky': sky, 'road': road, 'car': car, 'carBox': box}
    check('motes_below_the_horizon_not_the_sky', sky <= 5 and road > 20, {'sky': sky, 'road': road})
    check('motes_never_across_the_car', box is not None and car <= 3, {'car': car, 'box': box})
    page.evaluate(UNMARK_MOTES)
    page.keyboard.press('KeyP'); step(page, 1); first = smear(); step(page, 20); again = smear()
    check('smear_follows_the_camera', moving['strength'] > .9 and held['strength'] == 0 and first['strength'] < .5 and again['strength'] > .9, {'moving': moving, 'held': held, 'first': first, 'again': again})
    page.keyboard.up('KeyW')
    # The Curva do Sol kerb (left side) under the left wheels at 31 m/s.
    page.evaluate("fakePad.connected=true;dispatchEvent(new Event('gamepadconnected'));true"); step(page, 2)
    w = page.evaluate(PUT, [-1, 548, 0, 0]); page.evaluate('fakePad.effects.length=0;true')
    page.evaluate(PUT, [-1, 548, w / 2 + .45 - .804, 31]); step(page, 10)
    pulses = page.evaluate('fakePad.effects')
    check('kerb_pad_buzz', len(pulses) >= 1 and all(e['type'] == 'dual-rumble' and e['strongMagnitude'] == 0 and 0 < e['weakMagnitude'] <= .6 for e in pulses), pulses[:3])
    kerb = speed(page); audio = page.evaluate('interlagos.audioInfo()'); loops = (audio.get('effects') or {}).get('loops', {})
    REPORT['info']['kerb'] = {'speed': kerb, 'loops': loops, 'context': audio.get('context'), 'focused': audio.get('focused')}
    check('kerb_ride', kerb['kerbWheels'] == 2 and kerb['kerb']['level'] > .8 and kerb['kerbTilt'] > .5 and kerb['kerb']['pan'] < 0 and kerb['kerb']['dirt'] == 0, kerb)
    check('kerb_pitch_follows_ridges', abs(kerb['kerb']['hz'] - page.evaluate('Math.hypot(interlagos.car.vx,interlagos.car.vy)') / .4) < 2, kerb['kerb'])
    check('kerb_no_dirt_cloud', page.evaluate('interlagos.smokeInfo().active') == 0, page.evaluate('interlagos.smokeInfo()'))
    # The camera's mount jolts on the ridges (camera-rig.js KERB_JOLT): the eye's height shakes by centimetres from frame
    # to frame; the painted kerb scuffs up a faint grit puff (speed effects' ring, not the dirt cloud above).
    jolt = lambda: (lambda ys: max(abs(ys[i + 1] - 2 * ys[i] + ys[i - 1]) for i in range(1, len(ys) - 1)))([page.evaluate('(__step(1),interlagos.cameraSnapshot().position[1])') for _ in range(14)])
    on_kerb = jolt(); grit = speed(page)['particles']
    # (the player's own wheels' grit, tagged apart from the rivals' dust in the same ring)
    check('kerb_grit_puff', grit['kerb'] >= 1, grit)
    # A/B on the same kerb with Movimento de câmera off: the car's own heave over the ridges is left, the jolt is not.
    page.evaluate('v=>{interlagosGraficos.set(v);return true;}', {'level': 'alto', 'overrides': {'dynamicResolution': False, 'cameraMotion': 0}}); step(page, 2)
    page.evaluate(PUT, [-1, 548, w / 2 + .45 - .804, 31]); step(page, 10)
    heave_only = jolt()
    page.evaluate('v=>{interlagosGraficos.set(v);return true;}', {'level': 'alto', 'overrides': {'dynamicResolution': False}}); step(page, 2)
    page.evaluate(PUT, [-1, 548, w / 2 + .45 - .804, 31]); step(page, 10)
    REPORT['info']['jolt'] = {'kerb': on_kerb, 'kerb_motion_off': heave_only}
    check('kerb_jolt_is_the_mount', on_kerb > 2 * heave_only, {'kerb': round(on_kerb, 4), 'motion_off': round(heave_only, 4)})
    # A wet track lays the dust: held on the same kerb in the rain (the weather the Corrida tab picks) for a second, the
    # dry puffs dying out, no grit; dry again, it comes back.
    # (the rain's lamps and wipers compile first, the race held meanwhile; then put back every few frames: on the wet
    # track the car slides off the kerb within a few metres)
    page.evaluate("interlagosClima.set({rain:'chuva'});true"); compiled(page)
    for _ in range(15):
        page.evaluate(PUT, [-1, 548, w / 2 + .45 - .804, 31]); step(page, 4)
    wet = speed(page); page.evaluate("interlagosClima.set({rain:'seco'});true"); compiled(page)
    check('kerb_no_grit_in_the_wet', wet['kerbWheels'] == 2 and wet['particles']['kerb'] == 0, {'kerbWheels': wet['kerbWheels'], 'particles': wet['particles']})
    page.evaluate(PUT, [-1, 548, w / 2 + .45 - .804, 31]); step(page, 10)
    check('kerb_grit_when_dry_again', speed(page)['particles']['kerb'] >= 1, speed(page)['particles'])
    if audio.get('context') == 'running' and audio.get('focused'):
        check('kerb_rumble_loop', loops.get('kerb', 0) > .05 and loops.get('gravel', 1) == 0, loops)
    else:
        REPORT['info']['audio_skipped'] = 'audio context not running in this browser'
    shot(page, 'alto_zebra')
    page.evaluate(PUT, [-1, 560, 0, 31]); step(page, 40)
    back = speed(page)
    check('kerb_fades_on_asphalt', back['kerbWheels'] == 0 and back['kerb']['level'] < .02, back['kerb'])
    off_kerb = jolt()
    check('kerb_jolt', .004 < on_kerb < .08 and on_kerb > 3 * off_kerb, {'kerb': round(on_kerb, 4), 'asphalt': round(off_kerb, 4)})
    # Verge grass: a rival through the grass beside the back straight, the race held on one frame.
    w = page.evaluate(PUT, [-1, 1752, 1.0, 36])
    page.evaluate(PUT, [0, 1765, 0, 34]); page.evaluate(DRIVE, [0, 1765, w / 2 + 2.6, 34])
    step(page, 30)
    page.keyboard.press('KeyP')
    # Held: the chase camera still eases onto the stopped car and the exposure adapts; wait for both.
    settled = None
    for _ in range(40):
        step(page, 30)
        pose = page.evaluate('interlagos.cameraSnapshot().position')
        if settled and math.dist(pose, settled) < 1e-4:
            break
        settled = pose
    step(page, 120)
    check('race_held', page.evaluate('interlagos.state.paused'))
    wake = speed(page)
    check('grass_wake_cars', wake['wakeCars'] >= 1, wake)
    where = page.evaluate("""()=>{const c=window.__speedFixture.rivals[0].car;return [c.x,c.surface.z,-c.y];}""")
    # The specks change count with the level: hidden for this A/B so only the grass can differ.
    check('motes_hidden', page.evaluate(HIDE_MOTES)); step(page, 1)
    on = shot(page, 'alto_capim_com_rastro')
    set_effects(page, 'alto', 'media'); step(page, 3)
    off = shot(page, 'alto_capim_sem_rastro')
    set_effects(page, 'alto', 'completa'); step(page, 3)
    again = shot(page, 'alto_capim_com_rastro_2')
    # The left half of the picture below the horizon holds the rival, its dust (frozen) and the grass round it.
    box = (0, 300, 640, 720)
    changed = lambda a, b: sum(ImageChops.difference(a.crop(box), b.crop(box)).convert('L').histogram()[11:])
    diff, same = changed(on, off), changed(on, again)
    REPORT['info']['grass'] = {'rival': where, 'pixelsOff': diff, 'pixelsAgain': same}
    # Small tufts 20 m away: dozens of pixels move; with the wake back on the picture is the same again.
    check('grass_wake_visible', diff > 40 and same <= 5, {'off': diff, 'again': same})
    REPORT['info']['alto'] = speed(page)
    ctx.close()
    browser.close()

REPORT['errors'] = REPORT['errors'][:20]
(OUT / 'relatorio.json').write_text(json.dumps(REPORT, indent=1, ensure_ascii=False), encoding='utf-8')
check('no_page_errors', not REPORT['errors'], REPORT['errors'][:5])
print('velocidade: ok', OUT)
