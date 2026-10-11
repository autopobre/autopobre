"""Shots of the race under each weather (Horário x Clima), for judging the day, dusk, night and rain looks.

Uso: python scripts/fotografar_clima.py <pasta_saida> [porta] [climas] [circuito]
  climas: lista separada por virgula de horario/chuva, ex. dia/seco,fim_de_tarde/seco,noite/seco,noite/chuva
          (padrao: as tres horas secas e a noite e o dia com chuva).
Grava <pasta_saida>/NN_clima_cena.png e <pasta_saida>_mosaico.jpg (servidor local em execucao; padrao 8799).
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, race_options, enter_track, wait_race_start, wait_js

OUT = Path(sys.argv[1]).resolve()
PORT = sys.argv[2] if len(sys.argv) > 2 else '8799'
WEATHERS = (sys.argv[3] if len(sys.argv) > 3 else 'dia/seco,fim_de_tarde/seco,noite/seco,dia/chuva,noite/chuva').split(',')
CIRCUIT = sys.argv[4] if len(sys.argv) > 4 else 'interlagos'
URL = GAME_URL.replace(':8799', ':' + PORT) + '?circuito=' + CIRCUIT
OUT.mkdir(parents=True, exist_ok=True)
# Scenes: (name, camera mode, car pose or None for the grid as the race starts, light-photo pose or None).
SCENES = [
    ('grid_perseguicao', 'chase', None, None),
    ('grid_cockpit', 'cockpit', None, None),
    ('grid_frente', 'chase', None, {'from': [9, 1.1, 2.2], 'at': [0, .7, 0], 'fov': 40}),
    ('reta_oposta', 'chase', (1150, 0, 0), None),
    ('ferradura_capo', 'hood', (1900, 0, 0), None),
    ('arquibancada', 'chase', (4170, -5.5, -1.35), None),
]
CAMERA = "m=>{const s=document.getElementById('camera');s.value=m;s.dispatchEvent(new Event('change'));}"
WEATHER = """([t,r])=>{for(const [id,v] of [['timeOfDay',t],['rainLevel',r]]){const s=document.getElementById(id);s.value=v;s.dispatchEvent(new Event('change'));}return true;}"""
PLACE = """([s,d,turn])=>{const car=interlagos.car,data=car.data;const a=data.samples,p=a.reduce((b,q)=>Math.abs(q[0]-s)<Math.abs(b[0]-s)?q:b,a[0]);
 const x=p[1]+p[9]*d,y=p[2]+p[10]*d,heading=Math.atan2(p[8],p[7])+turn;
 car.x=x;car.y=y;car.heading=heading;car.vx=car.vy=car.yaw=0;car.index=car.nearest(x,y,true).i;car.surface=car.sample(x,y);car.settle?.();return true;}"""
MOVING = 7
HIDE_UI = 'body *{visibility:hidden!important} #view{visibility:visible!important}'
shots, errors, infos = [], [], {}


def shoot(page, name):
    path = OUT / f'{len(shots):02d}_{name}.png'
    page.screenshot(path=str(path))
    shots.append(path)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args() + ['--use-angle=d3d11'], headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    open_menu(page, URL)
    race_options(page, camera='chase')
    enter_track(page, 'Piloto clima')
    wait_race_start(page)
    page.add_style_tag(content=HIDE_UI)
    # Hold the field where it stands: the grid shots keep the rivals in front of the car.
    page.keyboard.press('KeyP')
    for weather in WEATHERS:
        time, rain = weather.split('/')
        page.evaluate('w=>window.interlagosClima.set(w)', {'time': time, 'rain': rain})
        page.wait_for_timeout(500)
        wait_js(page, '!window.interlagosClima.info().compiling', timeout=90000)
        for name, mode, pose, photo in SCENES:
            page.evaluate(CAMERA, mode)
            if pose:
                page.evaluate('interlagos.reposition(0)')
                page.evaluate(PLACE, list(pose))
                page.evaluate('window.interlagosClima.snap()')
                page.evaluate('window.interlagosClima.snap()')
            else:
                page.evaluate('interlagos.reposition(0)')
            page.evaluate('p=>window.interlagosLuz.photo(p)', photo)
            # The race holds (P): the eye adapts at once to the new view.
            page.wait_for_timeout(250)
            page.evaluate('window.interlagosClima.settle()')
            page.wait_for_timeout(700)
            shoot(page, f'{time}_{rain}_{name}')
        page.evaluate('window.interlagosLuz.photo(null)')
        # On the move: the automatic lap for a few seconds (spray, slanting rain), then held.
        page.evaluate('interlagos.reposition(0)')
        page.evaluate(CAMERA, 'chase')
        page.keyboard.press('KeyP')
        page.keyboard.down('KeyW')
        page.wait_for_timeout(int(MOVING * 1000))
        page.keyboard.press('KeyP')
        page.keyboard.up('KeyW')
        page.wait_for_timeout(400)
        shoot(page, f'{time}_{rain}_andando')
        page.evaluate(CAMERA, 'cockpit')
        page.wait_for_timeout(500)
        shoot(page, f'{time}_{rain}_andando_cockpit')
        infos[weather] = page.evaluate('({luz:window.interlagosLuz.info(),clima:window.interlagosClima?.info?.()??null})')
    browser.close()

from PIL import Image, ImageDraw
tiles = [Image.open(s).convert('RGB').resize((640, 360)) for s in shots]
cols = len(SCENES) + 2
rows = (len(tiles) + cols - 1) // cols
mosaic = Image.new('RGB', (cols * 640, rows * 360), (20, 20, 20))
draw = ImageDraw.Draw(mosaic)
for i, (tile, path) in enumerate(zip(tiles, shots)):
    x, y = (i % cols) * 640, (i // cols) * 360
    mosaic.paste(tile, (x, y))
    draw.text((x + 8, y + 6), path.stem, fill=(255, 255, 0))
mosaic.save(OUT.parent / f'{OUT.name}_mosaico.jpg', quality=86)
print(json.dumps({'shots': len(shots), 'errors': errors[:8], 'info': infos}, ensure_ascii=False)[:3000])
