"""Browser check of the weather (weather.js): the Horário and Clima selects in the race settings and on the track
screen, the night with the headlights (H, the cockpit's FAROL switch, the rivals' lamps), the rain (drops, wet road,
everyone's grip) and the way back to the clear day; the story starts with the lamps off.

Uso: python scripts/verificar_clima.py [porta]   (servidor local em execucao; padrao 8799; honra INTERLAGOS_URL)
"""
import json
import os
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, race_options, enter_track, wait_race_start, wait_js

PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = os.environ.get('INTERLAGOS_URL') or GAME_URL.replace(':8799', ':' + PORT)
SHOTS = Path(tempfile.gettempdir()) / 'verificar_clima'
SHOTS.mkdir(exist_ok=True)
results, errors = {}, []


def check(name, ok, detail=None):
    results[name] = bool(ok)
    if not ok:
        print('FALHOU', name, json.dumps(detail, ensure_ascii=False)[:600])


def choose(page, select, value):
    page.evaluate('([id,v])=>{const s=document.getElementById(id);s.value=v;s.dispatchEvent(new Event("change"));return true;}', [select, value])


def info(page):
    return page.evaluate('window.interlagosClima.info()')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args() + ['--use-angle=d3d11'], headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append(str(e)))
    open_menu(page, URL + ('&' if '?' in URL else '?') + 'circuito=interlagos')
    # The selects: three choices each, day and dry by default, the two places kept in step.
    options = page.evaluate('''(()=>Object.fromEntries(['timeOfDay','rainLevel','tracksTime','tracksRain'].map(id=>{const s=document.getElementById(id);return [id,s?{value:s.value,options:[...s.options].map(o=>o.value)}:null];})))()''')
    check('selects_in_settings_and_track_screen', all(options.values()) and options['timeOfDay']['options'] == ['dia', 'fim_de_tarde', 'noite'] and options['rainLevel']['options'] == ['seco', 'garoa', 'chuva'], options)
    check('day_and_dry_by_default', options['timeOfDay']['value'] == 'dia' and options['rainLevel']['value'] == 'seco', options)
    choose(page, 'timeOfDay', 'noite')
    synced = page.evaluate('({tracks:document.getElementById("tracksTime").value,saved:JSON.parse(localStorage.getItem("opala99-preferences-v1")).timeOfDay})')
    check('night_saved_and_mirrored', synced == {'tracks': 'noite', 'saved': 'noite'}, synced)
    race_options(page, camera='chase')
    enter_track(page, 'Piloto clima')
    wait_race_start(page)
    wait_js(page, '!window.interlagosClima.info().compiling', timeout=90000)
    page.wait_for_timeout(800)
    night = info(page)
    check('night_sky_and_moon', night['time'] == 'noite' and night['sky']['stars'] > 0 and night['sun']['intensity'] < 1, night)
    check('headlights_on_at_the_start', night['lamps']['installed'] and night['lamps']['lit'] and night['lamps']['intensity'] > 0 and night['glow'], night['lamps'])
    check('rivals_and_road_lit', night['rivalGlow'] and night['tail'] and night['roadLamps'] > 0, night)
    check('pit_wall_floodlights_on', night['floods'] and night['floods']['masts'] > 20 and night['floods']['level'] == 1, night['floods'])
    pivots = night['wipers']['pivots'] or []
    check('wipers_cut_out_on_pivots', len(pivots) == 2 and all(p['tris'] > 500 for p in pivots), pivots)
    page.add_style_tag(content='body *{visibility:hidden!important} #view{visibility:visible!important}')
    page.screenshot(path=str(SHOTS / 'noite_farois.png'))
    # H: off, and the cockpit's FAROL switch flips; H again: on.
    switch_on = night['farol']
    page.keyboard.press('KeyH')
    page.wait_for_timeout(400)
    off = info(page)
    check('h_switches_them_off', not off['lamps']['lit'] and off['lamps']['intensity'] == 0 and not off['glow'], off['lamps'])
    check('farol_switch_follows', switch_on is not None and off['farol'] is not None and abs(off['farol'] - switch_on) > .5, [switch_on, off['farol']])
    page.keyboard.press('KeyH')
    page.wait_for_timeout(400)
    check('h_switches_them_on', info(page)['lamps']['lit'])
    # Rain: drops, the wet road and less grip for everyone.
    choose(page, 'rainLevel', 'chuva')
    wait_js(page, '!window.interlagosClima.info().compiling', timeout=90000)
    page.wait_for_timeout(800)
    wet = info(page)
    check('wipers_start_in_the_rain', wet['wipers']['on'], wet['wipers'])
    page.evaluate("()=>{const s=document.getElementById('camera');s.value='cockpit';s.dispatchEvent(new Event('change'));return true;}")
    page.wait_for_timeout(700)
    seen = info(page)['wipers']
    check('drops_on_the_glass_from_the_cockpit', seen['visible'], seen)
    sweeping = [info(page)['wipers']['angles'][0] for _ in range(4) if not page.wait_for_timeout(180)]
    check('blades_sweep', max(sweeping) - min(sweeping) > .2, sweeping)
    limp_on = info(page)['limp']
    page.keyboard.press('KeyJ')
    page.wait_for_timeout(1600)
    parked = info(page)
    check('j_parks_the_wipers', not parked['wipers']['on'] and parked['wipers']['angles'] == [0, 0], parked['wipers'])
    check('limp_switch_follows', limp_on is not None and abs(parked['limp'] - limp_on) > .5, [limp_on, parked['limp']])
    page.keyboard.press('KeyJ')
    page.screenshot(path=str(SHOTS / 'cockpit_chuva.png'))
    page.evaluate("()=>{const s=document.getElementById('camera');s.value='chase';s.dispatchEvent(new Event('change'));return true;}")
    check('rain_falls', wet['falling']['visible'] and wet['falling']['falling'] > 500, wet['falling'])
    check('road_is_wet', wet['wetness'] == 1, wet['wetness'])
    check('everyone_loses_grip', wet['grip'] < .8 and wet['fieldGrip'] == wet['grip'] and wet['rivalGrip'] == wet['grip'], wet)
    check('fog_closes_in', wet['fog'][1] < night['fog'][1], [night['fog'], wet['fog']])
    page.screenshot(path=str(SHOTS / 'noite_chuva.png'))
    # Back to the clear day: no lamps in the scene, dry road, full grip.
    choose(page, 'timeOfDay', 'dia')
    choose(page, 'rainLevel', 'seco')
    wait_js(page, '!window.interlagosClima.info().compiling', timeout=90000)
    page.wait_for_timeout(500)
    dry = info(page)
    check('day_takes_the_lamps_away', not dry['lamps']['installed'] and not dry['glow'] and not dry['rivalGlow'] and dry['roadLamps'] == 0, dry)
    check('day_is_dry', not dry['falling']['visible'] and dry['wetness'] == 0 and dry['grip'] == 1 and dry['rivalGrip'] == 1, dry)
    check('day_parks_wipers_and_floodlights', not dry['wipers']['on'] and dry['floods']['level'] == 0, [dry['wipers'], dry['floods']])
    check('day_light_as_before', dry['sun']['intensity'] == 7 and dry['exposure'] == .78 and dry['look']['adaptRange'] == [.72, 1.65], dry)
    page.close()
    # The story at night: the pilot switches the lamps on (H) once in the car.
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script("""(()=>{try{const k='opala99-preferences-v1',v=JSON.parse(localStorage.getItem(k)||'{}');v.timeOfDay='noite';v.rain='seco';localStorage.setItem(k,JSON.stringify(v));}catch(e){}})()""")
    open_menu(page, URL + ('&' if '?' in URL else '?') + 'circuito=interlagos')
    enter_track(page, 'Piloto clima', story=True)
    page.wait_for_timeout(1500)
    story = info(page)
    check('story_starts_with_lamps_off', story['time'] == 'noite' and story['lamps']['installed'] and not story['lamps']['lit'], story['lamps'])
    browser.close()

check('no_page_errors', not errors, errors[:5])
print(json.dumps({'passed': sum(results.values()), 'total': len(results), 'results': results, 'shots': str(SHOTS)}, ensure_ascii=False))
sys.exit(0 if all(results.values()) else 1)
