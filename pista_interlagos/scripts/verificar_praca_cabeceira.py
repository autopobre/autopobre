"""A praca da cabeceira insular da Ponte Hercilio Luz em Floripa, no navegador: o Monumento a Hercilio Luz e o mirante de
pergola branca (data.scenery.landmarks monumento_hercilio_luz / mirante_cabeceira, floripa-landmarks.js).

    python verificar_praca_cabeceira.py [porta] [pasta das fotos]

Confere que os dois sao montados (o monumento com a altura do bronze, a pergola com as 12 colunas e as 18 ripas), que
os solidos deles entram no mundo do passeio da cidade (physics.js addRoamSolids), que quem anda a pe (F) para no degrau
do pedestal e numa coluna mas passa sob a pergola entre elas, que o carro solto na praca bate no pedestal, que nenhuma
placa fica entre a pista e o monumento (track-surface.js landmarkView) e que a pagina nao da erro. Fotografa da pista, da
calcada da Alameda, de perto do monumento e sob a pergola; monta praca_mosaico.jpg.
Fotos JPG em pista_interlagos/renders/floripa/previas/praca_cabeceira (ou na pasta dada).
"""
import json
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

import browser_config  # noqa: F401  (headless e a trava do mouse dentro da pagina, antes de qualquer pagina)
from browser_config import browser_executable, browser_args, wait_js, start_race

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8881'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'floripa' / 'previas' / 'praca_cabeceira'
FOTOS.mkdir(parents=True, exist_ok=True)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_floripa.json').read_text(encoding='utf-8'))
MARCOS = {m['kind']: m for m in DADOS['scenery']['landmarks']}
MON, MIR = MARCOS['monumento_hercilio_luz'], MARCOS['mirante_cabeceira']
A = DADOS['samples']
erros, falhas, tiradas = [], [], []


def confere(nome, ok, extra=''):
    print(('ok   ' if ok else 'FALHA ') + nome + (f' ({extra})' if extra else ''), flush=True)
    if not ok:
        falhas.append(nome + (f' ({extra})' if extra else ''))


def no_arco(r, graus):
    a = math.radians(graus)
    return [MIR['x'] + math.cos(a) * r, MIR['y'] + math.sin(a) * r]


def da_pista(s, h):
    a = min(A, key=lambda q: abs(q[0] - s))
    return [a[1], a[2], a[3] + h]


def foto(page, nome, de, para, fov=55):
    page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});true}", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(2200)
    caminho = FOTOS / f'praca_{nome}.jpg'
    page.screenshot(path=str(caminho), type='jpeg', quality=86)
    tiradas.append(caminho)
    print('foto', caminho.name, flush=True)


