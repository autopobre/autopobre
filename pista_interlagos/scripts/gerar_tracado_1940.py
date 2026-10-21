"""Traçado antigo de Interlagos (1940-1989, 7.960 m) nas coordenadas do jogo.

Base: mapa vetorial "Circuit_Interlagos_1977.svg" (Wikimedia Commons, autor Ahnode, domínio público), encaixado
no eixo atual (dados/pista.json) por ICP de similaridade e deformado (thin-plate spline) pelos trechos que ainda
existem. Onde o asfalto antigo sobrevive (faixa sul das Curvas 1-2, Retão = pista auxiliar/arrancada, Curva 3 e
reta norte, reta longa até a Ferradura, rua do estacionamento depois da Curva do Sol) o eixo segue a faixa
pavimentada na ortofoto GeoSampa 2020 de 20 cm (programação dinâmica de centro e largura). Onde o traçado antigo
coincide com o atual usa as amostras exatas de pista.json, no sentido antigo. Alturas: solo LiDAR 2017 (ou a
grade de pista.json, se o LiDAR não estiver presente).

Saídas: dados/interlagos_1940.json (completo, fora do git), teste/interlagos-1940.js (módulo compacto) e prévias
em renders/historia/tracado_1940/ (fora do git).
Uso: python -I scripts/gerar_tracado_1940.py [--fontes DIR] [--lidar NPZ] [--svg SVG] [--sem-previas]
--fontes é a pasta com orto_20cm/ (refinar_tracado.py); --lidar o lidar_solo_2017.npz (baixar_lidar.py); o SVG é
baixado da Wikimedia na primeira execução para fontes/historia/. INTERLAGOS_FONTES e INTERLAGOS_LIDAR também valem.
"""
import argparse,json,os,re,sys,time,urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.interpolate import CubicSpline,RBFInterpolator
from scipy.ndimage import map_coordinates,uniform_filter1d,median_filter
from scipy.signal import savgol_filter
from scipy.spatial import cKDTree

R=Path(__file__).resolve().parents[1]
SVG_URL='https://upload.wikimedia.org/wikipedia/commons/8/8f/Circuit_Interlagos_1977.svg'
SVG_CREDIT='Circuit_Interlagos_1977.svg, Wikimedia Commons (Ahnode, domínio público)'
X0,Y0,X1,Y1,PX=326250,7376700,327850,7378700,.2      # mosaico da ortofoto (refinar_tracado.py)
Image.MAX_IMAGE_PIXELS=None
DS=.5                                                # passo interno do eixo (m)

# Junções com a pista atual (s de pista.json, m), lidas na ortofoto e no mapa de 1977.
S_A=327    # a Curva 1 antiga abre onde a entrada do S do Senna aperta (o começo da curva é o mesmo)
S_B=495    # a Curva do Sol antiga seguia curvando à direita (para o estacionamento) onde hoje o S do Senna se liga a ela
S_F=2070   # a Ferradura antiga, vinda da reta longa (pista auxiliar), entra no fundo da Ferradura atual
S_C=2200   # o retorno do Sargento chegava pela faixa do paddock e seguia para o Laranja (Laranjinha)
S_D=3237   # a Junção antiga seguia para o norte onde a atual dobra à esquerda
S_E=3490   # e voltava à Subida dos Boxes

# Faixas de asfalto antigo ainda visíveis: pontos-guia (UTM 31983 menos a origem de pista.json, m), busca lateral R
# e larguras w aceitas. A programação dinâmica acha o centro da faixa pavimentada perto da guia.
GUIDES={
 'faixa_sul':dict(pts=[(-180,-413.5),(-140,-415.2),(-100,-416.5),(-60,-419),(-30,-419),(-5,-415.5),(12,-411)],R=5,w=(8,20)),
 'retao':dict(pts=[(117,-303),(125,-274),(140,-215),(166,-109),(207,46),(259,240),(280,327),(295,385),(305,423),
   (319,481),(330,560),(337,620),(338,665),(331,697),(316,722),(292,738),(260,745),(225,746),(190,746),(165,745)],R=6,w=(8,16),sm=45),
 'reta_longa':dict(pts=[(52,542),(35,506),(14,472),(-11,440),(-35,408),(-60,377),(-85,346),(-109,313),(-135,278),
   (-151,258),(-169,239),(-192,218),(-212,205),(-234,193),(-257,181),(-275,169),(-291,151),(-301,130),(-303,118)],R=5,w=(7,16)),
 'estacionamento':dict(pts=[(-226,-259),(-229,-239),
   (-229,-200),(-228,-178),(-224,-158),(-214,-140),(-198,-122),(-180,-103),(-160,-80),(-138,-55),(-115,-28),
   (-95,-5),(-75,16),(-55,37),(-35,59),(-15,82)],R=5,w=(6,16),sm=45),
}
# Restos de asfalto que só entram na classificação de confiança (o eixo ali vem do mapa deformado).
EVIDENCE={
 'juncao':dict(pts=[(13,598),(17,618),(21,638),(19,659),(12,679),(2,695),(-16,705),(-35,709),(-55,710),(-76,708),
   (-96,703),(-115,696),(-134,688)],R=8,w=(7,16)),
 'faixa_paddock':dict(pts=[(-200,45),(-217,34),(-236,24),(-257,24),(-277,30),(-297,37),(-315,43),(-331,52),(-341,64),(-348,81)],R=8,w=(6,16)),
 'runoff_curva1':dict(pts=[(-275,-369),(-262,-386),(-245,-399),(-222,-408),(-200,-412)],R=6,w=(8,20)),
}
# Encaixe inicial do SVG: (x, y) no SVG <-> s atual.
SVG_CTRL=[((190,120),3780),((43.3,306.7),250),((260,103.3),2750),((350,266.7),1430),((386.7,156.7),3240),((156.7,396.7),700)]

