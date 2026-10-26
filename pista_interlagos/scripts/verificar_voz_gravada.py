"""A voz gravada da história (gerar_narracao.py + track-history.js) no navegador: a história de Interlagos abre já com
a voz gravada padrão (a primeira de assets/historia/vozes_interlagos.json) e cronometrada por ela; cada fala toca o
seu trecho do MP3 e para no fim dele; a câmera anda junto com a voz; em 1,5x a voz acelera junto; a lista de vozes traz
as gravadas primeiro, na ordem do índice, e a segunda escolhida no ⚙ cronometra a história de novo.

    python verificar_voz_gravada.py [porta]
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8857'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/?circuito=interlagos'
erros, falhas = [], []
VOZES = json.loads((Path(__file__).resolve().parents[1] / 'teste/assets/historia/vozes_interlagos.json').read_text(encoding='utf-8'))
NOMES = ['gravada:' + v['src'].split('/')[-1] for v in VOZES]
ROTULOS = [v['label'] + ' · gravada · Brasil' for v in VOZES]


def check(nome, ok, detalhe=''):
    print(('ok  ' if ok else 'FAIL') + ' ' + nome + (' - ' + str(detalhe) if detalhe != '' else ''), flush=True)
    if not ok:
        falhas.append(nome)


def info(page):
    return page.evaluate('window.interlagosAutodromo.info()')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text), print('console', m.type, m.text[:300], flush=True)) if m.type == 'error' else None)
    page.goto(URL, wait_until='domcontentloaded')
    page.evaluate("localStorage.removeItem('autopobre-historia-v1')")
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#tracks').classList.contains('hidden')")
    page.click('#historyStart')
    wait_js(page, 'window.interlagosAutodromo?.info().active', timeout=300000)
    wait_js(page, 'interlagosAutodromo.info().playing', timeout=20000)
    page.wait_for_timeout(2500)
    i = info(page)
    check(f'a voz gravada padrão ({VOZES[0]["label"]}) é a escolhida', i['recorded'] and i['voice'] == NOMES[0], i['voice'])
    check('a linha do tempo segue a voz gravada', i['timedBy'] == i['voice'] and i['follow'] == 1, (i['timedBy'], i['follow']))
    check('a primeira fala toca o seu trecho', i['audioAt'] is not None and i['clip'] and i['clip'][0] < i['audioAt'] < i['clip'][1],
          (i['audioAt'], i['clip']))
    check('o apresentador fala e a música abaixa', i['talking'] and page.evaluate('interlagosAutodromo.audio().ducked') > 0)
    # As long as the recording and a breath after each line, a little more where a ride runs on after the voice.
    fala = page.evaluate("src=>(async()=>{const m=await (await fetch(`./${src}.json`)).json();return m.speech+m.lines.length*.5})()", VOZES[0]['src'])
    check('a história dura o tempo da voz', fala - 1 < i['duration'] < fala * 1.15, (round(i['duration'] / 60, 2), round(fala / 60, 2)))

    # Uma fala no meio (a primeira do capítulo 4): toca do começo do trecho e para no fim dele, antes da próxima.
    page.evaluate('interlagosAutodromo.play(false)')
    page.evaluate('t=>{interlagosAutodromo.seek(t);true}', i['chapters'][3]['start'])
    page.evaluate('interlagosAutodromo.play(true)')
    page.wait_for_timeout(1200)
    a = info(page)
    check('depois de pular, a fala toca do começo do trecho', a['clip'] and a['clip'][0] <= a['audioAt'] < a['clip'][0] + 1.6, (a['audioAt'], a['clip']))
    t0, v0 = a['time'], a['audioAt']
    page.wait_for_timeout(2000)
    b = info(page)
    check('a câmera anda junto com a voz', abs((b['time'] - t0) - (b['audioAt'] - v0)) < .25, (round(b['time'] - t0, 2), round(b['audioAt'] - v0, 2)))
    fim = a['clip'][1]
    wait_js(page, f'interlagosAutodromo.info().audioAt>={fim - .3}', timeout=30000)
    # Every 50 ms until the next line: on this line the audio never passes the clip's end, and it goes quiet before.
    amostras = page.evaluate(f"""(async()=>{{const out=[];for(let k=0;k<40;k++){{const i=interlagosAutodromo.info();out.push([i.line,i.audioAt,i.talking]);
      if(i.line!=={a['line']})break;await new Promise(r=>setTimeout(r,50));}}return out;}})()""")
    nesta = [s for s in amostras if s[0] == a['line']]
    passou = max(s[1] for s in nesta)
    calou = any(not s[2] for s in nesta)
    check('a fala para no fim do seu trecho', passou <= fim + .08 and calou and amostras[-1][0] == a['line'] + 1,
          {'fim': fim, 'audio no máximo': round(passou, 3), 'calou antes da próxima': calou, 'amostras': len(amostras)})

    # 1,5x: a voz e a história aceleram juntas.
    page.mouse.move(640, 360)
    page.click('#historyPlayer .hp-gear')
    vozes = page.evaluate("[...document.querySelectorAll('.hp-voices option')].map(o=>o.textContent)")
    check('só as vozes gravadas, na ordem do índice', vozes == ROTULOS, vozes)
    page.click('.hp-settings [data-speed="1.5"]')
    page.keyboard.press('Escape')
    page.wait_for_timeout(1500)
    d = info(page)
    page.wait_for_timeout(2000)
    e = info(page)
    falou = e['audioAt'] - d['audioAt']
    check('em 1,5x a voz acelera', d['speed'] == 1.5 and 2.6 < falou < 3.4 or e['line'] != d['line'], round(falou, 2))
    # A outra voz gravada, escolhida no ⚙ (quando há mais de uma): a história se cronometra por ela e ela toca as suas falas.
    if len(VOZES) < 2:
        page.evaluate('interlagosAutodromo.stop()')
        page.wait_for_timeout(600)
        check('ao sair, a voz cala', not page.evaluate('interlagosAutodromo.info().talking'))
        browser.close()
        check('sem erros na página', not erros, erros[:3])
        print('FALHAS: ' + ', '.join(falhas) if falhas else 'voz gravada: ok', flush=True)
        sys.exit(1 if falhas else 0)
    page.mouse.move(600, 400)  # the controls hide themselves after a while
    page.click('#historyPlayer .hp-gear')
    page.select_option('.hp-voices', NOMES[1])
    page.wait_for_timeout(600)
    page.keyboard.press('Escape')
    page.evaluate('interlagosAutodromo.play(true)')
    wait_js(page, 'interlagosAutodromo.info().talking', timeout=10000)
    page.wait_for_timeout(300)
    r = info(page)
    check(f'{VOZES[1]["label"]} cronometra a história', r['voice'] == r['timedBy'] == NOMES[1]
          and abs(r['duration'] - i['duration']) > 10, (r['timedBy'], round(r['duration'] / 60, 2), round(i['duration'] / 60, 2)))
    check('e toca a sua fala', r['clip'] and r['clip'][0] <= r['audioAt'] <= r['clip'][1] and r['talking'], (r['audioAt'], r['clip']))
    page.evaluate('interlagosAutodromo.stop()')
    page.wait_for_timeout(600)
    check('ao sair, a voz cala', not page.evaluate('interlagosAutodromo.info().talking'))
    browser.close()

check('sem erros na página', not erros, erros[:3])
print('FALHAS: ' + ', '.join(falhas) if falhas else 'voz gravada: ok', flush=True)
sys.exit(1 if falhas else 0)
