"""The Xbox / PlayStation controller in a real race, with a fake Gamepad API in the page.

RT/LT reach the car as analog throttle and brake, X and A shift the automatic (a gear held a few
seconds), the left stick steers, RB changes the camera, Y pulls and releases the handbrake, the
right stick orbits the camera, ↓ gets out and on foot Y gets back in, Menu pauses and resumes,
the controls tab names the controller, gives a button to a command (swapping, Menu cancelling,
Restaurar) and the rumble option shakes it. In the story paddock the left stick walks (up/down),
which it never does in the car. Usage:
  verificar_controle.py [port]   (default 8799; INTERLAGOS_URL overrides the whole address)
"""
import json, os, sys
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, wait_race_start, GAME_URL

URL = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace('8799', sys.argv[1]) if len(sys.argv) > 1 else GAME_URL)
FAKE_PAD = """(()=>{
 const pad={connected:false,axes:[0,0,0,0],buttons:Array(17).fill(0),effects:[]};window.fakePad=pad;
 Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>pad.connected?[{id:'Xbox 360 Controller (XInput STANDARD GAMEPAD)',index:0,mapping:'standard',connected:true,timestamp:performance.now(),
  axes:[...pad.axes],buttons:pad.buttons.map(v=>({pressed:v>.5,touched:v>0,value:v})),
  vibrationActuator:{playEffect:(type,params)=>{pad.effects.push({type,...params});return Promise.resolve('complete');}}}]:[]});
})()"""
report = {'errors': [], 'steps': {}}


