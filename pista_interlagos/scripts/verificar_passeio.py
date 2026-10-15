"""Passeio pela cidade no navegador (Floripa, meta.roam: gerar_cidade_floripa.py PASSEIO, physics.js RoamWorld).

    python verificar_passeio.py [porta] [pasta das fotos]

Abre ?circuito=floripa no Treino solo e, em cada zona de passeio, um piloto automatico (no lugar dos comandos do jogador,
na propria pagina) leva o Opala pela abertura no muro e cidade adentro pelas ruas da zona; ali ele bate devagar numa
fachada e para; o R (a tecla) o devolve a volta. Confere: os modulos montam as pecas das zonas (bloqueios na borda,
gradis, carros parados solidos), o carro chega a zona e anda no chao desenhado (rodas no chao), a batida devagar nao e
um acidente, o R volta para o asfalto da volta, nenhum erro de pagina; e que um circuito sem zonas (?circuito=minhocao)
nao tem nada disso. Fotos (camera de perseguicao e de cima) em renders/floripa_v2/previas/rodada_02/passeio/ (ou na
pasta dada).
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js

PORTA = sys.argv[1] if len(sys.argv) > 1 else '8883'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/'
FOTOS = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[1] / 'renders' / 'floripa_v2' / 'previas' / 'rodada_02' / 'passeio'
FOTOS.mkdir(parents=True, exist_ok=True)
erros = []

# O piloto automatico: um caminho pela zona (uma grade de 2 m no chao aberto dela, longe das bordas, a busca em largura
# a partir da boca da abertura) e quem o segue (mira o ponto 6 m adiante, a velocidade dada, freia no fim).
PILOTO = r"""async()=>{
 const P=await import('./physics.js'),car=interlagos.car,data=car.data,w=P.roamWorld(data),a=data.samples;
 const station=s=>{const i=a.findIndex(p=>p[0]>=s);return i<0?0:i;},wrapA=x=>Math.atan2(Math.sin(x),Math.cos(x));
 const grid=z=>{const S=2,nx=Math.ceil((z.x1-z.x0)/S),ny=Math.ceil((z.y1-z.y0)/S),free=new Uint8Array(nx*ny);
  // (Clear of the solids too: a box's corners, a post.)
  const clear=(x,y)=>w.query(x,y,5).every(it=>it.t===1?it.xs.every((v,k)=>Math.hypot(v-x,it.ys[k]-y)>2.2)&&Math.hypot(it.xs.reduce((s,v)=>s+v,0)/4-x,it.ys.reduce((s,v)=>s+v,0)/4-y)>2.6:it.t===2?Math.hypot(it.x-x,it.y-y)>it.r+1.8:true);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=z.x0+(i+.5)*S,y=z.y0+(j+.5)*S;if(w.inside(z,x,y)&&!w.edge(x,y,2.6,z,w.query(x,y,2.6))&&clear(x,y))free[j*nx+i]=1;}
  return {S,nx,ny,free,xy:k=>[z.x0+(k%nx+.5)*S,z.y0+(Math.floor(k/nx)+.5)*S]};};
 const route=(name,length)=>{
  const z=w.zones.find(q=>q.name===name),g=z.gaps[0],sm=(g.s0+g.s1)/2,p=a[station(sm)],face=p[4]/2+P.guardrailClearance(data,sm,g.side);
  const out=[p[1]+p[9]*g.side*(face+5),p[2]+p[10]*g.side*(face+5)],G=grid(z);
  let k0=-1,best=1e9;G.free.forEach((f,k)=>{if(!f)return;const [x,y]=G.xy(k),d=Math.hypot(x-out[0],y-out[1]);if(d<best){best=d;k0=k;}});
  const dist=new Int32Array(G.free.length).fill(-1),prev=new Int32Array(G.free.length).fill(-1),q=[k0];dist[k0]=0;
  for(let h=0;h<q.length;h++){const k=q[h],i=k%G.nx,j=Math.floor(k/G.nx);for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const u=i+di,v=j+dj;if(u<0||v<0||u>=G.nx||v>=G.ny)continue;const m=v*G.nx+u;if(!G.free[m]||dist[m]>=0)continue;dist[m]=dist[k]+1;prev[m]=k;q.push(m);}}
  // The cell about `length` m in (as the crow flies from the mouth, the farthest one if none is that far).
  let end=k0;dist.forEach((d,k)=>{if(d<0)return;const [x,y]=G.xy(k),r=Math.hypot(x-out[0],y-out[1]),e=G.xy(end),re=Math.hypot(e[0]-out[0],e[1]-out[1]);if(Math.abs(r-length)<Math.abs(re-length))end=k;});
  const path=[];for(let k=end;k>=0;k=prev[k])path.unshift(G.xy(k));
  return {start:station(sm-45),lap:[p[1],p[2]],out,path};
 };
 let auto=null;const step=car.step.bind(car);
 car.step=(cmd,dt)=>{if(!auto)return step(cmd,dt);
  const c=car,sp=Math.hypot(c.vx,c.vy);let [tx,ty]=auto.path[auto.k];
  while(auto.k<auto.path.length-1&&Math.hypot(tx-c.x,ty-c.y)<6){auto.k++;[tx,ty]=auto.path[auto.k];}
  const left=Math.hypot(tx-c.x,ty-c.y)+(auto.path.length-1-auto.k)*2,al=wrapA(Math.atan2(ty-c.y,tx-c.x)-c.heading),st=Math.max(-1,Math.min(1,al*2.2));
  const v=Math.min(auto.v,Math.abs(al)>.6?4:auto.v,auto.stop?Math.sqrt(2*2.5*Math.max(0,left-2)):99);
  if((c.wallImpactSpeed||0)>auto.impact){auto.impact=c.wallImpactSpeed;auto.hit=[+c.x.toFixed(1),+c.y.toFixed(1),+c.heading.toFixed(2),+sp.toFixed(1),c.roamZone?.name??null,auto.k];}auto.steps++;if(c.roamZone)auto.zone=c.roamZone.name;
  auto.dz=Math.max(auto.dz,Math.abs(c.z-(auto.z??c.z)));auto.z=c.z;
  if(auto.k===auto.path.length-1&&left<2.5&&auto.stop)auto.done=true;
  return step({left:Math.max(0,st),right:Math.max(0,-st),throttle:sp<v?Math.min(1,(v-sp)*.4):0,brake:sp>v+.5||auto.done?1:0,reverse:0,handbrake:0},dt);};
 window.__passeio={zones:w.zones.map(z=>({name:z.name,label:z.label})),route,
  go(path,v,stop=true){auto={path,k:0,v,stop,impact:0,steps:0,zone:null,dz:0,z:null,done:false};},
  state(){return auto&&{hit:auto.hit,k:auto.k,n:auto.path.length,done:auto.done,impact:auto.impact,steps:auto.steps,zone:auto.zone,dz:auto.dz,x:car.x,y:car.y,speed:Math.hypot(car.vx,car.vy),roam:car.roamZone?.name??null,onRoad:car.surface.onRoad,wheels:car.wheelsDown};},
  off(){auto=null;},
  // The nearest point of the zone's edge from the car, a little beyond it (a facade, a closure): to drive into it.
  edge(name){const z=w.zones.find(q=>q.name===name);let best=null;for(let r=0;r<40&&!best;r+=4){const e=w.edge(car.x,car.y,r+4,z,w.query(car.x,car.y,r+4));if(e)best=e;}
   return best&&[best.qx+(best.qx-car.x)/best.d*3,best.qy+(best.qy-car.y)/best.d*3];}};
 return true;}"""


def camera(page, modo):
    page.evaluate("m=>{const c=document.getElementById('camera');c.value=m;c.dispatchEvent(new Event('change',{bubbles:true}));}", modo)


def foto(page, nome):
    page.screenshot(path=str(FOTOS / f'{nome}.png'))
    print('foto', nome, flush=True)


def esperar(page, ate, limite=90000):
    """Espera o piloto chegar (ou o limite, em ms de relogio)."""
    t = 0
    while t < limite:
        st = page.evaluate('__passeio.state()')
        if ate(st):
            return st
        page.wait_for_timeout(250)
        t += 250
    return page.evaluate('__passeio.state()')


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
    page.evaluate('interlagos.skipIntro?.()')
    page.wait_for_timeout(4000)


resumo = {}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(240000)
    page.on('pageerror', lambda e: (erros.append(str(e)), print('pageerror', e, flush=True)))
    page.on('console', lambda m: (erros.append(m.text[:300]), print('console', m.type, m.text[:300], flush=True)) if m.type == 'error' else None)
    abrir(page, 'floripa')
    info = page.evaluate("()=>{const e=interlagos.sceneryInfo().extras??{};return {closures:e.Bloqueios_ruas,traffic:e.Transito_cidade};}")
    b = info['closures'] or {}
    print(json.dumps({k: b.get(k) for k in ('closures', 'zoneClosures', 'zonePush', 'roamFences', 'roamSolids', 'skipped', 'skippedWhy', 'parked')}, ensure_ascii=False), flush=True)
    assert b.get('zoneClosures', 0) >= 8 and b.get('roamFences', 0) > 20 and b.get('roamSolids', 0) > 20, b
    assert (b.get('zonePush') or 0) <= 1, f'bloqueio da borda empurrado para longe dela: {b.get("zonePush")} m'
    page.evaluate(PILOTO)
    zonas = page.evaluate('__passeio.zones')
    assert len(zonas) >= 2, zonas
    # O transito da cidade nao entra nas zonas (city-traffic.js corta as faixas ali).
    transito = page.evaluate("async()=>{const P=await import('./physics.js'),d=interlagos.car.data,T=window.interlagosTransito;if(!T)return null;"
                             "const pts=T.network().tracks.flatMap(t=>t.pts),cars=T.vehicles();"
                             "return {pontos:pts.length,dentro:pts.filter(([x,y])=>P.roamZoneAt(d,x,y)).length,carros:cars.length,carrosDentro:cars.filter(v=>P.roamZoneAt(d,v.x,v.y)).length};}")
    print('transito', transito, flush=True)
    assert transito and transito['pontos'] > 100 and transito['dentro'] == 0 and transito['carrosDentro'] == 0, transito
    camera(page, 'chase')
    for z in zonas:
        nome = z['name']
        # A abertura vista da volta (o carro parado 30 m antes, a placa de DESVIO) e a boca vista de dentro da zona; um
        # bloqueio da borda visto de dentro.
        vistas = page.evaluate(f"""async()=>{{const P=await import('./physics.js'),car=interlagos.car,d=car.data,a=d.samples,z=P.roamWorld(d).zones.find(q=>q.name==='{nome}'),g=z.gaps[0],
          st=s=>{{const i=a.findIndex(p=>p[0]>=s);return i<0?0:i;}},p=a[st((g.s0+g.s1)/2)],face=p[4]/2+P.guardrailClearance(d,p[0],g.side),gz=(x,y)=>car.terrain(x,y),
          ox=p[9]*g.side,oy=p[10]*g.side,mx=p[1]+ox*(face+14),my=p[2]+oy*(face+14),c=d.scenery.city.closures.filter(q=>q.zone==='{nome}').sort((u,v)=>v.width-u.width)[0];
          q=a[st(g.side>0?g.s0-26:g.s0-26)],cx=(z.x0+z.x1)/2,cy=(z.y0+z.y1)/2,ux=cx-mx,uy=cy-my,ul=Math.hypot(ux,uy)||1;
          return {{antes:st(g.s0-32),abertura:[[q[1]-q[9]*g.side*3,q[2]-q[10]*g.side*3,q[3]+2.4],[mx-ox*10,my-oy*10,p[3]+.6]],
           alto:[[mx-ux/ul*70,my-uy/ul*70,gz(mx,my)+75],[mx+ux/ul*60,my+uy/ul*60,gz(cx,cy)]],boca:[[mx,my,gz(mx,my)+1.7],[p[1]-p[8]*12,p[2]+p[7]*12,p[3]+1]],
           bloqueio:c?[[c.x-Math.cos(c.heading)*16,c.y-Math.sin(c.heading)*16,gz(c.x,c.y)+1.8],[c.x,c.y,gz(c.x,c.y)+.8]]:null}};}}""")
        page.evaluate("i=>interlagos.reposition(i)", vistas['antes'])
        page.wait_for_timeout(1800)
        foto(page, f'{nome}_chegando')
        for chave in ('abertura', 'boca', 'bloqueio', 'alto'):
            if vistas[chave]:
                page.evaluate("p=>interlagosLuz.photo({from:p[0],at:p[1],fov:55,world:true})", vistas[chave])
                page.wait_for_timeout(1800)
                foto(page, f'{nome}_{chave}')
        page.evaluate('interlagosLuz.photo(null)')
        rota = page.evaluate(f"()=>{{const r=__passeio.route('{nome}',95);window.__rota=r;return {{start:r.start,n:r.path.length}};}}")
        page.evaluate("i=>interlagos.reposition(i)", rota['start'])
        page.wait_for_timeout(800)
        page.evaluate("()=>{const r=window.__rota;__passeio.go([r.lap,r.out,...r.path],9);}")
        meio = esperar(page, lambda st: st and st['k'] >= min(st['n'] - 1, 8) and st['roam'])
        foto(page, f'{nome}_saindo')
        fim = esperar(page, lambda st: st and st['done'])
        page.wait_for_timeout(600)
        foto(page, f'{nome}_dentro')
        # Devagar contra a borda (uma fachada, um bloqueio): para, sem acidente.
        alvo = page.evaluate(f"__passeio.edge('{nome}')")
        page.evaluate("t=>__passeio.go([t],2.5,false)", alvo)
        bate = esperar(page, lambda st: st and st['steps'] > 600 and st['speed'] < .3, 30000)
        foto(page, f'{nome}_encostado')
        page.evaluate('__passeio.off()')
        # O R devolve o carro a volta.
        page.keyboard.press('KeyR')
        page.wait_for_timeout(1500)
        volta = page.evaluate("()=>{const c=interlagos.car,r=c.surface;return {onLap:Math.abs(r.d)<r.width/2,roam:c.roamZone?.name??null,s:r.s};}")
        resumo[nome] = {'zona': fim['zone'], 'impacto_saida': round(fim['impact'], 2), 'dz_max': round(fim['dz'], 3), 'rodas': fim['wheels'], 'asfalto': fim['onRoad'],
                        'batida_devagar': round(bate['impact'], 2), 'parado': round(bate['speed'], 2), 'R': volta}
        print(nome, json.dumps(resumo[nome], ensure_ascii=False), flush=True)
        assert fim['zone'] == nome and fim['done'], (nome, fim)
        assert fim['impact'] < 4 and fim['dz'] < .3 and fim['wheels'] >= 3, (nome, fim)
        assert bate['impact'] < 4 and bate['speed'] < .5, (nome, bate)
        assert volta['onLap'] and volta['roam'] is None, (nome, volta)
    # Sem zonas, nada disso.
    abrir(page, 'minhocao')
    sem = page.evaluate("()=>({roam:interlagos.car.roam===null,closures:interlagos.sceneryInfo().extras?.Bloqueios_ruas?.zoneClosures??0})")
    print('minhocao', sem, flush=True)
    assert sem['roam'] and not sem['closures'], sem
    browser.close()
assert not erros, erros
print(json.dumps({'passou': True, 'zonas': resumo}, ensure_ascii=False))
