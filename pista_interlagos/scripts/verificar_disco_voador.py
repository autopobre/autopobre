"""O disco voador dos autódromos de MG à noite (flying-saucer.js) no navegador: montado só em Curvelo e na Pampulha,
recusado de dia, de noite chega, passa na frente da vista (na perseguição e de dentro do carro, abaixo da linha do
teto), liga o feixe, vai embora e some; com ?ovni=1 vem sozinho segundos depois da largada. Fotos de cada fase.

    python verificar_disco_voador.py [porta] [pasta das fotos] [--sem-pampulha]

Abre o Treino solo pelo seletor (?circuito=...), põe a noite (interlagosClima.set) e lança o disco pelo gancho do
módulo (flyingSaucer.current.launch). Fotos JPG e um mosaico disco_mosaico.jpg em
pista_interlagos/renders/disco_voador/rodada_01 (ou na pasta dada).
"""
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, start_race

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8871'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'disco_voador' / 'rodada_01'
FOTOS.mkdir(parents=True, exist_ok=True)
erros, falhas, tiradas, recortes = [], [], [], []
DISCO = "(await import('./flying-saucer.js')).flyingSaucer.current"


def check(nome, ok, detalhe=''):
    print(('ok  ' if ok else 'FAIL') + ' ' + nome + (' - ' + str(detalhe) if detalhe != '' else ''), flush=True)
    if not ok:
        falhas.append(nome)


