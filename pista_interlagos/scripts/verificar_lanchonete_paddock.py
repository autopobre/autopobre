"""Story mode: the Tia's café is open in the paddock before the race, as during a pit stop.

A click on the café's sign walks the pilot through Box 99 to her counter, where her menu opens;
1, 2, 3 buy into a free hand (one item per hand), paid from the kitty; E closes the menu and then
drinks or eats what is in hand, sip by sip. Leonardo's coffee goes into a free hand too, and his
offer waits while both hands are busy.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_lanchonete_paddock.py [interlagos curvelo cascavel piracicaba chapeco]
Screens in renders/: lanchonete_placa, lanchonete_cardapio, lanchonete_compra, lanchonete_bebendo,
lanchonete_cafe_do_leo (circuits other than Interlagos get their name appended).
"""
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, GAME_URL
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, sys
ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
report = {'errors': [], 'checks': {}}
INFO = 'interlagos.immersiveInfo()'


def check(name, value):
    report['checks'][name] = bool(value); print(name, bool(value), flush=True); assert value, name


def run(page, circuit):
    tag = '' if circuit == 'interlagos' else '_' + circuit
    def frames(n=2):
        for _ in range(n): page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    def shot(name): frames(); page.screenshot(path=str(ROOT / 'renders' / f'lanchonete_{name}{tag}.png'))
    def info(): return page.evaluate(INFO)
    # The pilot 1.8 m from a local point, on the side toward `toward` (local), facing it; the camera
    # in front of him (face: looking back at him) or behind.
    near = '''([at,toward,face])=>{const v=fixtureMode.visual,o=v.crowd.position,a=new THREE.Vector3(...at),t=new THREE.Vector3(...toward),d=t.sub(a).setY(0).normalize(),p=a.clone().addScaledVector(d,1.8);
     v.hero.position.set(p.x,fixtureMode.walkGround(p.clone().add(o),99)-o.y,p.z);v.foot.floor=v.hero.position.y+o.y;v.foot.lift=v.foot.vz=0;
     v.hero.rotation.y=Math.atan2(d.z,-d.x);v.foot.yaw=v.hero.rotation.y+(face?Math.PI:0);v.foot.pitch=.15;v.foot.distance=2.2;v.followPosition=null;}'''
    open_menu(page, URL)
    enter_track(page, story=True)
    page.evaluate('''async()=>{window.THREE=await import('three');const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();}''')
    wait_js(page, "fixtureMode.state.phase==='crowd'")
    check('circuit_' + circuit, page.evaluate('interlagos.circuit') == circuit)
    check('cafe_in_paddock' + tag, page.evaluate('!!fixtureMode.visual.cafe'))
    # The café's sign shows the way from the start of the paddock; a click on it walks him there.
    page.evaluate('''()=>{const v=fixtureMode.visual,s=v.cafe.sign.position,h=v.hero.position;v.foot.yaw=Math.atan2(-(s.z-h.z),s.x-h.x);v.foot.pitch=.2;}''')
    frames(6); check('cafe_sign_shows' + tag, page.evaluate('fixtureMode.visual.cafe.sign.visible')); shot('placa')
    if page.evaluate('!!document.pointerLockElement'): page.keyboard.press('Tab')
    xy = page.evaluate('''()=>{const v=fixtureMode.visual,p=v.cafe.sign.getWorldPosition(new THREE.Vector3()).project(fixtureMode.camera),r=document.querySelector('#view').getBoundingClientRect();return [r.left+(p.x+1)/2*r.width,r.top+(1-p.y)/2*r.height];}''')
    page.mouse.click(*xy)
    check('click_on_sign_walks_to_cafe' + tag, page.evaluate('!!fixtureMode.walkToCafe'))
    wait_js(page, 'fixtureMode.state.cafe', timeout=60000)
    check('menu_opens_at_counter' + tag, info()['nearCafe'] and page.is_visible('#immersivePanel.social-dialogue') and 'Cardápio da Tia' in page.inner_text('#immersivePanel'))
    text = page.inner_text('#immersivePanel')
    check('menu_lists_snacks_and_prices' + tag, all(s in text for s in ['Café · R$ 4,00', 'Pão de queijo · R$ 6,00', 'Doce de leite · R$ 5,00', 'Na carteira: R$ ']) and 'vaquinha' not in text)
    check('empty_kitty_buys_nothing' + tag, all(page.is_disabled(f'[data-action="snack:{i}"]') for i in ['cafe', 'pao', 'doce']))
    page.keyboard.press('Digit1'); check('key_without_money_buys_nothing' + tag, info()['snacks'] == [])
    shot('cardapio')
    # E goes back to the paddock; with the kitty funded, E at the counter opens the menu again.
    page.keyboard.press('KeyE'); check('e_closes_menu' + tag, not page.evaluate('fixtureMode.state.cafe'))
    page.evaluate('''async()=>{const {FANS,JOKES}=await import('./immersive-state.js');const s=fixtureMode.state;for(let i=0;i<FANS.length;i++){s.fan=null;s.talk(i);s.joke(JOKES.findIndex(j=>j.topic===FANS[i].taste));}s.fan=null;s.touch();}''')
    cash = info()['wallet']  # one wallet (2026-10-24): the gifts are in it
    page.keyboard.press('KeyE'); wait_js(page, 'fixtureMode.state.cafe')
    # 1, 2, 3 buy into the free hands: coffee and pão de queijo; the doce waits for a free hand.
    page.keyboard.press('Digit1'); page.keyboard.press('Digit2'); page.keyboard.press('Digit3')
    now = info()
    check('one_item_per_hand' + tag, now['snacks'] == [['cafe', 3], ['pao', 2]])
    check('paid_from_kitty' + tag, abs(now['wallet'] - (cash - 10)) < 1e-6)
    check('full_hands_buy_nothing_more' + tag, all(page.is_disabled(f'[data-action="snack:{i}"]') for i in ['cafe', 'pao', 'doce']) and 'na mão: Café (3 goles) + Pão de queijo (2 mordidas)' in page.inner_text('#immersivePanel'))
    frames(20); shot('compra')
    # E closes the menu, then E drinks: one sip, the cup at the mouth.
    page.keyboard.press('KeyE'); check('menu_closed_with_snacks_in_hand' + tag, not page.evaluate('fixtureMode.state.cafe') and page.is_visible('[data-action="eat"]'))
    page.evaluate(near, [page.evaluate('fixtureMode.visual.cafe.seat.toArray()'), page.evaluate('fixtureMode.visual.cafe.route[3].toArray()'), True])
    frames(6)
    check('e_at_counter_with_snacks_drinks' + tag, page.evaluate('fixtureMode.actionKey()') == 'eat')
    page.keyboard.press('KeyE'); wait_js(page, f'{INFO}.eating'); page.wait_for_timeout(500); shot('bebendo')
    wait_js(page, f'!{INFO}.eating')
    check('a_sip_at_a_time' + tag, info()['snacks'] == [['cafe', 2], ['pao', 2]])
    check('cup_and_bread_in_the_hands' + tag, page.evaluate('''()=>[1,-1].map(side=>{const h=fixtureMode.snackHands[side];return h.holder.visible&&Object.entries(h.items).filter(([,m])=>m.visible).map(([id])=>id).join();}).join()''') == 'cafe,pao')
    # Leonardo's offer waits while both hands are busy; with one free his cup goes into it.
    leo = page.evaluate('fixtureMode.visual.leo.pos.toArray()')
    page.evaluate(near, [leo, page.evaluate('fixtureMode.visual.heroStart.toArray()'), False])
    wait_js(page, "fixtureMode.state.leo==='ask'")
    check('leo_waits_for_a_free_hand' + tag, page.is_disabled('[data-action="leo:yes"]'))
    page.keyboard.press('Digit1'); check('key_one_waits_too' + tag, page.evaluate("fixtureMode.state.leo==='ask'&&!fixtureMode.state.coffee"))
    page.keyboard.press('KeyE'); page.keyboard.press('KeyE')
    check('leo_declined_and_closed' + tag, page.evaluate('fixtureMode.state.leo===null&&!fixtureMode.state.coffee'))
    page.evaluate('()=>{fixtureMode.cafe.held.splice(1);fixtureMode.state.touch();}')
    page.keyboard.press('KeyE'); wait_js(page, "fixtureMode.state.leo==='ask'")
    page.keyboard.press('Digit1')
    check('leo_coffee_in_the_free_hand' + tag, page.evaluate('fixtureMode.state.coffee') and info()['snacks'] == [['cafe', 2], ['cafe', 3]])
    page.keyboard.press('KeyE'); frames(10); shot('cafe_do_leo')
    # The way to the counter from out in the lane, in front of the café's wall: round by Box 99's door
    # (never straight at the route point nearest through the wall); from inside the café, on from there.
    way = page.evaluate('''()=>{const v=fixtureMode.visual,o=v.crowd.position,L=v.lane,r=v.cafe.route,door=L.lane(r[0]),seat=L.lane(v.cafe.seat);
     const viaDoor=route=>route.length>=r.length&&r.slice(1).every((q,i)=>q.distanceTo(route[route.length-r.length+1+i])<1e-6);
     const p=L.point(seat.x,door.d-1);v.hero.position.set(p.x,fixtureMode.walkGround(p.clone().add(o),99)-o.y,p.z);const outside=v.cafeRoute();
     v.hero.position.copy(r.at(-2));const inside=v.cafeRoute();return {outside:viaDoor(outside),inside:inside.length<=2};}''')
    check('cafe_route_from_outside_goes_by_the_door' + tag, way['outside'])
    check('cafe_route_from_inside_goes_on' + tag, way['inside'])


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    try:
        for circuit in sys.argv[1:] or ['interlagos', 'curvelo']:
            context = browser.new_context(viewport={'width': 1280, 'height': 800})
            context.add_init_script(f"if(!sessionStorage.getItem('seeded')){{sessionStorage.setItem('seeded','1');localStorage.setItem('opala99-immersive-v1','{{}}');localStorage.setItem('opala99-preferences-v1',JSON.stringify({{...JSON.parse(localStorage.getItem('opala99-preferences-v1')||'{{}}'),circuit:'{circuit}'}}));}}")
            page = context.new_page(); page.set_default_timeout(120000)
            page.on('pageerror', lambda e: report['errors'].append(str(e)))
            page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' and 'tracks.json' not in m.text and 'status of 404' not in m.text else None)
            run(page, circuit); context.close()
        check('no_browser_errors', not report['errors']); report['passed'] = True
    finally:
        report.setdefault('passed', False)
        (ROOT / 'dados/validacao_lanchonete_paddock.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True); browser.close()
