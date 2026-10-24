"""A ponte de "Orla · Zoológico" e os córregos sob ela no navegador: pampulha-pontes.js montado, sem erros, fora da pista, e fotos.

    python verificar_ponte_pampulha.py [porta] [pasta das fotos] [--sem-celular] [--sem-noite]

Abre o Circuito da Pampulha pelo seletor (?circuito=pampulha) no Treino solo e confere o módulo
(sceneryInfo().extras.Marcos_Pampulha_Pontes): montado sem erro nas duas partes (os canais dos córregos Ressaca e
Sarandi, a ponte do trecho meta.decks), nenhum vértice no espaço de rodagem da volta, os canais com a boca na lagoa e os
bueiros nas pontas, a ponte com encontros e pilares (ao lado do canal), a água dos canais com o material da própria lagoa
(achado na cena), poucos draw calls, o detalhe de celular mais leve, as luzes acesas à noite. Fotografa a ponte chegando
na perseguição, a perseguição sobre ela e o olho do piloto, de pé na cornija para o canal dos dois lados, o canal sob a ponte,
a ponte de lado, do alto, a boca na lagoa, um bueiro e à noite. Monta um mosaico ponte_mosaico.jpg.
Fotos JPG em pista_interlagos/renders/pampulha/previas/rodada_03/ponte (ou na pasta dada).
"""
import json
import math
import sys
from pathlib import Path

from browser_config import browser_executable, browser_args, wait_js, start_race
from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8896'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'pampulha' / 'previas' / 'rodada_03' / 'ponte'
FOTOS.mkdir(parents=True, exist_ok=True)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_pampulha.json').read_text(encoding='utf-8'))
A = DADOS['samples']
L = DADOS['meta']['reconstructed_xy_m']
DECK = DADOS['meta']['decks'][0]
CANAIS = DADOS['scenery']['canals']
AGUA = CANAIS[0].get('water', 0.8)
CHAVE = 'Marcos_Pampulha_Pontes'
PARTES = ('canals', 'bridge')
erros = []
falhas = []
tiradas = []


def chao(x, y, h=0.0):
    """O chão da grade do arquivo de pista em (x, y) (bilinear), mais h."""
    t = DADOS['terrain']
    fx, fy = (x - t['x0']) / t['step'], (y - t['y0']) / t['step']
    i, j = min(t['nx'] - 2, int(fx)), min(t['ny'] - 2, int(fy))
    u, v, k = fx - i, fy - j, j * t['nx'] + i
    z = t['z']
    return (z[k] * (1 - u) + z[k + 1] * u) * (1 - v) + (z[k + t['nx']] * (1 - u) + z[k + t['nx'] + 1] * u) * v + h


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


def cruzamento():
    """Onde um trecho de canal passa sob a ponte: o ponto, a direção da água (unitária) e o s da volta."""
    est = [estacao(s) for s in [DECK[0] + k * (DECK[1] - DECK[0]) / 40 for k in range(41)]]
    for c in CANAIS:
        for c0, c1 in zip(c['line'], c['line'][1:]):
            r = (c1[0] - c0[0], c1[1] - c0[1])
            for a, b in zip(est, est[1:]):
                e = (b['x'] - a['x'], b['y'] - a['y'])
                den = r[0] * e[1] - r[1] * e[0]
                if abs(den) < 1e-9:
                    continue
                u = ((a['x'] - c0[0]) * e[1] - (a['y'] - c0[1]) * e[0]) / den
                v = ((a['x'] - c0[0]) * r[1] - (a['y'] - c0[1]) * r[0]) / den
                if 0 <= u <= 1 and 0 <= v <= 1:
                    l = math.hypot(*r)
                    return (c0[0] + r[0] * u, c0[1] + r[1] * u), (r[0] / l, r[1] / l), a['s'] + (b['s'] - a['s']) * v
    raise AssertionError('nenhum canal passa sob a ponte')


