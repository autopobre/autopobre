"""Linha ideal (O) in the browser: off unless picked; O lays it (a slice at a time, the race running) and shows it, the
button and the race settings follow; ahead of the car the red starts sooner the faster it goes, and right under it when
the car is too fast for the bend in front; rain brings the red sooner; O again shows only the corners, then turns it off.
Usage: verificar_linha_ideal.py [porta]. Screens in renders/: linha_ideal_*.png."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,browser_args,wait_js,wait_race_start

PORT=sys.argv[1] if len(sys.argv)>1 else '8799'
URL=f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
RENDERS=Path(__file__).resolve().parents[1]/'renders';RENDERS.mkdir(exist_ok=True)
INFO="""()=>({...interlagos.drivingLineInfo(),status:document.querySelector('#status').textContent,button:document.querySelector('#lineButton').getAttribute('aria-pressed'),
 setting:document.querySelector('#drivingLine').value,saved:JSON.parse(localStorage.getItem('opala99-preferences-v1')).drivingLine,camera:interlagos.state.mode})"""
# The car put at rest at lap distance s (interlagos.reposition), then given speed km/h along the road; P holds the race.
PLACE="""([s,kmh])=>{const c=interlagos.car,a=c.data.samples,i=a.findIndex(p=>p[0]>=s);interlagos.reposition(i);const S=c.surface,v=kmh/3.6;c.vx=S.tx*v;c.vy=S.ty*v;return i}"""
errors=[];result={}
def info(page):return page.evaluate(INFO)
def shot(page,name):page.screenshot(path=str(RENDERS/f'linha_ideal_{name}.png'))
def at(page,s,kmh,wait=250):
 page.evaluate(PLACE,[s,kmh]);page.wait_for_timeout(wait);return info(page)
def camera(page,wanted):
 for _ in range(8):
  if page.evaluate('interlagos.state.mode')==wanted:return
  page.keyboard.press('KeyC');page.wait_for_timeout(120)
 raise AssertionError(f'camera {wanted} not reached')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 context=browser.new_context(viewport={'width':1440,'height':900})
 context.add_init_script("""if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,camera:'chase'}));}""")
 page=context.new_page();page.set_default_timeout(120000)
 page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
 page.goto(URL+'?intro=0',wait_until='domcontentloaded');wait_js(page,"window.interlagos&&!document.querySelector('#start').disabled")
 page.fill('#pilotName','Piloto Linha');page.click('#start');page.click('#carsNext');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")
 page.click('#soloRace');wait_js(page,"interlagos.ready&&interlagos.circuit==='interlagos'&&!interlagos.state.paused")

 # Off unless picked.
 g=info(page);assert g['mode']=='desligada' and not g['visible'] and g['button']=='false' and g['setting']=='desligada',g

 # O: the whole line, laid while the race runs; the words say what the colours mean.
 t0=page.evaluate('performance.now()');page.keyboard.press('KeyO')
 wait_js(page,'interlagos.drivingLineInfo().visible',timeout=30000);laid=page.evaluate('performance.now()')-t0;g=info(page)
 assert g['mode']=='completa' and g['saved']=='completa' and g['setting']=='completa' and g['button']=='true',g
 assert 'verde acelera' in g['status'] and 'vermelho freia' in g['status'],g
 assert g['model']=='opala' and g['stations']>2000 and g['lap']<g['rivalsLine'],g
 result['ligada']={'ms_ate_aparecer':round(laid),'volta_modelo':round(g['lap'],2),'linha_dos_rivais':round(g['rivalsLine'],2),'status':g['status']}
 wait_race_start(page);page.keyboard.press('KeyP');page.wait_for_timeout(200)

 # Down the main straight towards the S do Senna: the faster, the sooner the red.
 marks={}
 for kmh in [100,150,190]:
  g=at(page,4150,kmh);marks[kmh]=g['brakeIn']
 assert all(marks[k] is not None for k in marks) and marks[100]>marks[150]>marks[190]>100,marks
 g=at(page,4130,185,500);shot(page,'reta_chase')
 assert g['green']>.3 and g['red']>.05,g
 result['freada_antes_do_S']={f'{k}_kmh':round(v) for k,v in marks.items()}
 camera(page,'cockpit');page.wait_for_timeout(400);shot(page,'reta_cockpit');camera(page,'chase')
 # Too fast for the bend just ahead: red right under the car; slow, none there.
 g=at(page,250,160);assert g['brakeIn'] is not None and g['brakeIn']<6,g;shot(page,'rapido_demais')
 g=at(page,250,40);assert g['brakeIn'] is None or g['brakeIn']>20,g
 # Through the corners, seen from above.
 g=at(page,200,120,500);camera(page,'aerial');page.wait_for_timeout(500);shot(page,'aerea_senna');camera(page,'chase')
 g=at(page,3150,130,500);shot(page,'bico_de_pato')

 # Rain: at the same speed the red comes sooner. (A change of weather may compile new programs first: no frames meanwhile.)
 dry=at(page,4150,180)['brakeIn']
 for _ in range(4):
  if page.evaluate('interlagosClima.info().rain')=='chuva':break
  page.keyboard.press('KeyU');page.wait_for_timeout(300);wait_js(page,'!interlagosClima.info().compiling',timeout=60000)
 wet=at(page,4150,180)['brakeIn'];rain=page.evaluate('interlagosClima.info().rain')
 assert rain=='chuva' and wet<dry-20,(rain,dry,wet)
 result['chuva']={'seco_m':round(dry),'chuva_m':round(wet)}
 while page.evaluate('interlagosClima.info().rain')!='seco':page.keyboard.press('KeyU');page.wait_for_timeout(300);wait_js(page,'!interlagosClima.info().compiling',timeout=60000)

 # O again: only round the corners; then off.
 page.keyboard.press('KeyO');page.wait_for_timeout(300);g=at(page,4130,185,500)
 assert g['mode']=='curvas' and g['visible'] and 'só nas curvas' in g['status'],g;shot(page,'so_curvas')
 page.keyboard.press('KeyO');page.wait_for_timeout(300);g=info(page)
 assert g['mode']=='desligada' and not g['visible'] and g['button']=='false' and g['saved']=='desligada',g
 # The race settings' choice does the same.
 page.evaluate("()=>{const s=document.querySelector('#drivingLine');s.value='completa';s.dispatchEvent(new Event('change'))}");page.wait_for_timeout(300);g=info(page)
 assert g['mode']=='completa' and g['visible'] and g['button']=='true',g
 result['curvas_e_desligada']='ok'
 browser.close()
assert not errors,errors
print(json.dumps(result,ensure_ascii=False,indent=1))
print('Linha ideal passed in the browser: off by default, O lays and shows it, red sooner at speed and in the rain, only the corners, off, the setting.')