# Peças na ordem da volta antiga (anti-horária, como hoje), a partir da linha de chegada atual.
PIECES=[
 dict(kind='atual',a=0,b=S_A,dir=1,status='mantido'),
 dict(kind='mapa',status='cortado'),
 dict(kind='guia',key='faixa_sul',status='cortado'),
 dict(kind='mapa',status='cortado'),
 dict(kind='guia',key='retao',status='cortado'),
 dict(kind='mapa',status='cortado'),
 dict(kind='guia',key='reta_longa',status='cortado'),
 dict(kind='mapa',status='cortado'),
 dict(kind='atual',a=S_F,b=S_B,dir=-1,status='invertido'),
 dict(kind='mapa',status='cortado'),
 dict(kind='guia',key='estacionamento',status='cortado'),
 dict(kind='mapa',status='cortado'),
 dict(kind='atual',a=S_C,b=S_D,dir=1,status='mantido'),
 dict(kind='mapa',status='cortado'),
 dict(kind='atual',a=S_E,b=None,dir=1,status='mantido'),
]
SOL_END=(-227,-200)              # fim da Curva do Sol antiga: já na rua do estacionamento, rumo norte
SARG=((30,140),(-45,212))         # entrada e saída do grampo do Sargento (onde hoje há uma quadra)
# Nomes dos trechos (segments): cada um começa no ponto dado ('pt' = posição, 'cur' = s atual) e vai até o próximo.
NAMES=[('Reta dos Boxes','cur',0),('Curva 1','cur',S_A),('Curva 2','pt',(15,-410)),('Retão','pt',(117,-303)),
 ('Curva 3','pt',(330,560)),('Reta norte e Curva 4','pt',(262,745)),('Reta longa','pt',(52,542)),
 ('Ferradura','pt',(-260,181)),('Reta da Ferradura','cur',1990),('Curva do Lago','cur',1650),('Reta Oposta','cur',1350),
 ('Curva do Sol','cur',700),('Descida para o Sargento','pt',SOL_END),('Curva do Sargento','pt',SARG[0]),
 ('Retorno ao Laranja','pt',SARG[1]),('Curva do Laranja','cur',S_C),('Pinheirinho','cur',2400),('Cotovelo','cur',2600),
 ('Mergulho','cur',2800),('Junção','cur',3100),('Café','cur',S_E),('Subida dos Boxes','cur',3600),('Reta dos Boxes','cur',3760)]
# Marcas para a narração: curvas ('s') e retas ('s_from'/'s_to').
POINTS=[('Curva 1','apex',('cur',S_A),('pt',(-180,-413))),('Curva 2','apex',('pt',(15,-410)),('pt',(117,-303))),
 ('Retão','reta',('pt',(117,-303)),('pt',(330,560))),('Curva 3','apex',('pt',(330,560)),('pt',(262,745))),
 ('Curva 4','apex',('pt',(190,746)),('pt',(52,542))),('Ferradura','apex',('pt',(-260,181)),('cur',1990)),
 ('Curva do Lago','apex',('cur',1650),('cur',1350)),('Reta Oposta','reta',('cur',1350),('cur',750)),
 ('Curva do Sol','apex',('cur',700),('pt',SOL_END)),('Curva do Sargento','apex',('pt',SARG[0]),('pt',SARG[1])),
 ('Curva do Laranja','cur',2230),('Curva do S','cur',2370),('Pinheirinho','cur',2430),('Cotovelo','cur',2660),
 ('Mergulho','cur',2840),('Junção','apex',('cur',S_D),('cur',S_E)),('Café','cur',3570),
 ('Subida dos Boxes','reta',('cur',3600),('cur',3760)),('Reta dos Boxes','reta',('cur',3760),('cur',250))]
# Trechos de hoje que não existiam antes de 1990.
NEW=[('S do Senna',S_A,S_B,'liga a entrada da antiga Curva 1 à antiga Curva do Sol, percorrida ao contrário'),
 ('Ligação Ferradura–Laranjinha',S_F,S_C,'liga o fundo da antiga Ferradura à aproximação do Laranja'),
 ('Junção',S_D,S_E,'a Junção atual dobra antes; a antiga seguia mais ao norte')]

# ---------------------------------------------------------------- utilidades
def arc(P):return np.r_[0,np.cumsum(np.linalg.norm(np.diff(P,axis=0),axis=1))]
def resample(P,step,closed=False):
 Q=np.vstack([P,P[:1]]) if closed else np.asarray(P,float);c=arc(Q);keep=np.r_[True,np.diff(c)>1e-9];Q,c=Q[keep],c[keep]
 n=max(2,int(round(c[-1]/step))+(0 if closed else 1));t=np.linspace(0,c[-1],n,endpoint=not closed)
 return np.column_stack([np.interp(t,c,Q[:,k]) for k in range(Q.shape[1])])
def tangents(P):T=np.gradient(P,axis=0);return T/np.maximum(np.linalg.norm(T,axis=1),1e-9)[:,None]
def smoothstep(w):w=np.clip(w,0,1);return w*w*(3-2*w)
def hermite(p0,t0,p1,t1,step):
 L=np.linalg.norm(p1-p0);u=np.linspace(0,1,400)[:,None]
 H=(2*u**3-3*u**2+1)*p0+(u**3-2*u**2+u)*t0*L+(-2*u**3+3*u**2)*p1+(u**3-u**2)*t1*L
 return resample(H,step)
def runs(lab):
 """Trechos contínuos de rótulos iguais: [(início, fim exclusivo, rótulo)]."""
 e=np.flatnonzero(np.r_[True,lab[1:]!=lab[:-1]]);return [(int(a),int(b),lab[a]) for a,b in zip(e,np.r_[e[1:],len(lab)])]

class Today:
 """Eixo atual. Coordenadas internas: UTM menos a origem, sem o fator de escala do jogo (K)."""
 def __init__(s,J):
  A=np.array(J['samples']);s.K=J['meta']['horizontal_scale_to_fia_length'];s.O=np.array(J['meta']['origin_utm31983'][:2])
  s.u=A[:,1:3]/s.K;s.z=A[:,3];s.s=A[:,0];s.L=float(s.s[-1]+np.linalg.norm(A[0,1:3]-A[-1,1:3]))
  ss=np.r_[s.s,s.L];s.cs=CubicSpline(ss,np.vstack([s.u,s.u[:1]]),bc_type='periodic')
  s.zs=CubicSpline(ss,np.r_[s.z,s.z[0]],bc_type='periodic');s.dense=np.arange(0,s.L,.1);s.tree=cKDTree(s.cs(s.dense))
 def xy(s,v):return s.cs(np.mod(v,s.L))
 def zat(s,v):return s.zs(np.mod(v,s.L))
 def project(s,p):d,i=s.tree.query(p);return s.dense[i],d
 def piece(s,a,b,direction):
  span=((b-a) if direction>0 else (a-b))%s.L or s.L
  ss=np.mod(a+direction*np.r_[np.arange(0,span,DS),span],s.L);return s.xy(ss)

