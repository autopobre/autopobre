"""Opala V06 in the game: doors, hood, trunk lid and filler caps on their hinges (car-openings.js).

At Curvelo's Box 99 the crew opens what it works on (engine: hood, fuel cell: trunk lid,
refuelling: filler caps), the driver's door swings as the pilot gets out and back in, and
everything shuts when the stop ends. On foot, one action key works GTA style by where the pilot
stands: E at the nose lifts the hood, at the tail the trunk lid (the context button says which).
Rivals leave the engine and the fuel cell out. In story mode at Interlagos the same action key,
by the Opala parked in Box 99, lifts the hood (engine) or the lid (fuel cell), or gets in at the door.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_aberturas.py
Screenshots: pista_interlagos/renders/aberturas_*.png
"""
import re
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, choose_race

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', 'http://127.0.0.1:8799/pista_interlagos/teste/')
HOOD, TRUNK, DOOR = 'Capo_DOBRADICA', 'Tampa_porta_malas_DOBRADICA', 'Porta_Motorista_DOBRADICA'
CAPS = ['Tampa_bocal_1_DOBRADICA', 'Tampa_bocal_2_DOBRADICA']
errors, checks = [], {}


def check(name, value):
    checks[name] = bool(value)
    print(name, bool(value), flush=True)
    assert value, name


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 820})
    context.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'curvelo',immersive:false}));")
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    opening = lambda name: page.evaluate(f"interlagos.openingsInfo()['{name}']")
    try:
        page.goto(URL + '?circuito=curvelo', wait_until='domcontentloaded')
        wait_js(page, "!document.querySelector('#start').disabled")
        page.fill('#pilotName', 'Piloto aberturas')
        choose_race(page)
        wait_js(page, 'window.interlagos?.ready')
        wait_js(page, 'interlagos.car.clock>0')
        info = page.evaluate('interlagos.openingsInfo()')
        check('v06_hinges_loaded', all(n in info for n in [HOOD, TRUNK, DOOR, 'Porta_Passageiro_DOBRADICA', *CAPS]))
        check('all_shut_at_start', all(v['open'] == 0 for v in info.values()))
        rival = page.evaluate('interlagos.rivalParts()')
        check('rivals_without_engine_and_cell', not rival['motor'] and not rival['tanque'] and rival['meshes'] > 10)
        # The other cars carry no sponsor, name, logo or window sticker of the 99: only their own number (4 decals).
        livery = [m for m in rival['materials'] if re.match(r'(Adesivo|Decal_|Pilotos_99_parabrisa|Invent_parabrisa|Jesus_|Logo_frontal|Stickers_vigia_|Branco$)', m)]
        check('rivals_carry_only_their_number', not livery and rival['numbers'] == 4)
        # Park in Box 99 (as verificar_pitstop.py does) with the engine and the fuel cell worn.
        page.evaluate("""async()=>{const {PitStop}=await import('./pitstop.js');const old=PitStop.prototype.info;PitStop.prototype.info=function(){window.pit=this;return old.call(this)};interlagos.pitInfo();
         pit.setDamage(true);pit.condition.damage('motor',.5);pit.condition.damage('tanque',.5);pit.mode.freeFuel=5;
         const c=interlagos.car,i=c.a.findIndex(q=>q[0]>=20),q=c.a[i];c.reset(i);c.x=q[1]+q[9]*21.65;c.y=q[2]+q[10]*21.65;c.surface=c.sample(c.x,c.y);}""")
        wait_js(page, 'pit.opened')
        wait_js(page, "!document.querySelector('#pitPanel').hidden")
        check('pit_panel_has_no_separate_opening_buttons', page.locator('#pitHood').count() == 0)
        # Orders: engine (hood), fuel cell (trunk lid) and refuelling (filler caps) open by themselves.
        page.click('[data-repair="motor"][data-kind="proper"]')
        page.click('[data-repair="tanque"][data-kind="proper"]')
        page.click('#pitFill2')
        # Refuelling shares the tank's place, so it waits for the fuel-cell repair.
        wait_js(page, "pit.service.jobs.map(j=>j.id).sort().join()==='motor,tanque'&&pit.service.queue[0]?.id==='fuel'")
        wait_js(page, f"interlagos.openingsInfo()['{HOOD}'].open===1&&interlagos.openingsInfo()['{TRUNK}'].open===1")
        check('crew_opens_hood_and_trunk', 'equipe' in opening(HOOD)['reasons'] and 'equipe' in opening(TRUNK)['reasons'] and not opening(CAPS[0])['reasons'])
        page.evaluate('pit.view={angle:2.6,elev:.5,distance:5.5}')
        page.wait_for_timeout(900)
        page.screenshot(path=str(ROOT / 'renders/aberturas_equipe_porta_malas.png'))
        wait_js(page, "pit.service.jobs.some(j=>j.id==='fuel')", timeout=60000)
        wait_js(page, f"interlagos.openingsInfo()['{CAPS[0]}'].open===1")
        check('refuelling_opens_caps', all('equipe' in opening(c)['reasons'] for c in CAPS) and not opening(TRUNK)['reasons'])
        page.evaluate('pit.view={angle:2.2,elev:.3,distance:3.2}')
        page.wait_for_timeout(600)
        page.screenshot(path=str(ROOT / 'renders/aberturas_bocal_abastecendo.png'))
        # Each job shuts its part when it ends.
        wait_js(page, 'pit.service.jobs.length===0', timeout=60000)
        wait_js(page, "Object.values(interlagos.openingsInfo()).every(p=>p.open===0)", timeout=10000)
        check('parts_shut_after_jobs', True)
        # The driver's door swings open as he gets out, then shuts behind him.
        page.click('#pitCoffee')
        wait_js(page, 'pit.coffee!==null')
        wait_js(page, f"interlagos.openingsInfo()['{DOOR}'].open>.95")
        wait_js(page, f"interlagos.openingsInfo()['{DOOR}'].open===0", timeout=10000)
        check('door_opens_as_pilot_gets_out_and_shuts', True)
        # GTA style, one action key where the pilot stands: at the nose E lifts the hood, at the tail the lid.
        page.evaluate("""window.standAt=ahead=>{const c=pit.car,h=c.heading;pit.hero.position.x=c.x+Math.cos(h)*ahead;pit.hero.position.z=-c.y-Math.sin(h)*ahead;
         pit.coffee.yaw=pit.hero.rotation.y=h+(ahead>0?Math.PI:0);pit.walkFollow=null;}""")
        page.evaluate('standAt(2.8)')
        wait_js(page, "pit.interaction()==='capo'")
        wait_js(page, "document.querySelector('#pitInteract').textContent.includes('Abrir o capô')")
        check('action_button_offers_hood_at_the_nose', page.is_visible('#pitInteract'))
        page.keyboard.press('e')
        wait_js(page, f"interlagos.openingsInfo()['{HOOD}'].open===1")
        page.wait_for_timeout(700)
        page.screenshot(path=str(ROOT / 'renders/aberturas_capo_aberto_box.png'))
        check('e_opens_hood_on_foot', 'manual' in opening(HOOD)['reasons'] and 'Fechar o capô' in page.inner_text('#pitInteract'))
        page.keyboard.press('e')
        wait_js(page, f"interlagos.openingsInfo()['{HOOD}'].open===0")
        check('e_shuts_hood_again', True)
        page.evaluate('standAt(-2.8)')
        wait_js(page, "pit.interaction()==='porta_malas'")
        page.keyboard.press('e')
        wait_js(page, f"interlagos.openingsInfo()['{TRUNK}'].open===1")
        page.wait_for_timeout(700)
        page.screenshot(path=str(ROOT / 'renders/aberturas_porta_malas_box.png'))
        check('e_opens_trunk_at_the_tail', True)
        # By the driver's door (lid still open) F gets in: the door swings and the stop shuts everything.
        page.evaluate('pit.hero.position.copy(pit.heroStart())')
        wait_js(page, "pit.interaction()==='car'")
        page.keyboard.press('f')
        wait_js(page, '!pit.opened')
        wait_js(page, f"interlagos.openingsInfo()['{DOOR}'].open>.5")
        check('door_opens_as_pilot_gets_back_in', True)
        wait_js(page, "Object.values(interlagos.openingsInfo()).every(p=>p.open===0&&!p.reasons.length)", timeout=10000)
        check('all_shut_after_stop', True)
        # A livery swap loads the other GLB with its own hinges.
        livery = page.evaluate('interlagos.state.livery')
        page.keyboard.press('v')
        wait_js(page, f"interlagos.state.livery!=='{livery}'")
        check('hinges_after_livery_swap', len(page.evaluate('interlagos.openingsInfo()')) == 6)
        check('no_browser_errors', not errors)
        context.close()
        # Story mode at Interlagos: on foot in the paddock the same action key, by the Opala parked in
        # Box 99, lifts the hood (engine) or the trunk lid (fuel cell), or gets in at the driver's door.
        context = browser.new_context(viewport={'width': 1280, 'height': 820})
        context.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:true}));")
        page = context.new_page()
        page.set_default_timeout(180000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto(URL, wait_until='domcontentloaded')
        wait_js(page, "!document.querySelector('#start').disabled")
        page.fill('#pilotName', 'Piloto paddock')
        page.evaluate("""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const info=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return info.call(this);};}""")
        # Modo História opens the track screen; Corrida única starts the story there.
        choose_race(page, story=True)
        wait_js(page, 'window.interlagos?.ready')
        # The career's cards (Kléber's welcome) come before the paddock, as browser_config.enter_track skips them.
        page.evaluate('window.interlagosHistoria.skipCards()')
        page.evaluate('interlagos.immersiveInfo()')
        wait_js(page, "fixtureMode.state.phase==='crowd'&&!!fixtureMode.visual.ownOpenings")
        # Walked round in the garage, the parked Opala shows the player's whole cockpit through its windows.
        check('paddock_opala_has_full_interior', page.evaluate("(()=>{const o=fixtureMode.visual.own,has=n=>!!o.getObjectByName(n);return has('Painel_Auto_Meter')&&has('Banco_Sgarbi')&&has('Volante_animado')&&has('Painel_botoes_Luizao')&&!has('Interior_leve');})()"))
        own = lambda name: page.evaluate(f"fixtureMode.visual.ownOpenings.info()['{name}']")
        # Stand the pilot 3 m ahead of the parked Opala (or behind it) facing it, or by its driver's door.
        page.evaluate("""window.standBy=side=>{const v=fixtureMode.visual,o=v.own,ry=o.rotation.y,f=[Math.cos(ry),-Math.sin(ry)];
         v.hero.position.x=o.position.x+f[0]*3*side;v.hero.position.z=o.position.z+f[1]*3*side;v.foot.yaw=v.hero.rotation.y=ry+(side>0?Math.PI:0);v.followPosition=null;};
         window.standDoor=()=>{const v=fixtureMode.visual,o=v.own,ry=o.rotation.y;v.hero.position.x=o.position.x-Math.sin(ry)*1.6;v.hero.position.z=o.position.z-Math.cos(ry)*1.6;};""")
        page.evaluate('standBy(1)')
        wait_js(page, "fixtureMode.visual.carAction()==='capo'")
        wait_js(page, "document.querySelector('#immAlert').textContent.includes('E: abrir o capô')")
        check('paddock_action_button_offers_hood', 'Abrir o capô' in page.inner_text('[data-action="car"]'))
        page.keyboard.press('e')
        wait_js(page, f"fixtureMode.visual.ownOpenings.info()['{HOOD}'].open===1")
        page.wait_for_timeout(900)
        page.screenshot(path=str(ROOT / 'renders/aberturas_paddock_motor.png'))
        check('paddock_e_opens_hood', 'Fechar o capô' in page.inner_text('[data-action="car"]') and not page.evaluate(f"interlagos.openingsInfo()['{HOOD}'].reasons.length"))
        page.evaluate('standBy(-1)')
        wait_js(page, "fixtureMode.visual.carAction()==='porta_malas'")
        page.keyboard.press('e')
        wait_js(page, f"fixtureMode.visual.ownOpenings.info()['{TRUNK}'].open===1")
        page.wait_for_timeout(900)
        page.screenshot(path=str(ROOT / 'renders/aberturas_paddock_porta_malas.png'))
        check('paddock_e_opens_trunk_at_the_tail', own(HOOD)['open'] == 1)
        # The walk holds the mouse (pointer lock): Tab frees it to click the panel's action button.
        if page.evaluate('!!document.pointerLockElement'):
            page.keyboard.press('Tab')
            wait_js(page, '!document.pointerLockElement')
        page.click('[data-action="car"]')
        wait_js(page, f"fixtureMode.visual.ownOpenings.info()['{TRUNK}'].open===0")
        page.evaluate('standBy(1)')
        wait_js(page, """document.querySelector('[data-action="car"]')?.textContent.includes('Fechar o capô')""")
        page.click('[data-action="car"]')
        wait_js(page, f"fixtureMode.visual.ownOpenings.info()['{HOOD}'].open===0")
        check('paddock_action_button_shuts_them', True)
        # By the driver's door the action key gets in, as F does; F gets out again.
        page.evaluate('standDoor()')
        wait_js(page, "fixtureMode.visual.carAction()==='porta'")
        page.keyboard.press('e')
        wait_js(page, 'fixtureMode.inCar')
        check('paddock_e_by_the_door_gets_in', True)
        page.keyboard.press('f')
        wait_js(page, '!fixtureMode.inCar')
        # Away from the car the action key has nothing of the car to do.
        page.evaluate("fixtureMode.visual.hero.position.x+=12")
        page.keyboard.press('e')
        page.wait_for_timeout(400)
        check('paddock_action_needs_the_car', own(HOOD)['open'] == 0 and own(TRUNK)['open'] == 0 and not page.evaluate('fixtureMode.inCar'))
        check('no_browser_errors_paddock', not errors)
    finally:
        print(json.dumps({'checks': checks, 'errors': errors[:10]}, indent=1, ensure_ascii=False), flush=True)
        browser.close()
