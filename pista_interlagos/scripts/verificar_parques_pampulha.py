"""O Zoológico e o Parque Ecológico da Pampulha no navegador: pampulha-parques.js montado, sem erros, fora da pista, e fotos.

    python verificar_parques_pampulha.py [porta] [pasta das fotos] [--sem-celular] [--sem-noite] [--so-perto]

Abre o Circuito da Pampulha pelo seletor (?circuito=pampulha) no Treino solo e confere o módulo
(sceneryInfo().extras.Marcos_PampulhaParques): montado sem erro (nem no zoológico nem no parque), nenhum vértice no
espaço de rodagem da volta, o detalhe de celular mais leve. Fotografa da volta (perseguição, interna e o olho do
piloto) a entrada do zoológico (a placa na rotatória da Praça do Zoológico, a praça com as lâminas brancas no espelho
d'água e o pórtico, as girafas), a portaria do Parque Ecológico chegando pela margem leste e passando por ela, o mural
do Centro de Apoio da margem oeste e o torii; de perto a praça, a cobertura da Portaria 1, as girafas, o Aquário, a
portaria do parque (o muro sul e a testeira leste), o Centro de Apoio, o coreto, o torii, o Memorial Minas-Japão e o
monumento a Francisco Lins do Rêgo; o parque do alto; e à noite. Monta o mosaico parques_mosaico.jpg.
Fotos JPG em pista_interlagos/renders/pampulha/previas/rodada_02/parques (ou na pasta dada).
"""
import json
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8897'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'pampulha' / 'previas' / 'rodada_02' / 'parques'
FOTOS.mkdir(parents=True, exist_ok=True)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_pampulha.json').read_text(encoding='utf-8'))
A = DADOS['samples']
L = DADOS['meta']['reconstructed_xy_m']
ERROS = []
FALHAS = []
TIRADAS = []

# Lugares (metros da pista: x leste, y norte; z local = altitude - 800).
ILHA = (-2690, -338)            # a placa e o elefante na ilha da rotatória (Praça do Zoológico)
PRACA = (-2712, -399)           # o espelho d'água com as lâminas (oeste) e o pórtico (leste)
COBERTURA = (-2724.8, -446.8)   # a cobertura da Portaria 1 (o contorno 'aquario' do cadastro)
GIRAFAS = (-2658, -410)
AQUARIO = (-2683, -975)
PORTAO = (-1800, -982.5)
CENTRO = (-1786, -360)
CORETO = (-1772.9, -540.3)
TORII = (-1866.8, -251.1)
MEMORIAL = (-1816.7, -141.7)
LINS = (-1699.5, -266)


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


def olho(s, alvo, lado=1.6):
    """O olho do piloto na faixa da volta do lado do alvo, em s."""
    e = estacao(s)
    dx, dy = alvo[0] - e['x'], alvo[1] - e['y']
    sinal = 1 if dx * e['n'][0] + dy * e['n'][1] > 0 else -1
    k = sinal * (e['w'] / 2 - lado)
    return e, [e['x'] + e['n'][0] * k, e['y'] + e['n'][1] * k, e['z'] + 1.15]


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
    caminho = FOTOS / f'parques_{nome}.jpg'
    page.screenshot(path=str(caminho), type='jpeg', quality=86)
    TIRADAS.append(caminho)
    print('foto', caminho.name, flush=True)


