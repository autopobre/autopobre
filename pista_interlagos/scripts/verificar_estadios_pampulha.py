"""Mineirão e Mineirinho no Circuito da Pampulha: pampulha-estadios.js montado, sem erros, o carro entrando no estádio
pelo túnel, e fotos.

    python verificar_estadios_pampulha.py [porta] [pasta das fotos] [--sem-celular] [--sem-noite] [--sem-passeio] [--so=a,b]

Abre ?circuito=pampulha no Treino solo e confere o módulo (sceneryInfo().extras.Marcos_Pampulha_Estadios): os dois
estádios montados, nenhum vértice no espaço de rodagem da volta (nem na faixa dos boxes), o arco na abertura do muro, a
placa antes dela e o bloqueio na cerca da zona montados, os sólidos do passeio entregues (physics.js addRoamSolids:
pés dos pórticos, pilares do portal, traves), poucas chamadas de desenho; o detalhe de celular com menos triângulos.
Depois um piloto automático (no lugar dos comandos do jogador, na própria página: a física de verdade) leva o Opala da
reta pela abertura no muro, pela esplanada até o portal, pelo túnel e pelo corte até o gramado, dá uma volta no
gramado e sai pelo mesmo caminho de volta à pista: sem bater em nada (nenhuma parede invisível no caminho), sempre
na zona do passeio ou na volta, nunca dentro do sólido do estádio (debaixo da arquibancada), sem cair pelo chão.
Fotografa a largada (perseguição e cockpit), a reta com o estádio, o arco na abertura, o portal, dentro do túnel, a
saída para o gramado, o carro no gramado, as avenidas em volta, o Mineirinho, a lagoa, do alto, e à noite. Monta
estadios_mosaico.jpg. Fotos JPG em renders/pampulha/previas/rodada_01b/estadios (ou na pasta dada).
"""
import json
import math
import sys
from pathlib import Path

import browser_config  # noqa: F401  (headless e trava do ponteiro na página, antes de qualquer página)
from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORTA = args[0] if args else '8799'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
RAIZ = Path(__file__).resolve().parents[2]
FOTOS = Path(args[1]) if len(args) > 1 else RAIZ / 'pista_interlagos' / 'renders' / 'pampulha' / 'previas' / 'rodada_01b' / 'estadios'
FOTOS.mkdir(parents=True, exist_ok=True)
SO = next((a.split('=', 1)[1].split(',') for a in sys.argv[1:] if a.startswith('--so=')), None)
DADOS = json.loads((RAIZ / 'pista_interlagos' / 'dados' / 'pista_pampulha.json').read_text(encoding='utf-8'))
A = DADOS['samples']
L = DADOS['meta']['reconstructed_xy_m']
MARCOS = {m['kind']: m for m in DADOS['scenery'].get('landmarks', [])}
TER = DADOS['terrain']
MI = MARCOS['mineirao']
ST = MI.get('stadium') or {}
C = ST.get('centre') or [877.5, -1612.5]
ZP = MI['ground']
TUN = ST.get('tunnel') or {'heading': math.radians(169), 'width': 10, 'height': 5.2}
TC, TS = math.cos(TUN['heading']), math.sin(TUN['heading'])
ZONA = next((z for z in (DADOS['meta'].get('roam') or {}).get('zones', []) if z['name'] == 'mineirao'), None)
erros = []
falhas = []
tiradas = []


def tf(a, b, z=0):
    """Do referencial do túnel (a do centro para o portal, b para a esquerda dele, z sobre o gramado) para a pista."""
    return [C[0] + TC * a - TS * b, C[1] + TS * a + TC * b, ZP + z]


def ao_longo(semi):
    du = TC * math.cos(ST.get('heading', math.radians(79))) + TS * math.sin(ST.get('heading', math.radians(79)))
    dv = -TC * math.sin(ST.get('heading', math.radians(79))) + TS * math.cos(ST.get('heading', math.radians(79)))
    return 1 / math.hypot(du / semi[0], dv / semi[1])