# ---------------------------------------------------------------- fontes
def load_mosaic(fontes):
 d=Path(fontes)/'orto_20cm';f=d/'mosaico.npy'
 if f.exists():return np.load(f,mmap_mode='r')
 tiles=sorted(d.glob('t_*.jpg'))
 if not tiles:sys.exit(f'Ortofoto não encontrada em {d} (rode refinar_tracado.py ou passe --fontes).')
 m=np.zeros((int((Y1-Y0)/PX),int((X1-X0)/PX),3),np.uint8)
 for t in tiles:
  _,x,y=t.stem.split('_');c=int((int(x)-X0)/PX);r=int((Y1-int(y)-400)/PX);m[r:r+2000,c:c+2000]=np.asarray(Image.open(t).convert('RGB'))
 return m
class Ortho:
 def __init__(s,M,O):s.M=M;s.O=O
 def rgb(s,p):
  p=np.asarray(p,float);sh=p.shape[:-1];p=p.reshape(-1,2)
  col=(p[:,0]+s.O[0]-X0)/PX-.5;row=(Y1-(p[:,1]+s.O[1]))/PX-.5
  r0=max(int(row.min())-2,0);r1=int(row.max())+3;c0=max(int(col.min())-2,0);c1=int(col.max())+3
  sub=np.asarray(s.M[r0:r1,c0:c1]).astype(np.float32)
  return np.stack([map_coordinates(sub[...,k],[row-r0,col-c0],order=1,mode='nearest') for k in range(3)],-1).reshape(*sh,3)
 def crop(s,xa,xb,ya,yb,mpp):
  f=max(1,int(mpp/PX/2));c0=max(int((xa+s.O[0]-X0)/PX),0);c1=int((xb+s.O[0]-X0)/PX)
  r0=max(int((Y1-(yb+s.O[1]))/PX),0);r1=int((Y1-(ya+s.O[1]))/PX)
  return Image.fromarray(np.asarray(s.M[r0:r1:f,c0:c1:f])).resize((int((xb-xa)/mpp),int((yb-ya)/mpp)),Image.LANCZOS)

def load_svg(path):
 path=Path(path)
 if not path.exists():
  path.parent.mkdir(parents=True,exist_ok=True)
  req=urllib.request.Request(SVG_URL,headers={'User-Agent':'autopobre-historia/1.0 (traçado antigo de Interlagos)'})
  path.write_bytes(urllib.request.urlopen(req,timeout=60).read())
 best=None
 for el in ET.parse(path).getroot().iter():
  if el.tag.split('}')[-1]=='path' and el.get('d'):
   for sub in parse_path(el.get('d')):
    L=arc(sub)[-1]
    if best is None or L>best[0]:best=(L,sub)
 return best[1]
def parse_path(d):
 """Leitor mínimo de caminhos SVG (M, L, H, V, C, S, Z; absolutos e relativos)."""
 tok=re.findall(r'[MmLlHhVvCcSsZz]|-?\d*\.?\d+(?:[eE]-?\d+)?',d);i=0;cur=np.zeros(2);start=np.zeros(2);out=[];subs=[];cmd='M';last=None
 def num():
  nonlocal i;v=float(tok[i]);i+=1;return v
 while i<len(tok):
  if tok[i].isalpha():cmd=tok[i];i+=1
  rel=cmd.islower();c=cmd.upper()
  if c=='Z':out.append(start.copy());subs.append(np.array(out));out=[];cur=start.copy();continue
  if c=='M':
   p=np.array([num(),num()]);cur=cur+p if rel else p
   if out:subs.append(np.array(out))
   out=[cur.copy()];start=cur.copy();cmd='l' if rel else 'L';continue
  if c=='L':p=np.array([num(),num()]);cur=cur+p if rel else p;out.append(cur.copy());last=None;continue
  if c=='H':v=num();cur=np.array([cur[0]+v if rel else v,cur[1]]);out.append(cur.copy());last=None;continue
  if c=='V':v=num();cur=np.array([cur[0],cur[1]+v if rel else v]);out.append(cur.copy());last=None;continue
  if c in 'CS':
   p1=(cur+np.array([num(),num()]) if rel else np.array([num(),num()])) if c=='C' else (2*cur-last if last is not None else cur.copy())
   p2=np.array([num(),num()]);p3=np.array([num(),num()])
   if rel:p2=cur+p2;p3=cur+p3
   t=np.linspace(0,1,17)[1:,None];out.extend((1-t)**3*cur+3*(1-t)**2*t*p1+3*(1-t)*t**2*p2+t**3*p3);last=p2;cur=p3;continue
  raise ValueError('comando SVG não suportado: '+cmd)
 if out:subs.append(np.array(out))
 return subs
def similarity(a,b):
 """Similaridade (com reflexão: o SVG tem y para baixo) que leva a em b por mínimos quadrados."""
 ma,mb=a.mean(0),b.mean(0);U,S,Vt=np.linalg.svd((b-mb).T@(a-ma));Rm=U@Vt;sc=S.sum()/((a-ma)**2).sum()
 return lambda p:(sc*(Rm@(p-ma).T)).T+mb,sc

