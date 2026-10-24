"""O Parque Guanabara no navegador: pampulha-guanabara.js montado, sem erros, fora da pista, os brinquedos andando, e fotos.

    python verificar_guanabara.py [porta] [pasta das fotos] [--sem-celular] [--sem-noite] [--so-perto]

Abre o Circuito da Pampulha pelo seletor (?circuito=pampulha) no Treino solo e confere o módulo
(sceneryInfo().extras.Marcos_Pampulha_Guanabara): montado sem erro, nenhum vértice no espaço de rodagem da volta em
nenhuma pose dos brinquedos, poucas chamadas de desenho, o detalhe de celular mais leve. Confere o movimento: com o
relógio do jogo (a roda girando, o relógio do parque andando) e num ciclo inteiro pelo relógio do parque (setTime): a
roda gira sempre no mesmo sentido; o Elevador sobe devagar (mais de 20 s, até uns 45 m), segura no alto, despenca a
mais de 20 m/s em menos de 3 s e freia; o Cataclisma balança cada vez mais, passa por cima, gira para um lado e para o
outro e para. Fotografa da volta (a avenida ao lado do parque, s 980-1260), na perseguição, na interna e do olho do
piloto, do lado da Igrejinha e da lagoa; de perto a roda, o Elevador no alto, o Cataclisma, o carrossel, o portão, as
barracas e a placa; do alto; e à noite. Monta um mosaico guanabara_mosaico.jpg.
Fotos JPG em pista_interlagos/renders/pampulha/previas/rodada_02/guanabara (ou na pasta dada).
"""
import json
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

import browser_config  # noqa: F401  (headless e a trava do mouse dentro da página, antes de qualquer página)
from browser_config import browser_executable, browser_args, wait_js, start_race

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8892'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'pampulha' / 'previas' / 'rodada_02' / 'guanabara'
FOTOS.mkdir(parents=True, exist_ok=True)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_pampulha.json').read_text(encoding='utf-8'))
A = DADOS['samples']
L = DADOS['meta']['reconstructed_xy_m']
M = next(m for m in DADOS['scenery']['landmarks'] if m['kind'] == 'parque_guanabara')
CHAVE = 'Marcos_Pampulha_Guanabara'
erros = []
falhas = []
tiradas = []

# Os pontos do parque (o mesmo deslocamento do módulo se o contorno mudar): a roda, o Elevador, o Cataclisma, o carrossel,
# o portão, as barracas e o centro; o chão do parque perto de 10 m.
DX, DY = M['x'] - 71.89, M['y'] + 930.75
Z = M['ground']


def p(x, y, z):
    return [x + DX, y + DY, z]


RODA = p(54.5, -926.5, Z + 20)
TORRE = p(15, -916.5, Z + 30)
TORRE_TOPO = p(15, -916.5, Z + 50)
CATA = p(95, -946, Z + 14)
CARROSSEL = p(50.3, -902.5, Z + 3)
PORTAO = p(31, -892.7, Z + 4)
BARRACAS = p(117.6, -936.6, Z + 2)
CENTRO = p(72, -930, Z + 6)


def estacao(s):
    """Centro, altura, largura, tangente e normal à esquerda da volta em s."""
    s %= L
    i = max(k for k, q in enumerate(A) if q[0] <= s)
    a, b = A[i], A[(i + 1) % len(A)]
    vao = (b[0] if i + 1 < len(A) else L) - a[0]
    u = (s - a[0]) / vao if vao > 0 else 0
    v = [x + (y - x) * u for x, y in zip(a, b)]
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
    """Câmera parada em coordenadas da pista (x leste, y norte, z altura); o carro em s."""
    if carro is not None:
        page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));true}", carro)
        page.wait_for_timeout(400)
    page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});true}", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


def relogio(page, t):
    """O relógio do parque em t (os brinquedos na pose daquele instante; o jogo segue dali)."""
    page.evaluate("async t=>{const m=await import('./pampulha-guanabara.js');m.pampulhaGuanabara.current.setTime(t);true}", t)