def step(name, value=True):
    report['steps'][name] = value
    print(name, json.dumps(value), flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    context.add_init_script(FAKE_PAD)
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    status = page.text_content('#padStatus')
    assert 'Nenhum controle' in status, status
    page.evaluate("fakePad.connected=true;dispatchEvent(new Event('gamepadconnected'));true")
    wait_js(page, "document.querySelector('#padStatus').textContent.includes('Xbox 360 Controller')")
    step('settings status', page.text_content('#padStatus'))
    enter_track(page)
    wait_race_start(page)
    # The real car keeps driving; its step only records the command it was given.
    page.evaluate("()=>{const c=interlagos.car,step=c.step.bind(c);c.step=(input,dt)=>{window.lastInput={...input};return step(input,dt);};}")
    pad = lambda js: page.evaluate(f"()=>{{{js}}}")
    speed = "Math.hypot(interlagos.car.vx,interlagos.car.vy)*3.6"
    # RT: analog throttle, the car gets going.
    pad("fakePad.buttons[7]=.6")
    wait_js(page, "window.lastInput&&lastInput.throttle>.5&&lastInput.throttle<.6")
    wait_js(page, f"{speed}>25", timeout=20000)
    step('RT accelerates', page.evaluate(f"({{throttle:lastInput.throttle,kmh:{speed}}})"))
    # X and A with the automatic gearbox: a gear up, held for a few seconds, then one down (coasting).
    pad("fakePad.buttons[7]=0")
    gear = page.evaluate("interlagos.car.gear")
    pad("fakePad.buttons[2]=1")
    wait_js(page, f"interlagos.gamepadInfo().autoHold==={gear + 1}&&interlagos.car.gear==={gear + 1}&&lastInput.gear==={gear + 1}")
    pad("fakePad.buttons[2]=0")
    page.wait_for_timeout(100)
    pad("fakePad.buttons[0]=1")
    wait_js(page, f"interlagos.gamepadInfo().autoHold==={gear}&&interlagos.car.gear==={gear}")
    pad("fakePad.buttons[0]=0")
    wait_js(page, "interlagos.gamepadInfo().autoHold===null&&lastInput.gear===undefined", timeout=8000)
    step('X and A shift the automatic, which then carries on', gear)
    # Left stick, both ways.
    pad("fakePad.buttons[7]=.4;fakePad.axes[0]=-1")
    wait_js(page, "lastInput.left===1&&lastInput.right===0")
    pad("fakePad.axes[0]=.5")
    right = wait_js(page, "lastInput.right>0&&lastInput.left===0&&lastInput.right")
    assert right < .5, right
    step('stick steers', right)
    pad("fakePad.axes[0]=0;fakePad.buttons[7]=0;fakePad.axes[1]=-1")
    page.wait_for_timeout(200)
    assert page.evaluate("lastInput.throttle===0&&lastInput.brake===0"), 'the stick up must not accelerate the car'
    pad("fakePad.axes[1]=0;fakePad.buttons[7]=.4")
    step('stick up does not drive')
    # LT: analog brake slows the car down.
    before = page.evaluate(speed)
    pad("fakePad.buttons[7]=0;fakePad.buttons[6]=1")
    wait_js(page, "lastInput.brake===1&&lastInput.throttle===0")
    wait_js(page, f"{speed}<{before}-10", timeout=10000)
    pad("fakePad.buttons[6]=0")
    step('LT brakes', page.evaluate(speed))
    # RB: next camera. Y: handbrake on, then off.
    mode = page.evaluate("interlagos.state.mode")
    pad("fakePad.buttons[5]=1")
    wait_js(page, f"interlagos.state.mode!=={mode!r}")
    pad("fakePad.buttons[5]=0")
    step('RB camera', [mode, page.evaluate("interlagos.state.mode")])
    pad("fakePad.buttons[3]=1")
    wait_js(page, "lastInput.handbrake===1")
    pad("fakePad.buttons[3]=0")
    page.wait_for_timeout(100)
    pad("fakePad.buttons[3]=1")
    wait_js(page, "lastInput.handbrake===0")
    pad("fakePad.buttons[3]=0")
    step('Y handbrake toggles')
    # Right stick: from a follow camera it orbits round the car (and comes back after 3 s, as the mouse).
    pad("fakePad.axes[2]=1")
    wait_js(page, "interlagos.state.mode==='orbit'")
    pad("fakePad.axes[2]=0")
    step('right stick looks around')
    # ↓ gets out (the car stops first); on foot the buttons are the walk's, and Y gets back in.
    pad("fakePad.buttons[13]=1")
    wait_js(page, "interlagos.walkInfo().active&&interlagos.gamepadInfo().place==='foot'", timeout=20000)
    pad("fakePad.buttons[13]=0")
    page.wait_for_timeout(300)
    pad("fakePad.buttons[3]=1")
    page.wait_for_timeout(150)
    pad("fakePad.buttons[3]=0")
    wait_js(page, "!interlagos.walkInfo().active&&interlagos.gamepadInfo().place==='car'", timeout=20000)
    step('↓ out of the car, Y back in')
    # Menu pauses on the menu, Menu again goes back to the race.
    pad("fakePad.buttons[9]=1")
    wait_js(page, "interlagos.state.paused&&!document.querySelector('#menu').classList.contains('hidden')")
    pad("fakePad.buttons[9]=0")
    page.wait_for_timeout(100)
    pad("fakePad.buttons[9]=1")
    wait_js(page, "!interlagos.state.paused")
    pad("fakePad.buttons[9]=0")
    step('Menu pauses and resumes')
    # Settings: the rumble option previews a shake; Menu with the settings open resumes the race.
    page.keyboard.press('Escape')
    wait_js(page, "interlagos.state.paused")
    page.click('#settingsButton')
    page.click('#tab-controls')
    assert page.is_visible('#padSteering')
    page.select_option('#padSteering', 'direta')
    wait_js(page, "interlagos.gamepadInfo().curve===1")
    page.uncheck('#padRumble')
    assert page.evaluate("fakePad.effects.length") == 0
    page.check('#padRumble')
    wait_js(page, "fakePad.effects.length===1&&fakePad.effects[0].type==='dual-rumble'")
    page.select_option('#padSteering', 'normal')
    # A button for a command: Y given to the horn swaps with the handbrake (LB); Menu while one is awaited gives up
    # and leaves the settings open; Restaurar brings the original buttons back.
    slot = lambda id, n=0: f'#padBindings button[data-id="{id}"][data-slot="{n}"]'
    page.click(slot('buzina'))
    assert 'Aperte' in page.text_content('#padNote'), page.text_content('#padNote')
    pad("fakePad.buttons[3]=1")
    wait_js(page, f"document.querySelector('{slot('buzina')}').textContent==='Y'")
    pad("fakePad.buttons[3]=0")
    assert page.text_content(slot('freioMao')) == 'LB', page.text_content(slot('freioMao'))
    saved = json.loads(page.evaluate("localStorage.getItem('opala99-controle-v1')"))
    assert saved['buttons'] == {'freioMao': [4, None], 'buzina': [3, None]}, saved
    page.click(slot('sair', 1))
    page.wait_for_timeout(100)
    pad("fakePad.buttons[9]=1")
    wait_js(page, "document.querySelector('#padNote').textContent==='Nada mudou.'")
    pad("fakePad.buttons[9]=0")
    page.wait_for_timeout(200)
    assert page.evaluate("document.querySelector('#settings').open"), 'Menu while a button is awaited must not close the settings'
    page.click('#padReset')
    wait_js(page, "localStorage.getItem('opala99-controle-v1')===null")
    assert page.text_content(slot('freioMao')) == 'Y'
    step('settings: Y to the horn swaps with the handbrake, Menu cancels, Restaurar', page.text_content('#padNote'))
    pad("fakePad.buttons[9]=1")
    wait_js(page, "!document.querySelector('#settings').open&&!interlagos.state.paused")
    pad("fakePad.buttons[9]=0")
    step('settings: steering curve, rumble preview, Menu resumes')
    # Unplugged: nothing is held and the race says so.
    pad("fakePad.buttons[1]=1;fakePad.buttons[7]=1")
    wait_js(page, "lastInput.reverse===1&&lastInput.throttle===1")
    pad("fakePad.connected=false")
    wait_js(page, "!interlagos.gamepadInfo().connected&&lastInput.reverse===0&&lastInput.throttle===0")
    wait_js(page, "document.querySelector('#status').textContent==='Controle desconectado'")
    step('unplugged releases everything')
    context.close()
    # Story paddock, on foot: the left stick pushed up walks the pilot.
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    context.add_init_script(FAKE_PAD)
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    page.evaluate("fakePad.connected=true;true")
    enter_track(page, story=True)
    wait_js(page, "interlagos.immersiveInfo().phase==='crowd'")
    hero = "interlagos.immersiveInfo().hero"
    start = page.evaluate(hero)
    page.evaluate("()=>{fakePad.axes[1]=-1}")
    page.wait_for_timeout(1500)
    page.evaluate("()=>{fakePad.axes[1]=0}")
    walked = page.evaluate(f"(s)=>{{const h={hero};return Math.hypot(h[0]-s[0],h[2]-s[2]);}}", start)
    assert walked > 1, walked
    step('stick walks on foot (m)', walked)
    context.close()
    browser.close()

assert not report['errors'], report['errors']
print(json.dumps(report, ensure_ascii=False, indent=1))
