"""O oval de Chapecó no navegador: a caixa "Oval" no cartão de Chapecó, a corrida no oval e fotos de conferência.

    python verificar_oval_chapeco.py [porta] [pasta das fotos]

Tela das pistas (menus do paddock no computador e no celular deitado, e os clássicos): o cartão de Chapecó tem a caixa;
marcada, o cartão vira o oval (contorno, nome, medidas) e a escolha é 'chapecooval'; desmarcada, volta a Chapecó; com
outra pista escolhida a caixa fica como estava e o cartão de Chapecó escolhe o oval. Depois uma corrida no oval: carrega,
os trechos fechados e o pit lane estão lá, e o carro posto na ligação S2, na entrada dos boxes e nas garagens tira fotos.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import GAME_URL, browser_args, browser_executable, choose_race, wait_js

ROOT = Path(__file__).resolve().parents[1]
PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
FOTOS = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'renders'
FOTOS.mkdir(parents=True, exist_ok=True)
URL = GAME_URL.replace(':8799', ':' + PORT)
# Poses do carro: na volta (s, afastamento, giro do rumo) ou no pit lane (s da faixa).
VIEWS = [
    ('fim_reta2', 'track', 1120, -3, 0),
    ('ligacao_s2', 'track', 1235, -2, 0),
    ('saida_s2', 'track', 1320, -3, 0),
    ('entrada_boxes', 'pit', 20, 0, 0),
    ('garagens', 'pit', 150, 0, 0),
]
PLACE = """([kind,s,d,turn])=>{const car=interlagos.car,data=car.data;let x,y,heading;
 if(kind==='track'){const a=data.samples,p=a.reduce((b,q)=>Math.abs(q[0]-s)<Math.abs(b[0]-s)?q:b,a[0]);x=p[1]+p[9]*d;y=p[2]+p[10]*d;heading=Math.atan2(p[8],p[7])+turn;}
 else{const P=data.pit,c=Object.fromEntries(P.columns.map((k,i)=>[k,i])),p=P.samples.reduce((b,q)=>Math.abs(q[c.s]-s)<Math.abs(b[c.s]-s)?q:b,P.samples[0]),mid=(p[c.lane_lo]+p[c.lane_hi])/2+d;
  x=p[c.x]+p[c.lx]*mid;y=p[c.y]+p[c.ly]*mid;heading=Math.atan2(p[c.ty],p[c.tx])+turn;}
 car.x=x;car.y=y;car.heading=heading;car.vx=car.vy=car.yaw=0;car.index=car.nearest(x,y,true).i;car.surface=car.sample(x,y);car.settle?.();
 return {kind,s,onRoad:car.surface.onRoad,pit:car.surface.pit};}"""
CARD = """()=>{const card=document.querySelector('.track-cards [data-circuit="chapeco"]'),box=document.querySelector('[data-variant="chapecooval"]');
 return {pressed:card.getAttribute('aria-pressed'),name:card.querySelector('b').textContent,span:card.querySelector('span').textContent,
  checked:box.checked,hero:document.querySelector('#trackHeroName').textContent,
  saved:JSON.parse(localStorage.getItem('opala99-preferences-v1')).circuit,url:new URL(location.href).searchParams.get('circuito')};}"""
errors, report = [], {}


def tela_das_pistas(browser, nome, viewport, classic=False, mobile=False):
    context = browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile)
    context.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'cascavel',immersive:false"
                            + (",classicMenus:true" if classic else "") + "}));")
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL, wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Piloto oval')
    page.click('#start')
    page.click('#carsNext')
    wait_js(page, "!document.querySelector('#tracks').classList.contains('hidden')")
    page.locator('.track-cards [data-circuit="chapeco"]').scroll_into_view_if_needed()
    estados = {'inicio': page.evaluate(CARD)}
    assert estados['inicio']['pressed'] == 'false' and not estados['inicio']['checked'], estados
    page.click('label.track-variant')
    estados['marcado'] = page.evaluate(CARD)
    page.screenshot(path=str(FOTOS / f'oval_menu_{nome}.png'))
    e = estados['marcado']
    assert e['pressed'] == 'true' and e['checked'] and e['name'] == 'Oval de Chapecó' and e['hero'] == 'Oval de Chapecó', e
    assert e['saved'] == 'chapecooval' and e['url'] == 'chapecooval' and e['span'].startswith('1.452 m'), e
    page.click('label.track-variant')
    e = estados['desmarcado'] = page.evaluate(CARD)
    assert e['pressed'] == 'true' and not e['checked'] and e['name'] == 'Chapecó' and e['saved'] == 'chapeco', e
    # Marcada com outra pista escolhida: a caixa fica, o cartão mostra o oval e o escolhe.
    page.click('label.track-variant')
    page.click('.track-cards [data-circuit="cascavel"]')
    e = estados['outra'] = page.evaluate(CARD)
    assert e['pressed'] == 'false' and e['checked'] and e['name'] == 'Oval de Chapecó' and e['saved'] == 'cascavel', e
    page.click('.track-cards [data-circuit="chapeco"]')
    e = estados['volta'] = page.evaluate(CARD)
    assert e['pressed'] == 'true' and e['checked'] and e['saved'] == 'chapecooval', e
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    report[nome] = estados
    return context, page


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    tela_das_pistas(browser, 'celular', {'width': 844, 'height': 390}, mobile=True)[0].close()
    tela_das_pistas(browser, 'classico', {'width': 1366, 'height': 800}, classic=True)[0].close()
    context, page = tela_das_pistas(browser, 'paddock', {'width': 1500, 'height': 900})
    # A corrida no oval.
    choose_race(page)
    wait_js(page, "window.interlagos?.ready&&interlagos.circuit==='chapecooval'&&!interlagos.state.paused", timeout=240000)
    page.evaluate('interlagos.skipIntro?.()')
    page.wait_for_timeout(2500)
    info = page.evaluate("""async()=>{const {closedRoads}=await import('./closed-roads.js');
      return {circuit:interlagos.circuit,length:interlagos.car.data.meta.reconstructed_xy_m,pit:interlagos.pitInfo(),
        closed:closedRoads.current?.stats??null,wordmark:document.querySelector('.wordmark').textContent};}""")
    assert info['circuit'] == 'chapecooval' and 1440 < info['length'] < 1480, info
    report['corrida'] = {k: info[k] for k in ('circuit', 'length', 'closed', 'wordmark')}
    page.screenshot(path=str(FOTOS / 'oval_largada.png'))
    for nome, kind, s, d, turn in VIEWS:
        state = page.evaluate(PLACE, [kind, s, d, turn])
        page.wait_for_timeout(900)
        page.screenshot(path=str(FOTOS / f'oval_{nome}.png'))
        report.setdefault('vistas', []).append({'nome': nome, **state})
        assert state['onRoad'], state
    # Do alto sobre a ligação (C troca chase, close, hood, cockpit, tv, aerea).
    page.evaluate(PLACE, ['track', 1240, 0, 0])
    for _ in range(5):
        page.keyboard.press('KeyC')
    page.wait_for_timeout(1500)
    page.screenshot(path=str(FOTOS / 'oval_ligacao_aerea.png'))
    context.close()
    browser.close()
print(json.dumps(report, ensure_ascii=False, indent=1))
assert not errors, errors
print(json.dumps({'passed': True}))
