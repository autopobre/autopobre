"""Marcos do Circuito do Minhocão no navegador: os prédios de minhocao-landmarks.js montados, sem erros, e fotos.

    python verificar_marcos_minhocao.py [porta] [pasta das fotos] [--sem-floripa] [--sem-celular]

Abre o circuito pelo seletor (?circuito=minhocao) no Treino solo e confere o módulo (sceneryInfo().extras
.Marcos_Minhocao): os oito marcos montados (Copan, Itália, ex-Hilton, Caetano de Campos, Igreja da Consolação, Esther,
Andraus e o coreto da Praça da República), nenhum vértice no espaço de rodagem da volta, o detalhe de celular com menos
triângulos. Fotografa cada marco da pista (câmera de perseguição no trecho mais perto: Ipiranga × Major Sertório para
Copan, ex-Hilton e Itália; a Praça da República para Caetano de Campos, Esther e o coreto; a boca norte do túnel para
a igreja; a Vieira de Carvalho para o Andraus), de pé na rua da volta de onde mais se vê cada um (linha de visada contra
os prédios genéricos), de perto na calçada em volta dele, e do alto sobre a Praça da República e sobre o Copan; monta
um mosaico. Depois abre Floripa uma vez. Fotos JPG em
fotos_referencia/autodromo_minhocao/previas/r2_marcos (ou na pasta dada).
"""
import json
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8799'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'fotos_referencia' / 'autodromo_minhocao' / 'previas' / 'r2_marcos'
FOTOS.mkdir(parents=True, exist_ok=True)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_minhocao.json').read_text(encoding='utf-8'))
A = DADOS['samples']
L = DADOS['meta']['reconstructed_xy_m']
MARCOS = {m['kind']: m for m in DADOS['scenery'].get('landmarks', [])}
TIPOS = ['copan', 'italia', 'hilton', 'caetano_de_campos', 'igreja_consolacao', 'esther', 'andraus', 'coreto_republica']
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


def secao(nome, padrao):
    for s, n in DADOS['meta'].get('sections', []):
        if nome.lower() in n.lower():
            return s
    return padrao


def altura(m):
    return m.get('total_m') or m.get('tower_m') or m.get('height') or 20


# Linha de visada contra os prédios genéricos (retângulos de data.scenery.buildings) e os outros marcos, para escolher
# de onde fotografar cada marco (o jogo apara alguns genéricos encostados nos marcos: aqui contam inteiros).
TER = DADOS['terrain']
BLD = DADOS['scenery'].get('buildings') or {'columns': [], 'items': []}
COL = {k: i for i, k in enumerate(BLD['columns'])}
CEL = 25.0


def chao(x, y):
    fx = min(max((x - TER['x0']) / TER['step'], 0), TER['nx'] - 1.001)
    fy = min(max((y - TER['y0']) / TER['step'], 0), TER['ny'] - 1.001)
    i, j = int(fx), int(fy)
    u, v = fx - i, fy - j
    z, nx = TER['z'], TER['nx']
    k = j * nx + i
    return (z[k] * (1 - u) + z[k + 1] * u) * (1 - v) + (z[k + nx] * (1 - u) + z[k + nx + 1] * u) * v


def dentro(x, y, pts):
    c = False
    j = len(pts) - 1
    for i in range(len(pts)):
        (xi, yi), (xj, yj) = pts[i][:2], pts[j][:2]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


GRADE = {}
for b in BLD['items']:
    x, y, w, d, h, alt = b[COL['x']], b[COL['y']], b[COL['w']], b[COL['d']], b[COL['heading']], b[COL['h']]
    r = math.hypot(w, d) / 2
    item = (x, y, math.cos(h), math.sin(h), w / 2, d / 2, chao(x, y) + alt)
    for i in range(math.floor((x - r) / CEL), math.floor((x + r) / CEL) + 1):
        for j in range(math.floor((y - r) / CEL), math.floor((y + r) / CEL) + 1):
            GRADE.setdefault((i, j), []).append(item)


