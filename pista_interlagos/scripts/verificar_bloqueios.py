"""Autódromo Floripa no navegador: os bloqueios das ruas (street-closures.js) e os carros da cidade (city-cars.js).

    python verificar_bloqueios.py [porta] [pasta das fotos] [--sem-fotos] [--isolar]

Abre ?circuito=floripa no Treino solo e confere o que o modulo montou (bloqueios, pecas, pisca-piscas, placas, fila de
carros, carros estacionados, pessoas), sem erros na pagina; percorre a volta medindo as chamadas de desenho do modulo
(no maximo 15); fotografa os bloqueios da camera de perseguicao, de dentro das ruas fechadas (na altura de quem esta na
calcada), do lado da pista e do alto, de dia e de noite; e confere que um circuito sem cidade (o Minhocão) nao ganha nada dele.
Confere tambem as filas: so onde o transito vem para a pista (flow +1) ou nas ruas de duas maos, cada carro na sua propria rua
(a via do OSM do bloqueio) e nunca no leito de outra rua maior; e que os carros estacionados longe da volta tem as duas
versoes (a completa perto da camera).
--isolar serve os modulos dos outros construtores desta rodada na versao do ultimo commit (os novos, city-life.js e
city-race.js, vazios), para testar este sozinho enquanto os outros estao em obra.
Fotos em renders/floripa_v2/previas/rodada_02/bloqueios/ (ou na pasta dada) e um mosaico bloqueios_mosaico.jpg.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, start_race

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8799'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[1]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'renders' / 'floripa_v2' / 'previas' / 'rodada_02' / 'bloqueios'
FOTOS.mkdir(parents=True, exist_ok=True)
FOTOGRAFAR = '--sem-fotos' not in sys.argv
erros = []
# Os bloqueios do arquivo da pista (lido de novo a cada execucao: o gerador o reescreve).
DADOS = json.loads((RAIZ / 'dados' / 'pista_floripa.json').read_text(encoding='utf-8'))
BLOQ = DADOS['scenery']['city']['closures']
RUAS = DADOS['scenery']['city']['streets']
ISOLAR = '--isolar' in sys.argv
VAZIOS = {'city-life.js': ('createCityLife', 'Vida_cidade'), 'city-race.js': ('createCityRace', 'Corrida_na_cidade')}
ISOLADOS = ['city-life.js', 'city-race.js', 'city-buildings.js', 'floripa-bridges.js', 'floripa-landmarks.js', 'sea-water.js', 'far-terrain.js']
RANK = {'motorway': 9, 'trunk': 8, 'primary': 7, 'secondary': 6, 'tertiary': 5, 'busway': 5, 'unclassified': 4, 'residential': 4, 'living_street': 3, 'service': 2}


def rank(r):
    k = r.get('kind') or ''
    return RANK.get(k.replace('_link', ''), 3) - (.5 if k.endswith('_link') else 0)


def dist_rua(r, x, y):
    """Distancia do ponto ao leito da rua (negativa dentro): eixo da via menos a meia largura."""
    best = 1e9
    Q = r['points']
    for i in range(len(Q) - 1):
        dx, dy = Q[i + 1][0] - Q[i][0], Q[i + 1][1] - Q[i][1]
        l2 = dx * dx + dy * dy or 1e-9
        u = max(0, min(1, ((x - Q[i][0]) * dx + (y - Q[i][1]) * dy) / l2))
        best = min(best, math.hypot(x - Q[i][0] - dx * u, y - Q[i][1] - dy * u) - (Q[i][2] + (Q[i + 1][2] - Q[i][2]) * u) / 2)
    return best


def bloq(nome, n=0):
    """O n-esimo bloqueio cujo nome contem `nome` (ou da via de servico, nome vazio)."""
    achados = [i for i, b in enumerate(BLOQ) if nome in b['name'] and (nome or not b['name'])]
    return achados[min(n, len(achados) - 1)] if achados else None


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
    if ISOLAR:
        # Os arquivos dos outros construtores desta rodada: a versao do ultimo commit (os novos, vazios).
        for arquivo in ISOLADOS:
            if arquivo in VAZIOS:
                corpo = "import * as THREE from 'three';export function %s(){const root=new THREE.Group();root.name='%s';return {root,stats:{stub:true}};}" % VAZIOS[arquivo]
            else:
                corpo = subprocess.run(['git', '-C', str(RAIZ), 'show', 'HEAD:pista_interlagos/teste/' + arquivo], capture_output=True, text=True, encoding='utf-8').stdout
            page.route('**/teste/' + arquivo, (lambda c: lambda route, *_: route.fulfill(status=200, content_type='text/javascript', body=c))(corpo))
    page.goto(URL + f'?circuito={circuito}', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    if nivel:
        page.evaluate("n=>{interlagosGraficos.set({level:n,overrides:{}});return true}", nivel)
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    start_race(page, '#soloRace')
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
    for chave, minimo in (('closures', 30), ('pieces', 400), ('flashers', 30), ('signs', 40), ('queueCars', 80), ('buses', 1), ('motos', 2), ('parked', 500), ('people', 10)):
        assert st.get(chave, 0) >= minimo, f'{chave}: {st.get(chave)} < {minimo}'
    # As filas: so onde o transito vem para a linha (flow +1) ou nas ruas de duas maos; cada veiculo no leito da sua rua (a
    # via do OSM do bloqueio) e fora do leito de qualquer outra rua tao grande ou maior (nada de fila na avenida de onde vem).
    fila = page.evaluate("()=>interlagos.sceneryInfo().extras.Bloqueios_ruas.queued")
    por_id = {r['id']: r for r in RUAS}
    contra, fora, invasao = [], [], []
    for x, y, ci in fila:
        b = BLOQ[ci]
        if b.get('flow') == -1:
            contra.append(ci)
        propria = por_id.get(b.get('street'))
        if propria is None:
            continue
        if dist_rua(propria, x, y) > 1.5:
            fora.append((ci, round(x, 1), round(y, 1)))
        for r in RUAS:
            if r is not propria and rank(r) >= rank(propria) and dist_rua(r, x, y) < -.3:
                invasao.append((ci, round(x, 1), round(y, 1), r['kind'], r['name']))
                break
    servico = [ci for _, _, ci in fila if BLOQ[ci].get('street') == 655251295]
    print(f'fila: {len(fila)} veiculos; contramao {len(contra)}, fora da propria rua {len(fora)}, na rua maior {len(invasao)}; via de servico s 1726/1796: {len(servico)}', flush=True)
    assert not contra, f'fila em rua que sai da pista: {sorted(set(contra))}'
    assert not invasao, f'fila no leito de uma rua maior: {invasao[:5]}'
    assert len(fora) <= len(fila) * .05, f'fila fora da propria rua: {fora[:5]}'
    # Os estacionados ate PARK_FULL m da volta trazem as duas versoes (a completa perto da camera).
    assert st['parkedNear'] >= 400, f"estacionados com a versao completa: {st['parkedNear']}"
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
        for i, nome in [(bloq('Henrique Valgas'), 'perseguicao_henrique_valgas'), (bloq('Paulo Fontes', 1), 'perseguicao_paulo_fontes'),
                        (bloq('Oliveira Neto'), 'perseguicao_antonio_pereira'), (bloq('Visconde de Cairu'), 'perseguicao_visconde_de_cairu'),
                        (bloq('Eurico Gaspar Dutra'), 'perseguicao_eurico_dutra'), (bloq('John Kennedy'), 'perseguicao_john_kennedy')]:
            if i is not None:
                em(page, (BLOQ[i]['s'] - 30) % L, 'chase')
                foto(page, nome)
        em(page, (BLOQ[bloq('Visconde de Cairu')]['s'] - 15) % L, 'cockpit')
        foto(page, 'cockpit_visconde_de_cairu')
        # De dentro das ruas fechadas, do lado da pista e do alto; a via de servico das filas que iam parar na Gustavo Richard.
        servicos = [i for i, b in enumerate(BLOQ) if b.get('street') == 655251295]
        for i, tipo, nome in [(bloq('Paulo Fontes', 1), 'rua', 'rua_paulo_fontes'), (bloq('Paulo Fontes'), 'pista', 'pista_paulo_fontes'),
                              (bloq('Henrique Valgas'), 'rua', 'rua_henrique_valgas'), (bloq('Ivo Silveira'), 'rua', 'rua_ivo_silveira'),
                              (bloq('Eurico Gaspar Dutra'), 'rua', 'rua_eurico_dutra'), (bloq('Visconde de Cairu'), 'pista', 'pista_visconde_de_cairu'),
                              (bloq('Oliveira Neto'), 'rua', 'rua_antonio_pereira'), (bloq('Osvaldo Rodrigues Cabral', 1), 'rua', 'rua_osvaldo_cabral'),
                              (bloq('Poeta Zininho', 3), 'rua', 'rua_poeta_zininho'), (bloq('Paulo Fontes', 1), 'alto', 'alto_paulo_fontes')] + \
                             [(i, 'alto', f'alto_via_servico_{k}') for k, i in enumerate(servicos)]:
            if i is not None:
                vista_bloqueio(page, i, tipo)
                foto(page, nome)
        # Carros estacionados longe da volta, vistos da calcada (a versao completa perto da camera).
        A = DADOS['samples']
        longe = []
        for x, y, h in DADOS['scenery']['city']['parked']['items']:
            d = min(math.hypot(x - q[1], y - q[2]) for q in A[::6])
            if 180 < d < 320:
                longe.append((x, y, h))
        for k, (x, y, h) in enumerate(longe[::max(1, len(longe) // 2)][:2]):
            z = chao(page, x, y)
            vista(page, [x + math.cos(h) * 9 - math.sin(h) * 2.5, y + math.sin(h) * 9 + math.cos(h) * 2.5, z + 1.6], [x, y, z + .7], 55)
            foto(page, f'calcada_estacionados_longe_{k}')
        # De noite: os pisca-piscas, os farois e lanternas da fila. (A troca do clima recompila materiais: espera terminar.)
        noite = page.evaluate("()=>{const w=window.interlagosClima;if(!w?.set)return false;w.set({time:'noite'});return true}")
        if noite:
            page.wait_for_timeout(1500)
            wait_js(page, "!window.interlagosClima.info().compiling", timeout=120000)
            page.evaluate("()=>{interlagosClima.settle?.();return true}")
            for i, tipo, nome in [(bloq('Paulo Fontes', 1), 'rua', 'noite_rua_paulo_fontes'), (bloq('Visconde de Cairu'), 'pista', 'noite_pista_visconde_de_cairu')]:
                vista_bloqueio(page, i, tipo)
                page.wait_for_timeout(2500)
                foto(page, nome)
            em(page, (BLOQ[bloq('Visconde de Cairu')]['s'] - 30) % L, 'chase', 3000)
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
        em(page, (BLOQ[bloq('Visconde de Cairu')]['s'] - 30) % L, 'chase')
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
