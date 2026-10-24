"""A Barragem da Pampulha no navegador: pampulha-barragem.js montado, sem erros, fora da pista, água andando, e fotos.

    python verificar_barragem.py [porta] [pasta das fotos] [--sem-celular] [--sem-noite]

Abre o Circuito da Pampulha pelo seletor (?circuito=pampulha) no Treino solo e confere o módulo
(sceneryInfo().extras.Marcos_Pampulha_Barragem): montado sem erro em todas as partes (talude de montante, talude de
jusante, vertedouro com a água caindo nos 8 vãos, tulipa, saída das galerias, pontes), nenhum vértice no espaço de
rodagem da volta, a água do
vertedouro e da bacia andando (o relógio do módulo avança), o detalhe de celular mais leve. Fotografa a barragem da
volta (a pista desce a crista pela Av. Dom Pedro I com a lagoa à direita) na perseguição, na interna e do olho do
piloto para os dois lados; do vale (o talude de jusante, a saída das galerias, as pontes); do outro lado da lagoa; de
perto o vertedouro (o deck sobre os pilares) e a tulipa; do alto; e à noite. Monta um mosaico barragem_mosaico.jpg.
Fotos JPG em pista_interlagos/renders/pampulha/previas/rodada_02/barragem (ou na pasta dada).
"""
import json
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, start_race

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8896'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'pampulha' / 'previas' / 'rodada_02' / 'barragem'
FOTOS.mkdir(parents=True, exist_ok=True)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_pampulha.json').read_text(encoding='utf-8'))
A = DADOS['samples']
L = DADOS['meta']['reconstructed_xy_m']
CHAVE = 'Marcos_Pampulha_Barragem'
PARTES = ('upstream', 'downstream', 'spillway', 'tulip', 'outlet', 'bridges')
erros = []
falhas = []
tiradas = []


