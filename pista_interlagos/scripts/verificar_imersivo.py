from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{},'scenario_setup':'Natural first walk/joke; controlled fixtures for race incidents and outcomes.'}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1280,'height':800});page.set_default_timeout(120000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def info():return page.evaluate('interlagos.immersiveInfo()')
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 def shot(name):frame();page.screenshot(path=str(ROOT/'renders'/('imersivo_'+name+'.png')))
 try:
  open_menu(page)
  check('story_button_without_autostart',not page.evaluate('interlagos.ready') and page.is_visible('#storyStart') and page.locator('#tracks #singleRace').count()==1)
  enter_track(page,story=True)
  # Capture the running instance for controlled incident fixtures, without shipping a debug mutation API.
  page.evaluate('''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();}''')
  check('crowd_phase',info()['phase']=='crowd');shot('torcida')
  before=info()['hero'];page.keyboard.down('KeyW');wait_js(page,'interlagos.immersiveInfo().nearFan>=0');page.keyboard.up('KeyW');check('walk_to_supporter',info()['hero']!=before)
  page.keyboard.press('KeyE');page.wait_for_selector('[data-action="joke:0"]');fan=info()['nearFan'];topics=['família','oficina','corrida'];tastes=['família','oficina','corrida','família','oficina','corrida'];correct=topics.index(tastes[fan])
  page.click(f'[data-action="joke:{(correct+1)%3}"]');check('bad_joke_no_donation',info()['cash']==0)
  page.click(f'[data-action="joke:{correct}"]');check('laugh_pays_donation',info()['cash']>0);shot('piada')
  # Collect remaining donations with the same state actions to shorten navigation in regression runs.
  page.evaluate('''async()=>{const {FANS,JOKES}=await import('./immersive-state.js');const s=fixtureMode.state;for(let i=0;i<FANS.length;i++){s.talk(i);s.joke(JOKES.findIndex(j=>j.topic===FANS[i].taste));}fixtureMode.action('close');}''')
  # The walk up to the team stand is covered by verificar_inscricao.py; here the team's panel opens directly.
  page.evaluate("fixtureMode.action('desk')");page.wait_for_selector('#immLitres');shot('preparacao');page.click('[data-action="buy"]');check('fuel_bought',info()['fuel']==6)
  page.evaluate('''()=>{const m=fixtureMode;m.action('ign');m.state.starter=true;for(let i=0;i<400&&m.state.phase==='starting';i++)m.step({throttle:m.state.pressure<.45?1:0,brake:0,left:0,right:0,handbrake:0,reverse:0},1/120);}''');check('engine_started',info()['phase']=='grid');shot('largada')
  page.evaluate('''()=>{for(let i=0;i<400&&fixtureMode.state.phase==='grid';i++)fixtureMode.step({throttle:0,brake:0,left:0,right:0,handbrake:0,reverse:0},1/120);}''');check('fourteen_rivals',info()['phase']=='race' and len(info()['rivals'])==14);shot('corrida')
  page.evaluate('''()=>{const m=fixtureMode;m.state.tankWear=.99;m.car.vx=20;m.state.raceStep({speed:20,throttle:1,offTrack:7},.1);m.stop();}''');check('tank_dropped_and_leaking',info()['tankDetached']);shot('tanque')
  page.click('#cockpitButton');page.evaluate('fixtureMode.state.hitDebris()');check('windscreen_cracks',info()['glass']>0);shot('vidro')
  page.evaluate('''()=>{const m=fixtureMode;m.state.fuel=.00001;m.state.raceStep({speed:10,throttle:1},.1);m.sync();}''');check('out_of_fuel_calls_rescue',info()['phase']=='broken');shot('quebra')
  page.evaluate('''()=>{for(let i=0;i<400&&fixtureMode.state.phase==='broken';i++)fixtureMode.step({},1/120);}''');check('tow_arrived',info()['phase']=='tow')
  page.click('#orbitButton');shot('reboque')
  page.evaluate('''()=>{for(let i=0;i<2400&&fixtureMode.state.phase==='tow';i++)fixtureMode.step({brake:0,left:0,right:0},1/120);}''');check('strap_snags_without_braking',info()['phase']=='snag');shot('fita_enroscada')
  page.click('[data-action="untangle"]');page.evaluate('''()=>{for(let i=0;i<15000&&fixtureMode.state.phase==='tow';i++)fixtureMode.step({brake:1,left:0,right:0},1/120);}''');check('braking_completes_rescue',info()['phase']=='podium');shot('podio_quebra');page.click('[data-action="afterPodium"]');shot('vistoria')
  page.click('[data-action="inspect"]');page.evaluate('''()=>{for(let i=0;i<1100&&fixtureMode.state.phase==='inspection';i++)fixtureMode.step({},1/120);}''');check('dnf_podium_always_sixth',info()['phase']=='complete' and info()['podiumPlace']==6);shot('podio_quebra')
  # Winner and disqualification fixtures verify both endings through real UI actions.
  page.evaluate("()=>{const m=fixtureMode;m.start();m.state.phase='race';m.state.finish(1);m.sync();}");frame();page.click('[data-action="afterPodium"]');page.click('[data-action="box"]');check('winner_disqualified_for_box',info()['result']['status']=='Desclassificado' and info()['prize']==0 and info()['podiumPlace']==6);shot('desclassificado')
  page.evaluate("()=>{const m=fixtureMode;m.start();m.state.phase='race';m.state.finish(1);m.sync();}");frame();page.click('[data-action="afterPodium"]');page.click('[data-action="inspect"]');page.evaluate('''()=>{for(let i=0;i<1100&&fixtureMode.state.phase==='inspection';i++)fixtureMode.step({},1/120);}''');check('winner_gets_prize_but_sixth_podium',info()['result']['position']==1 and info()['podiumPlace']==6 and info()['prize']==800);shot('podio_vitoria')
  # The Blazer is the career's dream once the four challenges are done (story-career.js), after the race's cards; then
  # (Central #16) its card and the HANS, the next challenge.
  page.evaluate('()=>{window.interlagosHistoria.skipCards();const s=fixtureMode.state;s.profile.career.challenge=4;s.profile.fund=900;s.touch();}');frame();page.click('[data-action="blazer"]');check('blazer_released',info()['profile']['released'] and info()['scene']['cards']==['dream','challenge']);shot('blazer_livre')
  page.evaluate('window.interlagosHistoria.skipCards()');frame();page.click('[data-action="normal"]');check('normal_mode_restored',not info()['active']);open_menu(page);enter_track(page);check('garage_progress_persists',info()['profile']['released'] and not info()['active'])
  check('no_browser_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_imersivo_browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2),flush=True);browser.close()
