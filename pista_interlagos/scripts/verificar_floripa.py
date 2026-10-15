"""Autodromo Floripa no navegador: a volta no meio da cidade real (data.scenery.city, gerar_cidade_floripa.py).

    python verificar_floripa.py [porta] [pasta das fotos] [--sem-vistas] [--noite]

Abre ?circuito=floripa no Treino solo, confere que os modulos da cidade estao montados (chao LAND_CITY, predios nas
pegadas reais, pintura das ruas, bloqueios, mobiliario, beira-mar, torcida nas calcadas), sem erros de pagina nem de
shader no console (de dia e, com --noite, a noite: o chao da cidade cabe nas unidades de textura), e fotografa a volta
como verificar_floripa.py, mais vistas da cidade. O carro anda no tabuleiro das pontes ate o muro. Fotos em
renders/floripa_*.png (ou na pasta dada).
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8799'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
FOTOS = Path(args[1]) if len(args) > 1 else Path(__file__).resolve().parents[1] / 'renders'
FOTOS.mkdir(parents=True, exist_ok=True)
erros = []


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=1800):
    """O carro parado na estacao mais proxima de s (m da volta), na camera dada."""
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", s)
    camera(page, modo)
    page.wait_for_timeout(espera)


def vista(page, de, para, fov=50, espera=1500):
    """Camera parada em coordenadas da pista (x leste, y norte, z altura)."""
    page.evaluate("p=>interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true})", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


def foto(page, nome):
    page.screenshot(path=str(FOTOS / f'floripa_{nome}.png'))
    print('foto', nome, flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    # Erros de console contam (um shader que nao compila so aparece ali); os avisos do compilador do D3D nao.
    page.on('console', lambda m: (erros.append(m.text[:300]), print('console', m.type, m.text[:300], flush=True)) if m.type == 'error' else None)
    page.goto(URL + '?circuito=floripa', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    assert page.get_attribute('[data-circuit="floripa"]', 'aria-pressed') == 'true'
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    page.click('#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.()')
    page.wait_for_timeout(5000)
    info = page.evaluate("()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'floripa', info
    sc = info['scenery']
    print(json.dumps({k: sc.get(k) for k in ('trees', 'houses', 'chunks', 'fans', 'circuit', 'ground')}, ensure_ascii=False), flush=True)
    extras = sc.get('extras') or {}
    for nome in ('Predios_cidade', 'Pintura_cidade', 'Bloqueios_ruas', 'Mobiliario_urbano', 'Beira_mar', 'Pontes_Floripa', 'Marcos_Floripa', 'Mar'):
        assert nome in extras and not extras[nome].get('stub'), (nome, list(extras))
    print(json.dumps({k: {q: v for q, v in extras[k].items() if not isinstance(v, (dict, list))} for k in extras}, ensure_ascii=False)[:3000], flush=True)
    foto(page, 'largada')
    pontos = [(4380, 'chase', 'grid_ponte'), (60, 'chase', 'ponte_vao'), (60, 'cockpit', 'ponte_cockpit'), (300, 'chase', 'cabeceira_ilha'),
              (420, 'chase', 'adolfo_konder'), (700, 'chase', 'hoepcke'), (900, 'chase', 'claudino'), (1200, 'chase', 'paulo_fontes'),
              (1250, 'far', 'boxes_rodoviaria'), (1480, 'chase', 'pedro_bittencourt'), (1900, 'chase', 'colombo_subida'),
              (2400, 'chase', 'colombo_meio'), (2400, 'far', 'colombo_longe'), (3200, 'chase', 'estreito_alca'),
              (3550, 'chase', 'rua_14_de_julho'), (3850, 'chase', 'ivo_silveira'), (4000, 'chase', 'cabeceira_continente')]
    for s, modo, nome in pontos:
        em(page, s, modo)
        foto(page, nome)
    # Vistas de longe: a Hercilio Luz do mar, a Colombo Salles, a cidade sobre a baia.
    if '--sem-vistas' not in sys.argv:
        hl = page.evaluate("()=>{const a=interlagos.car.a;const p=a[0];return [p[1],p[2],p[3]]}")
        x, y, z = hl
        for nome, de, para, fov in [('hl_do_mar_sul', [x + 120, y - 420, 12], [x - 40, y + 40, 30], 45),
                                    ('hl_do_mar_norte', [x - 60, y + 520, 18], [x + 20, y - 20, 25], 45),
                                    ('baia_alto', [x - 900, y - 900, 260], [x + 300, y + 100, 0], 55),
                                    ('ilha_alto', [x + 200, y - 300, 140], [x + 1500, y - 200, 20], 55)]:
            vista(page, de, para, fov)
            foto(page, nome)
        page.evaluate('interlagosLuz.photo(null)')
    # A noite: o chao da cidade compila (unidades de textura), lampadas e janelas acendem.
    if '--noite' in sys.argv:
        page.evaluate("interlagosClima.set({time:'noite'});true")
        page.wait_for_timeout(9000)
        for s, modo, nome in [(700, 'chase', 'noite_hoepcke'), (1200, 'chase', 'noite_paulo_fontes'), (3550, 'chase', 'noite_14_de_julho')]:
            em(page, s, modo, 2500)
            foto(page, nome)
        if '--sem-vistas' not in sys.argv:
            vista(page, [x + 200, y - 300, 140], [x + 1500, y - 200, 20], 55, 2500)
            foto(page, 'noite_ilha_alto')
            page.evaluate('interlagosLuz.photo(null)')
        page.evaluate("interlagosClima.set({time:'dia'});true")
        page.wait_for_timeout(4000)
    # No tabuleiro, contra o muro: o carro nunca desce para o mar.
    em(page, 200, 'chase', 600)
    z0 = page.evaluate("()=>{const c=interlagos.car;c.heading+=.6;c.vx=20*Math.cos(c.heading);c.vy=20*Math.sin(c.heading);c.stepX=c.x;c.stepY=c.y;return c.z}")
    page.wait_for_timeout(3000)
    z1 = page.evaluate('interlagos.car.z')
    print(f'muro na ponte: z {z0:.1f} -> {z1:.1f}', flush=True)
    assert z1 > z0 - 3, 'o carro caiu da ponte'
    browser.close()
assert not erros, erros
print(json.dumps({'passed': True}, ensure_ascii=False))
