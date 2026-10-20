"""The selfie on foot (teste/selfie.js): out of the car at Interlagos, Q takes the phone out and the screen becomes its
front camera inside a phone's frame, 9:16 (the race's panels step aside); R lays it down to 16:9 and back; a click on the captured mouse
is the shutter: he smiles and shows the V, the flash, and the photo (a JPEG cut from the frame, drawn sharper, signed
with the pilot's name) goes to the clipboard as a PNG and comes up with its buttons and the mouse let go; Baixar downloads it, Space frames another, Q puts the phone away and the walking
camera comes back. On a touch screen the walking panel's Selfie button, the round shutter, and the photo's buttons.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_selfie.py
Screenshots and the photos: pista_interlagos/renders/selfie_*.png / .jpg
"""
import base64
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, wait_race_start

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', 'http://127.0.0.1:8799/pista_interlagos/teste/')
OUT = ROOT / 'renders'
errors, checks = [], {}
WALK = 'interlagos.walkInfo()'
SELFIE = f'{WALK}.selfie'
PHOTO = """(async()=>{const b=await (await fetch(document.getElementById('selfiePhoto').src)).blob(),a=new Uint8Array(await b.arrayBuffer());let s='';for(const x of a)s+=String.fromCharCode(x);
 const img=document.getElementById('selfiePhoto');return {data:btoa(s),type:b.type,w:img.naturalWidth,h:img.naturalHeight};})()"""


def check(name, value):
    checks[name] = bool(value)
    print(name, bool(value), flush=True)
    assert value, name


def shot(page, name):
    page.screenshot(path=str(OUT / f'selfie_{name}.png'))


def save_photo(page, name):
    photo = page.evaluate(PHOTO)
    (OUT / f'selfie_{name}.jpg').write_bytes(base64.b64decode(photo['data']))
    return photo


# The page's clipboard writes are kept in the page (the real one is the system's: a check never touches it).
CLIPBOARD = """window.__clipboard=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{
 for(const item of items)for(const type of item.types){const blob=await item.getType(type);window.__clipboard.push({type,size:blob.size});}}}});"""


def visible(page, selector):
    return page.evaluate(f"(()=>{{const e=document.querySelector('{selector}');return !!e&&getComputedStyle(e).visibility!=='hidden'&&e.getClientRects().length>0;}})()")


OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 760}, accept_downloads=True)
    context.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,camera:'chase',laps:3}));")
    context.add_init_script(CLIPBOARD)
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    open_menu(page, URL)
    enter_track(page)
    wait_race_start(page)
    page.keyboard.press('KeyF')
    wait_js(page, f'{WALK}.active', timeout=15000)
    page.wait_for_timeout(600)
    check('the walking panel offers the selfie', 'Q: selfie' in page.inner_text('#walkHint'))

    # Q: the phone comes out; the screen is its camera in a phone's frame, the race's panels step aside. (The mouse goes
    # to the middle first: Playwright's first move from the corner would lift the phone all the way.)
    page.mouse.move(640, 380)
    page.keyboard.press('KeyQ')
    wait_js(page, f"{SELFIE}.phase==='frame'", timeout=5000)
    page.wait_for_timeout(400)
    check('the phone frame on screen', page.is_visible('#selfieFrame') and page.evaluate("document.body.classList.contains('selfie-mode')"))
    check('the race panels step aside', not visible(page, '#timing') and not visible(page, '#telemetry') and not visible(page, '#walkHud'))
    rect = page.evaluate(f'{SELFIE}.rect')
    check(f'upright 9:16 frame ({rect["w"]:.0f}x{rect["h"]:.0f})', abs(rect['w'] / rect['h'] - 9 / 16) < .01)
    near = page.evaluate('interlagos.camera?.near??null')
    shot(page, '1_vertical')
    page.keyboard.press('KeyR')
    page.wait_for_timeout(300)
    rect = page.evaluate(f'{SELFIE}.rect')
    check(f'R: lying 16:9 ({rect["w"]:.0f}x{rect["h"]:.0f})', abs(rect['w'] / rect['h'] - 16 / 9) < .01 and page.evaluate("document.getElementById('selfieFrame').classList.contains('horizontal')"))
    shot(page, '2_horizontal')
    page.keyboard.press('KeyR')
    # The mouse turns him, the wheel brings the phone closer.
    page.mouse.move(640, 380)
    page.mouse.move(760, 380, steps=4)
    far = page.evaluate(f'{SELFIE}.distance')
    page.mouse.wheel(0, -300)
    page.mouse.wheel(0, -300)
    page.wait_for_timeout(300)
    check('the wheel brings it closer', page.evaluate(f'{SELFIE}.distance') < far - .02)
    page.mouse.wheel(0, 200)
    page.mouse.wheel(0, 200)
    # Where he stands in the photo: the frame's buttons and 1 2 3; on the right the phone goes to his left hand.
    page.click('#selfieFrame [data-place="1"]')
    page.wait_for_timeout(1200)
    info = page.evaluate(SELFIE)
    check('Direita: his face on the right, the phone in his left hand', info['place'] == 1 and info['hand'] == -1 and info['u'] > .2)
    check('the button shows the choice', page.get_attribute('#selfieFrame [data-place="1"]', 'aria-pressed') == 'true')
    shot(page, '2b_direita')
    page.keyboard.press('Digit1')
    page.wait_for_timeout(1200)
    info = page.evaluate(SELFIE)
    check('1: his face on the left, the phone back in his right hand', info['place'] == -1 and info['hand'] == 1 and info['u'] < -.2)
    shot(page, '2c_esquerda')
    page.keyboard.press('Digit2')
    page.wait_for_timeout(800)
    check('2: the middle again', page.evaluate(SELFIE)['place'] == 0)

    # A click is the shutter: the smile and the V, the flash, then the photo with its buttons and the mouse free.
    page.mouse.click(640, 380)
    page.wait_for_timeout(380)
    info = page.evaluate(SELFIE)
    check('the click: the pose', info['phase'] == 'pose' and info['mouth'] == 'grin' and info['fingers'])
    shot(page, '3_pose')
    wait_js(page, f"{SELFIE}.phase==='review'", timeout=6000)
    page.wait_for_timeout(300)
    check('the photo comes up', page.is_visible('#selfieReview') and page.is_visible('#selfiePhoto'))
    photo = save_photo(page, 'foto_vertical')
    check(f'a sharp 9:16 JPEG ({photo["w"]}x{photo["h"]})', photo['type'] == 'image/jpeg' and photo['h'] >= 1700 and abs(photo['w'] / photo['h'] - 9 / 16) < .01)
    check('the mouse let go to click the buttons', not page.evaluate('document.pointerLockElement'))
    check('no menu over it', not page.evaluate('interlagos.state.paused'))
    copied = page.evaluate('window.__clipboard')
    check(f'the photo went to the clipboard ({copied})', len(copied) == 1 and copied[0]['type'] == 'image/png' and copied[0]['size'] > 100000)
    check('the note says so', 'copiada' in page.inner_text('#selfieNote'))
    shot(page, '4_foto')
    with page.expect_download() as download:
        page.click('#selfieSave')
    check(f'Baixar foto: {download.value.suggested_filename}', download.value.suggested_filename.startswith('autopobre-selfie-') and download.value.suggested_filename.endswith('.jpg'))

    # A click on the photo keeps it; a click off it frames another (Space does too), lying this time; Q puts the phone
    # away and he walks again.
    page.click('#selfiePhoto')
    page.wait_for_timeout(200)
    check('a click on the photo keeps it', page.evaluate(f'{SELFIE}.phase') == 'review')
    page.mouse.click(30, 380)
    wait_js(page, f"{SELFIE}.phase==='frame'", timeout=3000)
    check('a click off the photo: another one', not page.is_visible('#selfieReview'))
    page.keyboard.press('KeyR')
    page.keyboard.press('Space')
    wait_js(page, f"{SELFIE}.phase==='review'", timeout=6000)
    photo = save_photo(page, 'foto_horizontal')
    check(f'a 16:9 photo ({photo["w"]}x{photo["h"]})', abs(photo['w'] / photo['h'] - 16 / 9) < .01 and page.evaluate(f'{SELFIE}.photos') == 2)
    page.keyboard.press('KeyQ')
    wait_js(page, f"{SELFIE}.phase==='off'", timeout=3000)
    page.wait_for_timeout(300)
    check('put away: the walking panel and the race panels again', page.is_visible('#walkHud') and visible(page, '#timing') and not page.is_visible('#selfieHud'))
    start = page.evaluate(f'{WALK}.hero')
    page.keyboard.down('KeyW')
    page.wait_for_timeout(1000)
    page.keyboard.up('KeyW')
    moved = page.evaluate('([x,z])=>{const h=interlagos.walkInfo().hero;return Math.hypot(h[0]-x,h[2]-z);}', [start[0], start[2]])
    check(f'he walks again ({moved:.1f} m)', moved > 1.5)
    shot(page, '5_guardado')
    # Escape with the phone out puts it away, back to the walk, and opens no menu (user, 2026-10-20): framing (the mouse
    # held: Escape only lets it go) and with the photo up (the mouse free: a keydown).
    page.mouse.click(640, 380)
    page.keyboard.press('KeyQ')
    wait_js(page, f"{SELFIE}.phase==='frame'", timeout=5000)
    check('framing with the mouse held', bool(page.evaluate('document.pointerLockElement')))
    page.keyboard.press('Escape')
    wait_js(page, f"{SELFIE}.phase==='off'", timeout=3000)
    page.wait_for_timeout(300)
    check('Escape while framing: the phone away, no menu', not page.evaluate('interlagos.state.paused') and page.is_hidden('#menu') and page.evaluate(f'{WALK}.active'))
    page.keyboard.press('KeyQ')
    wait_js(page, f"{SELFIE}.phase==='frame'", timeout=5000)
    page.keyboard.press('Space')
    wait_js(page, f"{SELFIE}.phase==='review'", timeout=6000)
    page.keyboard.press('Escape')
    wait_js(page, f"{SELFIE}.phase==='off'", timeout=3000)
    page.wait_for_timeout(300)
    check('Escape with the photo up: the phone away, no menu', not page.evaluate('interlagos.state.paused') and page.is_hidden('#menu') and page.is_visible('#walkHud'))
    context.close()

    # Touch screen: the Selfie button, the round shutter, the photo's buttons.
    phone = browser.new_context(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True, device_scale_factor=2)
    phone.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,camera:'chase',laps:3}));")
    phone.add_init_script(CLIPBOARD)
    page = phone.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    open_menu(page, URL)
    enter_track(page, tap=True)
    wait_race_start(page)
    page.tap('#touchExit')
    wait_js(page, f'{WALK}.active', timeout=15000)
    page.wait_for_timeout(500)
    check('touch: Selfie button', page.is_visible('#walkSelfie'))
    page.tap('#walkSelfie')
    wait_js(page, f"{SELFIE}.phase==='frame'", timeout=5000)
    page.wait_for_timeout(300)
    check('touch: the pedals and the steering step aside', not page.is_visible('#touchPedals') and not page.is_visible('#touchSteering') and page.is_visible('#touchMenu'))
    check('touch: − + to bring it closer', page.is_visible('#selfieNear') and page.is_visible('#selfieFar'))
    shot(page, '6_celular_enquadrando')
    page.tap('#selfieShot')
    wait_js(page, f"{SELFIE}.phase==='review'", timeout=6000)
    page.wait_for_timeout(300)
    check('touch: the photo and its buttons', page.is_visible('#selfiePhoto') and page.is_visible('#selfieSave') and page.is_visible('#selfieAgain'))
    check('touch: no keyboard hints on the buttons', '·' not in page.inner_text('#selfieSave'))
    save_photo(page, 'foto_celular')
    shot(page, '7_celular_foto')
    page.tap('#selfieDone')
    wait_js(page, f"{SELFIE}.phase==='off'", timeout=3000)
    check('touch: put away', page.is_visible('#walkCar') or page.is_visible('#walkSelfie'))
    phone.close()
    browser.close()

check('no page errors', not errors)
print('verificar_selfie:', 'ok' if all(checks.values()) else 'FALHOU', errors[:3])
