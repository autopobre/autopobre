"""O ramal da Pampulha no navegador: a bifurcação perto da Igrejinha (data.branches), montada, sem erros, e fotos.

    python verificar_ramal_pampulha.py [porta] [pasta das fotos] [--sem-noite]

Abre o Circuito da Pampulha (?circuito=pampulha) no Treino solo e confere o que se vê do ramal (branch-scenery.js e os
muros em street-walls.js): o asfalto próprio do ramal, as linhas, o pórtico com a placa antes da bifurcação, os
atenuadores (barris) nos dois bicos, os muros do ramal desenhados com os da volta, poucas chamadas de desenho, nenhum
erro na página, e nenhum marco da Pampulha (pampulha-*.js) no espaço de rodagem, que agora inclui o ramal. Fotografa: chegando à bifurcação na perseguição (a placa no alto), a placa de perto, a separação do
alto, o carro descendo o ramal em frente ao Parque Guanabara (perseguição e interna; o carro posto no ramal pelas
coordenadas de branchPoint), a junção e o seu bico, a volta pela praça da Igrejinha vista do ramal, as duas pontas em
planta, e a bifurcação à noite. Monta um mosaico ramal_mosaico.jpg.
Fotos JPG em pista_interlagos/renders/pampulha/previas/rodada_03/ramal (ou na pasta dada).
"""
import json
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

import browser_config  # noqa: F401  (headless e a trava do mouse dentro da página, antes de qualquer página)
from browser_config import browser_executable, browser_args, wait_js

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8893'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'pampulha' / 'previas' / 'rodada_03' / 'ramal'
FOTOS.mkdir(parents=True, exist_ok=True)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_pampulha.json').read_text(encoding='utf-8'))
A = DADOS['samples']
L = DADOS['meta']['reconstructed_xy_m']
R = DADOS['branches'][0]
RC = {k: i for i, k in enumerate(R['columns'])}
IGREJINHA = next(m for m in DADOS['scenery']['landmarks'] if m['kind'] == 'igrejinha')
GUANABARA = next(m for m in DADOS['scenery']['landmarks'] if m['kind'] == 'parque_guanabara')
NARIZES = R['noses']
CHAVE = 'Ramal_cenario'
erros = []
falhas = []
tiradas = []


def estacao(s):
    """Centro, altura, largura, tangente e normal à esquerda da volta em s."""
    s %= L
    i = max(k for k, q in enumerate(A) if q[0] <= s)
    a, b = A[i], A[(i + 1) % len(A)]
    vao = (b[0] if i + 1 < len(A) else L) - a[0]
    u = (s - a[0]) / vao if vao > 0 else 0
    v = [x + (y - x) * u for x, y in zip(a, b)]
    t = math.hypot(v[7], v[8]) or 1
    n = math.hypot(v[9], v[10]) or 1
    return {'s': s, 'x': v[1], 'y': v[2], 'z': v[3], 'w': v[4], 't': (v[7] / t, v[8] / t), 'n': (v[9] / n, v[10] / n)}


def ramal(s):
    """A estação do ramal em s (s do ramal): centro, altura, largura, tangente e normal à esquerda."""
    a = R['samples']
    s = max(0, min(R['length_m'], s))
    i = max(k for k, q in enumerate(a[:-1]) if q[0] <= s)
    p, q = a[i], a[i + 1]
    u = (s - p[0]) / (q[0] - p[0])
    v = [x + (y - x) * u for x, y in zip(p, q)]
    t = math.hypot(v[RC['tx']], v[RC['ty']]) or 1
    return {'s': s, 'x': v[RC['x']], 'y': v[RC['y']], 'z': v[RC['z']], 'w': v[RC['width']], 't': (v[RC['tx']] / t, v[RC['ty']] / t),
            'n': (v[RC['lx']], v[RC['ly']])}


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def na_volta(page, s, modo='chase', espera=2200):
    """O carro parado na estação da volta mais próxima de s, na câmera dada."""
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));true}", s)
    camera(page, modo)
    page.wait_for_timeout(espera)


def no_ramal(page, s, modo='chase', d=0, espera=2600):
    """O carro parado no ramal em s (branchPoint), d metros à esquerda do centro, apontado no sentido do ramal."""
    page.evaluate("""async a=>{interlagosLuz.photo(null);const B=await import('./branch-lane.js'),c=interlagos.car,g=B.branchGeometries(c.data)[0],p=B.branchPoint(g,a.s,a.d);
      const i=c.a.findIndex(q=>q[0]>=p.mainS);interlagos.reposition(Math.max(0,i));c.relocate(p.x,p.y,p.z,p.heading);c.vx=c.vy=0;true}""", {'s': s, 'd': d})
    camera(page, modo)
    page.wait_for_timeout(espera)