A_PORTAL = ao_longo(ST.get('facade_semi', [130, 100]))
A_PISO = ao_longo(ST.get('floor_semi', [83, 53.5]))


def estacao(s):
    s %= L
    i = max(k for k, p in enumerate(A) if p[0] <= s)
    p, q = A[i], A[(i + 1) % len(A)]
    vao = (q[0] if i + 1 < len(A) else L) - p[0]
    u = (s - p[0]) / vao if vao > 0 else 0
    v = [a + (b - a) * u for a, b in zip(p, q)]
    t = math.hypot(v[7], v[8]) or 1
    n = math.hypot(v[9], v[10]) or 1
    return {'s': s, 'x': v[1], 'y': v[2], 'z': v[3], 'w': v[4], 't': (v[7] / t, v[8] / t), 'n': (v[9] / n, v[10] / n)}


def secao(nome, padrao):
    for s, n in DADOS['meta'].get('sections', []):
        if nome.lower() in n.lower():
            return s
    return padrao


def chao(x, y):
    fx = min(max((x - TER['x0']) / TER['step'], 0), TER['nx'] - 1.001)
    fy = min(max((y - TER['y0']) / TER['step'], 0), TER['ny'] - 1.001)
    i, j = int(fx), int(fy)
    u, v = fx - i, fy - j
    z, nx = TER['z'], TER['nx']
    k = j * nx + i
    return (z[k] * (1 - u) + z[k + 1] * u) * (1 - v) + (z[k + nx] * (1 - u) + z[k + nx + 1] * u) * v


def perto(x, y, s0, s1, passo=4):
    return min((estacao(s) for s in range(int(s0), int(s1), passo)), key=lambda e: math.hypot(e['x'] - x, e['y'] - y))


def da_rua(e, alvo, alto=1.8, longe=False):
    dx, dy = alvo[0] - e['x'], alvo[1] - e['y']
    lado = (e['w'] / 2 - 1.5) * (1 if dx * e['n'][0] + dy * e['n'][1] > 0 else -1) * (-1 if longe else 1)
    return [e['x'] + e['n'][0] * lado, e['y'] + e['n'][1] * lado, e['z'] + alto]


def do_outro_lado_da_lagoa(alvo):
    nivel = DADOS['meta'].get('sea_level_m', .8)
    melhor = None
    for s in range(600, int(L) - 3000, 25):
        e = estacao(s)
        d = math.hypot(alvo[0] - e['x'], alvo[1] - e['y'])
        if not 600 < d < 1600:
            continue
        agua = sum(chao(e['x'] + (alvo[0] - e['x']) * k / 40, e['y'] + (alvo[1] - e['y']) * k / 40) < nivel for k in range(1, 40)) / 39
        nota = agua - abs(d - 1000) / 3000
        if melhor is None or nota > melhor[0]:
            melhor = (nota, e, agua, d)
    return melhor


def sobre_a_lagoa(e, alvo):
    nivel = DADOS['meta'].get('sea_level_m', .8)
    d = math.hypot(alvo[0] - e['x'], alvo[1] - e['y'])
    for k in range(4, 80):
        f = k / 100
        x, y = e['x'] + (alvo[0] - e['x']) * f, e['y'] + (alvo[1] - e['y']) * f
        if all(chao(x + (alvo[0] - e['x']) * m / d, y + (alvo[1] - e['y']) * m / d) < nivel - .3 for m in range(0, 41, 5)):
            return [x, y, nivel + 2.2]
    return [e['x'], e['y'], e['z'] + 2.5]


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def em(page, s, modo='chase', espera=2200):
    page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));true}", s)
    camera(page, modo)
    page.wait_for_timeout(espera)


