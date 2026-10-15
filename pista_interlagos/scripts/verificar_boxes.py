"""Pit lane no navegador: superficie, HUD, minimapa, pit stop no Box 99 e capturas.

Uso: python scripts/verificar_boxes.py [porta] [circuito]  (servidor local em execucao; padrao 8799,
interlagos). Resultado em dados/validacao_boxes[_<circuito>].json e capturas renders/boxes_[<circuito>_]*.png.
Nos circuitos de dados abertos as estacoes sao fracoes do pit lane; em Brasilia o bloco do pit vem
escrito da saida para a entrada (pit.reversed) e o carro e posto no sentido em que os carros andam.
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, race_options, enter_track, wait_race_start, wait_js

ROOT = Path(__file__).resolve().parents[1]
PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
CIRCUIT = sys.argv[2] if len(sys.argv) > 2 else 'interlagos'
TAG = '' if CIRCUIT == 'interlagos' else CIRCUIT + '_'
URL = GAME_URL.replace(':8799', ':' + PORT) + '?circuito=' + CIRCUIT
# Stations along the pit lane (metres): entry, gore, chicane, garages, exit curve, S do Senna, merge.
STATIONS = [('entrada', 20), ('zebrado', 120), ('chicane', 210), ('limite', 330), ('garagens', 470), ('passarela', 700), ('saida', 900), ('reta_oposta', 1150)]
# Elsewhere: fractions of the lane in the cars' order (from the entry), turned into s below.
FRACTIONS = [('entrada', .03), ('limite', .3), ('garagens', .5), ('saida', .85)]
# s along the block's stations, and the cars' heading there (against the stations on a reversed block).
PLACE = """(s)=>{const car=interlagos.car,P=car.data.pit,c=Object.fromEntries(P.columns.map((k,i)=>[k,i])),turn=P.reversed?Math.PI:0;
 const p=P.samples.reduce((b,q)=>Math.abs(q[c.s]-s)<Math.abs(b[c.s]-s)?q:b,P.samples[0]),mid=(p[c.lane_lo]+p[c.fast_hi])/2;
 car.x=p[c.x]+p[c.lx]*mid;car.y=p[c.y]+p[c.ly]*mid;car.heading=Math.atan2(p[c.ty],p[c.tx])+turn;car.vx=car.vy=car.yaw=0;
 car.index=car.nearest(car.x,car.y,true).i;car.surface=car.sample(car.x,car.y);car.settle?.();
 return {s,pit:car.surface.pit,onRoad:car.surface.onRoad,pitS:car.surface.pitS,lapS:car.surface.s,z:car.surface.z};}"""
report = {'url': URL, 'stations': [], 'errors': []}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args(), headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
    open_menu(page, URL)
    race_options(page, camera='chase')
    enter_track(page, 'Piloto boxes')
    wait_race_start(page)
    info = page.evaluate("""()=>{const P=interlagos.car.data.pit;return {samples:P.samples.length,length:P.length_m,entry:P.entry_main_s,exit:P.exit_main_s,walls:P.walls.map(w=>w.name),limit:P.limit,reversed:!!P.reversed};}""")
    report['pit'] = info
    if CIRCUIT == 'interlagos':
        assert info['samples'] > 400 and 3850 < info['entry'] < 3950 and 750 < info['exit'] < 950, info
    else:
        STATIONS = [(name, info['length'] * (1 - f if info['reversed'] else f)) for name, f in FRACTIONS]
    for name, s in STATIONS:
        state = page.evaluate(PLACE, s)
        page.wait_for_timeout(700)
        state['hud'] = page.inner_text('#surface')
        state['location'] = page.inner_text('#location')
        assert state['pit'] and state['onRoad'], state
        assert state['hud'].startswith('PIT LANE') and 'Pit lane' in state['location'], state
        if info['limit']['from'] <= state['pitS'] <= info['limit']['to']:
            assert 'MÁX. 60' in state['hud'], state
        page.screenshot(path=str(ROOT / f'renders/boxes_{TAG}{name}.png'))
        report['stations'].append(state)
    # Box 99: in the race the car stops on the painted box in front of the garage, along
    # the lane, and the crew runs out; on foot the driver crosses the garage to the café.
    state = page.evaluate("""()=>{const car=interlagos.car,P=car.data.pit,c=Object.fromEntries(P.columns.map((k,i)=>[k,i])),b=P.box99;
     const p=P.samples.reduce((a,q)=>Math.abs(q[c.s]-b.s)<Math.abs(a[c.s]-b.s)?q:a,P.samples[0]),d=(p[c.fast_hi]+p[c.lane_hi])/2;
     car.x=p[c.x]+p[c.lx]*d+p[c.tx]*(b.s-p[c.s]);car.y=p[c.y]+p[c.ly]*d+p[c.ty]*(b.s-p[c.s]);car.heading=Math.atan2(p[c.ty],p[c.tx])+(P.reversed?Math.PI:0);car.vx=car.vy=car.yaw=0;
     car.index=car.nearest(car.x,car.y,true).i;car.surface=car.sample(car.x,car.y);car.settle?.();return {pit:car.surface.pit,pitD:car.surface.pitD,front:b.front};}""")
    assert state['pit'] and state['pitD'] < state['front'], state
    wait_js(page, 'interlagos.pitInfo()?.opened', timeout=20000)
    page.wait_for_timeout(2500)
    report['box99'] = {**state, 'title': page.inner_text('#pitTitle'), 'label': page.inner_text('#pitPanel small')}
    assert 'Cuida do Opala' in report['box99']['title'] and 'BOX 99' in report['box99']['label'], report['box99']
    page.screenshot(path=str(ROOT / f'renders/boxes_{TAG}box99.png'))
    page.evaluate("""async()=>{const {PitStop}=await import('./pitstop.js');const info=PitStop.prototype.info;PitStop.prototype.info=function(){window.pit=this;return info.call(this);};interlagos.pitInfo();}""")
    # In the car at the box a drag orbits the camera round the car.
    angle = page.evaluate('pit.view.angle')
    page.evaluate('pit.orbitView(120,0)')
    assert page.evaluate('pit.view.angle') < angle, 'the pit camera orbits the car'
    # Refuel, then new tyres: the crew walks round the car (never through it) and the
    # fuel man's spout reaches the filler on the right rear quarter.
    page.evaluate("pit.setDamage(true);pit.condition.damage('pneus',.5);pit.mode.freeFuel=4;pit.startFuel(2);pit.service.startRepair('pneus','proper');pit.view=pit.startView()")
    SAMPLE = """()=>{const c=interlagos.car,h=c.heading,crew=pit.layout.crew,inside=crew.actors.filter(a=>{const dx=a.x-c.x,dy=a.y-c.y,f=dx*Math.cos(h)+dy*Math.sin(h),r=dx*Math.sin(h)-dy*Math.cos(h);return Math.abs(f)<2.3&&Math.abs(r)<.85;}).map(a=>a.person.name);
     const fx=c.x+Math.cos(h)*-.7+Math.sin(h)*.79,fy=c.y+Math.sin(h)*-.7-Math.cos(h)*.79,tip=crew.spout.clone().applyEuler(crew.can.rotation).add(crew.can.position);
     const drawn=o=>{const m=o.matrixWorld.elements;return Math.hypot(m[12]-o.position.x,m[13]-o.position.y,m[14]-o.position.z);},near=o=>Math.hypot(o.matrixWorld.elements[12]-c.x,-o.matrixWorld.elements[14]-c.y);
     return {inside,job:pit.service.job?.id??null,spout:Math.hypot(tip.x-fx,-tip.z-fy),fuelAct:crew.actors[4].act,
      props:Math.max(...[crew.can,crew.pole,crew.disc].map(drawn)),propsFar:Math.max(...[crew.can,crew.pole,crew.disc].map(near))};}"""
    samples = []
    for _ in range(90):
        page.wait_for_timeout(100)
        samples.append(page.evaluate(SAMPLE))
        if samples[-1]['job'] == 'pneus' and len([q for q in samples if q['job'] == 'pneus']) > 25:
            break
    report['crew'] = {'through_car': sorted({n for q in samples for n in q['inside']}), 'spout_at_filler': min((q['spout'] for q in samples if q['fuelAct'] == 'fuel'), default=None), 'jobs': sorted({q['job'] for q in samples if q['job']})}
    assert not report['crew']['through_car'], report['crew']
    assert report['crew']['spout_at_filler'] is not None and report['crew']['spout_at_filler'] < .15, report['crew']
    # The can, the lollipop's pole and its disc are drawn where they are placed, by the car (frozen with the still
    # scenery, main.js freezeStatic, they stood at the world's origin, 30 m off the box).
    report['crew']['props_drawn_off'] = max(q['props'] for q in samples); report['crew']['props_from_car'] = max(q['propsFar'] for q in samples)
    assert report['crew']['props_drawn_off'] < 1e-3 and report['crew']['props_from_car'] < 6, report['crew']
    page.screenshot(path=str(ROOT / f'renders/boxes_{TAG}equipe.png'))
    # As in GTA: F gets out of the Opala (the mouse then turns the third-person camera).
    page.keyboard.press('f')
    wait_js(page, 'pit.coffee!==null')
    yaw = page.evaluate('pit.coffee.yaw')
    page.evaluate('pit.turnView(200,0)')
    assert page.evaluate('pit.coffee.yaw') < yaw, 'the mouse turns the walking camera'
    # The driver gets out on the car's left. With the garages on the cars' right (Brasília, a reversed
    # pit block) that is the fast lane's side: he goes round the car's front, towards the café.
    WALK = """(to)=>{const c=interlagos.car,h=c.heading,around=c.data.pit.reversed?[[3.8,1.6],[3.8,-2.2]].map(([f,l])=>{const v=pit.hero.position.clone();v.x=c.x+Math.cos(h)*f-Math.sin(h)*l;v.z=-(c.y+Math.sin(h)*f+Math.cos(h)*l);return v;}):[];
     const r=pit.layout.route,points=to==='cafe'?[...around,...r]:to==='garage'?[...r].reverse().slice(0,4):[r[1],r[0],...[...around].reverse(),pit.heroStart()];let stuck=null;
     for(const target of points){for(let i=0;i<2400;i++){const dx=target.x-pit.hero.position.x,dz=target.z-pit.hero.position.z;if(Math.hypot(dx,dz)<.35)break;
      pit.coffee.yaw=Math.atan2(-dz,dx);const before=pit.hero.position.clone();pit.beforeStep({throttle:1,brake:0,left:0,right:0},1/120);if(pit.hero.position.distanceTo(before)<1e-5){stuck=target.toArray();break;}}if(stuck)break;}
     return {stuck,interaction:pit.interaction()};}"""
    report['walk'] = {'cafe': page.evaluate(WALK, 'cafe')}
    assert report['walk']['cafe']['interaction'] == 'cafe', report['walk']
    # E at the counter opens the menu; the coffee stays in hand and E drinks it, sip by sip.
    page.keyboard.press('e')
    wait_js(page, 'pit.coffee.menu')
    page.click('[data-snack="cafe"]')
    page.click('#pitCloseCafe')
    wait_js(page, '!pit.coffee.menu')
    page.keyboard.press('e')
    page.wait_for_timeout(600)
    page.screenshot(path=str(ROOT / f'renders/boxes_{TAG}lanchonete.png'))
    wait_js(page, '!pit.coffee.using')
    report['snack'] = page.evaluate("pit.coffee.held.map(h=>[h.id,h.bites])")
    assert report['snack'] == [['cafe', 2]], report['snack']
    report['walk']['garage'] = page.evaluate(WALK, 'garage')
    assert not report['walk']['garage']['stuck'], report['walk']
    page.wait_for_timeout(1200)
    page.screenshot(path=str(ROOT / f'renders/boxes_{TAG}garagem.png'))
    report['walk']['car'] = page.evaluate(WALK, 'car')
    assert report['walk']['car']['interaction'] == 'car', report['walk']
    page.keyboard.press('f')
    wait_js(page, '!interlagos.pitInfo().opened')
    # Overview from above: C cycles chase, close, hood, cockpit, aerial.
    for _ in range(4):
        page.keyboard.press('KeyC')
    aereas = [('aerea_entrada', 90), ('aerea_garagens', 480), ('aerea_saida', 720)] if CIRCUIT == 'interlagos' else         [('aerea_' + name, s) for name, s in STATIONS if name in ('entrada', 'garagens', 'saida')]
    for name, s in aereas:
        page.evaluate(PLACE, s)
        page.wait_for_timeout(900)
        page.screenshot(path=str(ROOT / f'renders/boxes_{TAG}{name}.png'))
    report['errors'] = [e for e in report['errors'] if 'favicon' not in e]
    assert not report['errors'], report['errors']
    browser.close()
(ROOT / f'dados/validacao_boxes{"_" + CIRCUIT if TAG else ""}.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps({'stations': len(report['stations']), 'pit': report['pit'], 'box99': report['box99']}, ensure_ascii=False))