def bloqueado(x, y, z, alvo):
    for (bx, by, c, s_, hw, hd, topo) in GRADE.get((math.floor(x / CEL), math.floor(y / CEL)), []):
        if z < topo:
            u, v = (x - bx) * c + (y - by) * s_, -(x - bx) * s_ + (y - by) * c
            if abs(u) < hw and abs(v) < hd:
                return True
    for m in MARCOS.values():
        if m is not alvo and z < m['ground'] + m.get('height', 20) and abs(x - m['x']) < 90 and abs(y - m['y']) < 90 and dentro(x, y, m['outline']):
            return True
    return False


def visada(de, m):
    """Fração de pontos do marco (do pé ao topo) que se veem de `de`."""
    h = altura(m)
    vistos = 0
    alvos = [.12, .3, .5, .7, .9]
    for f in alvos:
        alvo = (m['x'], m['y'], m['ground'] + h * f)
        d = math.dist(de, alvo)
        n = max(2, int(d / 2.5))
        ok = True
        for k in range(1, n):
            t = k / n
            x, y, z = (de[i] + (alvo[i] - de[i]) * t for i in range(3))
            if dentro(x, y, m['outline']):
                break
            if t * d > 4 and bloqueado(x, y, z, m):
                ok = False
                break
        vistos += ok
    return vistos / len(alvos)


def enquadrar(m, de):
    """Alvo e abertura para ver o marco inteiro de `de`."""
    h = altura(m)
    d = math.hypot(m['x'] - de[0], m['y'] - de[1])
    alto = h * .45 + m['ground']
    fov = max(36, min(80, math.degrees(2 * math.atan(max(h * .62, 10) / max(d, 1)))))
    return [m['x'], m['y'], alto], fov


def da_rua(m, s0, s1):
    """Na rua (de s0 a s1, do lado da pista longe do marco, 1,8 m), o ponto que mais vê do marco; a uma distância
    perto de 1,5 vez a altura dele."""
    melhor = None
    s = s0
    while s <= s1:
        e = estacao(s)
        dx, dy = m['x'] - e['x'], m['y'] - e['y']
        lado = -(e['w'] / 2 - 1.2) if dx * e['n'][0] + dy * e['n'][1] > 0 else e['w'] / 2 - 1.2
        de = (e['x'] + e['n'][0] * lado, e['y'] + e['n'][1] * lado, e['z'] + 1.8)
        d = math.hypot(m['x'] - de[0], m['y'] - de[1])
        nota = visada(de, m) - abs(d - min(220, max(60, 1.5 * altura(m)))) / 600
        if melhor is None or nota > melhor[0]:
            melhor = (nota, e, list(de))
        s += 3
    return melhor[1], melhor[2], melhor[0]


def adiante(m, s0, s1):
    """A estação de s0 a s1 de onde a câmera de perseguição vê o marco à frente (até 35 graus do rumo), longe o bastante
    para caber no quadro e sem prédios no meio."""
    melhor = None
    s = s0
    while s <= s1:
        e = estacao(s)
        dx, dy = m['x'] - e['x'], m['y'] - e['y']
        d = math.hypot(dx, dy)
        ang = abs(math.atan2(dx * e['t'][1] - dy * e['t'][0], dx * e['t'][0] + dy * e['t'][1]))
        if ang < .6 and d > 40:
            de = (e['x'] - e['t'][0] * 6, e['y'] - e['t'][1] * 6, e['z'] + 2.6)
            nota = visada(de, m) - ang * .4 - abs(d - min(260, 1.8 * altura(m) + 40)) / 700
            if melhor is None or nota > melhor[0]:
                melhor = (nota, e)
        s += 3
    return (melhor or (0, estacao(s0)))[1]


def de_perto(m):
    """Na calçada em volta do marco (o lado que mais se vê), a uma vez a altura dele (até 120 m)."""
    r = max(math.hypot(p[0] - m['x'], p[1] - m['y']) for p in m['outline'])
    h = altura(m)
    dist = r + (9 if h < 12 else max(30, min(h, 120) * .8))
    # Um pouco acima das copas das calçadas; o coreto de perto, entre as árvores da praça.
    alto = 2.4 if h < 12 else min(14, max(2, h * .12))
    melhor = None
    for k in range(18):
        a = k / 18 * 2 * math.pi
        x, y = m['x'] + math.cos(a) * dist, m['y'] + math.sin(a) * dist
        de = (x, y, chao(x, y) + alto)
        if bloqueado(x, y, de[2], m):
            continue
        nota = visada(de, m)
        if melhor is None or nota > melhor[0]:
            melhor = (nota, list(de))
    return melhor[1] if melhor else [m['x'] + dist, m['y'], m['ground'] + 1.8]


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=2200):
    """O carro parado na estação mais próxima de s, na câmera dada."""
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", s)
    camera(page, modo)
    page.wait_for_timeout(espera)


