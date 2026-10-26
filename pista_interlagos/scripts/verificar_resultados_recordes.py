from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,browser_args,wait_js,choose_race
import json
ROOT=Path(__file__).resolve().parents[1]
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 for mobile,immersive in [(True,True),(False,False)]:
  context=browser.new_context(viewport={'width':844 if mobile else 1280,'height':390 if mobile else 820},is_mobile=mobile,has_touch=mobile)
  page=context.new_page();page.set_default_timeout(120000);page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
  page.goto('http://127.0.0.1:8799/pista_interlagos/teste/',wait_until='networkidle');wait_js(page,"window.interlagos&&!document.querySelector('#start').disabled")
  page.fill('#pilotName','Piloto teste <99>');choose_race(page,story=immersive);wait_js(page,'window.interlagos?.ready')
  if not immersive:wait_js(page,'interlagos.car.clock>0')
  page.evaluate("""async immersive=>{const {ImmersiveMode}=await import('./immersive-mode.js'),old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixture=this;return old.call(this)};interlagos.immersiveInfo();const m=fixture,c=interlagos.car;window.realFinishStep=m.step.bind(m);m.step=()=>true;c.reset();c.vx=Math.cos(c.heading)*40;c.vy=Math.sin(c.heading)*40;c.clock=immersive?157.8:466.8;c.best=150.25;c.laps=immersive?m.storyLaps:m.freeTotalLaps;m.rivals.forEach((r,i)=>{r.car.best=i===3?null:148+i*.7;r.finished=i<4;r.finishTime=i<4?c.clock-4+i:null});if(immersive){m.state.phase='race';m.state.fuel=8;m.state.health=1;m.raceProgress=0;m.previousS=c.surface.s;m.sync();realFinishStep({throttle:0,brake:0,left:0,right:0},1/120);}else m.stepFree(1/120,{});window.advanceFinish=n=>{for(let i=0;i<n;i++)realFinishStep({},1/120)};}""",immersive)
  assert page.evaluate('fixture.finishing&&!fixture.freeResultReady&&!interlagos.state.paused')
  page.evaluate('advanceFinish(300)');wait_js(page,"Number(document.querySelector('#finishFade').style.opacity)>.49")
  page.screenshot(path=str(ROOT/f'renders/resultados_fade_{mobile}.png'))
  page.evaluate('advanceFinish(300)');wait_js(page,"!document.querySelector('#raceResults').hidden")
  wait_js(page,"getComputedStyle(document.querySelector('#finishFade')).opacity==='0'")
  assert page.locator('#raceResults tbody tr').count()==15
  assert '02:30.250' in page.inner_text('#raceResults tr.results-player')
  assert 'Kleber Eletric' in page.inner_text('#raceResults tbody')
  assert page.evaluate("()=>{const r=document.querySelector('.results-actions').getBoundingClientRect();return r.bottom<=innerHeight&&r.top>=0&&document.documentElement.scrollWidth<=innerWidth}")
  page.screenshot(path=str(ROOT/f'renders/resultados_tabela_{mobile}.png'))
  page.click('#resultsRecords');page.click('[data-records-source="human"]');wait_js(page,"document.querySelector('#lapRecords').open")

  assert page.locator('#lapRecords tbody tr').count()==1 and 'Piloto teste <99>' in page.inner_text('#lapRecords tbody')
  page.screenshot(path=str(ROOT/f'renders/resultados_recordes_{mobile}.png'))
  page.click('#recordsClose')
  if immersive:
   page.click('#resultsContinue');wait_js(page,"document.querySelector('#raceResults').hidden&&fixture.state.phase==='podium'")
   saved=page.evaluate('fixture.state.profile.fund');page.click('[data-action="mainMenu"]');assert page.evaluate('fixture.state.profile.fund')==saved
  else:page.click('#resultsMainMenu')
  wait_js(page,"document.querySelector('#raceResults').hidden&&interlagos.state.paused&&!fixture.active&&!fixture.freeFinished")
  # Leaving the result lands on the track screen of the same mode; the other mode is chosen on the opening.
  assert page.is_visible('#tracks') and 'Corrida única' in page.inner_text('#singleRace') and page.get_attribute('#tracks','data-mode')==('historia' if immersive else 'corrida')
  choose_race(page,story=not immersive)
  wait_js(page,'fixture.active' if not immersive else '!fixture.active')
  assert not page.evaluate('interlagos.state.paused')
  page.reload(wait_until='domcontentloaded');page.wait_for_selector('#lapRecords',state='attached');page.click('#recordsButton');page.locator('[data-records-car="opala"]').click()
  assert page.locator('#lapRecords tbody tr').count()==1 and '02:30.250' in page.inner_text('#lapRecords tbody')
  print(json.dumps({'mobile':mobile,'immersive':immersive,'tableAndRecords':True}),flush=True);context.close()
 browser.close()
assert not errors,errors
