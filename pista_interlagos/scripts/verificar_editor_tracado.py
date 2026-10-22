"""The track editor (teste/editor-tracado.html, /dev/ only) in the browser.

A game circuit opens with its ground and its current centreline; "editar" copies that line for editing and the saved
file gives it back in the track file's own local frame (the same numbers as its samples). A brush stroke that starts
and ends on the closed lap replaces the stretch between, Mover pushes it, Ctrl+Z undoes. A reference folder
(fontes/<circuito>/referencias/, local only) adds its images and lines; Guaratiba's, a circuit not yet in the game,
brings a perspective view where the same line is drawn through its camera.
Usage: verificar_editor_tracado.py [port] [shots folder] (default 8799; INTERLAGOS_URL overrides the game's address).
"""
import json
import os
import sys
import tempfile
from pathlib import Path

from browser_config import GAME_URL, browser_args, browser_executable, wait_js
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
game = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace('8799', sys.argv[1]) if len(sys.argv) > 1 else GAME_URL)
editor = game.split('#')[0].rstrip('/') + '/editor-tracado.html'
shots = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(tempfile.gettempdir()) / 'verificar_editor_tracado'
shots.mkdir(parents=True, exist_ok=True)
errors, failed = [], []


def check(name, ok, detail=''):
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (' - ' + str(detail) if detail != '' else ''), flush=True)
    if not ok:
        failed.append(name)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1500, 'height': 950})
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    info = lambda: page.evaluate('window.editorTracado.info()')
    try:
        page.goto(editor)
        wait_js(page, "window.editorTracado?.info().circuito", timeout=30000)
        page.select_option('#circuito', 'cascavel')
        wait_js(page, "window.editorTracado.info().pronto&&window.editorTracado.info().circuito==='cascavel'", timeout=30000)
        i = info()
        check('a game circuit opens with its ground and its current lines', 'Chão do jogo (Sentinel-2)' in i['camadas']
              and i['linhas'][:2] == ['Traçado atual do jogo', 'Pit lane atual do jogo'] and i['sistema'] == 'utm', i)
        page.locator('#listaLinhas .item', has_text='Traçado atual do jogo').locator('button').click()
        i = info()
        dados = json.loads((ROOT / 'dados/pista_cascavel.json').read_text(encoding='utf-8'))
        check('"editar" copies the game centreline, closed, at its length', i['fechado'] and abs(i['comprimento'] - dados['meta']['reconstructed_xy_m'] / dados['meta']['horizontal_scale_to_nominal']) < 2, i)
        saida = json.loads(page.evaluate('window.editorTracado.exportar()'))
        local0 = saida['jogo']['eixo_local'][0]
        amostra = dados['samples'][0][1:3]
        check('the saved file gives the line back in the track file\'s local frame', abs(local0[0] - amostra[0]) < .02 and abs(local0[1] - amostra[1]) < .02,
              (local0, amostra))
        check('the saved file is in the circuit\'s UTM', saida['sistema'] == 'utm' and saida['epsg'] == dados['meta']['epsg'] and saida['formato'] == 'autopobre-tracado-v1')
        page.screenshot(path=str(shots / 'editor_cascavel.png'))
        page.evaluate("window.editorTracado.abrirCircuito('pampulha');window.editorTracado.abrirCircuito('floripa');true")
        wait_js(page, "window.editorTracado.info().pronto&&window.editorTracado.info().circuito==='floripa'", timeout=60000)
        page.wait_for_timeout(1500)
        i = info()
        check('switching circuits quickly keeps only the last one', i['circuito'] == 'floripa' and i['camadas'] == ['Chão do jogo (Sentinel-2)'], i['camadas'])
        page.select_option('#circuito', 'cascavel')
        wait_js(page, "window.editorTracado.info().pronto&&window.editorTracado.info().circuito==='cascavel'", timeout=30000)

        # Re-trace a stretch: start and end on the line, bulge 15 m outwards in between.
        page.click('#ferramentas button[data-ferr="pincel"]')
        antes = info()['comprimento']
        pts = page.evaluate("""(() => { const e = JSON.parse(window.editorTracado.exportar()).eixo, n = e.length, a = Math.floor(n * .3), b = a + 60;
          const out = []; for (let k = a; k <= b; k += 2) { const t = (k - a) / (b - a), p = e[k], q = e[k + 1];
            const dx = q[0] - p[0], dy = q[1] - p[1], m = Math.hypot(dx, dy), off = Math.sin(Math.PI * t) * 15;
            out.push(window.editorTracado.paraTela(p[0] - dy / m * off, p[1] + dx / m * off)); } return out; })()""")
        box = page.locator('#tela').bounding_box()
        page.mouse.move(box['x'] + pts[0][0], box['y'] + pts[0][1])
        page.mouse.down()
        for x, y in pts[1:]:
            page.mouse.move(box['x'] + x, box['y'] + y, steps=2)
        page.mouse.up()
        depois = info()
        check('a stroke from the line to the line replaces that stretch, the lap stays closed', depois['fechado'] and depois['comprimento'] > antes + 3, (antes, depois['comprimento']))
        page.keyboard.press('Control+z')
        check('Ctrl+Z undoes the stroke', abs(info()['comprimento'] - antes) < .01, info()['comprimento'])

        # Mover: drag a point of the line 40 px sideways.
        page.click('#ferramentas button[data-ferr="mover"]')
        alvo = page.evaluate("(() => { const e = JSON.parse(window.editorTracado.exportar()).eixo; return window.editorTracado.paraTela(...e[Math.floor(e.length * .6)]); })()")
        page.mouse.move(box['x'] + alvo[0], box['y'] + alvo[1])
        page.mouse.down()
        page.mouse.move(box['x'] + alvo[0] + 40, box['y'] + alvo[1], steps=6)
        page.mouse.up()
        check('Mover pushes the line', abs(info()['comprimento'] - antes) > .5, (antes, info()['comprimento']))

        # A lap drawn with few points (a 400 m square): Mover in the middle of a side, where there is no point, adds one
        # point on the line under its centre and pulls it; the finish line clicked mid-side stays there.
        quadrado = shots / 'quadrado_cascavel.json'
        o = dados['meta']['origin_utm']
        cantos = [[o[0] - 200, o[1] - 200], [o[0] + 200, o[1] - 200], [o[0] + 200, o[1] + 200], [o[0] - 200, o[1] + 200]]
        quadrado.write_text(json.dumps({'circuito': 'cascavel', 'sistema': 'utm', 'eixo': cantos, 'eixo_fechado': True}), encoding='utf-8')
        page.set_input_files('#arquivo', str(quadrado))
        wait_js(page, "window.editorTracado.info().eixo===4", timeout=10000)
        meio = page.evaluate(f"window.editorTracado.paraTela({o[0]},{o[1] - 200})")
        page.mouse.move(box['x'] + meio[0], box['y'] + meio[1])
        page.mouse.down()
        page.mouse.move(box['x'] + meio[0], box['y'] + meio[1] - 30, steps=6)
        page.mouse.up()
        e = json.loads(page.evaluate('window.editorTracado.exportar()'))['eixo']
        mexido = max(e, key=lambda q: q[1] if abs(q[0] - o[0]) < 3 else -1e9)
        check('Mover adds a single point where the line had none and pulls it', len(e) == 5 and mexido[1] > o[1] - 200 + 5, (len(e), mexido))
        page.click('#ferramentas button[data-ferr="chegada"]')
        lado = page.evaluate(f"window.editorTracado.paraTela({o[0] + 200},{o[1] + 37})")
        page.mouse.click(box['x'] + lado[0] + 6, box['y'] + lado[1])
        c = info()['chegada']
        check('the finish line lands where it is clicked, also mid-segment', abs(c[0] - (o[0] + 200)) < .01 and abs(c[1] - (o[1] + 37)) < 3, c)
        page.keyboard.press('Control+z')
        page.keyboard.press('Control+z')

        # Largura: a point on the line mid-side (no vertex there) widens the track around it, smoothly, within its reach.
        page.click('#ferramentas button[data-ferr="largura"]')
        padrao = float(page.input_value('#largura'))
        meio = page.evaluate(f"window.editorTracado.paraTela({o[0]},{o[1] - 200})")
        page.mouse.click(box['x'] + meio[0], box['y'] + meio[1] + 3)
        page.evaluate("() => { for (const [id, v] of [['larguraPonto', 22], ['alcancePonto', 60]]) { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); } return true; }")
        lp = json.loads(page.evaluate('window.editorTracado.exportar()'))['larguras_pontos']
        no = page.evaluate(f"[window.editorTracado.larguraEm([{o[0]},{o[1] - 200}]), window.editorTracado.larguraEm([{o[0] + 30},{o[1] - 200}]), window.editorTracado.larguraEm([{o[0] + 120},{o[1] - 200}])]")
        check('Largura: a point mid-side sets the width there, fades within its reach, default beyond',
              len(lp) == 1 and abs(lp[0][0] - o[0]) < 2 and abs(lp[0][1] - (o[1] - 200)) < .01 and lp[0][2:] == [22, 60]
              and abs(no[0] - 22) < .6 and padrao < no[1] < 22 and abs(no[2] - padrao) < 1e-6, (lp, no, padrao))
        page.keyboard.press('Delete')
        sem = info()['larguras']
        page.keyboard.press('Control+z')
        check('Delete removes the width point and Ctrl+Z brings it back', sem == [] and len(info()['larguras']) == 1, (sem, info()['larguras']))
        page.keyboard.press('Control+z')
        page.keyboard.press('Control+z')
        page.keyboard.press('Control+z')

        # The editor remembers its settings: tool, line, radius, what is shown, and per circuit each background and line.
        def deslizar(seletor, valor):
            page.evaluate("([s, v]) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); return true; }", [seletor, valor])
        page.click('#ferramentas button[data-ferr="apagar"]')
        page.click('#camadas button[data-camada="pit"]')
        deslizar('#raio', 60)
        deslizar('#largura', 12)
        page.uncheck('#verSetas')
        deslizar('#listaCamadas input[type=range]', 40)
        page.locator('#listaLinhas .item', has_text='Pit lane atual do jogo').locator('input[type=checkbox]').uncheck()
        page.reload()
        wait_js(page, "window.editorTracado?.info().pronto&&window.editorTracado.info().circuito==='cascavel'", timeout=30000)
        i = info()
        check('settings come back after reloading the page',
              i['ferramentaAtual'] == 'apagar' and i['camadaAtual'] == 'pit' and page.input_value('#raio') == '60'
              and page.input_value('#largura') == '12' and not page.is_checked('#verSetas')
              and abs(i['fundos'][0]['opac'] - .4) < 1e-6 and i['linhasVer']['Pit lane atual do jogo'] is False, i)
        page.click('#ferramentas button[data-ferr="mover"]')
        page.click('#camadas button[data-camada="eixo"]')
        deslizar('#raio', 25)
        page.check('#verSetas')

        pasta = ROOT / 'fontes/guaratiba/referencias'
        if (pasta / 'camadas.json').exists():
            page.set_input_files('#pasta', str(pasta))
            wait_js(page, "window.editorTracado.info().pronto&&window.editorTracado.info().circuito==='guaratiba'&&window.editorTracado.info().vistas.length>1", timeout=30000)
            i = info()
            # (Guaratiba was only a reference folder until it came into the game; now the folder adds to its ground.)
            esperadas = {'Render do projeto, vista de cima', 'Ortofoto 2025 (IPP, terreno hoje)', 'Render original'}
            check('a reference folder opens its circuit with its images and lines, in the same frame as the game',
                  esperadas <= set(i['camadas']) and 'Eixo v3 do Claude' in i['linhas'] and i['vistas'] == ['cima', 'p0']
                  and i['sistema'] == 'utm', i)
            page.locator('#listaLinhas .item', has_text='Eixo v3 do Claude').locator('button').click()
            i = info()
            check('the guide line becomes the lap, clockwise', i['fechado'] and i['sentido'] == 'horario' and 4400 < i['comprimento'] < 4700, i)
            page.screenshot(path=str(shots / 'editor_guaratiba_cima.png'))
            page.keyboard.press('2')
            wait_js(page, "window.editorTracado.info().vista==='p0'", timeout=5000)
            proj = page.evaluate("(() => { const e = JSON.parse(window.editorTracado.exportar()).eixo; const p = window.editorTracado.paraTela(...e[0]); const q = window.editorTracado.doTela(...p); return [e[0], q]; })()")
            check('the perspective view draws the line through its camera and back', abs(proj[0][0] - proj[1][0]) < .05 and abs(proj[0][1] - proj[1][1]) < .05, proj)
            page.screenshot(path=str(shots / 'editor_guaratiba_render.png'))
            page.keyboard.press('1')
            orto = page.locator('#listaCamadas .item', has_text='Ortofoto 2025')
            orto.locator('input[type=checkbox]').check()
            page.evaluate("() => { const e = [...document.querySelectorAll('#listaCamadas .item')].find(d => d.textContent.includes('Ortofoto 2025')).querySelector('input[type=range]'); e.value = 70; e.dispatchEvent(new Event('input', {bubbles: true})); return true; }")
            page.reload()
            wait_js(page, "window.editorTracado?.info().pronto", timeout=30000)
            page.set_input_files('#pasta', str(pasta))
            wait_js(page, "window.editorTracado.info().pronto&&window.editorTracado.info().circuito==='guaratiba'&&window.editorTracado.info().vistas.length>1", timeout=30000)
            i = info()
            f = {c['nome']: c for c in i['fundos']}
            check('a reference folder opened again brings back its backgrounds and the painted lap',
                  f['Ortofoto 2025 (IPP, terreno hoje)']['ver'] and abs(f['Ortofoto 2025 (IPP, terreno hoje)']['opac'] - .7) < 1e-6
                  and i['eixo'] > 100 and i['fechado'], (f, i['eixo']))
        else:
            print('skip Guaratiba reference folder (not on this machine)')
        check('no page errors', not errors, errors[:5])
    finally:
        browser.close()
print(f'shots: {shots}')
sys.exit(1 if failed else 0)