def ponta_na_lagoa():
    """A ponta de canal que dá na lagoa (a boca): o ponto e a direção da água ao chegar nela."""
    cob = DADOS['scenery']['cover']
    def lagoa(x, y):
        i, j = int((x - cob['x0']) // cob['step']), int((y - cob['y0']) // cob['step'])
        return 0 <= i < cob['nx'] and 0 <= j < cob['ny'] and cob['classes'][j * cob['nx'] + i] == '6'
    for c in CANAIS:
        a, b = c['line'][-2], c['line'][-1]
        # (Não a emenda com o trecho seguinte, que começa ali.)
        if any(math.hypot(o['line'][0][0] - b[0], o['line'][0][1] - b[1]) < .6 for o in CANAIS):
            continue
        l = math.hypot(b[0] - a[0], b[1] - a[1])
        d = ((b[0] - a[0]) / l, (b[1] - a[1]) / l)
        if all(lagoa(b[0] + d[0] * k, b[1] + d[1] * k) and chao(b[0] + d[0] * k, b[1] + d[1] * k) < AGUA - .3 for k in (6, 12)):
            return b, d
    raise AssertionError('nenhum canal dá na lagoa')


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
    caminho = FOTOS / f'ponte_{nome}.jpg'
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
        desenho.text((x + 6, y + 5), caminho.stem.replace('ponte_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'ponte_mosaico.jpg'
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
    start_race(page, '#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.();true')
    page.wait_for_timeout(4000)


def cornija(s, lado, alvo_lat, alvo_ds=0, alvo_z=-1.0):
    """De pé na cornija da ponte do lado dado (+1 esquerda, -1 direita), por fora do muro, olhando um alvo desse lado."""
    e = estacao(s)
    k = lado * (e['w'] / 2 + 2.2)
    de = [e['x'] + e['n'][0] * k, e['y'] + e['n'][1] * k, e['z'] + 1.9]
    f = estacao(s + alvo_ds)
    para = [f['x'] + f['n'][0] * lado * alvo_lat, f['y'] + f['n'][1] * lado * alvo_lat, f['z'] + alvo_z]
    return e, de, para


(cx, cy), (ux, uy), s_canal = cruzamento()
nx, ny = -uy, ux
boca, dboca = ponta_na_lagoa()
print('canal sob a ponte em s', round(s_canal, 1), 'boca', boca, flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None, print('console', m.type, m.text[:300], flush=True)) if m.type == 'error' else None)
    abrir(page, 'pampulha')
    page.wait_for_timeout(1500)
    info = page.evaluate("()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'pampulha', info
    est = (info['scenery'].get('extras') or {}).get(CHAVE)
    assert est, 'pampulha-pontes.js não montou nada'
    print(json.dumps(est, ensure_ascii=False), flush=True)
    print('draw calls da cena:', info['drawCalls'], flush=True)
    if est.get('error'):
        falhas.append(('erro ao montar', est['error']))
    for parte in PARTES:
        if not est.get(parte) or (isinstance(est[parte], dict) and est[parte].get('error')):
            falhas.append(('parte', parte, est.get(parte)))
    if (est.get('driveSpace') or {}).get('violations'):
        falhas.append(('espaço de rodagem', est['driveSpace']))
    canais = est.get('canals') or {}
    if not canais.get('chains') or canais.get('mouths', 0) < 1 or canais.get('headwalls', 0) < 1:
        falhas.append(('canais sem boca ou sem bueiros', canais))
    ponte = (est.get('bridge') or [{}])[0]
    if len(ponte.get('abutments') or []) != 2 or ponte.get('piers', 0) < 2 or not ponte.get('crossings') or ponte.get('lamps', 0) < 1:
        falhas.append(('ponte sem encontros, pilares ou luzes', ponte))
    if est.get('water') != 'lagoa':
        falhas.append(('a água dos canais não pegou o material da lagoa', est.get('water')))
    if est.get('drawCalls', 99) > 8:
        falhas.append(('draw calls demais', est.get('drawCalls')))

    if '--sem-celular' not in sys.argv:
        movel = page.evaluate("""async()=>{const m=await import('./pampulha-pontes.js');const d=await (await fetch('../dados/pista_pampulha.json')).json();
         const r=m.createPampulhaPontes(d,{mobile:true});const s=r.stats;r.root.traverse(o=>{o.geometry?.dispose();});
         return {drawCalls:s.drawCalls,triangles:s.triangles,violations:s.driveSpace?.violations,error:s.error??null};}""")
        print('celular:', movel, flush=True)
        if movel['violations'] or movel['error'] or not movel['triangles'] or movel['triangles'] >= est.get('triangles', 0):
            falhas.append(('detalhe de celular', movel))

    a0, a1 = DECK
    # Da volta: chegando à ponte e sobre ela na perseguição, o olho do piloto; de pé na cornija, o canal dos dois lados.
    em(page, 5480, 'chase')
    foto(page, 'volta_chegando_perseguicao')
    em(page, a0 + 2, 'chase')
    foto(page, 'volta_sobre_perseguicao')
    em(page, a0 + 4, 'cockpit')
    foto(page, 'volta_interna')
    camera(page, 'chase')
    for lado, nome in [(-1, 'cornija_jusante'), (1, 'cornija_montante')]:
        e, de, para = cornija(s_canal, lado, 22, 0, -5.5)
        vista(page, de, para, 64, carro=a0 - 40)
        foto(page, nome)
    s_fora = a0 - 120
    zw = AGUA
    # Do canal sob a ponte (a jusante, olhando para montante), de lado, do alto.
    vista(page, [cx + ux * 30, cy + uy * 30, zw + 2.6], [cx - ux * 12, cy - uy * 12, zw + 1.2], 62, carro=s_fora)
    foto(page, 'canal_sob')
    vista(page, [cx + ux * 22 + nx * 16, cy + uy * 22 + ny * 16, chao(cx + ux * 22 + nx * 16, cy + uy * 22 + ny * 16, 2.2)], [cx, cy, zw + 3.5], 60, carro=s_fora)
    foto(page, 'lado')
    vista(page, [cx - ux * 24 - nx * 18, cy - uy * 24 - ny * 18, chao(cx - ux * 24 - nx * 18, cy - uy * 24 - ny * 18, 3)], [cx, cy, zw + 3.5], 60, carro=s_fora)
    foto(page, 'lado_montante')
    vista(page, [cx + 30, cy + 40, 48], [cx, cy - 4, 1], 52, carro=s_fora)
    foto(page, 'alto')
    # A boca: o canal entrando na lagoa, olhando de dentro da lagoa para o canal.
    bx, by = boca
    vista(page, [bx + dboca[0] * 24 - dboca[1] * 8, by + dboca[1] * 24 + dboca[0] * 8, zw + 4], [bx - dboca[0] * 18, by - dboca[1] * 18, zw + .8], 60, carro=s_fora)
    foto(page, 'boca')
    # Um bueiro: a ponta a montante do canal que passa sob a ponte.
    sob = next(c for c in CANAIS if any(math.hypot(q[0] - cx, q[1] - cy) < 60 for q in c['line']) and math.hypot(c['line'][0][0] - cx, c['line'][0][1] - cy) > 25)
    (qx, qy), (rx, ry) = sob['line'][0], sob['line'][1]
    l = math.hypot(rx - qx, ry - qy)
    d = ((rx - qx) / l, (ry - qy) / l)
    vista(page, [qx + d[0] * 20, qy + d[1] * 20, zw + 5], [qx, qy, zw + .5], 58, carro=s_fora)
    foto(page, 'bueiro')
    if '--sem-noite' not in sys.argv:
        page.evaluate("interlagosClima.set({time:'noite'});true")
        # A noite traz programas novos (compilados em fatias): a tela fica parada uns segundos; espera e aquece a vista.
        page.wait_for_timeout(9000)
        vista(page, [cx + ux * 22 + nx * 16, cy + uy * 22 + ny * 16, chao(cx + ux * 22 + nx * 16, cy + uy * 22 + ny * 16, 2.2)], [cx, cy, zw + 3.5], 60, espera=8000, carro=s_fora)
        noite = page.evaluate(f"()=>interlagos.sceneryInfo().extras?.{CHAVE}?.night??null")
        print('noite:', noite, flush=True)
        if not noite:
            falhas.append(('noite', noite))
        foto(page, 'noite_lado')
        em(page, 5500, 'chase', espera=3000)
        foto(page, 'noite_volta_chegando')
        camera(page, 'chase')
        page.evaluate("interlagosClima.set({time:'dia'});true")
    page.evaluate('interlagosLuz.photo(null);true')
    mosaico()
    browser.close()
assert not erros, erros
assert not falhas, falhas
print(json.dumps({'passed': True}, ensure_ascii=False))
