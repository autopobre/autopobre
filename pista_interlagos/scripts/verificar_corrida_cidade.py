"""Fim de semana de corrida no Autódromo Floripa (teste/city-race.js) no navegador: as flâmulas nos postes, as faixas sobre
as ruas, a fan zone do Parque Náutico (telão, palco, food trucks, tendas, mesas, banheiros, gerador, torres de luz,
gradis), a da cabeceira da Hercílio Luz, as arquibancadas tubulares do grampo e do Estreito com torcida, o complexo da TV
(unidades móveis, uplink, cabos, grua), a ambulância, os bombeiros, a tenda dos comissários e o helicóptero da TV.

    python verificar_corrida_cidade.py [porta] [pasta das fotos] [--sem-fotos] [--sem-basico] [--sem-outro]

Abre ?circuito=floripa no Treino solo e confere as contagens do módulo (interlagos.sceneryInfo().extras.Corrida_na_cidade),
que os postes achados aqui são os que city-furniture.js levanta (mesma contagem, mesmo primeiro poste da volta), que a
torcida das arquibancadas entrou na multidão, o custo (chamadas de desenho e triângulos por quadro em três pontos da
volta) e que não há erro de página; fotografa a volta na câmera de perseguição, vistas baixas de cada coisa, vistas altas,
o helicóptero e a noite, e monta corrida_mosaico.jpg. Depois abre de novo no cenário Básico (menos coisas, sem erro) e
confere que um circuito sem cidade (o Minhocão) não monta nada disto e que raceTrafficBlocks() lá devolve [].
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, start_race

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8883'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
FOTOS = Path(args[1]) if len(args) > 1 else Path(__file__).resolve().parents[1] / 'renders/floripa_v2/previas/rodada_02/corrida'
FOTOS.mkdir(parents=True, exist_ok=True)
erros = []
fotos = []


def abrir(page, circuito):
    page.goto(URL + f'?circuito={circuito}', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Piloto teste')
    page.click('#start')
    if page.is_visible('#cars'):
        page.click('#carsNext')
    wait_js(page, "!document.querySelector('#soloRace').disabled")
    start_race(page, '#soloRace')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state?.paused', timeout=300000)
    page.evaluate('interlagos.skipIntro?.()')
    page.wait_for_timeout(4000)


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=2000):
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));}", s)
    camera(page, modo)
    page.wait_for_timeout(espera)


def vista(page, de, para, fov=55, espera=1800):
    """Câmera parada; de/para em coordenadas da pista, z acima do chão de cada ponto."""
    g = page.evaluate("p=>[interlagos.car.terrain(p[0][0],p[0][1]),interlagos.car.terrain(p[1][0],p[1][1])]", [de, para])
    page.evaluate("p=>interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true})",
                  {'de': [de[0], de[1], de[2] + g[0]], 'para': [para[0], para[1], para[2] + g[1]], 'fov': fov})
    page.wait_for_timeout(espera)


def info(page):
    return page.evaluate("()=>interlagos.sceneryInfo().extras?.Corrida_na_cidade??null")


def foto(page, nome):
    page.screenshot(path=str(FOTOS / f'{nome}.png'))
    fotos.append(nome)
    m = page.evaluate("()=>{const m=interlagos.sceneryInfo().extras?.Corrida_na_cidade;return {calls:interlagos.state?.drawCalls,shown:m?.shown,tris:m?.shownTriangles}}")
    print('foto', nome, json.dumps(m), flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(300000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text[:300]), print('console', m.type, m.text[:300], flush=True)) if m.type == 'error' else None)
    page.goto(URL + '?circuito=floripa', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.evaluate("interlagosGraficos.set({level:'alto',overrides:{}})")
    abrir(page, 'floripa')
    assert page.evaluate('interlagos.circuit') == 'floripa'
    st = info(page)
    print(json.dumps(st, ensure_ascii=False), flush=True)
    assert st and not st.get('error'), f'Corrida_na_cidade: {st}'
    for chave in ('poleBanners', 'banners', 'streetBanners', 'screens', 'trucks', 'tents', 'toilets', 'tables', 'generators', 'towers', 'flags',
                  'fencePanels', 'stringBulbs', 'stands', 'standRows', 'obTrucks', 'uplinks', 'ambulances', 'fireEngines', 'cranes', 'cables',
                  'crowdRows', 'people', 'helicopter', 'meshes', 'pools'):
        assert (st.get(chave) or 0) > 0, f'{chave} = {st.get(chave)}'
    assert st['screens'] >= 2 and st['stands'] >= 4 and st['trucks'] >= 4, st
    # Os postes das flâmulas são os do mobiliário (city-furniture.js): mesma conta e o mesmo primeiro poste da volta.
    mob = page.evaluate("()=>interlagos.sceneryInfo().extras?.Mobiliario_urbano??null")
    print('postes: mobiliário', mob['poles'], mob['lapPoles'], mob['where'].get('lapPole'), '· corrida', st['furniturePoles'], st['furnitureLapPoles'], st['where'].get('firstLapPole'), flush=True)
    assert st['furniturePoles'] == mob['poles'] and st['furnitureLapPoles'] == mob['lapPoles'], (st['furniturePoles'], mob['poles'])
    a, b = st['where']['firstLapPole'], mob['where']['lapPole']
    assert abs(a[0] - b[0]) < .01 and abs(a[1] - b[1]) < .01, (a, b)
    # A torcida das arquibancadas e da fan zone entrou na multidão do circuito.
    fans = page.evaluate("()=>interlagos.sceneryInfo().fans")
    print('torcedores no circuito', fans, '· fileiras daqui', st['crowdFans'], flush=True)
    assert fans and st['crowdFans'] >= st['standRows'] + st['crowdRows']
    # raceTrafficBlocks: puro e o mesmo a cada chamada (city-traffic.js corta as faixas ali).
    bloqueios = page.evaluate("async()=>{const m=await import('./city-race.js');const d=interlagos.car.data,a=m.raceTrafficBlocks(d,null),b=m.raceTrafficBlocks(d,null);return {n:a.length,same:JSON.stringify(a)===JSON.stringify(b),ok:a.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)&&q.r>0)}}")
    print('raceTrafficBlocks (sem mapa)', bloqueios, '· com o mapa no jogo', st['trafficBlocks'], flush=True)
    assert bloqueios['same'] and bloqueios['ok'], bloqueios
    w = st['where']
    if '--sem-fotos' not in sys.argv:
        # Da pista, na câmera de perseguição: flâmulas, a fan zone ao fundo, as arquibancadas, a grua.
        for s in (380, 880, 925, 1120, 1440, 1480, 3470, 3530):
            em(page, s)
            foto(page, f'volta_{s:04d}')
        # De perto, de onde se anda.
        vista(page, [352, -12, 1.7], [338, -55, 4], 60)
        foto(page, 'fanzone_da_avenida')
        vista(page, [346, -35, 2], [338, -62, 6], 55)
        foto(page, 'fanzone_telao')
        vista(page, [338, -35, 1.7], [351.5, -38.5, 2.4], 55)
        foto(page, 'fanzone_food_trucks')
        vista(page, [318, -26, 1.7], [330, -42, 1.5], 60)
        foto(page, 'fanzone_mesas')
        vista(page, [325, 0, 1.8], [322, -16, 2], 60)
        foto(page, 'fanzone_entrada')
        if 'lapBanner' in w:
            x, y, h = w['lapBanner'][:3]
            g = page.evaluate("p=>interlagos.car.terrain(p[0],p[1])", [x, y])
            import math
            vx, vy = -math.sin(h), math.cos(h)
            page.evaluate("p=>interlagosLuz.photo({from:p[0],at:p[1],fov:50,world:true})", [[x + vx * 6 + math.cos(h) * 4, y + vy * 6 + math.sin(h) * 4, g + 2.5], [x, y, g + 3.9]])
            page.wait_for_timeout(1800)
            foto(page, 'flamulas_poste_da_volta')
        if 'banner' in w:
            x, y, h = w['banner'][:3]
            g = page.evaluate("p=>interlagos.car.terrain(p[0],p[1])", [x, y])
            import math
            page.evaluate("p=>interlagosLuz.photo({from:p[0],at:p[1],fov:50,world:true})", [[x - math.sin(h) * 7 + math.cos(h) * 2, y + math.cos(h) * 7 + math.sin(h) * 2, g + 2.2], [x, y, g + 3.9]])
            page.wait_for_timeout(1800)
            foto(page, 'flamulas_rua')
        if 'streetBanner' in w:
            x, y, dx, dy = w['streetBanner'][:4]
            import math
            l = math.hypot(dx, dy)
            g = page.evaluate("p=>interlagos.car.terrain(p[0],p[1])", [x, y])
            page.evaluate("p=>interlagosLuz.photo({from:p[0],at:p[1],fov:55,world:true})", [[x - dy / l * 16, y + dx / l * 16, g + 1.8], [x, y, g + 5.6]])
            page.wait_for_timeout(1800)
            foto(page, 'faixa_sobre_a_rua')
        vista(page, [870, -150, 2.5], [838, -160, 3], 55)
        foto(page, 'grampo_arquibancadas_e_grua')
        vista(page, [760, -150, 3], [772, -185, 2], 60)
        foto(page, 'grampo_tv')
        vista(page, [815, -192, 2], [800, -215, 1.5], 60)
        foto(page, 'grampo_resgate_bombeiros')
        vista(page, [-958, -30, 2], [-935, -45, 3.5], 55)
        foto(page, 'estreito_arquibancada')
        vista(page, [255, 262, 1.8], [232, 245, 2], 60)
        foto(page, 'cabeceira_hercilio_luz')
        # Do alto.
        vista(page, [400, 40, 60], [335, -45, 0], 55)
        foto(page, 'alto_parque_nautico')
        vista(page, [900, -110, 45], [800, -185, 0], 55)
        foto(page, 'alto_grampo')
        vista(page, [-1010, -30, 40], [-920, 20, 0], 55)
        foto(page, 'alto_estreito')
        # (o helicóptero anda ~25 m/s: a câmera vai onde ele está, sem esperar)
        page.evaluate("()=>{const h=interlagos.sceneryInfo().extras.Corrida_na_cidade.helicopterAt;interlagosLuz.photo({from:[h[0]+22,h[1]+18,h[2]+6],at:h,fov:55,world:true});}")
        page.wait_for_timeout(60)
        foto(page, 'helicoptero')
        # A noite: telão, cordões de luz, torres, food trucks, o farol do helicóptero.
        page.evaluate("interlagosClima.set({time:'noite'})")
        wait_js(page, '!window.interlagosClima.info().compiling', timeout=120000)
        page.wait_for_timeout(2000)
        vista(page, [352, -12, 2.5], [338, -55, 5], 60)
        foto(page, 'noite_fanzone')
        vista(page, [346, -35, 2], [338, -62, 6], 55)
        foto(page, 'noite_telao')
        em(page, 900)
        foto(page, 'noite_volta_0900')
        em(page, 1460)
        foto(page, 'noite_volta_1460')
        page.evaluate("interlagosClima.set({time:'dia'})")
        wait_js(page, '!window.interlagosClima.info().compiling', timeout=120000)
    # O custo por quadro (perf-probe.js): chamadas de desenho e triângulos deste módulo em todos os passes.
    for s in (900, 1460, 3500):
        em(page, s, espera=1500)
        custo = page.evaluate("async()=>{const c=await interlagosGraficos.cost(12);return c.parts['Corrida_na_cidade']??null}")
        print('custo', s, json.dumps(custo, ensure_ascii=False), flush=True)
        assert custo and custo['calls'] <= 30, custo
    if '--sem-basico' not in sys.argv:
        # O cenário Básico (PCs fracos): menos coisas, nada quebra.
        page.evaluate("interlagosGraficos.set({level:'alto',overrides:{scenery:'basico'}})")
        abrir(page, 'floripa')
        leve = info(page)
        print('básico', json.dumps({k: leve.get(k) for k in ('lean', 'poleBanners', 'streetBanners', 'people', 'fencePanels', 'meshes', 'triangles', 'error')}), flush=True)
        assert leve and not leve.get('error') and leve.get('lean') and leve['poleBanners'] < st['poleBanners'] and leve['triangles'] < st['triangles'], leve
        if '--sem-fotos' not in sys.argv:
            em(page, 920)
            foto(page, 'basico_volta_0920')
        page.evaluate("interlagosGraficos.set({level:'alto',overrides:{}})")
    # Um circuito de rua sem data.scenery.city (o Minhocão): nada deste módulo.
    if '--sem-outro' not in sys.argv:
        abrir(page, 'minhocao')
        extras = page.evaluate("()=>Object.keys(interlagos.sceneryInfo().extras??{})")
        vazio = page.evaluate("async()=>{const m=await import('./city-race.js');return m.raceTrafficBlocks(interlagos.car.data,null).length}")
        print('Minhocão extras', extras, 'bloqueios', vazio, flush=True)
        assert 'Corrida_na_cidade' not in extras and vazio == 0, extras
    browser.close()
if fotos:
    try:
        from PIL import Image
        w, h, cols = 640, 360, 4
        imgs = [Image.open(FOTOS / f'{n}.png').convert('RGB').resize((w, h)) for n in fotos]
        M = Image.new('RGB', (w * cols, h * ((len(imgs) + cols - 1) // cols)))
        for k, im in enumerate(imgs):
            M.paste(im, ((k % cols) * w, (k // cols) * h))
        M.save(FOTOS / 'corrida_mosaico.jpg', quality=85)
        print('mosaico', FOTOS / 'corrida_mosaico.jpg', flush=True)
    except ImportError:
        print('sem Pillow: mosaico não montado', flush=True)
assert not erros, erros
print(json.dumps({'passed': True, 'stats': {k: st[k] for k in ('poleBanners', 'banners', 'streetBanners', 'screens', 'trucks', 'stands', 'standRows', 'people', 'meshes', 'triangles', 'trafficBlocks')}}, ensure_ascii=False))
