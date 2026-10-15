from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,wait_js,choose_race
import json
ROOT=Path(__file__).resolve().parents[1]
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True)
 for mobile in [False,True]:
  print({'stage':'starting','mobile':mobile},flush=True)
  context=browser.new_context(viewport={'width':844 if mobile else 1280,'height':390 if mobile else 820},is_mobile=mobile,has_touch=mobile)
  context.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'curvelo',immersive:false}));")
  page=context.new_page();page.set_default_timeout(120000);page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
  page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  page.goto('http://127.0.0.1:8799/pista_interlagos/teste/?circuito=curvelo',wait_until='domcontentloaded');wait_js(page,"!document.querySelector('#start').disabled")
  print({'stage':'menu'},flush=True);page.fill('#pilotName','Piloto pitstop');choose_race(page);wait_js(page,'window.interlagos?.ready');wait_js(page,'interlagos.car.clock>0');print({'stage':'loaded'},flush=True)
  page.evaluate("""async()=>{const {PitStop}=await import('./pitstop.js');const old=PitStop.prototype.info;PitStop.prototype.info=function(){window.pit=this;return old.call(this)};interlagos.pitInfo();pit.setDamage(true);window.park=()=>{const c=interlagos.car;const i=c.a.findIndex(p=>p[0]>=20),p=c.a[i];c.reset(i);c.x=p[1]+p[9]*21.65;c.y=p[2]+p[10]*21.65;c.surface=c.sample(c.x,c.y);};park();pit.condition.damage('motor',.6);pit.condition.damage('freios',.5);pit.condition.damage('suspensao',.6);window.advance=n=>{for(let i=0;i<n;i++)pit.beforeStep({throttle:0,brake:0,left:0,right:0},1/120);};}""")
  wait_js(page,'pit.opened');wait_js(page,"!document.querySelector('#pitPanel').hidden")
  assert page.locator('.pit-parts article').count()==6
  assert page.evaluate('interlagos.car.surface.pit&&interlagos.car.surface.onRoad')
  page.wait_for_timeout(2500);page.screenshot(path=str(ROOT/f'renders/pitstop_servicos_{mobile}.png'))
  # The crew's hand-placed can, lollipop pole and disc are drawn where they are placed (frozen with the still scenery,
  # main.js freezeStatic, they stood at the world's origin).
  assert page.evaluate("(()=>{const w=pit.layout?.crew;return !!w&&[w.can,w.pole,w.disc].every(o=>{const m=o.matrixWorld.elements;return Math.hypot(m[12]-o.position.x,m[13]-o.position.y,m[14]-o.position.z)<1e-3;});})()"),'crew props drawn where placed'
  wallet=page.evaluate('pit.wallet');page.click('[data-repair="motor"][data-kind="proper"]')
  page.click('[data-repair="freios"][data-kind="proper"]');page.click('[data-repair="suspensao"][data-kind="proper"]')
  # Engine and both front wheels are different places of the car: the crew works them together.
  assert page.evaluate("pit.service.jobs.map(j=>j.id).join()")=='motor,freios,suspensao' and page.evaluate('pit.service.queue.length')==0;assert page.evaluate('pit.wallet')<wallet
  assert page.locator('#pitActive progress').count()==3
  page.screenshot(path=str(ROOT/f'renders/pitstop_fila_{mobile}.png'))
  page.click('#pitSettings');elapsed=page.evaluate('pit.service.job.elapsed');page.wait_for_timeout(200);assert page.evaluate('pit.service.job.elapsed')==elapsed
  page.click('#settingsResume');wallet=page.evaluate('pit.wallet');page.click('#pitCoffee');wait_js(page,'pit.coffee!==null')
  assert page.evaluate('pit.wallet')==wallet,'walking to cafe is free'
  wait_js(page,'!pit.driver.root.visible&&pit.hero.visible')
  # On foot the repairs panel stays open on desktop (Tab frees the mouse); on phones it is a button away.
  wait_js(page,"document.querySelector('#pitPanel').hidden===%s"%('true' if mobile else 'false'))
  assert not page.evaluate("pit.buySnack('cafe')"),'cannot buy remotely from the car'
  before=page.evaluate('pit.hero.position.toArray()')
  if mobile:
   assert page.is_visible('#touchSteering') and page.is_visible('#touchPedals')
   assert page.inner_text('#touchGasLabel')=='ANDAR'
   box=page.locator('#touchPedals').bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+15);page.mouse.down();page.wait_for_timeout(700);page.mouse.up()
  else:
   page.keyboard.down('w');page.wait_for_timeout(700);page.keyboard.up('w')
  assert page.evaluate('pit.hero.position.toArray()')!=before,'player controls the walking hero'
  # Waypoints through the garage to the café (the layout's route), and back to the car.
  page.evaluate("""window.walkTo=target=>{for(let i=0;i<1800;i++){const dx=target.x-pit.hero.position.x,dz=target.z-pit.hero.position.z;if(Math.hypot(dx,dz)<.5)return;pit.coffee.yaw=Math.atan2(-dz,dx);pit.beforeStep({throttle:1,brake:0,left:0,right:0},1/120);}throw Error('Walking route blocked');};
 window.walkCafe=()=>{for(const p of pit.layout?.route??[pit.cafeSeat])walkTo(p);};window.walkCar=()=>{for(const p of [...(pit.layout?.route??[])].reverse().slice(1))walkTo(p);walkTo(pit.heroStart());};walkCafe()""")
  wait_js(page,"pit.interaction()==='cafe'");page.wait_for_timeout(800);page.screenshot(path=str(ROOT/f'renders/pitstop_passeio_{mobile}.png'))
  # On desktop the walk captures the mouse: E talks to the Tia and F gets back in the car.
  interact=(lambda:page.click('#pitInteract')) if mobile else (lambda:page.keyboard.press('e'))
  enter_car=(lambda:page.click('#pitInteract')) if mobile else (lambda:page.keyboard.press('f'))
  interact();wait_js(page,'pit.coffee.menu');wait_js(page,"!document.querySelector('#pitPanel').hidden")
  assert page.locator('[data-snack]').count()==3
  wallet=page.evaluate('pit.wallet')
  # One snack per hand: the third waits until a hand is free.
  for snack in ['cafe','pao']:page.click(f'[data-snack="{snack}"]')
  assert page.evaluate("pit.coffee.held.map(h=>h.id).join()")=='cafe,pao' and page.is_disabled('[data-snack="doce"]')
  assert abs(page.evaluate('pit.wallet')-(wallet-10))<.001
  page.screenshot(path=str(ROOT/f'renders/pitstop_cafe_{mobile}.png'))
  assert page.evaluate("()=>{const b=document.querySelector('#pitCloseCafe').getBoundingClientRect();return b.right<=innerWidth&&b.left>=0&&b.bottom<=innerHeight}")
  # E (or the Usar button) drinks and eats: 3 sips of coffee, 2 bites of pão de queijo.
  page.click('#pitCloseCafe');wait_js(page,'!pit.coffee.menu')
  for _ in range(5):
   page.click('#pitUse') if mobile else page.keyboard.press('e')
   wait_js(page,'pit.coffee.using');page.evaluate('advance(160)');assert not page.evaluate('pit.coffee.using')
  assert page.evaluate('pit.coffee.held.length')==0
  interact();wait_js(page,'pit.coffee.menu');page.click('[data-snack="doce"]');assert abs(page.evaluate('pit.wallet')-(wallet-15))<.001
  page.evaluate('advance(5000)');assert page.evaluate("['motor','freios','suspensao'].every(id=>pit.condition.quality[id]===1)")
  assert page.evaluate('!pit.service.job&&pit.service.queue.length===0')
  page.click('#pitCloseCafe');page.evaluate('walkCar()');wait_js(page,"pit.interaction()==='car'");enter_car();wait_js(page,'!pit.opened&&!pit.coffee&&pit.driver.root.visible')
  assert page.evaluate('!pit.hero.visible')
  if mobile:assert page.is_visible('#touchSteering')
  # A zero budget still allows walking, but none of the paid snacks.
  page.evaluate('pit.departing=false;advance(100);pit.bank=0');wait_js(page,'pit.opened');page.click('#pitCoffee');page.evaluate('walkCafe()');interact();wait_js(page,'pit.coffee.menu')
  assert page.locator('[data-snack]:disabled').count()==3
  assert not page.evaluate("pit.buySnack('cafe')")
  page.click('#pitCloseCafe');page.evaluate('walkCar()');enter_car();wait_js(page,'!pit.opened')
  page.evaluate('pit.bank=450;pit.departing=false;advance(100);pit.mode.freeFuel=3');wait_js(page,'pit.opened');page.click('#pitFill2');assert page.evaluate('pit.service.job.id')=='fuel'
  page.evaluate('advance(120)');assert 3<page.evaluate('pit.fuel')<5
  page.click('#pitLeave');wait_js(page,'!pit.opened');assert page.evaluate('!pit.service.job&&pit.driver.root.visible')
  # Re-enter and verify the inexpensive partial repair, with a visible result.
  page.evaluate("pit.condition.damage('freios',.5);pit.departing=false;advance(100)");wait_js(page,'pit.opened')
  page.click('[data-repair="freios"][data-kind="patch"]');page.evaluate('advance(1200)');assert .5<page.evaluate('pit.condition.quality.freios')<1
  # Immersive cash/profile accounting is independent of the free-race team budget.
  page.evaluate("pit.mode.onMainMenu()")
  choose_race(page,story=True)
  page.evaluate("pit.mode.state.phase='race';pit.mode.state.cash=120;pit.mode.state.profile.fund=200;pit.mode.state.fuel=4;pit.mode.raceProgress=0;pit.mode.previousS=20;pit.mode.sync();park();pit.departing=false;pit.condition.damage('tanque',.8);advance(100)")
  wait_js(page,'pit.opened');page.click('[data-repair="tanque"][data-kind="proper"]');assert page.evaluate('pit.mode.state.cash')<120;assert page.evaluate('pit.mode.state.profile.fund')==200
  page.evaluate('advance(2000)');assert page.evaluate('pit.condition.quality.tanque')==1
  assert page.evaluate('pit.mode.state.phase')=='race';assert page.evaluate('pit.mode.state.raceTime')>0
  print(json.dumps({'mobile':mobile,'repair':True,'freeWalkAndPaidMenu':True,'queuedRepairs':True,'partialRepair':True,'refuel':True,'pause':True,'immersiveBalance':True}),flush=True)
  context.close()
 browser.close()
assert not errors,errors
