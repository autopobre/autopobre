"""The parts that fly off the car ahead in the story's race (flying-parts.js, immersive-mode.js hazards): each one
thrown at the windscreen and one past it, with what it sounds like (the effects emitted) and how it lands, and a photo
of each in flight up close plus the chase camera's view of one about to hit (no HUD).

Usage, from the repo root, with the game served (servidor.py <port> --no-browser):
 python pista_interlagos/scripts/fotografar_pecas.py <out_dir> [--porta 8799]
Headless through browser_config (no window, pointer lock kept in the page).
"""
import sys, json
from pathlib import Path
import browser_config
from browser_config import browser_executable, browser_args, open_menu, enter_track
from playwright.sync_api import sync_playwright

args = sys.argv[1:]
OUT = Path(args[0] if args and not args[0].startswith('--') else 'fotos_pecas').resolve()
OUT.mkdir(parents=True, exist_ok=True)
PORT = args[args.index('--porta') + 1] if '--porta' in args else '8799'
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
HIDE_HUD = """()=>{const canvas=document.querySelector('canvas');for(const el of document.body.querySelectorAll('*'))if(el!==canvas&&!el.contains(canvas))el.style.visibility='hidden';return true;}"""
# A projectile as hazards() makes one, from 15 m ahead to the windscreen (aside: metres to the side of it).
THROW = """([id,aside,age])=>{const m=fixtureMode,c=m.car,THREE=window.__THREE,{FLYING_PARTS}=window.__parts,part=FLYING_PARTS.find(p=>p.id===id),h=c.heading;
  const fx=c.x+Math.cos(h)*.45,fy=c.y+Math.sin(h)*.45,sx=-Math.sin(h)*aside,sy=Math.cos(h)*aside;
  m.projectile={part:id,weight:part.weight,age,duration:1.25,start:new THREE.Vector3(c.x+Math.cos(h)*15,c.surface.z+.8,-(c.y+Math.sin(h)*15)),
   end:new THREE.Vector3(fx+sx,c.surface.z+1.1,-(fy+sy)),pos:new THREE.Vector3(),vel:null,hit:null,after:0,axis:new THREE.Vector3(.3,.8,.5).normalize(),spin:age*9,rate:9};
  m.state.glass=0;m.state.phase='race';m.debrisTimer=99;m.hazards(0);return true;}"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(180000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

    def frames(n=4):
        page.evaluate(f'()=>new Promise(r=>{{let k={n};const f=()=>--k?requestAnimationFrame(f):r();requestAnimationFrame(f);}})')

    try:
        open_menu(page, URL)
        enter_track(page, story=True)
        page.evaluate('''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const o=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return o.call(this)};interlagos.immersiveInfo();
          window.__THREE=await import('three');window.__parts=await import('./flying-parts.js');
          const m=fixtureMode;m.start();m.state.phase='race';window.__log=[];const emit=m.state.emitSound.bind(m.state);m.state.emitSound=(n,o)=>{window.__log.push([n,+(o?.strength??1).toFixed(2)]);emit(n,o);};return true;}''')
        page.keyboard.press('KeyP')
        frames(3)
        ids = page.evaluate('()=>window.__parts.FLYING_PARTS.map(p=>p.id)')
        report = {}
        for pid in ids:
            for aside, label in ((0, 'acerta'), (3.2, 'erra')):
                page.evaluate(THROW, [pid, aside, 0])
                r = page.evaluate('''()=>{const m=fixtureMode,c=m.car;window.__log.length=0;let hit=null,steps=0,low=9;
                  while(m.projectile&&steps++<600){m.hazards(1/120);const q=m.projectile;if(q&&q.hit!==null&&hit===null)hit=q.hit;if(q&&q.vel)low=Math.min(low,q.pos.y-c.sample(q.pos.x,-q.pos.z).z);}
                  return {hit,steps,sounds:window.__log.map(s=>s.join(':')),glass:+m.state.glass.toFixed(2),lowest:+low.toFixed(3)};}''')
                report[f'{pid}_{label}'] = r
                print(pid, label, json.dumps(r), flush=True)
        page.evaluate(HIDE_HUD)
        for pid in ids:
            page.evaluate(THROW, [pid, 0, .55])
            page.evaluate('''()=>{const q=fixtureMode.projectile.pos,c=fixtureMode.car,h=c.heading;interlagos.peek([q.x-Math.sin(h)*.9+Math.cos(h)*.6,q.y+.25,q.z-Math.cos(h)*.9-Math.sin(h)*.6],[q.x,q.y,q.z]);return true;}''')
            frames()
            page.screenshot(path=str(OUT / f'peca_{pid}.png'))
        page.evaluate('()=>interlagos.peek(null)')
        page.evaluate(THROW, ['cardan', 0, .95])
        frames()
        page.screenshot(path=str(OUT / 'perseguicao_cardan.png'))
        (OUT / 'relatorio.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
    finally:
        print('erros', errors, flush=True)
        browser.close()
