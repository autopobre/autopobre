"""Bordas de Interlagos ao lado das zebras, lidas de novo na ortofoto GeoSampa 2020 de 20 cm.

Pedido de 27/10/2026: nas curvas a borda do asfalto fazia zigue-zague; na Ferradura ela comecava do lado de dentro da
zebra, terminava do lado de fora e ficava torta no meio. refinar_tracado.py achou as bordas pelas linhas brancas
pintadas; onde a borda tem zebra, os blocos brancos da zebra tambem parecem linha, e a borda ficou ora do lado de dentro
da zebra, ora do lado de fora (ate 1,7 m para fora no S do Senna). O jogo desenha a zebra por fora da borda
(track-surface.js createCurbs): com a borda do lado de fora, a zebra ia parar na grama, ou nem era marcada (a deteccao
de zebra olhava a grama alem dela).

Metodo: em cada estacao (2 m) e de cada lado, um transecto atravessado de DENTRO m para dentro ate FORA m para fora da
borda atual, a cada 0,1 m, lido em LINHAS de -1 a 1 m ao longo da volta. A zebra e onde o brilho alterna ao longo da
volta (blocos claros e escuros: desvio padrao de ALTERNA ou mais) numa faixa clara (brilho medio de CLARA ou mais) de
0,5 m ou mais; o asfalto e liso. A borda fica onde a alternancia chega a meio caminho entre a do asfalto e a da zebra,
do lado de dentro da zebra, quando ha asfalto liso logo antes (e no maximo AFORA m para fora da borda atual: mais longe,
e uma zebra que sai da pista, ao longo de uma via de acesso). Estacoes com zebra seguidas, com falhas de ate FALHA
estacoes, formam um trecho (de MINIMO estacoes ou mais); nele a borda vai para o lado de dentro da zebra (mediana de 5
estacoes, as falhas interpoladas, alem das pontas a mudanca se desfaz em RAMPA estacoes, e a mudanca toda e
arredondada ao longo da volta em SUAVE estacoes: sem quina no eixo) e a marca de zebra da
estacao (colunas 13 direita, 14 esquerda) acende. Fora das zebras nada muda, nem a menos de PIT m do pit lane (a
juncao das duas pistas, ja ligada por refinar_tracado.py). O centro e a largura seguem as duas bordas; a altura do
centro segue o plano da pista (a inclinacao transversal) onde ele andou.

Rodar de novo quase nao muda mais (alguns centimetros; 0,35 m numa ou outra estacao): a borda ja esta do lado de dentro
da zebra. Na primeira vez (27/10/2026): 36 trechos, 628 estacoes-lado, a borda ate 2 m para dentro (S do Senna).
Entrada e saida: dados/pista.json (ou --entrada / --saida outro.json). Precisa de fontes/orto_20cm (refinar_tracado.py
baixa).
  python scripts/corrigir_bordas_zebras.py [--entrada arquivo.json] [--saida arquivo.json]
"""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import numpy as np
from scipy.ndimage import median_filter,gaussian_filter1d
import refinar_tracado as rt

R=Path(__file__).resolve().parents[1]
DENTRO,FORA,PASSO=3.5,1.6,.1
LINHAS=np.arange(-1.0,1.01,.2)
ALTERNA,CLARA,LISO,AFORA=15.,150.,12.,.3
FALHA,MINIMO,RAMPA,SUAVE,PIT=3,4,5,2.,3.

def transectos(A,K,O):
 """Brilho (estacao, lado, linha ao longo, posicao atravessada) e as posicoes atravessadas (a partir do centro)."""
 n=len(A);d=np.arange(-DENTRO,FORA+1e-9,PASSO)
 t=A[:,7:9];lft=A[:,9:11];w=A[:,4]
 out=[]
 for side in (-1,1):
  off=side*(w[:,None]/2+d[None,:])  # (n, cols)
  P=A[:,None,None,1:3]+LINHAS[None,:,None,None]*t[:,None,None,:]+off[:,None,:,None]*lft[:,None,None,:]
  out.append(rt.rgb(P/K+O).astype(np.float32).mean(-1))
 return d,np.stack(out,1)  # (n, 2, rows, cols)

def borda(lum,d):
 """Deslocamento da borda (m, para fora) ate o lado de dentro da zebra, ou None sem zebra."""
 std=lum.std(0);mean=lum.mean(0);zebra=std>=ALTERNA;k=0;runs=[]
 while k<len(d):
  if zebra[k]:
   j=k
   while j+1<len(d) and zebra[j+1]:j+=1
   if (j-k+1)*PASSO>=.5 and mean[k:j+1].mean()>=CLARA:runs.append((k,j))
   k=j+1
  else:k+=1
 if not runs:return None
 a,b=runs[0]
 if a<9:return None
 dentro=slice(a-9,a-3)
 if not ((std[dentro]<LISO).all() and (mean[dentro]<170).all()):return None
 meio=(std[dentro].mean()+std[a:b+1].max())/2;k=a
 while k>0 and std[k-1]>=meio:k-=1
 while k<b and std[k]<meio:k+=1
 f=(meio-std[k-1])/(std[k]-std[k-1]) if std[k]!=std[k-1] else 1.
 # (Out past the edge only a little: further out, a kerb that leaves the track, along an access road.)
 e=float(d[k-1]+f*PASSO)
 return e if e<=AFORA else None

