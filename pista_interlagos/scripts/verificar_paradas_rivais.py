"""Browser check for the rivals' refuelling stops and the pit limiter (user, 10-24).

Modo Corrida at Interlagos. 3 laps: the tank covers the race, the teams' garage doors stay shut. 20 laps: the doors of
the teams racing roll up; with the rivals' fuel cut to a lap's worth, the first one in stops at its own garage (never
Box 99 nor the Tia's café), its crew in the team's colours comes out, the fuel man fills it from the can and the
mechanic wipes the windscreen, it leaves and the crew goes back in. Then the player's car in the pit lane's limit zone
at 108 km/h, flat out: the limiter brakes it to 60 km/h and the HUD says so.
Honours INTERLAGOS_URL (default: the 8799 server); screenshots in SHOTS_DIR (default renders/)."""
import json
import math
import os
from pathlib import Path
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, GAME_URL
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
SHOTS = Path(os.environ.get('SHOTS_DIR', ROOT / 'renders'))
SHOTS.mkdir(parents=True, exist_ok=True)
HOOK = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;
ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();return true;}"""
report = {'errors': [], 'checks': {}}


def check(name, value, detail=None):
    report['checks'][name] = bool(value)
    print(name, bool(value), flush=True)
    assert value, (name, detail)


def session(browser, laps):
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    context.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({...JSON.parse(localStorage.getItem('opala99-preferences-v1')||'{}'),laps:%d,circuit:'interlagos'}))" % laps)
    page = context.new_page()
    page.set_default_timeout(180000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
    open_menu(page, URL)
    enter_track(page)
    page.evaluate(HOOK)
    wait_js(page, 'fixtureMode.freeCountdown===0&&fixtureMode.field.time>3', timeout=180000)
    return context, page


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context, page = session(browser, 3)
    short = page.evaluate("({refuel:!!fixtureMode.field.refuel,doors:interlagos.garagesInfo().doors})")
    check('short_race_keeps_the_doors_shut', not short['refuel'] and all(v == 0 for v in short['doors'].values()), short)
    context.close()

    context, page = session(browser, 20)
    race = page.evaluate("({refuel:!!fixtureMode.field.refuel,doors:interlagos.garagesInfo().doors,box99:fixtureMode.data.pit.box99.index})")
    check('long_race_opens_the_teams_doors', race['refuel'] and len(race['doors']) == 14 and all(v == 1 for v in race['doors'].values())
          and str(race['box99']) not in race['doors'] and str(race['box99'] - 1) not in race['doors'], race)
    # A lap's fuel left: everyone comes in at the next pass; the player's car out of the way.
    page.evaluate("()=>{for(const r of fixtureMode.field.rivals)r.fuel=Math.min(r.fuel,1.3);const c=interlagos.car,s=c.surface;c.x+=s.lx*45;c.y+=s.ly*45;c.vx=c.vy=0;c.surface=c.sample(c.x,c.y);return true;}")
    wait_js(page, 'interlagos.pitStops().length>0', timeout=240000)
    first = page.evaluate('interlagos.pitStops()[0]')
    report['first'] = first
    check('stops_at_its_own_garage', first['bay'] not in (race['box99'], race['box99'] - 1) and first['bay'] in [int(b) for b in race['doors']], first)
    pose, side, h = first['pose'], first['side'], first['pose']['heading']
    nx, ny = -math.sin(h) * side, math.cos(h) * side
    z = page.evaluate("fixtureMode.data.pit.samples[Math.floor(fixtureMode.data.pit.samples.length/2)][fixtureMode.data.pit.columns.indexOf('z')]")
    page.evaluate(f"interlagos.peek([{pose['x'] - math.cos(h) * 12 - nx * 7},{z + 3.6},{-(pose['y'] - math.sin(h) * 12 - ny * 7)}],[{pose['x'] + math.cos(h) * 2},{z + .8},{-(pose['y'] + math.sin(h) * 2)}])")
    number = first['number']
    wait_js(page, f"interlagos.pitStops().some(s=>s.number==='{number}'&&s.phase==='abastecendo')", timeout=120000)
    page.wait_for_timeout(2500)
    crew = page.evaluate(f"interlagos.garagesInfo().crews.find(c=>c.number==='{number}')")
    report['crew'] = crew
    check('crew_at_work', crew and all(a['visible'] for a in crew['actors']) and [a['act'] for a in crew['actors']] == ['fuel', 'wipe'], crew)
    page.screenshot(path=str(SHOTS / 'paradas_rivais_abastecendo.png'))
    wait_js(page, f"!interlagos.pitStops().some(s=>s.number==='{number}')", timeout=120000)
    page.wait_for_timeout(6000)
    gone = page.evaluate(f"(()=>{{const r=fixtureMode.field.rivals.find(r=>r.entry.number==='{number}');return {{fuel:r.fuel,stops:r.stops,pit:!!r.pit,onPit:!!r.car.surface.pit}}}})()")
    report['after'] = gone
    check('back_on_track_refuelled', gone['stops'] == 1 and not gone['pit'] and gone['fuel'] > 5, gone)
    page.screenshot(path=str(SHOTS / 'paradas_rivais_depois.png'))
    # The limiter: in the zone at 108 km/h, flat out (the throttle key held).
    page.evaluate('interlagos.peek(null)')
    page.evaluate("""()=>{const d=fixtureMode.data,pit=d.pit,c=pit.columns.reduce((o,k,i)=>(o[k]=i,o),{}),q=pit.samples.find(p=>p[c.s]>=pit.limit.from+40),car=interlagos.car,h=Math.atan2(q[c.ty],q[c.tx]),off=(q[c.lane_lo]+q[c.fast_hi])/2;
     car.x=q[c.x]+q[c.lx]*off;car.y=q[c.y]+q[c.ly]*off;car.heading=h;car.vx=Math.cos(h)*30;car.vy=Math.sin(h)*30;car.yaw=0;car.surface=car.sample(car.x,car.y);car.index=car.surface.i;car.settle?.();return true;}""")
    page.keyboard.down('KeyW')
    page.wait_for_timeout(3800)
    held = page.evaluate("({kmh:Math.hypot(interlagos.car.vx,interlagos.car.vy)*3.6,limiter:interlagos.car.limiter,hud:document.querySelector('#surface')?.textContent})")
    page.keyboard.up('KeyW')
    report['limiter'] = held
    check('limiter_holds_sixty', held['limiter'] and 55 < held['kmh'] < 61.5 and 'LIMITADOR 60 km/h' in (held['hud'] or ''), held)
    context.close()
    browser.close()
print(json.dumps(report, indent=1, ensure_ascii=False), flush=True)
assert not report['errors'], report['errors']
print('rivals refuel at their own garages with their crews, doors only in long races; the pit limiter holds 60 km/h: verified')
