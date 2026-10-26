"""A língua da história de Interlagos: português por padrão, mesmo num navegador em inglês (a voz gravada é em
português); um inglês salvo sem ter sido escolhido (o padrão antigo seguia o navegador) volta para português; EN
escolhido de propósito nos botões PT/EN continua depois de recarregar.

    python verificar_lingua_historia.py [porta]
"""
import sys

from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8858'

URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/?circuito=interlagos'
falhas = []


def check(nome, ok, detalhe=''):
    print(('ok  ' if ok else 'FAIL') + ' ' + nome + (f' - {detalhe}' if detalhe != '' else ''), flush=True)
    if not ok:
        falhas.append(nome)


def open_story(page):
    page.goto(URL, wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#tracks').classList.contains('hidden')")
    page.click('#historyStart')
    wait_js(page, 'window.interlagosAutodromo?.info().active', timeout=300000)
    wait_js(page, 'interlagosAutodromo.info().playing', timeout=20000)
    return page.evaluate('interlagosAutodromo.info()')


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args() + ['--lang=en-US'])
    for name, saved in (('navegador em inglês, nada salvo', None),
                        ('inglês salvo sem ter sido escolhido', {'lang': 'en', 'voice': True}),
                        ('inglês escolhido de propósito', {'lang': 'en', 'langChosen': True, 'voice': True})):
        ctx = b.new_context(locale='en-US', viewport={'width': 1280, 'height': 720})
        page = ctx.new_page()
        page.goto(URL, wait_until='domcontentloaded')
        page.evaluate("s=>{localStorage.clear();if(s)localStorage.setItem('autopobre-historia-v1',JSON.stringify(s));}", saved)
        i = open_story(page)
        nav = page.evaluate('navigator.language')
        want = 'en' if saved and saved.get('langChosen') else 'pt'
        check(f'{name} (navegador {nav}): história em {want}', i['lang'] == want and (want == 'en' or i['voice'] == 'gravada:voz_interlagos_pt_bob'),
              (i['lang'], i['voice']))
        ctx.close()
    # Choosing EN in the player sticks after a reload.
    ctx = b.new_context(locale='en-US', viewport={'width': 1280, 'height': 720})
    page = ctx.new_page()
    page.goto(URL, wait_until='domcontentloaded')
    page.evaluate('localStorage.clear()')
    open_story(page)
    page.mouse.move(640, 360)
    page.click('#historyPlayer .hp-gear')
    page.click('.hp-settings [data-lang="en"]')
    page.wait_for_timeout(500)
    i = open_story(page)
    check('EN escolhido no player continua depois de recarregar', i['lang'] == 'en', i['lang'])
    ctx.close()
    b.close()
print('FALHAS: ' + ', '.join(falhas) if falhas else 'língua padrão: ok')
sys.exit(1 if falhas else 0)
