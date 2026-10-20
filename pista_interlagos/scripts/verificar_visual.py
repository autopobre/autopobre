"""The Visual screen (teste/look-select.js, pilot-look.js): from the car screen (Visual, after the Opala and Fusca tabs;
none on the opening) the pilot picks the suit's colour, man or woman, the gloves, the hair and the helmet; each pick
shows at once on the pilot in the studio and is kept for that pilot in this browser; Escape and Pronto go back to the
car screen. In a Modo Corrida race the driver at the wheel wears it (suit, gloves, helmet) and so does the pilot out of the car (F); in Modo
História he is Stevan, as always; Voltar ao visual do Stevan forgets the look.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_visual.py
Screenshots: a temporary folder (printed), or the folder given in VISUAL_SHOTS.
"""
import json
import os
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, open_menu, choose_race, wait_race_start, pause_race

URL = os.environ.get('INTERLAGOS_URL', 'http://127.0.0.1:8799/pista_interlagos/teste/')
OUT = Path(os.environ.get('VISUAL_SHOTS') or tempfile.mkdtemp(prefix='visual_'))
OUT.mkdir(parents=True, exist_ok=True)
errors, checks = [], {}
INFO = 'interlagosVisual.info()'
PICKS = {'gender': 'mulher', 'suit': 'azul', 'gloves': 'branca', 'hair': 'rabo', 'hairColor': 'loiro',
         'helmet': 'listra', 'helmetColor': 'branco', 'helmetDetail': 'vermelho', 'visor': 'dourada'}
# pilot-look.js colours of those picks.
BLUE, WHITE_GLOVES, WHITE_HELMET, RED_DETAIL, GOLD_VISOR = 0x1f4fae, 0xe9e7e0, 0xeceae4, 0xd41132, 0xb9832b


def check(name, value):
    checks[name] = bool(value)
    print(name, bool(value), flush=True)
    assert value, name


def shot(page, name):
    page.screenshot(path=str(OUT / f'visual_{name}.png'))


