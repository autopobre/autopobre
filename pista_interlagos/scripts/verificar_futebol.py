"""Futebol no gramado do Mineirão, estilo Rocket League (teste/pampulha-futebol.js; pedido da equipe, 2026-10-19): a bola
gigante, a bolinha, os dois golzões, o placar no telão e na tela, no jogo de verdade, e fotos.

    python verificar_futebol.py [porta] [pasta das fotos]

Abre ?circuito=pampulha no Treino solo e confere o módulo (interlagos.futebolInfo(): as duas bolas no gramado, os sólidos
das traves entregues ao passeio, poucas chamadas de desenho). Põe o Opala no gramado atrás da bola gigante e um atacante
automático (só deste teste, no lugar dos comandos do jogador: a física de verdade) dá a volta por trás da bola e empurra
até o gol laranja: a bola anda, o placar muda para AZUL 1 × 0, a faixa GOOOL! e o confete aparecem, e a bola volta para
o meio. Depois o piloto desce (F), a bolinha na frente dele: os botões Chutar e Passe aparecem; E segurado enche a barra
de força e o chute sai forte; um toque no R é um passe rasteiro; andando e correndo ele conduz a bola sozinho (ela fica
na frente dele); encosta na bola gigante e empurra. Fotografa a bola com o carro atrás, a batida, a bola no ar, o gol
(faixa e confete), o telão, os gols de perto, o estádio do alto, o piloto e a bolinha de lado (o tamanho), o chute
carregando, a condução e a noite. Monta futebol_mosaico.jpg. Fotos JPG em renders/pampulha/previas/futebol/rodada_02
(ou na pasta dada).
"""
import json
import math
import sys
from pathlib import Path

import browser_config  # noqa: F401  (headless e trava do ponteiro na página, antes de qualquer página)
from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, start_race

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8799'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'pampulha' / 'previas' / 'futebol' / 'rodada_02'
FOTOS.mkdir(parents=True, exist_ok=True)
erros = []
falhas = []
tiradas = []


def foto(page, nome):
    caminho = FOTOS / f'futebol_{nome}.jpg'
    page.screenshot(path=str(caminho), type='jpeg', quality=86)
    tiradas.append(caminho)
    print('foto', caminho.name, flush=True)


def mosaico():
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return
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
        desenho.text((x + 6, y + 5), caminho.stem.replace('futebol_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'futebol_mosaico.jpg'
    tela.save(destino, quality=86)
    print('mosaico', destino, flush=True)


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def vista(page, de, para, fov=50, espera=1600):
    page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});true}", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


def sem_vista(page):
    page.evaluate("interlagosLuz.photo(null);true")


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
    page.evaluate('interlagos.skipIntro?.();true')
    page.wait_for_timeout(4500)


# Pontos no referencial do campo (u ao longo do gramado, para o gol laranja; v para o túnel; z sobre o gramado).
CAMPO = r"""(()=>{const f=interlagos.futebol(),b=f.game.bowl;window.__campo={
 xy:(u,v)=>b.world(u,v),p:(u,v,z)=>{const [x,y]=b.world(u,v);return [x,y,b.pitchZ+z];},uv:(x,y)=>b.local(x,y),
 heading:(du,dv)=>Math.atan2(b.U[1]*du+b.V[1]*dv,b.U[0]*du+b.V[0]*dv)};return true;})()"""

# O atacante automático (só deste teste): por trás da bola na linha do gol, depois através dela.
ATACANTE = r"""(gol)=>{
 const car=interlagos.car,f=interlagos.futebol(),G=f.game,b=G.bowl,wrapA=x=>Math.atan2(Math.sin(x),Math.cos(x)),step=car.step.bind(car);
 const goal=b.world(gol*52.5,0);let auto={on:true,steps:0,hits:0,mode:''};
 car.step=(cmd,dt)=>{if(!auto.on)return step(cmd,dt);auto.steps++;
  const ball=G.giant,bx=ball.p[0],by=ball.p[1],gx=goal[0]-bx,gy=goal[1]-by,gl=Math.hypot(gx,gy)||1,ux=gx/gl,uy=gy/gl;
  const rx=car.x-bx,ry=car.y-by,along=rx*ux+ry*uy,side=-rx*uy+ry*ux;let tx,ty,v;
  if(along<-ball.r-1&&Math.abs(side)<1.4){tx=bx+ux*3;ty=by+uy*3;v=11;auto.mode='chute';}
  else{const back=ball.r+7,sx=bx-ux*back,sy=by-uy*back;
   // (around the ball, not through it: a waypoint off its side when the car is ahead of it)
   if(along>-ball.r){const s=side>=0?1:-1;tx=bx-uy*s*(ball.r+5)-ux*2;ty=by+ux*s*(ball.r+5)-uy*2;}else{tx=sx;ty=sy;}v=8;auto.mode='volta';}
  const sp=Math.hypot(car.vx,car.vy),al=wrapA(Math.atan2(ty-car.y,tx-car.x)-car.heading),st=Math.max(-1,Math.min(1,al*2));
  const want=Math.abs(al)>1.2?3.5:v;
  return step({left:Math.max(0,st),right:Math.max(0,-st),throttle:sp<want?Math.min(1,(want-sp)*.5):0,brake:sp>want+1?.6:0,reverse:0,handbrake:0},dt);};
 window.__atacante={off(){auto.on=false;},state(){return {mode:auto.mode,steps:auto.steps,x:car.x,y:car.y,speed:Math.hypot(car.vx,car.vy)};}};return true;}"""


