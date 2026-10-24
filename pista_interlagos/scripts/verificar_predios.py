"""Predios da cidade (Autódromo Floripa, city-buildings.js): montados sem erros, contagens, e fotos da volta e das ruas.

    python verificar_predios.py [porta] [pasta das fotos] [--noite] [--so-volta] [--so-ruas] [--so-alto] [--so-sacadas] [--prefixo=x]

Abre ?circuito=floripa no Treino solo, confere as estatisticas de 'Predios_cidade' (predios, paredes, lojas, telhados,
draw calls) e fotografa: a camera de perseguicao ao longo da volta (s a cada ~150-300 m perto dos predios), vistas do
nivel da rua nas ruas da cidade e vistas do alto (dos tabuleiros das pontes, olhando a ilha e o continente). Confere
tambem que um circuito sem cidade (o Minhocão) nao monta o modulo. --noite tira as fotos a noite.
--so-sacadas (rodada 2): a vida nas fachadas que dao para a volta (gente nas sacadas e janelas, bandeiras e faixas,
varais, plantas, antenas): confere as contagens e fotografa da pista olhando as fachadas, de perto e de baixo.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, start_race

AQUI = Path(__file__).resolve().parents[1]
args = [a for a in sys.argv[1:] if not a.startswith('--')]
flags = [a for a in sys.argv[1:] if a.startswith('--')]
PORTA = args[0] if args else '8882'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
FOTOS = Path(args[1]) if len(args) > 1 else AQUI / 'renders/floripa_v2/previas/rodada_01/predios'
FOTOS.mkdir(parents=True, exist_ok=True)
NOITE = '--noite' in flags
PREFIXO = next((a.split('=', 1)[1] for a in flags if a.startswith('--prefixo=')), ('noite_' if NOITE else ''))
CIRCUITO = 'floripa'
erros = []

dados = json.loads((AQUI / 'dados/pista_floripa.json').read_text(encoding='utf-8'))
amostras = dados['samples']


def chao(x, y):
    """O terreno da pista (grade bilinear de data.terrain) em (x, y)."""
    t = dados['terrain']
    fx = min(max((x - t['x0']) / t['step'], 0), t['nx'] - 1.001)
    fy = min(max((y - t['y0']) / t['step'], 0), t['ny'] - 1.001)
    i, j = int(fx), int(fy)
    u, v = fx - i, fy - j
    z = t['z']
    k = j * t['nx'] + i
    return (z[k] * (1 - u) + z[k + 1] * u) * (1 - v) + (z[k + t['nx']] * (1 - u) + z[k + t['nx'] + 1] * u) * v


def rua(nome, onde=.5, adiante=70, altura=1.8, lado=0.0):
    """Olho no meio da rua (fracao do seu traco, ou o ponto dela mais perto de (x, y)), olhando adiante ao longo dela."""
    pts = [p for s in dados['scenery']['city']['streets'] if s['name'] == nome for p in s['points']]
    if not pts:
        return None
    if isinstance(onde, tuple):
        i = min(range(len(pts) - 1), key=lambda k: (pts[k][0] - onde[0]) ** 2 + (pts[k][1] - onde[1]) ** 2)
    else:
        i = min(len(pts) - 2, int(len(pts) * onde))
    a = pts[i]
    j, dist = i, 0.0
    while j + 1 < len(pts) and dist < adiante:
        dist += ((pts[j + 1][0] - pts[j][0]) ** 2 + (pts[j + 1][1] - pts[j][1]) ** 2) ** .5
        j += 1
    b = pts[j]
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = (dx * dx + dy * dy) ** .5 or 1
    ox, oy = -dy / n * lado, dx / n * lado
    za, zb = chao(a[0] + ox, a[1] + oy), chao(b[0] + ox, b[1] + oy)
    return [a[0] + ox, a[1] + oy, za + altura], [b[0] + ox, b[1] + oy, zb + altura * .9 + 2]


def amostra(s):
    return min(amostras, key=lambda p: abs(p[0] - s))


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=1700):
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", s)
    camera(page, modo)
    page.wait_for_timeout(espera)


def vista(page, de, para, fov=50, espera=1600):
    page.evaluate("p=>interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true})", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


HIDE_UI = 'body *{visibility:hidden!important} #view{visibility:visible!important}'


def ascii(nome):
    import unicodedata
    return unicodedata.normalize('NFKD', nome).encode('ascii', 'ignore').decode()


def foto(page, nome):
    page.screenshot(path=str(FOTOS / f'{PREFIXO}{nome}.png'))
    print('foto', PREFIXO + nome, flush=True)


# --stub=beira-mar,city-streets: troca modulos irmaos (em obra por outros) por um esqueleto vazio, so neste teste.
STUBS = {'beira-mar': ('createBeiraMar', 'Beira_mar'), 'city-streets': ('createCityStreets', 'Ruas_cidade'),
         'city-life': ('createCityLife', 'Vida_cidade'), 'city-traffic': ('createCityTraffic', 'Transito_cidade'), 'city-race': ('createCityRace', 'Corrida_na_cidade'),
         'street-closures': ('createStreetClosures', 'Bloqueios_ruas'), 'city-furniture': ('createCityFurniture', 'Mobiliario_cidade')}


def stubs(page):
    for nome in next((a.split('=', 1)[1] for a in flags if a.startswith('--stub=')), '').split(','):
        if nome in STUBS:
            fn, root = STUBS[nome]
            corpo = (f"import * as THREE from 'three';export {'async ' if nome != 'beira-mar' else ''}function {fn}()"
                     f"{{const root=new THREE.Group();root.name='{root}';return {{root,stats:{{stub:true}}}};}}"
                     + ("export function plateName(n){return n;}" if nome == 'city-furniture' else ''))
            page.route(f'**/teste/{nome}.js*', lambda route, pedido=None, c=corpo: route.fulfill(status=200, content_type='text/javascript', body=c))
            print('stub', nome, flush=True)


def congelar(page):
    """--congelar=floripa-bridges,sea-water: serve a versao do HEAD de modulos irmaos (em obra por outros), so neste teste."""
    import subprocess
    for nome in next((a.split('=', 1)[1] for a in flags if a.startswith('--congelar=')), '').split(','):
        if not nome:
            continue
        corpo = subprocess.run(['git', 'show', f'HEAD:pista_interlagos/teste/{nome}.js'], cwd=AQUI, capture_output=True, check=True).stdout
        page.route(f'**/teste/{nome}.js*', lambda route, pedido=None, c=corpo: route.fulfill(status=200, content_type='text/javascript', body=c))
        print('congelado', nome, flush=True)


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
    page.evaluate('interlagos.skipIntro?.()')
    page.wait_for_timeout(4000)
    if '--com-hud' not in flags:
        page.add_style_tag(content=HIDE_UI)


VOLTA = [300, 450, 600, 700, 800, 900, 1050, 1200, 1350, 1480, 3150, 3300, 3450, 3600, 3750, 3900, 4050]
RUAS = [('Rua Conselheiro Mafra', .5), ('Rua Jerônimo Coelho', (1060, -160)), ('Rua Álvaro de Carvalho', .5), ('Rua Vidal Ramos', (1250, 30)),
        ('Rua Francisco Tolentino', .5), ('Rua Felipe Schmidt', .6), ('Rua Tenente Silveira', .5), ('Rua Padre Roma', .4),
        ('Rua Duarte Schutel', (600, 550)), ('Rua 14 de Julho', (-750, -120)), ('Avenida Governador Ivo Silveira', (-950, 150)),
        ('Rua Visconde de Cairu', (-800, 0)), ('Rua Capitão Anaxágoras Aires Neto', (-1150, 200)), ('Rua Machado de Assis', (-850, 380)),
        ('Rua Pedro Ivo', .5)]


# Pontos da volta com predios altos de um lado (1: a esquerda da volta, -1: a direita).
SACADAS = [(560, -1), (600, 1), (650, 1), (1050, 1), (1100, 1), (1250, 1), (3500, 1), (3600, 1), (3700, 1), (3800, -1), (3850, -1), (3900, -1)]


def sacadas():
    """Da beira oposta da pista, olhando adiante e para cima as fachadas do lado dos predios (como o piloto as ve)."""
    out = []
    for s, lado in SACADAS:
        p, q = amostra(s), amostra(s + 30)
        o = -lado * (p[4] / 2 - 1.5)
        de = [p[1] + p[9] * o, p[2] + p[10] * o, p[3] + 1.9]
        para = [q[1] + q[9] * lado * 34, q[2] + q[10] * lado * 34, q[3] + 11]
        out.append((f'sacada_{s:04d}', de, para, 55))
    # De perto: da calcada em frente, olhando para cima as sacadas de uma torre de frente para a volta.
    for s, lado in ((600, 1), (1100, 1), (3650, 1), (3850, -1)):
        p, q = amostra(s), amostra(s + 12)
        o = lado * (p[4] / 2 + 4)
        de = [p[1] + p[9] * o, p[2] + p[10] * o, p[3] + 1.7]
        para = [q[1] + q[9] * lado * 26, q[2] + q[10] * lado * 26, q[3] + 13]
        out.append((f'sacada_perto_{s:04d}', de, para, 50))
    return out


def alto():
    """Dos tabuleiros das pontes (s~150 e s~2400), a ~30 m sobre a baia, olhando a ilha e o continente."""
    out = []
    for s, nome, alvo in [(150, 'ponte_hl_ilha', (900, 150)), (150, 'ponte_hl_continente', (-900, 200)),
                          (2400, 'ponte_cs_ilha', (800, 0)), (2400, 'ponte_cs_continente', (-1000, 0))]:
        p = amostra(s)
        # Na beira do tabuleiro, do lado do alvo (normal esquerda p[9], p[10]), olhando a cidade.
        lado = 1 if (alvo[0] - p[1]) * p[9] + (alvo[1] - p[2]) * p[10] > 0 else -1
        out.append((nome, [p[1] + p[9] * 9 * lado, p[2] + p[10] * 9 * lado, p[3] + 3], [alvo[0], alvo[1], 12], 50))
    out.append(('centro_alto', [600, -420, 120], [1050, 150, 0], 55))
    # As igrejas: da rua mais perto, a uns 25-45 m.
    tab = dados['scenery']['city']['buildings']
    col = {c: n for n, c in enumerate(tab['columns'])}
    for k, item in enumerate(i for i in tab['items'] if i[col['type']] in ('church', 'chapel') and i[col['h']] > 12):
        ring = item[col['ring']]
        cx, cy = sum(ring[0::2]) / len(ring[0::2]), sum(ring[1::2]) / len(ring[1::2])
        pts = [p for st in dados['scenery']['city']['streets'] for p in st['points']]
        q = min(pts, key=lambda p: abs(((p[0] - cx) ** 2 + (p[1] - cy) ** 2) ** .5 - 35))
        out.append((f'igreja_{k}', [q[0], q[1], chao(q[0], q[1]) + 1.8], [cx, cy, chao(cx, cy) + 7], 60))
    # Os sobrados ao lado do Mercado Publico, do nivel da rua.
    out.append(('sobrados_1', [1090, -140, chao(1090, -140) + 1.8], [1000, -95, chao(1000, -95) + 3], 60))
    out.append(('sobrados_2', [995, -120, chao(995, -120) + 1.8], [1080, -150, chao(1080, -150) + 4], 60))
    out.append(('estreito_alto', [-500, -500, 110], [-1050, 200, 0], 55))
    out.append(('mercado_alto', [1000, -330, 45], [1180, -120, 5], 55))
    return out


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: print('console', m.type, m.text, flush=True) if m.type in ('error', 'warning') else None)
    stubs(page)
    congelar(page)
    nivel = next((a.split('=', 1)[1] for a in flags if a.startswith('--nivel=')), None)
    if nivel:
        # O nivel de graficos (baixo: cenario Basico, o modulo enxuto; medio: Leve, ainda sem varandas nem telhados).
        prefs = {'graphics': {'level': nivel, 'overrides': {'dynamicResolution': False} if '--perf' in flags else {}}}
        if '--perf' in flags:
            prefs['debugOverlay'] = 'full'
        page.add_init_script('localStorage.setItem("opala99-preferences-v1",JSON.stringify(' + json.dumps(prefs) + '));')
    abrir(page, CIRCUITO)
    info = page.evaluate("()=>({circuit:interlagos.circuit,extras:interlagos.sceneryInfo().extras,drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == CIRCUITO, info
    st = (info['extras'] or {}).get('Predios_cidade')
    print(json.dumps(st, ensure_ascii=False), flush=True)
    assert st and not st.get('stub'), st
    for k in ('buildings', 'walls', 'shops', 'roofs', 'drawCalls', 'triangles'):
        assert st.get(k, 0) > 0, (k, st)
    # Rodada 2: a vida nas fachadas (pessoas, panos, coisas) cabe em ~20 draw calls com os predios.
    assert st['drawCalls'] <= 20, st
    vida = st.get('life') or {}
    print('vida', json.dumps(vida, ensure_ascii=False), flush=True)
    if not nivel:
        for k in ('people', 'balconyPeople', 'windowPeople', 'roofPeople', 'flags', 'banners', 'garments', 'plants', 'dishes', 'antennas', 'openWindows'):
            assert vida.get(k, 0) > 0, (k, vida)
        assert st.get('historic', 0) > 0, st
    if NOITE:
        page.evaluate("interlagosClima.set({time:'noite'})")
        page.wait_for_timeout(3000)
        wait_js(page, '!interlagosClima.info().compiling', timeout=120000)
        page.wait_for_timeout(3000)
        page.evaluate('interlagosClima.settle()')
    if '--perf' in flags:
        print('GPU:', page.evaluate('interlagosGraficos.info().device.renderer'), flush=True)
        # O custo dos predios: tempo de GPU por quadro com e sem eles (interlagosGraficos.hide), e draw calls/triangulos.
        def mediana(v):
            v = sorted(x for x in v if x)
            return round(v[len(v) // 2], 2) if v else None
        # A vida nas fachadas (rodada 2): as pessoas e os panos/coisas, escondidos pelo nome.
        VIDA = "['#Predios_cidade_gente','#Predios_cidade_gente_longe','#Predios_cidade_vida_ilha','#Predios_cidade_vida_continente']"
        for s0 in (600, 1200, 3750, 3850):
            em(page, s0, espera=2500)
            com, sem, semvida = [], [], []
            # Alternando com e sem (o relogio da GPU sobe e desce): a mediana de cada lado.
            for _ in range(5):
                for lista, oculto in ((com, None), (sem, "['Predios_cidade']"), (semvida, VIDA)):
                    if oculto:
                        page.evaluate(f"interlagosGraficos.hide({oculto},true);true")
                    page.wait_for_timeout(400)
                    for _ in range(12):
                        page.wait_for_timeout(80)
                        lista.append(page.evaluate('interlagosGraficos.info().resolution.gpuMs'))
                    if oculto:
                        page.evaluate(f"interlagosGraficos.hide({oculto},false);true")
            custo = page.evaluate("interlagosGraficos.cost(10).then(c=>({predios:c.parts['Predios_cidade']??null,vida:Object.fromEntries(Object.entries(c.groups).filter(([k])=>/gente|vida/.test(k))),total:Object.values(c.parts).reduce((a,p)=>[a[0]+p.calls,a[1]+p.triangles],[0,0])}))")
            print(json.dumps({'s': s0, 'gpu_ms_com': mediana(com), 'gpu_ms_sem_predios': mediana(sem), 'gpu_ms_sem_vida': mediana(semvida), 'custo_10q': custo}, ensure_ascii=False), flush=True)
    so = [f for f in flags if f.startswith('--so-')]
    if not so or '--so-volta' in so:
        for s in VOLTA:
            em(page, s)
            foto(page, f'volta_{s:04d}')
    if not so or '--so-ruas' in so:
        for nome, onde in RUAS:
            v = rua(nome, onde)
            if not v:
                print('sem rua', nome)
                continue
            vista(page, v[0], v[1], 60)
            foto(page, 'rua_' + ascii(nome.split(' ', 1)[1]).replace(' ', '_').lower()[:24])
    if not so or '--so-sacadas' in so:
        for nome, de, para, fov in sacadas():
            vista(page, de, para, fov)
            foto(page, nome)
        for s, _ in SACADAS[1::3]:
            em(page, s)
            foto(page, f'sacada_chase_{s:04d}')
    if not so or '--so-alto' in so:
        for nome, de, para, fov in alto():
            vista(page, de, para, fov)
            foto(page, 'alto_' + nome)
    page.evaluate('interlagosLuz.photo(null)')
    # Um circuito de rua sem data.scenery.city (o Minhocão) nunca monta o modulo.
    if '--sem-outro' not in flags:
        abrir(page, 'minhocao')
        ex = page.evaluate("()=>interlagos.sceneryInfo().extras||{}")
        assert 'Predios_cidade' not in ex, ex
        print('Minhocão sem Predios_cidade: ok', flush=True)
    browser.close()
assert not erros, erros
print(json.dumps({'passed': True}, ensure_ascii=False))
