from browser_config import browser_executable, browser_args, wait_js, open_menu, race_options, enter_track, wait_race_start
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{}}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def info():return page.evaluate('interlagos.skidInfo()')
 # Rivals share the rubber buffer and keep racing: count the player's wheels for player checks.
 own='interlagos.skidInfo().perWheel.reduce((n,w)=>n+w.segments,0)'
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 # The loudest the tyres got over some frames: the recorded loops, the wet scrape and the slip the sound heard.
 def tyre_sound(frames=90):return page.evaluate('''n=>new Promise(done=>{const m={canta:0,arrasta:0,scrub:0,skid:0};
  const tick=()=>{const a=interlagos.audioInfo(),l=a.tyres?.loops??{};m.canta=Math.max(m.canta,l.canta??0);m.arrasta=Math.max(m.arrasta,l.arrasta??0);
   m.scrub=Math.max(m.scrub,a.scrub);m.skid=Math.max(m.skid,a.skid);if(--n>0)requestAnimationFrame(tick);else done(m);};tick();})''',frames)
 try:
  open_menu(page);enter_track(page)
  check('starts_without_marks',info()['segments']==0)
  page.keyboard.down('KeyS');frame();check('parked_brake_no_marks',info()['segments']==0);wait_race_start(page);page.keyboard.up('KeyS')
  # Known initial speed on the Reta Oposta, then actual keyboard controls drive the effect.
  page.evaluate('()=>{interlagos.reposition(600);const c=interlagos.car;c.vx=Math.cos(c.heading)*18;c.vy=Math.sin(c.heading)*18;}')
  page.keyboard.press('Space');page.keyboard.down('KeyA')
  wait_js(page,'interlagos.audioInfo().tyres?.ready')
  dry=report['dry_tyres']=tyre_sound();check('dry_slide_screeches',dry['skid']>.3 and dry['canta']+dry['arrasta']>0 and dry['scrub']==0)
  wait_js(page,own+'>100')
  # One press pulls the handbrake and it stays pulled (HUD says so); the next press lets it go.
  check('space_latches_handbrake',page.evaluate("interlagos.mobileInfo().pressed.includes('Space')") and 'FREIO DE MÃO PUXADO' in page.text_content('#surface'))
  page.keyboard.up('KeyA');page.keyboard.press('Space');page.keyboard.down('KeyS')
  check('second_space_releases_handbrake',not page.evaluate("interlagos.mobileInfo().pressed.includes('Space')"))
  wait_js(page,'interlagos.telemetry().speed<1');frame()
  report['after_drift']=info();check('drift_and_braking_visible_geometry',page.evaluate(own)>100)
  check('all_wheels_can_leave_marks',all(w['segments']>0 for w in info()['perWheel']))
  check('one_extra_draw_call',info()['drawCalls']==1)
  page.screenshot(path=str(ROOT/'renders/derrapadas_perseguicao.png'))
  race_options(page,camera='orbit');enter_track(page);page.keyboard.down('KeyS')
  page.mouse.move(700,450);page.mouse.down();page.mouse.move(1050,680,steps=6);page.mouse.up();page.mouse.wheel(0,180);frame()
  page.screenshot(path=str(ROOT/'renders/derrapadas_orbita.png'))
  total=page.evaluate(own);page.evaluate('interlagos.reset()');frame()
  check('reset_retains_marks_without_connection',page.evaluate(own)==total and info()['activeWheels']==0)
  page.keyboard.up('KeyS')
  # In the rain (the pilots, 30/10): a wet track takes no rubber, from the player or the rivals, and a tyre neither
  # sings nor screeches; a slide only scrapes.
  page.evaluate("window.interlagosClima.set({rain:'chuva'})");wait_js(page,'!window.interlagosClima.info().compiling',timeout=90000)
  laid,mine=info()['totalSegments'],page.evaluate(own)
  page.evaluate('()=>{interlagos.reposition(600);const c=interlagos.car;c.vx=Math.cos(c.heading)*18;c.vy=Math.sin(c.heading)*18;}')
  page.keyboard.press('Space');page.keyboard.down('KeyA')
  wet=report['wet_tyres']=tyre_sound(240)
  page.keyboard.up('KeyA');page.keyboard.press('Space');page.keyboard.down('KeyS');wait_js(page,'interlagos.telemetry().speed<1');frame();page.keyboard.up('KeyS')
  report['after_wet_drift']=info()
  check('wet_slide_leaves_no_marks',info()['totalSegments']==laid and page.evaluate(own)==mine)
  check('wet_slide_only_scrapes',wet['skid']>.3 and wet['canta']==0 and wet['arrasta']==0 and wet['scrub']>0)
  check('no_browser_or_shader_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_derrapadas.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
