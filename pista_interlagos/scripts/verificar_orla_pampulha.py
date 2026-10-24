"""A orla da Pampulha no navegador: pampulha-orla.js montado, sem erros, fora da pista, e fotos.

    python verificar_orla_pampulha.py [porta] [pasta das fotos] [--sem-celular] [--sem-noite] [--so-noite] [--so-numeros] [--so=item,item]

Abre o Circuito da Pampulha pelo seletor (?circuito=pampulha) no Treino solo e confere o módulo
(sceneryInfo().extras.Marcos_PampulhaOrla): montado sem erro, os cinco lugares montados, nenhum vértice no espaço de
rodagem da volta, o detalhe de celular mais leve. Fotografa cada lugar da volta (perseguição chegando e passando, a
câmera interna, o olho do piloto virado para ele), de perto e à noite: a Praça de Iemanjá (a estátua na lagoa e o
Portal da Memória), o Marco Zero (o totem junto do Memorial Minas-Japão), a Praça da Pampulha (a praça norte e as
torres de luz), o Mirante Bandeirantes (o terraço com o grupo de bronze) e o Mirante do Sabiá. Monta um mosaico
orla_mosaico.jpg com todas as fotos orla_*.jpg da pasta (rodadas em partes juntam-se). Fotos JPG em pista_interlagos/renders/pampulha/previas/rodada_02/orla (ou na pasta dada).
"""
import json
import math
import sys
from pathlib import Path

import browser_config  # noqa: F401  (headless e trava do ponteiro dentro da página: nunca o mouse de verdade)
from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, start_race

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8894'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'pampulha' / 'previas' / 'rodada_02' / 'orla'
FOTOS.mkdir(parents=True, exist_ok=True)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_pampulha.json').read_text(encoding='utf-8'))
A = DADOS['samples']
L = DADOS['meta']['reconstructed_xy_m']
DIA = '--so-noite' not in sys.argv
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


def mais_perto(x, y):
    return min(range(0, int(L), 2), key=lambda s: math.hypot(estacao(s)['x'] - x, estacao(s)['y'] - y))


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=2200):
    """O carro parado na estação mais próxima de s, na câmera dada."""
    if not DIA:
        return
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));true}", s)
    camera(page, modo)
    page.wait_for_timeout(espera)


def vista(page, de, para, fov=50, espera=1800, carro=None, noite=False):
    """Câmera parada em coordenadas da pista (x leste, y norte, z altura); o carro em s."""
    if not DIA and not noite:
        return
    if carro is not None:
        page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));true}", carro)
        page.wait_for_timeout(400)
    page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});true}", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


def foto(page, nome, noite=False):
    if not DIA and not noite:
        return
    caminho = FOTOS / f'orla_{nome}.jpg'
    page.screenshot(path=str(caminho), type='jpeg', quality=86)
    tiradas.append(caminho)
    print('foto', caminho.name, flush=True)