def mosaico():
    from PIL import Image, ImageDraw
    if not tiradas:
        return
    w, h, col = 480, 270, 3
    linhas = math.ceil(len(tiradas) / col)
    tela = Image.new('RGB', (w * col, (h + 22) * linhas), (24, 24, 24))
    desenho = ImageDraw.Draw(tela)
    for k, caminho in enumerate(tiradas):
        x, y = (k % col) * w, (k // col) * (h + 22)
        tela.paste(Image.open(caminho).convert('RGB').resize((w, h)), (x, y + 22))
        desenho.text((x + 6, y + 5), caminho.stem.replace('praca_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'praca_mosaico.jpg'
    tela.save(destino, quality=86)
    print('mosaico', destino, flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(300000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text[:300]), print('console', m.text[:300], flush=True)) if m.type == 'error' else None)
    page.goto(URL + '?circuito=floripa', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    start_race(page, '#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=400000)
    page.evaluate('interlagos.skipIntro?.();true')
    page.wait_for_timeout(4000)
    st = page.evaluate("()=>interlagos.sceneryInfo().extras?.Marcos_Floripa??null")
    print(json.dumps({k: v for k, v in (st or {}).items() if not isinstance(v, dict) or k in ('monumento_hercilio_luz', 'mirante_cabeceira')}, ensure_ascii=False), flush=True)
    confere('monumento montado', bool(st) and isinstance(st.get('monumento_hercilio_luz'), dict) and st['monumento_hercilio_luz'].get('height', 0) > 6)
    mir = (st or {}).get('mirante_cabeceira') or {}
    confere('pergola montada (12 colunas, 18 ripas, banco)', mir.get('columns') == 12 and mir.get('slats') == 18 and mir.get('benches', 0) > 0, json.dumps(mir))
    confere('solidos no passeio da cidade', (st or {}).get('roamSolids', 0) >= 1 + 12 + 5 + 10, str((st or {}).get('roamSolids')))
    # Nenhuma placa entre a pista e o monumento.
    placas = page.evaluate("""async()=>{const {billboardSpots,landmarkView}=await import('./track-surface.js');const d=interlagos.car.data;
      const m=d.scenery.landmarks.find(q=>q.kind==='monumento_hercilio_luz');
      return {lap:m.lap,spots:billboardSpots(d).map(b=>({s:+b.p[0].toFixed(1),side:b.side,x:+b.x.toFixed(1),y:+b.y.toFixed(1)}))};}""")
    lap = placas['lap']
    L = DADOS['meta']['reconstructed_xy_m']
    perto = [b for b in placas['spots'] if b['side'] == lap['side'] and min(abs(b['s'] - lap['s']) % L, L - abs(b['s'] - lap['s']) % L) < 60]
    confere('nenhuma placa diante do monumento', not perto, json.dumps(perto))
    # A pe: o degrau do pedestal e uma coluna param; entre as colunas, sob a pergola, se passa.
    page.keyboard.press('KeyF')
    wait_js(page, 'interlagos.walkInfo()?.active', timeout=30000)
    andar = """([ax,ay,bx,by])=>{const w=interlagos.walker(),g=x=>({x:x[0],y:w.foot.floor,z:-x[1]});
      const n=40;let last=null;for(let k=1;k<=n;k++){const t=k/n,p=[ax+(bx-ax)*t,ay+(by-ay)*t],q=[ax+(bx-ax)*(k-1)/n,ay+(by-ay)*(k-1)/n];
       if(!w.passes(g(q),g(p),w.foot.floor))return {parou:true,em:p};last=p;}return {parou:false,em:last};}"""
    h = MON['heading']
    frente = [MON['x'] + math.cos(h) * 6, MON['y'] + math.sin(h) * 6]
    r = page.evaluate(andar, frente + [MON['x'], MON['y']])
    dist = math.hypot(r['em'][0] - MON['x'], r['em'][1] - MON['y']) if r['em'] else 0
    confere('a pe para no degrau do pedestal', r['parou'] and dist > 1.6, f"{dist:.2f} m do centro")
    a_col = math.degrees(MIR['angles'][0]) + .035 * 180 / math.pi
    col = no_arco(MIR['radii'][0], a_col)
    r = page.evaluate(andar, [col[0] - 4, col[1] - 0.0, col[0], col[1]])
    confere('a pe para numa coluna da pergola', r['parou'])
    # (A meio arco fica o meio de um vao entre dois pares de colunas: se entra ali, ate antes do banco do vao.)
    meio_a = (MIR['angles'][0] + MIR['angles'][1]) / 2
    dentro, sob = no_arco(MIR['radii'][0] - 3, math.degrees(meio_a)), no_arco(MIR['radii'][0] + .6, math.degrees(meio_a))
    r = page.evaluate(andar, dentro + sob)
    confere('a pe entra sob a pergola entre as colunas', not r['parou'], json.dumps(r))
    page.keyboard.press('KeyF')
    page.wait_for_timeout(3000)
    # O carro solto na praca, vindo por tras do monumento (do lado da pergola, 8,5 m) a 8 m/s: bate e nao atravessa.
    bate = page.evaluate("""([x,y,h])=>{const c=interlagos.car,hx=x-Math.cos(h)*8.5,hy=y-Math.sin(h)*8.5,head=h;
      c.x=hx;c.y=hy;c.heading=head;c.vx=Math.cos(head)*8;c.vy=Math.sin(head)*8;c.yaw=0;c.settle?.();c.vx=Math.cos(head)*8;c.vy=Math.sin(head)*8;
      let min=1e9;for(let k=0;k<360;k++){c.step({throttle:.4,brake:0,left:0,right:0,reverse:0,handbrake:0},1/120);min=Math.min(min,Math.hypot(c.x-x,c.y-y));}
      return {min,zona:c.roamZone?.name??null,impacto:c.wallImpactSpeed};}""", [MON['x'], MON['y'], MON['heading']])
    confere('o carro bate no pedestal', bate['zona'] == 'aterro' and 3.0 < bate['min'] < 5.0, json.dumps(bate))
    page.evaluate('interlagos.car.resetGrid?.();interlagos.car.settle?.();true')
    # Fotos (a altura do chao como o carro o le em cada ponto de vista a pe).
    chao = lambda x, y: page.evaluate('([x,y])=>interlagos.car.ground(x,y).z', [x, y])
    m = [MON['x'], MON['y'], chao(MON['x'], MON['y'])]
    foto(page, '1_da_pista_s395', da_pista(395, 1.3), [m[0], m[1], m[2] + 3.5], 50)
    foto(page, '2_da_pista_s430', da_pista(430, 1.3), [m[0] - 4, m[1] - 4, m[2] + 3], 55)
    a_pe = lambda q, h_=1.65: [q[0], q[1], chao(q[0], q[1]) + h_]
    calcada = a_pe([MON['x'] + math.cos(h) * 8, MON['y'] + math.sin(h) * 8])
    foto(page, '3_calcada_da_alameda', calcada, no_arco(15, math.degrees(h) + 180) + [m[2] + 2.5], 60)
    foto(page, '4_monumento_de_perto', a_pe([MON['x'] + math.cos(h + .35) * 6.5, MON['y'] + math.sin(h + .35) * 6.5]), [m[0], m[1], m[2] + 4.6], 60)
    sob = a_pe(no_arco((MIR['radii'][0] + MIR['radii'][1]) / 2 - .6, math.degrees(meio_a) - 8), 1.6)
    foto(page, '5_sob_a_pergola_para_a_baia', sob, no_arco(60, math.degrees(meio_a) + 25) + [m[2] - 2], 65)
    foto(page, '6_pergola_da_praca', a_pe(no_arco(6, math.degrees(meio_a) + 10)), no_arco(15, math.degrees(meio_a)) + [m[2] + 1.8], 70)
    foto(page, '7_do_alto', [m[0] + 18, m[1] + 22, m[2] + 38], [m[0] - 6, m[1] - 6, m[2]], 55)
    page.evaluate('interlagosLuz.photo(null);true')
    browser.close()
mosaico()
if erros:
    falhas.append(f'erros na pagina: {erros[:3]}')
print(json.dumps({'passed': not falhas, 'falhas': falhas}, ensure_ascii=False))
sys.exit(1 if falhas else 0)
