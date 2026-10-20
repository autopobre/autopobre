"""Out of the car anywhere (teste/free-walk.js): F in a race at Interlagos brakes the Opala to a stop and the pilot gets
out by the driver's door; on foot W walks, Shift runs, the mouse turns the camera; Escape opens the menu and the race comes
back with him still on foot; E by the passenger's door opens it and it stays open (he gets in and drives off with it
open); F near the car walks him to the door and in, and the camera he chose comes back. On a touch
screen the toolbar's 'Sair do carro' does the same and the pads walk.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_a_pe.py
Screenshots: pista_interlagos/renders/a_pe_*.png
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, wait_race_start, pause_race

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', 'http://127.0.0.1:8799/pista_interlagos/teste/')
OUT = ROOT / 'renders'
errors, checks = [], {}
WALK = 'interlagos.walkInfo()'
SPEED = 'Math.hypot(interlagos.car.vx,interlagos.car.vy)'


def check(name, value):
    checks[name] = bool(value)
    print(name, bool(value), flush=True)
    assert value, name


def shot(page, name):
    page.screenshot(path=str(OUT / f'a_pe_{name}.png'))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 760})
    context.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,camera:'cockpit',laps:3}));")
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    open_menu(page, URL)
    enter_track(page)
    wait_race_start(page)
    check('starts in the cockpit view', page.evaluate('interlagos.state.mode') == 'cockpit')

    # F at speed: the car brakes to a stop, then he is out by the driver's door.
    page.keyboard.down('KeyW')
    page.wait_for_timeout(4000)
    fast = page.evaluate(SPEED)
    page.keyboard.press('KeyF')
    check('F asks to stop', page.evaluate(WALK)['stopping'])
    page.keyboard.up('KeyW')
    page.wait_for_timeout(300)
    check(f'the throttle is shut while it brakes ({fast:.1f} m/s)', page.evaluate(SPEED) < fast)
    wait_js(page, f'{WALK}.active', timeout=15000)
    info = page.evaluate(WALK)
    check('stopped before getting out', page.evaluate(SPEED) < 1)
    check(f'out by the driver door ({info["door"]:.2f} m)', info['door'] < 1)
    check('third-person camera (chase under it)', page.evaluate('interlagos.state.mode') == 'chase')
    check('walking panel shown', page.is_visible('#walkHud') and page.evaluate("document.body.classList.contains('free-walking')"))
    page.wait_for_timeout(700)
    shot(page, '1_fora_do_carro')

    # W walks along the camera, Shift runs; the race goes on around him.
    start = info['hero']
    page.keyboard.down('KeyW')
    page.wait_for_timeout(1500)
    page.keyboard.up('KeyW')
    moved = page.evaluate('([x,z])=>{const h=interlagos.walkInfo().hero;return Math.hypot(h[0]-x,h[2]-z);}', [start[0], start[2]])
    check(f'walks ({moved:.1f} m in 1.5 s)', 2.5 < moved < 6)
    page.keyboard.down('ShiftLeft')
    page.keyboard.down('KeyD')
    page.wait_for_timeout(800)
    page.keyboard.up('KeyD')
    page.keyboard.up('ShiftLeft')
    page.mouse.move(640, 380)
    page.mouse.move(900, 380, steps=6)
    page.wait_for_timeout(500)
    shot(page, '2_andando')
    check('the car waits where it stopped', page.evaluate(SPEED) < .3)

    # Escape opens the menu; back on the track he is still on foot.
    pause_race(page)
    check('menu over the walk', page.evaluate('interlagos.state.paused'))
    enter_track(page)
    check('still on foot after the menu', page.evaluate(WALK)['active'])

    # By the passenger's door E opens it (user, 2026-10-20); it stays open after he gets in, on the move too.
    page.evaluate("()=>{const w=interlagos.walker(),p=w.carPoint(.15,-1.35);w.hero.position.copy(p);w.foot.floor=p.y;w.foot.yaw=interlagos.car.heading+Math.PI;}")
    page.wait_for_timeout(300)
    check('by the passenger door', page.evaluate(WALK)['spot'] == 'porta_carona')
    check('the panel offers to open it', 'porta do carona' in page.inner_text('#walkAction') and 'Abrir' in page.inner_text('#walkAction'))
    page.keyboard.press('KeyE')
    page.wait_for_timeout(1200)
    passenger = "(()=>{const d=interlagos.openingsInfo().Porta_Passageiro_DOBRADICA;return d&&d.reasons.includes('manual')&&d.open>.99})()"
    check('E opens the passenger door', page.evaluate(passenger))
    check('the panel offers to shut it', 'Fechar' in page.inner_text('#walkAction'))
    shot(page, '2b_porta_do_carona')

    # F near the car: he walks to the door and gets in; the chosen camera comes back and the car drives again.
    info = page.evaluate(WALK)
    check(f'near the car ({info["car"]:.1f} m)', info['car'] < 6)
    page.keyboard.press('KeyF')
    wait_js(page, f'!{WALK}.active', timeout=6000)
    check('back in the car', not page.evaluate(WALK)['active'])
    check('the cockpit view again', page.evaluate('interlagos.state.mode') == 'cockpit')
    check('walking panel gone', not page.is_visible('#walkHud'))
    page.keyboard.down('KeyW')
    page.wait_for_timeout(2000)
    page.keyboard.up('KeyW')
    check(f'drives off again ({page.evaluate(SPEED):.1f} m/s)', page.evaluate(SPEED) > 5)
    check('the passenger door still open on the move, the driver door shut', page.evaluate(passenger) and page.evaluate("interlagos.openingsInfo().Porta_Motorista_DOBRADICA.open")==0)
    shot(page, '3_de_volta')

    # F rolling into Box 99: the stop is the pit's; once it opens he walks out to the Tia's café (pitstop.js).
    page.evaluate("""()=>{const car=interlagos.car,P=car.data.pit,c=Object.fromEntries(P.columns.map((k,i)=>[k,i])),b=P.box99;
     const p=P.samples.reduce((a,q)=>Math.abs(q[c.s]-b.s)<Math.abs(a[c.s]-b.s)?q:a,P.samples[0]),d=(p[c.fast_hi]+p[c.lane_hi])/2,h=Math.atan2(p[c.ty],p[c.tx])+(P.reversed?Math.PI:0);
     car.x=p[c.x]+p[c.lx]*d+p[c.tx]*(b.s-p[c.s]);car.y=p[c.y]+p[c.ly]*d+p[c.ty]*(b.s-p[c.s]);car.heading=h;car.vx=Math.cos(h)*1.5;car.vy=Math.sin(h)*1.5;car.yaw=0;
     car.index=car.nearest(car.x,car.y,true).i;car.surface=car.sample(car.x,car.y);car.settle?.();return true;}""")
    page.keyboard.press('KeyF')
    try:
        wait_js(page, 'interlagos.pitInfo()?.walking', timeout=15000)
    except TimeoutError:
        print(page.evaluate("({walk:interlagos.walkInfo(),pit:interlagos.pitInfo().opened,v:Math.hypot(interlagos.car.vx,interlagos.car.vy),pitS:interlagos.car.surface.pitS,pitD:interlagos.car.surface.pitD,state:interlagos.state.paused})"))
        shot(page, 'erro_box')
        raise
    check('F in the box: the pit stop opens and he walks to the café', page.evaluate('interlagos.pitInfo().walking'))
    check('F in the box: not the free walk', not page.evaluate(WALK)['active'] and not page.evaluate(WALK)['stopping'])
    page.keyboard.press('KeyF')
    wait_js(page, '!interlagos.pitInfo().opened', timeout=6000)
    check('F at the box gets back in and out of the stop', not page.evaluate('interlagos.pitInfo().opened'))
    context.close()

    # Touch screen: 'Sair do carro' in the toolbar, the pads walk, the panel's button gets back in.
    phone = browser.new_context(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True, device_scale_factor=2)
    phone.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,camera:'chase',laps:3}));")
    page = phone.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    open_menu(page, URL)
    enter_track(page, tap=True)
    wait_race_start(page)
    check('touch: exit button shown', page.is_visible('#touchExit'))
    page.tap('#touchExit')
    wait_js(page, f'{WALK}.active', timeout=15000)
    check('touch: out of the car', page.evaluate(WALK)['active'])
    check('touch: pads say ANDAR', page.inner_text('#touchGasLabel') == 'ANDAR')
    check('touch: toolbar keeps only the menu', not page.is_visible('#touchCamera') and page.is_visible('#touchMenu'))
    page.wait_for_timeout(600)
    shot(page, '4_celular')
    page.tap('#walkCar')
    wait_js(page, f'!{WALK}.active', timeout=6000)
    check('touch: back in the car', not page.evaluate(WALK)['active'])
    phone.close()
    browser.close()

check('no page errors', not errors)
print('verificar_a_pe:', 'ok' if all(checks.values()) else 'FALHOU', errors[:3])
