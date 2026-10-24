"""Autódromo Floripa no navegador: o trânsito que continua na cidade em volta da corrida (city-traffic.js) e as vagas
pintadas junto ao meio-fio (city-streets.js).

    python verificar_transito.py [porta] [pasta das fotos] [--sem-fotos] [--isolar]

Abre ?circuito=floripa no Treino solo e confere o que o modulo montou (pistas de rolamento abertas, veiculos andando,
onibus, motos, a Ponte Pedro Ivo Campos com transito, barcos com esteira), sem erros na pagina; confere que os veiculos
andam (posicoes mudam), ficam no asfalto das ruas abertas, longe do corredor da corrida e dos bloqueios, e nao se
atravessam; percorre a volta medindo as chamadas de desenho do modulo (no maximo 6); fotografa da camera de perseguicao
(a ponte gemea ao lado da Colombo Salles, ruas abertas ao fundo), da calcada, do alto, de dia e de noite; e confere que um
circuito sem cidade (o Minhocão) nao ganha nada dele.
--isolar serve os modulos dos outros construtores desta rodada na versao do ultimo commit (os novos, city-life.js e
city-race.js, vazios), para testar este sozinho enquanto os outros estao em obra.
Fotos em renders/floripa_v2/previas/rodada_02/transito/ (ou na pasta dada) e um mosaico transito_mosaico.jpg.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, start_race

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8883'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[1]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'renders' / 'floripa_v2' / 'previas' / 'rodada_02' / 'transito'
FOTOS.mkdir(parents=True, exist_ok=True)
FOTOGRAFAR = '--sem-fotos' not in sys.argv
ISOLAR = '--isolar' in sys.argv
erros = []
DADOS = json.loads((RAIZ / 'dados' / 'pista_floripa.json').read_text(encoding='utf-8'))
CIDADE = DADOS['scenery']['city']
L = DADOS['meta']['reconstructed_xy_m']
VAZIOS = {'city-life.js': ('createCityLife', 'Vida_cidade'), 'city-race.js': ('createCityRace', 'Corrida_na_cidade')}
ISOLADOS = ['city-life.js', 'city-race.js', 'city-buildings.js', 'floripa-bridges.js', 'floripa-landmarks.js', 'sea-water.js', 'far-terrain.js']


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=2200):
    """O carro parado na estacao mais proxima de s (m da volta), na camera dada."""
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", s)
    camera(page, modo)
    page.wait_for_timeout(espera)


def chao(page, x, y):
    return page.evaluate("p=>interlagos.car.terrain(p[0],p[1])", [x, y]) or 0


def vista(page, de, para, fov=50, espera=2200, no_chao=True):
    """Camera parada em coordenadas da pista (x leste, y norte, z altura sobre o chao)."""
    de, para = list(de), list(para)
    if no_chao:
        de[2] += chao(page, de[0], de[1])
        para[2] += chao(page, para[0], para[1])
    page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});return true}", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


TIRADAS = []


def foto(page, nome):
    page.screenshot(path=str(FOTOS / f'{nome}.png'))
    TIRADAS.append(nome)
    print('foto', nome, flush=True)


def abrir(page, circuito):
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
    return page.evaluate("()=>{const e=interlagos.sceneryInfo().extras||{};return {names:Object.keys(e),t:e.Transito_cidade||null,p:e.Pintura_cidade||null}}")


def corredor(x, y):
    """Distancia (m) do ponto ate a borda do asfalto da volta (aproximada pelas amostras)."""
    best = 1e9
    for p in DADOS['samples'][::2]:
        d = math.hypot(p[1] - x, p[2] - y) - p[4] / 2
        best = min(best, d)
    return best


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(300000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: print('console', m.type, m.text[:300], flush=True) if m.type == 'error' else None)
    abrir(page, 'floripa')
    st = info(page)
    t = st['t']
    print(json.dumps({k: v for k, v in t.items() if not isinstance(v, (list, dict))}, ensure_ascii=False), flush=True)
    print('rede', json.dumps(t.get('network'), ensure_ascii=False), flush=True)
    print('vagas', {k: st['p'].get(k) for k in ('bays', 'bayRows', 'bayMarks')}, flush=True)
    assert t and not t.get('stub'), 'Transito_cidade sem estatisticas'
    rede = t['network']
    for chave, minimo in (('tracks', 120), ('connectors', 150), ('zones', 40), ('twinLanes', 4)):
        assert rede.get(chave, 0) >= minimo, f'rede {chave}: {rede.get(chave)} < {minimo}'
    assert rede['laneKm'] >= 25, f'faixas abertas: {rede["laneKm"]} km'
    for chave, minimo in (('vehicles', 150), ('buses', 5), ('motos', 10), ('boats', 3), ('wakes', 3)):
        assert t.get(chave, 0) >= minimo, f'{chave}: {t.get(chave)} < {minimo}'
    assert st['p'].get('bays', 0) >= 100, f'vagas pintadas: {st["p"].get("bays")}'

    # Os veiculos andam: posicoes de agora e de 3 s depois; na ponte gemea ha transito e ele vai do continente para a ilha.
    antes = page.evaluate("interlagosTransito.vehicles()")
    page.wait_for_timeout(3000)
    depois = page.evaluate("interlagosTransito.vehicles()")
    movidos = sum(1 for a, b in zip(antes, depois) if math.hypot(a['x'] - b['x'], a['y'] - b['y']) > 1)
    print('veiculos', len(depois), 'andaram', movidos, flush=True)
    assert movidos >= len(depois) * .3, f'poucos veiculos andando: {movidos} de {len(depois)}'
    ponte = [(a, b) for a, b in zip(antes, depois) if a['twin'] and b['twin']]
    print('na ponte Pedro Ivo Campos', len(ponte), flush=True)
    assert len(ponte) >= 4, 'pouco transito na ponte gemea'
    assert sum(1 for a, b in ponte if b['x'] - a['x'] > 2) >= len(ponte) * .6, 'a ponte gemea deve correr do continente (oeste) para a ilha (leste)'
    # Longe da volta (nenhum dentro do corredor) e sem dois veiculos no mesmo lugar.
    perto = [v for v in depois if not v['deck'] and corredor(v['x'], v['y']) < 6]
    assert not perto, f'veiculos dentro do corredor da corrida: {perto[:3]}'
    batidas = 0
    for i, a in enumerate(depois):
        for b in depois[i + 1:]:
            d = math.hypot(a['x'] - b['x'], a['y'] - b['y'])
            if d < min(a['L'], b['L']) * .35 and abs(a['z'] - b['z']) < 2:
                batidas += 1
    print('sobrepostos', batidas, flush=True)
    assert batidas <= max(2, len(depois) // 60), f'veiculos sobrepostos: {batidas}'
    # Todos no asfalto (o mapa da cidade) ou no tabuleiro da ponte.
    fora = page.evaluate("""()=>{const v=interlagosTransito.vehicles().filter(v=>!v.deck);return v.filter(q=>interlagosTransito.road(q.x,q.y)>.3).length}""")
    print('fora do asfalto', fora, flush=True)
    assert fora <= max(2, len(depois) // 50), f'veiculos fora do asfalto: {fora}'

    # Chamadas de desenho do modulo pela volta.
    chamadas = []
    for k in range(12):
        s = k * L / 12
        em(page, s, 'chase', 900)
        tt = info(page)['t']
        chamadas.append((round(s), tt['drawCalls'], tt['near'], tt['far'], tt['triangles']))
    print('chamadas de desenho (s, chamadas, perto, longe, triangulos):', chamadas, flush=True)
    assert max(c[1] for c in chamadas) <= 6, f'chamadas demais: {chamadas}'

    if FOTOGRAFAR:
        # Da camera de perseguicao e de dentro do carro, na Colombo Salles: a Pedro Ivo Campos ao lado.
        for s, nome, modo in [(2350, 'perseguicao_colombo', 'chase'), (2900, 'perseguicao_colombo_fim', 'chase'), (1700, 'perseguicao_gustavo_richard', 'chase'),
                              (3300, 'perseguicao_continente', 'chase'), (2450, 'cockpit_colombo', 'cockpit')]:
            em(page, s, modo)
            foto(page, nome)
        # A ponte gemea vista da Colombo Salles (na altura de quem esta no tabuleiro) e as duas pontes de longe, sobre a agua.
        vista(page, [150, -205, 24], [60, -226, 20], 40, no_chao=False)
        foto(page, 'ponte_gemea_da_colombo')
        vista(page, [-60, -330, 40], [-60, -215, 10], 50, no_chao=False)
        foto(page, 'pontes_sobre_a_agua')
        # Do alto: a Via Expressa chegando na ponte (continente), a Gustavo Richard saindo dela (ilha), o centro.
        for de, para, nome in [([-1000, -330, 40], [-800, -260, 0], 'via_expressa_alto'), ([560, -430, 45], [760, -330, 0], 'gustavo_richard_alto'),
                               ([600, 80, 130], [900, 330, 0], 'centro_alto')]:
            vista(page, de, para)
            foto(page, nome)
        # Na calcada de uma rua aberta com movimento: ao lado do veiculo com mais vizinhos, olhando o transito vir.
        vs = [v for v in page.evaluate("interlagosTransito.vehicles()") if not v['deck'] and v['kind'] in ('primary', 'secondary', 'tertiary', 'trunk') and v['v'] > 2]
        if vs:
            alvo = max(vs, key=lambda q: sum(1 for r in vs if math.hypot(r['x'] - q['x'], r['y'] - q['y']) < 70))
            h = alvo['h']
            vista(page, [alvo['x'] + math.cos(h) * 30 + math.sin(h) * 8, alvo['y'] + math.sin(h) * 30 - math.cos(h) * 8, 1.7], [alvo['x'], alvo['y'], 1.0], 55, espera=600)
            foto(page, 'rua_aberta_calcada')
        # Vagas pintadas junto ao meio-fio, entre os carros estacionados (longe da volta, onde ha mais deles).
        pk = [q for q in CIDADE['parked']['items'] if corredor(q[0], q[1]) > 120]
        alvo = max(pk, key=lambda q: sum(1 for r in pk if math.hypot(r[0] - q[0], r[1] - q[1]) < 30))
        h = alvo[2]
        vista(page, [alvo[0] - math.sin(h) * 7 - math.cos(h) * 6, alvo[1] + math.cos(h) * 7 - math.sin(h) * 6, 13], [alvo[0] + math.cos(h) * 4, alvo[1] + math.sin(h) * 4, 0], 55)
        foto(page, 'vagas_do_alto')
        vista(page, [alvo[0] - math.sin(h) * 5.5 - math.cos(h) * 16, alvo[1] + math.cos(h) * 5.5 - math.sin(h) * 16, 1.7], [alvo[0] + math.cos(h) * 6, alvo[1] + math.sin(h) * 6, 0.2], 55)
        foto(page, 'vagas_calcada')
        # Barcos na baia com a esteira: uma lancha e um veleiro.
        barcos = page.evaluate("interlagosTransito.boats()")
        for k, (dist, lado, alt, nome) in enumerate([(45, 25, 14, 'barco_esteira'), (30, 15, 6, 'veleiro')]):
            escolha = [b for b in barcos if (b['kind'] == 'veleiro') == (k == 1)]
            if escolha:
                b = page.evaluate("interlagosTransito.boats()")[barcos.index(escolha[0])]
                hb = b['h']
                vista(page, [b['x'] - math.cos(hb) * dist + math.sin(hb) * lado, b['y'] - math.sin(hb) * dist - math.cos(hb) * lado, alt], [b['x'] - math.cos(hb) * 8, b['y'] - math.sin(hb) * 8, 0], 50, espera=700, no_chao=False)
                foto(page, nome)
        # De noite: farois e lanternas na ponte gemea e na cidade.
        noite = page.evaluate("()=>{const w=window.interlagosClima;if(!w?.set)return false;w.set({time:'noite'});return true}")
        if noite:
            page.wait_for_timeout(1500)
            wait_js(page, "!window.interlagosClima.info().compiling", timeout=120000)
            page.evaluate("()=>{interlagosClima.settle?.();return true}")
            em(page, 2350, 'chase', 3000)
            foto(page, 'noite_perseguicao_colombo')
            vista(page, [150, -205, 24], [60, -226, 20], 40, espera=3000, no_chao=False)
            foto(page, 'noite_ponte_gemea_da_colombo')
            vista(page, [-1000, -330, 40], [-800, -260, 0], espera=3000)
            foto(page, 'noite_via_expressa_alto')

    # Um circuito sem cidade: nada deste modulo.
    abrir(page, 'minhocao')
    m = info(page)
    print('minhocao', m['names'], flush=True)
    assert 'Transito_cidade' not in m['names'] or not m['t'] or not m['t'].get('vehicles'), 'o Minhocao ganhou transito'
    assert not page.evaluate("!!window.interlagosTransito"), 'o Minhocao ficou com o gancho do transito'
    browser.close()

assert not erros, f'erros na pagina: {erros}'
if FOTOGRAFAR and TIRADAS:
    # O mosaico das fotos, quando este Python tem o Pillow (o da Playwright pode nao ter).
    try:
        from PIL import Image
        w, h, cols = 640, 360, 4
        M = Image.new('RGB', (w * cols, h * ((len(TIRADAS) + cols - 1) // cols)))
        for k, nome in enumerate(TIRADAS):
            M.paste(Image.open(FOTOS / f'{nome}.png').convert('RGB').resize((w, h)), ((k % cols) * w, (k // cols) * h))
        M.save(FOTOS / 'transito_mosaico.jpg', quality=85)
    except ImportError:
        pass
print('ok: transito da cidade')
