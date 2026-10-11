"""Windscreen and rear window of the Opala 99 V06 bent to the body's openings.

V04's glasses (kept by V05) are flat panes with straight top and bottom edges, and their rubbers are round tubes
around those edges, while the body round them is crowned across the car. The roof's front edge falls from z 1.286
at the middle to 1.249 at the corners and the windscreen's top stopped at 1.24 all the way across: a 3.5 cm slot
under the roof's edge at the middle. The cowl falls from 0.890 to 0.870 toward the A pillars and the windscreen's foot
stayed at 0.899: open corners. At the back the deck strip under the rear window falls from 0.982 to 0.942 toward the
C pillars and the glass's foot stayed at 0.976 (the deck cut through the glass at the middle, the corners stood 3-4
cm open, and the cabin showed through them); the roof's rear edge stood 2.6 cm over the glass's top rubber. With the
cabin lit from inside, light came out along all four edges.

Each glass is bent by a smooth field, the same for the glass, its rubber and what sits on it (the windscreen's
stickers, the rear window's vents and rivets): every point moves by (1-t)*D_foot(y) + t*D_top(y), t being where it lies
between the old foot (0) and top (1) along the slope. D_foot and D_top bring the old edges onto the body's edges,
measured with rays, smoothed as even polynomials in y (the car is symmetric): at the tops the rubber tucks under the
roof's edge with a bead showing; at the feet it rests on the cowl and on the deck strip. The glass stays straight up
the slope and gets a crown across the car, as real ones do. It is subdivided first, so the crown is smooth, and smooth
shaded. In the windscreen's last 12 cm each side the foot keeps its height (the door's inner frame is right under the
corner) and its rubber's underside is stretched down to the cowl instead (gasket).
The rubbers keep their rings of 8 vertices (the A pillars are built on the windscreen rubber's centre line afterwards:
v06_lateral.a_pillars). The wipers are rebuilt on the bent glass by v06_detalhes.parked_wipers.

The game's cockpit (cockpit.js, V06 view) has a sun strip 7 mm inside the windscreen's top and a strip closing its
foot behind the dash top: both bend with this glass through cockpit.js's copy of the windscreen's field (V06_GLASS).
The build prints the field and stops when that copy differs (check_cockpit); paste the printed line into cockpit.js,
then export the interior again (exportar_interior_jogo.py) before rebuilding.
"""
import bpy,bmesh,json,math,re
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v06_comum import world_verts,set_world_verts,finish

# name, its rubber, what sits on it (name prefixes), and for each edge: the body it meets, the z window of the rays,
# the march (x start, x end) from the glass toward the body, and the target: past, how far along the march the rubber's
# centre goes past the body's edge; sit: 'under' tucks the rubber under the body's edge (its centre under the surface by
# its radius less BEAD, so a bead of rubber shows at the joint: the tops, under the roof's edges), 'on' rests it on the
# body (its lowest point SEAT into the surface: the feet, on the cowl and on the deck strip, as on carro_6 and carro_23).
BEAD=.0025;SEAT=.002
WINDOWS=(
 dict(glass='Para_brisa',rubber='Borracha_parabrisa',riders=('Numero_parabrisa','Faixa_invent_parabrisa'),
  top=dict(body='roof',z=(1.20,1.34),march=(.56,.40),past=.005,sit='under'),
  foot=dict(body='cowl',z=(.84,.93),march=(.90,1.00),past=.002,sit='on')),
 dict(glass='Vidro_traseiro',rubber='Borracha_vidro_traseiro',riders=('Abertura_ventilacao','Rebite_vidro_traseiro'),
  top=dict(body='roof',z=(1.15,1.27),march=(-.95,-.80),past=.005,sit='under'),
  foot=dict(body='deck',z=(.90,1.01),march=(-1.47,-1.60),past=.002,sit='on')))
# The windscreen's foot comes back to its old height in the last 12 cm of each corner: there the cowl dips to 0.87,
# under the top of the door's inner frame (0.884, |y| from 0.739), which a lower rubber would cut into. The rubber's
# underside is stretched down to the cowl instead (GASKET_Y: never out where the door frame is).
FOOT_TAPER={'Para_brisa':(.60,.72)};GASKET_Y=.725
FOOT_Y_MAX={'Para_brisa':.74,'Vidro_traseiro':.70}   # foot measured inside this (the corners take the fit's end value)
TOP_Y_MAX=.60                  # the roof is .62 wide: the top edge and its rounded corners measured inside this

NOT_BODY=('Para_brisa','Vidro_traseiro','Borracha_','Abertura_ventilacao','Rebite_vidro_traseiro','Numero_parabrisa','Faixa_invent',
 'Limpador','Interior_','Gaiola','Rede_','Vigia','Adesivos_vigia','Moldura_vigia','Piso','Carcaca_espelho','Vidro_espelho')