class Ground:
 def __init__(s,lidar,J,today):
  s.today=today
  if lidar and Path(lidar).exists():
   xyz=np.load(lidar)['xyz'];s.p=xyz[:,:2]-today.O;s.zv=xyz[:,2]-J['meta']['origin_utm31983'][2];s.tree=cKDTree(s.p);s.kind='LiDAR 2017 (solo)'
  else:
   t=J['terrain'];s.t=t;s.g=np.array(t['z']).reshape(t['ny'],t['nx']);s.kind='grade de pista.json'
 def z(s,P):
  if hasattr(s,'tree'):
   d,i=s.tree.query(P,k=24,distance_upper_bound=4.,workers=-1);ok=np.isfinite(d)
   zz=np.where(ok,s.zv[np.minimum(i,len(s.zv)-1)],np.nan)
   with np.errstate(all='ignore'):out=np.nanmedian(zz,1)
   bad=~np.isfinite(out)
   if bad.any():d2,i2=s.tree.query(P[bad],k=8,workers=-1);w=1/np.maximum(d2,.5)**2;out[bad]=(s.zv[i2]*w).sum(1)/w.sum(1)
   return out
  t=s.t;g=P*s.today.K;return map_coordinates(s.g,[(g[:,1]-t['y0'])/t['step'],(g[:,0]-t['x0'])/t['step']],order=1,mode='nearest')

# ---------------------------------------------------------------- faixas pavimentadas na ortofoto
def features(img):
 r,g,b=img[...,0],img[...,1],img[...,2];lum=img.mean(-1);sat=img.max(-1)-img.min(-1)
 grey=np.clip((38-sat)/18,0,1)*np.clip((lum-45)/25,0,1)*np.clip((225-lum)/30,0,1)
 veg=((g>r+3)&(g>b+8)&(sat>16)).astype(float);soil=((r>g+6)&(r>b+22)&(sat>24)).astype(float)
 teal=((b>r+20)&(g>r+20)).astype(float);white=np.clip((lum-165)/35,0,1)*np.clip((45-sat)/20,0,1)
 return grey-1.2*veg-soil-.5*teal,white
def snap(ortho,pts,R=6.,w=(7,16),sm=31,lam=.08,step=2.):
 """Centro e largura da faixa pavimentada ao longo de uma guia (programação dinâmica sobre deslocamento e largura)."""
 g=np.array(pts,float);c=arc(g);P=resample(CubicSpline(c,g)(np.linspace(0,c[-1],600)),step)
 T=tangents(P);N=np.column_stack([-T[:,1],T[:,0]]);wmin,wmax=w
 dd=np.arange(-R-wmax/2-4,R+wmax/2+4+1e-9,.25);along=np.array([-1.,0.,1.])
 q=P[:,None,None,:]+dd[None,:,None,None]*N[:,None,None,:]+along[None,None,:,None]*T[:,None,None,:]
 road,white=features(ortho.rgb(q).mean(2));road=uniform_filter1d(road,3,axis=0);white=uniform_filter1d(white,3,axis=0)
 cum=np.concatenate([np.zeros((len(P),1)),np.cumsum(road,1)],1)
 os_=np.arange(-R,R+1e-9,.5);ws=np.arange(wmin,wmax+1e-9,.5);Oo,Ww=np.meshgrid(os_,ws,indexing='ij')
 ix=lambda v:np.clip(np.round((v-dd[0])/.25).astype(int),0,len(dd));cl=lambda v:np.clip(v,0,len(dd)-1)
 a,b=ix(Oo-Ww/2),ix(Oo+Ww/2);la,ra=ix(Oo-Ww/2-3),ix(Oo+Ww/2+3)
 inside=(cum[:,b]-cum[:,a])/np.maximum(b-a,1)
 outside=.5*((cum[:,a]-cum[:,la])/np.maximum(a-la,1)+(cum[:,ra]-cum[:,b])/np.maximum(ra-b,1))
 wl=np.maximum(white[:,cl(a)],white[:,cl(a+2)])+np.maximum(white[:,cl(b-1)],white[:,cl(b-3)])
 score=inside-.6*outside+.15*wl;e=-score;n=len(P)
 D=e[0].copy();back=np.zeros((n,)+Oo.shape,np.int8);moves=[(i,j) for i in (-1,0,1) for j in (-1,0,1)]
 for k in range(1,n):
  Dp=np.pad(D,1,constant_values=np.inf);best=np.full(Oo.shape,np.inf);arg=np.zeros(Oo.shape,np.int8)
  for m,(i,j) in enumerate(moves):
   cc=Dp[1-i:1-i+Oo.shape[0],1-j:1-j+Oo.shape[1]]+lam*(abs(i)+.3*abs(j));bt=cc<best;best[bt]=cc[bt];arg[bt]=m
  D=best+e[k];D-=D.min();back[k]=arg
 ij=np.unravel_index(np.argmin(D),Oo.shape);path=np.zeros((n,2),int)
 for k in range(n-1,-1,-1):
  path[k]=ij
  if k>0:i,j=moves[back[k][ij]];ij=(ij[0]-i,ij[1]-j)
 wsg=lambda m:max(5,min(m,n-1-(n%2==0)))|1
 # a guia já acompanha as curvas: o deslocamento é uma correção lenta, suavizada em ~60 m
 off=savgol_filter(median_filter(os_[path[:,0]],9,mode='nearest'),wsg(sm),2,mode='interp');C=P+N*off[:,None]
 C=np.column_stack([savgol_filter(C[:,k],wsg(15),3,mode='interp') for k in range(2)])
 return dict(xy=resample(C,DS),width=ws[path[:,1]],score=score[np.arange(n),path[:,0],path[:,1]],offset=off,coarse=C)

