from browser_config import browser_executable, browser_args, wait_js, open_menu, race_options, enter_track
"""Interacao real no Edge e orientacao dos eixos das rodas exportadas."""
import json
import math
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
report = {'errors': [], 'checks': {}, 'views': [], 'steering': []}

def check(name, value):
    report['checks'][name] = bool(value)
    print(name, bool(value), flush=True)
    assert value, name

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=browser_executable(),
        headless=True,
        args=browser_args())
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    # This suite exercises the drag fallback; native capture has its own suite.
    page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
    page.set_default_timeout(60000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda msg: report['errors'].append(msg.text) if msg.type == 'error' else None)
    def frame():
        page.evaluate('() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    def camera():
        return page.evaluate('interlagos.cameraSnapshot()')
    def offset(s):
        return [a-b for a,b in zip(s['position'], s['target'])]
    try:
        # The orbit takes over the high Perseguição distante: zoomed in from there, it still reaches the gantry.
        open_menu(page);race_options(page,camera='far');enter_track(page)
        # The grid starts ~70 m back; the gantry check needs the car on the timing line.
        page.evaluate('interlagos.reposition(0)')
        page.keyboard.down('KeyS')
        # Cada gesto percorre 90 graus com rotateSpeed=.8 e altura=900.
        for i in range(4):
            page.mouse.move(730, 450)
            page.mouse.down()
            page.mouse.move(1011.25, 450, steps=8)
            page.mouse.up()
            frame()
            snap = camera()
            report['views'].append(snap)
            if i in (0, 1):
                page.screenshot(path=str(ROOT/f'renders/orbita_{i+1}.png'))
        check('drag_activates_orbit', page.evaluate("interlagos.state.mode === 'orbit'"))
        bearings = [math.atan2(offset(s)[0], offset(s)[2]) for s in report['views']]
        turns = [abs(math.atan2(math.sin(b-a), math.cos(b-a))) for a,b in zip(bearings,bearings[1:])]
        check('four_quadrants', all(abs(t-math.pi/2)<.035 for t in turns))
        before = camera()
        page.mouse.wheel(0, -600)
        frame()
        after = camera()
        check('scroll_zoom', after['distance'] < before['distance']-.5)
        # Subir a camera ate o teto, sem perder o carro como alvo.
        # (S held reverses the stopped car: on a slow machine it had backed out from under the gantry by now, and went on
        # backing out during the drag. Put back on the line and let go, it stands under the gantry.)
        page.keyboard.up('KeyS'); page.evaluate('interlagos.reposition(0)'); frame()
        page.mouse.move(730,450); page.mouse.down()
        page.mouse.move(730,800,steps=8); page.mouse.up(); frame()
        top = camera()
        check('top_view', offset(top)[1]/top['distance'] > .95)
        # A camera fica abaixo da travessa da largada, sem ocultar o teto.
        check('gantry_does_not_hide_roof',top['distance'] < after['distance']-.1)
        page.screenshot(path=str(ROOT/'renders/orbita_teto.png'))
        # Voltar ao angulo baixo e tentar atravessar o solo.
        page.mouse.move(730,750); page.mouse.down()
        page.mouse.move(730,200,steps=8); page.mouse.up(); frame()
        low = camera()
        check('ground_clearance', low['position'][1] >= low['ground']+.299)
        # Mesmo angulo/distancia apos acompanhar deslocamento e reposicionamento.
        page.click('#orbitButton'); page.click('#orbitButton'); frame()
        before = camera()
        page.keyboard.up('KeyS'); page.keyboard.down('KeyW')
        start_clock = page.evaluate('interlagos.car.clock')
        wait_js(page,'(t)=>interlagos.car.clock > t+1.2', arg=start_clock)
        page.keyboard.up('KeyW'); frame()
        after = camera()
        check('target_follows_moving_car', math.dist(before['target'],after['target'])>1 and
              math.dist(after['target'],[after['car'][0],after['car'][1]+.85,after['car'][2]])<1e-6)
        page.evaluate('interlagos.reposition(180)'); frame()
        reset = camera()
        check('target_follows_reset', math.dist(reset['target'],[reset['car'][0],reset['car'][1]+.85,reset['car'][2]])<1e-6)
        # Verifica as duas teclas contra os eixos reais das rodas nas duas pinturas.
        for livery in ['assinaturas_omp','seiva_danilo']:
            race_options(page,livery=livery);enter_track(page); page.keyboard.down('KeyS')
            for key,sign in [('KeyA',1),('KeyD',-1)]:
                page.keyboard.down(key)
                wait_js(page,'(s)=>interlagos.car.steer*s>.3',arg=sign)
                snap=page.evaluate('({steer:interlagos.car.steer,wheels:interlagos.wheelSnapshot()})')
                page.keyboard.up(key)
                report['steering'].append({'livery':livery,'key':key,**snap})
                check(f'{livery}_{key}_front_direction',all(w['angle']*sign>.29 and abs(w['angle']-snap['steer'])<1e-6 for w in snap['wheels'] if w['front']))
                check(f'{livery}_{key}_rear_straight',all(abs(w['angle'])<1e-6 for w in snap['wheels'] if not w['front']))
            page.keyboard.up('KeyS'); page.keyboard.press('KeyP'); wait_js(page,'interlagos.state.paused')
            for spin in [0,.8,2.4,5.9,-1.7]:
                page.evaluate('(s)=>{interlagos.car.spin=s;interlagos.car.steer=.4}',spin)
                frame()
                ws=page.evaluate('interlagos.wheelSnapshot()')
                check(f'{livery}_spin_{spin}_no_camber_or_yaw_reversal',all(abs(w['axle'][1])<1e-6 and abs(w['angle']-(.4 if w['front'] else 0))<1e-6 for w in ws))
            # P holds the race on screen with no menu (no #resume): P again lets go.
            page.keyboard.press('KeyP');wait_js(page,'!interlagos.state.paused')
        race_options(page,camera='chase');enter_track(page)
        modes=[]
        for _ in range(8):
            page.keyboard.press('KeyC'); modes.append(page.evaluate('interlagos.state.mode'))
        check('camera_cycle',modes==['close','far','hood','cockpit','tv','aerial','orbit','chase'])
        page.click('#orbitButton')
        check('orbit_button',page.evaluate("interlagos.state.mode==='orbit'"))
        check('no_browser_errors',not report['errors'])
        report['passed']=True
    finally:
        report.setdefault('passed',False)
        (ROOT/'dados/validacao_orbita.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps({'passed':report['passed'],'checks':report['checks'],'errors':report['errors']},indent=2),flush=True)
        browser.close()