def foto(page, nome, tela=None):
    caminho = FOTOS / f'disco_{nome}.jpg'
    page.screenshot(path=str(caminho), type='jpeg', quality=88)
    tiradas.append(caminho)
    print('foto', caminho.name, flush=True)
    if tela and tela['front'] and abs(tela['x']) < 1 and abs(tela['y']) < 1:
        recortes.append((caminho, tela))


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
        desenho.text((x + 6, y + 5), caminho.stem.replace('disco_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'disco_mosaico.jpg'
    tela.save(destino, quality=86)
    print('mosaico', destino, flush=True)
    # O disco de perto: o pedaço da foto em volta dele, ampliado três vezes.
    if recortes:
        linhas = math.ceil(len(recortes) / col)
        zoom = Image.new('RGB', (w * col, (h + 22) * linhas), (24, 24, 24))
        desenho = ImageDraw.Draw(zoom)
        for k, (caminho, s) in enumerate(recortes):
            img = Image.open(caminho).convert('RGB')
            cx, cy = img.width * (1 + s['x']) / 2, img.height * (1 - s['y']) / 2
            pedaco = img.crop((int(cx - w / 6), int(cy - h / 6), int(cx + w / 6), int(cy + h / 6))).resize((w, h), Image.LANCZOS)
            x, y = (k % col) * w, (k // col) * (h + 22)
            zoom.paste(pedaco, (x, y + 22))
            desenho.text((x + 6, y + 5), caminho.stem.replace('disco_', ''), fill=(235, 235, 235))
        destino = FOTOS / 'disco_de_perto.jpg'
        zoom.save(destino, quality=88)
        print('de perto', destino, flush=True)


def abrir(page, circuito, extra=''):
    page.goto(URL + f'?circuito={circuito}{extra}', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    start_race(page, '#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.();true')
    page.wait_for_timeout(2500)


def longe_da_largada(page, fracao):
    """O carro parado numa estação da volta (fração do comprimento), longe do pórtico da largada."""
    page.evaluate("f=>{const c=interlagos.car;interlagos.reposition(Math.floor(c.a.length*f));true}", fracao)
    page.wait_for_timeout(1500)


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)
    page.wait_for_timeout(700)


def info(page):
    return page.evaluate(f"async()=>{{const d={DISCO};return d?d.info():null}}")


def noite(page, rain='seco'):
    page.evaluate(f"window.interlagosClima.set({{time:'noite',rain:'{rain}'}});true")
    page.wait_for_timeout(1500)


def ate(page, t):
    """Espera o voo chegar a t segundos."""
    wait_js(page, f"(async()=>{{const d={DISCO};const i=d?.info();return !i?.flying||i.t>={t}}})()", timeout=30000)
    return info(page)


QUADROS = """async([lancar,ms])=>{const d=(await import('./flying-saucer.js')).flyingSaucer.current,gaps=[];let last=performance.now();
 if(lancar)d.launch();const end=last+ms;await new Promise(done=>{const tick=t=>{gaps.push(t-last);last=t;if(t<end)requestAnimationFrame(tick);else done();};requestAnimationFrame(tick);});
 gaps.sort((a,b)=>b-a);return {max:Math.round(gaps[0]),second:Math.round(gaps[1]),frames:gaps.length};}"""


def sem_travar(page):
    """O primeiro voo depois da pista montada: nenhum quadro muito mais longo que os de antes (programas já compilados)."""
    antes = page.evaluate(QUADROS, [False, 2000])
    durante = page.evaluate(QUADROS, [True, 2000])
    check('first flight: no hitch as it appears', durante['max'] < antes['max'] + 80, {'antes': antes, 'durante': durante})
    wait_js(page, f"(async()=>!({DISCO}).info().flying)()", timeout=30000)


def voo(page, nome, marcos, modo_meio=None):
    """Lança o disco e fotografa nos tempos dados; devolve as leituras."""
    lido = []
    ok = page.evaluate(f"async()=>{DISCO}.launch()")
    check(f'{nome}: launch() at night', ok)
    for t, rotulo in marcos:
        if modo_meio and rotulo == 'cockpit':
            camera(page, 'cockpit')
        i = ate(page, t)
        foto(page, f'{nome}_{t:04.1f}s_{rotulo}', i.get('screen'))
        lido.append((t, rotulo, i))
        print(f'  t={i["t"]} tela={i["screen"]} elevacao={i["elevation"]} feixe={i["beam"]}', flush=True)
    wait_js(page, f"(async()=>!({DISCO}).info().flying)()", timeout=30000)
    return lido


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text), print('console', m.type, m.text[:300], flush=True)) if m.type == 'error' else None)

    # Interlagos: nenhum disco.
    abrir(page, 'interlagos')
    check('interlagos: no saucer (not MG)', info(page) is None)

    # Curvelo: de dia recusado; de noite o voo completo, na perseguição e de dentro do carro.
    abrir(page, 'curvelo')
    i = info(page)
    check('curvelo: saucer built, hidden, waiting', i is not None and not i['visible'] and i['state'] == 'waiting', i and {k: i[k] for k in ('state', 'at', 'night')})
    page.evaluate("window.interlagosClima.set({time:'dia',rain:'seco'});true")
    page.wait_for_timeout(800)
    check('curvelo: refused by day', page.evaluate(f"async()=>{DISCO}.launch()") is False)
    noite(page)
    camera(page, 'chase')
    longe_da_largada(page, .42)
    sem_travar(page)
    lido = voo(page, 'curvelo', [(.2, 'acende'), (1.4, 'chegando'), (3.6, 'parado'), (6.6, 'feixe'), (10.2, 'cruzando'), (12.9, 'partindo'), (14.3, 'sumindo')])
    for t, rotulo, li in lido:
        if 3 <= t <= 12.4 and li['flying']:
            s = li['screen']
            check(f'curvelo {rotulo}: in the chase view, clear of the panels', s and s['front'] and abs(s['x']) < .6 and .05 < s['y'] < .42, s)
    feixe = [li for t, r, li in lido if r == 'feixe'][0]
    check('curvelo: the beam on mid-pass', feixe['beam'])
    fim = info(page)
    check('curvelo: gone after the pass', not fim['visible'] and not fim['flying'], fim['state'])
    # De dentro do carro: abaixo da linha do teto.
    camera(page, 'cockpit')
    lido = voo(page, 'curvelo_cockpit', [(4.2, 'cockpit'), (6.8, 'feixe'), (10.4, 'cruzando')])
    for t, rotulo, li in lido:
        s = li['screen']
        check(f'cockpit {rotulo}: in the windscreen, under the sun strip', s and s['front'] and abs(s['x']) < .95 and -.15 < s['y'] < .22, s)
    # Na chuva, de noite.
    camera(page, 'chase')
    noite(page, 'chuva')
    voo(page, 'curvelo_chuva', [(4.0, 'parado'), (7.0, 'feixe')])
    noite(page)
    # Dia de novo no meio do voo: some na hora.
    page.evaluate(f"async()=>{DISCO}.launch()")
    ate(page, 4)
    page.evaluate("window.interlagosClima.set({time:'dia',rain:'seco'});true")
    page.wait_for_timeout(300)
    check('curvelo: daylight back and it is not there', not info(page)['visible'])

    # ?ovni=1: vem sozinho poucos segundos depois da largada, numa corrida de noite.
    page.evaluate("window.interlagosClima.set({time:'noite',rain:'seco'});true")
    abrir(page, 'curvelo', '&ovni=1')
    noite(page)
    try:
        wait_js(page, f"(async()=>({DISCO}).info().flights>0)()", timeout=40000)
        i = info(page)
        check('?ovni=1: it came by itself in the night race', True, {k: i[k] for k in ('clock', 'at', 'forced', 'flights')})
        ate(page, 4.5)
        foto(page, 'curvelo_sozinho')
    except TimeoutError:
        i = info(page)
        check('?ovni=1: it came by itself in the night race', False, i)

    if '--sem-pampulha' not in sys.argv:
        abrir(page, 'pampulha')
        noite(page)
        camera(page, 'chase')
        longe_da_largada(page, .3)
        voo(page, 'pampulha', [(1.4, 'chegando'), (4.0, 'parado'), (7.0, 'feixe'), (10.4, 'cruzando'), (13.2, 'partindo')])

    browser.close()

mosaico()
check('no page errors', not erros, erros[:5])
print('FALHAS:', falhas if falhas else 'nenhuma')
sys.exit(1 if falhas else 0)