def info(page):
    return page.evaluate('interlagos.futebolInfo()')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text), print('console', m.type, m.text[:400], flush=True)) if m.type == 'error' else None)
    abrir(page, 'pampulha')
    est = page.evaluate("()=>({circuit:interlagos.circuit,extra:interlagos.sceneryInfo().extras?.Futebol_Mineirao??null,info:interlagos.futebolInfo()})")
    print(json.dumps(est, ensure_ascii=False)[:1500], flush=True)
    if not est['extra'] or not est['info']:
        falhas.append(('futebol não montado', est))
    else:
        if est['info']['roamSolids'] < 10:
            falhas.append(('traves fora do passeio', est['info']['roamSolids']))
        if est['extra']['drawCalls'] > 22:
            falhas.append(('chamadas de desenho do futebol', est['extra']['drawCalls']))
        if [b['kind'] for b in est['info']['balls']] != ['gigante', 'bolinha']:
            falhas.append(('bolas', est['info']['balls']))
    page.evaluate(CAMPO)

    # 1. O Opala no gramado, atrás da bola gigante, de frente para o gol laranja.
    page.evaluate("()=>{const [x,y]=__campo.xy(-26,-3);interlagos.car.relocate(x,y,NaN,__campo.heading(1,0));true}")
    camera(page, 'chase')
    page.wait_for_timeout(2500)
    foto(page, 'bola_gigante_e_o_opala')
    hud = page.evaluate("()=>({hud:!document.getElementById('futebolHud').hidden,dica:document.getElementById('futebolDica').textContent})")
    print('painel:', hud, flush=True)
    if not hud['hud']:
        falhas.append(('placar não aparece no gramado', hud))

    # 2. O atacante empurra a bola até o gol laranja (+U): batida, bola no ar, gol.
    page.evaluate(ATACANTE, 1)
    antes = info(page)['balls'][0]['p']
    batida = no_ar = gol = None
    t = 0
    while t < 70000:
        i = info(page)
        g = i['balls'][0]
        if batida is None and g['speed'] > 3:
            batida = t
            page.wait_for_timeout(120)
            foto(page, 'batida')
        elif batida is not None and no_ar is None and t - batida > 500:
            no_ar = t
            foto(page, 'bola_rolando')
        if i['score'][0] >= 1:
            gol = t
            page.wait_for_timeout(450)
            foto(page, 'gol_faixa_e_confete')
            break
        page.wait_for_timeout(150)
        t += 150
    st = page.evaluate('__atacante.state()')
    page.evaluate('__atacante.off()')
    i = info(page)
    print('ataque:', st, json.dumps(i, ensure_ascii=False)[:600], flush=True)
    if batida is None:
        falhas.append(('o carro não moveu a bola gigante', i['balls'][0]))
    if gol is None:
        falhas.append(('nenhum gol em 70 s de ataque', i['score'], st))
    else:
        banner = page.evaluate("()=>({on:!document.getElementById('golBanner').hidden,texto:document.getElementById('golBanner').innerText})")
        print('faixa:', banner, flush=True)
        if not banner['on'] or 'GOOOL' not in banner['texto']:
            falhas.append(('faixa do gol', banner))
        if not i['confetti']:
            falhas.append(('sem confete', i['confetti']))
        # O telão atrás do gol que levou, de perto, e o estádio do alto com o confete.
        vista(page, page.evaluate("__campo.p(64,-26,12)"), page.evaluate("__campo.p(112,0,19)"), fov=38, espera=700)
        foto(page, 'telao_gol')
        vista(page, page.evaluate("__campo.p(20,-48,22)"), page.evaluate("__campo.p(52,0,4)"), fov=46, espera=600)
        foto(page, 'gol_do_alto')
        page.wait_for_timeout(4200)
        i = info(page)
        u, v = page.evaluate("p=>__campo.uv(p[0],p[1])", i['balls'][0]['p'])
        print('depois do gol, a bola em', round(u, 2), round(v, 2), i['balls'][0]['state'], flush=True)
        if math.hypot(u, v) > 9 or i['balls'][0]['state'] != 'play':
            falhas.append(('a bola não voltou ao meio', u, v, i['balls'][0]))
        vista(page, page.evaluate("__campo.p(84,0,24)"), page.evaluate("__campo.p(116,0,19)"), fov=44, espera=900)
        foto(page, 'telao_placar')
    # Os gols de perto e o estádio inteiro.
    vista(page, page.evaluate("__campo.p(30,-22,4)"), page.evaluate("__campo.p(54,0,4)"), fov=50)
    foto(page, 'gol_laranja')
    vista(page, page.evaluate("__campo.p(-30,22,4)"), page.evaluate("__campo.p(-54,0,4)"), fov=50)
    foto(page, 'gol_azul')
    vista(page, page.evaluate("__campo.p(-6,-44,24)"), page.evaluate("__campo.p(0,4,0)"), fov=74)
    foto(page, 'estadio_do_alto')
    # A bola gigante de perto (os gomos, as costuras, a sujeira).
    bola = info(page)['balls'][0]['p']
    vista(page, page.evaluate("p=>{const [u,v]=__campo.uv(p[0],p[1]);return __campo.p(u-5,v-4,2.6);}", bola), [bola[0], bola[1], bola[2]], fov=48)
    foto(page, 'bola_de_perto')
    sem_vista(page)

    # 3. A pé: F para descer, a bolinha na frente dele. Segurando E a barra enche e o chute sai forte; R é o passe rasteiro;
    # andando e correndo ele conduz a bola sozinho; encosta na gigante e empurra.
    page.evaluate("()=>{const [x,y]=__campo.xy(-20,25);interlagos.car.relocate(x,y,NaN,__campo.heading(1,0));interlagos.car.vx=interlagos.car.vy=0;true}")
    page.wait_for_timeout(800)
    page.keyboard.press('KeyF')
    wait_js(page, 'interlagos.walkInfo()?.active', timeout=20000)
    page.wait_for_timeout(1200)
    # Longe da porta do carro (ali o E é da porta), virado para o gol laranja.
    PARA = "(a)=>{const w=interlagos.walker(),[x,y]=__campo.xy(a[0],a[1]),z=interlagos.futebol().game.bowl.floorAt(x,y);w.hero.position.set(x,z,-y);w.hero.rotation.y=__campo.heading(1,0);w.foot.floor=z;w.foot.lift=0;w.foot.yaw=__campo.heading(1,0);w.motion={x,y,vx:0,vy:0};interlagos.futebol().game.control=null;true}"
    page.evaluate(PARA, [-6, 16])
    page.wait_for_timeout(600)
    POR = r"""(a)=>{const w=interlagos.walker(),G=interlagos.futebol().game,b=G.bowl,s=a.qual==='gigante'?G.giant:G.small,h=w.hero.position,yaw=w.foot.yaw;
     const d=a.longe+s.r;s.p[0]=h.x+Math.cos(yaw)*d;s.p[1]=-h.z+Math.sin(yaw)*d;s.p[2]=b.floorAt(s.p[0],s.p[1])+s.r;s.v.fill(0);s.w.fill(0);s.asleep=false;s.state='play';s.spawn=1;true}"""
    page.evaluate(POR, {'qual': 'bolinha', 'longe': .42})
    page.wait_for_timeout(400)
    pode = page.evaluate('interlagos.walkInfo().canKick')
    botoes = page.evaluate("()=>({on:!document.getElementById('walkBall').hidden,chute:document.getElementById('walkKick').textContent,passe:document.getElementById('walkPass').textContent})")
    print('a pé: pode chutar', pode, 'botões', botoes, flush=True)
    if not pode or not botoes['on'] or 'Chutar' not in botoes['chute'] or 'Passe' not in botoes['passe']:
        falhas.append(('a pé: chutar e passe não aparecem', pode, botoes))
    foto(page, 'a_pe_bolinha')
    # O tamanho: de lado, o piloto (1,78 m) e a bolinha (22 cm) no pé dele.
    pe = page.evaluate("()=>{const h=interlagos.walker().hero.position;return [h.x,-h.z,h.y];}")
    vista(page, page.evaluate("p=>{const [u,v]=__campo.uv(p[0],p[1]);return __campo.p(u+.2,v-3.2,1);}", pe), [pe[0], pe[1], pe[2] + .8], fov=40, espera=900)
    foto(page, 'escala_piloto_e_bolinha')
    sem_vista(page)
    page.wait_for_timeout(500)
    # Chute segurado ~0,8 s: a barra enche.
    page.keyboard.down('KeyE')
    page.wait_for_timeout(750)
    barra = page.evaluate("()=>({on:!document.getElementById('walkPower').hidden,w:document.querySelector('#walkPower i').style.width,rotulo:document.getElementById('walkPowerLabel').textContent})")
    foto(page, 'a_pe_carregando_o_chute')
    page.keyboard.up('KeyE')
    page.wait_for_timeout(130)
    foto(page, 'a_pe_chute')
    page.wait_for_timeout(500)
    k = page.evaluate('interlagos.walkInfo().lastKick')
    print('barra:', barra, 'chute:', k, flush=True)
    if not barra['on'] or barra['rotulo'] != 'CHUTE' or not barra['w'] or float(barra['w'].rstrip('%')) < 45:
        falhas.append(('barra de força', barra))
    if not k or k['kind'] != 'chute' or k['speed'] < 18:
        falhas.append(('o chute segurado não saiu forte', k))
    foto(page, 'a_pe_bolinha_voando')
    # Passe: um toque no R, rasteiro.
    page.evaluate(PARA, [-6, 16])
    page.evaluate(POR, {'qual': 'bolinha', 'longe': .42})
    page.wait_for_timeout(400)
    page.keyboard.press('KeyR')
    page.wait_for_timeout(700)
    k = page.evaluate('interlagos.walkInfo().lastKick')
    s = info(page)['balls'][1]
    print('passe:', k, 'altura', round(s['p'][2] - page.evaluate("__campo.p(0,0,0)")[2], 3), flush=True)
    if not k or k['kind'] != 'passe' or not 4 < k['speed'] < 10 or s['p'][2] - page.evaluate("__campo.p(0,0,0)")[2] > .25:
        falhas.append(('passe rasteiro', k, s))
    # Conduzindo: a bolinha na frente, W por 2,5 s andando e depois correndo (Shift).
    page.evaluate(PARA, [-30, -30])
    page.evaluate(POR, {'qual': 'bolinha', 'longe': .5})
    p0 = info(page)['balls'][1]['p']
    page.keyboard.down('KeyW')
    page.wait_for_timeout(1500)
    foto(page, 'a_pe_conduzindo')
    page.keyboard.down('ShiftLeft')
    page.wait_for_timeout(1500)
    foto(page, 'a_pe_conduzindo_correndo')
    i = info(page)
    perto = page.evaluate("()=>{const h=interlagos.walker().hero.position,b=interlagos.futebol().game.small.p;return Math.hypot(b[0]-h.x,b[1]+h.z);}")
    page.keyboard.up('ShiftLeft')
    page.keyboard.up('KeyW')
    p1 = i['balls'][1]['p']
    andou = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    print('conduziu', round(andou, 2), 'm, com ele:', i['dribbling'], 'a', round(perto, 2), 'm, toques', i['touches'], flush=True)
    if andou < 10 or not i['dribbling'] or perto > 1.8:
        falhas.append(('não conduziu a bolinha', andou, i['dribbling'], perto))
    page.wait_for_timeout(1500)
    foto(page, 'a_pe_parado_com_a_bola')
    # Empurrando a gigante.
    page.evaluate(PARA, [-30, 30])
    page.evaluate(POR, {'qual': 'gigante', 'longe': .45})
    q0 = info(page)['balls'][0]['p']
    page.keyboard.down('KeyW')
    page.wait_for_timeout(2500)
    foto(page, 'a_pe_empurrando_a_gigante')
    page.keyboard.up('KeyW')
    q1 = info(page)['balls'][0]['p']
    empurrou = math.hypot(q1[0] - q0[0], q1[1] - q0[1])
    print('empurrou', round(empurrou, 2), 'm', flush=True)
    if empurrou < 1.5:
        falhas.append(('não empurrou a bola gigante', empurrou))
    page.wait_for_timeout(1500)

    # 4. À noite: as traves acesas, o telão, o gramado iluminado.
    page.evaluate("interlagosClima.set({time:'noite'});true")
    page.wait_for_timeout(2500)
    vista(page, page.evaluate("__campo.p(0,-48,14)"), page.evaluate("__campo.p(40,0,3)"), fov=64, espera=2500)
    foto(page, 'noite')
    vista(page, page.evaluate("__campo.p(28,-16,3)"), page.evaluate("__campo.p(54,0,4)"), fov=52, espera=1500)
    foto(page, 'noite_gol_laranja')
    sem_vista(page)

    browser.close()

mosaico()
if erros:
    falhas.append(('erros na página', erros[:6]))
for f in falhas:
    print('FALHA', f, flush=True)
print('OK' if not falhas else f'{len(falhas)} falha(s)', flush=True)
sys.exit(1 if falhas else 0)