def mosaico():
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return
    if not TIRADAS:
        return
    w, h, col = 480, 270, 4
    linhas = math.ceil(len(TIRADAS) / col)
    tela = Image.new('RGB', (w * col, (h + 22) * linhas), (24, 24, 24))
    desenho = ImageDraw.Draw(tela)
    for k, caminho in enumerate(TIRADAS):
        img = Image.open(caminho).convert('RGB').resize((w, h))
        x, y = (k % col) * w, (k // col) * (h + 22)
        tela.paste(img, (x, y + 22))
        desenho.text((x + 6, y + 5), caminho.stem.replace('parques_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'parques_mosaico.jpg'
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


T = DADOS['terrain']
PARQUE = next(m for m in DADOS['scenery']['landmarks'] if m['kind'] == 'parque_ecologico')['outline']
NIVEL = DADOS['meta'].get('sea_level_m') or .8
# A faixa entre a volta e a margem sul do parque (o pátio do portão), como no módulo.
PATIO = [[-1888, -1020], [-1852, -1034], [-1800, -1043], [-1758, -1036], [-1720, -1024], [-1676, -1004], [-1652, -984], [-1690, -962], [-1760, -978], [-1850, -982], [-1888, -998]]


def dentro(x, y, pts):
    c = False
    for i in range(len(pts)):
        a, b = pts[i], pts[i - 1]
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            c = not c
    return c


def g(page, x, y):
    """O chão para pôr câmeras de perto: o relevo da pista.json; no parque (enquanto a lagoa o cobre) o gramado da ilha."""
    fx, fy = (x - T['x0']) / T['step'], (y - T['y0']) / T['step']
    i, j = int(fx), int(fy)
    u, v = fx - i, fy - j
    k = j * T['nx'] + i
    zt = (T['z'][k] * (1 - u) + T['z'][k + 1] * u) * (1 - v) + (T['z'][k + T['nx']] * (1 - u) + T['z'][k + T['nx'] + 1] * u) * v
    return max(zt, NIVEL + 5.2) if dentro(x, y, PARQUE) else max(zt, NIVEL + 4.2) if dentro(x, y, PATIO) else zt


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (ERROS.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (ERROS.append(m.text) if m.type == 'error' else None, print('console', m.type, m.text, flush=True)) if m.type == 'error' or (m.type == 'warning' and 'arques' in m.text) else None)
    abrir(page, 'pampulha')
    info = page.evaluate("()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'pampulha', info
    est = (info['scenery'].get('extras') or {}).get('Marcos_PampulhaParques')
    assert est, 'pampulha-parques.js não montou nada'
    print(json.dumps(est, ensure_ascii=False), flush=True)
    print('draw calls da cena:', info['drawCalls'], flush=True)
    for chave in ('error', 'zooError', 'parkError'):
        if est.get(chave):
            FALHAS.append(('erro ao montar', chave, est[chave]))
    if est.get('placeholder'):
        FALHAS.append(('ainda o marcador', est))
    if (est.get('driveSpace') or {}).get('violations'):
        FALHAS.append(('espaço de rodagem', est['driveSpace']))
    if not (est.get('zoo') or {}).get('giraffes'):
        FALHAS.append(('sem girafas', est.get('zoo')))

    if '--sem-celular' not in sys.argv:
        movel = page.evaluate("""async()=>{const m=await import('./pampulha-parques.js');const d=await (await fetch('../dados/pista_pampulha.json')).json();
         const r=m.createPampulhaParques(d,{mobile:true});const s=r.stats;r.root.traverse(o=>{o.geometry?.dispose();});
         return {drawCalls:s.drawCalls,triangles:s.triangles,trees:s.park?.trees,treeTriangles:s.park?.treeTriangles,violations:s.driveSpace?.violations,error:s.error??s.zooError??s.parkError??null};}""")
        print('celular:', movel, flush=True)
        if movel['violations'] or movel['error'] or not movel['triangles'] or movel['triangles'] >= est.get('triangles', 0) or (movel.get('treeTriangles') or 0) >= ((est.get('park') or {}).get('treeTriangles') or 1):
            FALHAS.append(('detalhe de celular', movel))

    so_perto = '--so-perto' in sys.argv
    if not so_perto:
        # Zoológico, da volta (a avenida vem do leste; o zoológico fica à esquerda): chegando, na perseguição e na interna.
        for s, modo, nome in [(7240, 'chase', 'zoo_volta_chegando_longe'), (7275, 'chase', 'zoo_volta_chegando'), (7305, 'chase', 'zoo_volta_chegando_perto'),
                              (7280, 'cockpit', 'zoo_volta_interna'), (7330, 'chase', 'zoo_volta_passando')]:
            em(page, s, modo)
            foto(page, nome)
        for s, alvo, nome, fov in [(7290, (-2700, -360, 6), 'zoo_volta_olho_ilha_praca', 56), (7335, (GIRAFAS[0], GIRAFAS[1], 12), 'zoo_volta_olho_girafas', 50)]:
            e, de = olho(s, alvo)
            vista(page, de, list(alvo), fov, carro=e['s'])
            foto(page, nome)
        # Parque Ecológico, da volta: descendo a margem leste rumo ao portão, passando por ele; a margem oeste.
        for s, modo, nome in [(5220, 'chase', 'parque_volta_chegando_longe'), (5265, 'chase', 'parque_volta_chegando'), (5300, 'chase', 'parque_volta_chegando_perto'),
                              (5280, 'cockpit', 'parque_volta_interna'), (6300, 'chase', 'parque_volta_margem_oeste')]:
            em(page, s, modo)
            foto(page, nome)
        for s, alvo, nome, fov in [(5455, (PORTAO[0], PORTAO[1] - 8, 6), 'parque_volta_olho_portao', 56), (6345, (-1804, -360, 4), 'parque_volta_olho_mural', 34),
                                   (6420, (TORII[0], TORII[1], 6), 'parque_volta_olho_torii', 40)]:
            e, de = olho(s, alvo)
            vista(page, de, list(alvo), fov, carro=e['s'])
            foto(page, nome)
        camera(page, 'chase')
    # De perto (o carro longe dos quadros, a sombra do sol o segue).
    z = lambda x, y, h: (g(page, x, y) or 0) + h
    vista(page, [-2672, -333, z(-2672, -333, 2.2)], [ILHA[0], ILHA[1], z(*ILHA, 1.5)], 56, carro=7200)
    foto(page, 'zoo_ilha_placa_elefante')
    vista(page, [-2724, -371, z(-2724, -371, 2)], [PRACA[0] + 3, PRACA[1], z(*PRACA, 4.5)], 62)
    foto(page, 'zoo_praca_laminas_portico')
    vista(page, [-2690, -380, z(-2690, -380, 2)], [PRACA[0] + 10, PRACA[1], z(*PRACA, 4)], 60)
    foto(page, 'zoo_portico')
    vista(page, [-2722, -420, z(-2722, -420, 2)], [COBERTURA[0], COBERTURA[1], z(*COBERTURA, 3)], 60)
    foto(page, 'zoo_cobertura_portaria')
    vista(page, [-2640, -385, z(-2640, -385, 6)], [GIRAFAS[0], GIRAFAS[1], z(*GIRAFAS, 3.5)], 55)
    foto(page, 'zoo_girafas')
    vista(page, [-2630, -925, z(-2630, -925, 30)], [AQUARIO[0], AQUARIO[1], z(*AQUARIO, 3)], 55)
    foto(page, 'zoo_aquario')
    vista(page, [-2620, -280, 70], [-2700, -400, 5], 55)
    foto(page, 'zoo_alto')
    vista(page, [-1800, -1012, z(-1800, -1012, 1.8)], [PORTAO[0], PORTAO[1], z(*PORTAO, 3.5)], 60, carro=5250)
    foto(page, 'parque_portao_muro_sul')
    vista(page, [-1770, -990, z(-1770, -990, 2)], [PORTAO[0], PORTAO[1], z(*PORTAO, 4)], 60)
    foto(page, 'parque_portao_testeira_leste')
    vista(page, [-1835, -345, z(-1835, -345, 3)], [CENTRO[0], CENTRO[1], z(*CENTRO, 3)], 60, carro=6300)
    foto(page, 'parque_centro_mural')
    vista(page, [-1750, -515, z(-1750, -515, 6)], [CORETO[0], CORETO[1], z(*CORETO, 2)], 60)
    foto(page, 'parque_coreto')
    vista(page, [-1867, -270, z(-1867, -270, 1.7)], [TORII[0], TORII[1], z(*TORII, 3)], 60)
    foto(page, 'parque_torii')
    vista(page, [-1860, -200, z(-1860, -200, 18)], [MEMORIAL[0], MEMORIAL[1], z(*MEMORIAL, 1)], 58)
    foto(page, 'parque_memorial')
    vista(page, [-1715, -250, z(-1715, -250, 1.7)], [LINS[0], LINS[1], z(*LINS, 4)], 60)
    foto(page, 'parque_monumento_lins')
    vista(page, [-1560, -1120, 280], [-1760, -420, 0], 60)
    foto(page, 'parque_alto')
    if '--sem-noite' not in sys.argv:
        page.evaluate("interlagosClima.set({time:'noite'});true")
        page.wait_for_timeout(9000)
        vista(page, [-2672, -333, z(-2672, -333, 2.2)], [ILHA[0], ILHA[1], z(*ILHA, 1.5)], 56, espera=8000, carro=7200)
        noite = page.evaluate("()=>interlagos.sceneryInfo().extras?.Marcos_PampulhaParques?.night??null")
        print('noite:', noite, flush=True)
        if not noite:
            FALHAS.append(('noite não chegou ao módulo', noite))
        vista(page, [-2672, -333, z(-2672, -333, 2.2)], [ILHA[0], ILHA[1], z(*ILHA, 1.5)], 56, carro=7200)
        foto(page, 'noite_zoo_ilha')
        vista(page, [-2724, -371, z(-2724, -371, 2)], [PRACA[0] + 3, PRACA[1], z(*PRACA, 4.5)], 62)
        foto(page, 'noite_zoo_praca')
        vista(page, [-1800, -1012, z(-1800, -1012, 1.8)], [PORTAO[0], PORTAO[1], z(*PORTAO, 3.5)], 60, carro=5250)
        foto(page, 'noite_parque_portao')
        if not so_perto:
            e, de = olho(7290, (-2700, -360, 6))
            vista(page, de, [-2700, -360, 6], 56, carro=e['s'])
            foto(page, 'noite_zoo_volta_olho')
            em(page, 5265, 'chase', espera=3000)
            foto(page, 'noite_parque_volta_chegando')
        page.evaluate("interlagosClima.set({time:'dia'});true")
    page.evaluate('interlagosLuz.photo(null);true')
    mosaico()
    browser.close()
assert not ERROS, ERROS
assert not FALHAS, FALHAS
print(json.dumps({'passed': True}, ensure_ascii=False))
