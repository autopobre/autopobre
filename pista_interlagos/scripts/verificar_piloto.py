from browser_config import browser_executable, browser_args, wait_js, open_menu, race_options, enter_track
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{},'poses':[]}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 def pose():return page.evaluate('interlagos.driverInfo()')
 def check_arms(name):
  info=pose();report['poses'].append(info);check(name,all(a['reachable'] and abs(a['upper']-.275)<1e-5 and abs(a['lower']-.265)<1e-5 and abs(a['gripRadius']-.173)<1e-8 for a in info['arms']))
 try:
  # The free race starts behind the car; switch to the interior on track.
  open_menu(page);enter_track(page);page.click('#cockpitButton')
  page.keyboard.down('KeyS');frame();check_arms('hands_on_wheel_neutral')
  page.screenshot(path=str(ROOT/'renders/piloto_interna.png'))
  # (S held selects reverse at a standstill: the right hand goes to the lever, which leans the shoulders by design, and
  # then the car backs up and turns. Let go, put back at rest, and read the lean with the hand back on the rim.)
  page.keyboard.up('KeyS');page.evaluate('interlagos.reposition(0)')
  page.keyboard.down('KeyA');wait_js(page,'interlagos.car.steer>.48')
  wait_js(page,"(c=>c.hand.to==='wheel'&&c.hand.t===1)(interlagos.driverInfo().controls)");page.wait_for_timeout(800);frame()
  check('no_body_lean_while_parked',abs(pose()['lean'])<.002 and page.evaluate('Math.hypot(interlagos.car.vx,interlagos.car.vy)')<.3);check_arms('full_left_reachable');page.keyboard.up('KeyA')
  page.keyboard.down('KeyS')
  page.keyboard.down('KeyD');wait_js(page,'interlagos.car.steer<-.48');frame();check_arms('full_right_reachable');page.keyboard.up('KeyD');page.keyboard.up('KeyS')
  page.evaluate('interlagos.reposition(600)');page.keyboard.down('KeyW');wait_js(page,'interlagos.telemetry().speed>35')
  page.keyboard.down('KeyA');wait_js(page,'interlagos.driverInfo().lean<-.03');frame();check_arms('left_curve_grip_and_ik');page.screenshot(path=str(ROOT/'renders/piloto_curva_esquerda.png'));page.keyboard.up('KeyA')
  page.keyboard.down('KeyD');wait_js(page,'interlagos.driverInfo().lean>.03');frame();check_arms('right_curve_grip_and_ik');page.screenshot(path=str(ROOT/'renders/piloto_curva_direita.png'));page.keyboard.up('KeyD');page.keyboard.up('KeyW')
  # The right hand takes each automatic change on the H lever, the left foot works the clutch.
  controls='interlagos.driverInfo().controls'
  page.evaluate('interlagos.reposition(600)');page.keyboard.down('KeyW')
  wait_js(page,f"{controls}.hand.to==='knob'&&{controls}.hand.t===1");frame();check_arms('right_hand_on_shifter');page.screenshot(path=str(ROOT/'renders/piloto_mao_cambio.png'))
  wait_js(page,f'{controls}.visualGear===2');check('lever_follows_second_gear',page.evaluate('interlagos.car.gear')==2)
  lever=page.evaluate('interlagos.cockpitInfo().controls.lever');check('lever_in_second_slot',abs(lever[0]+.15)<1e-6 and abs(lever[1]-.1)<1e-6)
  wait_js(page,f"{controls}.hand.to==='wheel'&&{controls}.hand.t===1");frame();check_arms('hand_back_on_wheel_after_shift')
  check('throttle_pedal_down',page.evaluate('interlagos.cockpitInfo().controls.pedals.throttle')>.8)
  page.keyboard.up('KeyW');page.keyboard.down('KeyS');wait_js(page,f'{controls}.footOnBrake===1&&{controls}.brake>.8')
  pedals=page.evaluate('interlagos.cockpitInfo().controls.pedals');check('right_foot_on_brake',pedals['brake']>.8 and pedals['throttle']<.05);page.keyboard.up('KeyS')
  # No handbrake lever in this car (the battery key sits there): with the handbrake pulled (Space, released by a
  # second press) the hand stays on the rim.
  page.keyboard.press('Space');page.wait_for_timeout(500);frame();check('no_handbrake_lever_to_reach',pose()['arms'][1]['target'] in ('wheel','knob') and 'handbrake' not in pose()['controls']);page.screenshot(path=str(ROOT/'renders/piloto_freio_de_mao.png'))
  page.keyboard.press('Space');wait_js(page,f"{controls}.hand.to==='wheel'&&{controls}.hand.t===1");check_arms('hand_on_wheel_after_space')
  race_options(page,camera='chase');page.evaluate('interlagos.reposition(600)');race_options(page,camera='orbit');enter_track(page);page.keyboard.down('KeyS')
  page.mouse.move(600,450);page.mouse.down();page.mouse.move(1050,450,steps=8);page.mouse.up();page.mouse.wheel(0,-700);frame();check('driver_visible_externally',pose()['visible']);page.screenshot(path=str(ROOT/'renders/piloto_externa_omp.png'));page.keyboard.up('KeyS')
  race_options(page,livery='seiva_danilo');enter_track(page);page.keyboard.down('KeyS');frame();check_arms('second_livery_same_driver');page.screenshot(path=str(ROOT/'renders/piloto_externa_seiva.png'));page.keyboard.up('KeyS')
  page.evaluate('interlagos.reset()');frame();check('reset_clears_lean',abs(pose()['lean'])<.001)
  check('no_browser_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_piloto.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
