"""Opening (Modo Corrida / Modo História) -> track screen (circuit, Corrida única or
Campeonato). Choosing a circuit must not navigate, build WebGL, fetch race assets or restart
music; leaving a race comes back to the track screen of the same mode."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,browser_args,wait_js, start_race

PORT=sys.argv[1] if len(sys.argv)>1 else '8799'
URL=f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
ROOT=Path(__file__).resolve().parents[1]
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 context=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
 context.add_init_script("""localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false}));localStorage.removeItem('opala99-championship-v1');
 window.mediaPlayers=[];const NativeAudio=window.Audio;window.Audio=new Proxy(NativeAudio,{construct(target,args){const player=Reflect.construct(target,args);mediaPlayers.push(player);return player;}});
 window.gpuContexts=0;const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.startsWith('webgl'))gpuContexts++;return original.call(this,type,...args);};""")
 page=context.new_page();page.set_default_timeout(120000)
 page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
 requests=[];navigations=[]
 page.on('request',lambda r:requests.append(r.url))
 page.on('request',lambda r:navigations.append(r.url) if r.is_navigation_request() and r.resource_type=='document' else None)
 # The circuits' files. Modo Corrida's car screen loads the car itself (its model, the cockpit, the
 # renderer) for its studio; the race then reuses them.
 def heavy():return [u for u in requests if any(s in u for s in ['interlagos_pista.glb','/dados/pista','asfalto_','/piloto/'])]
 page.goto(URL,wait_until='domcontentloaded');wait_js(page,"window.interlagos&&!document.querySelector('#start').disabled")
 assert page.is_visible('#start') and page.is_visible('#storyStart') and not page.is_visible('#tracks') and not page.is_visible('#singleRace')
 assert page.text_content('#start')=='Modo Corrida →' and page.text_content('#storyStart')=='Modo História →'
 # A mode needs the pilot; then the track screen shows the four circuits and the two ways to race.
 page.click('#start');assert page.is_visible('#pilotMessage') and not page.is_visible('#tracks')
 page.fill('#pilotName','Piloto selecao');page.click('#storyStart');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")
 assert page.get_attribute('#tracks','data-mode')=='historia' and 'MODO HISTÓRIA' in page.inner_text('#tracksMode') and 'MODO HISTÓRIA' in page.inner_text('#championshipKicker')
 page.screenshot(path=str(ROOT/'renders/pistas_celular_historia.png'))
 page.click('#tracksBack');page.click('#start');assert page.is_visible('#cars') and not page.is_visible('#tracks')
 page.click('#carsNext');assert page.get_attribute('#tracks','data-mode')=='corrida' and 'MODO CORRIDA' in page.inner_text('#championshipKicker')
 # One card per circuit of circuits.js (a new track brings its card).
 assert page.locator('#tracks [data-circuit]').count()==page.evaluate("import('./circuits.js').then(m=>Object.keys(m.CIRCUITS).length)") and page.is_visible('#singleRace') and page.is_visible('#raceModes [data-race="championship"]') and not page.is_visible('#storyStart')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(ROOT/'renders/pistas_celular.png'))
 assert not heavy(),heavy();assert page.evaluate('gpuContexts')<=1
 page.click('[data-circuit="curvelo"]');wait_js(page,"interlagos.audioInfo().recordings?.playing")
 page.evaluate('window.song=mediaPlayers.find(p=>!p.paused);window.songTime=song.currentTime;window.songSrc=song.src')
 for circuit in ['cascavel','piracicaba','chapeco','interlagos','curvelo']:
  page.click('[data-circuit="'+circuit+'"]')
  assert page.get_attribute(f'[data-circuit="{circuit}"]','aria-pressed')=='true'
 page.wait_for_timeout(500)
 assert len(navigations)==1,navigations
 assert page.evaluate('song===mediaPlayers.find(p=>!p.paused)&&song.src===songSrc&&song.currentTime>songTime')
 assert not heavy(),heavy();assert page.evaluate('gpuContexts')<=1
 assert page.evaluate("JSON.parse(localStorage.getItem('opala99-preferences-v1')).circuit")=='curvelo'
 # Back to the opening and forward again keeps the choice; the records dialog opens there.
 page.click('#tracksBack');assert page.is_visible('#cars') and not page.is_visible('#tracks');page.click('#carsBack');assert page.is_visible('#start') and not page.is_visible('#cars')
 page.click('#recordsButton');assert page.get_attribute('[data-records-circuit="curvelo"]','aria-selected')=='true';page.click('#recordsClose')
 page.click('#settingsButton');page.select_option('#camera','hood');page.select_option('#livery','seiva_danilo');page.click('#settingsClose')
 page.click('#start');page.click('#carsNext');assert page.get_attribute('[data-circuit="curvelo"]','aria-pressed')=='true'
 assert not heavy(),heavy()
 print(json.dumps({'modeNeedsPilot':True,'modeFirst':True,'trackScreen':True,'selectionNoReload':True,'sameSongContinues':True,'noRaceAssetsOrGPU':True}),flush=True)
 start_race(page, '#singleRace');wait_js(page,"interlagos.ready&&interlagos.circuit==='curvelo'&&!interlagos.state.paused")
 assert heavy();assert page.evaluate('gpuContexts')==1
 page.evaluate("""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixture=this;return old.call(this)};interlagos.immersiveInfo();fixture.onMainMenu();}""")
 # Leaving the race lands on the track screen, not the opening.
 assert page.is_visible('#tracks') and not page.is_visible('#start') and page.get_attribute('#tracks','data-mode')=='corrida'
 count=len(heavy());page.click('[data-circuit="interlagos"]');page.wait_for_timeout(250)
 assert len(heavy())==count;assert page.evaluate("interlagos.circuit==='curvelo'")
 # Fail one load, keep the track screen usable, then retry in the same audio session.
 page.route('**/dados/pista.json',lambda r:r.fulfill(status=503,body='Unavailable'))
 start_race(page, '#singleRace');wait_js(page,"!document.querySelector('#singleRace').disabled&&!interlagos.ready")
 assert page.is_visible('#tracks');page.unroute('**/dados/pista.json')
 start_race(page, '#singleRace');wait_js(page,"interlagos.ready&&interlagos.circuit==='interlagos'&&!interlagos.state.paused")
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu()')
 assert page.locator('#immersivePanel').count()==1;assert page.locator('#pitPanel').count()<=1
 page.click('[data-circuit="cascavel"]');start_race(page, '#singleRace');wait_js(page,"interlagos.ready&&interlagos.circuit==='cascavel'&&!interlagos.state.paused")
 assert page.locator('#immersivePanel').count()==1;assert page.locator('#pitPanel').count()==1;assert page.locator('#gridRoster li').count()==15
 assert len(navigations)==1;assert page.evaluate('gpuContexts')==1
 # The pause menu: back to the track, restart, change track (to the track screen).
 page.tap('#touchMenu');page.tap('#settingsClose')
 assert page.is_visible('#resume') and page.is_visible('#restartRace') and page.is_visible('#leaveRace') and not page.is_visible('#start') and not page.is_visible('#storyStart')
 page.click('#resume');wait_js(page,'!interlagos.state.paused')
 # Restart on the loaded circuit: no second world, model fetch or blocked skin control.
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();window.previousCar=interlagos.car;true')  # not the car: serialising it takes minutes
 count=len(heavy());start_race(page, '#singleRace');wait_js(page,"interlagos.ready&&!interlagos.state.paused")
 assert page.evaluate('interlagos.car===previousCar');assert len(heavy())==count
 assert not page.is_disabled('#skinButton')
 print(json.dumps({'startsOnlyOnClick':True,'retryLoad':True,'switchesBothWays':True,'singleRenderer':True,'noDuplicateUI':True,'pauseMenu':True}),flush=True)
 browser.close()
assert not errors,errors
