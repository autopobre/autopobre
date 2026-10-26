"""The room's race ends for everyone at once (the team's report, 10-26: one window showed its result while another still
raced, and the host did not know). Two windows of one browser (&local=1), one lap of Interlagos: the host races it on the
automatic pilot, the guest stays on the grid. Past the flag the host's result waits: its room line says who still races
and when the race ends for everyone, the guest's says the host is in and the same countdown, and the host has Encerrar
corrida; the end coming, both say so at one minute and at thirty seconds and count the last ten down; the time up,
both windows show the result at once, the guest's own time estimated ("corrida encerrada", ≈). Usage: verificar_sala_fim.py [porta] (a game server there, servidor.py). Screens in the shots folder
(INTERLAGOS_SHOTS, else the temp folder)."""
import json
import os
import random
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, start_race

PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/?intro=0&cinema=off'
ROOM = f'fim{random.randrange(10**6)}'
SHOTS = Path(os.environ.get('INTERLAGOS_SHOTS') or tempfile.gettempdir()) / 'verificar_sala_fim'
SHOTS.mkdir(parents=True, exist_ok=True)
STATUS = "document.querySelector('#mpRoom .mp-status').textContent"
RESULTS = "!document.querySelector('#raceResults').hidden"
errors, report = [], {}
sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # (the report carries ≈)


def watch(page, name):
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1000, 'height': 620})
    context.add_init_script("try{localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,laps:1,camera:'chase'}));}catch{}")
    host = context.new_page()
    watch(host, 'host')
    host.goto(f'{URL}#desafio={ROOM}&local=1&auto=1', wait_until='load')
    wait_js(host, "window.interlagosSala?.info().role==='host'&&window.interlagos&&!document.querySelector('#start').disabled", timeout=60000)
    host.fill('#pilotName', 'Ana')
    host.evaluate("()=>localStorage.setItem('autopobre-pilots-v1',JSON.stringify({selected:'Bia',names:['Bia']}))")
    with context.expect_page() as popup:
        host.evaluate("url=>{window.open(url,'_blank','popup,noopener,width=1000,height=620');}", f'{URL}#desafio={ROOM}&local=1&carro=64')
    guest = popup.value
    watch(guest, 'guest')
    guest.wait_for_load_state('load')
    wait_js(guest, "window.interlagosSala?.info().number==='64'&&!document.querySelector('#cars').classList.contains('hidden')", timeout=90000)
    guest.click('#carsNext')
    wait_js(host, "interlagosSala.info().members.some(m=>m.name==='Bia'&&m.wait)", timeout=20000)
    host.click('#start')
    wait_js(host, "!document.querySelector('#cars').classList.contains('hidden')", timeout=20000)
    host.click('#carsNext')
    start_race(host, '#singleRace')
    wait_js(host, "interlagosSala.info().phase==='waiting'&&!document.querySelector('#mpStart').hidden", timeout=240000)
    gid = guest.evaluate('interlagosSala.info().id')
    wait_js(host, f"interlagosSala.info().ready.includes({gid!r})", timeout=240000)
    host.click('#mpStart')
    for page in (host, guest):
        wait_js(page, "interlagosSala.info().phase==='racing'&&window.interlagos?.ready&&document.querySelector('#raceCountdown').hidden", timeout=90000)

    # The host in: no result yet; both lines say who still races and when it ends for everyone.
    wait_js(host, "interlagos.immersiveInfo?.().freeFinished===true", timeout=400000)
    wait_js(host, f"{STATUS}.includes('Esperando Bia')&&{STATUS}.includes('fim em')&&!document.getElementById('mpEnd').hidden", timeout=20000)
    wait_js(guest, f"{STATUS}.includes('Ana terminou')&&{STATUS}.includes('a corrida acaba para todos em')", timeout=20000)
    host.wait_for_timeout(8000)
    assert not host.evaluate(RESULTS), 'the host\'s result waits for the room\'s end'
    assert not guest.evaluate(RESULTS) and guest.evaluate("interlagosSala.info().phase") == 'racing', 'the guest races on'
    report['espera'] = {'anfitriao': host.evaluate(STATUS), 'convidada': guest.evaluate(STATUS)}
    host.screenshot(path=str(SHOTS / '1_anfitriao_esperando.png'))
    guest.screenshot(path=str(SHOTS / '1_convidada_ainda_correndo.png'))

    # The end coming, on both screens: a word at one minute and at thirty seconds, then the last ten counted down (the
    # countdown moved on by the check's hook of a room on this machine); the time up, both results at once.
    WARN = "(()=>{const w=document.getElementById('mpFimAviso');return w&&!w.hidden?w.textContent:'';})()"
    def hurry(left):
        for page in (host, guest):
            page.evaluate("left=>interlagosSala.hurryEnd(interlagosSala.info().endIn-left)", left)
    hurry(61.5)
    for page in (host, guest):
        wait_js(page, f"{WARN}.includes('1 minuto')", timeout=5000)
    host.screenshot(path=str(SHOTS / '2_anfitriao_falta_1_minuto.png'))
    hurry(31)
    for page in (host, guest):
        wait_js(page, f"{WARN}.includes('30 segundos')", timeout=5000)
    hurry(9.6)
    numbers = set()
    for _ in range(40):
        text = guest.evaluate(WARN)
        if text.isdigit():
            numbers.add(int(text))
        if guest.evaluate(RESULTS):
            break
        guest.wait_for_timeout(250)
    assert {10, 5, 1} <= numbers or len(numbers) >= 8, f'the last ten counted down: {sorted(numbers)}'
    report['contagem'] = sorted(numbers, reverse=True)
    for page in (host, guest):
        wait_js(page, RESULTS, timeout=20000)
    place = guest.inner_text('#resultsPlace')
    assert 'CORRIDA ENCERRADA' in place and 'ESTIMADO' in place, place
    assert guest.inner_text('#resultsTime').startswith('TOTAL ≈'), guest.inner_text('#resultsTime')
    mine = guest.evaluate("[...document.querySelectorAll('#raceResults tbody tr')].map(r=>r.textContent).find(t=>t.includes('VOCÊ'))")
    assert mine and '≈' in mine, mine
    seen = host.evaluate("[...document.querySelectorAll('#raceResults tbody tr')].map(r=>r.textContent).find(t=>t.includes('Bia'))")
    assert seen and '≈' in seen, seen
    report['fim'] = {'convidada': place, 'anfitriao_ve_bia': seen.strip()[:80]}
    host.screenshot(path=str(SHOTS / '2_anfitriao_resultado.png'))
    guest.screenshot(path=str(SHOTS / '2_convidada_resultado.png'))
    browser.close()

assert not errors, errors
report['shots'] = str(SHOTS)
print(json.dumps(report, indent=1, ensure_ascii=False))
print('verificar_sala_fim: ok')
