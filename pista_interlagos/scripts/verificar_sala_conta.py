"""The multiplayer room with accounts, passwords, invitations and the chat, in the browser, as on
dev.autopobre.com.br: the local preview (servidor.py) passes /api/ on to the accounts server on this machine
(conta-cloudflare/teste/local.mjs, its stand-in Google), and the room server runs in wrangler dev
(sala-cloudflare) with this check's own passwords and the accounts' pass secret. One browser per pilot:
- Caio, not signed in, opens a room's link: the card says only signed-in pilots get in, with Entrar com Google
  (and no card ever shows the room's name);
- Ana signs in with no nickname yet: the card asks for one (Escolher apelido opens Sua conta); saved, the room
  is tried again by itself and asks for the password; the host's opens it: she hosts;
- Dora, with the pilots' password, opens another room nobody opened: she waits at its door;
- Bia signs in (nickname Bia) and stays on the opening, no room: her page is online for invitations;
- Ana's card: Convidar pilotos online lists Bia (with her record on the track, or none; the list tells the host the
  invited come in without a password); she invites Dora by mistake and cancels before Dora takes it: Dora's notice
  says it was cancelled and goes; then Convidar for Bia;
- Bia's page shows the invitation (from Ana; neither the room's name nor any word on passwords); Entrar na sala opens it and she is in at
  once: no password typed, no door;
- the chat: T, a line, Enter both ways, under the accounts' names; a link stays in the box, nothing sent;
  Shift+T hides and shows the chat window.
Usage: verificar_sala_conta.py [porta] (8861 by default: an origin the local room server allows; the accounts
server takes porta+1000). Needs node (INTERLAGOS_NODE=node.exe when node is not on the PATH). Screens in the
shots folder (INTERLAGOS_SHOTS, else the temp folder)."""
import atexit
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8861
API = PORT + 1000
ROOT = Path(__file__).resolve().parents[2]
BASE = f'http://127.0.0.1:{PORT}'
GAME = '/pista_interlagos/teste/?intro=0&cinema=off'
# The room server's secrets for this check; the pass secret is the local accounts server's own (local.mjs).
PASS_SECRET, HOST_KEY, PILOTS_KEY = 'passe-das-salas-de-teste-local', 'anfitriao-da-verificacao', 'pilotos-da-verificacao'
ROOM = f'contas{int(time.time()) % 100000}'
SHOTS = Path(os.environ.get('INTERLAGOS_SHOTS') or tempfile.gettempdir()) / 'verificar_sala_conta'
SHOTS.mkdir(parents=True, exist_ok=True)
node = os.environ.get('INTERLAGOS_NODE') or shutil.which('node')
assert node, 'node not found: set INTERLAGOS_NODE'
servers, errors, report = [], [], {}
CARD = "()=>({status:document.querySelector('#mpRoom .mp-status')?.textContent??'',action:document.querySelector('#mpRoom .mp-account')?.hidden===false?document.querySelector('#mpRoom .mp-account').textContent:null,key:document.querySelector('#mpRoom .mp-key')?.hidden===false,role:window.interlagosSala?.info().role??null,pending:window.interlagosSala?.info().pending??null,problem:window.interlagosSala?.info().problem??null})"


def start(args, ready, cwd=ROOT, log_name=None):
    log = open(SHOTS / (log_name or 'servidor.log'), 'w', encoding='utf-8')
    proc = subprocess.Popen(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace', env={**os.environ, 'WRANGLER_SEND_METRICS': 'false'})
    servers.append(proc)
    threading.Thread(target=lambda: [log.write(line) or log.flush() for line in proc.stdout], daemon=True).start()
    for _ in range(450):
        try:
            with urlopen(ready, timeout=1):
                return proc
        except Exception as error:
            if getattr(error, 'code', None):
                return proc
            time.sleep(.2)
    raise RuntimeError('did not start: ' + ' '.join(map(str, args)))


def stop_all():
    for proc in servers:
        if proc.poll() is None:
            subprocess.run(['taskkill', '/pid', str(proc.pid), '/T', '/F'], capture_output=True) if os.name == 'nt' else proc.kill()


atexit.register(stop_all)


def card(page):
    return page.evaluate(CARD)


def watch(page, name):
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))


def sign_in(page, sub, back, nickname=None):
    """The whole round (the game's link, the stand-in Google, back to `back`), and the nickname saved, if given."""
    with urlopen(f'http://127.0.0.1:{API}/falso-google/proxima?sub={sub}'):
        pass
    page.goto(f'{BASE}/api/conta/entrar?volta=' + quote(back, safe=''), wait_until='load')
    if nickname:
        status = page.evaluate("n=>fetch('/api/conta/apelido',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apelido:n})}).then(r=>r.status)", nickname)
        assert status == 200, status
        # (the page asked who it is before the nickname existed: it reads the account again)
        page.reload(wait_until='load')


