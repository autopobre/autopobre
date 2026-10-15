"""The Copa Fusca 2026 tab of Modo Corrida's championship panel (championship.js COPA_FUSCA_2026) and the car
screen's way on (#carsNext) big atop the cards, as the track screen's Corrida única.
Usage: verificar_copa_fusca.py [porta]
- Car screen: #carsNext tops the side panel, above the cards, as wide as them, with a line naming the car; inside the window (desktop and phone).
- Track screen, Modo Corrida: three tabs; the Copa Fusca shows its eleven dated rounds, Interlagos six times.
  While Goiânia is not in circuits.js it is "em breve" and holds the start; Modo História has no Copa Fusca
  tab (a remembered one shows Todas as pistas there).
- With a Goiânia entry served in circuits.js (as when the track lands; the real one once it is there), the cup starts: round 1 at Interlagos
  races Fuscas, the whole field, although the car screen's tab is the Opala; the result sheet names the cup and
  its date. A single race afterwards is back in the Opala.
Screens in renders/: copa_fusca_carros.png, copa_fusca_pistas.png, copa_fusca_historia.png, copa_fusca_grid.png,
copa_fusca_resultado.png, copa_fusca_carros_celular.png, copa_fusca_pistas_celular.png."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,browser_args,wait_js,wait_race_start

PORT=sys.argv[1] if len(sys.argv)>1 else '8799'
URL=f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
ROOT=Path(__file__).resolve().parents[1]
RENDERS=ROOT/'renders';RENDERS.mkdir(exist_ok=True)
CUP='[data-championship-calendar="copafusca2026"]'
SEED="""if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');
 for(const k of Object.keys(localStorage))if(k.startsWith('opala99-championship'))localStorage.removeItem(k);
 localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,car:'73',carModel:'opala'}));}"""
HOOK="""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixture=this;return old.call(this)};interlagos.immersiveInfo();return true;}"""
FIELD="""()=>{interlagos.immersiveInfo();const v=fixture.visual;return {models:v.rivals.map(o=>o.userData.fusca?'fusca':'opala'),bodies:fixture.rivals.map(r=>r.car.body.name),playerBody:interlagos.car.body.name,rivals:fixture.rivals.map(r=>r.entry.number)}}"""
# The car screen's way on: under the stage beside the car's plate, inside the window; the arrows on the stage's sides.
NEXT="""()=>{const r=s=>document.querySelector(s).getBoundingClientRect().toJSON(),c=document.querySelector('#cars');return {detail:document.querySelector('#carsNextDetail')?.textContent??null,
 next:r('#carsNext'),plate:r('.car-plate'),stage:r('#carStage'),left:r('#carLeft'),right:r('#carRight'),height:innerHeight,width:document.documentElement.scrollWidth<=innerWidth,scroll:c.scrollHeight-c.clientHeight}}"""
# Served circuits.js with a Goiânia entry appended, as the track will land (the cup's round 8).
GOIANIA=" goiania:{id:'goiania',name:'Goiânia',label:'AUTÓDROMO AYRTON SENNA · GOIÂNIA, GO',length:3835,description:'3.835 m · 14 curvas · horário · Goiânia, GO',intro:'',source:'',fuel:'',altitude:740},\n"
errors=[];result={}
def shot(page,name):page.wait_for_timeout(400);page.screenshot(path=str(RENDERS/name))
def watch(page):
 page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
 page.on('console',lambda m:print('console',m.type,m.text,flush=True) if m.type=='error' else None)
def opening(page,pilot):
 page.goto(URL+'?intro=0',wait_until='domcontentloaded');wait_js(page,"window.interlagos&&!document.querySelector('#start').disabled")
 page.fill('#pilotName',pilot)
def with_goiania(route):
 body=route.fetch().text();import re
 # Once the real Goiânia is in circuits.js, it is served as it is.
 if 'goiania:{' not in body:body=re.sub(r',?\n\}\);',',\n'+GOIANIA.replace('\\','\\\\')+'});',body,count=1)
 route.fulfill(body=body,headers={'content-type':'text/javascript; charset=utf-8'})
def car_screen(page,name):
 wait_js(page,"interlagosCarros.info().live",timeout=180000)
 fit=page.evaluate(NEXT);shot(page,name)
 st,nx=fit['stage'],fit['next']
 assert nx['top']>=st['bottom']-1 and nx['bottom']<=fit['height'] and nx['left']>=fit['plate']['right'] and st['height']>150,fit
 assert fit['left']['left']>=st['left']-1 and fit['right']['right']<=st['right']+1 and st['top']<fit['left']['top']<fit['left']['bottom']<st['bottom'],fit
 assert fit['detail']=='Com o Opala #73 · corrida única, treino, 1x1 ou campeonato',fit['detail']
 assert fit['width'] and fit['scroll']<=2,fit
 assert page.inner_text('#carsNext').startswith('Escolher a pista')
 return fit

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 context=browser.new_context(viewport={'width':1440,'height':900});context.add_init_script(SEED)
 page=context.new_page();page.set_default_timeout(180000);watch(page)
 opening(page,'Piloto copa')
 page.click('#start');assert page.is_visible('#cars')
 result['carros']=car_screen(page,'copa_fusca_carros.png')

 # Modo Corrida: three calendars; the Copa Fusca and its eleven rounds.
 page.click('#carsNext');assert page.is_visible('#tracks') and page.get_attribute('#tracks','data-mode')=='corrida'
 tabs=page.locator('#championshipTabs [role=tab]').all_inner_texts();assert tabs==['Todas as pistas','Old Stock 2026','Copa Fusca 2026'],tabs
 page.click(CUP);assert page.get_attribute(CUP,'aria-selected')=='true'
 rounds=page.locator('#championshipCalendar li');assert rounds.count()==11
 places=page.locator('#championshipCalendar li span').all_inner_texts();dates=page.locator('#championshipCalendar li small').all_inner_texts()
 assert places.count('Interlagos - SP')==6 and places[7]=='Goiânia - GO' and dates[0]=='21 e 22 FEV' and dates[-1]=='19 e 20 DEZ',(places,dates)
 assert page.inner_text('#championshipTitle')=='Temporada 2026, nas datas da Copa Fusca Seineca'
 status=page.inner_text('#championshipStatus');assert status.startswith('11 etapas de Fusca'),status
 if not page.evaluate("import('./circuits.js').then(m=>Object.hasOwn(m.CIRCUITS,'goiania'))"):
  soon=page.locator('#championshipCalendar li.soon');assert soon.count()==1 and 'em breve' in soon.inner_text(),soon.all_inner_texts()
  assert page.is_disabled('#championshipStart') and page.inner_text('#championshipStart')=='Em breve: Goiânia',page.inner_text('#championshipStart')
 result['copa']={'status':status,'start':page.inner_text('#championshipStart')}
 shot(page,'copa_fusca_pistas.png')
 # The arrows walk the three tabs.
 page.focus(CUP);page.keyboard.press('ArrowRight');assert page.get_attribute('[data-championship-calendar="todas"]','aria-selected')=='true'
 page.keyboard.press('ArrowLeft');assert page.get_attribute(CUP,'aria-selected')=='true'

 # Modo História: no Copa Fusca; the remembered tab shows Todas as pistas there, and the cup is kept for Modo Corrida.
 page.click('#tracksBack');page.click('#carsBack');page.click('#storyStart')
 assert page.get_attribute('#tracks','data-mode')=='historia'
 tabs=page.locator('#championshipTabs [role=tab]').all_inner_texts();assert tabs==['Todas as pistas','Old Stock 2026'],tabs
 assert page.get_attribute('[data-championship-calendar="todas"]','aria-selected')=='true'
 page.focus('[data-championship-calendar="todas"]');page.keyboard.press('ArrowLeft');assert page.get_attribute('[data-championship-calendar="oldstock2026"]','aria-selected')=='true'
 page.keyboard.press('ArrowRight');assert page.get_attribute('[data-championship-calendar="todas"]','aria-selected')=='true'
 shot(page,'copa_fusca_historia.png')
 context.close()

 # Goiânia in the game: the cup starts, in Fuscas, though the car screen's tab is the Opala.
 context=browser.new_context(viewport={'width':1440,'height':900});context.add_init_script(SEED)
 context.route('**/teste/circuits.js*',with_goiania)
 page=context.new_page();page.set_default_timeout(240000);watch(page)
 opening(page,'Piloto copa')
 assert page.evaluate("import('./circuits.js').then(m=>Object.hasOwn(m.CIRCUITS,'goiania'))")
 page.click('#start');page.click('#carsNext');page.click(CUP)
 assert page.locator('#championshipCalendar li.soon').count()==0 and page.is_enabled('#championshipStart') and page.inner_text('#championshipStart').startswith('Começar campeonato')
 assert 'Opala #73' in page.inner_text('#tracksPilot'),page.inner_text('#tracksPilot')
 page.click('#championshipStart')
 wait_js(page,"interlagos.ready&&interlagos.circuit==='interlagos'&&!interlagos.state.paused",timeout=240000)
 page.evaluate('interlagos.skipIntro?.()')
 session=page.inner_text('header .session');assert 'COPA FUSCA 2026 · ETAPA 1/11' in session,session
 page.evaluate(HOOK);page.wait_for_timeout(400)
 cars=page.evaluate("()=>interlagosCarros.info()");field=page.evaluate(FIELD)
 # The car is the Fusca tab's (the 99 unless picked: the Opala's 73 is no Copa Fusca car), the field the Copa Fusca's.
 assert cars['raceModel']=='fusca' and cars['raceCar']=='99' and not cars['opalaShown'] and cars['fusca']['number']=='99',cars
 assert field['rivals']==['20','86','77','29','18','3','33','5','39','11','4','9','79','49'],field['rivals']
 assert field['models']==['fusca']*14 and field['bodies']==['fusca']*14 and field['playerBody']=='fusca',field
 assert page.evaluate("JSON.parse(localStorage.getItem('opala99-preferences-v1')).carModel")=='opala','the car screen keeps its tab'
 shot(page,'copa_fusca_grid.png')
 wait_race_start(page)
 page.evaluate('interlagos.car.laps=fixture.freeTotalLaps')
 wait_js(page,"interlagos.state.paused&&fixture.freeFinished&&!document.querySelector('#raceResults').hidden",timeout=60000)
 mode=page.inner_text('#resultsMode');line=page.inner_text('#resultsChampionshipLine')
 assert 'COPA FUSCA 2026 · ETAPA 1 DE 11 · 21 E 22 FEV' in mode,mode
 assert page.inner_text('#resultsContinue')=='Próxima etapa: Brasília →',page.inner_text('#resultsContinue')
 saved=page.evaluate("JSON.parse(localStorage.getItem('opala99-championship-copafusca2026-v1'))")
 assert saved['calendar']=='copafusca2026' and [r['circuit'] for r in saved['results']]==['interlagos'] and len(saved['rounds'])==11,saved
 result['etapa1']={'mode':mode,'line':line,'session':session}
 shot(page,'copa_fusca_resultado.png')
 # Back on the track screen: round 2 next; a single race goes back to the car screen's Opala.
 page.click('#resultsMainMenu');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")
 assert page.inner_text('#championshipStart')=='Correr a etapa 2 →',page.inner_text('#championshipStart')
 page.click('#singleRace');wait_js(page,"interlagos.ready&&!interlagos.state.paused",timeout=240000)
 cars=page.evaluate("()=>interlagosCarros.info()");assert cars['raceModel']=='opala' and cars['opalaShown'],cars
 session=page.inner_text('header .session');assert 'COPA FUSCA' not in session,session
 context.close()

 # Phones in landscape: the way on at the top of the car screen; the cup's tab and rounds on the track screen.
 phone=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True);phone.add_init_script(SEED)
 small=phone.new_page();small.set_default_timeout(180000);watch(small)
 opening(small,'Piloto celular');small.tap('#start')
 result['celular']=car_screen(small,'copa_fusca_carros_celular.png')
 small.tap('#carsNext');small.tap(CUP)
 fit=small.evaluate("""()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),panel=r('.championship-panel'),tabs=r('#championshipTabs');
  return {width:document.documentElement.scrollWidth<=innerWidth,tabs:tabs.toJSON(),panel:panel.toJSON(),rounds:[...document.querySelectorAll('#championshipCalendar li')].map(li=>li.getBoundingClientRect().width)}}""")
 shot(small,'copa_fusca_pistas_celular.png')
 assert fit['width'] and fit['tabs']['right']<=fit['panel']['right']+1 and len(fit['rounds'])==11 and min(fit['rounds'])>=14,fit
 result['celular_pistas']=fit
 browser.close()
assert not errors,errors
print(json.dumps({'passed':True,**result},ensure_ascii=False),flush=True)
