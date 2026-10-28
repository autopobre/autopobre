"""O copiloto (corner-callouts.js) no navegador: a volta de reconhecimento num circuito (Interlagos, se não disser
outro), e a voz diz as curvas uma vez cada, na ordem, antes de o carro chegar (ou, as de lugar próprio, logo antes
dele); o volume da voz na aba Áudio (guardado, ▶ Ouvir toca uma); desligado, fica calado; religado, volta.

    python verificar_copiloto.py [porta] [circuito]
"""
import json
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, open_menu

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8859'
CIRCUITO = args[1] if len(args) > 1 else 'interlagos'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/?circuito={CIRCUITO}'
# The portable Node in the apps/ folder above the repository.
NODE = next((sorted(q.glob('apps/node-*/node.exe'))[-1] for q in Path(__file__).resolve().parents if list(q.glob('apps/node-*/node.exe'))), 'node')
# The lap's length as the copilot's tools read the track (curvas_pista.mjs: Curvelo's is built in code).
L = float(subprocess.run([str(NODE), '-e', "import('./curvas_pista.mjs').then(m=>console.log(m.loadLap(process.argv[1]).L))", CIRCUITO],
                         capture_output=True, check=True, cwd=Path(__file__).parent).stdout)
CALLOUTS = json.loads(subprocess.run([str(NODE), str(Path(__file__).with_name('chamadas_curvas.mjs')), CIRCUITO],
                                     capture_output=True, check=True).stdout)
PLACES = {c['key']: c.get('at', c['s']) for c in CALLOUTS}
N = len(CALLOUTS)
# How long to listen, at 10 m/s at least (Pampulha's lap is 20.5 km): for a lap, and for the next callout.
points = sorted(PLACES.values())
LAP_WAIT = max(110, int(L / 10 / 2))
NEXT_WAIT = max(30, int(max((b - a) % L for a, b in zip(points, points[1:] + points[:1])) / 10 / 2))
erros, falhas = [], []


def check(nome, ok, detalhe=''):
    print(('ok  ' if ok else 'FAIL') + ' ' + nome + (f' - {detalhe}' if detalhe != '' else ''), flush=True)
    if not ok:
        falhas.append(nome)


def info(page):
    return page.evaluate('interlagosCopiloto.info()')


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = b.new_page(viewport={'width': 1280, 'height': 800})
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: erros.append(str(e)))
    page.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
    open_menu(page, URL)
    page.evaluate("localStorage.removeItem('opala99-copiloto-v1')")
    if not page.input_value('#pilotName'):
        page.fill('#pilotName', 'Copiloto')
    page.click('#settingsButton')
    page.click('#tab-audio')
    check('a opção está na aba Áudio, ligada', page.is_visible('#cornerCallouts') and page.is_checked('#cornerCallouts'))
    check('o volume da voz também, em 100%', page.is_visible('#calloutsVolume') and page.input_value('#calloutsVolume') == '100'
          and page.inner_text('#calloutsVolumeValue') == '100%')
    page.fill('#calloutsVolume', '150')
    page.dispatch_event('#calloutsVolume', 'change')
    wait_js(page, "interlagosCopiloto.info().playing!==null", timeout=20000)
    v = page.evaluate("JSON.parse(localStorage.getItem('opala99-copiloto-v1'))")
    check('o volume em 150% toca uma prévia e fica guardado', info(page)['volume'] == 1.5 and v.get('volume') == 1.5
          and page.inner_text('#calloutsVolumeValue') == '150%', v)
    page.evaluate('interlagosCopiloto.setVolume(1)')
    page.click('#tab-tour')
    page.click('#tour')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused&&interlagos.state.automatic')
    wait_js(page, 'interlagosCopiloto.info().ready', timeout=30000)
    i = info(page)
    check(f'o copiloto carregou as falas de {CIRCUITO}', i['circuit'] == CIRCUITO and i['callouts'] == N and i['ready'], i)
    # One lap of the recon: every corner named once.
    said = []
    for _ in range(LAP_WAIT):
        page.wait_for_timeout(2000)
        said = info(page)['said']
        if len({x['key'] for x in said}) == N:
            break
    keys = [x['key'] for x in said]
    first = keys[:N]
    check(f'as {N} curvas faladas numa volta', len(set(first)) == N, keys)
    order = [c['key'] for c in CALLOUTS]
    if first:
        start = order.index(first[0])
        check('na ordem da volta', first == (order[start:] + order[:start])[:len(first)], first)
    aheads = {x['key']: ((PLACES[x['key']] - x['s']) % L) for x in said[:N]}
    own = {c['key'] for c in CALLOUTS if 'at' in c}
    check('cada uma antes de chegar à curva (até 200 m antes; as de lugar próprio até 30 m antes dele)',
          all(0 < d <= (30 if k in own else 200) for k, d in aheads.items()), {k: round(v) for k, v in aheads.items()})
    # Switched off: silent; on again: it speaks.
    page.evaluate('interlagosCopiloto.setOn(false)')
    n = len(info(page)['said'])
    page.wait_for_timeout(25000)
    check('desligado, fica calado', len(info(page)['said']) == n and not page.evaluate("document.getElementById('cornerCallouts').checked"))
    page.evaluate('interlagosCopiloto.setOn(true)')
    # A one-lap circuit (Pampulha, the oval) can end its recon lap first (the session over, the copilot told no; or the
    # car rolling below its 8 m/s), 6 s on end: nothing left to say.
    over = "!interlagos.state.automatic||!interlagosCopiloto.info().ok||Math.hypot(interlagos.car.vx,interlagos.car.vy)<8"
    slow = 0
    for _ in range(NEXT_WAIT):
        page.wait_for_timeout(2000)
        slow = slow + 1 if page.evaluate(over) else 0
        if len(info(page)['said']) > n or slow >= 3:
            break
    if len(info(page)['said']) == n and slow >= 3:
        print('ok   religado: a volta de reconhecimento acabou antes da próxima fala (não conferido)', flush=True)
    else:
        check('religado, volta a falar', len(info(page)['said']) > n)
    b.close()
check('sem erros na página', not erros, erros[:3])
print('FALHAS: ' + ', '.join(falhas) if falhas else 'copiloto: ok')
sys.exit(1 if falhas else 0)
