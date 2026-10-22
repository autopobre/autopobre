"""Story mode registration at the team stand on the pit wall, in a real browser.

The pilot climbs the steps beside the Box 99 stand to the yellow circle by the engineers'
computers; stepping in opens the team's panel with the kitty against the costs. Without
enough money he goes back for more; with it, Enter takes him to the fuel purchase on the grid.
All seven circuits (Interlagos, Curvelo, Cascavel, Piracicaba, Chapecó, Brasília and Goiânia) are checked: Cascavel's pit wall is thin
where the lane runs far from the track, so its stand needs the widened wall under it (muro_barraca.py).

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_inscricao.py [interlagos curvelo cascavel piracicaba chapeco brasilia goiania guaratiba]
"""
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, GAME_URL
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, math, os, sys
ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
report = {'errors': [], 'checks': {}}


def check(name, value):
    report['checks'][name] = bool(value); print(name, bool(value), flush=True); assert value, name


def run(page, circuit):
    tag = '' if circuit == 'interlagos' else '_' + circuit
    def frames(n=2):
        for _ in range(n): page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    def shot(name): frames(); page.screenshot(path=str(ROOT / 'renders' / f'inscricao_{name}{tag}.png'))
    def hero(): return page.evaluate('fixtureMode.visual.hero.position.toArray()')
    # Hero at a lane point (x along the lane from Box 99, d across it), camera and walk along `toward`.
    place = '''([x,d,toward])=>{const v=fixtureMode.visual,L=v.lane,p=L.point(x,d),o=v.crowd.position;v.hero.position.set(p.x,fixtureMode.walkGround(p.clone().add(o),99)-o.y,p.z);v.foot.floor=v.hero.position.y+o.y;v.foot.lift=v.foot.vz=0;v.foot.yaw=v.hero.rotation.y=L.heading+toward;v.followPosition=null;fixtureMode.deskInside=false;}'''
    open_menu(page, URL)
    enter_track(page, story=True)
    page.evaluate('''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();}''')
    wait_js(page, "fixtureMode.state.phase==='crowd'")
    # The story's opening shots play first (story-scene.js); the paddock's marker shows once they end.
    wait_js(page, "!fixtureMode.visual.cutscene?.()", timeout=60000)
    check('circuit_' + circuit, page.evaluate('interlagos.circuit') == circuit)
    check('registration_circle_in_paddock' + tag, page.evaluate('!!fixtureMode.visual.deskMarker&&fixtureMode.visual.deskMarker.marker.visible'))
    check('no_register_button_on_screen' + tag, not page.is_visible('[data-action="buy"]') and 'escadinha' in page.inner_text('#immersivePanel'))
    # From the lane the pit wall under the stand stays solid: walking into it does not climb it.
    lane = page.evaluate('fixtureMode.visual.lane.lane(fixtureMode.visual.desk.route[0])')
    page.evaluate(place, [lane['x'] + 2.2, lane['d'], -math.pi / 2])
    y0 = hero()[1]; page.keyboard.down('KeyW'); page.wait_for_timeout(1500); page.keyboard.up('KeyW')
    # Curvelo's stand sits on a 42 cm plinth on the grass, low enough to step onto anywhere.
    if circuit != 'curvelo': check('wall_under_stand_not_climbed_from_lane', abs(hero()[1] - y0) < .15 and not page.evaluate('fixtureMode.state.desk'))
    # Up the steps with W: the feet rise tread by tread onto the wall top.
    page.evaluate(place, [lane['x'], lane['d'], -math.pi / 2])
    y0 = hero()[1]; page.keyboard.down('KeyW'); page.wait_for_timeout(1400); page.keyboard.up('KeyW')
    top = page.evaluate('fixtureMode.visual.desk.route[1].y')
    check('steps_climbed_with_w' + tag, hero()[1] > y0 + .3 and abs(hero()[1] - top) < .2)
    shot('escada')
    # A click on the circle's sign walks him there by the steps, from the start of the paddock.
    page.evaluate('''()=>{const m=fixtureMode,v=m.visual;v.reset();m.deskInside=false;const s=v.desk.spot,h=v.hero.position;v.foot.yaw=Math.atan2(-(s.z-h.z),s.x-h.x);v.foot.pitch=.2;}''')
    frames(6); shot('placa_de_longe')
    if page.evaluate('!!document.pointerLockElement'): page.keyboard.press('Tab')
    xy = page.evaluate('''()=>{const v=fixtureMode.visual,p=v.deskMarker.sign.getWorldPosition(v.hero.position.clone()).project(fixtureMode.camera),r=document.querySelector('#view').getBoundingClientRect();return [r.left+(p.x+1)/2*r.width,r.top+(1-p.y)/2*r.height];}''')
    page.mouse.click(*xy)
    check('click_on_circle_walks_there' + tag, page.evaluate('!!fixtureMode.walkToDesk'))
    wait_js(page, 'fixtureMode.state.desk', timeout=40000)
    check('stepping_in_opens_team_panel' + tag, page.is_visible('#immersivePanel.social-dialogue') and 'Equipe 99' in page.inner_text('#immersivePanel'))
    check('pilot_stands_on_the_deck' + tag, abs(hero()[1] - page.evaluate('fixtureMode.visual.desk.spot.y')) < .15)
    text = page.inner_text('#immersivePanel')
    # The entry is R$ 100 at Interlagos and R$ 150 away (story-career.js); the start needs it and 4 litres.
    entry = 100 if circuit == 'interlagos' else 150; reais = lambda n: f'R$ {n:.2f}'.replace('.', ',')
    check('panel_shows_kitty_and_costs' + tag, all(s in text for s in ['Na vaquinha', 'Na carteira', 'R$ 0,00', 'Inscrição', reais(entry), 'Gasolina', 'Faltam', reais(entry + 26)]))
    check('poor_kitty_cannot_go_to_track' + tag, page.is_disabled('[data-action="buy"]'))
    frames(10); shot('sem_dinheiro')
    page.keyboard.press('Enter'); check('enter_without_money_stays' + tag, page.evaluate("fixtureMode.state.phase==='crowd'&&fixtureMode.state.desk"))
    page.click('[data-action="leaveDesk"]')
    check('back_for_more_money' + tag, page.evaluate("fixtureMode.state.phase==='crowd'&&!fixtureMode.state.desk"))
    frames(10); check('circle_does_not_reopen_while_inside' + tag, not page.evaluate('fixtureMode.state.desk'))
    # The supporters pay; E by the circle opens the team again, now with enough for the start.
    page.evaluate('''async()=>{const {FANS,JOKES}=await import('./immersive-state.js');const s=fixtureMode.state;for(let i=0;i<FANS.length;i++){s.fan=null;s.talk(i);s.joke(JOKES.findIndex(j=>j.topic===FANS[i].taste));}s.fan=null;s.touch();}''')
    page.keyboard.press('KeyE'); wait_js(page, 'fixtureMode.state.desk')
    text = page.inner_text('#immersivePanel')
    check('funded_panel_shows_leftover' + tag, 'R$ 246,00' in text and 'Sobra' in text and page.inner_text('#deskLeft') == reais(246 - entry - 39) and not page.is_disabled('[data-action="buy"]'))
    # Fuel and the optional R$ 30 windscreen film are chosen right at the desk (away, less fuel fits).
    litres = 12 if entry == 100 else 8
    page.check('#immFilm'); page.locator('#immLitres').fill(str(litres))
    check('fuel_and_film_chosen_at_desk' + tag, page.inner_text('#deskTotal') == reais(entry + litres * 6.5 + 30) and page.inner_text('#deskLeft') == reais(246 - entry - litres * 6.5 - 30))
    frames(10); shot('com_dinheiro')
    page.keyboard.press('Enter')
    check('desk_goes_straight_to_engine_start' + tag, page.evaluate(f"fixtureMode.state.phase==='starting'&&fixtureMode.state.fuel==={litres}&&fixtureMode.state.film&&fixtureMode.state.cash==={246 - entry - litres * 6.5 - 30}"))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    try:
        for circuit in sys.argv[1:] or ['interlagos', 'curvelo', 'cascavel', 'piracicaba', 'chapeco', 'brasilia', 'goiania', 'guaratiba']:
            context = browser.new_context(viewport={'width': 1280, 'height': 800})
            context.add_init_script(f"localStorage.setItem('opala99-preferences-v1',JSON.stringify({{...JSON.parse(localStorage.getItem('opala99-preferences-v1')||'{{}}'),circuit:'{circuit}'}}))")
            page = context.new_page(); page.set_default_timeout(120000)
            page.on('pageerror', lambda e: report['errors'].append(str(e)))
            page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' and 'tracks.json' not in m.text and 'status of 404' not in m.text else None)
            run(page, circuit); context.close()
        check('no_browser_errors', not report['errors']); report['passed'] = True
    finally:
        report.setdefault('passed', False)
        (ROOT / 'dados/validacao_inscricao.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True); browser.close()
