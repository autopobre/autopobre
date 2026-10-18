"""A Igrejinha da Pampulha no navegador: pampulha-igrejinha.js montado, sem erros, fora da pista, e fotos.

    python verificar_igrejinha.py [porta] [pasta das fotos] [--sem-celular] [--sem-noite] [--so-perto]

Abre o Circuito da Pampulha pelo seletor (?circuito=pampulha) no Treino solo e confere o módulo
(sceneryInfo().extras.Marcos_Pampulha_Igrejinha): montado sem erro, nenhum vértice no espaço de rodagem da volta, o
detalhe de celular mais leve. Fotografa a igreja da volta (a rua em volta da pracinha passa uns 25 m atrás dela, do
lado do painel de azulejos), chegando, passando e saindo, na câmera de perseguição, na interna e do olho do piloto;
do lado da lagoa (a frente, a marquise e a torre); de perto o painel de azulejos, a frente, o lado com a faixa de
pastilhas e a torre; do alto; e à noite (os refletores), também da pista. Monta um mosaico igrejinha_mosaico.jpg.
Fotos JPG em pista_interlagos/renders/pampulha/previas/rodada_01b/igrejinha (ou na pasta dada).
"""
import json
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8893'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'pampulha' / 'previas' / 'rodada_01b' / 'igrejinha'
FOTOS.mkdir(parents=True, exist_ok=True)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_pampulha.json').read_text(encoding='utf-8'))
A = DADOS['samples']
L = DADOS['meta']['reconstructed_xy_m']
M = next(m for m in DADOS['scenery']['landmarks'] if m['kind'] == 'igrejinha')
erros = []
falhas = []
tiradas = []

# O referencial da igreja: u no rumo (heading), v à esquerda dele (a frente olha +v, para a lagoa), z do chão.
C, S = math.cos(M['heading']), math.sin(M['heading'])


def igreja(u, v, z):
    return [M['x'] + u * C - v * S, M['y'] + u * S + v * C, M['ground'] + z]


def estacao(s):
    """Centro, altura, largura, tangente e normal à esquerda da volta em s."""
    s %= L
    i = max(k for k, p in enumerate(A) if p[0] <= s)
    p, q = A[i], A[(i + 1) % len(A)]
    vao = (q[0] if i + 1 < len(A) else L) - p[0]
    u = (s - p[0]) / vao if vao > 0 else 0
    v = [a + (b - a) * u for a, b in zip(p, q)]
    t = math.hypot(v[7], v[8]) or 1
    n = math.hypot(v[9], v[10]) or 1
    return {'s': s, 'x': v[1], 'y': v[2], 'z': v[3], 'w': v[4], 't': (v[7] / t, v[8] / t), 'n': (v[9] / n, v[10] / n)}


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=2200):
    """O carro parado na estação mais próxima de s, na câmera dada."""
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));true}", s)
    camera(page, modo)
    page.wait_for_timeout(espera)


def vista(page, de, para, fov=50, espera=1800, carro=None):
    """Câmera parada em coordenadas da pista (x leste, y norte, z altura); o carro em s (a sombra do sol o segue)."""
    if carro is not None:
        page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));true}", carro)
        page.wait_for_timeout(400)
    page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});true}", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


def foto(page, nome):
    caminho = FOTOS / f'igrejinha_{nome}.jpg'
    page.screenshot(path=str(caminho), type='jpeg', quality=86)
    tiradas.append(caminho)
    print('foto', caminho.name, flush=True)