def pick(page, field, value):
    # A real click on the swatch or the button (the radio under it is hidden).
    page.click(f'#visualPanel input[name="look-{field}"][value="{value}"] + span')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1440, 'height': 860})
    context.add_init_script("if(!sessionStorage.getItem('visual-seeded')){sessionStorage.setItem('visual-seeded','1');localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,camera:'cockpit',laps:3}));}")
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    open_menu(page, URL)

    # The way in: the car screen's Visual, after its Opala and Fusca tabs; none on the opening.
    check('no Visual button on the opening', page.locator('#menu').get_by_text('Visual', exact=True).count() == 0)
    page.fill('#pilotName', 'Pilota Visual')
    page.click('#start')
    wait_js(page, "!document.querySelector('#cars').classList.contains('hidden')")
    tabs = page.evaluate("[...document.querySelector('.car-models-row').querySelectorAll('button')].map(b=>b.id||b.dataset.model)")
    check(f'the car screen: Opala, Fusca, then Visual ({tabs})', tabs == ['opala', 'fusca', 'carsVisual'] and page.is_visible('#carsVisual'))
    page.click('#carsVisual')
    wait_js(page, f'{INFO}.live', timeout=60000)
    info = page.evaluate(INFO)
    check('the Visual screen shows, the race HUD hidden', page.is_visible('#visual') and not page.is_visible('#menu') and page.evaluate("document.body.classList.contains('visual-open')"))
    check('no look yet: Stevan, helmet visor up', info['look'] is None and info['helmet']['visor'] == 'raised' and page.is_disabled('#visualDefault'))
    check('the pilot holds the helmet, head bare', not info['helmetOn'] and info['headShown'])
    page.wait_for_timeout(1500)
    check('Girar off by default: the pilot faces the camera', not page.is_checked('#visualSpin') and abs(page.evaluate(f'{INFO}.yaw')) < .05)
    shot(page, '01_stevan')
    page.click('#visualSpin')
    yaw = page.evaluate(f'{INFO}.yaw')
    page.wait_for_timeout(1200)
    check('Girar ticked: he turns round', page.evaluate(f'{INFO}.spin') and page.evaluate(f'{INFO}.yaw') > yaw + .2)
    page.click('#visualSpin')
    page.wait_for_timeout(2500)
    check('Girar off again: back to the front, and kept', abs(page.evaluate(f'{INFO}.yaw') % 6.2832) < .05 or abs(page.evaluate(f'{INFO}.yaw') % 6.2832 - 6.2832) < .05)
    check('Girar kept in this browser', page.evaluate("localStorage.getItem('autopobre-visual-girar')") == '0')
    # The wheel zooms in towards the pointer and back out; a double click frames the pilot again.
    box = page.locator('#visualStage').bounding_box()
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] * .3)
    page.mouse.wheel(0, -500)
    page.wait_for_timeout(700)
    zoom = page.evaluate(f'{INFO}.zoom')
    check(f'the wheel zooms in ({zoom:.2f}x)', zoom > 1.5)
    shot(page, '01b_zoom')
    page.mouse.wheel(0, 300)
    page.wait_for_timeout(300)
    check('and back out', 1 <= page.evaluate(f'{INFO}.zoom') < zoom)
    page.mouse.dblclick(box['x'] + box['width'] / 2, box['y'] + box['height'] * .6)
    page.wait_for_timeout(300)
    check('a double click frames the pilot again', page.evaluate(f'{INFO}.zoom') == 1)

    for field, value in PICKS.items():
        pick(page, field, value)
    page.wait_for_timeout(600)
    info = page.evaluate(INFO)
    check('every pick kept for the pilot', all(info['look'][k] == v for k, v in PICKS.items()) and info['look']['beard'] == 'sem')
    out = info['outfit']
    check('on the turntable: blue suit, white gloves, blond ponytail, a woman',
          out['top'] == BLUE and out['hands'] == WHITE_GLOVES and out['hairStyle'] == 'ponytail' and out['figure'] == 'f' and out['hat'] is None)
    h = info['helmet']
    check('the helmet: white, red stripe, gold visor shut',
          h['design'] == 'listra' and h['paint'] == WHITE_HELMET and h['detail'] == RED_DETAIL and h['visorTint'] == GOLD_VISOR and h['visor'] == 'shut')
    check('picking in the helmet puts it on (camera on it)', info['focus'] == 'capacete' and info['helmetOn'] and not info['headShown'])
    check('a woman: no beard row', page.is_hidden('#visualPanel [data-field="beard"]'))
    shot(page, '02_capacete')
    page.click('#visualPanel input[name="look-hair"][value="rabo"] + span')
    page.wait_for_timeout(400)
    info = page.evaluate(INFO)
    check('picking in the hair: camera on the head, helmet back in the hand', info['focus'] == 'cabeca' and not info['helmetOn'] and info['headShown'])
    page.evaluate("interlagosVisual.view('corpo',3.14)")
    page.wait_for_timeout(1500)
    shot(page, '03_costas')
    page.evaluate("interlagosVisual.view('corpo')")
    pick(page, 'hair', 'careca')
    check('bald: no hair colour row', page.is_hidden('#visualPanel [data-field="hairColor"]'))
    pick(page, 'hair', 'rabo')
    check('the look reads Seu visual', 'Seu visual' in page.inner_text('#visualState') and not page.is_disabled('#visualDefault'))

    # Escape back to the car screen; Visual again keeps the look, and Pronto goes back too.
    page.keyboard.press('Escape')
    wait_js(page, "interlagosVisual.info().screen==='cars'")
    check('Escape: back to the car screen', page.is_visible('#carsNext') and page.is_visible('#carsVisual'))
    page.click('#carsVisual')
    wait_js(page, f"{INFO}.screen==='visual'&&{INFO}.live")
    check('Visual again: the same look', page.evaluate(f'{INFO}.look.suit') == 'azul' and page.evaluate(f'{INFO}.from') == 'cars')
    page.click('#visualDone')
    wait_js(page, "!document.querySelector('#cars').classList.contains('hidden')")
    check('Pronto: back to the car screen', page.is_visible('#carsNext'))

    # A Modo Corrida race: the driver wears it, at the wheel and on foot.
    choose_race(page)
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused')
    wait_race_start(page)
    d = page.evaluate('interlagos.driverInfo()')
    check('Modo Corrida: the driver in the blue suit and white gloves', d['look'] and d['suitColor'] == BLUE and d['gloves'] == WHITE_GLOVES)
    check('Modo Corrida: the helmet white, gold visor shut', d['helmet']['visor'] == 'shut' and d['helmet']['paint'] == WHITE_HELMET and d['helmet']['visorTint'] == GOLD_VISOR)
    # The suit's cloth at the wheel: its quilting a pale grey under the colour (it once came out black: user, 2026-10-20).
    cloth = page.evaluate('''c=>{const root=interlagos.walker().scene.getObjectByName('Heroi_99_pilotando'),out=[];root.traverse(o=>{for(const m of [].concat(o.isMesh?o.material:[]))
      if(m.color?.getHex()===c&&m.map?.image?.width&&!out.includes(m)){const img=m.map.image,x=document.createElement('canvas');x.width=img.width;x.height=img.height;const g=x.getContext('2d');g.drawImage(img,0,0);
      const px=g.getImageData(0,0,x.width,x.height).data;let r=0;for(let i=0;i<px.length;i+=4)r+=px[i];m.mean=r/(px.length/4);out.push(m);}});return out.map(m=>Math.round(m.mean));}''', BLUE)
    check(f"Modo Corrida: the suit's cloth not dark ({cloth})", len(cloth) >= 2 and min(cloth) > 200)
    page.wait_for_timeout(1200)
    shot(page, '04_cockpit')
    # From outside (the chase camera and the orbit): the helmet through the windows.
    for key, name in (('Digit1', '04b_perseguicao'), ('Digit8', '04c_orbita')):
        page.keyboard.press(key)
        page.wait_for_timeout(1500)
        shot(page, name)
    page.keyboard.press('KeyF')
    wait_js(page, 'interlagos.walkInfo().active', timeout=20000)
    page.wait_for_timeout(1500)
    o = page.evaluate('JSON.parse(JSON.stringify(interlagos.walker().hero.userData.outfit))')
    check('on foot: the same suit, gloves and hair, no cap', o['top'] == BLUE and o['hands'] == WHITE_GLOVES and o['hairStyle'] == 'ponytail' and o['figure'] == 'f' and not o.get('hat'))
    check('on foot in the team Opala 99: the 99 on the back', o['back'] is True)
    shot(page, '05_a_pe')

    # Modo História: Stevan's look, whatever was picked.
    pause_race(page)
    page.click('#leaveRace')
    wait_js(page, "!document.querySelector('#tracks').classList.contains('hidden')")
    page.click('#tracksBack')
    if page.is_visible('#carsBack'):
        page.click('#carsBack')
    choose_race(page, story=True)
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused', timeout=120000)
    page.evaluate('window.interlagosHistoria.skipCards()')
    page.wait_for_timeout(1500)
    d = page.evaluate('interlagos.driverInfo()')
    check('Modo História: Stevan at the wheel (red photo suit, visor up)', d['look'] is None and d['helmet']['visor'] == 'raised' and d['helmet']['look'] is None)
    check('Modo História: the look is still saved for the pilot', page.evaluate("interlagosVisual.info().look?.suit") == 'azul' and page.evaluate("interlagosVisual.info().racing") is None)

    # Back to Stevan's look from the screen.
    pause_race(page)
    page.click('#leaveRace')
    wait_js(page, "!document.querySelector('#tracks').classList.contains('hidden')")
    check('Modo História: no car screen, no Visual on the way', page.evaluate("interlagosVisual.info().screen") == 'tracks' and page.is_hidden('#carsVisual'))
    page.click('#tracksBack')
    page.click('#start')
    wait_js(page, "!document.querySelector('#cars').classList.contains('hidden')")
    page.click('#carsVisual')
    wait_js(page, f"{INFO}.screen==='visual'")
    page.click('#visualDefault')
    page.wait_for_timeout(300)
    info = page.evaluate(INFO)
    check('Voltar ao visual do Stevan: no look kept', info['look'] is None and page.evaluate('interlagosVisual.saved()') == [] and page.is_disabled('#visualDefault'))
    wait_js(page, f"{INFO}.shown===''")
    check('the turntable shows Stevan again', page.evaluate(f'{INFO}.helmet.visor') == 'raised')

    browser.close()

check('no page errors', not errors)
print(json.dumps({'checks': checks, 'errors': errors, 'shots': str(OUT)}, ensure_ascii=False, indent=1))
