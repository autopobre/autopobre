"""Landscape touch controls and post-podium flow in a touch-enabled browser."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track
ROOT=Path(__file__).resolve().parents[1]
report={'checks':{},'errors':[]}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 context=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=2)
 page=context.new_page();page.set_default_timeout(90000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
 def shot(name):page.screenshot(path=str(ROOT/'renders'/f'mobile_{name}.png'))
 def center(selector):
  b=page.locator(selector).bounding_box();return {'x':b['x']+b['width']/2,'y':b['y']+b['height']/2}
 try:
  open_menu(page);shot('abertura')
  page.tap('#settingsButton');check('settings_fit_landscape',page.evaluate("()=>{const r=document.querySelector('#settings').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth}"));shot('config')
  page.tap('#settingsBack');enter_track(page,tap=True);wait_js(page,"!document.querySelector('#touchControls').classList.contains('hidden')")
  check('touch_detected_and_resolution_capped',page.evaluate('interlagos.mobileInfo().enabled&&interlagos.mobileInfo().pixelRatio<=1'))
  # Players' request: no track name on top; map, speedometer and steering pad climb toward the left thumb.
  check('phone_hud_raised',page.evaluate("()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),map=r('#mapcard'),speed=r('#telemetry'),steer=r('#touchSteering');return getComputedStyle(document.querySelector('header')).display==='none'&&map.top<20&&speed.top>=map.bottom&&steer.top>=speed.bottom&&innerHeight-steer.bottom>innerHeight*.2}"))
  session=context.new_cdp_session(page);points=[dict(center('#touchPedals'),y=page.locator('#touchPedals').bounding_box()['y']+18,id=1),dict(center('#touchSteering'),x=page.locator('#touchSteering').bounding_box()['x']+23,id=2)]
  session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':points});wait_js(page,"interlagos.mobileInfo().throttle>.9&&interlagos.mobileInfo().steering<-.5")
  wait_js(page,'Math.hypot(interlagos.car.vx,interlagos.car.vy)>1');check('simultaneous_gas_and_steering',True);shot('corrida')
  session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});check('touch_release_clears_controls',page.evaluate('interlagos.mobileInfo().pressed.length===0&&interlagos.mobileInfo().throttle===0&&interlagos.mobileInfo().brake===0'))
  # No handbrake nor RÉ on the phone (players' round 10-19: the brake backs up; the arena keeps its handbrake).
  check('no_handbrake_or_reverse_button',page.evaluate("!document.querySelector('#touchReverse')&&!document.querySelector('#touchHandbrake').getClientRects().length"))
  page.tap('#touchCamera');check('camera_button_works',page.evaluate('interlagos.state.mode')!='chase')
  page.set_viewport_size({'width':390,'height':844});wait_js(page,'interlagos.state.paused');check('portrait_prompt_pauses_game',page.is_visible('#rotatePhone'));shot('girar')
  page.set_viewport_size({'width':667,'height':375});page.tap('#settingsButton');page.tap('#settingsBack');enter_track(page,tap=True,story=True)
  page.evaluate("async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();}")
  wait_js(page,"fixtureMode.visual.followPosition!=null");check('viewport_fills_after_rotation',page.evaluate("()=>{const r=document.querySelector('#touchControls').getBoundingClientRect();return Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2&&Math.abs(visualViewport.width-innerWidth)<2}"));shot('boxes')
  page.evaluate("()=>{fixtureMode.state.talk(0);fixtureMode.ui();}");wait_js(page,"document.querySelector('[data-action=\"joke:0\"]')");page.tap('[data-action="joke:0"]');check('touch_dialogue_donates_and_closes',page.evaluate('fixtureMode.state.fan===null&&fixtureMode.state.donors.includes(0)'))
  page.evaluate("()=>{fixtureMode.state.cash=300;fixtureMode.action('desk')}");page.tap('[data-action="buy"]');check('touch_fuel_purchase',page.evaluate("fixtureMode.state.phase==='starting'&&fixtureMode.state.fuel>0"));shot('partida')
  page.evaluate("()=>{const m=fixtureMode;m.state.cash=37.5;m.state.profile.fund=275;m.state.phase='race';m.state.finish(1);m.sync();}");wait_js(page,"document.querySelector('[data-action=\"afterPodium\"]')");check('podium_precedes_inspection',page.evaluate("fixtureMode.state.phase==='podium'&&!fixtureMode.state.inspected"));shot('podio')
  check('podium_even_ranks_left_and_first_highest',page.evaluate("()=>{const v=fixtureMode.visual,points=[1,2,3,4,5,6].map(n=>{const o=v.podium.getObjectByName('Podio_'+n);return {x:o.getWorldPosition(o.position.clone()).project(fixtureMode.camera).x,h:o.geometry.parameters.height}});return [1,3,5].every(i=>points[i].x<points[0].x)&&[2,4].every(i=>points[i].x>points[0].x)&&points.every(p=>p.h<=points[0].h)}"))
  page.tap('[data-action="afterPodium"]');check('no_disqualification_warning',not any(w in page.inner_text('#immersivePanel').lower() for w in ['desclassific','perder prêmio','perder o prêmio']))
  page.tap('[data-action="box"]');wait_js(page,"fixtureMode.state.phase==='disqualified'");check('disqualification_keeps_prior_money_and_leftover',page.evaluate('fixtureMode.state.profile.fund')==312.5);check('ending_image_loaded',page.evaluate("document.querySelector('#dqScreen img').naturalWidth>0"));shot('desclassificado')
  check('ending_covers_viewport',page.evaluate("()=>{const r=document.querySelector('#dqScreen').getBoundingClientRect();return r.width===innerWidth&&r.height===innerHeight}"))
  # After the photo, the race's report (story-career.js); its cards read, the next race is a new fundraising.
  wait_js(page,"fixtureMode.state.phase==='complete'&&fixtureMode.state.scene?.kind==='report'");check('ending_shows_race_report',page.evaluate("fixtureMode.state.scene.cards[0].outcome==='guincho'"))
  page.evaluate('window.interlagosHistoria.skipCards()');page.tap('[data-action="again"]');wait_js(page,"fixtureMode.state.phase==='crowd'");check('ending_returns_to_fundraising',True)
  page.evaluate("()=>{const m=fixtureMode;m.state.phase='race';m.state.finish(1);m.sync();}");page.tap('[data-action="afterPodium"]');page.tap('[data-action="inspect"]');page.evaluate('fixtureMode.state.inspectionStep(8)');wait_js(page,"fixtureMode.state.phase==='complete'");check('inspection_after_podium_completes_race',page.evaluate('fixtureMode.state.inspected'))
  check('no_browser_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_mobile.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
