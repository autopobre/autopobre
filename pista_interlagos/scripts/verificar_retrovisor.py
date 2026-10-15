from browser_config import browser_executable, browser_args, wait_js, open_menu, race_options, enter_track, wait_race_start
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,math
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{}}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
# One frame of the film look: the pixels drawn with alpha -1 in its HDR picture (the door
# mirrors' glass) and the mean ambient occlusion the screen shows there (debug view 1).
GLASS_JS='''()=>import('three').then(THREE=>new Promise(resolve=>{
 const proto=THREE.Scene.prototype,old=proto.onAfterRender;let mask=null;interlagos.cinematicLook({debug:1});
 proto.onAfterRender=function(renderer,scene,camera){const t=renderer.getRenderTarget();
  if(t?.isMainView&&!mask){const w=t.width,h=t.height,buf=new Uint16Array(w*h*4);renderer.readRenderTargetPixels(t,0,0,w,h,buf);mask={w,h,buf};}
  else if(!t&&mask){const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,px=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
   proto.onAfterRender=old;interlagos.cinematicLook({debug:0});let marked=0,sum=0;
   // Half floats at or below -0.5 have the sign bit and at least 0xb800.
   for(let i=0;i<mask.w*mask.h;i++){const a=mask.buf[i*4+3];if(a>=0xb800&&a<0xfc00){marked++;const x=i%mask.w,y=Math.floor(i/mask.w);sum+=px[(Math.floor(y*h/mask.h)*w+Math.floor(x*w/mask.w))*4]/255;}}
   resolve({marked,ao:marked?sum/marked:null,level:interlagos.cinematicInfo().level});}
  old?.call(this,renderer,scene,camera);};}))'''
# The next frame's mirror pictures (the wide, short targets that are not the main view: the door mirrors' and, with
# the trunk lid open, the rear-view mirror's own), each as the mean brightness in an 8 x 4 grid (rows from the top).
MIRROR_GRID_JS='''()=>import('three').then(THREE=>new Promise(resolve=>{
 const proto=THREE.Scene.prototype,old=proto.onAfterRender,pictures=[];
 proto.onAfterRender=function(renderer,scene,camera){const t=renderer.getRenderTarget();
  if((!t||t.isMainView)&&pictures.length){proto.onAfterRender=old;resolve(pictures);}
  if(t&&!t.isMainView&&t.width>4*t.height){const w=t.width,h=t.height,type=t.texture.type;
   const buf=type===THREE.HalfFloatType?new Uint16Array(w*h*4):type===THREE.FloatType?new Float32Array(w*h*4):new Uint8Array(w*h*4);renderer.readRenderTargetPixels(t,0,0,w,h,buf);
   const v=i=>type===THREE.HalfFloatType?THREE.DataUtils.fromHalfFloat(buf[i]):type===THREE.FloatType?buf[i]:buf[i]/255,grid=new Array(32).fill(0),n=new Array(32).fill(0);
   for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){const i=(y*w+x)*4,g=Math.floor((h-1-y)/h*4)*8+Math.floor(x/w*8);grid[g]+=(v(i)+v(i+1)+v(i+2))/3;n[g]++;}
   pictures.push(grid.map((s,i)=>s/n[i]));}
  old?.call(this,renderer,scene,camera);};}))'''
