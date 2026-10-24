"""Ghost lap (G) in the browser: with no lap saved, G only says so; a saved lap (driven here by the
recon lap's racecraft, through the game's own recorder) comes on with G and races over the solo
practice in every camera, its lap time on a plate on its rear bumper (no label over it), with its lap and
the gap on the timing panel and its dot on the map; its brake lights come on where its lap braked (near and on the
distant profile), and a lap saved before the brake was kept still plays, its brake read back from its speed; a lap
that counts, driven in the game, becomes the new ghost and the lap banner says so; G turns it off;
Modo História keeps its own (G on foot in the paddock says there is none yet). Usage: verificar_fantasma.py [porta] [pasta das fotos].
Screens in renders/ (or the folder given): fantasma_*.png."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,browser_args,wait_js,wait_race_start,pause_race,choose_race

PORT=sys.argv[1] if len(sys.argv)>1 else '8799'
URL=f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
RENDERS=Path(sys.argv[2]) if len(sys.argv)>2 else Path(__file__).resolve().parents[1]/'renders';RENDERS.mkdir(parents=True,exist_ok=True)
PILOT='Piloto Fantasma'
# Two laps alone at Interlagos with the recon lap's racecraft, recorded as the game records the
# pilot's (with its brake): the flying one is saved as his ghost.
RECORD="""async pilot=>{
 const [{TestCar},{RaceField},{GhostRecorder,saveGhost}]=await Promise.all([import('./physics.js'),import('./race-field.js'),import('./ghost-lap.js')]);
 const data=await (await fetch('../dados/pista.json')).json();
 const car=new TestCar(data);car.resetGrid();const field=new RaceField(data,{seed:3});field.reset(car.surface.s,{grid:true,entrants:[]});
 const r=new GhostRecorder(),laps=[];r.step(car,true);
 for(let i=0;i<120*400&&laps.length<2;i++){const c=field.heroInput(car,1/120);car.step(c,1/120);field.step(car,1/120,3);const lap=r.step(car,true,c.brake);if(lap)laps.push(lap);}
 const saved=saveGhost(localStorage,{circuit:'interlagos',mode:'normal',pilot,lap:laps[1]});
 return {times:laps.map(l=>l.time),saved:!!saved,brakes:laps[1].brakes.length,b:saved?.b?.length??null,size:localStorage.getItem('autopobre-ghosts-v1')?.length??0};
}"""
INFO="""()=>{const g=interlagos.ghostInfo();return {...g,status:document.querySelector('#status').textContent,panel:!document.querySelector('#ghostInfo').hidden,
 button:document.querySelector('#ghostButton').getAttribute('aria-pressed'),touch:!!document.querySelector('#touchGhost'),banner:document.querySelector('#lapBannerNote').textContent,
 lapStart:interlagos.car.lapStart,clock:interlagos.car.clock,mode:interlagos.state.mode}}"""
# A camera `back` m behind the ghost and 2.2 m up, looking along it (far off: its distant profile's tail lamps).
BEHIND="""back=>{const g=interlagos.ghostInfo().pose,f=[Math.cos(g.heading),Math.sin(g.heading)];
 interlagosLuz.photo({from:[g.x-f[0]*back,g.y-f[1]*back,g.z+2.2],at:[g.x+f[0]*3,g.y+f[1]*3,g.z+.5],fov:back>40?22:50,world:true});return true}"""
# Close up as a pilot following it sees it: the race frozen, the Opala set `back` m behind the ghost, the chase camera on
# it (the ghost's detail goes by the game's own camera); `put` returns the car where it was.
FOLLOW="""back=>{const c=interlagos.car,g=interlagos.ghostInfo().pose,f=[Math.cos(g.heading),Math.sin(g.heading)];
 window.ghostShotSaved??=[c.x,c.y,c.heading,c.vx,c.vy];c.x=g.x-f[0]*back;c.y=g.y-f[1]*back;c.heading=g.heading;c.vx=c.vy=0;c.surface=c.sample(c.x,c.y);c.settle?.();return true}"""
PUT_BACK="""()=>{const c=interlagos.car,s=window.ghostShotSaved;if(s){[c.x,c.y,c.heading,c.vx,c.vy]=s;c.surface=c.sample(c.x,c.y);c.settle?.();window.ghostShotSaved=null;}return true}"""
# The car put back at rest metres before the line (interlagos.reposition), facing it.
BEFORE_LINE="""metres=>{const a=interlagos.car.data.samples,L=interlagos.car.data.meta.reconstructed_xy_m,i=a.findIndex(p=>p[0]>=L-metres);interlagos.reposition(i);return i}"""
errors=[];result={}
def info(page):return page.evaluate(INFO)
def shot(page,name):page.screenshot(path=str(RENDERS/f'fantasma_{name}.png'))
def camera(page,wanted):
 for _ in range(8):
  if page.evaluate('interlagos.state.mode')==wanted:return
  page.keyboard.press('KeyC');page.wait_for_timeout(120)
 raise AssertionError(f'camera {wanted} not reached')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 context=browser.new_context(viewport={'width':1440,'height':900})
 context.add_init_script("""if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,camera:'chase'}));localStorage.removeItem('autopobre-ghosts-v1');}""")
 page=context.new_page();page.set_default_timeout(120000)
 page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
 page.goto(URL+'?intro=0',wait_until='domcontentloaded');wait_js(page,"window.interlagos&&!document.querySelector('#start').disabled")
 page.fill('#pilotName',PILOT);page.click('#start');page.click('#carsNext');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")
 page.click('#soloRace');wait_js(page,"interlagos.ready&&interlagos.circuit==='interlagos'&&!interlagos.state.paused")

 # No lap yet: G only says so, and the ghost stays off.
 page.keyboard.press('KeyG');page.wait_for_timeout(200);g=info(page)
 assert 'Ainda não há volta gravada' in g['status'] and PILOT in g['status'] and not g['enabled'] and not g['visible'] and not g['panel'],g
 assert g['touch'] and g['triangles']>1000,g
 result['sem_volta']=g['status'];result['triangulos_da_casca']=g['triangles']

 # A lap saved for this pilot here: G turns its ghost on.
 recorded=page.evaluate(RECORD,PILOT);print(json.dumps({'gravada':recorded}),flush=True)
 assert recorded['saved'] and len(recorded['times'])==2 and recorded['size']<60000 and recorded['brakes']>=20 and recorded['b']==recorded['brakes'],recorded
 page.keyboard.press('KeyG');page.wait_for_timeout(200);g=info(page)
 assert g['enabled'] and g['lap'] and abs(g['lap']['time']-recorded['times'][1])<1e-6 and 'Fantasma ligado' in g['status'] and g['panel'] and g['button']=='true',g
 assert g['lap']['brakes']==recorded['brakes'] and g['lap']['brakesInferred'] is False and not g['braking'],g
 assert g['onTrack'] and g['plate']==g['time'],g
 result['ligado']={'volta':g['time'],'status':g['status']}

 # The 3-2-1 holds the clock: the ghost waits on its line, then drives off ahead of the parked Opala.
 wait_race_start(page);page.wait_for_timeout(700);shot(page,'largada')
 a=info(page);page.wait_for_timeout(1000);b=info(page)
 moved=sum((x-y)**2 for x,y in zip(a['position'],b['position']))**.5
 assert b['visible'] and b['opacity']>.5 and moved>20,(a,b,moved)
 assert b['gap'].startswith('+'),b
 result['largada']={'andou_1s_m':round(moved,1),'gap':b['gap'],'opacity':round(b['opacity'],2)}

 # Into the first braking zone (the Senna S): its brake lights come on; frozen with P, seen from behind close up (its
 # lit lenses) and from far off (the distant profile's), and dark again once it is off the brake.
 wait_js(page,'interlagos.ghostInfo().braking',timeout=30000);page.wait_for_timeout(150)
 page.keyboard.press('KeyP');page.wait_for_timeout(300);g=info(page)
 assert g['braking'] and g['visible'],g
 page.evaluate(FOLLOW,8);page.wait_for_timeout(1800);shot(page,'freio_aceso')
 page.evaluate(PUT_BACK);page.evaluate(BEHIND,70);page.wait_for_timeout(1500);shot(page,'freio_longe')
 page.evaluate('interlagosLuz.photo(null);true');page.keyboard.press('KeyP')
 wait_js(page,'!interlagos.ghostInfo().braking',timeout=15000)
 page.keyboard.press('KeyP');page.wait_for_timeout(300);page.evaluate(FOLLOW,8);page.wait_for_timeout(1800);shot(page,'freio_apagado')
 page.evaluate(PUT_BACK);page.keyboard.press('KeyP')
 result['freio']={'trocas':g['lap']['brakes'],'aceso_em_s':round(g['clock']-g['lapStart'],2)}

 # The same lap as if saved before the brake was kept (no b): it still loads and plays, its brake read back from its speed.
 old=page.evaluate("""async()=>{const {decodeGhost}=await import('./ghost-lap.js'),e=JSON.parse(localStorage.getItem('autopobre-ghosts-v1'))[0],
  had=Array.isArray(e.b);delete e.b;const lap=decodeGhost(e);return {had,loaded:!!lap,inferred:lap?.brakesInferred,brakes:lap?.brakes.length??0}}""")
 assert old['had'] and old['loaded'] and old['inferred'] and old['brakes']>=20,old
 result['volta_antiga']=old

 # Close behind it: its lap time on the plate on its rear bumper, behind the tail.
 page.evaluate(BEFORE_LINE,7);page.wait_for_timeout(600);page.keyboard.press('KeyP');page.wait_for_timeout(300);g=info(page);shot(page,'placa')
 assert g['visible'] and g['plate']==g['time'] and g['plateAt'][0]<-1.5 and abs(g['plateAt'][1]-.46)<1e-6,g
 page.keyboard.press('KeyP');page.wait_for_timeout(200)
 result['placa']={'texto':g['plate'],'posicao':[round(v,3) for v in g['plateAt']]}

 # Put back 14 m before the line: the ghost waits on it; frozen with P, every camera sees it.
 page.evaluate(BEFORE_LINE,14);page.wait_for_timeout(80);page.keyboard.press('KeyP');page.wait_for_timeout(300)
 views={}
 for view in ['chase','close','far','hood','cockpit','tv','aerial']:
  camera(page,view);page.wait_for_timeout(400);g=info(page);views[view]={'visible':g['visible'],'opacity':round(g['opacity'],2)};shot(page,view)
 print(json.dumps({'cameras':views}),flush=True)
 assert all(v['visible'] and v['opacity']>.3 for v in views.values()),views
 result['cameras']=views
 camera(page,'chase');page.keyboard.press('KeyP');page.wait_for_timeout(200)

 # A lap that counts, driven in the game (the checkpoints passed by hand), becomes the new ghost.
 page.evaluate(BEFORE_LINE,30);page.evaluate('interlagos.car.nextCheckpoint=20;true')
 page.keyboard.down('KeyW')
 try:wait_js(page,'interlagos.car.lapStart>0',timeout=20000)
 finally:page.keyboard.up('KeyW')
 page.wait_for_timeout(300);g=info(page)
 assert g['savedAt']==g['lapStart'] and g['lap']['time']<15 and g['banner']=='Novo fantasma',g
 stored=page.evaluate("JSON.parse(localStorage.getItem('autopobre-ghosts-v1')).map(e=>({pilot:e.pilot,time:e.time,circuit:e.circuit,mode:e.mode}))")
 assert len(stored)==1 and stored[0]['time']==g['lap']['time'] and stored[0]['pilot']==PILOT,stored
 page.wait_for_timeout(500);shot(page,'nova_volta')
 result['nova_volta']={'tempo':g['lap']['time'],'banner':g['banner']}

 # G again: off, the panel line and the ghost go.
 page.keyboard.press('KeyG');page.wait_for_timeout(200);g=info(page)
 assert not g['enabled'] and not g['visible'] and not g['panel'] and 'desligado' in g['status'] and g['button']=='false',g
 assert page.evaluate("JSON.parse(localStorage.getItem('opala99-preferences-v1')).ghost")==False

 # Modo História keeps its own ghosts, as its records: on foot in the paddock G says there is none yet.
 # (Modo História's track screen offers only the Old Stock season: the story's race on this circuit is the page's hook.)
 pause_race(page);page.click('#leaveRace');page.click('#tracksBack');page.click('#carsBack');page.click('#storyStart');choose_race(page,story=True)
 wait_js(page,"interlagos.ready&&!interlagos.state.paused&&interlagos.immersiveInfo().active");page.evaluate('window.interlagosHistoria.skipCards()')
 # (The opening's first key only skips it, intro-cinematic.js: skipped here, G is the ghost's.)
 page.evaluate('interlagos.skipIntro?.();true');page.wait_for_timeout(300)
 page.keyboard.press('KeyG');page.wait_for_timeout(200);g=info(page)
 assert 'Ainda não há volta gravada' in g['status'] and 'Modo História' in g['status'] and not g['enabled'],g
 result['historia']=g['status']
 browser.close()
assert not errors,errors
print(json.dumps(result,ensure_ascii=False,indent=1))
print('Ghost lap passed in the browser: no lap = a message only, G on/off, waits for the clock, brake lights where its lap braked (old laps read back), every camera, gap and map, a new lap replaces it.')