def vista(page, de, para, fov=50, espera=1800, carro=None, ramal_s=None):
    """Câmera parada em coordenadas da pista (x leste, y norte, z altura); o carro na volta em s ou no ramal."""
    if ramal_s is not None:
        no_ramal(page, ramal_s, espera=400)
    elif carro is not None:
        page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));true}", carro)
        page.wait_for_timeout(400)
    page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});true}", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


def foto(page, nome):
    caminho = FOTOS / f'ramal_{nome}.jpg'
    page.screenshot(path=str(caminho), type='jpeg', quality=86)
    tiradas.append(caminho)
    print('foto', caminho.name, flush=True)


def mosaico():
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print('mosaico: sem PIL', flush=True)
        return
    if not tiradas:
        return
    w, h, col = 480, 270, 4
    linhas = math.ceil(len(tiradas) / col)
    tela = Image.new('RGB', (w * col, (h + 22) * linhas), (24, 24, 24))
    desenho = ImageDraw.Draw(tela)
    for k, caminho in enumerate(tiradas):
        img = Image.open(caminho).convert('RGB').resize((w, h))
        x, y = (k % col) * w, (k // col) * (h + 22)
        tela.paste(img, (x, y + 22))
        desenho.text((x + 6, y + 5), caminho.stem.replace('ramal_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'ramal_mosaico.jpg'
    tela.save(destino, quality=86)
    print('mosaico', destino, flush=True)


def abrir(page, circuito):
    page.goto(URL + f'?circuito={circuito}', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    page.click('#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.();true')
    page.wait_for_timeout(4000)


def olho(e, altura=1.15, lado=0.0):
    """O olho de um piloto na estação e, lado metros à esquerda do centro."""
    return [e['x'] + e['n'][0] * lado, e['y'] + e['n'][1] * lado, e['z'] + altura]


def adiante(e, metros, lado=0.0, altura=0.0):
    return [e['x'] + e['t'][0] * metros + e['n'][0] * lado, e['y'] + e['t'][1] * metros + e['n'][1] * lado, e['z'] + altura]


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text) if m.type == 'error' else None, print('console', m.type, m.text, flush=True)) if m.type in ('error', 'warning') else None)
    abrir(page, 'pampulha')
    info = page.evaluate("()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'pampulha', info
    est = (info['scenery'].get('extras') or {}).get(CHAVE)
    barreira = info['scenery'].get('barrier') or {}
    print('ramal:', json.dumps(est, ensure_ascii=False), flush=True)
    print('muros:', json.dumps({k: barreira.get(k) for k in ('sections', 'segments', 'branchMetres', 'coverageRatio')}, ensure_ascii=False), flush=True)
    print('chão:', json.dumps(info['scenery'].get('ground'), ensure_ascii=False), flush=True)
    if not est:
        falhas.append(('branch-scenery.js não montou nada', None))
        est = {}
    for chave, minimo in (('asphaltTriangles', 200), ('paintTriangles', 50), ('gantries', 1), ('noseCount', 2), ('barrels', 4), ('signs', 4)):
        if (est.get(chave) or 0) < minimo:
            falhas.append((f'ramal: {chave} abaixo de {minimo}', est.get(chave)))
    if est.get('drawCalls', 99) > 6:
        falhas.append(('ramal: chamadas de desenho demais', est.get('drawCalls')))
    for nariz in est.get('noses') or []:
        if nariz.get('barrels', 0) < 2:
            falhas.append(('bico com menos de dois barris', nariz))
    if not est.get('chevron'):
        falhas.append(('sem a placa de chevrons no bico da separação', None))
    if (barreira.get('branchMetres') or 0) < 400:
        falhas.append(('muros do ramal não desenhados', barreira.get('branchMetres')))
    # Os marcos da Pampulha guardam o espaço de rodagem (a volta e agora o ramal: branch-layout.js branchSpace): nenhum
    # vértice de nenhum deles nele.
    for nome, extra in (info['scenery'].get('extras') or {}).items():
        espaco = (extra or {}).get('driveSpace')
        if espaco is None:
            continue
        print('espaço de rodagem', nome, espaco.get('violations'), json.dumps(espaco.get('worst'), ensure_ascii=False), flush=True)
        if espaco.get('violations'):
            falhas.append((f'{nome}: vértices no espaço de rodagem', espaco))
    # O nome do lugar no painel com o carro no ramal (quando a física já diz que ele está nele).
    no_ramal(page, 200, 'chase')
    lugar = page.evaluate("()=>({location:document.getElementById('location').textContent,branch:interlagos.car.surface?.branch??null})")
    print('no ramal:', lugar, flush=True)
    if lugar['branch'] is not None and lugar['location'] != R['label']:
        falhas.append(('nome do lugar no ramal', lugar))

    g = info['scenery'].get('extras', {}).get(CHAVE, {}).get('gantry') or {}
    PLACA = [g.get('x', 0), g.get('y', 0), g.get('z', 8)]
    n0, n1 = NARIZES[0], NARIZES[1]
    # Chegando à bifurcação: a placa no alto, na perseguição e do olho; a placa de perto.
    na_volta(page, 985, 'chase')
    foto(page, 'chegando_perseguicao')
    na_volta(page, 1030, 'cockpit')
    foto(page, 'chegando_interna')
    e = estacao(1000)
    vista(page, olho(e, 1.3, 2), PLACA, 46, carro=990)
    foto(page, 'placa_olho')
    e = estacao(1035)
    vista(page, olho(e, 2.2, -3), PLACA, 40, carro=990)
    foto(page, 'placa_perto')
    # A separação do alto e de lado.
    vista(page, [n0['x'] + 70, n0['y'] - 90, n0['z'] + 70], [n0['x'] - 10, n0['y'] - 10, n0['z']], 50, carro=900)
    foto(page, 'separacao_do_alto')
    vista(page, [n0['x'], n0['y'] + 6, n0['z'] + 105], [n0['x'], n0['y'], n0['z']], 32, carro=900)
    foto(page, 'separacao_planta')
    e = estacao(1150)
    vista(page, olho(e, 1.2, 0), [n0['x'], n0['y'], n0['z'] + .6], 55, carro=900)
    foto(page, 'separacao_olho')
    vista(page, [n0['x'] + 9, n0['y'] - 5, n0['z'] + 2.2], [n0['x'], n0['y'], n0['z'] + .5], 60, carro=900)
    foto(page, 'bico_separacao_perto')
    # No ramal: entrando, em frente ao Parque Guanabara (perseguição e interna) e do lado.
    no_ramal(page, 70, 'chase')
    foto(page, 'ramal_entrando_perseguicao')
    no_ramal(page, 130, 'chase', d=-2)
    foto(page, 'ramal_guanabara_perseguicao')
    no_ramal(page, 160, 'cockpit', d=-2)
    foto(page, 'ramal_guanabara_interna')
    e = ramal(150)
    vista(page, olho(e, 1.3, -4), [GUANABARA['x'], GUANABARA['y'], GUANABARA['ground'] + 8], 66, ramal_s=150)
    foto(page, 'ramal_guanabara_olho')
    e = ramal(215)
    vista(page, olho(e, 1.3, 2.5), [IGREJINHA['x'], IGREJINHA['y'], IGREJINHA['ground'] + 5], 52, ramal_s=230)
    foto(page, 'ramal_igrejinha_olho')
    # A junção: chegando pelo ramal, o bico do alto e de perto, e do lado da volta.
    no_ramal(page, 270, 'chase', d=-2)
    foto(page, 'juncao_perseguicao')
    vista(page, [n1['x'] - 45, n1['y'] - 60, n1['z'] + 45], [n1['x'], n1['y'], n1['z']], 50, carro=900)
    foto(page, 'juncao_do_alto')
    vista(page, [n1['x'], n1['y'] + 6, n1['z'] + 105], [n1['x'], n1['y'], n1['z']], 32, carro=900)
    foto(page, 'juncao_planta')
    vista(page, [n1['x'] + 6, n1['y'] + 9, n1['z'] + 2.2], [n1['x'], n1['y'], n1['z'] + .5], 62, carro=900)
    foto(page, 'bico_juncao_perto')
    na_volta(page, 1490, 'chase')
    foto(page, 'volta_praca_perseguicao')
    if '--sem-noite' not in sys.argv:
        page.evaluate("interlagosClima.set({time:'noite'});true")
        page.wait_for_timeout(9000)
        na_volta(page, 1005, 'chase', espera=4000)
        foto(page, 'noite_chegando_perseguicao')
        e = estacao(1000)
        vista(page, olho(e, 1.3, 2), PLACA, 46, espera=3000, carro=990)
        foto(page, 'noite_placa_olho')
        vista(page, [n0['x'] + 70, n0['y'] - 90, n0['z'] + 70], [n0['x'] - 10, n0['y'] - 10, n0['z']], 50, espera=3000, carro=900)
        foto(page, 'noite_separacao_do_alto')
        page.evaluate("interlagosClima.set({time:'dia'});true")
    page.evaluate('interlagosLuz.photo(null);true')
    mosaico()
    browser.close()
erros = [e for e in erros if 'THREE.Clock' not in e]
assert not erros, erros
assert not falhas, falhas
print(json.dumps({'passed': True}, ensure_ascii=False))
