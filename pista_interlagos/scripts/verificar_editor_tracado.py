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

        # Few points (user 10-22: the pit lane painted with the brush had a point every 2 m and Mover took dozens): a
        # straight brush stroke keeps little more than its ends, and Simplificar pontos thins a line keeping its shape.
        page.click('#camadas button[data-camada="pit"]')
        page.click('#ferramentas button[data-ferr="pincel"]')
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] * .8
        page.mouse.move(cx - 200, cy)
        page.mouse.down()
        for k in range(1, 41):
            page.mouse.move(cx - 200 + k * 10, cy + (k % 2) * .4)
        page.mouse.up()
        npit = info()['pit']
        page.click('#camadas button[data-camada="eixo"]')
        antes_n, antes_c = info()['eixo'], info()['comprimento']
        page.click('#bSimplificar')
        depois_n, depois_c = info()['eixo'], info()['comprimento']
        check('a straight brush stroke keeps few points; Simplificar pontos thins the lap without changing its shape',
              2 <= npit <= 3 and depois_n < antes_n / 3 and abs(depois_c - antes_c) < antes_c * .005, (npit, antes_n, depois_n, antes_c, depois_c))
        page.keyboard.press('Control+z')
        page.keyboard.press('Control+z')
        check('Ctrl+Z gives back the points and the empty pit lane', info()['eixo'] == antes_n and info()['pit'] == 0, (info()['eixo'], info()['pit']))
        page.click('#ferramentas button[data-ferr="mover"]')

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

        # Largura (user 10-22): the width lives in the track's own points and goes in a straight line to the previous and
        # the next point. A click on the line mid-side (no point there) makes a point; the corners are points already.
        page.click('#ferramentas button[data-ferr="largura"]')
        padrao = float(page.input_value('#largura'))
        def largura_no(x, y, w):
            q = page.evaluate(f'window.editorTracado.paraTela({x},{y})')
            page.mouse.click(box['x'] + q[0], box['y'] + q[1] + 2)
            page.evaluate("(w) => { const e = document.getElementById('larguraPonto'); e.value = w; e.dispatchEvent(new Event('input', {bubbles: true})); return true; }", w)
        largura_no(o[0], o[1] - 200, 10)
        largura_no(o[0] + 200, o[1] - 200, 15)
        largura_no(o[0] - 200, o[1] - 200, 8)
        em = lambda x, y: page.evaluate(f'window.editorTracado.larguraEm([{x},{y}])')
        no = [round(em(o[0] + dx, o[1] - 200), 2) for dx in (-200, -100, 0, 100, 200)] + [round(em(o[0] + 200, o[1]), 2)]
        lm = json.loads(page.evaluate('window.editorTracado.exportar()'))['largura_m']
        check('Largura: each point has its width and the border goes straight to the previous and the next point',
              no == [8, 9, 10, 12.5, 15, (15 + padrao) / 2] and lm == [8, 10, 15, padrao, padrao], (no, lm, padrao))
        # Done editing (user 10-22: the selected point stayed highlighted, forgotten): Esc lets it go, a click on the
        # point takes it again, and changing tool lets it go too.
        page.keyboard.press('Escape')
        solto = info()['larguraSel']
        meio = page.evaluate(f'window.editorTracado.paraTela({o[0]},{o[1] - 200})')
        page.mouse.click(box['x'] + meio[0], box['y'] + meio[1])
        de_novo = info()['larguraSel']
        check('Esc lets the point go, a click on it selects it again',
              solto is None and de_novo == 1 and page.is_hidden('#painelLargura') is False, (solto, de_novo))
        page.keyboard.press('Delete')
        sem = info()['larguras']
        page.keyboard.press('Control+z')
        check('Delete takes the point back to the default width and Ctrl+Z undoes it',
              [1, 10] not in sem and [1, 10] in info()['larguras'], (sem, info()['larguras']))
        page.click('#ferramentas button[data-ferr="mover"]')
        check('changing tool lets the point go (no diamonds outside the Largura tool)', info()['larguraSel'] is None, info()['larguraSel'])
        for _ in range(3):
            page.keyboard.press('Control+z')
        check('undoing the widths gives back the four-cornered lap', info()['eixo'] == 4 and info()['larguras'] == [], info()['larguras'])

        # Hover (user 10-22): before the click, every tool shows what it would take. Corner (o+200, o-200) is a point;
        # mid-side has none.
        def sobre(x, y):
            q = page.evaluate(f'window.editorTracado.paraTela({x},{y})')
            page.mouse.move(box['x'] + q[0], box['y'] + q[1])
            page.wait_for_timeout(60)
            return info()
        def ferramenta(f):
            page.click(f'#ferramentas button[data-ferr="{f}"]')
        ferramenta('largura')
        canto, meio_lado, longe = sobre(o[0] + 200, o[1] - 200), sobre(o[0], o[1] - 200), sobre(o[0], o[1])
        check('Largura hover: the point under the mouse, a new point on the line away from points, nothing elsewhere',
              canto['pontoHover'] == 1 and canto['novoHover'] is None and meio_lado['pontoHover'] is None
              and meio_lado['novoHover'] is not None and longe['hover'] is None, (canto['pontoHover'], meio_lado['novoHover'], longe['hover']))
        ferramenta('mover')
        m_meio, m_canto = sobre(o[0], o[1] - 200), sobre(o[0] + 200, o[1] - 200)
        ferramenta('apagar')
        a_canto = sobre(o[0] + 200, o[1] - 200)
        ferramenta('chegada')
        c_lado = sobre(o[0] + 200, o[1])
        ferramenta('pontos')
        p_perto = sobre(o[0] + 3, o[1] - 190)
        ferramenta('pincel')
        b_linha = sobre(o[0] - 200, o[1] + 40)
        check('Mover, Apagar, Chegada, Pontos and Pincel show their target before the click',
              m_meio['novoHover'] is not None and m_canto['hover']['afetados'] == 1 and a_canto['hover']['apagados'] == 1
              and c_lado['hover']['chegada'] and p_perto['hover']['segmento'] == 0 and b_linha['hover']['encaixe'],
              (m_meio['novoHover'], m_canto['hover'], a_canto['hover'], c_lado['hover'], p_perto['hover'], b_linha['hover']))
        sobre(o[0], o[1] - 200)
        page.screenshot(path=str(shots / 'editor_hover_pincel.png'))
        ferramenta('mover')

        # The editor remembers its settings: tool, line, radius, what is shown, and per circuit each background and line.
        def deslizar(seletor, valor):
            page.evaluate("([s, v]) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); return true; }", [seletor, valor])
        page.click('#ferramentas button[data-ferr="apagar"]')
        page.click('#camadas button[data-camada="pit"]')
        deslizar('#raio', 60)
        deslizar('#largura', 12)
        page.uncheck('#verSetas')
        page.click('#cores button[data-cor="#0b2a8f"]')
        deslizar('#listaCamadas input[type=range]', 40)
        page.locator('#listaLinhas .item', has_text='Pit lane atual do jogo').locator('input[type=checkbox]').uncheck()
        page.reload()
        wait_js(page, "window.editorTracado?.info().pronto&&window.editorTracado.info().circuito==='cascavel'", timeout=30000)
        i = info()
        check('settings come back after reloading the page',
              i['ferramentaAtual'] == 'apagar' and i['camadaAtual'] == 'pit' and page.input_value('#raio') == '60'
              and page.input_value('#largura') == '12' and not page.is_checked('#verSetas')
              and abs(i['fundos'][0]['opac'] - .4) < 1e-6 and i['linhasVer']['Pit lane atual do jogo'] is False
              and i['cor'] == '#0b2a8f' and page.get_attribute('#cores button[data-cor="#0b2a8f"]', 'aria-pressed') == 'true', i)
        # The painted lap is drawn in the chosen colour (a dark one here): its borders show it on the canvas.
        page.screenshot(path=str(shots / 'editor_cor_escura.png'))
        page.click('#cores button[data-cor="#00e5ff"]')
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
