"""As capivaras e o jacaré gordo da Lagoa da Pampulha no navegador: pampulha-fauna.js montado, sem erros, fora da
pista, um ponto por corrida que muda a cada corrida, e fotos.

    python verificar_fauna_pampulha.py [porta] [pasta das fotos] [--sem-celular] [--sem-tarde] [--corridas=N]

Abre o Circuito da Pampulha pelo seletor (?circuito=pampulha) no Treino solo e confere o módulo
(sceneryInfo().extras.Fauna_Pampulha): montado sem erro, nenhum lugar onde um bicho possa estar no espaço de rodagem
da volta, a volta enxergando algum gramado em cada um dos 15 pontos, o detalhe de celular mais leve. Recomeça a
corrida N vezes (Opções > Recomeçar, o mesmo beginRace de toda corrida nova) e confere que a família de capivaras
troca de ponto a cada corrida, que o jacaré aparece em alguma (noutro ponto) e que a escolha fica guardada
(localStorage opala99-pampulha-fauna-v1). Confere que as cabeças se erguem com um carro perto e que fogem de alguém a
pé. Fotografa da volta (perseguição, interna, o olho do piloto virado para elas), de perto a família (os filhotes, as
que nadam, a deitada), o jacaré de boca aberta, e no fim de tarde. Monta um mosaico fauna_mosaico.jpg.
Fotos JPG em pista_interlagos/renders/pampulha/previas/rodada_01b/fauna (ou na pasta dada).
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
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'pampulha' / 'previas' / 'rodada_01b' / 'fauna'
FOTOS.mkdir(parents=True, exist_ok=True)
CORRIDAS = next((int(a.split('=')[1]) for a in sys.argv if a.startswith('--corridas=')), 7)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_pampulha.json').read_text(encoding='utf-8'))
A = DADOS['samples']
L = DADOS['meta']['reconstructed_xy_m']
NIVEL = DADOS['scenery']['fauna']['lake_level']
erros = []
falhas = []
tiradas = []
MODULO = "(await import('./pampulha-fauna.js')).pampulhaFauna.current"


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


def mais_perto(x, y):
    """A distância na volta da estação mais perto de (x, y)."""
    return min(A, key=lambda p: math.hypot(p[1] - x, p[2] - y))[0]


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=2200):
    """O carro parado na estação mais próxima de s, na câmera dada."""
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));true}", s % L)
    camera(page, modo)
    page.wait_for_timeout(espera)


def vista(page, de, para, fov=50, espera=1800, carro=None):
    """Câmera parada em coordenadas da pista (x leste, y norte, z altura); o carro em s."""
    if carro is not None:
        page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));true}", carro % L)
        page.wait_for_timeout(400)
    page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});true}", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


def foto(page, nome):
    caminho = FOTOS / f'fauna_{nome}.jpg'
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
        desenho.text((x + 6, y + 5), caminho.stem.replace('fauna_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'fauna_mosaico.jpg'
    tela.save(destino, quality=86)
    print('mosaico', destino, flush=True)


def pronto(page):
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.();true')


def abrir(page, circuito):
    page.goto(URL + f'?circuito={circuito}', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    page.click('#soloRace')
    pronto(page)
    page.wait_for_timeout(3000)


def estado(page):
    return page.evaluate("()=>{const s=interlagos.sceneryInfo().extras?.Fauna_Pampulha;return s?JSON.parse(JSON.stringify({...s,habitat:undefined,history:undefined})):null}")


def bichos(page):
    return page.evaluate(f"async()=>{{const f={MODULO};return {{a:f.animals(),c:f.caiman()}};}}")


def olho(s, alvo, lado=2.4, altura=1.15):
    """O olho do piloto na faixa do lado da lagoa, em s."""
    e = estacao(s)
    dx, dy = alvo[0] - e['x'], alvo[1] - e['y']
    sinal = 1 if dx * e['n'][0] + dy * e['n'][1] > 0 else -1
    k = sinal * (e['w'] / 2 - lado)
    return e, [e['x'] + e['n'][0] * k, e['y'] + e['n'][1] * k, e['z'] + altura]


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text) if m.type == 'error' or 'Fauna da Pampulha' in m.text else None, print('console', m.type, m.text[:300], flush=True)) if m.type == 'error' or 'Fauna' in m.text else None)
    abrir(page, 'pampulha')
    info = page.evaluate("()=>({circuit:interlagos.circuit,drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'pampulha', info
    est = estado(page)
    assert est, 'pampulha-fauna.js não montou nada'
    print(json.dumps(est, ensure_ascii=False), flush=True)
    if est.get('error'):
        falhas.append(('erro ao montar', est['error']))
    if (est.get('driveSpace') or {}).get('violations'):
        falhas.append(('espaço de rodagem', est['driveSpace']))
    if est.get('drawCalls', 9) > 3:
        falhas.append(('draw calls', est['drawCalls']))

    # A volta enxerga algum gramado em cada ponto (raios do olho do piloto e da perseguição por cima dos muros).
    levantamento = page.evaluate(f"async()=>{{const f={MODULO};return f.survey();}}")
    print('pontos:', json.dumps(levantamento), flush=True)
    cegos = [q for q in levantamento if q['bestSeen'] < .5]
    if cegos:
        falhas.append(('pontos que a volta não vê', cegos))

    # ---------- Corridas seguidas: Opções > Recomeçar (beginRace, a mesma de toda corrida nova).
    corridas = [est['current']]
    for k in range(CORRIDAS - 1):
        page.evaluate("document.getElementById('settingsRestart').click();true")
        page.wait_for_timeout(600)
        pronto(page)
        page.wait_for_timeout(800)
        corridas.append(estado(page)['current'])
    resumo = [(c['spot'], c['caiman'], c['capybaras'], c['pups'], c['seen']) for c in corridas]
    print('corridas (ponto, jacaré, capivaras, filhotes, vista):', resumo, flush=True)
    for a, b in zip(corridas, corridas[1:]):
        if a['spot'] == b['spot']:
            falhas.append(('mesmo ponto em duas corridas seguidas', a['spot']))
    if CORRIDAS >= 4 and not any(c['caiman'] >= 0 for c in corridas):
        falhas.append(('o jacaré não apareceu em nenhuma corrida', resumo))
    for c in corridas:
        if c['caiman'] == c['spot']:
            falhas.append(('jacaré no ponto das capivaras', c))
        if not 5 <= c['capybaras'] <= 8 or not 2 <= c['pups'] <= 3:
            falhas.append(('família fora do tamanho', c))
    guardado = page.evaluate("()=>{try{return JSON.parse(localStorage.getItem('opala99-pampulha-fauna-v1'))}catch(e){return null}}")
    print('guardado:', guardado, flush=True)
    if not guardado or guardado.get('capy') != corridas[-1]['spot']:
        falhas.append(('escolha não guardada', guardado))
    est = estado(page)
    if est['driveSpace']['violations']:
        falhas.append(('espaço de rodagem depois das corridas', est['driveSpace']))

    # ---------- Para as fotos: a família no ponto onde ela pasta mais perto da volta (bem vista), o jacaré na margem
    # cuja beira d'água a volta vê melhor, longe dela.
    familias = page.evaluate(f"async()=>{{const f={MODULO};const out=[];for(let i=0;i<{len(levantamento)};i++){{const c=f.force(i,-1);out.push([i,c.eye,c.seen]);}}return out;}}")
    print('família por ponto (ponto, metros do olho, vista):', familias, flush=True)
    capi = min((q for q in familias if q[2] >= .8), key=lambda q: q[1], default=familias[0])[0]
    beiras = page.evaluate(f"async()=>{{const f={MODULO};return Array.from({{length:{len(levantamento)}}},(_,i)=>f.waterline(i));}}")
    print("beira d'água vista por ponto:", beiras, flush=True)
    jac = max((i for i in range(len(beiras)) if i != capi and abs(levantamento[i]['s'] - levantamento[capi]['s']) > 1500), key=lambda i: beiras[i])
    atual = page.evaluate(f"async([a,b])=>{{const f={MODULO};return f.force(a,b);}}", [capi, jac])
    print('fotos com capivaras no ponto', capi, 'e jacaré no', jac, json.dumps(atual, ensure_ascii=False), flush=True)
    b = bichos(page)
    C = atual['centre'] + [atual['centreZ']]
    s_c = mais_perto(C[0], C[1])
    alvo = [C[0], C[1], C[2] + .35]

    # Da volta: chegando e passando, na perseguição e na interna; o olho do piloto virado para a família.
    for ds, modo, nome in [(-90, 'chase', 'volta_chegando_perseguicao_longe'), (-60, 'chase', 'volta_chegando_perseguicao'), (-35, 'chase', 'volta_chegando_perseguicao_perto'),
                           (-70, 'cockpit', 'volta_chegando_interna'), (-45, 'cockpit', 'volta_chegando_interna_perto')]:
        em(page, s_c + ds, modo)
        foto(page, nome)
    # Passando: a cabeça erguida olhando o carro.
    em(page, s_c, 'chase', espera=3500)
    alerta = page.evaluate(f"async()=>{{const f={MODULO};return {{carro:f.stats.alert,bichos:f.animals().map(a=>a.alert)}};}}")
    print('alerta com o carro passando:', alerta, flush=True)
    if alerta['carro'] is None or alerta['carro'] > 45 or max(alerta['bichos']) < .5:
        falhas.append(('as capivaras não olham o carro passando', alerta))
    for ds, nome, fov in [(-45, 'volta_chegando_olho', 30), (0, 'volta_passando_olho', 52), (-20, 'volta_chegando_olho_largo', 58)]:
        e, de = olho(s_c + ds, alvo)
        vista(page, de, alvo, fov, carro=e['s'])
        foto(page, nome)
    camera(page, 'chase')

    # De perto (o carro 250 m adiante, fora dos quadros).
    s_fora = s_c + 250
    em(page, s_fora, 'chase', espera=800)
    b = bichos(page)
    terra = [q for q in b['a'] if q['z'] > NIVEL - .05] or b['a']
    cx, cy, cz = (sum(q[k] for q in terra) / len(terra) for k in ('x', 'y', 'z'))
    for k, (ang, d, h, fov) in enumerate([(.6, 7, 1.8, 40), (2.4, 5, 1.1, 42), (-1.3, 4, .8, 46), (math.pi, 9, 3.5, 38)]):
        vista(page, [cx + d * math.cos(ang), cy + d * math.sin(ang), cz + h], [cx, cy, cz + .35], fov)
        foto(page, f'familia_{k}')
    filhote = next((q for q in b['a'] if q['baby']), None)
    if filhote:
        vista(page, [filhote['x'] + 2.2, filhote['y'] + 1.4, filhote['z'] + .7], [filhote['x'], filhote['y'], filhote['z'] + .2], 40)
        foto(page, 'filhote')
    nadando = [q for q in b['a'] if q['z'] < NIVEL - .05]
    if nadando:
        q = nadando[0]
        vista(page, [q['x'] + 3.2, q['y'] + 2.4, NIVEL + 1.1], [q['x'], q['y'], NIVEL + .1], 40)
        foto(page, 'nadando')
    # O jacaré: de frente (boca aberta), de lado, de trás, do alto.
    c = b['c']
    if not c:
        falhas.append(('jacaré forçado e ausente', atual))
    else:
        s_j = mais_perto(c['x'], c['y'])
        y = c['yaw']
        cabeca = [c['x'] + .5 * math.cos(y), c['y'] + .5 * math.sin(y), c['z'] + .25]
        vista(page, [c['x'] + 4 * math.cos(y), c['y'] + 4 * math.sin(y), c['z'] + .8], cabeca, 42, carro=s_j + 250)
        foto(page, 'jacare_frente')
        for nome, ang, d, h, fov in [('jacare_lado', 1.35, 4.2, 1.4, 42), ('jacare_traseira', 2.6, 5, 1.9, 44), ('jacare_alto', .6, 4, 3.2, 44)]:
            vista(page, [c['x'] + d * math.cos(y + ang), c['y'] + d * math.sin(y + ang), c['z'] + h], cabeca, fov)
            foto(page, nome)
        e, de = olho(s_j - 25, cabeca)
        vista(page, de, cabeca, 26, carro=e['s'])
        foto(page, 'jacare_da_volta_olho')
        em(page, s_j - 45, 'chase')
        foto(page, 'jacare_da_volta_perseguicao')
        boca = page.evaluate(f"async()=>{{const f={MODULO};const a=f.caiman().jaw;await new Promise(r=>setTimeout(r,1500));return [a,f.caiman().jaw];}}")
        print('mandíbula do jacaré:', boca, flush=True)

    # Alguém a pé no meio da família: elas se afastam (ou entram na água) e o jacaré volta para a lagoa.
    antes = bichos(page)['a']
    em(page, s_c + 250, 'chase', espera=500)
    page.evaluate(f"async(p)=>{{const f={MODULO};f.foot(p);true}}", [C[0], C[1]])
    vista(page, [C[0] + 9, C[1] + 7, C[2] + 4], [C[0], C[1], C[2] + .3], 50, espera=4500)
    foto(page, 'fugindo_de_quem_esta_a_pe')
    depois = bichos(page)['a']
    page.evaluate(f"async()=>{{const f={MODULO};f.foot(null);true}}")
    andou = [round(math.hypot(a['x'] - d['x'], a['y'] - d['y']), 1) for a, d in zip(antes, depois)]
    print('metros que cada uma andou com alguém a pé no meio:', andou, [d['mode'] for d in depois], flush=True)
    if sum(1 for m in andou if m > 1.5) < len(andou) // 2:
        falhas.append(('não fugiram de quem estava a pé', andou))

    # Fim de tarde: da volta e de perto (uma corrida nova, bichos no lugar).
    if '--sem-tarde' not in sys.argv:
        page.evaluate(f"async([a,b])=>{{const f={MODULO};f.force(a,b);true}}", [capi, jac])
        page.evaluate("interlagosClima.set({time:'fim_de_tarde'});true")
        page.wait_for_timeout(8000)
        em(page, s_c - 50, 'chase', espera=3000)
        foto(page, 'tarde_volta_perseguicao')
        b = bichos(page)
        vista(page, [cx + 6 * math.cos(.6), cy + 6 * math.sin(.6), cz + 1.6], [cx, cy, cz + .35], 42, carro=s_c + 250)
        foto(page, 'tarde_familia')
        if b['c']:
            c = b['c']
            vista(page, [c['x'] + 4.2 * math.cos(c['yaw'] + 1.1), c['y'] + 4.2 * math.sin(c['yaw'] + 1.1), c['z'] + 1.3], [c['x'], c['y'], c['z'] + .25], 42)
            foto(page, 'tarde_jacare')
        page.evaluate("interlagosClima.set({time:'dia'});true")
    page.evaluate('interlagosLuz.photo(null);true')

    # O celular: menos triângulos, no máximo 6 capivaras, também fora da pista (a instância do jogo volta depois).
    if '--sem-celular' not in sys.argv:
        movel = page.evaluate("""async()=>{const m=await import('./pampulha-fauna.js'),keep=m.pampulhaFauna.current;const d=await (await fetch('../dados/pista_pampulha.json')).json();d.meta.id='pampulha';
         const r=m.createPampulhaFauna(d,{mobile:true});const s=r.stats;r.root.traverse(o=>{o.geometry?.dispose();});m.pampulhaFauna.current=keep;
         return {drawCalls:s.drawCalls,trianglesCapybara:s.trianglesCapybara,trianglesCaiman:s.trianglesCaiman,trianglesMax:s.trianglesMax,maxCapybaras:s.maxCapybaras,violations:s.driveSpace?.violations,error:s.error??null};}""")
        print('celular:', movel, flush=True)
        if movel['violations'] or movel['error'] or movel['maxCapybaras'] > 6 or movel['trianglesMax'] >= est.get('trianglesMax', 0):
            falhas.append(('detalhe de celular', movel))
    mosaico()
    browser.close()
assert not erros, erros
assert not falhas, falhas
print(json.dumps({'passed': True}, ensure_ascii=False))
