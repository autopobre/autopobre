"""The story's podium stands in the open on every circuit (circuits.js podium, immersive-visuals.js).

On each circuit a story race is finished in sixth; on the podium, rays from 1.5 m above the stage's
centre must find no roof above it (pit garages, a covered grandstand) and nothing within 12 m around
it (a wall, a grandstand, a billboard between the photo camera and the steps). A screenshot of each
podium goes to the given folder.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_podios.py [pasta_das_fotos] [circuitos...]
"""
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, GAME_URL
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, sys
ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'renders' / 'podios'
CIRCUITS = sys.argv[2:] or ['interlagos', 'brasilia', 'cascavel', 'chapeco', 'goiania', 'piracicaba', 'curvelo', 'chapada', 'minhocao']
SHOTS.mkdir(parents=True, exist_ok=True)
report = {'errors': [], 'checks': {}, 'podiums': {}}
HOOK = '''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();return true;}'''
# The scene's visible meshes but the story's own (stage, paddock, Kléber's box) and sprites.
PROBE = '''async()=>{const THREE=await import('three');const v=fixtureMode.visual,st=v.stage;v.scene.updateMatrixWorld(true);
 const c=st.getWorldPosition(new THREE.Vector3()),o=c.clone().add(new THREE.Vector3(0,1.5,0)),ray=new THREE.Raycaster(),targets=[];
 v.scene.traverse(m=>{if(!m.isMesh||m.isSprite)return;let p=m;while(p){if(p===v.root||!p.visible)return;p=p.parent;}targets.push(m);});
 const near=[];for(let i=0;i<16;i++){const a=i/16*Math.PI*2;ray.set(o,new THREE.Vector3(Math.cos(a),0,Math.sin(a)));ray.far=40;const h=ray.intersectObjects(targets,false)[0];near.push(h?+h.distance.toFixed(1):99);}
 ray.set(o,new THREE.Vector3(0,1,0));ray.far=60;const roof=ray.intersectObjects(targets,false)[0];
 return {near:Math.min(...near),roof:roof?roof.object.name||'sem nome':null};}'''


def check(name, value):
    report['checks'][name] = bool(value); print(name, bool(value), flush=True); assert value, name


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args())
    try:
        for circuit in CIRCUITS:
            context = browser.new_context(viewport={'width': 1280, 'height': 800})
            context.add_init_script(f"localStorage.setItem('opala99-preferences-v1',JSON.stringify({{...JSON.parse(localStorage.getItem('opala99-preferences-v1')||'{{}}'),circuit:'{circuit}'}}))")
            page = context.new_page(); page.set_default_timeout(180000)
            page.on('pageerror', lambda e: report['errors'].append(str(e)))
            open_menu(page, URL); enter_track(page, story=True)
            page.evaluate(HOOK); wait_js(page, "fixtureMode.state.phase==='crowd'")
            check('circuit_' + circuit, page.evaluate('interlagos.circuit') == circuit)
            page.evaluate("()=>{const m=fixtureMode,s=m.state;s.scene=null;s.phase='race';m.beginFinish(6);}")
            wait_js(page, "fixtureMode.state.phase==='podium'", timeout=30000)
            if page.is_visible('#resultsContinue'): page.click('#resultsContinue')
            page.wait_for_timeout(1200)
            probe = report['podiums'][circuit] = page.evaluate(PROBE)
            page.screenshot(path=str(SHOTS / f'podio_{circuit}.png'))
            check('podium_open_sky_' + circuit, probe['roof'] is None)
            check('podium_clear_round_' + circuit, probe['near'] >= 12)
            context.close()
    finally:
        browser.close()
check('no_page_errors', not report['errors'])
print(json.dumps(report, ensure_ascii=False, indent=1))