def foto(page, nome):
    caminho = FOTOS / f'guanabara_{nome}.jpg'
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
        desenho.text((x + 6, y + 5), caminho.stem.replace('guanabara_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'guanabara_mosaico.jpg'
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
    """O olho do piloto na faixa da volta do lado do parque, em s."""
    e = estacao(s)
    dx, dy = alvo[0] - e['x'], alvo[1] - e['y']
    sinal = 1 if dx * e['n'][0] + dy * e['n'][1] > 0 else -1
    k = sinal * (e['w'] / 2 - lado)
    return e, [e['x'] + e['n'][0] * k, e['y'] + e['n'][1] * k, e['z'] + 1.15]


def ciclo(page):
    """Um ciclo inteiro dos brinquedos pelo relógio do parque, de 0,25 em 0,25 s, e o que ele mostra."""
    serie = page.evaluate("""async()=>{const m=await import('./pampulha-guanabara.js'),g=m.pampulhaGuanabara.current,out=[];
      for(let k=0;k<=280;k++){const t=k*.25;g.setTime(t);out.push({t,...g.rides()});}return out;}""")
    torre = [s['elevador'] for s in serie]
    sobe = [x for x in torre if x['phase'] == 'subida']
    cai = [x for x in torre if x['phase'] == 'queda']

    def mais_longa(fase):
        """A maior sequência seguida de amostras na fase (uma subida, uma queda), em segundos."""
        melhor = atual = 0
        for x in torre:
            atual = atual + 1 if x['phase'] == fase else 0
            melhor = max(melhor, atual)
        return melhor * .25
    res = {
        'roda_passos_para_tras': sum(1 for a, b in zip(serie, serie[1:]) if ((b['roda']['angle'] - a['roda']['angle']) % 360) > 180),
        'roda_graus_por_s': round(((serie[8]['roda']['angle'] - serie[0]['roda']['angle']) % 360) / 2, 2),
        'elevador_altura_max': max(x['height'] for x in torre),
        'elevador_subida_s': mais_longa('subida'),
        'elevador_subida_vel_max': max((x['speed'] for x in sobe), default=0),
        'elevador_queda_s': mais_longa('queda'),
        'elevador_queda_vel_min': min((x['speed'] for x in cai), default=0),
        'elevador_vel_min': min(x['speed'] for x in torre),
        'elevador_fases': sorted({x['phase'] for x in torre}),
        'cataclisma_fases': sorted({s['cataclisma']['phase'] for s in serie}),
        'cataclisma_angulo_max': max(abs(s['cataclisma']['angle']) for s in serie),
        'cataclisma_voltas': round(max(s['cataclisma']['turns'] for s in serie) - min(s['cataclisma']['turns'] for s in serie), 2),
        'cataclisma_vel': [min(s['cataclisma']['speed'] for s in serie), max(s['cataclisma']['speed'] for s in serie)],
    }
    print('ciclo:', json.dumps(res, ensure_ascii=False), flush=True)
    if res['roda_passos_para_tras'] or res['roda_graus_por_s'] < 1:
        falhas.append(('roda não gira', res))
    if res['elevador_altura_max'] < 40 or res['elevador_subida_s'] < 20 or res['elevador_subida_vel_max'] > 3.5:
        falhas.append(('Elevador não sobe devagar até o alto', res))
    if res['elevador_queda_s'] > 3 or res['elevador_vel_min'] > -20:
        falhas.append(('Elevador não despenca', res))
    if res['cataclisma_angulo_max'] < 170 or res['cataclisma_voltas'] < 2 or res['cataclisma_vel'][0] > -1 or res['cataclisma_vel'][1] < 1:
        falhas.append(('Cataclisma não gira para os dois lados', res))
    return serie


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text) if m.type == 'error' else None, print('console', m.type, m.text, flush=True)) if m.type in ('error', 'warning') else None)
    abrir(page, 'pampulha')
    info = page.evaluate("()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'pampulha', info
    est = (info['scenery'].get('extras') or {}).get(CHAVE)
    assert est, 'pampulha-guanabara.js não montou nada'
    resumo = {k: v for k, v in est.items() if k not in ('driveSpace', 'rides')}
    print(json.dumps(resumo, ensure_ascii=False), flush=True)
    print('espaço de rodagem:', json.dumps(est.get('driveSpace'), ensure_ascii=False), flush=True)
    print('draw calls da cena:', info['drawCalls'], 'árvores tiradas (todas as clareiras):', info['scenery'].get('cleared'), flush=True)
    if est.get('built'):
        falhas.append(('partes com erro', est['built']))
    if (est.get('driveSpace') or {}).get('violations'):
        falhas.append(('espaço de rodagem', est['driveSpace']))
    if est.get('outside'):
        falhas.append(('fora do contorno', est['outside']))
    if est.get('drawCalls', 99) > 6:
        falhas.append(('chamadas de desenho demais', est['drawCalls']))

    if '--sem-celular' not in sys.argv:
        movel = page.evaluate("""async()=>{const m=await import('./pampulha-guanabara.js');const d=await (await fetch('../dados/pista_pampulha.json')).json();
         const keep=m.pampulhaGuanabara.current;const r=m.createPampulhaGuanabara(d,{mobile:true});m.pampulhaGuanabara.current=keep;const s=r.stats;r.root.traverse(o=>{o.geometry?.dispose();});
         return {drawCalls:s.drawCalls,triangles:s.triangles,bulbs:s.bulbs,violations:s.driveSpace?.violations,built:s.built};}""")
        print('celular:', movel, flush=True)
        if movel['violations'] or movel['built'] or not movel['triangles'] or movel['triangles'] >= est.get('triangles', 0):
            falhas.append(('detalhe de celular', movel))

    # O movimento com o relógio do jogo: 6 s de jogo.
    a0 = page.evaluate(f"()=>interlagos.sceneryInfo().extras['{CHAVE}']")
    page.wait_for_timeout(6000)
    a1 = page.evaluate(f"()=>interlagos.sceneryInfo().extras['{CHAVE}']")
    dt = (a1['time'] - a0['time']) % 7200
    giro = (a1['rides']['roda']['angle'] - a0['rides']['roda']['angle']) % 360
    print('relógio do jogo:', round(dt, 2), 's; roda', round(giro, 1), '°; elevador', a0['rides']['elevador'], '->', a1['rides']['elevador'],
          '; cataclisma', a0['rides']['cataclisma'], '->', a1['rides']['cataclisma'], flush=True)
    if dt < 2 or giro < 1:
        falhas.append(('nada anda com o relógio do jogo', {'dt': dt, 'roda': giro}))
    ciclo(page)

    so_perto = '--so-perto' in sys.argv
    # O Elevador quase no alto e o Cataclisma girando nas fotos (o relógio volta a cada uma).
    ALTO = 33.2
    if not so_perto:
        # Da volta: a avenida ao lado do parque (o parque à esquerda), chegando e passando, na perseguição e na interna.
        for s, modo, nome in [(960, 'chase', 'volta_chegando_perseguicao_longe'), (1060, 'chase', 'volta_chegando_perseguicao'), (1140, 'chase', 'volta_chegando_perseguicao_perto'),
                              (1050, 'cockpit', 'volta_chegando_interna'), (1130, 'cockpit', 'volta_chegando_interna_perto'),
                              (1200, 'chase', 'volta_passando_perseguicao'), (1250, 'chase', 'volta_saindo_perseguicao')]:
            relogio(page, ALTO)
            em(page, s, modo)
            foto(page, nome)
        for s, alvo, nome, fov in [(1040, RODA, 'volta_chegando_olho', 56), (1150, CENTRO, 'volta_passando_olho', 70), (1235, TORRE, 'volta_saindo_olho', 60),
                                   (1420, RODA, 'volta_igrejinha_olho', 50)]:
            e, de = olho(s, alvo)
            relogio(page, ALTO)
            vista(page, de, alvo, fov, carro=e['s'])
            foto(page, nome)
        camera(page, 'chase')
    s_fora = 1500
    # Da lagoa (um barco a leste), de perto e do alto.
    relogio(page, ALTO)
    vista(page, p(330, -860, 4), p(60, -925, 22), 34, carro=s_fora)
    foto(page, 'lagoa')
    relogio(page, ALTO)
    vista(page, p(91, -915.5, Z + 12), RODA, 64, carro=s_fora)
    foto(page, 'roda')
    relogio(page, ALTO)
    vista(page, p(40, -880, Z + 3), TORRE_TOPO, 58, carro=s_fora)
    foto(page, 'elevador_no_alto')
    relogio(page, 4)
    vista(page, p(33, -905, Z + 2), p(15, -916.5, Z + 6), 60, carro=s_fora)
    foto(page, 'elevador_embarque')
    relogio(page, 27.5)
    vista(page, p(110, -921, Z + 15), CATA, 72, carro=s_fora)
    foto(page, 'cataclisma_girando')
    relogio(page, 14)
    vista(page, p(112, -944, Z + 2), CATA, 72, carro=s_fora)
    foto(page, 'cataclisma_balanco')
    vista(page, p(76, -934, Z + 2.5), p(67, -939, Z + 1), 64, carro=s_fora)
    foto(page, 'xicaras')
    vista(page, p(72, -942, Z + 2), p(52, -959, Z + 3), 66, carro=s_fora)
    foto(page, 'trem_fantasma')
    vista(page, p(62, -893, Z + 2), CARROSSEL, 62, carro=s_fora)
    foto(page, 'carrossel')
    vista(page, p(31, -872, Z - 2.5), PORTAO, 56, carro=s_fora)
    foto(page, 'portao')
    vista(page, p(36, -915, Z + 2), PORTAO, 56, carro=s_fora)
    foto(page, 'portao_de_dentro')
    vista(page, p(100, -957, Z + 2), BARRACAS, 60, carro=s_fora)
    foto(page, 'barracas')
    vista(page, p(30, -952, Z + 2.5), p(31, -931, Z + 1), 66, carro=s_fora)
    foto(page, 'trem_jardim')
    vista(page, p(80, -880, Z + 3), p(71, -904, Z + 2), 60, carro=s_fora)
    foto(page, 'autopista')
    relogio(page, ALTO)
    vista(page, p(175, -1015, 75), CENTRO, 54, carro=s_fora)
    foto(page, 'alto')
    if '--sem-noite' not in sys.argv:
        page.evaluate("interlagosClima.set({time:'noite'});true")
        page.wait_for_timeout(9000)
        vista(page, p(112, -905, Z + 1), RODA, 62, espera=8000, carro=s_fora)
        noite = page.evaluate(f"()=>interlagos.sceneryInfo().extras?.['{CHAVE}']?.night??null")
        print('noite:', noite, flush=True)
        if not noite or noite.get('level') != 1:
            falhas.append(('noite não chegou', noite))
        relogio(page, ALTO)
        vista(page, p(91, -915.5, Z + 12), RODA, 64, carro=s_fora)
        foto(page, 'noite_roda')
        relogio(page, ALTO)
        vista(page, p(330, -860, 4), p(60, -925, 22), 34, carro=s_fora)
        foto(page, 'noite_lagoa')
        vista(page, p(31, -872, Z - 2.5), PORTAO, 56, carro=s_fora)
        foto(page, 'noite_portao')
        relogio(page, 27.5)
        vista(page, p(110, -921, Z + 15), CATA, 72, carro=s_fora)
        foto(page, 'noite_cataclisma')
        if not so_perto:
            relogio(page, ALTO)
            e, de = olho(1150, CENTRO)
            vista(page, de, CENTRO, 70, carro=e['s'])
            foto(page, 'noite_volta_passando_olho')
            for s, modo, nome in [(1060, 'chase', 'noite_volta_chegando_perseguicao'), (1130, 'cockpit', 'noite_volta_chegando_interna')]:
                relogio(page, ALTO)
                em(page, s, modo, espera=3000)
                foto(page, nome)
            camera(page, 'chase')
        page.evaluate("interlagosClima.set({time:'dia'});true")
    page.evaluate('interlagosLuz.photo(null);true')
    mosaico()
    browser.close()
erros = [e for e in erros if 'THREE.Clock' not in e]
assert not erros, erros
assert not falhas, falhas
print(json.dumps({'passed': True}, ensure_ascii=False))