start([node, '--no-warnings', 'conta-cloudflare/teste/local.mjs', '--porta', str(API), '--origem', BASE], f'http://127.0.0.1:{API}/api/conta/eu', log_name='contas.log')
start([sys.executable, 'pista_interlagos/scripts/servidor.py', str(PORT), '--no-browser', '--conta-porta', str(API)], f'{BASE}/pista_interlagos/teste/', log_name='jogo.log')
start([node, str(ROOT / 'sala-cloudflare/node_modules/wrangler/bin/wrangler.js'), 'dev', '--ip', '127.0.0.1', '--port', '8787', '--show-interactive-dev-session=false',
       '--var', f'SALA_PASSE:{PASS_SECRET}', '--var', f'SENHA_ANFITRIAO:{HOST_KEY}', '--var', f'SENHA_PILOTOS:{PILOTS_KEY}', '--var', f'ORIGENS:{BASE}'],
      'http://127.0.0.1:8787/', cwd=ROOT / 'sala-cloudflare', log_name='wrangler.log')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    def pilot(name):
        context = browser.new_context(viewport={'width': 1100, 'height': 640})
        context.add_init_script("try{localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,laps:1,camera:'chase'}));}catch{}")
        page = context.new_page()
        watch(page, name)
        return page
    room_link = f'{GAME}#desafio={ROOM}&servidor=local'

    # Caio, not signed in: the card says so, with the way in.
    caio = pilot('caio')
    caio.goto(BASE + room_link, wait_until='load')
    wait_js(caio, "window.interlagosSala?.info().problem==='conta'", timeout=90000)
    c = card(caio)
    assert 'conta do Google' in c['status'] and c['action'] == 'Entrar com Google' and not c['key'], c
    assert ROOM not in caio.inner_text('#mpRoom').lower(), 'the room\'s name is not on screen'
    caio.screenshot(path=str(SHOTS / '1_caio_sem_conta.png'))
    report['sem_conta'] = c['status']

    # Ana, signed in without a nickname: asked for one; saved, the room asks for the password; the host's opens it.
    ana = pilot('ana')
    sign_in(ana, '100000000000000000101', room_link)
    wait_js(ana, "window.interlagosSala?.info().problem==='apelido'", timeout=90000)
    assert card(ana)['action'] == 'Escolher apelido', card(ana)
    ana.screenshot(path=str(SHOTS / '2_ana_sem_apelido.png'))
    ana.click('#mpRoom .mp-account')
    wait_js(ana, "document.getElementById('contaDialog').open")
    ana.fill('#contaApelido', 'Ana')
    ana.click('#contaSalvar')
    wait_js(ana, "window.interlagosSala.info().problem==='chave'", timeout=30000)
    ana.click('#contaFechar')
    assert card(ana)['key'], card(ana)
    ana.fill('#mpKey', HOST_KEY)
    ana.press('#mpKey', 'Enter')
    wait_js(ana, "window.interlagosSala.info().role==='host'", timeout=30000)
    assert ana.evaluate("interlagosSala.info().name") == 'Ana'
    ana.screenshot(path=str(SHOTS / '3_ana_anfitria.png'))

    # Dora, with the pilots' password, at the door of a room nobody opened.
    dora = pilot('dora')
    sign_in(dora, '100000000000000000104', f'{GAME}#desafio={ROOM}x&servidor=local', 'Dora')
    wait_js(dora, "window.interlagosSala?.info().problem==='chave'", timeout=90000)
    dora.fill('#mpKey', PILOTS_KEY)
    dora.press('#mpKey', 'Enter')
    wait_js(dora, "window.interlagosSala.info().pending&&window.interlagosSala.info().role==='guest'", timeout=30000)
    c = card(dora)
    assert 'ainda não foi aberta' in c['status'], c
    dora.screenshot(path=str(SHOTS / '4_dora_sala_fechada.png'))
    report['senha_pilotos'] = c['status']

    # Bia, signed in with a nickname, on the opening: online for invitations.
    bia = pilot('bia')
    sign_in(bia, '100000000000000000102', GAME + '&servidor=local', 'Bia')
    wait_js(bia, "window.interlagosSaguao?.info().online===true", timeout=90000)

    # Ana invites her from the list of who is online.
    ana.click('#mpRoom .mp-invite')
    row = ana.locator('#mpOnline li', has_text='Bia')
    row.wait_for(state='visible', timeout=30000)
    listed = ana.evaluate("[...document.querySelectorAll('#mpOnline li')].map(li=>li.innerText.replace(/\\s+/g,' '))")
    assert not any('Ana' in r for r in listed), listed
    ana.screenshot(path=str(SHOTS / '5_ana_pilotos_online.png'))
    assert 'sem senha' in ana.inner_text('#mpOnline'), 'the host is told the invited need no password'
    # Dora invited by mistake: cancelled before she takes it, her notice says so and goes.
    wrong = ana.locator('#mpOnline li', has_text='Dora')
    wrong.get_by_role('button', name='Convidar').click()
    wait_js(dora, "document.getElementById('conviteSala')?.hidden===false&&!!window.interlagosSaguao?.info().offer", timeout=15000)
    wrong.get_by_role('button', name='Cancelar').click()
    wait_js(dora, "window.interlagosSaguao.info().cancelled", timeout=15000)
    dora.screenshot(path=str(SHOTS / '5_dora_convite_cancelado.png'))
    assert 'cancelou' in dora.inner_text('#conviteSala'), dora.inner_text('#conviteSala')
    wait_js(dora, "document.getElementById('conviteSala').hidden", timeout=10000)
    report['cancelado'] = 'ok'
    row.get_by_role('button', name='Convidar').click()
    wait_js(ana, "[...document.querySelectorAll('#mpOnline li')].some(li=>li.innerText.includes('Bia')&&li.innerText.includes('Convite enviado ✓')&&li.querySelector('button.mp-cancel'))", timeout=15000)
    report['online'] = listed

    # Bia's page shows it; taken, she is in the room at once: no password, no door.
    wait_js(bia, "document.getElementById('conviteSala')?.hidden===false", timeout=15000)
    invite = bia.inner_text('#conviteSala')
    assert 'Ana' in invite and ROOM not in invite and 'senha' not in invite.lower(), invite
    bia.screenshot(path=str(SHOTS / '6_bia_convite.png'))
    bia.click('#conviteSala .convite-sim')
    wait_js(bia, "window.interlagosSala?.info().role==='guest'&&interlagosSala.info().pending===false&&interlagosSala.info().members.some(m=>m.name==='Ana')", timeout=90000)
    assert bia.evaluate("localStorage.getItem('autopobre-senha-sala')") is None, 'no password typed'
    wait_js(ana, "interlagosSala.info().members.some(m=>m.name==='Bia')", timeout=30000)
    assert not ana.evaluate("interlagosSala.info().knocks.length"), 'invited: never at the door'
    report['convite'] = invite

    # The chat, both ways, under the accounts' names; a link stays in the box.
    bia.keyboard.press('t')
    try:
        wait_js(bia, "document.activeElement?.id==='mpChatText'", timeout=5000)
    except Exception:
        print(bia.evaluate("({active:document.activeElement?.outerHTML.slice(0,160),dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),sala:{role:interlagosSala.info().role,pending:interlagosSala.info().pending},chat:document.getElementById('mpChat')?.className})"))
        bia.screenshot(path=str(SHOTS / 'falha_bia_t.png'))
        raise
    bia.keyboard.type('valeu pelo convite!')
    bia.keyboard.press('Enter')
    wait_js(ana, "interlagosSala.info().chat.lines.some(l=>l.name==='Bia'&&l.text==='valeu pelo convite!')", timeout=10000)
    ana.wait_for_timeout(2100)
    ana.keyboard.press('t')
    wait_js(ana, "document.activeElement?.id==='mpChatText'", timeout=5000)
    ana.keyboard.type('bora pra pista')
    ana.keyboard.press('Enter')
    wait_js(bia, "interlagosSala.info().chat.lines.some(l=>l.name==='Ana'&&l.text==='bora pra pista')", timeout=10000)
    bia.wait_for_timeout(2100)
    bia.keyboard.press('t')
    bia.keyboard.type('entra em www.exemplo.com')
    bia.keyboard.press('Enter')
    wait_js(bia, "document.querySelector('#mpChat').dataset.note.includes('Links')", timeout=5000)
    bia.screenshot(path=str(SHOTS / '7_bia_link_recusado.png'))
    bia.keyboard.press('Escape')
    ana.screenshot(path=str(SHOTS / '7_ana_chat.png'))
    ana.wait_for_timeout(1500)
    assert not ana.evaluate("interlagosSala.info().chat.lines.some(l=>l.text.includes('exemplo'))"), 'a link never goes'
    # Shift+T: the window hides and shows again (this browser keeps the choice).
    ana.keyboard.press('Shift+KeyT')
    wait_js(ana, "document.getElementById('mpChat').classList.contains('mp-chat-closed')", timeout=5000)
    ana.keyboard.press('Shift+KeyT')
    wait_js(ana, "!document.getElementById('mpChat').classList.contains('mp-chat-closed')", timeout=5000)
    report['chat'] = ana.evaluate("interlagosSala.info().chat.lines")
    browser.close()

stop_all()
assert not errors, errors
report['shots'] = str(SHOTS)
print(json.dumps(report, indent=1, ensure_ascii=False))
print('verificar_sala_conta: ok')
