"""The Fusca's doors, front lid and engine lid in the game (car-openings.js; modelo_3d/scripts/fusca_aberturas.py).

A race in a Fusca at Interlagos: F stops it and the pilot gets out by the driver's door, which stays open; E at the
nose lifts the front lid (the trunk with the tank), at the tail the engine lid, and the walking panel names each; back
in (F) the door shuts behind him, the lids he opened stay open, and in the cockpit the open engine lid fills the
rear-view mirror as the Opala's trunk lid does. The door numbers ride the doors. The rivals' Fuscas have their hinged
parts merged into their bodies (fusca.js rivalTemplate): nothing hangs from their hinges.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_aberturas_fusca.py
Screenshots: pista_interlagos/renders/aberturas_fusca_*.png
"""
import json
import math
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, wait_race_start

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', 'http://127.0.0.1:8799/pista_interlagos/teste/')
OUT = ROOT / 'renders'
HOOD, LID = 'Capo_DOBRADICA', 'Tampa_motor_DOBRADICA'
DOOR, OTHER = 'Porta_Motorista_DOBRADICA', 'Porta_Passageiro_DOBRADICA'
WALK = 'interlagos.walkInfo()'
errors, checks = [], {}
# The pilot on foot moved to a place in the car's frame (ahead: + toward the nose; side: - toward the driver's side).
STAND = """([ahead,side])=>{const w=interlagos.walker(),c=interlagos.car,h=c.heading,p=w.hero.position;
 const dx=ahead*Math.cos(h)+side*Math.sin(h),dz=-ahead*Math.sin(h)+side*Math.cos(h);p.x=c.x+dx;p.z=dz-c.y;
 w.motion.x=p.x;w.motion.y=-p.z;w.motion.vx=w.motion.vy=0;w.hero.rotation.y=h+(ahead>0?Math.PI/2:-Math.PI/2);return w.spot();}"""


def check(name, value):
    checks[name] = bool(value)
    print(name, bool(value), flush=True)
    assert value, name