def perto_do_pit(A,pit,side):
 """Estacoes cuja borda daquele lado chega a PIT m da faixa do pit lane."""
 if not pit:return np.zeros(len(A),bool)
 from scipy.spatial import cKDTree
 c={k:i for i,k in enumerate(pit['columns'])};P=np.array(pit['samples'])
 xy=P[:,[c['x'],c['y']]];tree=cKDTree(xy);near=np.zeros(len(A),bool)
 for g in np.arange(0,PIT+1e-9,.5):
  pts=A[:,1:3]+(side*(A[:,4]/2+g))[:,None]*A[:,9:11]
  _,idx=tree.query(pts,k=2)
  for j in range(2):
   q=P[idx[:,j]];rel=pts-xy[idx[:,j]];l=np.hypot(q[:,c['lx']],q[:,c['ly']])
   dd=(rel[:,0]*q[:,c['lx']]+rel[:,1]*q[:,c['ly']])/l;along=np.abs(rel[:,0]*q[:,c['tx']]+rel[:,1]*q[:,c['ty']])
   near|=(along<=1.2)&(dd>=q[:,c['lo']]-.5)&(dd<=q[:,c['hi']]+.5)
 return near

def trechos(achou):
 """Trechos de zebra numa volta fechada: falhas de ate FALHA fechadas, trechos de menos de MINIMO fora."""
 n=len(achou);v=achou.copy()
 idx=np.flatnonzero(v)
 for a,b in zip(idx,np.r_[idx[1:],idx[:1]+n]):
  if 1<b-a<=FALHA+1:v[np.arange(a+1,b)%n]=True
 out=[];start=None
 if v.all():return [(0,n-1)]
 k0=int(np.flatnonzero(~v)[0])
 for k in range(k0,k0+n+1):
  on=v[k%n] if k<k0+n else False
  if on and start is None:start=k
  if not on and start is not None:
   if k-start>=MINIMO:out.append((start,k-1))
   start=None
 return out

def main():
 arg=lambda name:Path(sys.argv[sys.argv.index(name)+1]) if name in sys.argv else R/'dados/pista.json'
 src,dest=arg('--entrada'),arg('--saida');J=json.loads(src.read_text(encoding='utf-8'))
 A=np.array(J['samples']);n=len(A);K=J['meta']['horizontal_scale_to_fia_length'];O=np.array(J['meta']['origin_utm31983'][:2])
 rt.M=rt.tiles()
 d,lum=transectos(A,K,O)
 change=np.zeros((n,2));flags=np.zeros((n,2),bool);report={}
 for k,side in enumerate((-1,1)):
  found=np.full(n,np.nan)
  for i in range(n):
   e=borda(lum[i,k],d)
   if e is not None:found[i]=e
  pit=perto_do_pit(A,J.get('pit'),side);found[pit]=np.nan
  runs=trechos(~np.isnan(found))
  c=np.zeros(n)
  for a,b in runs:
   ii=np.arange(a,b+1)%n;v=found[ii];ok=~np.isnan(v)
   v=np.interp(np.arange(len(ii)),np.flatnonzero(ok),v[ok]);v=median_filter(v,5,mode='nearest')
   c[ii]=v;flags[ii,k]=True
  # Past each end the change undone over RAMPA stations (no step where the kerb ends), then the whole change rounded
  # over SUAVE stations (the reading's jitter from one station to the next: no kink in the centre line).
  for a,b in runs:
   for end,way in ((a%n,-1),(b%n,1)):
    for r in range(1,RAMPA+1):
     j=(end+way*r)%n
     if not flags[j,k] and abs(c[j])<abs(c[end])*(1-r/(RAMPA+1)):c[j]=c[end]*(1-r/(RAMPA+1))
  c=gaussian_filter1d(c,SUAVE,mode='wrap');c[pit]=0;change[:,k]=c
  report['direita' if side<0 else 'esquerda']={'trechos':len(runs),'estacoes':int(flags[:,k].sum()),'mudanca_max_m':round(float(np.abs(c).max()),3),
   'para_dentro_mais_de_20cm':int((c<-.2).sum()),'para_fora_mais_de_20cm':int((c>.2).sum())}
 # The two edges' moves (outward) into the centre's move along the left normal and the width.
 cr,cl=change[:,0],change[:,1];delta=(cl-cr)/2;moved=np.abs(delta)>1e-6
 A[:,1]+=A[:,9]*delta;A[:,2]+=A[:,10]*delta;A[:,3]+=A[:,5]*delta;A[:,4]+=cl+cr
 # Tangent and left normal again where the centre or a neighbour moved (as the file has them: the chord's direction).
 near=moved|np.roll(moved,1)|np.roll(moved,-1)
 t=np.roll(A[:,1:3],-1,0)-np.roll(A[:,1:3],1,0);t/=np.linalg.norm(t,axis=1)[:,None]
 A[near,7]=t[near,0];A[near,8]=t[near,1];A[near,9]=-t[near,1];A[near,10]=t[near,0]
 A[:,13]=np.where(flags[:,0],1.,A[:,13]);A[:,14]=np.where(flags[:,1],1.,A[:,14])
 J['samples']=np.round(A,5).tolist()
 m=J['meta'];m['width_min_m']=float(A[:,4].min());m['width_max_m']=float(A[:,4].max())
 m['kerb_m']=float(((A[:,13]>.5).sum()+(A[:,14]>.5).sum())*m['reconstructed_xy_m']/n)
 if 'corrigir_bordas_zebras' not in m['centreline']:m['centreline']+=', bordas nas zebras (scripts/corrigir_bordas_zebras.py)'
 dest.write_text(json.dumps(J,separators=(',',':')),encoding='utf-8')
 print(json.dumps({'arquivo':str(dest),**report,'centro_max_m':round(float(np.abs(delta).max()),3),'zebra_m':round(m['kerb_m'],1)},ensure_ascii=False,indent=1))

if __name__=='__main__':main()