def body_bvh(names=None):
 O=bpy.data.objects;skip_roots={'Interior_do_jogo','Motor_CONJUNTO'}
 V=[];F=[]
 for o in O:
  if o.type!='MESH' or not len(o.data.polygons):continue
  if names is not None and o.name not in names:continue
  if names is None and o.name.startswith(NOT_BODY):continue
  if names is None and any(m and m.name=='Policarbonato_fume' for m in o.data.materials):continue
  p=o.parent;inside=False
  while p is not None:
   if p.name in skip_roots:inside=True
   p=p.parent
  if inside:continue
  W=world_verts(o);b=len(V);V.extend(map(tuple,W));F.extend(tuple(i+b for i in q.vertices) for q in o.data.polygons)
 return BVHTree.FromPolygons(V,F)

def down(T,x,y,z):
 h=T.ray_cast(Vector((x,y,3.)),Vector((0,0,-1)))
 while h[0] is not None and h[0].z>z[1]:h=T.ray_cast(h[0]-Vector((0,0,1e-4)),Vector((0,0,-1)))
 return h[0].z if h[0] is not None and h[0].z>=z[0] else None

def body_edge(T,y,e):
 """The body's edge met marching from the glass toward it: (x of the edge, z of the body's surface just past it)."""
 x0,x1=e['march'];step=.001*np.sign(x1-x0)
 for x in np.arange(x0,x1,step):
  z=down(T,x,y,e['z'])
  if z is not None:
   z2=down(T,x+4*step,y,e['z']);return x,(z2 if z2 is not None else z)
 return None

DEG=(0,2,4,6)
def even_coeffs(ys,v):return np.linalg.lstsq(np.stack([ys**k for k in DEG],1),v,rcond=None)[0]
def even_eval(c,y):return np.stack([np.asarray(y,float)**k for k in DEG],-1)@c

def subdivide(o,cuts=2):
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.subdivide_edges(bm,edges=bm.edges[:],cuts=cuts,use_grid_fill=True);bm.to_mesh(o.data);bm.free();o.data.update()

def bend(w,T_roof,T_cowl,T_body):
 O=bpy.data.objects;g=O[w['glass']];r=O[w['rubber']]
 G=world_verts(g);c=G.mean(0);n=np.linalg.svd(G-c)[2][2]
 n*=np.sign(n[2]);up=np.array((0,0,1.))-n[2]*n;up/=np.linalg.norm(up)  # outward normal; up the slope, in the glass
 a=(G-c)@up;a0,a1=a.min(),a.max()
 foot=G[a<a0+.002];top=G[a>a1-.002]
 Eb=np.array((foot[:,0].mean(),0,foot[:,2].mean()));Et=np.array((top[:,0].mean(),0,top[:,2].mean()))
 Rr=world_verts(r).reshape(-1,8,3);rc=Rr.mean(1);rad=np.linalg.norm(Rr-rc[:,None],axis=2).mean(1);ra=(rc-c)@up
 r_foot=float(np.median(rad[ra<a0+.01]));r_top=float(np.median(rad[ra>a1-.01]))
 fits={}
 for key,E,rr,ymax,T in (('foot',Eb,r_foot,min(FOOT_Y_MAX[w['glass']],np.abs(foot[:,1]).max()),{'cowl':T_cowl,'deck':T_body}[w['foot']['body']]),
                         ('top',Et,r_top,min(TOP_Y_MAX,np.abs(G[a>a1-.04][:,1]).max()),T_roof)):
  e=w[key];ys=[];D=[]
  for y in np.linspace(-ymax,ymax,57):
   hit=body_edge(T,float(y),e)
   if hit is None:continue
   xe,ze=hit;dirx=np.sign(e['march'][1]-e['march'][0])
   zc=ze-(rr-BEAD) if e['sit']=='under' else ze+rr-SEAT
   ys.append(y);D.append((xe+dirx*e['past']-E[0],zc-E[2]))
  ys=np.array(ys);D=np.array(D);assert len(ys)>20,(w['glass'],key,len(ys))
  # the worst sample goes while it is more than 3 mm off the fit (a corner of the roof is not quite symmetric)
  for _ in range(8):
   cx,cz=even_coeffs(ys,D[:,0]),even_coeffs(ys,D[:,1])
   off=np.abs(np.stack([even_eval(cx,ys),even_eval(cz,ys)],1)-D).max(1);k=int(np.argmax(off))
   if off[k]<.003 or len(ys)<=20:break
   ys,D=np.delete(ys,k),np.delete(D,k,axis=0)
  lim=float(np.abs(ys).max())
  fx=lambda y,cx=cx:even_eval(cx,y);fz=lambda y,cz=cz:even_eval(cz,y)
  fits[key]=(fx,fz,lim,cx,cz)
  res=np.abs(np.stack([fx(ys),fz(ys)],1)-D).max()
  print(f'V06 {w["glass"]} {key}: rubber r {rr*1000:.1f} mm, edge measured over |y|<{lim:.2f}, moves dz {fz(0.):+.3f} at the middle, '
        f'{fz(lim):+.3f} at the end (dx {fx(0.):+.3f}/{fx(lim):+.3f}); fit within {res*1000:.1f} mm',flush=True)
 taper=FOOT_TAPER.get(w['glass'],(8.,9.))
 def D(P):
  t=np.clip(((P-c)@up-a0)/(a1-a0),0,1)[:,None];out=[]
  for key in ('foot','top'):
   fx,fz,lim=fits[key][:3];yy=np.clip(P[:,1],-lim,lim);out.append(np.stack([fx(yy),np.zeros(len(P)),fz(yy)],1))
  s_=np.clip((np.abs(P[:,1])-taper[0])/(taper[1]-taper[0]),0,1);out[0]*=(1-s_*s_*(3-2*s_))[:,None]
  return (1-t)*out[0]+t*out[1]
 subdivide(g)
 targets=[g,r]+[o for o in O if o.type=='MESH' and o.name.startswith(w['riders'])]
 for o in targets:
  P=world_verts(o);set_world_verts(o,P+D(P))
 finish(g.data,40)
 if w['glass'] in FOOT_TAPER:gasket(r,c,up,a0,a1,T_cowl)
 return dict(c=c,n=n,up=up,a0=a0,a1=a1,fits=fits,taper=taper)

