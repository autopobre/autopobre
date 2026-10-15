"""Browser check of the weather (weather.js): the Horário and Clima selects in the race settings and on the track
screen, the night with the headlights (H, the cockpit's FAROL switch, the rivals' lamps), the rain (drops, wet road,
everyone's grip) and the way back to the clear day; the story starts with the lamps off; Aleatório draws a real
weather for every race and restart.

Uso: python scripts/verificar_clima.py [porta]   (servidor local em execucao; padrao 8799; honra INTERLAGOS_URL)
"""
import json
import os
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, race_options, enter_track, wait_race_start, wait_js, pause_race

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
    # The selects: three choices each and Aleatório, day and dry by default, the two places kept in step.
    options = page.evaluate('''(()=>Object.fromEntries(['timeOfDay','rainLevel','tracksTime','tracksRain'].map(id=>{const s=document.getElementById(id);return [id,s?{value:s.value,options:[...s.options].map(o=>o.value)}:null];})))()''')
    check('selects_in_settings_and_track_screen', all(options.values()) and options['timeOfDay']['options'] == options['tracksTime']['options'] == ['dia', 'fim_de_tarde', 'noite', 'aleatorio'] and options['rainLevel']['options'] == options['tracksRain']['options'] == ['seco', 'garoa', 'chuva', 'aleatorio'], options)
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
    # (the stroke ends on the game's clock: on a loaded machine it runs slower than the wall's; the day's parking below too)
    try:
        wait_js(page, '!window.interlagosClima.info().wipers.on', timeout=8000)
    except TimeoutError:
        pass  # the check below reports it
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
    # The wipers finish their stroke before they park (windscreen-rain.js: up to one 1.15 s cycle of the game's own clock,
    # which a loaded machine runs slower than the wall's: the frame's dt is capped), so a fixed half second was not always it.
    try:
        wait_js(page, '!window.interlagosClima.info().wipers.on', timeout=8000)
    except TimeoutError:
        pass  # the check below reports it
    dry = info(page)
    check('day_takes_the_lamps_away', not dry['lamps']['installed'] and not dry['glow'] and not dry['rivalGlow'] and dry['roadLamps'] == 0, dry)
    check('day_is_dry', not dry['falling']['visible'] and dry['wetness'] == 0 and dry['grip'] == 1 and dry['rivalGrip'] == 1, dry)
    check('day_parks_wipers_and_floodlights', not dry['wipers']['on'] and dry['floods']['level'] == 0, [dry['wipers'], dry['floods']])
    check('day_light_as_before', dry['sun']['intensity'] == 7 and dry['exposure'] == .78 and dry['look']['adaptRange'] == [.72, 1.65], dry)
    # Y and U on the track (10-15): the next time of day and rain, saved and mirrored in the selects; dry dusk is still
    # daylight, so no car lights up (the pit wall's floodlights still glow a little, as they did).
    def press(key):
        page.keyboard.press(key)
        wait_js(page, '!window.interlagosClima.info().compiling', timeout=90000)
        page.wait_for_timeout(300)
        now = info(page)
        selects = page.evaluate("['timeOfDay','tracksTime','rainLevel','tracksRain'].map(id=>document.getElementById(id).value)")
        return now, selects, page.evaluate("document.getElementById('status').textContent")
    dusk, selects, said = press('KeyY')
    check('y_goes_to_dusk', dusk['time'] == 'fim_de_tarde' and selects[:2] == ['fim_de_tarde'] * 2 and said == 'Fim de tarde · Y muda o horário', [dusk['time'], selects, said])
    check('dusk_without_lamps', not dusk['lamps']['installed'] and not dusk['glow'] and not dusk['rivalGlow'] and not dusk['tail'] and not dusk['lamps']['lit'], dusk)
    times = [press('KeyY')[0]['time'] for _ in range(2)]
    check('y_cycles_round', times == ['noite', 'dia'], times)
    rains = [press('KeyU') for _ in range(3)]
    check('u_cycles_the_rain', [r[0]['rain'] for r in rains] == ['garoa', 'chuva', 'seco'] and rains[1][1][2:] == ['chuva'] * 2 and rains[1][2] == 'Chuva forte · U muda o clima' and rains[1][0]['wetness'] == 1,
          [(r[0]['rain'], r[1], r[2], r[0]['wetness']) for r in rains])
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
    page.close()
    # The Seiva livery carries the auxiliary lamps too (since 2026-10-11): they light its road at night.
    seiva_prefs = {'timeOfDay': 'noite', 'rain': 'seco', 'livery': 'seiva_danilo', 'carModel': 'opala'}
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script("""(p=>{try{const k='opala99-preferences-v1',v=JSON.parse(localStorage.getItem(k)||'{}');Object.assign(v,p);localStorage.setItem(k,JSON.stringify(v));}catch(e){}})(%s)""" % json.dumps(seiva_prefs))
    open_menu(page, URL + ('&' if '?' in URL else '?') + 'circuito=interlagos')
    race_options(page, camera='chase', livery='seiva_danilo')
    enter_track(page, 'Piloto Seiva')
    wait_race_start(page)
    page.wait_for_timeout(800)
    seiva = info(page)['lamps']
    check('seiva_lights_its_auxiliary_lamps', seiva['set'] == 'milha' and seiva['lit'] and seiva['intensity'] > 0, seiva)
    page.close()
    # The Fusca in the rain: its own two blades sweep its windscreen, drops on the glass from its cockpit.
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script("""(p=>{try{const k='opala99-preferences-v1',v=JSON.parse(localStorage.getItem(k)||'{}');Object.assign(v,p);localStorage.setItem(k,JSON.stringify(v));}catch(e){}})(%s)""" % json.dumps({'timeOfDay': 'dia', 'rain': 'chuva', 'carModel': 'fusca'}))
    open_menu(page, URL + ('&' if '?' in URL else '?') + 'circuito=interlagos')
    race_options(page, camera='cockpit')
    enter_track(page, 'Piloto Fusca')
    wait_race_start(page)
    wait_js(page, '!window.interlagosClima.info().compiling', timeout=90000)
    page.wait_for_timeout(800)
    fusca = info(page)['fuscaWipers']
    turns = sorted(p['turn'] for p in fusca['pivots'] or [])
    check('fusca_wipers_cut_out', fusca['ready'] and fusca['blades'] == 2 and turns == [-1, 1] and all(p['tris'] > 20 for p in fusca['pivots']), fusca)
    check('fusca_drops_from_its_cockpit', fusca['on'] and fusca['visible'], fusca)
    sweeping = [info(page)['fuscaWipers']['angles'][0] for _ in range(4) if not page.wait_for_timeout(180)]
    check('fusca_blades_sweep', max(sweeping) - min(sweeping) > .2, sweeping)
    page.keyboard.press('KeyJ')
    page.wait_for_timeout(1600)
    check('j_parks_the_fusca_wipers', info(page)['fuscaWipers']['angles'] == [0, 0], info(page)['fuscaWipers'])
    page.close()
    # Aleatório (pedido #7): kept in both selects; the first race races the draw the menu showed, every restart a
    # new one (a real time and rain, the world as they have it), and the opening's line names the draw.
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script("""(p=>{try{const k='opala99-preferences-v1',v=JSON.parse(localStorage.getItem(k)||'{}');Object.assign(v,p);localStorage.setItem(k,JSON.stringify(v));}catch(e){}})(%s)""" % json.dumps({'timeOfDay': 'aleatorio', 'rain': 'aleatorio', 'carModel': 'opala'}))
    open_menu(page, URL + ('&' if '?' in URL else '?') + 'circuito=interlagos')
    shown = page.evaluate("['timeOfDay','tracksTime','rainLevel','tracksRain'].map(id=>document.getElementById(id).value)")
    check('random_kept_in_both_places', shown == ['aleatorio'] * 4, shown)
    menu_draw = info(page)['draw']
    race_options(page, camera='chase')
    enter_track(page, 'Piloto sorteio')
    wait_race_start(page)
    races = []
    for n in range(6):
        if n:
            pause_race(page)
            page.click('#restartRace')
            wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused')
            wait_race_start(page)
        wait_js(page, '!window.interlagosClima.info().compiling', timeout=90000)
        page.wait_for_timeout(300)
        races.append(info(page))
    first = races[0]
    check('first_race_takes_the_menu_draw', {'time': first['time'], 'rain': first['rain']} == menu_draw, [menu_draw, first['time'], first['rain']])
    real = all(r['choice'] == {'time': 'aleatorio', 'rain': 'aleatorio'} and r['time'] in ('dia', 'fim_de_tarde', 'noite') and r['rain'] in ('seco', 'garoa', 'chuva')
               and r['draw'] == {'time': r['time'], 'rain': r['rain']} and r['sky']['weather'] == f"{r['time']}/{r['rain']}" for r in races)
    check('every_race_a_real_weather', real, [(r['choice'], r['time'], r['rain'], r['draw'], r['sky']['weather']) for r in races])
    check('world_as_drawn', all((r['wetness'] > 0) == (r['rain'] != 'seco') and (r['grip'] < 1) == (r['rain'] != 'seco') and r['lamps']['installed'] == (r['time'] == 'noite' or r['rain'] != 'seco') for r in races),
          [(r['time'], r['rain'], r['wetness'], r['grip'], r['lamps']['installed']) for r in races])
    check('restarts_draw_again', len({(r['time'], r['rain']) for r in races}) > 1, [(r['time'], r['rain']) for r in races])
    check('opening_names_the_draw', all(r['caption'].startswith('São Paulo · ') and r['caption'].endswith(' · sorteio: ' + {'dia': 'dia', 'fim_de_tarde': 'fim de tarde', 'noite': 'noite'}[r['time']] + ', ' + {'seco': 'tempo seco', 'garoa': 'garoa', 'chuva': 'chuva forte'}[r['rain']]) for r in races),
          [r['caption'] for r in races])
    # Picked again mid-race: a fresh draw for that part alone, raced at once; a fixed choice is no draw.
    before = info(page)
    page.evaluate("window.interlagosClima.set({time:'noite',rain:'aleatorio'})")
    wait_js(page, '!window.interlagosClima.info().compiling', timeout=90000)
    after = info(page)
    check('fixed_time_with_random_rain', after['time'] == 'noite' and after['rain'] == after['draw']['rain'] and after['draw']['time'] == before['draw']['time'] and after['caption'].endswith(' · sorteio: ' + {'seco': 'tempo seco', 'garoa': 'garoa', 'chuva': 'chuva forte'}[after['rain']]), [before['draw'], after['draw'], after['time'], after['rain'], after['caption']])
    page.evaluate("window.interlagosClima.set({time:'dia',rain:'seco'})")
    browser.close()

check('no_page_errors', not errors, errors[:5])
print(json.dumps({'passed': sum(results.values()), 'total': len(results), 'results': results, 'shots': str(SHOTS)}, ensure_ascii=False))
sys.exit(0 if all(results.values()) else 1)
