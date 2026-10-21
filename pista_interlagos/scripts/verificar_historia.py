"""A história do autódromo (track-history.js) no navegador: o botão da tela de pistas abre Interlagos e a história
toca; a barra tem um trecho por capítulo; pula para cada capítulo e fotografa; legenda, imagem e apresentador
aparecem quando o roteiro pede; espaço pausa e continua; Esc volta para a tela de pistas com o carro de volta.

    python verificar_historia.py [porta] [pasta das fotos]

Fotos JPG (uma por capítulo e as das falas com imagem) e um mosaico historia_mosaico.jpg em
pista_interlagos/renders/historia/rodada_01 (ou na pasta dada).
"""
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8851'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/?circuito=interlagos'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'historia' / 'rodada_01'
FOTOS.mkdir(parents=True, exist_ok=True)
erros, falhas, tiradas = [], [], []


def check(nome, ok, detalhe=''):
    print(('ok  ' if ok else 'FAIL') + ' ' + nome + (' - ' + str(detalhe) if detalhe != '' else ''), flush=True)
    if not ok:
        falhas.append(nome)


def foto(page, nome):
    caminho = FOTOS / f'historia_{nome}.jpg'
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
        desenho.text((x + 6, y + 5), caminho.stem.replace('historia_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'historia_mosaico.jpg'
    tela.save(destino, quality=86)
    print('mosaico', destino, flush=True)


def info(page):
    return page.evaluate('window.interlagosAutodromo.info()')


def em(page, t, espera=1800):
    """Pula para t segundos e deixa a câmera e as camadas chegarem lá."""
    page.evaluate('t=>{interlagosAutodromo.seek(t);true}', t)
    page.wait_for_timeout(espera)
    return info(page)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1600, 'height': 900})
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text), print('console', m.type, m.text[:300], flush=True)) if m.type == 'error' else None)
    page.goto(URL, wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#tracks').classList.contains('hidden')")
    check('track screen: the story button shows for Interlagos', page.is_visible('#historyStart'))
    page.click('#historyStart')
    wait_js(page, 'window.interlagosAutodromo?.info().active', timeout=300000)
    page.wait_for_timeout(2500)
    i = info(page)
    check('the story plays from the start', i['playing'] and i['time'] > .5, {'time': i['time']})
    check('no 3-2-1 and no race HUD', not page.is_visible('#raceCountdown') and not page.is_visible('#timing'))
    check('the player car is out of sight', not page.evaluate('interlagosAutodromo.shown().car'))
    segs = page.evaluate("document.querySelectorAll('#historyPlayer .hp-seg').length")
    check('the bar has one stretch per chapter', segs == len(i['chapters']), {'segs': segs, 'chapters': len(i['chapters'])})
    check('a caption is on screen', page.evaluate("document.querySelector('.hp-caption span').textContent.length>10"))
    foto(page, '00_abertura')
    for k, c in enumerate(i['chapters']):
        lido = em(page, c['start'] + 3.5)
        check(f"chapter {k + 1} '{c['title']}' reached", lido['chapter'] == c['title'], lido['chapter'])
        foto(page, f"{k + 1:02d}_{c['title'][:24].replace(' ', '_')}")
        # And once more further in (the rides on the old layout, the S, the corners' tour).
        em(page, min(c['start'] + 20, c['end'] - 1.5), 2200)
        foto(page, f"{k + 1:02d}b")
    # Every line with a picture or the presenter: both on screen.
    linhas = page.evaluate("""(async()=>{const m=await import('./historia-interlagos.js'),t=(await import('./track-history.js')).buildTimeline(m.HISTORY);
      return t.lines.filter(l=>l.image||l.presenter).map(l=>({start:l.start,dur:l.dur,image:l.image||null,index:l.index}));})()""")
    for linha in linhas[:8]:
        lido = em(page, linha['start'] + min(3, linha['dur'] / 2), 2000)
        if linha['image']:
            check(f"line {linha['index']}: picture shown", page.is_visible('.hp-image'), linha['image'])
        check(f"line {linha['index']}: presenter in view", lido['presenter'])
        foto(page, f"fala_{linha['index']:02d}")
    # ⚙: speed, voice, music and the duck under the voice.
    page.mouse.move(800, 450)
    page.click('#historyPlayer .hp-gear')
    check('the settings panel opens', page.is_visible('.hp-settings'))
    check('six speeds offered', page.evaluate("document.querySelectorAll('.hp-settings [data-speed]').length") == 6)
    vozes = page.evaluate("[...document.querySelectorAll('.hp-voices option')].map(o=>o.textContent)")
    print('vozes:', vozes, flush=True)
    check('the voice list shows the Portuguese voices (or says there is none)', len(vozes) >= 1)
    page.select_option('.hp-musics', 'sponsor')
    page.wait_for_timeout(300)
    check('the music chosen reaches the game audio', page.evaluate('interlagosAutodromo.audio().theme') == 'sponsor', page.evaluate('interlagosAutodromo.audio()'))
    page.click('.hp-settings [data-speed="1.5"]')
    page.wait_for_timeout(300)
    antes = info(page)['time']
    page.wait_for_timeout(2000)
    depois = info(page)
    check('1,5x: the story runs faster', depois['speed'] == 1.5 and depois['time'] - antes > 2.3, round(depois['time'] - antes, 2))
    amostras = [page.evaluate('({i:interlagosAutodromo.info().talking,a:interlagosAutodromo.audio().ducked})') for _ in range(6)]
    # (Read in two calls: a frame may pass between them at a sentence's edge.)
    check('the music ducks while the narrator speaks, not otherwise', sum((s['a'] >= .99) != bool(s['i']) for s in amostras) <= 1, amostras)
    page.click('.hp-settings [data-speed="1"]')
    # English: the same line, in English words and an English voice; then back to Portuguese.
    antes = info(page)
    page.click('.hp-settings [data-lang="en"]')
    page.wait_for_timeout(1200)
    ingles = info(page)
    vozes_en = page.evaluate("[...document.querySelectorAll('.hp-voices option')].map(o=>o.textContent)")
    print('vozes en:', vozes_en, flush=True)
    check('English: same line, English caption and player', ingles['lang'] == 'en' and ingles['line'] == antes['line'] and ingles['caption'] != antes['caption']
          and page.evaluate("document.querySelector('.hp-exit span').textContent") == 'Back', (antes['caption'][:50], ingles['caption'][:50]))
    check('English: English voices only', not any('Brasil' in v or 'Brazil' in v or 'Portugal' in v for v in vozes_en), vozes_en)
    foto(page, 'ingles')
    page.click('.hp-settings [data-lang="pt"]')
    page.wait_for_timeout(800)
    check('back to Portuguese', info(page)['lang'] == 'pt')
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)
    check('Escape closes the settings first', not page.is_visible('.hp-settings') and info(page)['active'])
    # Pause and play, as a video.
    page.keyboard.press('Space')
    page.wait_for_timeout(400)
    parado = info(page)
    page.wait_for_timeout(1200)
    check('space pauses (time stands still)', not parado['playing'] and abs(info(page)['time'] - parado['time']) < .05)
    page.keyboard.press('Space')
    page.wait_for_timeout(1500)
    check('space plays again', info(page)['playing'])
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(300)
    page.keyboard.press('Escape')
    wait_js(page, "!window.interlagosAutodromo.info().active&&!document.querySelector('#tracks').classList.contains('hidden')", timeout=30000)
    check('Escape leaves to the track screen', page.is_visible('#tracks'))
    check('the player is gone', page.evaluate("!document.getElementById('historyPlayer')"))
    check('the car is back', page.evaluate('interlagosAutodromo.shown().car'))
    # From the opening: História das Corridas, its screen, a story, and back to that screen with the circuit chosen before.
    page.goto(URL.replace('circuito=interlagos', 'circuito=cascavel'), wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Piloto teste')
    check('opening: História das Corridas offered', page.is_visible('#historiasStart'))
    page.click('#historiasStart')
    wait_js(page, "!document.querySelector('#historias').classList.contains('hidden')")
    check('its screen lists the Interlagos story', page.is_visible('[data-historia="interlagos"]'))
    foto(page, 'tela_historias')
    page.click('[data-historia="interlagos"]')
    wait_js(page, 'window.interlagosAutodromo?.info().active', timeout=300000)
    check('the story plays from that screen', info(page)['playing'])
    page.wait_for_timeout(1500)
    page.keyboard.press('Escape')
    wait_js(page, "!window.interlagosAutodromo.info().active&&!document.querySelector('#historias').classList.contains('hidden')", timeout=30000)
    check('leaving comes back to História das Corridas', page.evaluate('interlagosAutodromo.screen()') == 'historias')
    check('the circuit chosen before is back', page.evaluate('document.title').startswith('Cascavel'), page.evaluate('document.title'))
    browser.close()

mosaico()
reais = [e for e in erros if 'tracks.json' not in e and 'favicon' not in e]
check('no page errors', not reais, reais[:5])
print('FALHAS:', falhas if falhas else 'nenhuma')
sys.exit(1 if falhas else 0)