def gasket(r,c,up,a0,a1,T):
 """Where the foot's rubber still stands over the cowl (the corners, see FOOT_TAPER), its underside is stretched down
 to the cowl's surface: the half of each ring under its centre, scaled about the centre."""
 R=world_verts(r).reshape(-1,8,3);rc=R.mean(1);t=((rc-c)@up-a0)/(a1-a0);n=0;most=0.
 for i in np.nonzero((t<.08)&(np.abs(rc[:,1])<=GASKET_Y))[0]:
  cx,cy,cz=rc[i];zb=down(T,float(cx)+.006,float(cy),(.84,.93))
  low=R[i][:,2].min()
  if zb is None or low<=zb+.0005:continue
  k=(cz-zb+.001)/(cz-low);m=R[i][:,2]<cz;R[i][m,2]=cz-(cz-R[i][m,2])*k;n+=1;most=max(most,low-zb)
 set_world_verts(r,R.reshape(-1,3))
 print(f'V06 {r.name}: underside of {n} rings stretched down to the cowl (gap up to {most*1000:.0f} mm)',flush=True)

def game_field(f):
 """The windscreen's field as cockpit.js V06_GLASS takes it (Blender car frame: x forward, y driver side, z up; the
 cockpit converts): c, up, a0, a1 place t; foot/top: [x coefficients, z coefficients, |y| limit], powers 0, 2, 4, 6;
 taper: |y| where the foot's move starts to fade (smoothstep) and where it is gone."""
 r=lambda v,k=5:[round(float(x),k) for x in v]
 return {'c':r(f['c']),'up':r(f['up']),'a0':round(float(f['a0']),5),'a1':round(float(f['a1']),5),
  **{k:[r(f['fits'][k][3],6),r(f['fits'][k][4],6),round(f['fits'][k][2],4)] for k in ('foot','top')},'taper':list(f['taper'])}
COCKPIT=Path(__file__).resolve().parents[2]/'pista_interlagos/teste/cockpit.js'
def check_cockpit(field):
 """cockpit.js bends its V06 sun strip and windscreen-foot strip with its own copy of the field: it must match."""
 m=re.search(r'const V06_GLASS=Object\.freeze\((\{.*?\})\);',COCKPIT.read_text(encoding='utf-8'))
 assert m,'V06_GLASS nao encontrado em cockpit.js'
 game=json.loads(m.group(1))
 def flat(d):return np.array([*d['c'],*d['up'],d['a0'],d['a1'],*[v for k in ('foot','top') for v in (*d[k][0],*d[k][1],d[k][2])],*d['taper']],float)
 diff=np.abs(flat(game)-flat(field)).max()
 assert diff<5e-5,f'cockpit.js V06_GLASS difere do para-brisa gerado ({diff:.2e}): copie a linha V06_GLASS impressa acima para cockpit.js'
def build():
 # the build runs this on V05's parts: the cowl is still the rear of the one-piece hood (Capo) and the deck strip the
 # front of the one-piece lid; the V06 cuts come later and leave those edges where they are
 roof=body_bvh(['Teto_cupe']);cowl=body_bvh(['Torpedo_ventilacao','Capo']);body=body_bvh()
 out={}
 for w in WINDOWS:out[w['glass']]=bend(w,roof,cowl,body)
 field=game_field(out['Para_brisa']);print('V06_GLASS',json.dumps(field,separators=(',',':')),flush=True)
 check_cockpit(field)
 return out