def vista(page, de, para, fov=50, espera=1800, carro=None):
    if carro is not None:
        page.evaluate("s=>{interlagosLuz.photo(null);const c=interlagos.car,i=c.a.findIndex(p=>p[0]>=s);interlagos.reposition(Math.max(0,i));true}", carro)
        page.wait_for_timeout(400)
    page.evaluate("p=>{interlagosLuz.photo({from:p.de,at:p.para,fov:p.fov,world:true});true}", {'de': de, 'para': para, 'fov': fov})
    page.wait_for_timeout(espera)


def foto(page, nome):
    caminho = FOTOS / f'estadios_{nome}.jpg'
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
        desenho.text((x + 6, y + 5), caminho.stem.replace('estadios_', ''), fill=(235, 235, 235))
    destino = FOTOS / 'estadios_mosaico.jpg'
    tela.save(destino, quality=86)
    print('mosaico', destino, flush=True)


def abrir(page, circuito):
    page.goto(URL + f'?circuito={circuito}', wait_until='domcontentloaded')
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


def quero(nome):
    return SO is None or any(nome.startswith(k) for k in SO)


# O piloto automático (no lugar dos comandos do jogador): um caminho por uma grade de 2 m no chão aberto da zona,
# longe das bordas, dos sólidos e das árvores (busca em largura entre os pontos dados), seguido mirando 6 m adiante.
# Conta as batidas, a zona, os saltos de altura, as rodas no ar e se o centro do carro entrou no sólido do estádio.
PILOTO = r"""async(arg)=>{
 const P=await import('./physics.js'),car=interlagos.car,data=car.data,w=P.roamWorld(data),z=w.zones.find(q=>q.name==='mineirao'),a=data.samples;
 const wrapA=x=>Math.atan2(Math.sin(x),Math.cos(x)),S=2,nx=Math.ceil((z.x1-z.x0)/S),ny=Math.ceil((z.y1-z.y0)/S),free=new Uint8Array(nx*ny),xy=k=>[z.x0+(k%nx+.5)*S,z.y0+(Math.floor(k/nx)+.5)*S];
 // (A box's distance from its outline, not its corners: the giant goals' nets are 23 m long; pampulha-futebol.js.)
 const quad=(it,x,y)=>{let inside=true,best=1e9;for(let k=0;k<4;k++){const k1=(k+1)&3,ax=it.xs[k],ay=it.ys[k],dx=it.xs[k1]-ax,dy=it.ys[k1]-ay,u=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));best=Math.min(best,Math.hypot(ax+dx*u-x,ay+dy*u-y));if(dx*(y-ay)-dy*(x-ax)<0)inside=false;}return inside?0:best;};
 const clear=(x,y)=>(car.posts?.near(x,y,4)??[]).every(t=>Math.hypot(t.x-x,t.y-y)>t.r+3.2)&&w.query(x,y,5).every(it=>it.t===1?quad(it,x,y)>3.4:it.t===2?Math.hypot(it.x-x,it.y-y)>it.r+2.2:true);
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=z.x0+(i+.5)*S,y=z.y0+(j+.5)*S;if(w.inside(z,x,y)&&!w.edge(x,y,2.5,z,w.query(x,y,2.5))&&clear(x,y))free[j*nx+i]=1;}
 const cellOf=([x,y])=>{let best=-1,d=1e9;const i0=Math.floor((x-z.x0)/S),j0=Math.floor((y-z.y0)/S);for(let j=j0-8;j<=j0+8;j++)for(let i=i0-8;i<=i0+8;i++){if(i<0||j<0||i>=nx||j>=ny)continue;const k=j*nx+i;if(!free[k])continue;const c=xy(k),e=Math.hypot(c[0]-x,c[1]-y);if(e<d){d=e;best=k;}}return best;};
 const bfs=(from,to)=>{const k0=cellOf(from),k1=cellOf(to);if(k0<0||k1<0)return null;const prev=new Int32Array(free.length).fill(-2),q=[k0];prev[k0]=-1;
  for(let h=0;h<q.length&&prev[k1]===-2;h++){const k=q[h],i=k%nx,j=Math.floor(k/nx);for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const u=i+di,v=j+dj;if(u<0||v<0||u>=nx||v>=ny)continue;const m=v*nx+u;if(!free[m]||prev[m]!==-2)continue;prev[m]=k;q.push(m);}}
  if(prev[k1]===-2)return null;const path=[];for(let k=k1;k>=0;k=prev[k])path.unshift(xy(k));return path;};
 // The legs: the lap's right lane by the gap, out through it, the portal, the floor, a lap of the pitch, back.
 const g=z.gaps[0],sm=(g.s0+g.s1)/2,st=s=>{const i=a.findIndex(p=>p[0]>=s);return a[Math.max(0,i)];},p=st(sm),side=g.side,lane=[p[1]+p[9]*side*(p[4]/2-2.2),p[2]+p[10]*side*(p[4]/2-2.2)];
 const face=p[4]/2+P.guardrailClearance(data,sm,side),out=[p[1]+p[9]*side*(face+7),p[2]+p[10]*side*(face+7)];
 const T=arg.tunnel,tf=(aa,b)=>[arg.C[0]+T.c*aa-T.s*b,arg.C[1]+T.s*aa+T.c*b];
 const loop=Array.from({length:14},(_,k)=>{const t=Math.PI+k/14*2*Math.PI,u=Math.cos(t)*arg.loop[0],v=Math.sin(t)*arg.loop[1],U=arg.U;return [arg.C[0]+U[0]*u-U[1]*v,arg.C[1]+U[1]*u+U[0]*v];});
 const ins=[out,tf(arg.portal+26,0),tf(arg.portal-6,0),tf(arg.floor-4,0),tf(arg.floor-14,0)];
 const marks={};const route=[lane];const leg=(pts,name)=>{marks[name]=route.length;for(let i=0;i+1<pts.length;i++){const r=bfs(pts[i],pts[i+1]);if(!r)return pts[i+1];route.push(...r.slice(1));}return null;};
 let miss=leg(ins,'entrada')??leg([tf(arg.floor-14,0),...loop.map((q,k)=>k?q:q),tf(arg.floor-14,0)],'gramado')??leg([tf(arg.floor-14,0),tf(arg.floor-4,0),tf(arg.portal-6,0),tf(arg.portal+26,0),out],'saida');
 // Back onto the lap: across to its far half before turning up the straight (clear of the wall's end by the gap).
 marks.pista=route.length;const lp=(s,lat)=>{const q=st(s);return [q[1]+q[9]*side*lat,q[2]+q[10]*side*lat];};route.push(lp(sm,0),lp(sm+8,-2.5),lp(sm+30,-1),lp(g.s1+90,1.5));
 const solid=data.meta.roam.zones.find(q=>q.name==='mineirao').ring[1],inSolid=(x,y)=>{let c=false;for(let i=0,n=solid.length/2,j=n-1;i<n;j=i++){const ax=solid[2*i],ay=solid[2*i+1],bx=solid[2*j],by=solid[2*j+1];if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)c=!c;}return c;};
 let auto=null;const step=car.step.bind(car);
 car.step=(cmd,dt)=>{if(!auto)return step(cmd,dt);
  const c=car,sp=Math.hypot(c.vx,c.vy);let [tx,ty]=auto.path[auto.k];
  while(auto.k<auto.path.length-1&&Math.hypot(tx-c.x,ty-c.y)<6){auto.k++;[tx,ty]=auto.path[auto.k];}
  const left=Math.hypot(tx-c.x,ty-c.y)+(auto.path.length-1-auto.k)*2,al=wrapA(Math.atan2(ty-c.y,tx-c.x)-c.heading),st2=Math.max(-1,Math.min(1,al*2.2));
  const v=Math.min(auto.v,Math.abs(al)>.6?4:auto.v,Math.sqrt(2*2.5*Math.max(0,left-2)));
  if((c.wallImpactSpeed||0)>.5){if(auto.hits.length<6&&!(auto.hits.at(-1)?.[4]===auto.k))auto.hits.push([+c.x.toFixed(1),+c.y.toFixed(1),+sp.toFixed(1),c.roamZone?.name??null,auto.k,+c.wallImpactSpeed.toFixed(2)]);if(c.wallImpactSpeed>auto.impact){auto.impact=c.wallImpactSpeed;auto.hit=auto.hits.at(-1);}}
  if(c.wheelsDown===0&&auto.airAt.length<6&&!(auto.airAt.at(-1)?.[2]===auto.k))auto.airAt.push([+c.x.toFixed(1),+c.y.toFixed(1),auto.k]);
  auto.steps++;if(c.roamZone)auto.zone=c.roamZone.name;if(inSolid(c.x,c.y))auto.inSolid++;if(c.wheelsDown===0)auto.air++;
  const g2=c.sample(c.x,c.y).z;auto.below=Math.min(auto.below,c.z-g2);auto.dz=Math.max(auto.dz,Math.abs(c.z-(auto.z??c.z)));auto.z=c.z;
  if(auto.k===auto.path.length-1&&left<2.5)auto.done=true;
  return step({left:Math.max(0,st2),right:Math.max(0,-st2),throttle:sp<v?Math.min(1,(v-sp)*.4):0,brake:sp>v+.5||auto.done?1:0,reverse:0,handbrake:0},dt);};
 window.__estadio={route,marks,miss,
  go(v){auto={path:route,k:0,v,impact:0,hit:null,hits:[],airAt:[],steps:0,zone:null,inSolid:0,air:0,below:9,dz:0,z:null,done:false};},
  state(){return auto&&{k:auto.k,n:auto.path.length,done:auto.done,impact:auto.impact,hit:auto.hit,hits:auto.hits,airAt:auto.airAt,steps:auto.steps,zone:auto.zone,inSolid:auto.inSolid,air:auto.air,below:auto.below,dz:auto.dz,x:car.x,y:car.y,speed:Math.hypot(car.vx,car.vy),roam:car.roamZone?.name??null,onRoad:car.surface.onRoad,d:car.surface.d,width:car.surface.width};},
  off(){auto=null;}};
 return {n:route.length,marks,miss,start:a.findIndex(q=>q[0]>=g.s0-70)};}"""