def shot(page, name):
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / f'aberturas_fusca_{name}.png'))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 760})
    context.add_init_script("if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,camera:'cockpit',laps:3,carModel:'fusca'}));}")
    page = context.new_page()
    page.set_default_timeout(150000)
    page.on('pageerror', lambda e: (errors.append(str(e)), print(str(e), flush=True)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    opening = lambda name: page.evaluate(f"interlagos.openingsInfo()['{name}']")
    try:
        open_menu(page, URL)
        enter_track(page, 'Piloto aberturas')
        wait_race_start(page)
        check('racing a Fusca', page.evaluate('interlagosCarros.info().raceModel') == 'fusca')
        info = page.evaluate('interlagos.openingsInfo()')
        check('the Fusca\'s hinges, not the Opala\'s', sorted(info) == sorted([HOOD, LID, DOOR, OTHER]))
        check('all shut at the start', all(v['open'] == 0 for v in info.values()))
        # The rivals' Fuscas: nothing under their hinges (merged into their bodies), their door numbers on.
        rivals = page.evaluate("""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;
         ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();
         return fixtureMode.visual.rivals.filter(o=>o.userData.fusca).map(o=>{const hinged=[],fixed=new Set();let numbers=0,meshes=0;o.userData.fusca.traverse(q=>{
          if(q.name.startsWith('Numero_'))numbers++;if(!q.isMesh||/^(Numero_|Raio_)/.test(q.name))return;meshes++;let h=false;for(let a=q.parent;a;a=a.parent)if(Array.isArray(a.userData?.eixo_gltf))h=true;
          if(h)hinged.push(q.material.name);else fixed.add(q.material.name);});return {hinged,numbers,meshes,shared:hinged.filter(m=>fixed.has(m))};});}""")
        print('rivals', rivals[:2], flush=True)
        # What stays on their hinges wears a material nothing else on the car does (the plate, the mirrors' glass), once.
        check('rivals: hinged parts merged into their bodies', rivals and all(not r['shared'] and len(set(r['hinged'])) == len(r['hinged']) for r in rivals))
        check('rivals keep their three numbers', all(r['numbers'] == 3 for r in rivals))

        # F: the car stops, he gets out by the driver's door, which stays open.
        page.keyboard.press('KeyF')
        wait_js(page, f'{WALK}.active', timeout=20000)
        wait_js(page, f"interlagos.openingsInfo()['{DOOR}'].open===1", timeout=10000)
        check('the driver\'s door held open while he is out', 'manual' in opening(DOOR)['reasons'])
        numbers = page.evaluate(f"""(()=>{{const o=[];interlagos.walker().openings.parts.get('{DOOR}').obj.traverse(q=>{{if(q.name.startsWith('Numero_'))o.push(q.name);}});return o;}})()""")
        check('the door\'s number rides the door', len(numbers) == 1)
        page.evaluate(STAND, [.4, -2.2])
        shot(page, '1_porta')

        # E at the nose: the front lid; at the tail: the engine lid. The walking panel names them.
        check('at the nose', page.evaluate(STAND, [2.75, 0]) == 'capo')
        page.wait_for_timeout(300)
        label = page.evaluate("interlagos.walker().actionLabel()")
        check(f'the nose says the hood ({label})', label == 'abrir o capô')
        page.keyboard.press('KeyE')
        wait_js(page, f"interlagos.openingsInfo()['{HOOD}'].open===1", timeout=10000)
        check('E lifts the front lid', 'manual' in opening(HOOD)['reasons'])
        page.evaluate(STAND, [3.6, -1.4])
        shot(page, '2_capo')
        check('at the tail', page.evaluate(STAND, [-2.45, 0]) == 'porta_malas')
        page.wait_for_timeout(300)
        label = page.evaluate("interlagos.walker().actionLabel()")
        check(f'the tail says the engine lid ({label})', label == 'abrir a tampa do motor')
        page.keyboard.press('KeyE')
        wait_js(page, f"interlagos.openingsInfo()['{LID}'].open===1", timeout=10000)
        check('E lifts the engine lid', 'manual' in opening(LID)['reasons'])
        page.evaluate(STAND, [-3.4, 1.3])
        shot(page, '3_motor')

        # Back in: the door shuts behind him, the lids stay open, the open engine lid fills the rear-view mirror.
        page.evaluate(STAND, [.2, -1.5])
        page.keyboard.press('KeyF')
        wait_js(page, f'!{WALK}.active', timeout=20000)
        wait_js(page, f"interlagos.openingsInfo()['{DOOR}'].open===0", timeout=10000)
        check('the lids he opened stay open', opening(HOOD)['open'] == 1 and opening(LID)['open'] == 1)
        wait_js(page, "interlagos.state.mode==='cockpit'", timeout=10000)
        wait_js(page, 'interlagos.cockpitInfo().lidMirror', timeout=10000)
        check('the rear-view mirror shows the open engine lid', page.evaluate('interlagos.cockpitInfo().lidMirror'))
        shot(page, '4_cabine')
        # With the front lid down again the road shows ahead; the engine lid still up in the mirror.
        page.evaluate(f"interlagos.walker().openings.hold('{HOOD}','manual',false)")
        wait_js(page, f"interlagos.openingsInfo()['{HOOD}'].open===0", timeout=10000)
        shot(page, '5_retrovisor')
        page.evaluate(f"interlagos.holdOpening('{LID}',false)")
        page.evaluate(f"(()=>{{const o=interlagos.walker().openings;o.release('manual');return true;}})()")
        wait_js(page, f"interlagos.openingsInfo()['{LID}'].open===0&&interlagos.openingsInfo()['{HOOD}'].open===0", timeout=10000)
        page.wait_for_timeout(500)
        check('shut again, one picture in the mirror', not page.evaluate('interlagos.cockpitInfo().lidMirror'))
        check('no page errors', not [e for e in errors if 'favicon' not in e and 'tracks.json' not in e])
    finally:
        print(json.dumps({'checks': checks, 'errors': errors[:10]}, ensure_ascii=False), flush=True)
        browser.close()
