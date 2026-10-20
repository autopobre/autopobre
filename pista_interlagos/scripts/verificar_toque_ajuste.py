"""Phone controls after the players' round of 10-19, in a touch-emulated browser.

1. The pads answer a little past their edges (players missed them by a little, steering or braking);
   further out the touch is the view's and moves no camera.
2. No handbrake nor RÉ button on the phone (the brake backs up), except the Arena de Drift's handbrake.
3. The ✥ beside ⚙ on the toolbar (by the steering it would be tapped by mistake) arranges the pads: the race waits with the pads up and the rest faded, a finger
   drags each pad, Cancelar puts them back, Confirmar keeps them (also after a reload), Redefinir
   brings the game's places back; a pad never leaves the screen. There the pedal may be Digital: ACELERAR
   and FREAR, two buttons, all or nothing (the finger may slide between them); the steering too (user,
   2026-10-20): left and right, full lock or none, as the arrow keys. The panel keeps clear of the pads.
6. On the slider FREAR sits where the red stretch starts and RÉ at the very bottom (held there, the brake
   backs up).
4. The mini steering wheel by the map turns with the car's wheel (left counter-clockwise), its yellow
   mark at the top when straight; the story's meters sit clear of it.
5. The recorded engine plays only the loops heard: none on the car screen nor while the race waits
   (some 60 ran all the time and a phone's music stuttered on the car screen).

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_toque_ajuste.py
"""
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, wait_race_start, GAME_URL
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os
ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
report = {'errors': [], 'checks': {}}


def check(name, value):
    report['checks'][name] = bool(value); print(name, bool(value), flush=True); assert value, name


def rect(page, selector): return page.evaluate('s=>document.querySelector(s).getBoundingClientRect().toJSON()', selector)


def info(page): return page.evaluate('interlagos.mobileInfo()')


def touches(cdp, kind, points):
    cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': p['x'], 'y': p['y'], 'id': i} for i, p in points]})


def drag(cdp, start, dx, dy, steps=10):
    touches(cdp, 'touchStart', [(5, start)])
    for k in range(1, steps + 1):
        touches(cdp, 'touchMove', [(5, {'x': start['x'] + dx * k / steps, 'y': start['y'] + dy * k / steps})])
    touches(cdp, 'touchEnd', [])


def centre(r): return {'x': r['left'] + r['width'] / 2, 'y': r['top'] + r['height'] / 2}


def engine_sources(page): return page.evaluate('interlagos.audioInfo().engine?.sources??0')


# The toolbar (with the ✥ and ⚙) keeps clear of both pads' reach, its buttons on one line.
TOOLBAR_CLEAR = '''()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),grow=(b,v,h)=>({left:b.left-h,right:b.right+h,top:b.top-v,bottom:b.bottom+v}),apart=(a,b)=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;
 const bar=r('.touch-toolbar'),steer=grow(r('.touch-steering'),34,30),pedals=grow(r('.touch-pedals'),26,30);
 return apart(bar,steer)&&apart(bar,pedals)&&[...document.querySelectorAll('.touch-toolbar button')].filter(b=>b.getClientRects().length).every(b=>{const range=document.createRange();range.selectNodeContents(b);return range.getClientRects().length===1})}'''
