"""Photos of the story's rescue in the game (immersive-visuals.js truckModel, tow-truck.js: the 4x4 pickup, or with
--reboque guincho the flatbed truck kept for later): the chase camera's view during the tow, as the player sees it, and
fixed views round it (interlagos.peek), without the HUD.

Usage, from the repo root, with the game served (servidor.py <port> --no-browser):
 python pista_interlagos/scripts/fotografar_guincho.py <out_dir> [--porta 8799] [--so vista,vista] [--reboque guincho]
Headless through browser_config (no window, pointer lock kept in the page).
"""
import sys, json
from pathlib import Path
import browser_config
from browser_config import browser_executable, browser_args, open_menu, enter_track, wait_js
from playwright.sync_api import sync_playwright

args = sys.argv[1:]
flags = {a: args[i + 1] for i, a in enumerate(args) if a.startswith('--') and i + 1 < len(args) and not args[i + 1].startswith('--')}
plain = [a for i, a in enumerate(args) if not a.startswith('--') and not (i and args[i - 1].startswith('--') and args[i - 1] in flags)]
OUT = Path(plain[0] if plain else 'fotos_guincho').resolve()
OUT.mkdir(parents=True, exist_ok=True)
PORT = flags.get('--porta', '8799')
ONLY = set(flags['--so'].split(',')) if '--so' in flags else None
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/' + (f"?reboque={flags['--reboque']}" if '--reboque' in flags else '')

# name: (camera in the truck's frame: x forward, y up, z right; the point it looks at, same frame)
VIEWS = {
    'tras34': ((-6.2, 2.1, -3.6), (-.6, 1.0, 0)),
    'frente34': ((7.0, 1.8, 4.2), (.6, 1.0, 0)),
    'lado': ((.3, 1.3, -8.5), (.3, 1.0, 0)),
    'frente': ((8.5, 1.4, 0), (1, 1.1, 0)),
    'traseira_perto': ((-5.0, 1.45, .4), (-1.5, .9, 0)),
    'cima': ((-2.5, 6.5, -4.5), (0, .8, 0)),
    'cabine': ((4.6, 1.9, -2.2), (2.2, 1.4, 0)),
    'roda_tras': ((-1.3, .7, -3.2), (-1.3, .5, 0)),
}

HIDE_HUD = """()=>{const canvas=document.querySelector('canvas');for(const el of document.body.querySelectorAll('*'))if(el!==canvas&&!el.contains(canvas))el.style.visibility='hidden';return true;}"""
SHOW_HUD = """()=>{for(const el of document.body.querySelectorAll('*'))el.style.visibility='';return true;}"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1600, 'height': 900})
    page.set_default_timeout(180000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

    def frames(n=3):
        page.evaluate(f'()=>new Promise(r=>{{let k={n};const f=()=>--k?requestAnimationFrame(f):r();requestAnimationFrame(f);}})')

    def shot(name):
        frames(4)
        page.screenshot(path=str(OUT / f'{name}.png'))
        print('foto', name, flush=True)

    try:
        open_menu(page, URL)
        enter_track(page, story=True)
        page.evaluate('''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();return true;}''')
        # Broken down on the road, the truck there, the strap on: as conferir_imersivo_final.py gets there.
        page.evaluate('''()=>{const m=fixtureMode;m.start();m.state.phase='race';m.state.fail('Foto do reboque');m.sync();m.state.beginTow();m.sync();for(let i=0;i<240;i++)m.step({brake:.35,left:0,right:0},1/120);return true;}''')
        frames(6)
        if not ONLY or 'jogo' in ONLY:
            shot('jogo_perseguicao')
        page.keyboard.press('KeyP')
        frames(3)
        page.evaluate(HIDE_HUD)
        for name, (eye, at) in VIEWS.items():
            if ONLY and name not in ONLY:
                continue
            page.evaluate('''async([eye,at])=>{const THREE=await import('three'),t=fixtureMode.visual.truck;t.updateWorldMatrix(true,false);
              const a=new THREE.Vector3(...eye).applyMatrix4(t.matrixWorld),b=new THREE.Vector3(...at).applyMatrix4(t.matrixWorld);interlagos.peek(a.toArray(),b.toArray());return true;}''', [eye, at])
            shot(name)
        page.evaluate('()=>interlagos.peek(null)')
        page.evaluate(SHOW_HUD)
    finally:
        (OUT / 'erros.json').write_text(json.dumps(errors, ensure_ascii=False, indent=1), encoding='utf-8')
        print('erros', len(errors), flush=True)
        browser.close()
