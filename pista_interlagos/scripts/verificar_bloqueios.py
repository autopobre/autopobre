"""Autódromo Floripa no navegador: os bloqueios das ruas (street-closures.js) e os carros da cidade (city-cars.js).

    python verificar_bloqueios.py [porta] [pasta das fotos] [--sem-fotos]

Abre ?circuito=floripa no Treino solo e confere o que o modulo montou (bloqueios, pecas, pisca-piscas, placas, fila de
carros, carros estacionados, pessoas), sem erros na pagina; percorre a volta medindo as chamadas de desenho do modulo
(no maximo 15); fotografa os bloqueios da camera de perseguicao, de dentro das ruas fechadas (na altura de quem esta na
calcada), do lado da pista e do alto, de dia e de noite; e confere que um circuito sem cidade (o Minhocão) nao ganha nada dele.
Fotos em renders/floripa_v2/previas/rodada_01/bloqueios/ (ou na pasta dada) e um mosaico bloqueios_mosaico.jpg.
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
RAIZ = Path(__file__).resolve().parents[1]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'renders' / 'floripa_v2' / 'previas' / 'rodada_01' / 'bloqueios'
FOTOS.mkdir(parents=True, exist_ok=True)
FOTOGRAFAR = '--sem-fotos' not in sys.argv
erros = []
# Os bloqueios do arquivo da pista (lido de novo a cada execucao: o gerador o reescreve).
DADOS = json.loads((RAIZ / 'dados' / 'pista_floripa.json').read_text(encoding='utf-8'))
BLOQ = DADOS['scenery']['city']['closures']


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=1800):
    """O carro parado na estacao mais proxima de s (m da volta), na camera dada."""
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", s)
    camera(page, modo)
    page.wait_for_timeout(espera)


def chao(page, x, y):
    return page.evaluate("p=>interlagos.car.terrain(p[0],p[1])", [x, y]) or 0


def vista(page, de, para, fov=50, espera=1600):
    """Camera parada em coordenadas da pista (x leste, y norte, z altura)."""
    page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});return true}", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


def vista_bloqueio(page, i, tipo, d=None, h=None, fov=50):
    """De dentro da rua fechada olhando para a pista ('rua'), do lado da pista olhando a rua ('pista') ou do alto ('alto')."""
    c = BLOQ[i]
    hx, hy = math.cos(c['heading']), math.sin(c['heading'])
    if tipo == 'rua':
        d = d or 28
        de = [c['x'] + hx * d - hy * 1.2, c['y'] + hy * d + hx * 1.2, h or 1.65]
        para = [c['x'] - hx * 12, c['y'] - hy * 12, 1.3]
    elif tipo == 'pista':
        d = d or 15
        de = [c['x'] - hx * d - hy * 5, c['y'] - hy * d + hx * 5, h or 1.7]
        para = [c['x'] + hx * 8, c['y'] + hy * 8, 1.0]
    else:
        d = d or 34
        de = [c['x'] + hx * d - hy * 10, c['y'] + hy * d + hx * 10, h or 24]
        para = [c['x'] + hx * 6, c['y'] + hy * 6, 0]
    de[2] += chao(page, de[0], de[1])
    para[2] += chao(page, para[0], para[1])
    vista(page, de, para, fov)


TIRADAS = []


def foto(page, nome):
    page.screenshot(path=str(FOTOS / f'{nome}.png'))
    TIRADAS.append(FOTOS / f'{nome}.png')
    print('foto', nome, flush=True)


def abrir(page, circuito, nivel=None):
    page.goto(URL + f'?circuito={circuito}', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    if nivel:
        page.evaluate("n=>{interlagosGraficos.set({level:n,overrides:{}});return true}", nivel)
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    page.click('#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.()')
    page.wait_for_timeout(4000)


def info(page):
    return page.evaluate("()=>{const e=interlagos.sceneryInfo().extras||{};return {names:Object.keys(e),b:e.Bloqueios_ruas||null}}")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(300000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: print('console', m.type, m.text[:300], flush=True) if m.type == 'error' else None)
    abrir(page, 'floripa')
    st = info(page)['b']
    print(json.dumps({k: v for k, v in st.items() if not isinstance(v, (list, dict))}, ensure_ascii=False), flush=True)
    assert st and not st.get('stub'), 'Bloqueios_ruas sem estatisticas'
    for chave, minimo in (('closures', 30), ('pieces', 400), ('flashers', 30), ('signs', 40), ('queueCars', 80), ('buses', 1), ('motos', 5), ('parked', 500), ('people', 10)):
        assert st.get(chave, 0) >= minimo, f'{chave}: {st.get(chave)} < {minimo}'
    # Chamadas de desenho do modulo pela volta (perto dos bloqueios e longe deles).
    L = DADOS['meta']['reconstructed_xy_m']
    chamadas = []
    for s in [b['s'] - 20 for b in BLOQ[::4]] + [k * L / 12 for k in range(12)]:
        em(page, s % L, 'chase', 700)
        b = info(page)['b']
        chamadas.append((round(s % L), b['drawCalls'], b['visibleTriangles']))
    pior = max(chamadas, key=lambda c: c[1])
    print('chamadas de desenho (s, chamadas, triangulos):', chamadas, flush=True)
    assert pior[1] <= 15, f'chamadas demais: {pior}'
    if FOTOGRAFAR:
        # Da camera de perseguicao, chegando a ruas fechadas (o bloqueio do lado, um pouco a frente).
        for i, nome in [(10, 'perseguicao_claudino_bento'), (13, 'perseguicao_antonio_pereira'), (8, 'perseguicao_henrique_valgas'), (22, 'perseguicao_busway'),
                        (38, 'perseguicao_visconde_de_cairu'), (40, 'perseguicao_alca_eurico_dutra'), (42, 'perseguicao_eurico_dutra'), (47, 'perseguicao_john_kennedy')]:
            em(page, (BLOQ[i]['s'] - 30) % L, 'chase')
            foto(page, nome)
        em(page, 3600, 'cockpit')
        foto(page, 'cockpit_visconde_de_cairu')
        # De dentro das ruas fechadas, do lado da pista e do alto.
        for i, tipo, nome in [(11, 'rua', 'rua_paulo_fontes'), (12, 'pista', 'pista_paulo_fontes'), (8, 'rua', 'rua_henrique_valgas'), (37, 'rua', 'rua_ivo_silveira'),
                              (42, 'rua', 'rua_eurico_dutra'), (38, 'pista', 'pista_visconde_de_cairu'), (13, 'rua', 'rua_antonio_pereira'), (22, 'pista', 'pista_busway'),
                              (0, 'rua', 'rua_sob_a_ponte'), (30, 'rua', 'rua_sob_o_elevado'), (11, 'alto', 'alto_paulo_fontes'), (42, 'alto', 'alto_eurico_dutra')]:
            if i < len(BLOQ):
                vista_bloqueio(page, i, tipo)
                foto(page, nome)
        # De noite: os pisca-piscas, os farois e lanternas da fila. (A troca do clima recompila materiais: espera terminar.)
        noite = page.evaluate("()=>{const w=window.interlagosClima;if(!w?.set)return false;w.set({time:'noite'});return true}")
        if noite:
            page.wait_for_timeout(1500)
            wait_js(page, "!window.interlagosClima.info().compiling", timeout=120000)
            page.evaluate("()=>{interlagosClima.settle?.();return true}")
            for i, tipo, nome in [(11, 'rua', 'noite_rua_paulo_fontes'), (38, 'pista', 'noite_pista_visconde_de_cairu')]:
                vista_bloqueio(page, i, tipo)
                page.wait_for_timeout(2500)
                foto(page, nome)
            em(page, 3600, 'chase', 3000)
            foto(page, 'noite_perseguicao_visconde_de_cairu')
        page.evaluate('interlagosLuz.photo(null)')
    browser.close()

    # No nivel Baixo (PC fraco: cenario 'basico', leve e de celular): menos carros, ninguem parado, sem sombras, menos chamadas.
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 960, 'height': 540})
    page.set_default_timeout(300000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    abrir(page, 'floripa', 'baixo')
    leve = info(page)['b']
    print('Baixo:', json.dumps({k: v for k, v in leve.items() if not isinstance(v, (list, dict))}, ensure_ascii=False), flush=True)
    assert leve['closures'] == st['closures'] and leve['people'] == 0 and leve['parked'] <= 450 and leve['parkedNear'] == 0, leve
    chamadas_leve = []
    for s in [b['s'] - 20 for b in BLOQ[::6]]:
        em(page, s % L, 'chase', 700)
        chamadas_leve.append(info(page)['b']['drawCalls'])
    print('chamadas no Baixo:', chamadas_leve, flush=True)
    assert max(chamadas_leve) <= 10, chamadas_leve
    if FOTOGRAFAR:
        em(page, 3590, 'chase')
        foto(page, 'baixo_perseguicao_visconde_de_cairu')
    browser.close()

    # Um circuito de rua sem data.scenery.city (o Minhocão): sem bloqueios nem carros da cidade.
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 960, 'height': 540})
    page.set_default_timeout(300000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    abrir(page, 'minhocao')
    sem = info(page)
    print('Minhocão extras:', sem['names'], flush=True)
    assert sem['b'] is None and 'Bloqueios_ruas' not in sem['names'], 'o Minhocão ganhou os bloqueios'
    browser.close()

if FOTOGRAFAR:
    try:
        from PIL import Image
        nomes = TIRADAS
        if nomes:
            w, h, cols = 640, 360, 3
            linhas = (len(nomes) + cols - 1) // cols
            M = Image.new('RGB', (w * cols, h * linhas))
            for k, f in enumerate(nomes):
                M.paste(Image.open(f).convert('RGB').resize((w, h)), ((k % cols) * w, (k // cols) * h))
            M.save(FOTOS / 'bloqueios_mosaico.jpg', quality=85)
            print('mosaico', FOTOS / 'bloqueios_mosaico.jpg', flush=True)
    except ImportError:
        print('sem Pillow: mosaico nao montado', flush=True)
assert not erros, erros
print(json.dumps({'passed': True}, ensure_ascii=False))
