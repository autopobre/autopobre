"""Pilot identity, automatic records and visible race countdown in the real game."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,browser_args,wait_js,choose_race
import json
ROOT=Path(__file__).resolve().parents[1]
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 for mobile in [False,True]:
  context=browser.new_context(viewport={'width':844 if mobile else 1280,'height':390 if mobile else 820},is_mobile=mobile,has_touch=mobile)
  context.add_init_script("if(!localStorage.getItem('opala99-preferences-v1'))localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'curvelo',immersive:false}));")
  page=context.new_page();page.set_default_timeout(120000);page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
  page.goto('http://127.0.0.1:8799/pista_interlagos/teste/',wait_until='domcontentloaded');wait_js(page,"window.interlagos&&!document.querySelector('#start').disabled")
  assert page.inner_text('#pilotLabel')=='Piloto';assert page.is_hidden('#pilotSelect')
  page.click('#start');assert not page.evaluate('interlagos.ready');assert page.is_visible('#pilotMessage') and not page.is_visible('#tracks')
  page.evaluate("window.countdownSeen=[];new MutationObserver(()=>{const t=document.querySelector('#countdownNumber').textContent;if(!countdownSeen.includes(t))countdownSeen.push(t)}).observe(document.querySelector('#countdownNumber'),{childList:true,subtree:true,characterData:true})")
  page.fill('#pilotName','Ana <99>');page.screenshot(path=str(ROOT/f'renders/piloto_inicio_{mobile}.png'));choose_race(page);wait_js(page,'interlagos.ready')
  wait_js(page,"!document.querySelector('#raceCountdown').hidden")
  page.evaluate("""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js'),old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixture=this;return old.call(this)};interlagos.immersiveInfo();}""")
  assert page.evaluate('interlagos.car.clock===0&&fixture.rivals.every(r=>r.car.clock===0)')
  page.screenshot(path=str(ROOT/f'renders/largada_{mobile}.png'))
  page.click('#touchMenu' if mobile else '#menuButton');remaining=page.evaluate('fixture.freeCountdown');page.wait_for_timeout(300);assert page.evaluate('fixture.freeCountdown')==remaining
  page.click('#settingsResume');wait_js(page,"countdownSeen.includes('VAI!')");assert page.evaluate("['3','2','1','VAI!'].every(n=>countdownSeen.includes(n))")
  wait_js(page,'fixture.freeCountdown===0&&interlagos.car.clock>0')
  page.evaluate('interlagos.car.best=42;interlagos.car.laps=1;interlagos.car.lastLapValid=true')
  wait_js(page,"JSON.parse(localStorage.getItem('autopobre-records-v1')||'[]').some(r=>r.name==='Ana <99>'&&r.bestLap===42&&r.bestRace===null)")
  # Leaving an incomplete race keeps the valid lap; a second pilot gets a separate record.
  # Leaving lands on the track screen; the pilot is changed back on the opening.
  page.evaluate('fixture.onMainMenu()');page.click('#tracksBack');page.click('#carsBack');page.fill('#pilotName','Bruno');choose_race(page);wait_js(page,'!interlagos.state.paused')
  page.evaluate('fixture.freeCountdown=0;interlagos.car.best=40;interlagos.car.laps=3;interlagos.car.clock=129;fixture.stepFree(1/120,{})')
  wait_js(page,"JSON.parse(localStorage.getItem('autopobre-records-v1')).some(r=>r.name==='Bruno'&&r.bestLap===40&&r.bestRace===null)")
  page.evaluate('fixture.onMainMenu()');page.click('#tracksBack');page.click('#carsBack');assert page.is_visible('#pilotSelect');assert page.locator('#pilotSelect option').count()==3;assert page.input_value('#pilotSelect')=='Bruno'
  page.click('#recordsButton');assert page.locator('#lapRecords select').count()==0;assert page.locator('#lapRecords tbody tr').count()==16;assert page.get_attribute('.records-source-options button:first-child','data-records-source')=='all';page.click('[data-records-source="human"]');assert page.locator('#lapRecords tbody tr').count()==2
  page.click('[data-records-source="ai"]');assert page.locator('#lapRecords tbody tr').count()==14;assert 'Kleber Eletric' in page.inner_text('#lapRecords tbody')
  page.click('[data-records-source="all"]');assert page.locator('#lapRecords tbody tr').count()==16
  page.click('[data-records-source="human"]');assert page.locator('#lapRecords tbody tr').count()==2
  page.click('#recordsCircuitPick');page.click('[data-records-circuit="interlagos"]');assert page.locator('#lapRecords tbody tr').count()==0
  page.click('#recordsCircuitPick');page.click('[data-records-circuit="curvelo"]');page.click('[data-records-car="fusca"]');assert page.locator('#lapRecords tbody tr').count()==0
  page.click('[data-records-car="opala"]');assert 'Ana <99>' in page.inner_text('#lapRecords tbody');page.screenshot(path=str(ROOT/f'renders/recordes_automaticos_{mobile}.png'));page.click('#recordsClose')
  page.reload(wait_until='domcontentloaded');wait_js(page,'window.interlagos');assert not page.evaluate('interlagos.ready');assert page.input_value('#pilotSelect')=='Bruno';assert page.is_hidden('#pilotName')
  page.select_option('#pilotSelect','Ana <99>');choose_race(page,story=True);wait_js(page,'interlagos.ready')
  page.evaluate("""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js'),old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixture=this;return old.call(this)};interlagos.immersiveInfo();fixture.state.phase='grid';fixture.state.countdown=3;fixture.sync();}""")
  wait_js(page,"!document.querySelector('#raceCountdown').hidden&&document.querySelector('#countdownNumber').textContent==='3'")
  assert page.evaluate('interlagos.car.clock===0')
  page.evaluate('for(let i=0;i<365;i++)fixture.step({throttle:0,brake:0,left:0,right:0},1/120)')
  wait_js(page,"document.querySelector('#countdownNumber').textContent==='VAI!'")
  page.evaluate('interlagos.car.best=39;interlagos.car.laps=fixture.storyLaps;interlagos.car.clock=40;fixture.beginFinish(2)')
  wait_js(page,"JSON.parse(localStorage.getItem('autopobre-records-v1')).some(r=>r.name==='Ana <99>'&&r.mode==='immersive'&&r.bestLap===39&&r.bestRace===null)")
  print(json.dumps({'mobile':mobile,'pilotRequired':True,'savedNamesDropdown':True,'autoLapAndRace':True,'countdownBothModes':True,'pauseFreezesCountdown':True}),flush=True)
  context.close()
 browser.close()
assert not errors,errors
