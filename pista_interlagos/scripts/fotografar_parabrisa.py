"""The windscreen in the rain from the Opala's cockpit: the wipers sweeping and the drops gathering behind them.

Uso: python scripts/fotografar_parabrisa.py <pasta_saida> [porta] [clima]   (clima: horario/chuva, padrao dia/chuva)
Grava uma sequencia parada (palhetas) e outra andando, mais <pasta_saida>_mosaico.jpg.
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, race_options, enter_track, wait_race_start, wait_js

OUT = Path(sys.argv[1]).resolve()
PORT = sys.argv[2] if len(sys.argv) > 2 else '8799'
TIME, RAIN = (sys.argv[3] if len(sys.argv) > 3 else 'dia/chuva').split('/')
URL = GAME_URL.replace(':8799', ':' + PORT) + '?circuito=interlagos'
OUT.mkdir(parents=True, exist_ok=True)
shots, errors, infos = [], [], []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args() + ['--use-angle=d3d11'], headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script("""(w=>{try{const k='opala99-preferences-v1',v=JSON.parse(localStorage.getItem(k)||'{}');Object.assign(v,w);localStorage.setItem(k,JSON.stringify(v));}catch(e){}})(%s)""" % json.dumps({'timeOfDay': TIME, 'rain': RAIN}))
    open_menu(page, URL)
    race_options(page, camera='cockpit')
    enter_track(page, 'Piloto chuva')
    wait_race_start(page)
    wait_js(page, '!window.interlagosClima.info().compiling', timeout=90000)
    page.add_style_tag(content='body *{visibility:hidden!important} #view{visibility:visible!important}')
    # Standing on the grid: the blades sweep, the glass fills again behind them.
    for k in range(6):
        page.wait_for_timeout(230)
        path = OUT / f'{len(shots):02d}_parado_{k}.png'; page.screenshot(path=str(path)); shots.append(path)
        infos.append(page.evaluate('window.interlagosClima.info().wipers'))
    # Wipers off for a few seconds: the whole glass beads up.
    page.keyboard.press('KeyJ'); page.wait_for_timeout(4500)
    path = OUT / f'{len(shots):02d}_desligado.png'; page.screenshot(path=str(path)); shots.append(path)
    page.keyboard.press('KeyJ')
    # Driving: the drops creep up the glass.
    page.keyboard.down('KeyW')
    for k in range(4):
        page.wait_for_timeout(1500)
        path = OUT / f'{len(shots):02d}_andando_{k}.png'; page.screenshot(path=str(path)); shots.append(path)
    page.keyboard.up('KeyW')
    infos.append(page.evaluate('window.interlagosClima.info().wipers'))
    browser.close()
from PIL import Image, ImageDraw
tiles = [Image.open(s).convert('RGB').resize((640, 360)) for s in shots]
cols = 4; rows = (len(tiles) + cols - 1) // cols
mosaic = Image.new('RGB', (cols * 640, rows * 360), (20, 20, 20)); draw = ImageDraw.Draw(mosaic)
for i, (tile, path) in enumerate(zip(tiles, shots)):
    x, y = (i % cols) * 640, (i // cols) * 360; mosaic.paste(tile, (x, y)); draw.text((x + 8, y + 6), path.stem, fill=(255, 255, 0))
mosaic.save(OUT.parent / f'{OUT.name}_mosaico.jpg', quality=86)
print(json.dumps({'shots': len(shots), 'errors': errors[:6], 'wipers': [infos[0], infos[-1]]}, ensure_ascii=False)[:2500])
