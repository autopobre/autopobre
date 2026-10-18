"""A Pampulha de Niemeyer no navegador: pampulha-niemeyer.js montado, sem erros, fora da pista, e fotos.

    python verificar_niemeyer.py [porta] [pasta das fotos] [--sem-celular] [--sem-noite] [--so-perto] [--so=baile,museu,iate,jk]

Abre o Circuito da Pampulha pelo seletor (?circuito=pampulha) no Treino solo e confere o módulo
(sceneryInfo().extras.Marcos_PampulhaNiemeyer): montado sem erro, os quatro prédios (Casa do Baile, Museu de Arte, Iate
Tênis Clube, Casa Kubitschek), nenhum vértice no espaço de rodagem da volta, o detalhe de celular mais leve. Para cada
prédio: da volta chegando e passando (câmera de perseguição e interna, e o olho do piloto virado para ele), do outro
lado da lagoa, de perto e do alto; à noite (os refletores e os vidros acesos). Monta um mosaico niemeyer_mosaico.jpg.
Fotos JPG em pista_interlagos/renders/pampulha/previas/rodada_02/niemeyer (ou na pasta dada).
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
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'pampulha' / 'previas' / 'rodada_02' / 'niemeyer'
FOTOS.mkdir(parents=True, exist_ok=True)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_pampulha.json').read_text(encoding='utf-8'))
A = DADOS['samples']
L = DADOS['meta']['reconstructed_xy_m']
MARCOS = {m['kind']: m for m in DADOS['scenery']['landmarks']}
SO = next((a.split('=', 1)[1].split(',') for a in sys.argv[1:] if a.startswith('--so=')), None)
erros = []
falhas = []
tiradas = []


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


def s_mais_perto(x, y):
    i = min(range(len(A)), key=lambda k: math.hypot(A[k][1] - x, A[k][2] - y))
    return A[i][0]


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=2200):
    """O carro parado na estação mais próxima de s, na câmera dada."""
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));true}", s % L)
    camera(page, modo)
    page.wait_for_timeout(espera)


def vista(page, de, para, fov=50, espera=1800, carro=None):
    """Câmera parada em coordenadas da pista (x leste, y norte, z altura); o carro em s (a sombra do sol o segue)."""
    if carro is not None:
        page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));true}", carro % L)
        page.wait_for_timeout(400)
    page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});true}", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


def foto(page, nome):
    caminho = FOTOS / f'niemeyer_{nome}.jpg'
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
    w, h, col = 480, 270, 5
    linhas = math.ceil(len(tiradas) / col)
    tela = Image.new('RGB', (w * col, (h + 22) * linhas), (24, 24, 24))
    desenho = ImageDraw.Draw(tela)
    for k, caminho in enumerate(tiradas):
        img = Image.open(caminho).convert('RGB').resize((w, h))
        x, y = (k % col) * w, (k // col) * (h + 22)
        tela.paste(img, (x, y + 22))
        desenho.text((x + 6, y + 5), caminho.stem.replace('niemeyer_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'niemeyer_mosaico.jpg'
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


def ref(m, u, v, z):
    """Um ponto no referencial do marco: u no rumo (heading), v à esquerda, z acima do chão do marco."""
    c, s = math.cos(m['heading']), math.sin(m['heading'])
    return [m['x'] + u * c - v * s, m['y'] + u * s + v * c, m['ground'] + z]


def olho(s, alvo, lado=1.6):
    """O olho do piloto na faixa da volta do lado do alvo, em s."""
    e = estacao(s)
    dx, dy = alvo[0] - e['x'], alvo[1] - e['y']
    sinal = 1 if dx * e['n'][0] + dy * e['n'][1] > 0 else -1
    k = sinal * (e['w'] / 2 - lado)
    return e, [e['x'] + e['n'][0] * k, e['y'] + e['n'][1] * k, e['z'] + 1.15]


# Cada prédio: o alvo (meio, altura), o s da volta mais perto e as vistas fixas (de, para, fov, nome).
BAILE = MARCOS['casa_do_baile']
MUSEU = MARCOS['museu_de_arte']
IATE = MARCOS['iate']
JK = MARCOS['casa_kubitschek']
PREDIOS = {
    'baile': {'alvo': [992, -342, BAILE['ground'] + 3], 'vistas': [
        ([1015, -392, 12], [995, -342, 4], 44, 'baile_da_avenida_alto'),
        ([965, -285, 2.2], [992, -338, 3.5], 46, 'baile_da_lagoa'),
        ([1013, -369, 4.2], [993, -345, 4], 58, 'baile_ponte_e_salao'),
        ([1012, -312, 2.4], [1002, -330, 4], 60, 'baile_marquise'),
        ([1012, -350, 4.4], [1020, -331, 3], 58, 'baile_palco_e_lago'),
        ([960, -360, 3.9], [980, -346, 4.4], 64, 'baile_salao_perto'),
        ([1050, -395, 50], [995, -340, 2], 50, 'baile_do_alto'),
    ]},
    'museu': {'alvo': [618, -45, MUSEU['ground'] + 6], 'vistas': [
        ([655, 12, 12.5], [620, -40, 15], 44, 'museu_frente_do_lago_dos_jardins'),
        ([640, 5, 11.5], [624, -34, 14], 58, 'museu_entrada_marquise'),
        ([520, -150, 3], [600, -50, 12], 40, 'museu_da_lagoa_sudoeste'),
        ([560, -95, 9], [596, -55, 13], 52, 'museu_anexo_curvo'),
        ([680, -10, 60], [612, -50, 8], 50, 'museu_do_alto'),
    ]},
    'iate': {'alvo': [404, -300, IATE['ground'] + 6], 'vistas': [
        ([470, -215, 3], [400, -292, 8], 44, 'iate_da_lagoa'),
        ([440, -262, 3.2], [405, -292, 8], 56, 'iate_borboleta_perto'),
        ([418, -335, 2.2], [405, -312, 7], 62, 'iate_ponta_sudeste'),
        ([360, -300, 5], [396, -290, 8], 58, 'iate_piscina'),
        ([470, -360, 55], [400, -292, 4], 48, 'iate_do_alto'),
    ]},
    'jk': {'alvo': [-80, -380, JK['ground'] + 3.5], 'vistas': [
        (ref(JK, 40, 3, 2.2), ref(JK, 14, 0, 3.4), 52, 'jk_frente'),
        (ref(JK, 22, -6, 1.6), ref(JK, 13, -7, 2.6), 60, 'jk_varanda_volpi'),
        (ref(JK, -4, 3.5, 1.7), ref(JK, -7, -3.4, 1.6), 64, 'jk_patio_werneck'),
        (ref(JK, 60, -30, 40), ref(JK, 0, 0, 2), 48, 'jk_do_alto'),
    ]},
}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text) if m.type == 'error' else None, print('console', m.type, m.text, flush=True)) if m.type in ('error', 'warning') else None)
    abrir(page, 'pampulha')
    info = page.evaluate("()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'pampulha', info
    est = (info['scenery'].get('extras') or {}).get('Marcos_PampulhaNiemeyer')
    assert est, 'pampulha-niemeyer.js não montou nada'
    print(json.dumps(est, ensure_ascii=False), flush=True)
    print('draw calls da cena:', info['drawCalls'], flush=True)
    if est.get('error'):
        falhas.append(('erro ao montar', est['error']))
    for k, b in (est.get('buildings') or {}).items():
        if b.get('error'):
            falhas.append(('erro em ' + k, b['error']))
    if len(est.get('buildings') or {}) < 4:
        falhas.append(('prédios', list((est.get('buildings') or {}).keys())))
    if (est.get('driveSpace') or {}).get('violations'):
        falhas.append(('espaço de rodagem', est['driveSpace']))

    if '--sem-celular' not in sys.argv:
        movel = page.evaluate("""async()=>{const m=await import('./pampulha-niemeyer.js');const d=await (await fetch('../dados/pista_pampulha.json')).json();
         const r=m.createPampulhaNiemeyer(d,{mobile:true});const s=r.stats;r.root.traverse(o=>{o.geometry?.dispose();});
         return {drawCalls:s.drawCalls,triangles:s.triangles,violations:s.driveSpace?.violations,error:s.error??null};}""")
        print('celular:', movel, flush=True)
        if movel['violations'] or movel['error'] or not movel['triangles'] or movel['triangles'] >= est.get('triangles', 0):
            falhas.append(('detalhe de celular', movel))

    so_perto = '--so-perto' in sys.argv
    for nome, pr in PREDIOS.items():
        if SO and nome not in SO:
            continue
        alvo = pr['alvo']
        s0 = s_mais_perto(alvo[0], alvo[1])
        print(nome, 'estação mais perto', round(s0, 1), flush=True)
        if not so_perto:
            for ds, modo, sufixo in [(-90, 'chase', 'volta_chegando_perseguicao'), (-50, 'cockpit', 'volta_chegando_interna'), (0, 'chase', 'volta_passando_perseguicao')]:
                em(page, s0 + ds, modo)
                foto(page, f'{nome}_{sufixo}')
            for ds, sufixo, fov in [(-60, 'volta_chegando_olho', 52), (0, 'volta_passando_olho', 64)]:
                e, de = olho(s0 + ds, alvo)
                vista(page, de, alvo, fov, carro=e['s'])
                foto(page, f'{nome}_{sufixo}')
            camera(page, 'chase')
        s_fora = s0 + 140
        for de, para, fov, n in pr['vistas']:
            vista(page, de, para, fov, carro=s_fora)
            foto(page, n)
    if '--sem-noite' not in sys.argv:
        page.evaluate("interlagosClima.set({time:'noite'});true")
        # A noite traz programas novos (compilados em fatias): a tela fica parada uns segundos; espera e aquece a vista.
        page.wait_for_timeout(9000)
        noites = [('baile', [1013, -369, 4.2], [993, -345, 4], 58), ('baile', [965, -285, 2.2], [992, -338, 3.5], 46),
                  ('museu', [640, 5, 11.5], [624, -34, 14], 58), ('iate', [470, -215, 3], [400, -292, 8], 44),
                  ('jk', ref(JK, 40, 3, 2.2), ref(JK, 14, 0, 3.4), 52)]
        primeira = True
        for nome, de, para, fov in noites:
            if SO and nome not in SO:
                continue
            s0 = s_mais_perto(*PREDIOS[nome]['alvo'][:2])
            vista(page, de, para, fov, espera=8000 if primeira else 2500, carro=s0 + 140)
            if primeira:
                print('noite:', page.evaluate("()=>interlagos.sceneryInfo().extras?.Marcos_PampulhaNiemeyer?.night??null"), flush=True)
                vista(page, de, para, fov, carro=s0 + 140)
                primeira = False
            foto(page, f'noite_{nome}_{len([t for t in tiradas if "noite_" + nome in t.name])}')
        if not so_perto:
            for nome in ('baile', 'iate'):
                if SO and nome not in SO:
                    continue
                s0 = s_mais_perto(*PREDIOS[nome]['alvo'][:2])
                em(page, s0 - 60, 'chase', espera=3000)
                foto(page, f'noite_{nome}_volta_chegando_perseguicao')
            camera(page, 'chase')
        page.evaluate("interlagosClima.set({time:'dia'});true")
    page.evaluate('interlagosLuz.photo(null);true')
    mosaico()
    browser.close()
assert not erros, erros
assert not falhas, falhas
print(json.dumps({'passed': True}, ensure_ascii=False))