def chao(x, y, h=0.0):
    """O chão da grade do arquivo de pista em (x, y) (bilinear), mais h: as câmeras do vale ficam acima dele."""
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
    caminho = FOTOS / f'barragem_{nome}.jpg'
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
        desenho.text((x + 6, y + 5), caminho.stem.replace('barragem_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'barragem_mosaico.jpg'
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


def olho(s, lado, alvo_lat, alvo_ds=40, alvo_z=-1.0):
    """O olho do piloto na faixa do lado dado (+1 esquerda/vale, -1 direita/lagoa) e um alvo à frente desse lado."""
    e = estacao(s)
    k = lado * (e['w'] / 2 - 1.6)
    de = [e['x'] + e['n'][0] * k, e['y'] + e['n'][1] * k, e['z'] + 1.15]
    f = estacao(s + alvo_ds)
    para = [f['x'] + f['n'][0] * lado * alvo_lat, f['y'] + f['n'][1] * lado * alvo_lat, f['z'] + alvo_z]
    return e, de, para


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None, print('console', m.type, m.text[:300], flush=True)) if m.type == 'error' else None)
    abrir(page, 'pampulha')
    info = page.evaluate("()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'pampulha', info
    est = (info['scenery'].get('extras') or {}).get(CHAVE)
    assert est, 'pampulha-barragem.js não montou nada'
    print(json.dumps(est, ensure_ascii=False), flush=True)
    print('draw calls da cena:', info['drawCalls'], flush=True)
    if est.get('error'):
        falhas.append(('erro ao montar', est['error']))
    for parte in PARTES:
        if not est.get(parte) or (isinstance(est[parte], dict) and est[parte].get('error')):
            falhas.append(('parte', parte, est.get(parte)))
    if (est.get('driveSpace') or {}).get('violations'):
        falhas.append(('espaço de rodagem', est['driveSpace']))
    # O canal do vertedouro sob o deck é do módulo (piso, paredes, a água caindo e a espuma) em todos os 8 vãos, com a
    # vedação que tira o chão da grade de dentro deles; a lagoa para na soleira (meta.lake_cuts).
    vert = est.get('spillway') or {}
    if not vert.get('bays') or vert.get('openBays') != vert.get('bays') or not vert.get('sealed') or not DADOS['meta'].get('lake_cuts'):
        falhas.append(('vertedouro sem a água em todos os vãos', vert, DADOS['meta'].get('lake_cuts')))
    # A água anda: o relógio do módulo (update) avança com o jogo.
    t0 = page.evaluate(f"()=>interlagos.sceneryInfo().extras?.{CHAVE}?.flow?.time??null")
    page.wait_for_timeout(1500)
    t1 = page.evaluate(f"()=>interlagos.sceneryInfo().extras?.{CHAVE}?.flow?.time??null")
    print('água:', t0, '->', t1, flush=True)
    if t0 is None or t1 is None or not t1 > t0:
        falhas.append(('água parada', t0, t1))

    if '--sem-celular' not in sys.argv:
        movel = page.evaluate("""async()=>{const m=await import('./pampulha-barragem.js');const d=await (await fetch('../dados/pista_pampulha.json')).json();
         const r=m.createPampulhaBarragem(d,{mobile:true});const s=r.stats;r.root.traverse(o=>{o.geometry?.dispose();});
         return {drawCalls:s.drawCalls,triangles:s.triangles,violations:s.driveSpace?.violations,error:s.error??null};}""")
        print('celular:', movel, flush=True)
        if movel['violations'] or movel['error'] or not movel['triangles'] or movel['triangles'] >= est.get('triangles', 0):
            falhas.append(('detalhe de celular', movel))

    s_ini, s_meio, s_fim = 15985, 16140, 16420
    # Da volta: chegando pelo vertedouro, entrando na crista, no meio e saindo, na perseguição e na interna.
    for s, modo, nome in [(15840, 'chase', 'volta_vertedouro_perseguicao'), (15960, 'chase', 'volta_entrando_crista_perseguicao'),
                          (s_meio, 'chase', 'volta_crista_perseguicao'), (16330, 'chase', 'volta_saindo_crista_perseguicao'),
                          (15990, 'cockpit', 'volta_crista_interna'), (16220, 'cockpit', 'volta_crista_interna_meio')]:
        em(page, s, modo)
        foto(page, nome)
    camera(page, 'chase')
    # O olho do piloto: à direita a lagoa (enrocamento, guarda-corpo, postes), à esquerda o vale (gradil, talude, pontes).
    for s, lado, lat, ds, z, nome, fov in [(16040, -1, 16, 35, 1.0, 'olho_lagoa', 62), (16000, 1, 45, 25, -9, 'olho_vale_saida', 64),
                                           (16200, 1, 60, 40, -8, 'olho_vale_pontes', 64), (15905, -1, 30, -30, 0, 'olho_tulipa', 60)]:
        e, de, para = olho(s, lado, lat, ds, z)
        vista(page, de, para, fov, carro=e['s'])
        foto(page, nome)
    s_fora = 15600
    # Do vale: o talude de jusante com as canaletas e o gradil, a saída das galerias e a bacia, as pontes.
    vista(page, [1450, 640, chao(1450, 640, 2.5)], [1320, 600, 0], 55, carro=s_fora)
    foto(page, 'vale_talude')
    vista(page, [1384, 668, chao(1384, 668, 4)], [1360, 697, chao(1360, 697, 1)], 58, carro=s_fora)
    foto(page, 'vale_bacia')
    vista(page, [1445, 560, chao(1445, 560, 2.5)], [1395, 650, -6], 55, carro=s_fora)
    foto(page, 'vale_pontes')
    # Do outro lado da lagoa e em diagonal.
    vista(page, [1160, 600, 5], [1310, 560, 3], 45, carro=s_fora)
    foto(page, 'lagoa_frente')
    vista(page, [1130, 420, 5], [1300, 640, 3], 45, carro=s_fora)
    foto(page, 'lagoa_diagonal')
    # De perto: o vertedouro (deck sobre os pilares, a régua), a tulipa e a passarela, o enrocamento.
    vista(page, [1228, 752, 2.6], [1240, 776, 1.8], 56, carro=s_fora)
    foto(page, 'vertedouro_perto')
    vista(page, [1234, 763, 1.9], [1239.5, 774.5, .3], 60, carro=s_fora)
    foto(page, 'vertedouro_vao')
    vista(page, [1255, 740, 6], [1236, 777, 2], 56, carro=s_fora)
    foto(page, 'vertedouro_alto')
    vista(page, [1214, 690, 5], [1245, 722, 1.5], 55, carro=s_fora)
    foto(page, 'tulipa')
    vista(page, [1280, 600, 2.2], [1300, 640, 2.5], 60, carro=s_fora)
    foto(page, 'enrocamento')
    vista(page, [1480, 820, 70], [1320, 560, 0], 50, carro=s_fora)
    foto(page, 'alto')
    if '--sem-noite' not in sys.argv:
        page.evaluate("interlagosClima.set({time:'noite'});true")
        # A noite traz programas novos (compilados em fatias): a tela fica parada uns segundos; espera e aquece a vista.
        page.wait_for_timeout(9000)
        vista(page, [1450, 640, chao(1450, 640, 2.5)], [1320, 600, 0], 55, espera=8000, carro=s_fora)
        noite = page.evaluate(f"()=>interlagos.sceneryInfo().extras?.{CHAVE}?.night??null")
        print('noite:', noite, flush=True)
        if not noite:
            falhas.append(('noite', noite))
        foto(page, 'noite_vale')
        vista(page, [1160, 600, 5], [1310, 560, 3], 45, carro=s_fora)
        foto(page, 'noite_lagoa')
        vista(page, [1228, 752, 2.6], [1240, 776, 1.8], 56, carro=s_fora)
        foto(page, 'noite_vertedouro')
        em(page, s_meio, 'chase', espera=3000)
        foto(page, 'noite_volta_crista_perseguicao')
        camera(page, 'chase')
        page.evaluate("interlagosClima.set({time:'dia'});true")
    page.evaluate('interlagosLuz.photo(null);true')
    mosaico()
    browser.close()
assert not erros, erros
assert not falhas, falhas
print(json.dumps({'passed': True}, ensure_ascii=False))