def passeio(page):
    """O Opala da reta para dentro do Mineirão e de volta, fotografando no caminho."""
    U = (math.cos(ST.get('heading', math.radians(79))), math.sin(ST.get('heading', math.radians(79))))
    arg = {'C': C, 'U': U, 'tunnel': {'c': TC, 's': TS}, 'portal': A_PORTAL, 'floor': A_PISO, 'loop': [62, 36]}
    info = page.evaluate(PILOTO, arg)
    print('passeio: rota', info, flush=True)
    if info['miss'] is not None:
        falhas.append(('rota do passeio sem caminho livre até', info['miss']))
        return
    page.evaluate("i=>{interlagos.reposition(i);true}", info['start'])
    camera(page, 'chase')
    page.wait_for_timeout(800)
    page.evaluate("__estadio.go(9)")
    m = info['marks']
    # Fotos por trecho: onde a rota passa perto destes pontos (referencial do túnel) pela primeira vez.
    pontos = [('passeio_arco', None, m['entrada'] + 2), ('passeio_portal', A_PORTAL + 18, None), ('passeio_tunel', A_PORTAL - 14, None),
              ('passeio_saida_gramado', A_PISO + 6, None), ('passeio_gramado', None, m['gramado'] + int((m['saida'] - m['gramado']) * .35)),
              ('passeio_gramado_arquibancada', None, m['gramado'] + int((m['saida'] - m['gramado']) * .7)), ('passeio_volta_tunel', None, m['saida'] + 14),
              ('passeio_de_volta_a_pista', None, m['pista'])]
    feitas = set()
    t = 0
    st = None
    while t < 240000:
        st = page.evaluate('__estadio.state()')
        a = (st['x'] - C[0]) * TC + (st['y'] - C[1]) * TS
        for nome, alvo_a, alvo_k in pontos:
            if nome in feitas:
                continue
            if (alvo_k is not None and st['k'] >= alvo_k) or (alvo_a is not None and st['k'] < m['gramado'] and a < alvo_a):
                if nome == 'passeio_gramado_arquibancada':
                    camera(page, 'far')
                foto(page, nome)
                if nome == 'passeio_gramado_arquibancada':
                    camera(page, 'chase')
                feitas.add(nome)
        if st['done']:
            break
        page.wait_for_timeout(200)
        t += 200
    page.wait_for_timeout(1500)
    st = page.evaluate('__estadio.state()')
    page.evaluate('__estadio.off()')
    print('passeio:', st, flush=True)
    if not st['done']:
        falhas.append(('passeio não terminou', st))
    if st['impact'] > .5:
        falhas.append(('batida no passeio (parede invisível?)', st['hit'], st['impact']))
    if st['inSolid']:
        falhas.append(('carro dentro do sólido do estádio', st['inSolid']))
    if st['zone'] != 'mineirao':
        falhas.append(('não entrou na zona do Mineirão', st['zone']))
    if st['below'] < .2 or st['dz'] > .6:
        falhas.append(('carro afundou ou pulou', st['below'], st['dz']))
    if abs(st['d']) > st['width'] / 2 + .5 or st['roam']:
        falhas.append(('não voltou para a pista', st))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text) if m.type == 'error' else None, print('console', m.type, m.text[:400], flush=True)) if m.type in ('error',) or (m.type == 'warning' and ('Mineir' in m.text or 'Estád' in m.text)) else None)
    abrir(page, 'pampulha')
    info = page.evaluate("()=>({circuit:interlagos.circuit,scenery:interlagos.sceneryInfo(),drawCalls:interlagos.state?.drawCalls})")
    assert info['circuit'] == 'pampulha', info['circuit']
    est = (info['scenery'].get('extras') or {}).get('Marcos_Pampulha_Estadios')
    assert est, 'pampulha-estadios.js não montou nada'
    print(json.dumps(est, ensure_ascii=False), flush=True)
    print('draw calls da cena:', info['drawCalls'], flush=True)
    for tipo in ('mineirao', 'mineirinho'):
        if tipo in MARCOS and (not est['built'].get(tipo) or 'error' in (est['built'].get(tipo) or {})):
            falhas.append(('estádio não montado', tipo, est['built'].get(tipo)))
    if est['driveSpace']['violations']:
        falhas.append(('espaço de rodagem', est['driveSpace']))
    if est['pitSpace']['violations']:
        falhas.append(('faixa dos boxes', est['pitSpace']))
    if est['drawCalls'] > 12:
        falhas.append(('chamadas de desenho', est['drawCalls']))
    if ZONA:
        ap = est.get('approaches') or {}
        if 'error' in ap or not ap.get('arches') or (ZONA.get('fences') and not ap.get('blocks')):
            falhas.append(('acessos do Mineirão', ap))
        if not est.get('roamSolids'):
            falhas.append(('sólidos do passeio não entregues', est.get('roamSolids')))

    if '--sem-celular' not in sys.argv:
        movel = page.evaluate("""async()=>{const m=await import('./pampulha-estadios.js');const d=await (await fetch('../dados/pista_pampulha.json')).json();
         const r=m.createPampulhaEstadios(d,{mobile:true});const s=r.stats;r.root.traverse(o=>{o.geometry?.dispose();});
         return {drawCalls:s.drawCalls,triangles:s.triangles,violations:s.driveSpace.violations,pit:s.pitSpace.violations,errors:Object.values(s.built).filter(b=>b?.error).length};}""")
        print('celular:', movel, flush=True)
        if movel['violations'] or movel['pit'] or movel['errors'] or movel['triangles'] >= est['triangles']:
            falhas.append(('detalhe de celular', movel))

    mi = MARCOS['mineirinho']
    mic = (mi['x'], mi['y'])
    abrahao, rei, luz, descida = secao('Abrah', 19292), secao('Rei Pel', 19642), secao('Carlos Luz', 20198), secao('descida', 18962)
    alvo = [C[0], C[1], ZP + 16]
    if quero('largada'):
        em(page, 0, 'chase', 2600)
        foto(page, 'largada_perseguicao')
        camera(page, 'cockpit')
        page.wait_for_timeout(1500)
        foto(page, 'largada_cockpit')
        e = estacao(0)
        vista(page, da_rua(e, C, 2.6, longe=True), alvo, 62, carro=0)
        foto(page, 'largada_grid')
        em(page, 150, 'chase', 2200)
        foto(page, 'reta_perseguicao')
        e = estacao(120)
        vista(page, da_rua(e, C, 2.4, longe=True), [C[0] - 30, C[1] + 20, ZP + 14], 60, carro=120)
        foto(page, 'reta_estadio')
    if quero('acesso') and ZONA:
        g = ZONA['gaps'][0]
        e = estacao(g.get('s0', 254) - 70)
        vista(page, [e['x'], e['y'], e['z'] + 2.4], tf(A_PORTAL + 30, 0, 6), 55, carro=e['s'])
        foto(page, 'abertura_arco')
        vista(page, tf(A_PORTAL + 45, 9, 3.5), tf(A_PORTAL, 0, 4), 55, carro=e['s'])
        foto(page, 'portal')
        vista(page, tf(A_PORTAL - 4, 2, 1.7), tf(A_PISO, 0, 1.6), 72, carro=e['s'])
        foto(page, 'tunel_dentro')
        vista(page, tf(A_PISO + 12, -1.5, 1.8), tf(0, 0, 4), 74, carro=e['s'])
        foto(page, 'tunel_saida_gramado')
        vista(page, tf(-25, 30, 2), tf(60, -10, 10), 78, carro=e['s'])
        foto(page, 'gramado_arquibancadas')
        # Do gramado o mundo de fora (cidade, mata, a volta) sai da imagem (pampulha-estadios.js encloses): os contadores
        # andam; da esplanada (o portal), não.
        for nome, de, para, fora in (('gramado', tf(-25, 30, 2), tf(60, -10, 10), False), ('gramado_rumo_ao_tunel', tf(-30, 5, 2.5), tf(A_PISO + 10, 0, 2), False),
                                     ('portal', tf(A_PORTAL + 45, 9, 3.5), tf(A_PORTAL, 0, 4), True)):
            vista(page, de, para, 60, espera=900, carro=e['s'])
            c0 = page.evaluate('interlagosGraficos.enclosure()')
            page.wait_for_timeout(600)
            c1 = page.evaluate('interlagosGraficos.enclosure()')
            andou = bool(c0 and c1) and c1['renders'] + c1['portals'] > c0['renders'] + c0['portals']
            print('mundo de fora fora da imagem:', nome, andou, c1, flush=True)
            if andou == fora:
                falhas.append(('mundo de fora no estádio', nome, c0, c1))
        f = ZONA['fences'][0] if ZONA.get('fences') else None
        if f:
            # De dentro da zona (o lado do chão aberto dela), 16 m para dentro e um pouco de lado.
            mx, my = (f[0] + f[2]) / 2, (f[1] + f[3]) / 2
            ux, uy = (f[2] - f[0]) / math.hypot(f[2] - f[0], f[3] - f[1]), (f[3] - f[1]) / math.hypot(f[2] - f[0], f[3] - f[1])
            anel = ZONA['ring'][0]
            def na_zona(x, y):
                c = False
                n = len(anel) // 2
                for i in range(n):
                    j = (i - 1) % n
                    ax, ay, bx, by = anel[2 * i], anel[2 * i + 1], anel[2 * j], anel[2 * j + 1]
                    if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
                        c = not c
                return c
            lado = 1 if na_zona(mx - uy * 3, my + ux * 3) else -1
            de = [mx - uy * lado * 16 - ux * 9, my + ux * lado * 16 - uy * 9, 0]
            de[2] = chao(de[0], de[1]) + 3.2
            vista(page, de, [mx - ux * 4, my - uy * 4, chao(mx, my) + 1.3], 58, carro=e['s'])
            foto(page, 'bloqueio_cerca')
    if '--sem-passeio' not in sys.argv and quero('passeio') and ZONA:
        page.evaluate('interlagosLuz.photo(null);true')
        passeio(page)
    if quero('avenidas'):
        e = perto(C[0], C[1], abrahao, rei)
        vista(page, da_rua(e, C), alvo, 64, carro=e['s'])
        foto(page, 'abrahao_caram')
        e = perto(C[0], C[1], rei, luz)
        vista(page, da_rua(e, C), alvo, 64, carro=e['s'])
        foto(page, 'rei_pele')
        em(page, rei + 40)
        foto(page, 'rei_pele_perseguicao')
        e = estacao(luz + 70)
        vista(page, da_rua(e, C), alvo, 62, carro=e['s'])
        foto(page, 'carlos_luz')
    if quero('mineirinho'):
        e = perto(mic[0], mic[1], descida - 400, abrahao + 200)
        vista(page, da_rua(e, mic, 2.6), [mic[0], mic[1], mi['ground'] + 12], 50, carro=e['s'])
        foto(page, 'mineirinho_da_volta')
        em(page, e['s'] - 60)
        foto(page, 'mineirinho_perseguicao')
        vista(page, [mic[0] - 290, mic[1] - 15, 4], [mic[0], mic[1], mi['ground'] + 6], 30, carro=e['s'])
        foto(page, 'mineirinho_da_orla')
    if quero('lagoa'):
        meio = ((C[0] + mic[0]) / 2, (C[1] + mic[1]) / 2)
        nota, e, agua, d = do_outro_lado_da_lagoa(meio)
        print(f'lagoa: s {e["s"]:.0f}, {d:.0f} m, água {agua:.0%}', flush=True)
        vista(page, sobre_a_lagoa(e, meio), [meio[0], meio[1], ZP + 8], 30, carro=e['s'])
        foto(page, 'outro_lado_da_lagoa')
    if quero('alto'):
        vista(page, [C[0] - 330, C[1] - 260, ZP + 210], [C[0], C[1] + 60, ZP], 55, carro=4)
        foto(page, 'alto_sudoeste')
        vista(page, tf(260, -150, 90), tf(60, 0, 0), 55, carro=4)
        foto(page, 'alto_portal')
    if '--sem-noite' not in sys.argv and quero('noite'):
        page.evaluate("interlagosClima.set({time:'noite'});true")
        page.wait_for_timeout(9000)
        noite = page.evaluate("()=>interlagos.sceneryInfo().extras?.Marcos_Pampulha_Estadios?.night??null")
        print('noite:', noite, flush=True)
        if not noite or noite.get('level') != 1:
            falhas.append(('noite não chegou', noite))
        em(page, 0, 'chase', 2600)
        foto(page, 'noite_largada')
        vista(page, tf(A_PORTAL + 45, 9, 3.5), tf(A_PORTAL, 0, 4), 55, carro=0)
        foto(page, 'noite_portal')
        vista(page, tf(A_PORTAL - 4, 2, 1.7), tf(A_PISO, 0, 1.6), 72, carro=0)
        foto(page, 'noite_tunel')
        vista(page, tf(-25, 30, 2), tf(60, -10, 10), 78, carro=0)
        foto(page, 'noite_gramado')
        vista(page, [C[0] - 330, C[1] - 260, ZP + 210], [C[0], C[1] + 60, ZP], 55, carro=4)
        foto(page, 'noite_alto')
        page.evaluate("interlagosClima.set({time:'dia'});true")
    page.evaluate('interlagosLuz.photo(null);true')
    mosaico()
    browser.close()
assert not erros, erros
assert not falhas, falhas
print(json.dumps({'passed': True}, ensure_ascii=False))