def vista(page, de, para, fov=50, espera=1800, carro=None):
    """Câmera parada em coordenadas da pista (x leste, y norte, z altura); o carro em s (a sombra do sol o segue)."""
    if carro is not None:
        page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", carro)
        page.wait_for_timeout(400)
    page.evaluate("p=>interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true})", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


def foto(page, nome):
    caminho = FOTOS / f'marcos_{nome}.jpg'
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
        desenho.text((x + 6, y + 5), caminho.stem.replace('marcos_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'marcos_mosaico.jpg'
    tela.save(destino, quality=86)
    print('mosaico', destino, flush=True)


def abrir(page, circuito):
    page.goto(URL + f'?circuito={circuito}', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    assert page.get_attribute(f'[data-circuit="{circuito}"]', 'aria-pressed') == 'true'
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    page.click('#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.()')
    page.wait_for_timeout(4000)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text) if m.type == 'error' else None, print('console', m.type, m.text, flush=True)) if m.type in ('error', 'warning') else None)
    abrir(page, 'minhocao')
    info = page.evaluate("()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'minhocao', info
    est = (info['scenery'].get('extras') or {}).get('Marcos_Minhocao')
    assert est, 'minhocao-landmarks.js não montou nada'
    print(json.dumps(est, ensure_ascii=False), flush=True)
    print('draw calls da cena:', info['drawCalls'], flush=True)
    for tipo in TIPOS:
        if tipo in MARCOS and (not est['built'].get(tipo) or 'error' in (est['built'].get(tipo) or {})):
            falhas.append(('marco não montado', tipo, est['built'].get(tipo)))
    if est['driveSpace']['violations']:
        falhas.append(('espaço de rodagem', est['driveSpace']))

    if '--sem-celular' not in sys.argv:
        # O mesmo módulo no detalhe de celular: monta sem erro, com menos triângulos, fora da pista.
        movel = page.evaluate("""async()=>{const m=await import('./minhocao-landmarks.js');const d=await (await fetch('../dados/pista_minhocao.json')).json();
         const r=m.createMinhocaoLandmarks(d,{mobile:true});const s=r.stats;r.root.traverse(o=>{o.geometry?.dispose();});
         return {drawCalls:s.drawCalls,triangles:s.triangles,violations:s.driveSpace.violations,built:Object.keys(s.built).length,errors:Object.values(s.built).filter(b=>b?.error).length};}""")
        print('celular:', movel, flush=True)
        if movel['violations'] or movel['errors'] or movel['triangles'] >= est['triangles']:
            falhas.append(('detalhe de celular', movel))

    ipiranga = secao('Av. Ipiranga', 222)
    republica = secao('Praça da República', 310)
    vieira = secao('Vieira de Carvalho', 666)
    arouche = secao('Largo do Arouche', 880)
    tunel = DADOS['scenery'].get('minhocao', {}).get('tunnel') or {}
    boca = (tunel.get('covered') or [secao('Túnel', 2622)])[0]
    trechos = {'copan': (ipiranga - 30, ipiranga + 90), 'hilton': (0, ipiranga), 'italia': (0, ipiranga + 80),
               'caetano_de_campos': (republica, vieira), 'esther': (republica - 40, republica + 140),
               'coreto_republica': (republica + 60, vieira + 120), 'andraus': (vieira - 60, arouche + 40), 'igreja_consolacao': (boca - 140, boca - 10)}

    # Câmera de perseguição nos trechos: o marco à frente do carro.
    foto(page, 'largada')
    for tipo in TIPOS:
        if tipo not in MARCOS:
            continue
        e = adiante(MARCOS[tipo], *trechos[tipo])
        em(page, e['s'])
        foto(page, f'{tipo}_perseguicao')
    # De pé na rua da volta, de onde mais se vê cada marco; e de perto, na calçada em volta dele.
    for tipo in TIPOS:
        if tipo not in MARCOS:
            continue
        m = MARCOS[tipo]
        e, de, nota = da_rua(m, *trechos[tipo])
        para, fov = enquadrar(m, de)
        print(f'{tipo}: da rua em s {e["s"]:.0f}, {math.hypot(m["x"] - de[0], m["y"] - de[1]):.0f} m, visada {nota:.2f}', flush=True)
        vista(page, de, para, fov, carro=e['s'])
        foto(page, f'{tipo}_da_rua')
    for tipo in TIPOS:
        if tipo not in MARCOS:
            continue
        m = MARCOS[tipo]
        de = de_perto(m)
        para, fov = enquadrar(m, de)
        vista(page, de, para, fov, carro=min(range(0, int(L), 10), key=lambda s: math.hypot(estacao(s)['x'] - m['x'], estacao(s)['y'] - m['y'])))
        foto(page, f'{tipo}_de_perto')
    # Os três altos de Ipiranga × Major Sertório juntos, do cruzamento; a igreja da boca norte do túnel.
    e = estacao(ipiranga - 60)
    grupo = [MARCOS[k] for k in ('copan', 'italia', 'hilton') if k in MARCOS]
    if grupo:
        cx = sum(m['x'] for m in grupo) / len(grupo)
        cy = sum(m['y'] for m in grupo) / len(grupo)
        vista(page, [e['x'], e['y'], e['z'] + 2.5], [cx, cy, e['z'] + 55], 70, carro=e['s'])
        foto(page, 'ipiranga_major_sertorio')
    if 'igreja_consolacao' in MARCOS:
        m = MARCOS['igreja_consolacao']
        e = estacao(boca - 45)
        vista(page, [e['x'], e['y'], e['z'] + 2.2], [m['x'], m['y'], m['ground'] + 30], 62, carro=e['s'])
        foto(page, 'igreja_boca_norte')
    # Do alto: a Praça da República, de cima da volta (a oeste) para o leste; o grupo do Copan do norte.
    praca = [MARCOS[k] for k in ('caetano_de_campos', 'coreto_republica', 'esther') if k in MARCOS]
    if praca:
        cx = sum(m['x'] for m in praca) / len(praca)
        cy = sum(m['y'] for m in praca) / len(praca)
        z = sum(m['ground'] for m in praca) / len(praca)
        e = min((estacao(s) for s in range(int(republica), int(vieira), 5)), key=lambda e: math.hypot(e['x'] - cx, e['y'] - cy))
        dx, dy = e['x'] - cx, e['y'] - cy
        d = math.hypot(dx, dy) or 1
        vista(page, [cx + dx / d * 230, cy + dy / d * 230, z + 130], [cx, cy, z], 55, carro=e['s'])
        foto(page, 'praca_republica_alto')
        vista(page, [cx - dy / d * 170 + dx / d * 40, cy + dx / d * 170 + dy / d * 40, z + 90], [cx, cy, z + 5], 58, carro=e['s'])
        foto(page, 'praca_republica_alto_lado')
    if grupo:
        cx = sum(m['x'] for m in grupo) / len(grupo)
        cy = sum(m['y'] for m in grupo) / len(grupo)
        z = sum(m['ground'] for m in grupo) / len(grupo)
        vista(page, [cx - 40, cy + 260, z + 150], [cx, cy, z + 40], 60, carro=ipiranga)
        foto(page, 'copan_italia_hilton_alto')
    page.evaluate('interlagosLuz.photo(null)')
    mosaico()
    camera(page, 'chase')
    page.wait_for_timeout(500)
    if '--sem-floripa' not in sys.argv:
        abrir(page, 'floripa')
        f = page.evaluate("()=>({circuit:interlagos.circuit,extras:Object.keys(interlagos.sceneryInfo().extras||{}),ready:interlagos.ready})")
        print('floripa:', f, flush=True)
        assert f['circuit'] == 'floripa' and f['ready'], f
        assert 'Marcos_Minhocao' not in f['extras'], f
    browser.close()
assert not erros, erros
assert not falhas, falhas
print(json.dumps({'passed': True}, ensure_ascii=False))