def mosaico():
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return
    ordem = ['iemanja', 'marco', 'praca', 'bandeirantes', 'sabia']
    todas = [f for f in FOTOS.glob('orla_*.jpg') if f.stem != 'orla_mosaico']
    chave = lambda f: ('noite' in f.stem, next((i for i, o in enumerate(ordem) if f.stem.startswith('orla_' + o)), 9), f.stat().st_mtime)
    tiradas[:] = sorted(todas, key=chave)
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
        desenho.text((x + 6, y + 5), caminho.stem.replace('orla_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'orla_mosaico.jpg'
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


def olho(s, alvo, lado=1.6):
    """O olho do piloto na faixa da volta do lado do alvo, em s."""
    e = estacao(s)
    dx, dy = alvo[0] - e['x'], alvo[1] - e['y']
    sinal = 1 if dx * e['n'][0] + dy * e['n'][1] > 0 else -1
    k = sinal * (e['w'] / 2 - lado)
    return e, [e['x'] + e['n'][0] * k, e['y'] + e['n'][1] * k, e['z'] + 1.15]


def de_lado(alvo, rumo, dist, alt, lateral=0.0):
    """Um ponto a dist metros do alvo no rumo (rad), deslocado de lado, alt sobre o alvo."""
    c, s = math.cos(rumo), math.sin(rumo)
    return [alvo[0] + c * dist - s * lateral, alvo[1] + s * dist + c * lateral, alvo[2] + alt]


def quer(item):
    return SO is None or item in SO


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text) if m.type == 'error' else None, print('console', m.type, m.text, flush=True)) if m.type in ('error', 'warning') else None)
    abrir(page, 'pampulha')
    info = page.evaluate("()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'pampulha', info
    est = (info['scenery'].get('extras') or {}).get('Marcos_PampulhaOrla')
    assert est, 'pampulha-orla.js não montou nada'
    print(json.dumps(est, ensure_ascii=False), flush=True)
    print('draw calls da cena:', info['drawCalls'], flush=True)
    if est.get('error'):
        falhas.append(('erro ao montar', est['error']))
    if (est.get('driveSpace') or {}).get('violations'):
        falhas.append(('espaço de rodagem', est['driveSpace']))
    itens = est.get('items') or {}
    for k in ('iemanja', 'marco_zero', 'praca_da_pampulha', 'mirante_bandeirantes', 'mirante_sabia'):
        if k not in itens:
            falhas.append(('lugar não montado', k))
    if (itens.get('praca_da_pampulha') or {}).get('towers', 0) < 6:
        falhas.append(('torres da Praça da Pampulha', (itens.get('praca_da_pampulha') or {}).get('towers')))

    if '--sem-celular' not in sys.argv:
        movel = page.evaluate("""async()=>{const m=await import('./pampulha-orla.js');const d=await (await fetch('../dados/pista_pampulha.json')).json();
         const r=m.createPampulhaOrla(d,{mobile:true});const s=r.stats;r.root.traverse(o=>{o.geometry?.dispose();});
         return {drawCalls:s.drawCalls,triangles:s.triangles,violations:s.driveSpace?.violations,error:s.error??null};}""")
        print('celular:', movel, flush=True)
        if movel['violations'] or movel['error'] or not movel['triangles'] or movel['triangles'] >= est.get('triangles', 0):
            falhas.append(('detalhe de celular', movel))

    if '--so-numeros' not in sys.argv:
        noite_fotos = []
        # ---------- Praça de Iemanjá: a estátua na lagoa, o Portal na plataforma redonda.
        if quer('iemanja') and 'iemanja' in itens:
            it = itens['iemanja']
            st, po, h, zp = it['statue'], it['portal'], it['heading'], it['platform']['z']
            s0 = mais_perto(*po)
            alvo = [po[0], po[1], zp + 3]
            for ds, modo, nome in [(-90, 'chase', 'iemanja_volta_chegando'), (-45, 'chase', 'iemanja_volta_perto'), (-50, 'cockpit', 'iemanja_volta_interna'), (0, 'chase', 'iemanja_volta_passando')]:
                em(page, s0 + ds, modo)
                foto(page, nome)
            e, de = olho(s0 - 20, po)
            vista(page, de, alvo, 56, carro=e['s'])
            foto(page, 'iemanja_volta_olho')
            fora = s0 + 90
            # Da praça pelo Portal (o enquadramento das fotos), de perto, de lado e da lagoa.
            vista(page, de_lado([po[0], po[1], zp], h + math.pi, 9, 1.65), [st[0], st[1], 2.6], 50, carro=fora)
            foto(page, 'iemanja_pelo_portal')
            vista(page, de_lado([st[0], st[1], 2.7], h + math.pi, 5.5, .6), [st[0], st[1], 4.0], 46, carro=fora)
            foto(page, 'iemanja_estatua_perto')
            vista(page, de_lado([po[0], po[1], zp], h + math.pi / 2, 9, 1.8, -2), [po[0], po[1], zp + 3], 52, carro=fora)
            foto(page, 'iemanja_portal_lado')
            vista(page, de_lado([st[0], st[1], 0.8], h, 22, 2.5, 6), [po[0], po[1], zp + 2], 48, carro=fora)
            foto(page, 'iemanja_da_lagoa')
            noite_fotos.append(('iemanja_noite_praca', de_lado([po[0], po[1], zp], h + math.pi, 10, 1.7), [st[0], st[1], 2.8], 50, fora))
            noite_fotos.append(('iemanja_noite_volta', olho(s0 - 25, po)[1], alvo, 56, s0 - 25))
        # ---------- Marco Zero.
        if quer('marco_zero') and 'marco_zero' in itens:
            it = itens['marco_zero']
            tz = it['totem']
            s0 = mais_perto(tz[0], tz[1])
            for ds, modo, nome in [(-70, 'chase', 'marco_volta_chegando'), (-30, 'chase', 'marco_volta_perto'), (-35, 'cockpit', 'marco_volta_interna')]:
                em(page, s0 + ds, modo)
                foto(page, nome)
            e, de = olho(s0 - 18, tz)
            vista(page, de, [tz[0], tz[1], tz[2] + 3.5], 50, carro=e['s'])
            foto(page, 'marco_volta_olho')
            rumo = math.atan2(it['road'][1], it['road'][0])
            vista(page, de_lado(tz, rumo + math.pi + .5, 7, 1.6), [tz[0], tz[1], tz[2] + 3.2], 55, carro=s0 + 80)
            foto(page, 'marco_perto_parque')
            vista(page, de_lado(tz, rumo - .7, 9, 1.6), [tz[0], tz[1], tz[2] + 3.0], 55, carro=s0 + 80)
            foto(page, 'marco_perto_rua')
            noite_fotos.append(('marco_noite', de_lado(tz, rumo - .9, 10, 1.6), [tz[0], tz[1], tz[2] + 3.0], 55, s0 + 80))
        # ---------- Praça da Pampulha.
        if quer('praca_da_pampulha') and 'praca_da_pampulha' in itens:
            it = itens['praca_da_pampulha']
            tw = it['towerSpots']
            centro = [-210, -972, tw[0][2]]
            s0 = mais_perto(centro[0], centro[1])
            for ds, modo, nome in [(-110, 'chase', 'praca_volta_chegando'), (-55, 'chase', 'praca_volta_perto'), (-60, 'cockpit', 'praca_volta_interna'), (0, 'chase', 'praca_volta_passando')]:
                em(page, s0 + ds, modo)
                foto(page, nome)
            e, de = olho(s0 - 30, centro)
            vista(page, de, [tw[1][0], tw[1][1], tw[1][2] + 6], 58, carro=e['s'])
            foto(page, 'praca_volta_olho')
            vista(page, [-196, -962, centro[2] + 1.7], [tw[3][0], tw[3][1], tw[3][2] + 6], 58, carro=s0 + 150)
            foto(page, 'praca_torres')
            vista(page, [tw[1][0] + 4.5, tw[1][1] - 1.5, tw[1][2] + 1.7], [tw[1][0], tw[1][1], tw[1][2] + 8], 62, carro=s0 + 150)
            foto(page, 'praca_torre_perto')
            vista(page, [-150, -1010, centro[2] + 45], [-225, -1010, centro[2]], 50, carro=s0 + 150)
            foto(page, 'praca_alto')
            noite_fotos.append(('praca_noite', [-196, -962, centro[2] + 1.7], [tw[3][0], tw[3][1], tw[3][2] + 6], 58, s0 + 150))
        # ---------- Mirante Bandeirantes.
        if quer('mirante_bandeirantes') and 'mirante_bandeirantes' in itens:
            it = itens['mirante_bandeirantes']
            g, lk, zd = it['group'], it['lake'], it['deck']
            alvo = [g[0], g[1], zd + 1.2]
            s0 = mais_perto(g[0], g[1])
            for ds, modo, nome in [(-70, 'chase', 'bandeirantes_volta_chegando'), (-30, 'chase', 'bandeirantes_volta_perto'), (-35, 'cockpit', 'bandeirantes_volta_interna')]:
                em(page, s0 + ds, modo)
                foto(page, nome)
            e, de = olho(s0 - 15, g)
            vista(page, de, alvo, 56, carro=e['s'])
            foto(page, 'bandeirantes_volta_olho')
            rumo = math.atan2(lk[1], lk[0])
            vista(page, de_lado([g[0], g[1], zd], rumo + math.pi, 5.5, 1.7, -1), [g[0] + lk[0] * 4, g[1] + lk[1] * 4, zd + 1.2], 60, carro=s0 + 90)
            foto(page, 'bandeirantes_grupo_costas')
            vista(page, de_lado([g[0], g[1], zd], rumo, 6.5, 1.5, .5), [g[0], g[1], zd + 1.2], 58, carro=s0 + 90)
            foto(page, 'bandeirantes_grupo_frente')
            vista(page, de_lado([g[0], g[1], 0.8], rumo, 40, 3), [g[0], g[1], zd + 1], 45, carro=s0 + 90)
            foto(page, 'bandeirantes_da_lagoa')
            noite_fotos.append(('bandeirantes_noite', de_lado([g[0], g[1], zd], rumo + math.pi + .4, 9, 1.8), [g[0], g[1], zd + 1.2], 56, s0 + 90))
        # ---------- Mirante do Sabiá.
        if quer('mirante_sabia') and 'mirante_sabia' in itens:
            it = itens['mirante_sabia']
            c, hs, zd = it['centre'], it['heading'], it['deck']
            alvo = [c[0], c[1], zd + 1]
            s0 = mais_perto(c[0], c[1])
            for ds, modo, nome in [(-60, 'chase', 'sabia_volta_chegando'), (-25, 'chase', 'sabia_volta_perto'), (-30, 'cockpit', 'sabia_volta_interna')]:
                em(page, s0 + ds, modo)
                foto(page, nome)
            vista(page, de_lado(alvo, hs + math.pi, 9, .7, 3), [c[0] + math.cos(hs) * 3, c[1] + math.sin(hs) * 3, zd + .8], 58, carro=s0 + 90)
            foto(page, 'sabia_perto')
            vista(page, de_lado(alvo, hs + .5, 25, 2), alvo, 50, carro=s0 + 90)
            foto(page, 'sabia_da_lagoa')
            noite_fotos.append(('sabia_noite', de_lado(alvo, hs + math.pi, 10, 1), [c[0] + math.cos(hs) * 3, c[1] + math.sin(hs) * 3, zd + .8], 58, s0 + 90))
        if '--sem-noite' not in sys.argv and noite_fotos:
            page.evaluate("interlagosClima.set({time:'noite'});true")
            page.wait_for_timeout(9000)
            for k, (nome, de, para, fov, s) in enumerate(noite_fotos):
                vista(page, de, para, fov, espera=8000 if k == 0 else 2500, carro=s, noite=True)
                foto(page, nome, noite=True)
            noite = page.evaluate("()=>interlagos.sceneryInfo().extras?.Marcos_PampulhaOrla?.night??null")
            print('noite:', noite, flush=True)
            if not noite:
                falhas.append(('noite', noite))
    browser.close()

mosaico()
erros_pagina = [e for e in erros if 'favicon' not in e]
if erros_pagina:
    falhas.append(('erros na página', erros_pagina[:5]))
print('falhas:', falhas if falhas else 'nenhuma', flush=True)
sys.exit(1 if falhas else 0)
