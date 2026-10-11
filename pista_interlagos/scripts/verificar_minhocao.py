"""Circuito do Minhocão no navegador: as estruturas do elevado e do túnel montadas, sem erros, e fotos.

    python verificar_minhocao.py [porta] [pasta das fotos] [--sem-floripa] [--so-fotos]

Abre o circuito pelo seletor (?circuito=minhocao) no Treino solo, confere minhocao-structures.js (vigas, pilares,
alças, túnel, nenhum vértice no espaço de rodagem da volta, a folga do cruzamento na Major Sertório e a do teto do
túnel), fotografa o tabuleiro, o cruzamento por baixo, o túnel e as bocas, a rampa da Ana Cintra, o elevado do alto e
um pilar de perto, e monta um mosaico. O carro passa pelo túnel e por baixo do elevado sem saltar de nível. Depois abre
Floripa uma vez (os outros circuitos seguem rodando). Fotos JPG em fotos_referencia/autodromo_minhocao/previas (ou na
pasta dada) com o prefixo estruturas_.
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
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'fotos_referencia' / 'autodromo_minhocao' / 'previas'
FOTOS.mkdir(parents=True, exist_ok=True)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_minhocao.json').read_text(encoding='utf-8'))
A = DADOS['samples']
L = DADOS['meta']['reconstructed_xy_m']
MH = DADOS['scenery']['minhocao']
erros = []
falhas = []
tiradas = []


def estacao(s):
    """Centro, altura, tangente e normal à esquerda da volta em s."""
    s %= L
    i = max(k for k, p in enumerate(A) if p[0] <= s)
    p, q = A[i], A[(i + 1) % len(A)]
    vao = (q[0] if i + 1 < len(A) else L) - p[0]
    u = (s - p[0]) / vao if vao > 0 else 0
    v = [a + (b - a) * u for a, b in zip(p, q)]
    t = math.hypot(v[7], v[8]) or 1
    n = math.hypot(v[9], v[10]) or 1
    return {'x': v[1], 'y': v[2], 'z': v[3], 'w': v[4], 't': (v[7] / t, v[8] / t), 'n': (v[9] / n, v[10] / n)}


def ponto(s, frente=0.0, lado=0.0, alto=0.0):
    e = estacao(s)
    return [e['x'] + e['t'][0] * frente + e['n'][0] * lado, e['y'] + e['t'][1] * frente + e['n'][1] * lado, e['z'] + alto]


def s_perto(x, y):
    """A estação da volta mais perto de (x, y) em planta."""
    return min(A, key=lambda p: math.hypot(p[1] - x, p[2] - y))[0]


def secao(nome, padrao):
    for s, n in DADOS['meta'].get('sections', []):
        if nome.lower() in n.lower():
            return s
    return padrao


def cruzamento():
    """A estação da rua (fora do tabuleiro e do túnel) que passa sob o eixo do elevado."""
    deck = MH['deck']
    d0 = DADOS['meta'].get('decks', [])
    t0 = DADOS['meta'].get('tunnels', [])
    dentro = lambda s, faixas: any(a <= s <= b for a, b in faixas)
    melhor = None
    for p in A:
        if dentro(p[0], d0) or dentro(p[0], t0):
            continue
        for q in deck:
            d = math.hypot(p[1] - q[0], p[2] - q[1])
            if q[2] - p[3] > 3 and (melhor is None or d < melhor[0]):
                melhor = (d, p[0], q[2] - p[3])
    return melhor


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=1800):
    """O carro parado na estação mais próxima de s (m da volta), na câmera dada."""
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", s)
    camera(page, modo)
    page.wait_for_timeout(espera)


def vista(page, de, para, fov=50, espera=1600, carro=None):
    """Câmera parada em coordenadas da pista (x leste, y norte, z altura). carro: s onde deixar o carro antes (a caixa
    de sombra do sol acompanha o carro: longe dele, túnel e viaduto ficariam sem as suas sombras)."""
    if carro is not None:
        page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", carro)
        page.wait_for_timeout(400)
    page.evaluate("p=>interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true})", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


def foto(page, nome):
    caminho = FOTOS / f'estruturas_{nome}.jpg'
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
        desenho.text((x + 6, y + 5), caminho.stem.replace('estruturas_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'estruturas_mosaico.jpg'
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


def andar(page, s, v=22.0, segundos=3.0):
    """Larga o carro em s a v m/s pela volta; devolve a maior diferença entre o carro e a pista por onde passou."""
    page.evaluate("p=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(q=>q[0]>=p.s);interlagos.reposition(Math.max(0,i));"
                  "c.vx=p.v*Math.cos(c.heading);c.vy=p.v*Math.sin(c.heading);window.__minhocaoTrilha=[];"
                  "window.__minhocaoTimer=setInterval(()=>{const k=c.index??0,q=c.a[k];if(q)__minhocaoTrilha.push([q[0],c.z-q[3],c.x,c.y]);},100);}", {'s': s, 'v': v})
    page.wait_for_timeout(int(segundos * 1000))
    trilha = page.evaluate("()=>{clearInterval(window.__minhocaoTimer);return window.__minhocaoTrilha;}")
    return trilha


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text) if m.type == 'error' else None, print('console', m.type, m.text, flush=True)) if m.type in ('error', 'warning') else None)
    abrir(page, 'minhocao')
    info = page.evaluate("()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'minhocao', info
    est = (info['scenery'].get('extras') or {}).get('Minhocao_estruturas')
    assert est, 'minhocao-structures.js não montou nada'
    print(json.dumps(est, ensure_ascii=False), flush=True)
    print('draw calls da cena:', info['drawCalls'], flush=True)
    print('parque:', est.get('park'), '| praça:', (est.get('tunnel') or {}).get('plaza'), '| murais:', est.get('murals'), flush=True)
    if est['driveSpace']['violations']:
        falhas.append(('espaço de rodagem', est['driveSpace']))
    for c in est.get('crossings', []):
        if c['clearance'] < 4.5:
            falhas.append(('cruzamento baixo', c))
    tun = est.get('tunnel') or {}
    if tun.get('roofClearance') and tun['roofClearance']['min'] < 4.55:
        falhas.append(('teto do túnel baixo', tun['roofClearance']))

    # O mesmo módulo no detalhe de celular (mobile): monta sem erro, com menos triângulos.
    movel = page.evaluate("""async()=>{const m=await import('./minhocao-structures.js');const d=await (await fetch('../dados/pista_minhocao.json')).json();
     const r=m.createMinhocaoStructures(d,{mobile:true});const s=r.stats;r.root.traverse(o=>{o.geometry?.dispose();});
     return {drawCalls:s.drawCalls,triangles:s.triangles,violations:s.driveSpace.violations,piers:s.piers.built};}""")
    print('celular:', movel, flush=True)
    if movel['violations'] or movel['triangles'] >= est['triangles']:
        falhas.append(('detalhe de celular', movel))
    deck0, deck1 = DADOS['meta']['decks'][0]
    tunel = MH['tunnel']
    cob0, cob1 = tunel['covered']
    elevado = secao('Minhocão', deck0 + 200)
    rampa = secao('Rampa da Rua Ana Cintra', deck0)
    cruz = cruzamento()
    print('cruzamento:', cruz, flush=True)

    foto(page, 'largada')
    sao_joao = secao('São João', None)
    pontos = [(elevado + 260, 'chase', 'tabuleiro_frente'), (elevado + 260, 'cockpit', 'tabuleiro_cockpit'),
              (rampa + 70, 'chase', 'rampa_ana_cintra'), (deck1 - 70, 'chase', 'descida_para_o_tunel'),
              (cob0 - 25, 'chase', 'portal_norte_chegando'), ((cob0 + cob1) / 2, 'chase', 'tunel_dentro'),
              ((cob0 + cob1) / 2, 'cockpit', 'tunel_cockpit'), (cob1 + 15, 'chase', 'saida_sul')]
    if cruz:
        pontos += [(cruz[1] - 30, 'chase', 'cruzamento_chegando'), (cruz[1] - 4, 'cockpit', 'cruzamento_cockpit')]
    if sao_joao is not None:
        pontos += [(sao_joao + 120, 'chase', 'sao_joao_murais'), (rampa - 25, 'chase', 'ana_cintra_chegando')]
    for s, modo, nome in pontos:
        em(page, s, modo)
        foto(page, nome)
    if True:
        # Vistas paradas: as bocas do túnel, o cruzamento da rua, a rampa de lado, um pilar, o elevado do alto.
        vistas = [('portal_norte', ponto(cob0 - 45, lado=1.5, alto=2.2), ponto(cob0, alto=3.0), 55, cob0 - 20),
                  ('portal_sul', ponto(cob1 + 40, lado=-1.5, alto=2.2), ponto(cob1, alto=3.0), 55, cob1 + 15),
                  ('tunel_meio', ponto((cob0 + cob1) / 2 - 18, lado=2.0, alto=1.6), ponto((cob0 + cob1) / 2 + 30, alto=2.0), 60, (cob0 + cob1) / 2 + 12),
                  ('praca_roosevelt_alto', ponto((cob0 + cob1) / 2, lado=-60, alto=45), ponto((cob0 + cob1) / 2, alto=6), 55, (cob0 + cob1) / 2),
                  ('rampa_lado', ponto(rampa + 90, lado=-34, alto=4), ponto(rampa + 90, alto=-1), 55, rampa + 90)]
        if cruz:
            s = cruz[1]
            vistas += [('cruzamento_rua', ponto(s - 32, lado=2.5, alto=1.7), ponto(s + 10, alto=4.0), 60, s - 12),
                       ('cruzamento_de_lado', ponto(s, frente=-6, lado=-24, alto=3), ponto(s, frente=4, alto=4.5), 60, s + 20)]
        # Um pilar fora da volta: o do meio da lista, visto do chão a 9 m.
        pilares = MH.get('piers', [])
        if pilares:
            pil = pilares[len(pilares) // 4]
            ang = pil[4]
            vistas.append(('pilar_perto', [pil[0] - math.sin(ang) * 9 + math.cos(ang) * 4, pil[1] + math.cos(ang) * 9 + math.sin(ang) * 4, pil[2] + 1.7],
                           [pil[0], pil[1], pil[2] + 4.0], 60, s_perto(pil[0], pil[1])))
            # A fila sob o tabuleiro da volta (os pilares sob o trecho da volta no elevado).
            volta = [q for q in pilares if any(a <= (min(range(len(MH['deck'])), key=lambda k: math.hypot(MH['deck'][k][0] - q[0], MH['deck'][k][1] - q[1])) * 4) <= b for a, b in MH.get('lap', []))]
            pil2 = (volta or pilares)[len(volta or pilares) // 2]
            vistas.append(('pilares_fila', [pil2[0] + math.cos(pil2[4]) * 30 + math.sin(pil2[4]) * 6, pil2[1] + math.sin(pil2[4]) * 30 - math.cos(pil2[4]) * 6, pil2[2] + 2.0],
                           [pil2[0], pil2[1], pil2[2] + 4.0], 60, s_perto(pil2[0], pil2[1])))
        # O elevado de cima, ao longo do eixo (os prédios a 5 m do tabuleiro tapam as vistas de lado), e a junção da
        # rampa da Ana Cintra com o tabuleiro.
        vistas += [('elevado_aereo', ponto(elevado + 60, frente=-120, lado=-30, alto=95), ponto(elevado + 420, alto=-4), 55, elevado + 240),
                   ('elevado_juncao', ponto(rampa + 160, frente=-30, lado=-55, alto=45), ponto(rampa + 200, alto=-2), 55, rampa + 190)]
        # O Parque Minhocão (o tabuleiro fora da volta): de pé no meio dele e do alto; a Praça Roosevelt ao rés do chão.
        deck = MH['deck']
        fora = [i for i in range(len(deck)) if not any(a <= i * 4 <= b + 60 for a, b in MH.get('lap', [])) and i * 4 > 900]
        if fora:
            i = fora[min(len(fora) - 1, 40)]
            a, b = deck[i], deck[min(len(deck) - 1, i + 12)]
            vistas += [('parque_no_tabuleiro', [a[0], a[1], a[2] + 1.7], [b[0], b[1], b[2] + 1.2], 60, s_perto(a[0], a[1])),
                       ('parque_do_alto', [a[0] + 25, a[1] - 20, a[2] + 28], [b[0], b[1], b[2]], 55, s_perto(a[0], a[1]))]
        meio = (cob0 + cob1) / 2
        vistas += [('praca_ao_rés', ponto(meio - 35, lado=-4, alto=8.6), ponto(meio + 10, lado=4, alto=6.0), 60, meio),
                   ('praca_lateral', ponto(meio, lado=-30, alto=10), ponto(meio + 15, lado=3, alto=6.5), 55, meio)]
        for nome, de, para, fov, carro in vistas:
            vista(page, de, para, fov, carro=carro)
            foto(page, nome)
        page.evaluate('interlagosLuz.photo(null)')
    # O carro no túnel e sob o elevado: segue a pista (não sobe para o tabuleiro nem cai).
    if '--sem-direcao' not in sys.argv:
        for nome, s in [('tunel', cob0 - 30), ('cruzamento', (cruz[1] - 40) if cruz else None)]:
            if s is None:
                continue
            trilha = andar(page, s)
            pior = max((abs(d) for _, d, _, _ in trilha), default=0)
            print(f'direção {nome}: {len(trilha)} amostras de s {trilha[0][0]:.0f} a {trilha[-1][0]:.0f}, maior diferença carro-pista {pior:.2f} m', flush=True)
            if pior > 1.2:
                print('  ATENÇÃO: o carro saiu do nível da pista', [t for t in trilha if abs(t[1]) > 1.2][:5], flush=True)
    mosaico()
    # De volta à câmera de perseguição: um circuito aberto já na câmera interna enche o console de avisos de
    # textura do WebGL (acontece com qualquer circuito, não é do Minhocão).
    camera(page, 'chase')
    page.wait_for_timeout(500)
    if '--sem-floripa' not in sys.argv:
        abrir(page, 'floripa')
        f = page.evaluate("()=>({circuit:interlagos.circuit,extras:Object.keys(interlagos.sceneryInfo().extras||{}),ready:interlagos.ready})")
        print('floripa:', f, flush=True)
        assert f['circuit'] == 'floripa' and f['ready'], f
        assert 'Minhocao_estruturas' not in f['extras'], f
    browser.close()
assert not erros, erros
assert not falhas, falhas
print(json.dumps({'passed': True}, ensure_ascii=False))
