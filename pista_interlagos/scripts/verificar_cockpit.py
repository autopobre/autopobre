from browser_config import browser_executable, browser_args, wait_js, open_menu, race_options, enter_track, wait_race_start
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,math
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{},'views':[]}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 try:
  # The free race starts behind the car; switch to the interior on track.
  open_menu(page);enter_track(page);page.click('#cockpitButton');page.keyboard.down('KeyS');wait_race_start(page);frame()
  page.screenshot(path=str(ROOT/'renders/cockpit_largada.png'))
  info=page.evaluate('interlagos.cockpitInfo()');report['views'].append(info)
  # The controls sit in the V06 body (the car stays visible round them), lowered onto its floor.
  check('internal_selected',info['visible'] and info['externalVisible'] and not info['view']['classic'] and info['view']['drop']<0)
  # The gear stays on screen inside the car, the speed is the dash's (Central #23).
  check('gear_shown_inside',page.is_visible('#gear') and not page.is_visible('#speed'))
  EYE=info['view']['eye']
  check('eye_inside_cabin',math.dist(info['eyeLocal'],EYE)<1e-6 and abs(EYE[0]+.15)<1e-6 and abs(EYE[1]-1.02)<1e-6)  # V06: 24 cm forward, 12 cm over the dash
  # Scanned interior maps (carbon, leather, suede, aluminium, tread plate, rubber) and the cabin reflections.
  loaded=wait_js(page,"performance.getEntriesByType('resource').filter(e=>e.name.includes('/texturas/interior/')).length>=13&&performance.getEntriesByType('resource').filter(e=>e.name.includes('/texturas/interior/')).length")
  check('interior_textures_loaded',loaded>=13)
  check('cabin_reflections_and_seat',info['cabinReflections'] and info['seat']>0)
  # Holding B turns the head straight back over the car; letting go returns to the road.
  facing='()=>{const d=interlagos.cameraSnapshot().direction,h=interlagos.car.heading;return d[0]*Math.cos(h)-d[2]*Math.sin(h);}'
  page.keyboard.down('KeyB');wait_js(page,'interlagos.viewControls().lookBack.amount===1',timeout=5000);frame()
  back=page.evaluate('interlagos.viewControls()')['lookBack'];report['views'].append({'lookBack':back,'eyeLocal':page.evaluate('interlagos.cockpitInfo().eyeLocal')})
  check('b_looks_back',back['held'] and page.evaluate(facing)<-.9)
  page.screenshot(path=str(ROOT/'renders/cockpit_olhando_tras.png'))
  page.keyboard.up('KeyB');wait_js(page,'interlagos.viewControls().lookBack.amount===0',timeout=5000);frame()
  check('b_release_returns_forward',page.evaluate(facing)>.9 and math.dist(page.evaluate('interlagos.cockpitInfo().eyeLocal'),EYE)<1e-6)
  for key,sign in [('KeyA',1),('KeyD',-1)]:
   page.keyboard.down(key);wait_js(page,'(s)=>interlagos.car.steer*s>.3',arg=sign);frame()
   check(key+'_wheel_direction',page.evaluate('(s)=>interlagos.cockpitInfo().steering*s>.85',sign));page.keyboard.up(key)
  page.keyboard.up('KeyS');page.evaluate('interlagos.reposition(600)');page.keyboard.down('KeyW');wait_js(page,'interlagos.telemetry().speed>30');page.keyboard.up('KeyW');frame()
  info=page.evaluate('interlagos.cockpitInfo()');report['views'].append(info)
  check('speed_display_active',info['speed']>29)
  check('camera_rigid_while_driving',math.dist(info['eyeLocal'],EYE)<1e-6)
  page.screenshot(path=str(ROOT/'renders/cockpit_movimento.png'))
  race_options(page,livery='seiva_danilo');page.evaluate('interlagos.reposition(800)');enter_track(page);page.keyboard.down('KeyS');frame()
  info=page.evaluate('interlagos.cockpitInfo()');check('second_livery_cockpit',info['visible'] and info['externalVisible'] and not info['view']['classic']);page.screenshot(path=str(ROOT/'renders/cockpit_seiva.png'));page.keyboard.up('KeyS')
  page.click('#cockpitButton');frame();info=page.evaluate('interlagos.cockpitInfo()');check('external_car_restored',info['visible'] and info['externalVisible'] and not info['view']['cabin'] and abs(info['fov']-page.evaluate('interlagos.cameraSnapshot().baseFov'))<.05)
  # Looking back from the other cameras (Central #23): a follow camera goes to the front of the car, facing it, and the
  # hood camera onto the boot lid; let go, both face the road again. The aerial one has no look back.
  def camera(m):page.evaluate("m=>{const s=document.querySelector('#camera');s.value=m;s.dispatchEvent(new Event('change'))}",m);frame()
  def looks_back(name):
   page.keyboard.down('KeyB');page.wait_for_timeout(300);frame();back=page.evaluate(facing);eye=page.evaluate('interlagos.cockpitInfo().eyeLocal')
   page.keyboard.up('KeyB');page.wait_for_timeout(300);frame();check(name,back<-.9 and page.evaluate(facing)>.9);return eye
  looks_back('b_chase_faces_the_car')
  camera('hood');check('b_hood_from_the_boot',looks_back('b_hood_looks_back')[0]<-1)
  camera('aerial');page.keyboard.down('KeyB');page.wait_for_timeout(300);frame()
  check('b_not_from_the_air',not page.evaluate('interlagos.viewControls().lookBack.allowed') and page.evaluate(facing)>.3);page.keyboard.up('KeyB')
  camera('chase')
  modes=[]
  for _ in range(8):page.keyboard.press('KeyC');modes.append(page.evaluate('interlagos.state.mode'))
  check('eight_camera_cycle',modes==['close','far','hood','cockpit','tv','aerial','orbit','chase'])
  page.click('#cockpitButton');page.set_viewport_size({'width':1280,'height':720});frame();page.screenshot(path=str(ROOT/'renders/cockpit_16x9.png'))
  check('no_webgl_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_cockpit.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
