"""The Fusca tab of Modo Corrida's car screen (car-select.js, fusca.js): the Copa Fusca's 15 cars (race-roster.js
FUSCA_CHOICES: the user's numbers and colours, Fischer first, the 99 Cristiano Canto's grey one with black fenders),
the studio turning the chosen one in its colours, each tab keeping its own car, and on track a field of Fuscas:
the player's (the Opala's body, cockpit and brake lamps hidden, the driver in the Fusca's seat, its own cabin with
live mirrors and dials, the fenders in the second colour) and every rival's, each driver on the Fusca's seat,
Benício's #4 with its lightning bolts, and Cristiano's Fusca 99 in the seat of the car taken; all of them collide
with the Fusca's own body (physics.js FUSCA_BODY). Back on the menu the Opala returns; the Opala tab and Modo
História stay Opalas with the Old Stock field.
Usage: verificar_fusca.py [porta]
Screens in renders/: fusca_99.png, fusca_33.png, fusca_4.png, fusca_20.png, fusca_opala_aba.png, fusca_grid.png,
fusca_corrida_*.png, fusca_99_corrida.png, fusca_celular.png."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,browser_args,wait_js,wait_race_start,choose_race

PORT=sys.argv[1] if len(sys.argv)>1 else '8799'
URL=f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
ROOT=Path(__file__).resolve().parents[1]
RENDERS=ROOT/'renders';RENDERS.mkdir(exist_ok=True)
HOOK="""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixture=this;return old.call(this)};interlagos.immersiveInfo();return true;}"""
FIELD="""()=>{interlagos.immersiveInfo();const f=fixture,v=f.visual;return {rivals:f.rivals.map(r=>r.entry.number),seats:v.rivals.map(o=>o.userData.entry.number),
 models:v.rivals.map(o=>o.userData.fusca?'fusca':'opala'),inside:v.rivals.map(o=>{let n=0;o.userData.fusca?.traverse(q=>{if(q.userData.interno)n++;});return n;}),bodies:f.rivals.map(r=>r.car.body.name),fieldBody:f.field.body.name,playerBody:interlagos.car.body.name,seat:v.rivals.map(o=>o.userData.driver?.root.position.toArray().map(c=>+c.toFixed(4))??null),
 opala99Shown:!!v.opala99?.visible,fuscasShown:v.root.children.filter(o=>o.visible&&o.userData.fusca).length,me:f.playerEntry?.number??'99',
 names:f.rivals.map(r=>r.entry.shortName),bolts:v.rivals.map(o=>o.userData.fusca?.children.filter(c=>c.name.startsWith('Raio_')).length??0)}}"""
# The Copa Fusca's cars in the top 15's order (race-roster.js FUSCA_CHOICES) and the Opala's Old Stock rivals.
FUSCAS=['20','86','77','29','18','3','33','5','99','39','11','4','9','79','49']
OLD_STOCK=['73','00','7','64','2','19','51','93','312','70','9','74','88','42']
CARS="()=>interlagosCarros.info()"
PREFS="()=>JSON.parse(localStorage.getItem('opala99-preferences-v1'))"
errors=[];result={}
def shot(page,name):page.wait_for_timeout(500);page.screenshot(path=str(RENDERS/name))
def camera(page,value):page.evaluate(f"(()=>{{const s=document.querySelector('#camera');s.value='{value}';s.dispatchEvent(new Event('change'));return true;}})()")
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 context=browser.new_context(viewport={'width':1440,'height':900})
 context.add_init_script("""if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,car:'99'}));}""")
 page=context.new_page();page.set_default_timeout(180000)
 page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
 page.on('console',lambda m:print('console',m.type,m.text,flush=True) if m.type=='error' else None)
 fuscas=[];page.on('request',lambda r:fuscas.append(r.url) if 'fusca_v2.glb' in r.url else None)
 page.goto(URL+'?intro=0',wait_until='domcontentloaded');wait_js(page,"window.interlagos&&!document.querySelector('#start').disabled")

 # The Opala tab first, the default: 15 cards, no Fusca downloaded.
 page.fill('#pilotName','Piloto fusca');page.click('#start');assert page.is_visible('#cars')
 assert page.get_attribute('#carModels [data-model="opala"]','aria-selected')=='true' and page.locator('#carCards [data-car]').count()==15
 wait_js(page,"interlagosCarros.info().live&&interlagosCarros.info().built==='99'",timeout=180000);assert not fuscas,fuscas

 # The Fusca tab: the Copa Fusca's 15 cars, Fischer first, the 99 chosen (Cristiano's), then Moraes's 33.
 page.click('#carModels [data-model="fusca"]')
 assert page.get_attribute('#carModels [data-model="fusca"]','aria-selected')=='true'
 cards=page.eval_on_selector_all('#carCards [data-car]','b=>b.map(e=>e.dataset.car)');assert cards==FUSCAS,cards
 assert page.inner_text('#carCards [data-car="20"] span')=='Arthur Fischer' and page.inner_text('#carCards [data-car="49"] span')=='Robertão'
 assert page.get_attribute('#carCards [data-car="99"]','aria-checked')=='true' and 'Fusca' in page.inner_text('#carsTitle') and page.inner_text('#carsMode')=='MODO CORRIDA · COPA FUSCA'
 # Benício's card carries his lightning bolt.
 assert page.locator('#carCards [data-car="4"] svg polygon').count()==page.locator('#carCards [data-car="20"] svg polygon').count()+1
 wait_js(page,"(i=>i.live&&i.builtModel==='fusca'&&i.built==='99')(interlagosCarros.info())",timeout=180000)
 assert 'Fusca 99 · Cristiano' in page.inner_text('#carName') and 'Cristiano Canto' in page.inner_text('#carDetail'),page.inner_text('#carDetail');shot(page,'fusca_99.png')
 page.click('#carCards [data-car="33"]');wait_js(page,"(i=>i.builtModel==='fusca'&&i.built==='33')(interlagosCarros.info())")
 prefs=page.evaluate(PREFS);assert prefs['carModel']=='fusca' and prefs['fuscaCar']=='33' and prefs['car']=='99',prefs
 assert 'Fusca 33 · Fernando Moraes' in page.inner_text('#carName') and 'Light' in page.inner_text('#carDetail') and 'Cristiano vai de Fusca 99' in page.inner_text('#carDetail'),page.inner_text('#carDetail')
 studio=page.evaluate(CARS);assert studio['meshes']>20,studio;shot(page,'fusca_33.png')
 page.click('#carCards [data-car="4"]');wait_js(page,"interlagosCarros.info().built==='4'");shot(page,'fusca_4.png')
 page.click('#carCards [data-car="20"]');wait_js(page,"interlagosCarros.info().built==='20'");shot(page,'fusca_20.png')
 # The tabs answer the arrows; the Opala tab keeps its own car (the 99) and its Old Stock field, then back to the Fusca.
 page.focus('#carModels [data-model="fusca"]');page.keyboard.press('ArrowLeft')
 wait_js(page,"(i=>i.model==='opala'&&i.builtModel==='opala'&&i.built==='99')(interlagosCarros.info())")
 cards=page.eval_on_selector_all('#carCards [data-car]','b=>b.map(e=>e.dataset.car)');assert cards==['99']+OLD_STOCK,cards
 shot(page,'fusca_opala_aba.png');assert page.evaluate(PREFS)['carModel']=='opala'
 page.click('#carModels [data-model="fusca"]');wait_js(page,"(i=>i.model==='fusca'&&i.value==='20')(interlagosCarros.info())")
 page.click('#carCards [data-car="33"]');wait_js(page,"(i=>i.builtModel==='fusca'&&i.built==='33')(interlagosCarros.info())")
 assert len(fuscas)==1,fuscas

 # The track screen names the Fusca; a single race in it.
 page.click('#carsNext');assert 'Fusca #33' in page.inner_text('#tracksPilot'),page.inner_text('#tracksPilot')
 assert page.inner_text('#tracksMode')=='MODO CORRIDA · COPA FUSCA',page.inner_text('#tracksMode')
 # The 1x1's rival among the Copa Fusca's drivers: Fischer unless picked, the 99 Cristiano in Moraes's seat.
 duel=page.eval_on_selector_all('#duelRival option','o=>o.map(e=>e.value)');assert sorted(duel)==sorted([n for n in FUSCAS if n!='33']),duel
 assert '#20 Arthur Fischer' in page.inner_text('#duelRaceDetail'),page.inner_text('#duelRaceDetail')
 page.click('#singleRace');wait_js(page,"interlagos.ready&&!interlagos.state.paused",timeout=240000)
 page.evaluate(HOOK);page.wait_for_timeout(400)
 field=page.evaluate(FIELD);cars=page.evaluate(CARS);print(json.dumps({'field':field,'cars':cars},ensure_ascii=False),flush=True)
 assert cars['raceModel']=='fusca' and cars['raceCar']=='33' and not cars['opalaShown'] and cars['painted']=='99',cars
 f=cars['fusca'];assert f and f['number']=='33' and f['wheels']==4 and f['decals']==3 and f['fenders']==f['stripe'] and not f['ownWheelShown'],f
 assert abs(cars['seatShift'][0]-.257)<1e-6,cars
 assert '33' not in field['rivals'] and field['seats'][field['rivals'].index('99')]=='99' and field['me']=='33',field
 # The Copa Fusca's drivers, in the top 15's order with the 99 in Moraes's seat; Benício's bolts, on his car only.
 assert field['rivals']==[('99' if n=='33' else n) for n in FUSCAS if n!='99'],field['rivals']
 assert field['names'][field['rivals'].index('20')]=='Arthur Fischer' and field['names'][field['rivals'].index('99')]=='Cristiano',field['names']
 assert field['bolts']==[2 if n=='4' else 0 for n in field['rivals']],field['bolts']
 # The whole field in Fuscas, each rival's driver on the Fusca's seat (rival-driver.js CABIN_DROP plus fusca.js FUSCA_SEAT).
 assert field['models']==['fusca']*14 and field['fuscasShown']==14 and not field['opala99Shown'],field
 # And each meets the others, the walls and the ground with the Fusca's body (physics.js FUSCA_BODY).
 assert field['bodies']==['fusca']*14 and field['playerBody']=='fusca',field
 assert all(s==[.257,-.17,.06] for s in field['seat']),field['seat']
 # The rivals' cabins without the player's details (fusca.js rivalCabin: dials, switches, mirror glass...).
 assert field['inside']==[0]*14,field['inside']
 shot(page,'fusca_grid.png')
 wait_race_start(page)
 # Driving: the wheels turn with the car; braking lights the tail lamps.
 page.keyboard.down('KeyW');page.wait_for_timeout(3500);page.keyboard.up('KeyW');shot(page,'fusca_corrida_perseguicao.png')
 page.keyboard.down('KeyS');page.wait_for_timeout(250);braking=page.evaluate(CARS)['fusca']['braking'];page.keyboard.up('KeyS')
 assert braking,'the Fusca\'s tail lamps light under braking'
 page.wait_for_timeout(1500);assert not page.evaluate(CARS)['fusca']['braking']
 cockpit=None
 for view in ['close','hood','cockpit','tv']:
  camera(page,view);page.wait_for_timeout(900);shot(page,f'fusca_corrida_{view}.png')
  if view=='cockpit':
   page.keyboard.down('KeyW');page.wait_for_timeout(1500)
   cockpit=page.evaluate("(()=>{const c=interlagos.cockpitInfo();return {visible:c.visible,external:c.externalVisible,eye:c.eyeLocal,frame:c.renderedFrame,mirrorFrame:c.mirrorFrame,side:c.sideMirrors,cabin:c.fusca}})()")
   page.keyboard.up('KeyW');shot(page,'fusca_corrida_cockpit_andando.png')
 print(json.dumps({'cockpit':cockpit},ensure_ascii=False),flush=True)
 # The Opala's cockpit hides; the camera on the Fusca's centre line (fusca.js FUSCA_EYE); its rear-view mirror shows
 # this frame's rear picture, both door mirrors are live, the dials' needles move (fusca-cockpit.js).
 assert not cockpit['visible'] and max(abs(a-b) for a,b in zip(cockpit['eye'],[.057,1.01,.015]))<1e-3,cockpit
 assert cockpit['mirrorFrame']==cockpit['frame'] and cockpit['cabin']['mirror']==1,cockpit
 assert cockpit['side']['count']==2 and cockpit['side']['live'] and sorted(cockpit['side']['sides'])==[-1,1] and all(cockpit['side']['visible']),cockpit['side']
 assert set(cockpit['cabin']['needles'])=={'speed','fuel','tach'} and cockpit['cabin']['needles']['speed']<-2.4,cockpit['cabin']
 camera(page,'chase')
 result['corrida']={'fusca':f,'cockpit':cockpit}

 # Back on the menu: the Opala's body returns (the Fusca goes), the Opala tab and the story race Opalas.
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();true');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")
 after=page.evaluate(CARS);assert after['fusca'] is None and after['opalaShown'] and after['seatShift']==[0,0,0],after
 page.click('#tracksBack');wait_js(page,"interlagosCarros.info().live");page.click('#carsBack');page.click('#storyStart')
 # (Modo História's track screen offers only the Old Stock season: the story's race on this circuit is the page's hook.)
 choose_race(page,story=True);wait_js(page,"interlagos.ready&&!interlagos.state.paused",timeout=240000);page.evaluate('window.interlagosHistoria.skipCards()');page.wait_for_timeout(600)
 story=page.evaluate(CARS);assert story['raceCar']=='99' and story['raceModel']=='opala' and story['fusca'] is None and story['opalaShown'],story
 storyField=page.evaluate(FIELD);assert storyField['rivals']==OLD_STOCK,storyField['rivals'];assert storyField['models']==['opala']*14 and storyField['fuscasShown']==0 and storyField['fieldBody']=='opala' and storyField['playerBody']=='opala',storyField
 result['historia']={'model':story['raceModel'],'raceCar':story['raceCar']}
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();true');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")

 # The Fusca 99: Cristiano's car, the player in it and the Copa Fusca's other 14; the 99's paint button is the Opala's, so it hides.
 page.click('#tracksBack');page.click('#start');wait_js(page,"(i=>i.live&&i.model==='fusca')(interlagosCarros.info())")
 page.click('#carCards [data-car="99"]');page.click('#carsNext');assert 'Fusca #99' in page.inner_text('#tracksPilot')
 page.click('#singleRace');wait_js(page,"interlagos.ready&&!interlagos.state.paused",timeout=240000);page.wait_for_timeout(600)
 own=page.evaluate(CARS);field99=page.evaluate(FIELD)
 assert own['raceModel']=='fusca' and own['raceCar']=='99' and own['fusca']['number']=='99' and not own['skin'] and not own['touchSkin'] and not own['opalaShown'],own
 assert field99['rivals']==[n for n in FUSCAS if n!='99'] and not field99['opala99Shown'] and field99['models']==['fusca']*14,field99
 wait_race_start(page);page.keyboard.down('KeyW');page.wait_for_timeout(2500);page.keyboard.up('KeyW');shot(page,'fusca_99_corrida.png')
 result['fusca99']={'rivals':len(field99['rivals'])}
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();true');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")

 # Phones in landscape: the tabs and the 14 Fuscas on one screen.
 phone=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
 phone.add_init_script("""localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,car:'51',fuscaCar:'4',carModel:'fusca'}));""")
 small=phone.new_page();small.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
 small.goto(URL,wait_until='domcontentloaded');wait_js(small,"window.interlagos&&!document.querySelector('#start').disabled")
 small.fill('#pilotName','Piloto celular');small.tap('#start');wait_js(small,"(i=>i.live&&i.builtModel==='fusca'&&i.built==='4')(interlagosCarros.info())",timeout=180000)
 assert small.locator('#carCards [data-car]').count()==15
 fit=small.evaluate("""()=>{const c=document.querySelector('#cars'),r=s=>document.querySelector(s).getBoundingClientRect();return {width:document.documentElement.scrollWidth<=innerWidth,scroll:c.scrollHeight-c.clientHeight,next:r('#carsNext').bottom,tabs:r('#carModels').height,stage:r('#carStage').height,height:innerHeight}}""")
 shot(small,'fusca_celular.png')
 assert fit['width'] and fit['scroll']<=2 and fit['next']<=fit['height'] and fit['stage']>150,fit
 result['phone']=fit
 assert not errors,errors
 print(json.dumps({'passed':True,**result},ensure_ascii=False),flush=True)
 browser.close()
