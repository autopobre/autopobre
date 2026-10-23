"""Os trechos fechados do Velocitta no navegador: o resto do asfalto do autodromo (data.closed_roads), montado, sem erros, e fotos.

    python verificar_trechos_fechados.py [porta] [pasta das fotos]

Abre o Velocitta (?circuito=velocitta) no Treino solo e confere o que closed-roads.js desenha: o asfalto dos seis trechos
fora do traçado de competicao (as curvas 3 e 4 originais, a Curva da Paciencia, as ligacoes do H, do anel superior e curta,
o acesso do museu), as linhas, as zebras e as barreiras plasticas nas bocas, em quatro chamadas de desenho no maximo, e
nenhum erro na pagina. Fotografa do alto o cruzamento do laco original com a Caipirinha, a Paciencia dentro da Ferradura, o
H, a ligacao do anel superior, o acesso do museu, e de perto as barreiras vistas da pista; monta trechos_mosaico.jpg.
Fotos JPG em pista_interlagos/renders/velocitta/previas/rodada_01/trechos (ou na pasta dada).
"""
import json
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

import browser_config  # noqa: F401  (headless e a trava do mouse dentro da pagina, antes de qualquer pagina)
from browser_config import browser_executable, browser_args, wait_js

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8861'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'velocitta' / 'previas' / 'rodada_01' / 'trechos'
FOTOS.mkdir(parents=True, exist_ok=True)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_velocitta.json').read_text(encoding='utf-8'))
TRECHOS = {r['id']: r for r in DADOS['closed_roads']}
erros = []
falhas = []
tiradas = []


def estacao(trecho, frac):
    """Centro, altura, largura e tangente do trecho na fracao dada do comprimento."""
    r = TRECHOS[trecho]
    c = {k: i for i, k in enumerate(r['columns'])}
    p = r['samples'][min(len(r['samples']) - 1, int(frac * (len(r['samples']) - 1)))]
    return {'x': p[c['x']], 'y': p[c['y']], 'z': p[c['z']], 'w': p[c['width']], 't': (p[c['ly']], -p[c['lx']]), 'n': (p[c['lx']], p[c['ly']])}


def do_alto(page, x, y, z, altura=70, recuo=25, rumo=(0, -1), fov=50):
    """Camera parada acima de (x, y), um pouco recuada no rumo dado, olhando para o ponto."""
    de = [x - rumo[0] * recuo, y - rumo[1] * recuo, z + altura]
    page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});true}", {'de': de, 'para': [x, y, z], 'fov': fov})
    page.wait_for_timeout(1800)


def foto(page, nome):
    caminho = FOTOS / f'trechos_{nome}.jpg'
    page.screenshot(path=str(caminho), type='jpeg', quality=86)
    tiradas.append(caminho)
    print('foto', caminho.name, flush=True)


def mosaico():
    from PIL import Image, ImageDraw
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
        desenho.text((x + 6, y + 5), caminho.stem.replace('trechos_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'trechos_mosaico.jpg'
    tela.save(destino, quality=86)
    print('mosaico', destino, flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: print('console', m.type, m.text, flush=True) if m.type == 'error' else None)
    page.goto(URL + '?circuito=velocitta', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    page.click('#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.();true')
    page.wait_for_timeout(4000)
    info = page.evaluate("""async()=>{const {closedRoads}=await import('./closed-roads.js'),x=closedRoads.current;
      if(!x)return null;const names=[];x.root.traverse(o=>{if(o.isMesh)names.push(o.name)});return {stats:x.stats,meshes:names,inScene:!!x.root.parent};}""")
    print(json.dumps(info, ensure_ascii=False), flush=True)
    if not info:
        falhas.append('closed-roads.js nao montou nada')
    else:
        st = info['stats']
        for chave, minimo in (('asphaltTriangles', 2000), ('paintTriangles', 200), ('kerbTriangles', 100), ('barrierUnits', 60)):
            if (st.get(chave) or 0) < minimo:
                falhas.append(f'{chave}={st.get(chave)} (minimo {minimo})')
        if st.get('roads') != 6 or st.get('barriers') != 11:
            falhas.append(f"trechos {st.get('roads')} / barreiras {st.get('barriers')} (esperado 6 / 11)")
        if st.get('drawCalls', 9) > 4:
            falhas.append(f"{st.get('drawCalls')} chamadas de desenho")
        if not info['inScene']:
            falhas.append('trechos fora da cena')
        # O asfalto fechado ocupa so o que fica fora da pista (a costura segue a borda).
        if st.get('asphaltM', 0) < 700:
            falhas.append(f"asfalto fechado com {st.get('asphaltM')} m (os seis trechos somam ~900 m)")
    # Fotos do alto.
    cruz = estacao('curvas_3_4', .43)
    do_alto(page, cruz['x'], cruz['y'], cruz['z'], altura=95, recuo=40, rumo=cruz['t'])
    foto(page, '1_cruzamento_caipirinha')
    meio = estacao('curvas_3_4', .55)
    do_alto(page, meio['x'], meio['y'], meio['z'], altura=150, recuo=60, rumo=(0, 1), fov=55)
    foto(page, '2_laco_original_inteiro')
    pac = estacao('paciencia', .5)
    do_alto(page, pac['x'], pac['y'], pac['z'], altura=110, recuo=50, rumo=(-1, 0))
    foto(page, '3_paciencia_na_ferradura')
    h = estacao('ligacao_h', .5)
    do_alto(page, h['x'], h['y'], h['z'], altura=80, recuo=35, rumo=h['t'])
    foto(page, '4_ligacao_do_h')
    anel = estacao('anel_superior', .35)
    do_alto(page, anel['x'], anel['y'], anel['z'], altura=80, recuo=35, rumo=anel['t'])
    foto(page, '5_anel_superior_e_curta')
    museu = estacao('acesso_museu', .5)
    do_alto(page, museu['x'], museu['y'], museu['z'], altura=70, recuo=30, rumo=(0, 1))
    foto(page, '6_acesso_do_museu')
    # As barreiras de perto, da altura de quem esta na pista olhando para o trecho fechado.
    for nome, (trecho, k) in {'7_barreira_h': ('ligacao_h', 0), '8_barreira_paciencia': ('paciencia', 1), '9_barreira_laco': ('curvas_3_4', 0)}.items():
        x1, y1, x2, y2, z = TRECHOS[trecho]['barriers']['items'][k]
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        nx, ny = -(y2 - y1), (x2 - x1)
        l = math.hypot(nx, ny)
        nx, ny = nx / l, ny / l
        # Do lado da pista: o lado em que o centro da pista mais perto fica.
        A = DADOS['samples']
        q = min(A, key=lambda a: (a[1] - mx) ** 2 + (a[2] - my) ** 2)
        if (q[1] - mx) * nx + (q[2] - my) * ny < 0:
            nx, ny = -nx, -ny
        de = [mx + nx * 14, my + ny * 14, z + 2.2]
        page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});true}", {'de': de, 'para': [mx, my, z + .5], 'fov': 55})
        page.wait_for_timeout(1800)
        foto(page, nome)
    page.evaluate('interlagosLuz.photo(null);true')
    browser.close()
mosaico()
if erros:
    falhas.append(f'erros na pagina: {erros[:3]}')
print(json.dumps({'passed': not falhas, 'falhas': falhas}, ensure_ascii=False))
sys.exit(1 if falhas else 0)
