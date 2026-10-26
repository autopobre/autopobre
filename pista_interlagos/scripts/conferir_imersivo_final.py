from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{}}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1280,'height':800});page.set_default_timeout(120000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 def shot(name):frame();page.screenshot(path=str(ROOT/'renders'/('imersivo_'+name+'.png')))
 try:
  open_menu(page);enter_track(page,story=True)
  page.evaluate('''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();}''')
  shot('torcida');check('immersive_branding',page.title()=='Auto-Pobre Racing com Stevan Gaipo')
  # Real car physics and lap gates, with opponents placed behind for an incident-free finish fixture.
  race=page.evaluate('''async()=>{const m=fixtureMode,{FANS,JOKES}=await import('./immersive-state.js'),{recognitionInput}=await import('./physics.js');
   for(let i=0;i<FANS.length;i++){m.state.talk(i);m.state.joke(JOKES.findIndex(j=>j.topic===FANS[i].taste));}m.state.openDesk();m.state.buy(6,false);m.sync();m.state.switchIgnition();m.state.starter=true;
   for(let i=0;i<600&&m.state.phase==='starting';i++)m.step({throttle:m.state.pressure<.45?1:0},1/120);
   for(let i=0;i<500&&m.state.phase==='grid';i++)m.step({},1/120);
   // A one-lap race (the lap setting, 3 by default, is taken at start): one full lap to the podium.
   m.storyLaps=1;m.rivals.forEach((r,i)=>r.progress=-3000-i*20);
   let steps=0;while(m.state.phase==='race'&&steps++<65000)m.step(recognitionInput(m.car),1/120);
   return {phase:m.state.phase,result:m.state.result,fuel:m.state.fuel,time:m.state.raceTime,steps};}''');report['full_lap']=race
  # The classification sheet comes first, then the podium, then the inspection.
  check('full_lap_reaches_podium',race['phase']=='podium' and race['result']['position']==1 and race['fuel']>0)
  # The sheet's Continue hands the mouse to the podium camera: Space continues from there.
  wait_js(page,"!document.querySelector('#raceResults').hidden");page.click('#resultsContinue');page.wait_for_timeout(300);page.keyboard.press('Space');page.click('[data-action="inspect"]');page.evaluate('''()=>{for(let i=0;i<1100&&fixtureMode.state.phase==='inspection';i++)fixtureMode.step({},1/120);}''');shot('podio_vitoria')
  check('real_finish_still_sixth',page.evaluate('interlagos.immersiveInfo().podiumPlace===6'))
  page.evaluate("()=>{const m=fixtureMode;m.start();m.state.phase='race';m.state.fuel=6;m.state.hitDebris();m.sync();}");page.click('#cockpitButton');shot('vidro')
  page.evaluate("()=>{const m=fixtureMode;m.state.fail('Teste de resgate');m.sync();m.state.beginTow();m.sync();for(let i=0;i<60;i++)m.step({brake:1,left:0,right:0},1/120);}");page.click('#orbitButton');frame()
  strap=page.evaluate('''async()=>{const THREE=await import('three'),{TOW_HOOK}=await import('./tow-truck.js'),v=fixtureMode.visual,a=v.strap.geometry.attributes.position,pts=Array.from({length:25},(_,i)=>new THREE.Vector3((a.getX(i*2)+a.getX(i*2+1))/2,(a.getY(i*2)+a.getY(i*2+1))/2,(a.getZ(i*2)+a.getZ(i*2+1))/2));
   const start=new THREE.Vector3(2.22,.12,0).applyMatrix4(v.carRoot.matrixWorld),end=new THREE.Vector3(...TOW_HOOK).applyMatrix4(v.truck.matrixWorld);
   return {actualStart:pts[0].toArray(),expectedStart:start.toArray(),actualEnd:pts.at(-1).toArray(),expectedEnd:end.toArray(),length:pts.slice(1).reduce((s,p,i)=>s+p.distanceTo(pts[i]),0),startError:pts[0].distanceTo(start),endError:pts.at(-1).distanceTo(end),gap:fixtureMode.state.towGap};}''');report['strap']=strap
  check('rendered_strap_attached_and_fixed',abs(strap['length']-5)<.08 and strap['startError']<.03 and strap['endError']<.03);shot('reboque')
  page.evaluate('''()=>{for(let i=0;i<2500&&fixtureMode.state.phase==='tow';i++)fixtureMode.step({brake:0,left:0,right:0},1/120);}''');shot('fita_enroscada')
  page.click('#menuButton');page.click('#tab-tour');page.click('#tour');wait_js(page,'interlagos.ready&&!interlagos.state.paused');check('config_tour_restores_normal',page.evaluate('!interlagos.immersiveInfo().active&&interlagos.state.automatic'))
  check('normal_branding_restored',page.title()=='Interlagos · Auto-Pobre Racing');check('no_browser_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_imersivo_final.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2),flush=True);browser.close()