# The arranging's panel (two kinds now: the pedal's and the steering's) leaves both pads free to drag, its kinds'
# labels on one line.
PANEL_CLEAR = '''()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),apart=(a,b)=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,panel=r('#touchArrangePanel');
 return panel.height>0&&apart(panel,r('#touchSteering'))&&apart(panel,r('#touchPedals'))&&[...document.querySelectorAll('#touchArrangePanel .arrange-mode span')].every(s=>s.getClientRects().length===1)}'''


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    try:
        context = browser.new_context(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True, device_scale_factor=2)
        page = context.new_page(); page.set_default_timeout(120000)
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        open_menu(page, URL)
        # 5. The car screen: the engine's banks load, and no loop plays there.
        page.fill('#pilotName', 'Piloto teste'); page.tap('#start'); page.wait_for_selector('#cars:not(.hidden)')
        wait_js(page, "interlagos.audioInfo().engine?.ready===true")
        page.wait_for_timeout(800)
        check('car_screen_plays_no_engine_loop', engine_sources(page) == 0)
        enter_track(page, tap=True)
        wait_js(page, "!document.querySelector('#touchControls').classList.contains('hidden')")
        wait_race_start(page); page.wait_for_timeout(300)
        cdp = context.new_cdp_session(page)
        steer, pedals, arrange = rect(page, '#touchSteering'), rect(page, '#touchPedals'), rect(page, '#touchArrange')
        # The ✥ sits on the toolbar right before ⚙, clear of the steering's reach; the pedals sit clear of the bottom edge.
        menu_button = rect(page, '#touchMenu')
        check('arrange_button_beside_settings', page.evaluate("document.querySelector('#touchArrange').parentElement.matches('.touch-toolbar')&&document.querySelector('#touchArrange').nextElementSibling.id==='touchMenu'") and 0 <= menu_button['left'] - arrange['right'] <= 10 and abs(centre(arrange)['y'] - centre(menu_button)['y']) < 2 and arrange['left'] > steer['right'] + 30)
        check('pedals_raised_from_bottom_edge', 390 - pedals['bottom'] >= 45)
        # 2. No handbrake, no RÉ.
        check('toolbar_clear_of_pads_844', page.evaluate(TOOLBAR_CLEAR))
        check('no_reverse_or_handbrake_button', page.evaluate("!document.querySelector('#touchReverse')&&!document.querySelector('#touchHandbrake').getClientRects().length"))
        # 1. Past the edges.
        above = {'x': steer['left'] + steer['width'] * .92, 'y': steer['top'] - 22}
        check('steering_margin_is_the_pad', page.evaluate("p=>document.elementFromPoint(p.x,p.y).closest('.touch-steering')!==null", above))
        touches(cdp, 'touchStart', [(1, above)]); page.wait_for_timeout(150)
        check('touch_above_steering_steers', info(page)['steering'] > .5)
        page.wait_for_timeout(400)
        right_turn = page.evaluate("[document.querySelector('#miniWheelTurn').getAttribute('transform'),interlagos.car.steer]")
        touches(cdp, 'touchEnd', [])
        below = {'x': pedals['left'] - 16, 'y': pedals['bottom'] + 14}
        check('brake_label_on_red_reverse_at_bottom', page.evaluate("()=>{const p=document.querySelector('#touchPedals').getBoundingClientRect(),f=document.querySelector('#touchBrakeLabel').getBoundingClientRect(),r=document.querySelector('#touchReverseLabel').getBoundingClientRect(),red=p.top+22+(p.height-44)*.7;return document.querySelector('#touchReverseLabel').textContent==='RÉ'&&Math.abs((f.top+f.bottom)/2-red)<6&&r.bottom>p.bottom-20&&r.top>f.bottom}"))
        check('pedal_margin_is_the_pad', page.evaluate("p=>document.elementFromPoint(p.x,p.y).closest('.touch-pedals')!==null", below))
        touches(cdp, 'touchStart', [(2, below)]); page.wait_for_timeout(150)
        check('touch_below_pedals_brakes', info(page)['brake'] > .9 and info(page)['throttle'] == 0)
        # The mini pedal left of the timing copies the pedal: braking, its thumb low and red.
        check('mini_pedal_by_the_timing', page.evaluate("()=>{const t=document.querySelector('#timing').getBoundingClientRect(),m=document.querySelector('#miniPedals').getBoundingClientRect();return m.right<=t.left&&t.left-m.right<12&&Math.abs(m.top-t.top)<2&&m.height>40}"))
        check('mini_pedal_shows_brake', page.evaluate("()=>{const m=document.querySelector('#miniPedals'),t=document.querySelector('#miniPedalThumb');return m.classList.contains('braking')&&parseFloat(t.style.top)>40}"))
        touches(cdp, 'touchEnd', []); page.wait_for_timeout(100)
        touches(cdp, 'touchStart', [(2, {'x': centre(pedals)['x'], 'y': pedals['top'] + 22 + (pedals['height'] - 44) * .3})]); page.wait_for_timeout(150)
        check('mini_pedal_shows_half_throttle', page.evaluate("()=>{const m=document.querySelector('#miniPedals'),t=parseFloat(document.querySelector('#miniPedalThumb').style.top),f=document.querySelector('#miniPedalFill');return !m.classList.contains('braking')&&Math.abs(t-(7+.3*40))<1.5&&Math.abs(parseFloat(f.style.height)-.3*40)<1.5}"))
        touches(cdp, 'touchEnd', []); page.wait_for_timeout(150)
        check('mini_pedal_rests_in_the_middle', page.evaluate("()=>Math.abs(parseFloat(document.querySelector('#miniPedalThumb').style.top)-33)<.5&&parseFloat(document.querySelector('#miniPedalFill').style.height)===0"))
        far = {'x': steer['right'] + 44, 'y': centre(steer)['y']}
        check('beyond_margin_is_the_view', page.evaluate("p=>document.elementFromPoint(p.x,p.y).id", far) == 'view')
        mode = page.evaluate('interlagos.state.mode')
        touches(cdp, 'touchStart', [(3, far)]); touches(cdp, 'touchMove', [(3, {'x': 420, 'y': 200})]); touches(cdp, 'touchEnd', [])
        check('beyond_margin_moves_no_camera', page.evaluate('interlagos.state.mode') == mode)
        # 4. The mini wheel: right lock turns it clockwise, left counter-clockwise, straight puts the mark on top.
        check('mini_wheel_by_the_map', page.evaluate("()=>{const m=document.querySelector('#mapcard').getBoundingClientRect(),w=document.querySelector('#miniWheel').getBoundingClientRect();return w.left>=m.right&&w.left-m.right<12&&Math.abs(w.top-m.top)<2&&w.width>40}"))
        check('mini_wheel_turns_right_clockwise', right_turn[1] < 0 and float(right_turn[0][7:-1]) > 30)
        left = {'x': steer['left'] + 8, 'y': centre(steer)['y']}
        touches(cdp, 'touchStart', [(4, left)]); page.wait_for_timeout(600)
        check('mini_wheel_turns_left_counter_clockwise', page.evaluate("interlagos.car.steer>0&&parseFloat(document.querySelector('#miniWheelTurn').getAttribute('transform').slice(7))<-30"))
        touches(cdp, 'touchEnd', []); wait_js(page, "Math.abs(parseFloat(document.querySelector('#miniWheelTurn').getAttribute('transform').slice(7)))<1", timeout=5000)
        report['straightMark'] = page.evaluate("()=>{const t=document.querySelector('#miniWheelTurn'),m=t.querySelector('.mini-mark'),b=m.getBBox();return {transform:t.getAttribute('transform'),x:b.x,y:b.y,w:b.width,h:b.height,stroke:getComputedStyle(m).stroke}}")
        mark = report['straightMark']
        check('mini_wheel_straight_mark_on_top', mark['y'] + mark['h'] < 0 and abs(mark['x'] + mark['w'] / 2) < 1 and mark['stroke'] == 'rgb(243, 207, 58)')
        page.screenshot(path=str(ROOT / 'renders' / 'toque_corrida.png'))
        # 3. Arranging.
        page.tap('#touchArrange'); page.wait_for_timeout(300)
        check('arrange_waits_with_pads_up', page.evaluate("interlagos.state.paused&&!document.querySelector('#touchControls').classList.contains('hidden')&&document.querySelector('#menu').classList.contains('hidden')&&!document.querySelector('#touchArrangePanel').hidden"))
        check('arrange_fades_the_rest', page.evaluate("+getComputedStyle(document.querySelector('#mapcard')).opacity<.5&&+getComputedStyle(document.querySelector('.touch-toolbar')).opacity<.5"))
        page.wait_for_timeout(700)
        check('waiting_race_plays_no_engine_loop', engine_sources(page) == 0)
        drag(cdp, centre(steer), 60, -50); drag(cdp, centre(pedals), -40, -30); page.wait_for_timeout(150)
        moved_s, moved_p = rect(page, '#touchSteering'), rect(page, '#touchPedals')
        check('drag_moves_each_pad', abs(moved_s['left'] - steer['left'] - 60) < 2 and abs(moved_s['top'] - steer['top'] + 50) < 2 and abs(moved_p['left'] - pedals['left'] + 40) < 2 and abs(moved_p['top'] - pedals['top'] + 30) < 2)
        check('arrange_steers_nothing', info(page)['steering'] == 0 and info(page)['throttle'] == 0)
        page.screenshot(path=str(ROOT / 'renders' / 'toque_ajuste.png'))
        page.tap('#touchArrangeCancel'); page.wait_for_timeout(200)
        check('cancel_puts_pads_back', abs(rect(page, '#touchSteering')['left'] - steer['left']) < 1 and abs(rect(page, '#touchPedals')['top'] - pedals['top']) < 1 and not page.evaluate("localStorage.getItem('opala99-toque-v1')"))
        check('cancel_resumes_race', not page.evaluate('interlagos.state.paused'))
        page.tap('#touchArrange'); drag(cdp, centre(steer), 60, -50); drag(cdp, centre(pedals), -40, -30)
        # Far past the screen's edge: the pad stays on it.
        # (the finger to the screen's last pixel: an emulated touch off the page gets lost)
        far_from = centre(rect(page, '#touchPedals')); drag(cdp, far_from, 843 - far_from['x'], 389 - far_from['y']); page.wait_for_timeout(150)
        edge = rect(page, '#touchPedals')
        check('pad_stays_on_screen', edge['right'] <= 844 and edge['bottom'] <= 390 and edge['right'] > 820)
        drag(cdp, centre(edge), -60, -60)
        kept_s, kept_p = rect(page, '#touchSteering'), rect(page, '#touchPedals')
        page.tap('#touchArrangeDone'); page.wait_for_timeout(200)
        saved = page.evaluate("JSON.parse(localStorage.getItem('opala99-toque-v1'))")
        report['confirmed'] = {'saved': saved, 'paused': page.evaluate('interlagos.state.paused'), 'arranging': page.evaluate("document.body.classList.contains('touch-arranging')"), 'kept': kept_s['left'], 'now': rect(page, '#touchSteering')['left']}
        check('confirm_keeps_places', saved and saved['steer'] and saved['pedals'] and not page.evaluate('interlagos.state.paused') and abs(rect(page, '#touchSteering')['left'] - kept_s['left']) < 1)
        touches(cdp, 'touchStart', [(1, {'x': kept_s['right'] - 8, 'y': centre(kept_s)['y']})]); page.wait_for_timeout(150)
        check('moved_pad_steers', info(page)['steering'] > .9); touches(cdp, 'touchEnd', [])
        # After a reload the places come back.
        open_menu(page, URL); enter_track(page, tap=True); wait_js(page, "!document.querySelector('#touchControls').classList.contains('hidden')"); page.wait_for_timeout(300)
        check('places_survive_reload', abs(rect(page, '#touchSteering')['left'] - kept_s['left']) < 1 and abs(rect(page, '#touchPedals')['top'] - kept_p['top']) < 1)
        page.tap('#touchArrange'); page.tap('#touchArrangeReset'); page.wait_for_timeout(150)
        check('reset_brings_game_places', abs(rect(page, '#touchSteering')['left'] - steer['left']) < 1 and abs(rect(page, '#touchPedals')['top'] - pedals['top']) < 1)
        page.tap('#touchArrangeDone'); page.wait_for_timeout(150)
        check('reset_saved', page.evaluate("JSON.parse(localStorage.getItem('opala99-toque-v1'))") == {'steer': None, 'pedals': None, 'digital': False, 'steerDigital': False})
        # The menu while arranging (a controller's Menu button) cancels it.
        page.tap('#touchArrange'); drag(cdp, centre(steer), 40, 0); report['beforeMenu'] = page.evaluate("[document.body.classList.contains('touch-arranging'),document.querySelector('#touchSteering').getBoundingClientRect().left]")
        page.evaluate("document.querySelector('#touchMenu').click()")
        # (the pads hide under the menu: the steering's place is read from its custom property)
        check('menu_cancels_arranging', report['beforeMenu'][0] and page.evaluate("!document.body.classList.contains('touch-arranging')&&document.querySelector('#settings').open&&document.querySelector('#touchControls').style.getPropertyValue('--steer-left')===''"))
        page.tap('#settingsResume'); wait_js(page, '!interlagos.state.paused')
        # The Digital pedal: two buttons in the pedal's place, all or nothing.
        page.tap('#touchArrange'); page.tap('#touchPedalDigital'); page.wait_for_timeout(100)
        check('digital_shows_two_buttons', page.evaluate("document.querySelector('#touchPedals').classList.contains('digital')&&document.querySelector('#touchPedalDigital').getAttribute('aria-checked')==='true'&&document.querySelector('#touchGasDigital').parentElement.getBoundingClientRect().height>50&&getComputedStyle(document.querySelector('#pedalThumb')).display==='none'&&getComputedStyle(document.querySelector('#touchReverseDigital')).display!=='none'"))
        page.screenshot(path=str(ROOT / 'renders' / 'toque_digital_ajuste.png'))
        page.tap('#touchArrangeDone'); page.wait_for_timeout(150)
        check('digital_saved', page.evaluate("JSON.parse(localStorage.getItem('opala99-toque-v1')).digital===true"))
        gas = page.evaluate("document.querySelector('#touchGasDigital').parentElement.getBoundingClientRect().toJSON()")
        brake = page.evaluate("document.querySelector('#touchBrakeDigital').parentElement.getBoundingClientRect().toJSON()")
        touches(cdp, 'touchStart', [(1, {'x': centre(gas)['x'], 'y': gas['bottom'] - 8})]); page.wait_for_timeout(120)
        check('digital_gas_all_or_nothing', info(page)['throttle'] == 1 and info(page)['brake'] == 0)
        page.screenshot(path=str(ROOT / 'renders' / 'toque_digital.png'))
        touches(cdp, 'touchMove', [(1, {'x': centre(brake)['x'], 'y': brake['top'] + 8})]); page.wait_for_timeout(120)
        check('digital_slides_to_brake', info(page)['brake'] == 1 and info(page)['throttle'] == 0)
        touches(cdp, 'touchEnd', []); page.wait_for_timeout(120)
        check('digital_release_lets_go', info(page)['throttle'] == 0 and info(page)['brake'] == 0)
        touches(cdp, 'touchStart', [(2, {'x': brake['left'] - 16, 'y': brake['bottom'] + 14})]); page.wait_for_timeout(120)
        check('digital_brake_margin', info(page)['brake'] == 1); touches(cdp, 'touchEnd', []); page.wait_for_timeout(120)
        # Redefinir keeps the kind, Cancelar puts back the one from before, Analógico + Confirmar returns the slider.
        page.tap('#touchArrange'); page.tap('#touchArrangeReset'); page.tap('#touchPedalAnalog'); page.tap('#touchArrangeCancel'); page.wait_for_timeout(120)
        check('cancel_restores_digital', page.evaluate("document.querySelector('#touchPedals').classList.contains('digital')"))
        page.tap('#touchArrange'); page.tap('#touchPedalAnalog'); page.tap('#touchArrangeDone'); page.wait_for_timeout(120)
        check('analog_back', page.evaluate("!document.querySelector('#touchPedals').classList.contains('digital')&&JSON.parse(localStorage.getItem('opala99-toque-v1')).digital===false"))
        # The Digital steering (user, 2026-10-20): two buttons in the steering's place, left and right, full lock or
        # none as the arrow keys (the finger may slide between them); the pedal keeps its own kind.
        page.tap('#touchArrange'); page.tap('#touchSteerDigital'); page.wait_for_timeout(100)
        check('steer_digital_shows_two_buttons', page.evaluate("()=>{const p=document.querySelector('#touchSteering'),b=[...p.querySelectorAll('.steer-digital b')].map(x=>x.getBoundingClientRect());return p.classList.contains('digital')&&document.querySelector('#touchSteerDigital').getAttribute('aria-checked')==='true'&&b.length===2&&b[0].width>60&&b[0].height>50&&b[0].right<b[1].left&&getComputedStyle(document.querySelector('#steeringThumb')).display==='none'&&!document.querySelector('#touchPedals').classList.contains('digital')}"))
        check('arrange_panel_clear_of_pads', page.evaluate(PANEL_CLEAR))
        page.screenshot(path=str(ROOT / 'renders' / 'toque_volante_digital_ajuste.png'))
        page.tap('#touchArrangeDone'); page.wait_for_timeout(150)
        check('steer_digital_saved', page.evaluate("JSON.parse(localStorage.getItem('opala99-toque-v1')).steerDigital===true"))
        left_b, right_b = page.evaluate("[...document.querySelectorAll('#touchSteering .steer-digital b')].map(b=>b.getBoundingClientRect().toJSON())")
        touches(cdp, 'touchStart', [(1, centre(left_b))]); page.wait_for_timeout(120)
        check('steer_digital_left_full', info(page)['steering'] == -1)
        touches(cdp, 'touchMove', [(1, centre(right_b))]); page.wait_for_timeout(450)
        check('steer_digital_slides_right_full', info(page)['steering'] == 1 and page.evaluate("document.querySelector('#touchSteering').classList.contains('right-held')"))
        page.screenshot(path=str(ROOT / 'renders' / 'toque_volante_digital.png'))
        check('steer_digital_turns_the_car_right', page.evaluate('interlagos.car.steer') < -.05)
        touches(cdp, 'touchMove', [(1, {'x': (left_b['right'] + right_b['left']) / 2, 'y': centre(left_b)['y']})]); page.wait_for_timeout(120)
        check('steer_digital_gap_does_neither', info(page)['steering'] == 0)
        touches(cdp, 'touchEnd', []); page.wait_for_timeout(120)
        check('steer_digital_release_centres', info(page)['steering'] == 0)
        touches(cdp, 'touchStart', [(2, {'x': left_b['left'] - 16, 'y': left_b['top'] - 14})]); page.wait_for_timeout(120)
        check('steer_digital_margin', info(page)['steering'] == -1); touches(cdp, 'touchEnd', []); page.wait_for_timeout(120)
        page.tap('#touchArrange'); page.tap('#touchSteerAnalog'); page.tap('#touchArrangeDone'); page.wait_for_timeout(120)
        check('steer_analog_back', page.evaluate("!document.querySelector('#touchSteering').classList.contains('digital')&&getComputedStyle(document.querySelector('#steeringThumb')).display!=='none'&&JSON.parse(localStorage.getItem('opala99-toque-v1')).steerDigital===false"))
        # 5. Driving: a handful of loops, not all of them (59 ran before): up to some 7 for the car heard and as many
        # for each of the two nearest rivals, counting the ones still fading out.
        touches(cdp, 'touchStart', [(1, {'x': centre(pedals)['x'], 'y': pedals['top'] + 18})]); page.wait_for_timeout(2500)
        driving = engine_sources(page); report['driving'] = page.evaluate("({sources:interlagos.audioInfo().engine?.sources,paused:interlagos.state.paused,throttle:interlagos.mobileInfo().throttle,kmh:Math.hypot(interlagos.car.vx,interlagos.car.vy)*3.6,context:interlagos.audioInfo().context})"); touches(cdp, 'touchEnd', [])
        check('driving_plays_few_engine_loops', 1 <= driving <= 24)
        context.close()
        # A small phone (667 x 375): the toolbar still keeps clear of the pads.
        context = browser.new_context(viewport={'width': 667, 'height': 375}, has_touch=True, is_mobile=True, device_scale_factor=1)
        page = context.new_page(); page.set_default_timeout(120000); page.on('pageerror', lambda e: report['errors'].append(str(e)))
        open_menu(page, URL); enter_track(page, tap=True); wait_js(page, "!document.querySelector('#touchControls').classList.contains('hidden')"); page.wait_for_timeout(300)
        report['toolbar667'] = page.evaluate("()=>['.touch-toolbar','.touch-steering','.touch-pedals'].map(s=>{const b=document.querySelector(s).getBoundingClientRect();return [s,Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)]})")
        check('toolbar_clear_of_pads_667', page.evaluate(TOOLBAR_CLEAR)); page.screenshot(path=str(ROOT / 'renders' / 'toque_667.png'))
        page.tap('#touchArrange'); page.wait_for_timeout(150)
        report['panel667'] = page.evaluate("document.querySelector('#touchArrangePanel').getBoundingClientRect().toJSON()")
        check('arrange_panel_clear_of_pads_667', page.evaluate(PANEL_CLEAR)); page.screenshot(path=str(ROOT / 'renders' / 'toque_667_ajuste.png'))
        page.tap('#touchArrangeCancel')
        context.close()
        # The story's meters sit right of the mini wheel; a narrow phone keeps the mini wheel on its own.
        context = browser.new_context(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True, device_scale_factor=1)
        page = context.new_page(); page.set_default_timeout(120000); page.on('pageerror', lambda e: report['errors'].append(str(e)))
        open_menu(page, URL); enter_track(page, tap=True, story=True); page.wait_for_timeout(500)
        # (on foot in the paddock the mini wheel steps aside: the meters' place is checked against where it sits)
        check('story_meters_clear_of_mini_wheel', page.evaluate("()=>{const h=document.querySelector('#immersiveHud').getBoundingClientRect(),m=document.querySelector('#mapcard').getBoundingClientRect();return h.width>0&&h.left>=m.right+62}"))
        page.screenshot(path=str(ROOT / 'renders' / 'toque_historia.png'))
        context.close()
        check('no_browser_errors', not report['errors']); report['passed'] = True
    finally:
        report.setdefault('passed', False)
        (ROOT / 'dados/validacao_toque_ajuste.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True); browser.close()
