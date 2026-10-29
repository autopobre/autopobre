"""The pilots' history in the real game (conta-cloudflare migration 0011): the local preview (servidor.py) with the
accounts server on this machine (conta-cloudflare/teste/local.mjs, its stand-in Google, a database of its own), signed
in with a nickname.
- Modo Corrida: a race of two laps at Curvelo driven to the flag (the player's Opala steered by the game's own
  recognition driver, physics.js recognitionInput, in place of the keys): one ticket saying the race (corrida, the
  level, 15 cars, 2 laps), and at the flag one /resultado answered 200, its place and "finished" in the races' log.
- The recon lap (Volta de reconhecimento) opens no ticket.
- Modo História: no ticket in the paddock; one when the race is on; its flag (the finish taken as verificar_podios
  does, without the laps), the podium and the judge's inspection, which puts the car back by the line with its clock at
  naught, open no other; its result goes once, on that ticket, when the judge is done (refused here, 409: its laps
  were not driven).
Usage: verificar_historico.py [porta] (the preview's; the accounts server takes porta+1000). Needs node
(INTERLAGOS_NODE=node.exe when node is not on the PATH)."""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path
from time import sleep, time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, choose_race

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8872
API = PORT + 1000
ROOT = Path(__file__).resolve().parents[2]
GAME = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/?intro=0&cinema=off'
node = os.environ.get('INTERLAGOS_NODE') or shutil.which('node')
assert node, 'node not found: set INTERLAGOS_NODE'
DB = Path(tempfile.mkdtemp()) / 'historico.sqlite'
SUB = '100000000000000000881'
report = {'errors': [], 'checks': {}}
servers = []
# The player's Opala driven by the game's recognition driver on every physics step (the countdown still holds it; on
# the grid the car waits for the throttle).
DRIVE = """async()=>{const {recognitionInput}=await import('./physics.js');const c=interlagos.car,step=c.step.bind(c);
 c.step=(command,dt)=>{if(command)Object.assign(command,recognitionInput(c,{maxSpeed:30}));return step(command,dt);};return true;}"""
