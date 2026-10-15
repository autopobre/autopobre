"""Modo Corrida's car screen (#cars, car-select.js): the 15 Opalas, the garage (car-garage.js) turning the
chosen one, zooming on it and tilting over it, the choice kept, and on track the player's car in that team's colours with
the Opala 99 (Stevan Gaipo) in its seat. Modo História stays the 99's. Usage: verificar_carros.py [porta]
Screens in renders/: carros_99.png, carros_73.png, carros_19.png, carros_zoom.png, carros_por_cima.png,
carros_pistas.png,
carros_corrida_73.png, carros_99_depois.png, carros_celular.png."""
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
# The field that races and the rivals' models shown in its seats.
FIELD="""()=>{interlagos.immersiveInfo();const f=fixture;return {rivals:f.rivals.map(r=>r.entry.number),seats:f.visual.rivals.map(o=>o.userData.entry.number),
 opala99:!!f.visual.opala99,opala99Shown:!!f.visual.opala99?.visible,me:f.playerEntry?.number??'99',legend:document.querySelector('.map-legend').textContent.trim(),
 roster:[...document.querySelectorAll('#gridRoster li')].map(li=>li.textContent)}}"""
CARS="()=>interlagosCarros.info()"
# The settings' grid list, as built when the settings open; 'Voltar à pista' closes them and resumes.
ROSTER="()=>{const q=s=>document.querySelector(s);q('#settingsButton').click();const r=[...document.querySelectorAll('#gridRoster li')].map(li=>li.textContent);(q('#settingsResume').hidden?q('#settingsClose'):q('#settingsResume')).click();return r;}"
errors=[];result={}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 context=browser.new_context(viewport={'width':1440,'height':900})
 context.add_init_script("""if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,duelRival:'73'}));}""")
 page=context.new_page();page.set_default_timeout(180000)
 page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
 page.on('console',lambda m:print('console',m.type,m.text,flush=True) if m.type=='error' else None)
 glbs=[];page.on('request',lambda r:glbs.append(r.url) if '/opala99_' in r.url else None)
 page.goto(URL+'?intro=0',wait_until='domcontentloaded');wait_js(page,"window.interlagos&&!document.querySelector('#start').disabled")

 # Modo Corrida opens the car screen; the story goes straight to the tracks.
 page.fill('#pilotName','Piloto carros');page.click('#start')
 assert page.is_visible('#cars') and not page.is_visible('#tracks') and not page.is_visible('#menu')
 assert page.locator('#carCards [data-car]').count()==15
 assert page.get_attribute('#carCards [data-car="99"]','aria-checked')=='true'
 wait_js(page,"interlagosCarros.info().live&&interlagosCarros.info().built==='99'",timeout=180000)
 page.wait_for_timeout(600);page.screenshot(path=str(RENDERS/'carros_99.png'))
 first=page.evaluate(CARS);assert first['meshes']>20,first
 # The screen is the canvas's window: the studio draws there, the cards stay in the page.
 assert page.evaluate("getComputedStyle(document.querySelector('#cars')).backgroundImage.includes('linear-gradient')")
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')

 # Picking a card: the studio builds that car, the choice is kept.
 page.click('#carCards [data-car="73"]');wait_js(page,"interlagosCarros.info().built==='73'")
 assert '#73' in page.inner_text('#carNumber') and 'Konrad' in page.inner_text('#carDetail') and 'Stevan' in page.inner_text('#carDetail')
 assert page.evaluate("JSON.parse(localStorage.getItem('opala99-preferences-v1')).car")=='73'
 page.wait_for_timeout(500);page.screenshot(path=str(RENDERS/'carros_73.png'))
 # Arrows walk the cards; dragging turns the car.
 page.focus('#carCards [data-car="73"]');page.keyboard.press('ArrowRight');assert page.get_attribute('#carCards [data-car="00"]','aria-checked')=='true'
 yaw=page.evaluate(CARS)['yaw'];box=page.locator('#carStage').bounding_box()
 page.mouse.move(box['x']+box['width']*.4,box['y']+box['height']*.4);page.mouse.down();page.mouse.move(box['x']+box['width']*.7,box['y']+box['height']*.4,steps=8);page.mouse.up()
 assert abs(page.evaluate(CARS)['yaw']-yaw)>1,'dragging turns the car'
 page.click('#carCards [data-car="19"]');wait_js(page,"interlagosCarros.info().built==='19'");page.wait_for_timeout(500);page.screenshot(path=str(RENDERS/'carros_19.png'))
 # The garage (car-garage.js): its screens and the box number show the car on the turntable, the floor mirrors the room (Alto). The wheel, the
 # buttons, + and - and a double click zoom while the car keeps turning; the page itself never scrolls.
 garage=page.evaluate(CARS)['garage'];assert garage['screen']=='OPALA #19' and garage['box']=='19' and garage['mirror'] and garage['tyres']>20,garage
 page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.5)
 for _ in range(4):page.mouse.wheel(0,-240);page.wait_for_timeout(60)
 page.wait_for_timeout(1000);zoom=page.evaluate(CARS);assert zoom['zoom']>1.6 and zoom['distance']<8,zoom
 # (A drag holds the turn for 2.5 s, the one above was just now; up close it turns slower.)
 page.wait_for_timeout(2600);yaw=page.evaluate(CARS)['yaw'];page.wait_for_timeout(1000);assert page.evaluate(CARS)['yaw']>yaw+.06,'the car keeps turning up close'
 page.screenshot(path=str(RENDERS/'carros_zoom.png'))
 assert page.evaluate("document.querySelector('#cars').scrollTop")==0
 page.click('#carZoomOut');assert page.evaluate(CARS)['zoomTo']<zoom['zoomTo']/1.3
 page.mouse.dblclick(box['x']+box['width']*.5,box['y']+box['height']*.5);assert abs(page.evaluate(CARS)['zoomTo']-1)<.01
 page.keyboard.press('Equal');page.keyboard.press('Equal');assert page.evaluate(CARS)['zoomTo']>1.5
 page.keyboard.press('Minus');page.keyboard.press('Minus');page.keyboard.press('Minus');assert page.evaluate(CARS)['zoomTo']<1
 # Dragging up and down tilts the camera: down to the tyres, up over the roof (closer, it goes higher).
 page.click('#carZoomIn');page.click('#carZoomIn');page.click('#carZoomIn');page.click('#carZoomIn');page.wait_for_timeout(800)
 def tilt(dy):
  page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.5);page.mouse.down();page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.5+dy,steps=8);page.mouse.up();page.wait_for_timeout(900);return page.evaluate(CARS)
 low=tilt(-180);assert low['elevation']<.08 and low['camera'][1]>.25,low
 high=tilt(260);assert high['elevation']>1,high
 page.screenshot(path=str(RENDERS/'carros_por_cima.png'))
 page.mouse.dblclick(box['x']+box['width']*.5,box['y']+box['height']*.5);page.wait_for_timeout(300)
 page.click('#carCards [data-car="73"]');wait_js(page,"interlagosCarros.info().built==='73'")

 # On to the tracks: the car named there, the way back leads to it, the 1x1 is against the 99 now.
 page.click('#carsNext');assert page.is_visible('#tracks') and not page.is_visible('#cars')
 assert 'Opala #73' in page.inner_text('#tracksPilot'),page.inner_text('#tracksPilot')
 assert page.inner_text('#tracksBack')=='← Carro'
 options=page.eval_on_selector_all('#duelRival option','os=>os.map(o=>o.value)');assert '99' in options and '73' not in options and len(options)==14,options
 assert page.input_value('#duelRival')=='99' and '#99' in page.inner_text('#duelRaceDetail'),page.inner_text('#duelRaceDetail')
 page.screenshot(path=str(RENDERS/'carros_pistas.png'))
 # Escape goes back to the cars; Enter on a card goes on to the tracks.
 page.keyboard.press('Escape');assert page.is_visible('#cars');page.focus('#carCards [data-car="73"]');page.keyboard.press('Enter');assert page.is_visible('#tracks')

 # Corrida única in #73: Stevan Gaipo races the 99 in Konrad's seat, the player's Opala is orange.
 page.click('#singleRace');wait_js(page,"interlagos.ready&&!interlagos.state.paused",timeout=240000)
 page.evaluate(HOOK);page.wait_for_timeout(400)
 field=page.evaluate(FIELD);cars=page.evaluate(CARS);print(json.dumps({'field':field,'cars':cars},ensure_ascii=False),flush=True)
 assert '73' not in field['rivals'] and '99' in field['rivals'] and len(field['rivals'])==14,field
 i73=field['rivals'].index('99');assert field['seats'][i73]=='99' and field['opala99'],field
 assert field['me']=='73' and field['legend'].startswith('73'),field
 assert any(r.startswith('#73 · VOCÊ') for r in field['roster']) and any(r.startswith('#99 · Stevan') for r in field['roster']),field['roster']
 assert cars['raceCar']=='73' and cars['painted']=='73' and cars['decals']==4 and cars['hidden']>0 and cars['paint']==0xe8731c and not cars['skin'] and not cars['touchSkin'],cars
 wait_race_start(page);page.wait_for_timeout(800)
 roster=page.evaluate(ROSTER);assert any(r.startswith('#73 · VOCÊ') for r in roster) and any(r.startswith('#99 · Stevan') for r in roster),roster
 assert page.evaluate("interlagos.immersiveInfo();fixture.visual.opala99.visible"),'the 99 shows on track'
 page.screenshot(path=str(RENDERS/'carros_corrida_73.png'))
 result['corrida73']={'field':field,'cars':cars}
 # The 99's other paint chosen in the settings while racing #73: saved for later, the 99's model not
 # downloaded again (the player's car would only be repainted orange over it).
 first_livery=cars['livery'];other='seiva_danilo' if first_livery=='assinaturas_omp' else 'assinaturas_omp';loads=len(glbs)
 page.evaluate(f"(()=>{{const s=document.querySelector('#livery');s.value='{other}';s.dispatchEvent(new Event('change'));return true;}})()");page.wait_for_timeout(1500)
 kept=page.evaluate(CARS);assert kept['livery']==first_livery and kept['painted']=='73' and len(glbs)==loads,(kept,glbs)
 assert page.evaluate("JSON.parse(localStorage.getItem('opala99-preferences-v1')).livery")==other

 # Results under #73 with the player's name; the AI records keep their own numbers.
 page.evaluate("interlagos.immersiveInfo();fixture.car.laps=fixture.freeTotalLaps;true");wait_js(page,"!document.querySelector('#raceResult').hidden",timeout=30000)
 rows=page.eval_on_selector_all('#finishingOrder li','ls=>ls.map(l=>l.textContent)')
 mine=[r for r in rows if 'Piloto carros' in r];assert len(mine)==1 and '#73 Piloto carros' in mine[0],rows
 assert any('#99 Stevan Gaipo' in r for r in rows) and not any('Konrad' in r for r in rows),rows

 # Leaving the race: the model goes back to the 99 before the car screen clones it again.
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();true');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")
 after=page.evaluate(CARS);assert after['painted']=='99' and after['decals']==0 and after['hidden']==0,after

 # Modo História right after #73, on the same circuit: the 99 whatever was chosen for Modo Corrida, and
 # Stevan's Opala 99 (Konrad's seat a moment ago) gone from the track, not parked where it stopped.
 page.click('#tracksBack');wait_js(page,"interlagosCarros.info().live");page.click('#carsBack');page.click('#storyStart')
 assert page.is_visible('#tracks') and page.get_attribute('#tracks','data-mode')=='historia' and page.inner_text('#tracksBack')=='← Início'
 # (Modo História's track screen offers only the Old Stock season: the story's race on this circuit is the page's hook.)
 choose_race(page,story=True);wait_js(page,"interlagos.ready&&!interlagos.state.paused",timeout=240000);page.evaluate('window.interlagosHistoria.skipCards()');page.wait_for_timeout(600)
 story=page.evaluate(CARS);assert story['raceCar']=='99' and story['painted']=='99' and story['skin'] and story['touchSkin'],story
 story_field=page.evaluate(FIELD);assert story_field['rivals'][0]=='73' and '99' not in story_field['rivals'] and not story_field['opala99Shown'],story_field
 # The grid list in the settings is the story's field too, not the #73 race's.
 roster=page.evaluate(ROSTER);assert any(r.startswith('#99 ') and r.endswith('VOCÊ') for r in roster) and any(r.startswith('#73 · Konrad') for r in roster) and not any('no carro de' in r for r in roster),roster
 result['historia']={'raceCar':story['raceCar'],'opala99Shown':story_field['opala99Shown'],'you':[r for r in roster if 'VOCÊ' in r]}
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();true');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")

 # Back to Modo Corrida in the 99.
 page.click('#tracksBack');page.click('#start');wait_js(page,"interlagosCarros.info().live");page.click('#carCards [data-car="99"]');wait_js(page,"interlagosCarros.info().built==='99'")
 page.wait_for_timeout(400);page.screenshot(path=str(RENDERS/'carros_99_depois.png'))
 page.click('#carsNext');page.click('#singleRace');wait_js(page,"interlagos.ready&&!interlagos.state.paused",timeout=240000)
 back=page.evaluate(FIELD);own=page.evaluate(CARS)
 assert '99' not in back['rivals'] and '73' in back['rivals'] and not back['opala99Shown'] and back['me']=='99',back
 assert own['painted']=='99' and own['decals']==0 and own['skin'] and own['touchSkin'],own
 result['corrida99']={'rivals':back['rivals'],'livery':own['livery']}
 assert own['livery']==other,own
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();true');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")

 # #73 again on the same circuit: Stevan's Opala 99 is built again from the model in the new paint.
 page.click('#tracksBack');wait_js(page,"interlagosCarros.info().live");page.click('#carCards [data-car="73"]');wait_js(page,"interlagosCarros.info().built==='73'")
 page.click('#carsNext');page.click('#singleRace');wait_js(page,"interlagos.ready&&!interlagos.state.paused",timeout=240000)
 again=page.evaluate(CARS);field2=page.evaluate(FIELD)
 assert again['raceCar']=='73' and again['livery']==other and again['stevanCurrent'] is True,again
 i99=field2['rivals'].index('99');assert field2['seats'][i99]=='99',field2
 wait_race_start(page);page.wait_for_timeout(600)
 assert page.evaluate("interlagos.immersiveInfo();fixture.visual.opala99.visible"),'the 99 shows on track'
 result['corrida73_de_novo']={'livery':again['livery'],'stevanCurrent':again['stevanCurrent']}
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();true');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")

 # Phones in landscape: the car screen on one screen.
 phone=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
 phone.add_init_script("""localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,car:'51'}));""")
 small=phone.new_page();small.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
 small.goto(URL,wait_until='domcontentloaded');wait_js(small,"window.interlagos&&!document.querySelector('#start').disabled")
 small.fill('#pilotName','Piloto celular');small.tap('#start');wait_js(small,"interlagosCarros.info().live&&interlagosCarros.info().built==='51'",timeout=180000)
 fit=small.evaluate("""()=>{const c=document.querySelector('#cars'),r=s=>document.querySelector(s).getBoundingClientRect();return {width:document.documentElement.scrollWidth<=innerWidth,scroll:c.scrollHeight-c.clientHeight,next:r('#carsNext').bottom,stage:r('#carStage').height,height:innerHeight}}""")
 small.wait_for_timeout(400);small.screenshot(path=str(RENDERS/'carros_celular.png'))
 assert fit['width'] and fit['scroll']<=2 and fit['next']<=fit['height'] and fit['stage']>150,fit
 result['phone']=fit
 assert not errors,errors
 print(json.dumps({'passed':True,**result},ensure_ascii=False),flush=True)
 browser.close()