# ---------------------------------------------------------------- montagem do traçado
def build(args):
 t0=time.time()
 J=json.loads((R/'dados/pista.json').read_text(encoding='utf-8'));today=Today(J);K=today.K
 fontes=Path(args.fontes or os.environ.get('INTERLAGOS_FONTES') or R/'fontes')
 ortho=Ortho(load_mosaic(fontes),today.O)
 lidar=args.lidar or os.environ.get('INTERLAGOS_LIDAR')
 if not lidar:lidar=next((c for c in (R/'dados/lidar_solo_2017.npz',fontes.parent/'dados/lidar_solo_2017.npz') if c.exists()),None)
 ground=Ground(lidar,J,today);svg=load_svg(args.svg or R/'fontes/historia/Circuit_Interlagos_1977.svg')
 print('fontes carregadas em',round(time.time()-t0),'s; alturas:',ground.kind,flush=True)

 # 1) Mapa de 1977 sobre o eixo atual: controle manual e ICP de similaridade (metade mais próxima a cada passo).
 f,_=similarity(np.array([p for p,_ in SVG_CTRL]),today.xy(np.array([s for _,s in SVG_CTRL])));P=f(svg)
 for _ in range(40):
  d,i=today.tree.query(P);m=d<np.percentile(d,50);f,scale=similarity(svg[m],today.cs(today.dense[i[m]]));P=f(svg)
 P0=resample(P,DS,closed=True)
 if np.sum(P0[:,0]*np.roll(P0[:,1],-1)-np.roll(P0[:,0],-1)*P0[:,1])<0:P0=P0[::-1]
 P0=np.roll(P0,-int(np.argmin(np.linalg.norm(P0-today.xy(0.),axis=1))),0)
 d0,_=today.tree.query(P0);svg_len=arc(np.vstack([P0,P0[:1]]))[-1]
 print(f'mapa de 1977: {svg_len:.0f} m depois do encaixe ({scale:.3f} m/unidade); mediana até o eixo atual {np.median(d0):.1f} m',flush=True)

 # 2) Faixas de asfalto antigo.
 snaps={k:snap(ortho,g['pts'],g['R'],g['w'],g.get('sm',31)) for k,g in {**GUIDES,**EVIDENCE}.items()}
 for k,v in snaps.items():print(f'  faixa {k}: {arc(v["xy"])[-1]:.0f} m, largura mediana {np.median(v["width"]):.1f} m, nota mediana {np.median(v["score"]):.2f}',flush=True)

 # 3) Peças fixas (pista atual e faixas) e sua posição no contorno do mapa.
 pieces=[dict(p) for p in PIECES]
 for p in pieces:
  if p['kind']=='atual':p['b']=today.L if p['b'] is None else p['b'];p['xy']=today.piece(p['a'],p['b'],p['dir'])
  elif p['kind']=='guia':p['xy']=snaps[p['key']]['xy']
 n0=len(P0);P0x=np.vstack([P0,P0]);cur=0
 for p in pieces:
  if p['kind']=='mapa':continue
  w0=slice(cur,cur+n0//3);p['i0']=cur+int(np.argmin(np.linalg.norm(P0x[w0]-p['xy'][0],axis=1)))
  w1=slice(p['i0'],p['i0']+n0//2);p['i1']=p['i0']+int(np.argmin(np.linalg.norm(P0x[w1]-p['xy'][-1],axis=1)));cur=p['i1']
 # 4) Deformação suave do mapa (thin-plate spline): cada ponto do mapa numa peça fixa vai para a mesma fração de
 #    comprimento da peça real. Os trechos só do mapa (Curvas 1, 2 e 4, Sargento, Junção) seguem essa deformação.
 src,dst=[],[]
 for p in pieces:
  if p['kind']=='mapa':continue
  seg=P0x[p['i0']:p['i1']+1];cs=arc(seg);cp=arc(p['xy'])
  for k in range(0,len(seg),8):
   fr=cs[k]/max(cs[-1],1e-9)*cp[-1];src.append(seg[k]);dst.append([np.interp(fr,cp,p['xy'][:,j]) for j in range(2)])
 src,dst=np.array(src),np.array(dst)
 tps=RBFInterpolator(src,dst-src,kernel='thin_plate_spline',smoothing=args.suavizacao,degree=1);P1x=P0x+tps(P0x)
 res_tps=np.linalg.norm(src+tps(src)-dst,axis=1)
 print(f'deformação: {len(src)} âncoras, resíduo mediano {np.median(res_tps):.2f} m (p95 {np.percentile(res_tps,95):.2f})',flush=True)
 for k,p in enumerate(pieces):
  if p['kind']!='mapa':continue
  prev,nxt=pieces[k-1],pieces[k+1];seg=P1x[prev['i1']:nxt['i0']+1].copy();c=arc(seg)
  if c[-1]<2:p['xy']=np.vstack([prev['xy'][-1],nxt['xy'][0]]);continue
  w=(c/c[-1])[:,None];seg+=(prev['xy'][-1]-seg[0])*(1-w)+(nxt['xy'][0]-seg[-1])*w;p['xy']=resample(seg,DS)

 # 5) Concatenação; emendas por curvas de Hermite (do lado da pista atual só 4 m mudam, do outro 20 m).
 parts=[]
 for k,p in enumerate(pieces):
  q=resample(p['xy'],DS);parts.append((q if k==0 else q[1:],k))
 XY=np.vstack([q for q,_ in parts]);tag=np.concatenate([np.full(len(q),k) for q,k in parts])
 keep=np.r_[True,np.linalg.norm(np.diff(XY,axis=0),axis=1)>1e-6];XY,tag=XY[keep],tag[keep]
 if np.linalg.norm(XY[-1]-XY[0])<1e-6:XY,tag=XY[:-1],tag[:-1]
 for k in range(1,len(pieces)):
  b=int(np.flatnonzero(tag==k)[0]);c=arc(XY)
  la=4 if pieces[k-1]['kind']=='atual' else 20;lb=4 if pieces[k]['kind']=='atual' else 20
  i0=int(np.searchsorted(c,c[b]-la));i1=min(int(np.searchsorted(c,c[b]+lb)),len(XY)-2);T=tangents(XY)
  H=hermite(XY[i0],T[i0],XY[i1],T[i1],DS);ch=arc(H);cut=np.interp(c[b]-c[i0],[0,c[i1]-c[i0]],[0,ch[-1]])
  ht=np.where(ch<cut,k-1,k)
  XY=np.vstack([XY[:i0],H,XY[i1+1:]]);tag=np.concatenate([tag[:i0],ht,tag[i1+1:]])
 # Trechos fora da pista atual: suavização leve (15 m) sem mexer nas pontas.
 free=np.array([pieces[t]['kind']!='atual' for t in tag])
 sm=np.column_stack([savgol_filter(XY[:,j],121,3,mode='wrap') for j in range(2)])
 inner=free&np.r_[False,free[:-1]]&np.r_[free[1:],False]
 for _ in range(6):inner=inner&np.r_[False,inner[:-1]]&np.r_[inner[1:],False]
 wgt=smoothstep(uniform_filter1d(inner.astype(float),25,mode='wrap'))[:,None];XY=XY*(1-wgt)+sm*wgt

 # 6) Reamostragem a 1 m em coordenadas do jogo, s horizontal, alturas.
 G=XY*K;c=arc(np.vstack([G,G[:1]]));L=c[-1];sf=np.arange(0,L-.5,1.)
 Gf=np.column_stack([np.interp(sf,c,np.r_[G[:,j],G[0,j]]) for j in range(2)])
 tagf=tag[np.clip(np.searchsorted(c,sf,side='right')-1,0,len(tag)-1)]
 cur_s,dist=today.project(Gf/K);onTrack=(dist<.35)&np.array([pieces[t]['kind']=='atual' for t in tagf])
 # Fora da pista atual o eixo pode passar por muros, taludes e prédios novos: mediana e média longas.
 zg=ground.z(Gf/K);zg=savgol_filter(median_filter(zg,41,mode='wrap'),101,2,mode='wrap')
 zt=today.zat(cur_s);Z=np.where(onTrack,zt,zg)
 for a,b,v in runs(onTrack):                     # o solo encosta no z da pista atual em rampas de até 40 m
  if v:continue
  m=b-a;k=np.arange(m);ia,ib=(a-1)%len(Z),b%len(Z)
  if onTrack[ia]:Z[a:b]+=(zt[ia]-zg[a])*smoothstep(1-k/min(40,m))
  if onTrack[ib]:Z[a:b]+=(zt[ib]-zg[b-1])*smoothstep(1-(m-1-k)/min(40,m))
 for _ in range(400):                            # rampa máxima de 14% (a pista atual chega a 13,7%) fora dela
  steep=np.abs(np.diff(np.r_[Z,Z[0]]))>.14
  if not steep.any():break
  m=uniform_filter1d((steep|np.r_[steep[-1],steep[:-1]]).astype(float),9,mode='wrap')>0
  Z=np.where(m&~onTrack,uniform_filter1d(Z,5,mode='wrap'),Z)
 L3=float(np.sum(np.hypot(np.linalg.norm(np.diff(np.vstack([Gf,Gf[:1]]),axis=0),axis=1),np.diff(np.r_[Z,Z[0]]))))
 print(f'volta antiga: {L:.0f} m na horizontal, {L3:.0f} m em 3D ({time.time()-t0:.0f} s)',flush=True)
 return dict(today=today,J=J,P0=P0,P1=P1x[:n0],snaps=snaps,pieces=pieces,s=sf,G=Gf,Z=Z,tag=tagf,cur=np.where(onTrack,cur_s,np.nan),
  onTrack=onTrack,L=float(L),L3=L3,ortho=ortho,K=K,ground=ground.kind,svg_len=float(svg_len),svg_median=float(np.median(d0)),
  tps_res=float(np.median(res_tps)))

# ---------------------------------------------------------------- tabelas para a narração
def describe(r):
 s,G,K,today,pieces,tag,cur=r['s'],r['G'],r['K'],r['today'],r['pieces'],r['tag'],r['cur'];U=G/K;L=r['L']
 def at_cur(v,prefer=None):
  m=np.isfinite(cur);d=np.abs(((cur-v+today.L/2)%today.L)-today.L/2);d[~m]=np.inf;return float(s[int(np.argmin(d))])
 def at_pt(p):return float(s[int(np.argmin(np.linalg.norm(U-np.array(p),axis=1)))])
 def where(spec):return at_cur(spec[1]) if spec[0]=='cur' else at_pt(spec[1])
 rd=lambda v:round(float(v),1)
 # trechos por situação, subdivididos pelos nomes
 cuts=sorted((where((kind,val)),name) for name,kind,val in NAMES)
 stat=np.array([pieces[t]['status'] for t in tag])
 bounds=sorted(set([0.]+[c for c,_ in cuts]+[float(s[a]) for a,_,_ in runs(stat)]))
 segs=[]
 for a,b in zip(bounds,bounds[1:]+[L]):
  if b-a<1:continue
  i=int(np.searchsorted(s,(a+b)/2));name=[n for c,n in cuts if c<=(a+b)/2][-1] if any(c<=(a+b)/2 for c,_ in cuts) else cuts[-1][1]
  seg=dict(from_s=rd(a),to_s=rd(b),status=str(stat[i]),name=name)
  if stat[i]!='cortado':
   ia,ib=int(np.searchsorted(s,a)),min(int(np.searchsorted(s,b))-1,len(s)-1)
   ca,cb=cur[ia:ib+1][np.isfinite(cur[ia:ib+1])][[0,-1]] if np.isfinite(cur[ia:ib+1]).any() else (np.nan,np.nan)
   seg.update(current_from_s=rd(ca),current_to_s=rd(cb))
  if segs and segs[-1]['name']==seg['name'] and segs[-1]['status']==seg['status']:segs[-1]['to_s']=seg['to_s'];segs[-1].update({k:v for k,v in seg.items() if k=='current_to_s'})
  else:segs.append(seg)
 # marcas
 h=np.unwrap(np.arctan2(*np.gradient(G,axis=0).T[::-1]));kap=np.gradient(h)/np.maximum(np.linalg.norm(np.gradient(G,axis=0),axis=1),1e-6)
 kap=uniform_filter1d(kap,15,mode='wrap');pts=[]
 for item in POINTS:
  name,kind=item[0],item[1]
  if kind=='cur':pts.append(dict(name=name,s=rd(at_cur(item[2]))));continue
  a,b=where(item[2]),where(item[3])
  if kind=='reta':pts.append(dict(name=name,s_from=rd(a),s_to=rd(b)));continue
  idx=np.arange(int(a),int(b) if b>a else int(b+L))%len(s);pts.append(dict(name=name,s=rd(s[idx[int(np.argmax(np.abs(kap[idx])))]])))
 # confiança
 near=np.full(len(s),np.inf)
 for k,v in r['snaps'].items():
  good=v['score']>.3;C=v['coarse'][good]
  if len(C):d,_=cKDTree(C).query(U);near=np.minimum(near,d)
 lev=np.where(r['onTrack'],'pista atual',np.where(near<4,'ortofoto','mapa'))
 for _ in range(2):                               # junta pedaços curtos (<20 m) ao vizinho anterior
  rr=runs(lev)
  for a,b,v in rr:
   if b-a<20 and a>0:lev[a:b]=lev[a-1]
 conf=[dict(from_s=rd(s[a]),to_s=rd(s[b-1]+1 if b<len(s) else L),level=str(v)) for a,b,v in runs(lev)]
 new=[dict(name=n,current_from_s=float(a),current_to_s=float(b),note=t) for n,a,b,t in NEW]
 return segs,pts,conf,new,lev

def checks(r,segs):
 """Desnível Retão x Reta Oposta e outras medidas para o relatório."""
 s,G,Z,K,today=r['s'],r['G'],r['Z'],r['K'],r['today'];U=G/K
 ret=[g for g in segs if g['name']=='Retão'][0];m=(s>=ret['from_s'])&(s<=ret['to_s'])
 ro=np.arange(700,1350,1.);RO=today.xy(ro);d,i=cKDTree(RO).query(U[m]);dz=Z[m]-today.zat(ro[i])
 par=d<90
 out=dict(retao_m=round(float(ret['to_s']-ret['from_s']),1),retao_vs_reta_oposta=dict(
  distancia_mediana_m=round(float(np.median(d[par])),1),desnivel_mediano_m=round(float(np.median(dz[par])),1),
  desnivel_min_m=round(float(dz[par].min()),1),desnivel_max_m=round(float(dz[par].max()),1)),
  retao_cota=dict(inicio=round(float(Z[m][0]),1),fim=round(float(Z[m][-1]),1)))
 # Anel externo (~3.250 m): depois da Curva 3 seguia reto pela rua norte até a Junção antiga, sem a Curva 4.
 i1=int(np.argmin(np.linalg.norm(U-np.array([190.,746.]),axis=1)));jn=[g for g in segs if g['name']=='Junção' and g['status']=='cortado'][0]
 mj=(s>=jn['from_s'])&(s<=jn['to_s']);ij=np.flatnonzero(mj)[int(np.argmin(np.linalg.norm(U[mj]-np.array([-40.,712.]),axis=1)))]
 out['anel_externo_estimado_m']=round(float(s[i1]+np.linalg.norm(G[ij]-G[i1])*1.02+r['L']-s[ij]),0)
 return out

# ---------------------------------------------------------------- saídas
def write_outputs(r,args):
 segs,pts,conf,new,lev=describe(r);chk=checks(r,segs);K=r['K']
 samples=[[round(float(a),1),round(float(x),1),round(float(y),1),round(float(z),1)] for a,(x,y),z in zip(r['s'],r['G'],r['Z'])]
 source=('Mapa de 1977 ('+SVG_CREDIT+') encaixado no eixo atual e deformado pelos trechos que ainda existem; '
  'asfalto antigo na ortofoto GeoSampa 2020 (20 cm); trechos em comum com as amostras de pista.json; alturas do '
  +r['ground']+'. Reconstrução aproximada para o jogo, não é levantamento.')
 full=dict(meta=dict(length_m=round(r['L'],1),length_3d_m=round(r['L3'],1),historical_m=[7960,7873],lap_order='anticlockwise',
   coords='mesmo sistema de pista.json: x_east_m, y_north_m = (UTM 31983 - origem) x horizontal_scale_to_fia_length; z = altitude - 720',
   horizontal_scale=K,origin_utm31983=r['J']['meta']['origin_utm31983'],junctions_current_s=dict(S_A=S_A,S_B=S_B,S_F=S_F,S_C=S_C,S_D=S_D,S_E=S_E),
   svg=dict(credit=SVG_CREDIT,url=SVG_URL,length_after_fit_m=round(r['svg_len'],1),median_to_current_m=round(r['svg_median'],2),tps_residual_m=round(r['tps_res'],2)),
   checks=chk,source=source),
  columns=['s','x','y','z','status','confidence','current_s'],
  samples=[[*smp,r['pieces'][t]['status'],str(l),None if not np.isfinite(c) else round(float(c),1)] for smp,t,l,c in zip(samples,r['tag'],lev,r['cur'])],
  segments=segs,points=pts,confidence=conf,new_pieces=new,
  guides={k:dict(xy=np.round(v['coarse']*K,2).tolist(),width=v['width'].round(1).tolist(),score=v['score'].round(2).tolist()) for k,v in r['snaps'].items()})
 (R/'dados/interlagos_1940.json').write_text(json.dumps(full,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 step=4;comp=samples[::step]
 old=dict(length_m=round(r['L'],1),length_3d_m=round(r['L3'],1),lap_order='anticlockwise',columns=['s','x','y','z'],samples=comp,
  segments=segs,points=pts,confidence=conf,source=source)
 js=('// Traçado antigo de Interlagos (1940-1989), no mesmo sistema de coordenadas de dados/pista.json.\n'
  '// Gerado por scripts/gerar_tracado_1940.py; não editar à mão. s = metros na horizontal a partir da linha de chegada\n'
  '// atual, no sentido de hoje (anti-horário). status: mantido = mesmo asfalto e sentido de hoje, invertido = mesmo\n'
  '// asfalto no sentido contrário, cortado = fora do traçado atual; current_from_s/current_to_s = o trecho em s de\n'
  '// pista.json. Retas com s_from > s_to cruzam a linha de chegada. confidence: pista atual, ortofoto (asfalto antigo\n'
  '// ainda visível) ou mapa (mapa de 1977 deformado). NEW_PIECES: trechos de hoje que não existiam antes de 1990.\n'
  'export const OLD_LAYOUT='+json.dumps(old,ensure_ascii=False,separators=(',',':'))+';\n'
  'export const NEW_PIECES='+json.dumps(new,ensure_ascii=False,separators=(',',':'))+';\n')
 (R/'teste/interlagos-1940.js').write_text(js,encoding='utf-8')
 print(f'interlagos-1940.js: {len(js.encode("utf-8"))/1024:.0f} KB, {len(comp)} amostras',flush=True)
 return segs,pts,conf,new,chk

# ---------------------------------------------------------------- prévias
COL={'cortado':(255,140,0),'invertido':(40,150,255),'mantido':(40,210,90)}
def font(n):
 for f in ('arialbd.ttf','DejaVuSans-Bold.ttf','arial.ttf'):
  try:return ImageFont.truetype(f,n)
  except OSError:pass
 return ImageFont.load_default()
def render(r,pts,name,box,mpp,title,out):
 xa,xb,ya,yb=box;K=r['K'];im=r['ortho'].crop(xa,xb,ya,yb,mpp).convert('RGB')
 im=Image.blend(im,Image.new('RGB',im.size,(0,0,0)),.25);d=ImageDraw.Draw(im)
 P=lambda U:[((u[0]-xa)/mpp,(yb-u[1])/mpp) for u in U]
 lw=max(2,int(round(6/mpp)));today=r['today'];T=today.cs(np.arange(0,today.L,1.))
 d.line(P(np.vstack([T,T[:1]])),fill=(255,255,255),width=max(1,lw//3))
 U=r['G']/K;st=np.array([r['pieces'][t]['status'] for t in r['tag']])
 for a,b,v in runs(st):d.line(P(U[a:min(b+1,len(U))]),fill=COL[v],width=lw,joint='curve')
 f=font(max(12,int(15*min(1.6,1.2/mpp**.5))))
 for p in pts:
  sv=p.get('s',p.get('s_from'));i=int(np.argmin(np.abs(r['s']-sv)));x,y=P(U[i:i+1])[0]
  if 0<=x<im.size[0] and 0<=y<im.size[1]:
   d.ellipse([x-4,y-4,x+4,y+4],fill=(255,255,255),outline=(0,0,0))
   d.text((x+7,y-8),p['name'],fill=(255,255,255),font=f,stroke_width=3,stroke_fill=(0,0,0))
 ft=font(20);d.rectangle([0,0,im.size[0],30],fill=(0,0,0));d.text((8,4),title,fill=(255,255,255),font=ft)
 lg=[('cortado em 1990',COL['cortado']),('mesmo asfalto, sentido invertido',COL['invertido']),('mantido',COL['mantido']),('pista atual',(255,255,255))]
 x=8;y=im.size[1]-26;d.rectangle([0,y-4,im.size[0],im.size[1]],fill=(0,0,0))
 for t,c in lg:d.rectangle([x,y+4,x+22,y+12],fill=c);d.text((x+28,y),t,fill=(255,255,255),font=font(14));x+=int(d.textlength(t,font=font(14)))+60
 im.save(out/f'{name}.jpg',quality=88);return im
def profile(r,out):
 W,H=1400,420;im=Image.new('RGB',(W,H),(255,255,255));d=ImageDraw.Draw(im);s,Z=r['s'],r['Z'];L=r['L']
 zmin,zmax=np.floor(Z.min()/5)*5,np.ceil(Z.max()/5)*5;X=lambda v:50+v/L*(W-70);Yp=lambda z:H-40-(z-zmin)/(zmax-zmin)*(H-80)
 for z in np.arange(zmin,zmax+1,5):d.line([(50,Yp(z)),(W-20,Yp(z))],fill=(225,225,225));d.text((5,Yp(z)-7),f'{z+720:.0f}',fill=(90,90,90))
 for v in range(0,int(L),500):d.line([(X(v),H-40),(X(v),40)],fill=(235,235,235));d.text((X(v)-10,H-30),str(v),fill=(90,90,90))
 st=np.array([r['pieces'][t]['status'] for t in r['tag']])
 for a,b,v in runs(st):d.line([(X(s[k]),Yp(Z[k])) for k in range(a,min(b+1,len(s)))],fill=COL[v],width=3)
 d.text((50,10),'Altitude ao longo da volta antiga (m) x distância desde a linha de chegada (m)',fill=(0,0,0),font=font(16))
 im.save(out/'perfil.jpg',quality=90);return im
def previews(r,pts,out):
 out.mkdir(parents=True,exist_ok=True);ims=[]
 views=[('visao_geral',(-480,420,-470,820),1.1,'Interlagos 1940-1989 sobre a ortofoto de 2020'),
  ('curvas_1_2_s_do_senna',(-340,190,-450,-180),.5,'Curvas 1 e 2 antigas e o S do Senna'),
  ('retao_reta_oposta',(20,380,-360,640),.8,'Retão (pista auxiliar) e Reta Oposta'),
  ('curvas_3_4',(-20,380,480,800),.55,'Curva 3, reta norte e Curva 4'),
  ('sol_sargento_laranja',(-420,120,-380,300),.7,'Curva do Sol, Sargento e Laranja'),
  ('ferradura',(-420,-60,-20,320),.5,'Reta longa e Ferradura'),
  ('juncao',(-260,60,520,760),.45,'Junção antiga')]
 for v in views:ims.append(render(r,pts,*v,out))
 ims.append(profile(r,out))
 cw,ch=900,760;M=Image.new('RGB',(2*cw,ch*((len(ims)+1)//2)),(20,20,20))
 for k,im in enumerate(ims):
  im=im.copy();im.thumbnail((cw-8,ch-8),Image.LANCZOS)
  M.paste(im,((k%2)*cw+(cw-im.size[0])//2,(k//2)*ch+(ch-im.size[1])//2))
 M.save(out/'mosaico.jpg',quality=85)

if __name__=='__main__':
 ap=argparse.ArgumentParser(description='Traçado antigo de Interlagos (1940-1989) nas coordenadas do jogo.')
 ap.add_argument('--fontes');ap.add_argument('--lidar');ap.add_argument('--svg')
 ap.add_argument('--suavizacao',type=float,default=30.);ap.add_argument('--sem-previas',action='store_true')
 args=ap.parse_args();r=build(args);segs,pts,conf,new,chk=write_outputs(r,args)
 print(json.dumps(dict(length_m=round(r['L'],1),length_3d_m=round(r['L3'],1),checks=chk),ensure_ascii=False,indent=1))
 for g in segs:print(f"  {g['from_s']:7.1f}-{g['to_s']:7.1f} {g['status']:9s} {g['name']}"+(f"  (atual {g['current_from_s']}->{g['current_to_s']})" if 'current_from_s' in g else ''))
 for p in pts:print('  ',p)
 if not args.sem_previas:previews(r,pts,R/'renders/historia/tracado_1940');print('prévias em renders/historia/tracado_1940/')