HOOK = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;
 ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();return true;}"""


def check(name, value, detail=None):
    report['checks'][name] = bool(value)
    print(name, bool(value), detail if detail is not None else '', flush=True)
    assert value, (name, detail)


def start(args, ready):
    proc = subprocess.Popen(args, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    servers.append(proc)
    for _ in range(150):
        try:
            with urlopen(ready, timeout=1):
                return proc
        except Exception as error:
            if getattr(error, 'code', None):
                return proc
            sleep(.2)
    raise RuntimeError('did not start: ' + ' '.join(args))


def races():
    with sqlite3.connect(DB) as db:
        db.row_factory = sqlite3.Row
        return [dict(r) for r in db.execute('SELECT id,tipo,nivel,carros,voltas,posicao,terminou,resultado_em,modo,circuito FROM corridas ORDER BY id')]


def wait_until(page, test, seconds=20):
    """Waits on the page's own clock: a plain sleep would hold Playwright's events (the responses seen) back."""
    end = time() + seconds
    while time() < end:
        if test():
            return True
        page.wait_for_timeout(250)
    return test()


try:
    start([node, '--no-warnings', 'conta-cloudflare/teste/local.mjs', '--porta', str(API), '--origem', f'http://127.0.0.1:{PORT}', '--banco', str(DB)], f'http://127.0.0.1:{API}/api/conta/eu')
    start([sys.executable, 'pista_interlagos/scripts/servidor.py', str(PORT), '--no-browser', '--conta-porta', str(API)], f'http://127.0.0.1:{PORT}/pista_interlagos/teste/')
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        # Curvelo's short laps, two of them, the rivals' easiest level.
        context.add_init_script("""(()=>{const k='opala99-preferences-v1';let v={};try{v=JSON.parse(localStorage.getItem(k))||{};}catch{}
         if(!sessionStorage.getItem('historico-prefs')){sessionStorage.setItem('historico-prefs','1');localStorage.setItem(k,JSON.stringify({...v,circuit:'curvelo',laps:2,storyLaps:2,aiLevel:'facil',raceMode:'grid',immersive:false}));}})()""")
        page = context.new_page(); page.set_default_timeout(180000)
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        sent = []
        page.on('response', lambda r: sent.append((r.url.split('/api/')[-1], r.status)) if '/api/recordes/' in r.url and r.request.method == 'POST' else None)
        tickets = lambda: [s for s in sent if s[0] == 'recordes/bilhete']
        results = lambda: [s for s in sent if s[0] == 'recordes/resultado']

        # Signed in through the stand-in Google, with a nickname.
        with urlopen(f'http://127.0.0.1:{API}/falso-google/proxima?sub={SUB}'):
            pass
        page.goto(f'http://127.0.0.1:{PORT}/api/conta/entrar?volta=' + '/pista_interlagos/teste/privacidade.html')
        page.wait_for_url('**/privacidade.html', timeout=60000)
        status = page.evaluate("fetch('/api/conta/apelido',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apelido:'Piloto Historico'})}).then(r=>r.status)")
        check('nickname', status == 200, status)
        page.goto(GAME, wait_until='load')
        wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled&&document.getElementById('pilotAccount')?.hidden===false")

        # Modo Corrida: two laps at Curvelo to the flag.
        choose_race(page)
        wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused')
        check('circuit_curvelo', page.evaluate('interlagos.circuit') == 'curvelo')
        page.evaluate(DRIVE)
        wait_js(page, "!document.querySelector('#raceResults').hidden", timeout=420000)
        check('one_ticket_for_the_race', len(tickets()) == 1, tickets())
        check('result_answered_200', wait_until(page, lambda: results() == [('recordes/resultado', 200)]), results())
        race = races()[-1]
        check('race_logged_with_its_result', race['tipo'] == 'corrida' and race['carros'] == 15 and race['voltas'] == 2 and race['terminou'] == 1 and isinstance(race['posicao'], int) and race['resultado_em'], race)
        report['corrida'] = race
        report['resultado_na_tela'] = page.inner_text('#raceResults tr.results-player')

        # The recon lap: the game drives, nothing goes online.
        before = len(tickets())
        page.evaluate("document.getElementById('tour').click()")
        wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused&&interlagos.car.clock>3', timeout=120000)
        page.wait_for_timeout(3000)
        check('recon_lap_opens_no_ticket', len(tickets()) == before, tickets())

        # Modo História: the paddock, the race, the flag, the podium, the inspection.
        page.evaluate("document.getElementById('leaveRace').click()")
        wait_js(page, "!document.querySelector('#tracks').hidden||!document.querySelector('#cars').hidden||interlagos.state.paused", timeout=60000)
        before, rows = len(tickets()), len(races())
        choose_race(page, story=True)
        wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused')
        page.evaluate('window.interlagosHistoria.skipCards()')
        page.evaluate(HOOK); wait_js(page, "fixtureMode.state.phase==='crowd'")
        page.wait_for_timeout(2000)
        check('paddock_opens_no_ticket', len(tickets()) == before, tickets())
        # The race under way and its flag at once, as verificar_podios takes it (sixth); the finish's fade holds 5 s.
        page.evaluate("()=>{const s=fixtureMode.state;s.scene=null;s.phase='race';fixtureMode.beginFinish(6);}")
        check('the_race_opens_one', wait_until(page, lambda: len(tickets()) == before + 1), tickets())
        wait_js(page, "fixtureMode.state.phase==='podium'", timeout=60000)
        page.evaluate("()=>{fixtureMode.state.leavePodium();fixtureMode.sync?.();}")
        wait_js(page, "fixtureMode.state.phase==='inspection'", timeout=30000)
        page.wait_for_timeout(1500)
        report['relogio_na_vistoria'] = page.evaluate('interlagos.car.clock')
        page.evaluate("()=>fixtureMode.state.requestInspection()")
        wait_js(page, "fixtureMode.state.phase==='complete'", timeout=60000)
        check('story_result_sent_once_on_its_ticket', wait_until(page, lambda: len(results()) == 2), results())
        page.wait_for_timeout(3000)
        check('no_other_ticket_after_the_flag', len(tickets()) == before + 1, tickets())
        story = [r for r in races()[rows:]]
        check('one_story_race_logged', len(story) == 1 and story[0]['tipo'] == 'historia' and story[0]['carros'] == 15 and story[0]['voltas'] == 2, story)
        check('story_result_refused_without_laps', results()[-1][1] == 409 and story[0]['resultado_em'] is None, results())
        report['historia'] = story
        browser.close()
finally:
    for s in servers:
        s.terminate()
check('no_page_errors', not report['errors'], report['errors'])
report['pedidos'] = sent
print(json.dumps(report, ensure_ascii=False, indent=1, default=str))