TRUNK='Tampa_porta_malas_DOBRADICA'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def sample(count=8):
  return page.evaluate('''count=>new Promise(resolve=>{
   const frames=[];
   function tick(){const i=interlagos.cockpitInfo();frames.push({frame:i.renderedFrame,mirror:i.mirrorFrame,eye:i.mirrorEyeLocal,clock:interlagos.car.clock});
    if(frames.length===count)resolve(frames);else requestAnimationFrame(tick);}
   requestAnimationFrame(tick);
  })''',count)
 def synced(frames):
  return all(f['frame']==f['mirror'] and math.dist(f['eye'],[-.65,1.14,0])<1e-6 for f in frames) and len(set(f['frame'] for f in frames))==len(frames)
 try:
  # The free race starts behind the car; switch to the interior on track.
  open_menu(page);enter_track(page);page.click('#cockpitButton')
  frames=sample();check('every_cockpit_frame_has_fresh_reflection',synced(frames))
  # Door mirrors (side-mirrors.js): both glasses drawn in the cockpit, from the driver's eye looking ahead.
  doors=page.evaluate('interlagos.cockpitInfo().sideMirrors');snap=page.evaluate('interlagos.cameraSnapshot()')
  def in_view(c):
   d=[c[i]-snap['position'][i] for i in range(3)];n=math.hypot(*d);f=snap['direction'];return sum(d[i]*f[i] for i in range(3))/n>math.cos(math.radians(55))
  check('door_mirrors_live_in_cockpit',doors['count']==2 and doors['live'] and all(doors['visible']) and sorted(doors['sides'])==[-1,1] and all(in_view(c) for c in doors['centers']))
  # The occlusion read the glass sunk in its housing as a deep corner (players: mirrors far too dark).
  glass=page.evaluate(GLASS_JS);report['door_glass']=glass
  check('door_mirrors_escape_occlusion',glass['level']!='full' or (glass['marked']>2000 and glass['ao']>.9))
  # The trunk lid left open stands in the back window (user, 2026-10-15): the rear-view mirror gets a picture of its own
  # where the lid covers nearly all of it; the door mirrors look past the flanks and keep the picture without it.
  shut=page.evaluate(MIRROR_GRID_JS);page.wait_for_timeout(300);still=page.evaluate(MIRROR_GRID_JS)
  page.evaluate(f"interlagos.holdOpening('{TRUNK}',true)");wait_js(page,f"interlagos.openingsInfo()['{TRUNK}'].open===1",timeout=15000)
  lid=page.evaluate(MIRROR_GRID_JS);lid_shown=page.evaluate('interlagos.cockpitInfo().lidMirror')
  page.evaluate(f"interlagos.holdOpening('{TRUNK}',false)");wait_js(page,f"interlagos.openingsInfo()['{TRUNK}'].open===0",timeout=15000)
  again=page.evaluate(MIRROR_GRID_JS)
  change=lambda a,b,cells:sum(abs(a[i]-b[i]) for i in cells)/len(cells)
  middle=[r*8+c for r in range(4) for c in range(3,5)];wide=[r*8+c for r in range(4) for c in range(1,7)]
  report['mirror_trunk']={'pictures':[len(shut),len(lid),len(again)],'still':round(change(shut[0],still[0],middle),4),'door_mirrors':round(change(shut[0],lid[0],middle),4),'lid':round(change(lid[0],lid[-1],wide),4)}
  check('door_mirrors_never_see_the_trunk_lid',len(shut)==1 and change(shut[0],still[0],middle)<.01 and change(shut[0],lid[0],middle)<.01)
  check('rear_view_mirror_covered_by_the_open_lid',len(lid)==2 and lid_shown and change(lid[0],lid[1],wide)>.1)
  check('lid_shut_one_picture_again',len(again)==1 and not page.evaluate('interlagos.cockpitInfo().lidMirror'))
  wait_race_start(page);page.evaluate('()=>{interlagos.reposition(600);const c=interlagos.car;c.vx=Math.cos(c.heading)*15;c.vy=Math.sin(c.heading)*15;}')
  page.keyboard.down('KeyA');frames=sample(12);page.keyboard.up('KeyA')
  check('moving_and_turning_stays_synchronized',synced(frames) and frames[-1]['clock']>frames[0]['clock'])
  report['moving_frames']=frames
  page.screenshot(path=str(ROOT/'renders/retrovisor_sincronizado.png'))
  page.keyboard.press('KeyP');page.evaluate('interlagos.reposition(800)');frames=sample(3)
  check('paused_reposition_refreshes_immediately',synced(frames) and frames[0]['clock']==frames[-1]['clock'])
  race_options(page,camera='chase');frames=sample(4)
  check('external_view_skips_mirror_render',len(set(f['mirror'] for f in frames))==1 and frames[-1]['frame']>frames[0]['frame'])
  doors=page.evaluate('interlagos.cockpitInfo().sideMirrors');check('door_mirrors_hidden_outside',not doors['live'] and not any(doors['visible']))
  outside=page.evaluate(GLASS_JS);check('nothing_else_skips_occlusion',outside['level']!='full' or outside['marked']==0)
  race_options(page,camera='cockpit');frames=sample(3)
  check('return_to_cockpit_has_no_stale_frame',synced(frames))
  race_options(page,livery='seiva_danilo');frames=sample(3)
  check('second_livery_synchronized',synced(frames))
  doors=page.evaluate('interlagos.cockpitInfo().sideMirrors');check('door_mirrors_follow_livery',doors['count']==2 and doors['live'] and all(doors['visible']))
  check('no_browser_or_shader_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_retrovisor.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