def mosaico():
    try:
        from PIL import Image, ImageDraw
    except ImportError:
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
        desenho.text((x + 6, y + 5), caminho.stem.replace('igrejinha_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'igrejinha_mosaico.jpg'
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


# A estação da volta mais perto da igreja (a rua em volta da pracinha passa atrás dela).
s_perto = min(range(0, int(L), 4), key=lambda s: math.hypot(estacao(s)['x'] - M['x'], estacao(s)['y'] - M['y']))


def olho(s, lado=1.6):
    """O olho do piloto na faixa da volta do lado da igreja, em s."""
    e = estacao(s)
    dx, dy = M['x'] - e['x'], M['y'] - e['y']
    sinal = 1 if dx * e['n'][0] + dy * e['n'][1] > 0 else -1
    k = sinal * (e['w'] / 2 - lado)
    return e, [e['x'] + e['n'][0] * k, e['y'] + e['n'][1] * k, e['z'] + 1.15]


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text) if m.type == 'error' else None, print('console', m.type, m.text, flush=True)) if m.type in ('error', 'warning') else None)
    abrir(page, 'pampulha')
    info = page.evaluate("()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'pampulha', info
    est = (info['scenery'].get('extras') or {}).get('Marcos_Pampulha_Igrejinha')
    assert est, 'pampulha-igrejinha.js não montou nada'
    print(json.dumps(est, ensure_ascii=False), flush=True)
    print('draw calls da cena:', info['drawCalls'], 'estação mais perto:', s_perto, flush=True)
    if est.get('error'):
        falhas.append(('erro ao montar', est['error']))
    if (est.get('driveSpace') or {}).get('violations'):
        falhas.append(('espaço de rodagem', est['driveSpace']))

    if '--sem-celular' not in sys.argv:
        movel = page.evaluate("""async()=>{const m=await import('./pampulha-igrejinha.js');const d=await (await fetch('../dados/pista_pampulha.json')).json();
         const r=m.createPampulhaIgrejinha(d,{mobile:true});const s=r.stats;r.root.traverse(o=>{o.geometry?.dispose();});
         return {drawCalls:s.drawCalls,triangles:s.triangles,violations:s.driveSpace?.violations,error:s.error??null};}""")
        print('celular:', movel, flush=True)
        if movel['violations'] or movel['error'] or not movel['triangles'] or movel['triangles'] >= est.get('triangles', 0):
            falhas.append(('detalhe de celular', movel))

    so_perto = '--so-perto' in sys.argv
    alvo = igreja(1, -2, 4.5)
    if not so_perto:
        # Da volta: chegando, passando e saindo, na perseguição e na interna; o olho do piloto virado para a igreja.
        for ds, modo, nome in [(-110, 'chase', 'volta_chegando_perseguicao_longe'), (-65, 'chase', 'volta_chegando_perseguicao'), (-35, 'chase', 'volta_chegando_perseguicao_perto'),
                               (-70, 'cockpit', 'volta_chegando_interna'), (-40, 'cockpit', 'volta_chegando_interna_perto'),
                               (0, 'chase', 'volta_passando_perseguicao'), (35, 'chase', 'volta_saindo_perseguicao')]:
            em(page, s_perto + ds, modo)
            foto(page, nome)
        for ds, nome, fov in [(-60, 'volta_chegando_olho', 50), (0, 'volta_passando_olho', 64), (50, 'volta_saindo_olho', 56)]:
            e, de = olho(s_perto + ds)
            vista(page, de, alvo, fov, carro=e['s'])
            foto(page, nome)
        camera(page, 'chase')
    # O carro fora dos quadros (60 m a oeste, a sombra do sol ainda cobre a igreja).
    s_fora = s_perto + 60
    # Do lado da lagoa: a frente (marquise, torre, cruz) de um barco a 90 m; da margem nordeste.
    vista(page, igreja(4, 95, 2.2), igreja(0, 8, 5), 40, carro=s_fora)
    foto(page, 'lagoa_frente')
    vista(page, igreja(-70, 75, 2.6), igreja(0, 0, 4), 42, carro=s_fora)
    foto(page, 'lagoa_noroeste')
    # De perto: o painel de azulejos (fundos), a frente, o lado leste com as pastilhas, a torre, do alto.
    vista(page, igreja(1, -36, 1.7), igreja(1, -14, 3.6), 52, carro=s_fora)
    foto(page, 'painel_azulejos')
    vista(page, igreja(-9, -21.5, 1.7), igreja(4, -14, 3.4), 52, carro=s_fora)
    foto(page, 'painel_azulejos_perto')
    vista(page, igreja(2, 40, 1.7), igreja(0, 10, 5), 56, carro=s_fora)
    foto(page, 'frente')
    vista(page, igreja(30, 22, 1.7), igreja(4, 2, 4), 56, carro=s_fora)
    foto(page, 'lado_leste_cruz')
    vista(page, igreja(-30, -2, 1.7), igreja(-4, 0, 4), 58, carro=s_fora)
    foto(page, 'lado_oeste')
    vista(page, igreja(-4, 24, 1.7), igreja(-12.6, 13.5, 7), 56, carro=s_fora)
    foto(page, 'torre_marquise')
    vista(page, igreja(-45, -55, 42), igreja(0, 0, 2), 50, carro=s_fora)
    foto(page, 'alto')
    if '--sem-noite' not in sys.argv:
        page.evaluate("interlagosClima.set({time:'noite'});true")
        # A noite traz programas novos (compilados em fatias): a tela fica parada uns segundos; espera e aquece a vista.
        page.wait_for_timeout(9000)
        vista(page, igreja(1, -36, 1.7), igreja(1, -14, 3.6), 52, espera=8000, carro=s_fora)
        noite = page.evaluate("()=>interlagos.sceneryInfo().extras?.Marcos_Pampulha_Igrejinha?.night??null")
        print('noite:', noite, flush=True)
        vista(page, igreja(1, -36, 1.7), igreja(1, -14, 3.6), 52, carro=s_fora)
        foto(page, 'noite_painel')
        vista(page, igreja(4, 95, 2.2), igreja(0, 8, 5), 40, carro=s_fora)
        foto(page, 'noite_lagoa_frente')
        if not so_perto:
            e, de = olho(s_perto)
            vista(page, de, alvo, 64, carro=e['s'])
            foto(page, 'noite_volta_passando_olho')
            for ds, modo, nome in [(-65, 'chase', 'noite_volta_chegando_perseguicao'), (-40, 'cockpit', 'noite_volta_chegando_interna')]:
                em(page, s_perto + ds, modo, espera=3000)
                foto(page, nome)
            camera(page, 'chase')
        page.evaluate("interlagosClima.set({time:'dia'});true")
    page.evaluate('interlagosLuz.photo(null);true')
    mosaico()
    browser.close()
assert not erros, erros
assert not falhas, falhas
print(json.dumps({'passed': True}, ensure_ascii=False))
