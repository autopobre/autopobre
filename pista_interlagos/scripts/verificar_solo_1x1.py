"""Modo Corrida's track screen: the lap count beside the circuits (the same preference as the race
settings), the solo practice and the 1x1 against a chosen rival. Usage: verificar_solo_1x1.py [porta]
Screens in renders/: pistas_solo_1x1*.png, corrida_1x1_largada.png, treino_solo.png."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,browser_args,wait_js,wait_race_start

PORT=sys.argv[1] if len(sys.argv)>1 else '8799'
URL=f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
ROOT=Path(__file__).resolve().parents[1]
RENDERS=ROOT/'renders';RENDERS.mkdir(exist_ok=True)
HOOK="""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixture=this;return old.call(this)};interlagos.immersiveInfo();return true;}"""
# The visible rival cars (the visuals' objects) and the field that races.
FIELD="""()=>{interlagos.immersiveInfo();const f=fixture;return {lineup:f.freeLineup,rivals:f.rivals.map(r=>r.entry.number),size:f.fieldSize,laps:f.freeTotalLaps===Infinity?'inf':f.freeTotalLaps,
 shown:f.visual.rivals.filter(o=>o.visible).map(o=>o.userData.entry.number),position:document.querySelector('#racePosition').textContent,positionHidden:document.querySelector('#racePosition').parentElement.hidden,
 lap:document.querySelector('#lap').textContent,session:document.querySelector('.session').textContent,fuel:f.freeFuel}}"""
errors=[];result={}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 context=browser.new_context(viewport={'width':1440,'height':900})
 context.add_init_script("""if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false}));}""")
 page=context.new_page();page.set_default_timeout(120000)
 page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
 page.goto(URL+'?intro=0',wait_until='domcontentloaded');wait_js(page,"window.interlagos&&!document.querySelector('#start').disabled")
 page.fill('#pilotName','Piloto 1x1');page.click('#start');page.click('#carsNext');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")
 assert page.is_visible('#soloRace') and page.is_visible('#duelRace') and page.is_visible('#duelRival') and page.is_visible('#tracksLaps')
 assert page.input_value('#tracksLaps')=='3' and page.input_value('#duelRival')=='73' and '#73' in page.inner_text('#duelRaceDetail')
 assert page.locator('#duelRival option').count()==14
 # Laps on the track screen: the same preference as the race settings, both ways.
 page.select_option('#tracksLaps','5')
 assert page.input_value('#raceLaps')=='5' and '5 voltas' in page.inner_text('#singleRaceDetail') and '5 voltas' in page.inner_text('#duelRaceDetail')
 assert page.evaluate("JSON.parse(localStorage.getItem('opala99-preferences-v1')).laps")==5
 # (The settings button is on the opening.)
 page.click('#tracksBack');page.click('#carsBack');page.click('#settingsButton');page.click('#tab-race')
 page.select_option('#raceLaps','2');page.click('#settingsClose');page.click('#start');page.click('#carsNext')
 assert page.input_value('#tracksLaps')=='2' and '2 voltas' in page.inner_text('#singleRaceDetail')
 page.select_option('#tracksLaps','3')
 # The rival: kept in the preferences, shown with his colours.
 page.select_option('#duelRival','19');assert '#19' in page.inner_text('#duelRaceDetail')
 assert page.evaluate("JSON.parse(localStorage.getItem('opala99-preferences-v1')).duelRival")=='19'
 assert page.evaluate("getComputedStyle(document.querySelector('#duelSwatch')).getPropertyValue('--body').trim()")!=''
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(RENDERS/'pistas_solo_1x1.png'))
 # Modo História's track screen has neither.
 page.click('#tracksBack');page.click('#carsBack');page.click('#storyStart');assert page.get_attribute('#tracks','data-mode')=='historia'
 assert not page.is_visible('#soloRace') and not page.is_visible('#duelRace') and page.is_visible('#tracksLaps')
 page.click('#tracksBack');page.click('#start');page.click('#carsNext')

 # 1x1 against #19 at Interlagos: two cars, the rival on pole, the player beside him.
 page.click('#duelRace');wait_js(page,"interlagos.ready&&interlagos.circuit==='interlagos'&&!interlagos.state.paused")
 page.evaluate(HOOK);page.wait_for_timeout(300)
 duel=page.evaluate(FIELD);print(json.dumps({'duel':duel}),flush=True)
 assert duel['lineup']==['19'] and duel['rivals']==['19'] and duel['size']==2 and duel['laps']==3 and duel['shown']==['19'],duel
 assert duel['position']=='2º / 2' and not duel['positionHidden'] and '1x1' in duel['session'],duel
 wait_race_start(page);page.wait_for_timeout(1200)
 page.screenshot(path=str(RENDERS/'corrida_1x1_largada.png'))
 # Straight to the flag: the player's third lap, the rival still racing.
 page.evaluate("interlagos.immersiveInfo();fixture.car.laps=3;true");wait_js(page,"!document.querySelector('#raceResult').hidden",timeout=20000)
 flag=page.inner_text('#raceResult');assert 'de 2' in flag,flag
 assert page.locator('#finishingOrder li').count()==2
 result['duel']={'field':duel,'flag':flag}
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();true');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")

 # Solo practice: nobody else, no position, no lap total, no flag, a full tank.
 page.click('#soloRace');wait_js(page,"interlagos.ready&&!interlagos.state.paused")
 page.wait_for_timeout(300);solo=page.evaluate(FIELD);print(json.dumps({'solo':solo}),flush=True)
 assert solo['lineup']==[] and solo['rivals']==[] and solo['size']==1 and solo['laps']=='inf' and solo['shown']==[],solo
 assert solo['positionHidden'] and solo['lap']=='1' and 'TREINO SOLO' in solo['session'],solo
 wait_race_start(page);page.keyboard.down('KeyW');page.wait_for_timeout(4000);page.keyboard.up('KeyW')
 moved=page.evaluate("interlagos.immersiveInfo();Math.hypot(fixture.car.vx,fixture.car.vy)")
 assert moved>5,moved
 page.evaluate("interlagos.immersiveInfo();fixture.car.laps=25;true");page.wait_for_timeout(600)
 assert page.inner_text('#lap')=='26' and page.evaluate("interlagos.immersiveInfo();!fixture.freeFinished&&!fixture.finishing&&fixture.freeFuel===10")  # practice burns none: Interlagos' 8-lap litres (fuel.js, Central #11)
 page.screenshot(path=str(RENDERS/'treino_solo.png'))
 page.keyboard.press('Escape');wait_js(page,"!document.querySelector('#menu').classList.contains('hidden')")
 eyebrow=page.inner_text('#menu .eyebrow');assert 'TREINO SOLO' in eyebrow,eyebrow
 assert page.inner_text('#restartRace')=='Recomeçar treino'
 result['solo']={'field':solo,'speed':moved,'pause':eyebrow}
 page.click('#leaveRace');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")

 # Corrida única after them: the whole grid again, the player at the back.
 page.click('#singleRace');wait_js(page,"interlagos.ready&&!interlagos.state.paused");page.wait_for_timeout(300)
 full=page.evaluate(FIELD);assert full['lineup'] is None and full['size']==15 and len(full['shown'])==14 and full['position']=='15º / 15' and 'PISTA LIVRE' in full['session'],full
 result['single']={'size':full['size'],'position':full['position']}
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();true')

 # Phones in landscape: the whole choice still on one screen width.
 phone=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
 phone.add_init_script("""localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,duelRival:'2'}));""")
 small=phone.new_page();small.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
 small.goto(URL,wait_until='domcontentloaded');wait_js(small,"window.interlagos&&!document.querySelector('#start').disabled")
 small.fill('#pilotName','Piloto celular');small.tap('#start');small.tap('#carsNext');wait_js(small,"!document.querySelector('#tracks').classList.contains('hidden')")
 fit=small.evaluate("""()=>{const t=document.querySelector('#tracks'),r=id=>document.querySelector(id).getBoundingClientRect();return {width:document.documentElement.scrollWidth<=innerWidth,scroll:t.scrollHeight-t.clientHeight,duel:r('#duelRace').bottom,pick:r('#duelRival').bottom,height:innerHeight}}""")
 assert fit['width'],fit;assert small.input_value('#duelRival')=='2'
 small.screenshot(path=str(RENDERS/'pistas_solo_1x1_celular.png'));result['phone']=fit
 assert not errors,errors
 print(json.dumps({'passed':True,**result},ensure_ascii=False),flush=True)
 browser.close()
