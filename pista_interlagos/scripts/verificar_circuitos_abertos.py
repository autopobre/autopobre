"""Cascavel, ECPA, Chapeco, Brasilia e Goiania no navegador: carregam sem erros, cenario montado, fotos de conferencia.

    python verificar_circuitos_abertos.py [porta] [cascavel|piracicaba|chapeco|brasilia|goiania|guaratiba]

Abre cada circuito pelo seletor (?circuito=), entra no Modo Corrida, confere o cenario
(terreno, arvores, edificacoes, arquibancadas, boxes) e fotografa a largada, a volta de
reconhecimento e vistas do alto em renders/circuitos_<id>_*.png.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, choose_race

PORTA = sys.argv[1] if len(sys.argv) > 1 else '8799'
SO = sys.argv[2] if len(sys.argv) > 2 else None
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RENDERS = Path(__file__).resolve().parents[1] / 'renders'
RENDERS.mkdir(exist_ok=True)
relatorio = {}
erros = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    for circuito in ['cascavel', 'piracicaba', 'chapeco', 'brasilia', 'goiania', 'guaratiba']:
        if SO and SO != circuito:
            continue
        page = browser.new_page(viewport={'width': 1280, 'height': 720})
        page.set_default_timeout(180000)
        page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
        page.on('console', lambda m: print('console', m.type, m.text, flush=True) if m.type in ('error', 'warning') else None)
        page.goto(URL + f'?circuito={circuito}', wait_until='domcontentloaded')
        wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
        assert page.get_attribute(f'[data-circuit="{circuito}"]', 'aria-pressed') == 'true'
        page.fill('#pilotName', 'Piloto teste')
        choose_race(page)
        wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused', timeout=240000)
        page.evaluate('interlagos.skipIntro?.()')
        page.wait_for_timeout(2500)
        info = page.evaluate("""()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),pit:interlagos.pitInfo(),
          surface:interlagos.surfaceInfo(),telemetry:interlagos.telemetry(),drawCalls:interlagos.state.drawCalls,
          wordmark:document.querySelector('.wordmark').textContent,label:document.querySelector('.maplabel').textContent})""")
        assert info['circuit'] == circuito
        sc = info['scenery']
        assert sc['trees'] > 500 and sc['houses'] > 50, sc
        assert sc['stands']['blocks'] >= 3 and sc['fans'] > 100, sc
        # The #19's garage door always has its crewman: Leonardo takes his place in the story paddock (Brasilia once drew nobody).
        door = page.evaluate("""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js'),{garageBays}=await import('./pit-lane.js'),{RIVAL_ROSTER}=await import('./race-roster.js');
          const old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();ImmersiveMode.prototype.info=old;
          const scene=fixtureMode.visual.root.parent,pit=fixtureMode.data.pit,k=RIVAL_ROSTER.findIndex(r=>r.number==='19');
          return {bay19:!!(pit?.garages&&scene.getObjectByName('Box_garagens')&&[...garageBays(pit,RIVAL_ROSTER.length).team.values()].includes(k)),door19:!!scene.getObjectByName('Porta_equipe_19')};}""")
        assert door['door19'] or not door['bay19'], (circuito, door)
        page.screenshot(path=str(RENDERS / f'circuitos_{circuito}_largada.png'))
        # Volta de reconhecimento: o piloto automatico percorre o circuito.
        page.evaluate('interlagos.setTour(true)')
        for k in range(6):
            page.wait_for_timeout(9000)
            page.screenshot(path=str(RENDERS / f'circuitos_{circuito}_volta_{k}.png'))
        t = page.evaluate('interlagos.telemetry()')
        relatorio[circuito] = {'scenery': {k: sc[k] for k in ('trees', 'houses', 'fans', 'chunks') if k in sc},
                               'stands': sc.get('stands'), 'drawCalls': info['drawCalls'],
                               'wordmark': info['wordmark'], 'lapDistance': t.get('s'), 'speed': t.get('speed')}
        print(json.dumps({circuito: relatorio[circuito]}, ensure_ascii=False), flush=True)
        page.close()
    browser.close()
assert not erros, erros
print(json.dumps({'passed': True}, ensure_ascii=False))
