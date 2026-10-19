"""The Fusca's finish outside for the game (exportar_fusca_jogo.py): a rounded nose, door mirrors on both doors,
rubber seals round the windows' cut edges inside, the engine lid's outline and its two banks of louvres, headlamps
with a chrome reflector behind clear glass, the plate ready for its letters.

The nose: criar_fusca_v2.py closes the body's front with a flat cap (straight across in plan, with a 3 cm fillet),
which shows as a flat panel between the headlamps over the bumper. RoundNose (the exporter builds the body with it)
brings the hood's front 2 cm forward, curves the front in plan (the middle leads, the fenders round back to the
headlamps) and rounds the end over 9 cm, the hood rolling down into the apron as a Fusca's does.

The door mirrors replace criar_fusca_v2.py's small chrome eggs on the cowl, which the driver could not use: a chrome
base on the door's front corner under the window, a curved arm and an oval head, its glass (Espelho_fusca) turned
as a driver sets it, the road straight back seen past the car's flank from the cockpit camera (main.js, on the
car's centre line). The head sits where that camera sees it through the door window, just behind the A-pillar, as
far forward as that allows (the game's side-mirrors.js shows the road behind in the player's glass).

Frame: criar_fusca_v2.py's (front -Y, +X the driver's left side, Z up), as fusca_cabine.py.
"""
import bpy,bmesh,math,re
import numpy as np
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
import criar_fusca_v2 as V2,medidas_fusca as MED
import fusca_cabine as C

STUDIO_MIRRORS=('Espelho_E','Espelho_D','Espelho_haste_E','Espelho_haste_D')
STUDIO_LOUVRES=re.compile(r'^Veneziana_\d+$')
HEAD=(.135,.09,.045) # the head's width, height and depth
OUT,UP=.095,.075 # the head's centre from the arm's base: out from the door, up
OUTWARD=.12 # the glass shows the road this much out past the flank (side-mirrors.js SIDE_MIRRORS.outward)

NOSE_Y,NOSE_R=-1.80,.09 # the body's front end, the radius it is rounded with
FENDER_NOSE,APRON=.19,.55 # the front fenders' half width at the nose; the base's top there (under the headlamps)
def resampled(old,front,start=-1.60,sigma=.012):
 """A criar_fusca_v2 profile with its front replaced by these points (y, value) up to start."""
 return V2.Perfil(front+[(float(y),float(old(y))) for y in np.arange(start,2.2,.02)],sigma)

class RoundNose(V2.Carroceria):
 """criar_fusca_v2.Carroceria with a rounded nose (the module's Y_NARIZ must be NOSE_Y: exportar_fusca_jogo.py)."""
 def __init__(self):
  super().__init__()
  self.ztop=resampled(self.ztop,[(-1.80,.575),(-1.78,.598),(-1.75,.628),(-1.71,.66),(-1.67,.70),(-1.62,.757)])
  self.zpiso=resampled(self.zpiso,[(-1.80,.37),(-1.78,.335),(-1.75,.305),(-1.70,.285),(-1.64,.275)],sigma=.03)
  front=[(-1.80,.40),(-1.79,.455),(-1.775,.515),(-1.755,.57),(-1.73,.62),(-1.70,.665),(-1.66,.715),(-1.62,.749)]
  self.wmax=resampled(self.wmax,front)
  self.xoF=resampled(self.xoF,front,sigma=.01)
  self.crF=resampled(self.crF,[(-1.80,.585),(-1.77,.63),(-1.74,.66),(-1.70,.70),(-1.66,.735)],sigma=.015)
  self.aD=resampled(self.aD,[(-1.80,.20),(-1.77,.48),(-1.72,.62)],start=-1.50,sigma=.02)
  self.xh=resampled(self.xh,[(-1.80,.10),(-1.77,.183)],start=-1.73,sigma=.02)
  self.zh=resampled(self.zh,[(-1.80,.575),(-1.70,.64),(-1.60,.72)],start=-1.50,sigma=.02)
 def params(self,y):
  P=super().params(y);y=np.asarray(y,float)
  front,rear=y-NOSE_Y,V2.Y_RABO-y
  arc=lambda d,r:np.where(d<r,r-np.sqrt(np.maximum(r**2-(r-d)**2,0.)),0.)
  P['fil']=np.where(front<rear,arc(front,NOSE_R),arc(rear,V2.FILETE))
  # The front fenders: bulbs round the headlamps, narrower toward the nose, with a valley between them and the hood
  # (criar_fusca_v2's 25 cm half bulbs met over the middle and filled it).
  F=P['FB'];xo=F['cx']+F['ax'];af=np.minimum(F['ax'],np.interp(y,[-1.8,-1.6,-1.3,-1.0],[FENDER_NOSE,.20,.22,.25]))
  F['cx'],F['ax']=xo-af,af
  # The base box under them stops lower at the front: the apron behind the bumper, not a wall up to the fenders.
  D=P['D'];D['azu']=np.where(y<-1.0,np.minimum(D['azu'],np.interp(y,[-1.8,-1.5,-1.0],[APRON-D['cz'],.12,.30])),D['azu'])
  return P

# --- The door windows: criar_fusca_v2's (MED.JAN_PORTA, from the drawing) with the front edge 4.5 cm further forward
# and its top corner tighter, so the A-pillar between them and the windscreen is the slim post a Fusca's is (seen
# from the cockpit it hid 8 to 12 degrees of the view). exportar_fusca_jogo.py puts it in MED.JAN_PORTA.
def door_window(outline,shift=.045,corner=.02):
 out=[]
 for y,z in outline:
  w=float(np.clip((-.10-y)/.20,0,1))
  out.append((y-(shift+corner*float(np.clip((z-1.2)/.1,0,1)))*w,z))
 return out
DOOR_WINDOW=door_window(MED.JAN_PORTA)

# --- Race prep: the bumpers off, the four fenders in the team's second colour (fusca.js paints FENDER) ---------------
STUDIO_BUMPERS=re.compile(r'^(Parachoque|Garra)_')
EXHAUST=.02 # how far the exhaust's tips stand out past the tail
FENDER='Paralama_fusca'
def fender_field(car,points):
 """At points (N, 3): how much deeper inside the fenders' bulbs (Carroceria's FB and RB) than inside the rest of the
 body's primitives (base, spine, hood rib), united as Carroceria.campo unites them. Below 0 on a fender; 0 along the
 middle of the smooth blend between them, the valley where a Fusca's bolted-on fender meets the body.
 Toward the nose and the tail the fenders meet the hood and the engine lid only (the base box thins out there into
 slivers that would cut stripes into the fenders), and the aprons between them are body: the seam runs straight
 down at APRONS' half widths."""
 y=points[:,1];P=car.params(y);x=np.abs(points[:,0]);z=points[:,2]
 a=lambda v:np.asarray(v,float) if np.ndim(v) else v
 D,S,R=P['D'],P['S'],P['R']
 spine=V2.smin(V2.superel(x,z,0.,a(S['cz']),a(S['ax']),a(S['azu']),S['azd'],a(S['n'])),V2.superel(x,z,0.,a(R['cz']),R['ax'],a(R['azu']),a(R['azu']),R['n'])+(1-a(R['pres']))*.5,.016)
 rest=V2.smin(V2.superel(x,z,0.,D['cz'],a(D['ax']),a(D['azu']),a(D['azd']),D['n']),spine,.045)
 bulbs=[]
 for name in ('FB','RB'):
  B=P[name];cx,cz,ax,az=(a(B[k]) for k in ('cx','cz','ax','azu'))
  bulbs.append(np.minimum(V2.superel(x,z,cx,cz,ax,az,az,B['n']),V2.superel(x,z,-cx,cz,ax,az,az,B['n']))+(1-a(B['pres']))*.5)
 bulb=np.minimum(*bulbs)
 ends=np.maximum(bulb-spine,np.where(y<0,APRONS[0],APRONS[1])-x)
 w=np.maximum(1-V2.degrau(y,*ENDS[0]),V2.degrau(y,*ENDS[1]))
 return (bulb-rest)*(1-w)+ends*w
# The front apron's and the rear one's half widths (under the hood, under the engine lid, whose corners are 37 cm out),
# and where the ends' rule takes over (y: from the first value to the second at the front, the other way at the rear).
APRONS=(.30,.40)
ENDS=((-1.50,-1.30),(1.55,1.75))

def fenders(car,body):
 """Before criar_fusca_v2.construir_tudo hollows and cuts it: the body's skin split exactly along the fenders' seams
 (fender_field's zero: each crossed edge cut where the field crosses it, the faces split between the cuts). Returns the
 seams as polylines on the skin [(points, outward normals, closed)] and the cuts' points (race_prep paints the faces
 on the fenders: the booleans after this renumber the body's material slots, so none is given here)."""
 me=body.data;bm=bmesh.new();bm.from_mesh(me);G=bm.verts.layers.float.new('paralama')
 # The end caps' long spokes (criar_fusca_v2 closes the nose and the tail with fans) get a point every 2 cm: across
 # the apron's straight seam the field can change sign twice along one of them.
 for e in [e for e in bm.edges if e.calc_length()>.05]:
  n=int(math.ceil(e.calc_length()/.02));a,end=e.verts
  for k in range(n,1,-1):
   _,a=bmesh.utils.edge_split(e,a,1/k);e=next(x for x in a.link_edges if x.other_vert(a) is end)
 g=fender_field(car,np.array([tuple(v.co) for v in bm.verts]));g[np.abs(g)<1e-7]=1e-7
 for v,value in zip(bm.verts,g):v[G]=float(value)
 cuts=set()
 for e in [e for e in bm.edges if e.verts[0][G]*e.verts[1][G]<0]:
  v0,v1=e.verts;_,v=bmesh.utils.edge_split(e,v0,v0[G]/(v0[G]-v1[G]));v[G]=0.;cuts.add(v)
 for f in [f for f in bm.faces if sum(v in cuts for v in f.verts)>=2]:
  # Round the face, its cuts paired in order (a saddle's four go in two pairs).
  ring=[v for v in f.verts if v in cuts];assert len(ring)%2==0,'emenda do para-lama: face com cortes ímpares'
  for a,b in [(ring[i],ring[i+1]) for i in range(0,len(ring)-1,2)]:
   face=next((q for q in a.link_faces if b in q.verts and not any(e.other_vert(a) is b for e in a.link_edges)),None)
   if face:bmesh.utils.face_split(face,a,b)
 # The seams: edges between the cuts with a fender on one side, the paint on the other (not the floor's faces).
 side=lambda f:sum(v[G] for v in f.verts)<0
 seam={}
 for e in bm.edges:
  if all(v in cuts for v in e.verts) and len(e.link_faces)==2 and side(e.link_faces[0])!=side(e.link_faces[1]) and all(f.material_index==0 for f in e.link_faces):
   for v in e.verts:seam.setdefault(v,[]).append(e.other_vert(v))
 # Chained from the lowest-numbered free end (a closed seam from its lowest vertex): the same GLB on every export.
 bm.normal_update();bm.verts.index_update();lines=[];left=set(seam);first=lambda vs:min(vs,key=lambda v:v.index)
 while left:
  ends=[v for v in left if len(seam[v])==1];start=first(ends or left);line=[start];left.discard(start)
  while True:
   nxt=next((w for w in sorted(seam[line[-1]],key=lambda v:v.index) if w in left),None)
   if nxt is None:break
   line.append(nxt);left.discard(nxt)
  if len(line)>3:lines.append(([v.co.copy() for v in line],[v.normal.copy() for v in line],line[0] in seam[line[-1]]))
 points=[v.co.copy() for v in cuts]
 bm.to_mesh(me);bm.free()
 print('PARALAMAS emendas',len(lines),'pontos',[len(p) for p,_,_ in lines],flush=True)
 return lines,points

# --- Headlamps set into the fenders (the user: "o farol não é tão saltado pra fora, ele é mais pra dentro, bem perto
# do para-lama"). criar_fusca_v2 stands them upright in front of the fender's front, which slopes back about 42
# degrees there: the tops stood 16 cm proud of it. Here each leans back LAMP_TILT with the fender (and LAMP_YAW out),
# its glass a hair under the skin at its middle; the niche is cut along its axis, and where the rim still stands off
# the sloping skin a short surround in the fender's colour closes the gap (exportar_fusca_jogo.py puts this
# construir_farois in criar_fusca_v2's place).
LAMP_X,LAMP_Z,LAMP_R=.505,.66,.108
LAMP_TILT,LAMP_YAW,LAMP_RECESS=math.radians(34),.13,.012
def lamp_axis(s):
 return Vector((s*LAMP_YAW,-math.cos(LAMP_TILT),math.sin(LAMP_TILT))).normalized()
def lamp_frame(sup,s):
 """The lamp's centre (its rim's plane) and axis (forward, out of the glass), and two directions across it."""
 a=lamp_axis(s);hit,*_=sup.bvh.ray_cast(Vector((s*LAMP_X,-1.70,LAMP_Z))+a*.5,-a,1.)
 c=hit-a*LAMP_RECESS;u=a.cross(Vector((0,0,1))).normalized();v=u.cross(a).normalized()
 return c,a,u,v
LAMPS={}
def in_niche(p):
 """p on a niche's wall: as far from a lamp's axis as its rim, close to the lamp along it."""
 for c,a in LAMPS.values():
  d=p-c;t=d.dot(a)
  if -.14<t<.05 and abs((d-a*t).length-LAMP_R)<.012:return True
 return False
def construir_farois(sup,body,mats):
 objs=[];V,F=[],[];seg=40
 aro=[(0.106,-0.004),(0.106,0.012),(0.100,0.020),(0.090,0.020),(0.090,0.010),(0.092,-0.004)]
 ext=[(0.001+k*0.004,0.030-0.016*((0.001+k*0.004)/0.088)**2+(0.0006 if k%2 else 0.0)) for k in range(22)]
 lente=ext+[(0.088,0.010)]+[(r,a-0.009) for r,a in reversed(ext)]
 refletor=[(0.001,-0.040),(0.030,-0.035),(0.060,-0.022),(0.087,-0.004),(0.088,-0.010),(0.060,-0.028),(0.030,-0.041),(0.001,-0.046)]
 brilho=[(0.001,-0.005),(0.080,-0.004),(0.080,-0.007),(0.001,-0.008)]
 for s in (1,-1):
  side='E' if s>0 else 'D';c,a,u,v=lamp_frame(sup,s);LAMPS[s]=(c,a)
  ring=[u*math.cos(2*math.pi*k/seg)+v*math.sin(2*math.pi*k/seg) for k in range(seg)]
  # How far behind the rim the skin is, all round it (along the axis; negative where the rim is sunk).
  back=[]
  for r in ring:
   q=c+r*LAMP_R;hit,*_=sup.bvh.ray_cast(q+a*.4,-a,.8);back.append((q-hit).dot(a) if hit else 0.)
  # The niche: a cylinder along the axis from just past the skin's inside to well out in front.
  base=len(V)
  for t in (min(-max(back),0)-.05,.3):V.extend(tuple(c+a*t+r*LAMP_R) for r in ring)
  F.append(tuple(range(base,base+seg))[::-1]);F.append(tuple(range(base+seg,base+2*seg)))
  F.extend((base+k,base+(k+1)%seg,base+seg+(k+1)%seg,base+seg+k) for k in range(seg))
  # The surround: from the rim back to the skin, where the skin lies behind it.
  sv=[];sf=[]
  for r,b in zip(ring,back):sv+=[tuple(c+r*(LAMP_R+.002)),tuple(c+r*(LAMP_R+.002)-a*(max(b,0.)+.004))]
  for k in range(seg):j=(k+1)%seg;sf.append((2*k,2*k+1,2*j+1,2*j))
  aba=V2.novo_objeto('Farol_aba_'+side,sv,sf,[mats['tinta']])
  me=aba.data;me.update()
  if me.polygons[0].normal.dot(Vector(me.polygons[0].center)-c-a*a.dot(Vector(me.polygons[0].center)-c))<0:me.flip_normals()
  objs.append(aba)
  for nome,perf,mat,n in (('Aro',aro,mats['cromo'],48),('Lente',lente,mats['vidro_farol'],64),('Refletor',refletor,mats['cromo'],48),('Brilho',brilho,mats['farol_disco'],40)):
   ob=V2.revolucao('Farol_%s_%d'%(nome,s),perf,0,0,0,n,mat);V2.posicionar(ob,c,a);objs.append(ob)
  objs.append(V2.esfera('Farol_Bulbo_%d'%s,c-a*.035,(0.014,0.014,0.014),mats['farol_luz'],16))
  print(f'FAROL_{side} centro {tuple(round(x,3) for x in c)} aro afastado da lataria ate {max(back)*100:.1f} cm, afundado ate {-min(back)*100:.1f} cm',flush=True)
 V2.subtrair(body,V,F)
 return objs

def race_prep(car,body,cut,m,sup,lid):
 """After construir_tudo and the cabin: the bumpers and running boards off; the paint on the fenders (the skin
 between the seams, the lips the arches' and the headlamps' cuts left in them) and the turn signals' bases on them
 in the fenders' own material; a black welt along each seam; the exhaust's tips cut short (they reached 9 cm past
 the tail, under the bumper; physics.js FUSCA_BODY ends at them); race wheels; the engine lid propped open."""
 seams,points=cut
 for o in [o for o in bpy.data.objects if STUDIO_BUMPERS.match(o.name) or o.name.startswith('Estribo_')]:bpy.data.objects.remove(o)
 for o in [o for o in bpy.data.objects if re.match(r'^Escape_',o.name) and o.type=='CURVE']:
  for q in o.data.splines[0].points:q.co.y=min(q.co.y,V2.Y_RABO+EXHAUST)
 me=body.data;paint=me.materials.find(m['tinta'].name)
 fender=m['tinta'].copy();fender.name=FENDER
 fender.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.8,.52,.02,1) # the game paints it (fusca.js)
 me.materials.append(fender);slot=len(me.materials)-1
 # A face's side: its corners' field, those on a seam left out.
 on_seam=KDTree(len(points))
 for i,p in enumerate(points):on_seam.insert(p,i)
 on_seam.balance()
 co=np.array([tuple(v.co) for v in me.vertices]);g=fender_field(car,co)
 for i,v in enumerate(co):
  if on_seam.find(v)[2]<1e-5:g[i]=0.
 n=0
 for p in me.polygons:
  if p.material_index==paint and sum(g[i] for i in p.vertices)<0:p.material_index=slot;n+=1
  # The headlamps' niches (construir_farois): their walls in front of a sunk rim, in the fender's colour.
  elif p.center.y<-1.5 and in_niche(p.center):p.material_index=slot
 # The turn signals' bases and the headlamps' surrounds sit on the fenders.
 for o in bpy.data.objects:
  if o.name.startswith(('Seta_base_','Farol_aba_')):o.data.materials[0]=fender
 out=[]
 print('PARALAMAS faces',n,flush=True)
 out+=[C.pipe(f'Friso_paralama_{k}',[p+q*.0012 for p,q in zip(pts,normals)],.0032,m['borracha'],6,closed=closed) for k,(pts,normals,closed) in enumerate(seams)]
 return out+race_wheels(m)+open_lid(sup,lid,m)

# --- Race wheels: black steel wheels with six holes and low tyres, 0.54 m across (the Copa Fusca photo the user
# sent: about 13 inches), in place of criar_fusca_v2's 5.60-15 with chrome hubcaps. The same five parts per wheel
# (exportar_fusca_jogo.py WHEEL), centred WHEEL_R over the ground.
WHEEL_R=C.WHEEL_R # the cabin keeps clear of them (fusca_cabine.in_wheels)
WHEEL_PARTS=re.compile(r'^(Pneu|Roda|Tambor|Calota|Aro_roda)_[ED]_[+-]1\.2$')
def race_wheels(m):
 for o in [o for o in bpy.data.objects if WHEEL_PARTS.match(o.name)]:bpy.data.objects.remove(o)
 R=WHEEL_R;out=[]
 # Profiles (radius, axial offset outward): the tyre's square shoulders, the dished wheel and its rim, the
 # drum behind it, a black centre over the hub.
 tyre=[(.183,-.083),(.21,-.09),(.245,-.09),(.261,-.087),(.268,-.078),(R,-.064),(R,.064),(.268,.078),(.261,.087),(.245,.09),(.21,.09),(.183,.083)]
 dish=[(.186,.074),(.186,.06),(.178,.056),(.14,.04),(.075,.032),(.05,.036),(.05,.026),(.075,.022),(.14,.03),(.172,.046),(.176,.056),(.176,.074)]
 drum=[(.001,-.01),(.15,-.01),(.15,.012),(.001,.012)]
 hub=[(.001,.058),(.03,.055),(.042,.046),(.045,.03),(.001,.03)]
 lip=[(.189,.079),(.189,.07),(.177,.068),(.177,.077)]
 for ya in (V2.EIXO_F,V2.EIXO_T):
  for s,side in ((1,'E'),(-1,'D')):
   cx=s*V2.BITOLA;tag='%s_%+.1f'%(side,ya)
   out.append(V2.revolucao('Pneu_'+tag,tyre,cx,ya,R,64,m['pneu'],s))
   wheel=V2.revolucao('Roda_'+tag,dish,cx,ya,R,48,m['roda'],s)
   V,F=[],[]
   for k in range(6):
    th=2*math.pi*(k+.5)/6;cy,cz=ya+.106*math.cos(th),R+.106*math.sin(th);base=len(V)
    for x in (cx,cx+s*.1):V.extend((x,cy+.027*math.cos(2*math.pi*j/16),cz+.027*math.sin(2*math.pi*j/16)) for j in range(16))
    F+=[tuple(range(base,base+16))[::-1],tuple(range(base+16,base+32))]+[(base+j,base+(j+1)%16,base+16+(j+1)%16,base+16+j) for j in range(16)]
   V2.subtrair(wheel,V,F);out.append(wheel)
   out.append(V2.revolucao('Tambor_'+tag,drum,cx,ya,R,32,m['baixo'],s))
   out.append(V2.revolucao('Calota_'+tag,hub,cx,ya,R,24,m['roda'],s))
   out.append(V2.revolucao('Aro_roda_'+tag,lip,cx,ya,R,48,m['roda'],s))
 return out

# --- The engine lid propped open at its foot (a race Fusca's: the user, with the photo), on a hinge across its top,
# over the engine: fan shroud, generator, twin carburettors with chrome filters, valve covers, crank pulley.
# The lid is one piece from under the rear window to under the plate (the user: the louvred slope and the part with
# the plate are the same lid): over the slope criar_fusca_v2's outline in plan (MED.PLANTA_TAMPA_MOTOR, made
# symmetric from its right half), down the tail its sides at LID_SIDE either side of the middle (inside the rear
# fenders' seams, fusca_acabamento APRONS) to its foot at LID_FOOT, under the plate, with rounded corners. It is cut
# out of the body whole (outer skin, inside, edges) and turned LID_OPEN about a hinge across its top.
LID_SIDE,LID_FOOT,LID_CORNER=.37,.565,.05
LID_OPEN,HINGE_Y=math.radians(12),1.50
# The cut looks at the tail from behind and above (45 degrees), where the slope and the upright tail both face it.
LOOK=Vector((0,-1,-1)).normalized();ACROSS=Vector((1,0,0));UP=Vector((0,-1,1)).normalized()
def lid_outline(sup):
 """The lid's edge on the skin, round from its foot's middle (points in criar_fusca_v2's frame)."""
 rear=lambda x,z:V2._tras(sup,x,z)[0]
 right=[(x,y) for x,y in MED.PLANTA_TAMPA_MOTOR if x>0]
 # The slope's right side, from the foot of the plan outline up to its top corner, then the top edge to the middle.
 slope=[sup.topo(x,y)[0] for x,y in V2.densificar(right+[(0.,1.526)],.02,False)]
 join=slope[0].z
 foot=[rear(x,LID_FOOT) for x in np.arange(0,LID_SIDE-LID_CORNER,.02)]
 corner=[rear(LID_SIDE-LID_CORNER+LID_CORNER*math.sin(a),LID_FOOT+LID_CORNER-LID_CORNER*math.cos(a)) for a in np.linspace(0,math.pi/2,6)]
 side=[rear(LID_SIDE,float(z)) for z in np.arange(LID_FOOT+LID_CORNER+.02,join-.01,.02)]
 half=foot+corner+side+slope
 mirror=[Vector((-p.x,p.y,p.z)) for p in reversed(half[1:-1])]
 return half+mirror
def flat(p):return Vector((p.dot(ACROSS),p.dot(UP)))
def on_lid(sup,q):
 """The skin's point seen at q (a point of the view's plane)."""
 hit,*_=sup.bvh.ray_cast(ACROSS*q.x+UP*q.y-LOOK*5,LOOK,10);assert hit is not None,q;return hit
def cut_lid(sup,body,m):
 """The lid cut out of the body (outer skin, inside and edges) as its own object, still shut. Called with the
 windows' cuts, while the body's material slots are criar_fusca_v2's: a boolean later, with the cabin's and the
 fenders' slots added, would renumber them (a material in two slots) and paint the wrong faces."""
 from mathutils.geometry import delaunay_2d_cdt
 edge=[flat(p) for p in lid_outline(sup)];n=len(edge)
 # A solid through the skin, from 25 cm out to 7 cm in (along the view), over a mesh of the lid's face: points
 # every 4 cm inside its edge, so the inner side follows the skin's dome instead of cutting chords under it.
 lo=Vector((min(p.x for p in edge),min(p.y for p in edge)));hi=Vector((max(p.x for p in edge),max(p.y for p in edge)))
 grid=[Vector((a,b)) for a in np.arange(lo.x,hi.x,.04) for b in np.arange(lo.y,hi.y,.04)]
 poly=np.array([(p.x,p.y) for p in edge]);inside=V2.dentro_poligono(np.array([(q.x,q.y) for q in grid]),poly)
 grid=[q for q,k in zip(grid,inside) if k and min((q-p).length for p in edge)>.02]
 verts,_,faces,*_=delaunay_2d_cdt(edge+grid,[(i,(i+1)%n) for i in range(n)],[list(range(n))],1,1e-6)
 hits=[on_lid(sup,Vector(v)) for v in verts];k=len(hits)
 V=[h+LOOK*.07 for h in hits]+[h-LOOK*.25 for h in hits];F=[];count={}
 for f in faces:
  F.append(tuple(f));F.append(tuple(k+i for i in reversed(f)))
  for a,b in zip(f,f[1:]+f[:1]):count[frozenset((a,b))]=count.get(frozenset((a,b)),0)+1
 F+=[(a,b,k+b,k+a) for a,b in (tuple(e) for e,c in count.items() if c==1)]
 lid=bpy.data.objects.new('Tampa_motor',body.data.copy());V2.linkar(lid)
 cutter=V2.novo_objeto('Cortador_tampa',V,F,suave=False);V2.recalcular_normais(cutter)
 b=lid.modifiers.new('Tampa','BOOLEAN');b.operation='INTERSECT';b.object=cutter;b.solver='EXACT';V2.aplicar_mods(lid)
 bpy.data.objects.remove(cutter);V2.subtrair(body,V,F)
 for i,mat in enumerate(lid.data.materials):
  if mat is None:lid.data.materials[i]=m['interior']
 assert len(lid.data.polygons)>200,'tampa do motor vazia'
 return lid

def open_lid(sup,lid,m):
 """The lid (cut_lid) turned open on its hinge, with its louvres, handle and plate; the stays; the engine."""
 # The seam drawn round the shut lid goes; its louvres, handle and plate open with it.
 for o in [o for o in bpy.data.objects if o.name=='Junta_tampa_motor']:bpy.data.objects.remove(o)
 riders=[lid]+[o for o in bpy.data.objects if o.name.startswith(('Veneziana_','Tampa_macaneta','Placa'))]
 hinge=Vector((0,HINGE_Y,sup.topo(0,HINGE_Y)[0].z-.015))
 turn=Matrix.Translation(hinge)@Matrix.Rotation(LID_OPEN,4,'X')@Matrix.Translation(-hinge)
 bpy.context.view_layer.update()
 for o in riders:o.matrix_world=turn@o.matrix_world
 out=[lid]
 # The stays: from the inside of its foot down onto the apron under the lid (they open with it: fusca_aberturas.py).
 for s in (1,-1):
  low,n=V2._tras(sup,s*.28,LID_FOOT-.05);top,t=V2._tras(sup,s*.28,LID_FOOT+.03)
  out.append(C.pipe(f'Tampa_haste_{s}',[low+n*.004,turn@(top-t*.015)],.006,m['baixo'],8))
 return out+engine(sup,m)

def engine(sup,m):
 """The air-cooled flat four seen under the open lid (criar_fusca_v2's frame, before the exporter lowers it)."""
 tin=C.material('Motor_lata',(.035,.036,.04),metal=.3,rough=.5);alu=C.material('Motor_aluminio',(.45,.46,.47),metal=.8,rough=.35)
 out=[C.box('Motor_coifa',(0,1.62,.57),(.60,.26,.18),tin,.03),
  C.box('Motor_bloco',(0,1.60,.42),(.42,.36,.16),alu,.02)]
 for s in (1,-1):
  out.append(C.box(f'Motor_cabecote_{s}',(s*.33,1.62,.42),(.10,.30,.14),alu,.02))
  out.append(C.cylinder(f'Motor_carburador_{s}',Vector((s*.24,1.60,.70)),Vector((0,0,1)),.025,.025,.07,alu,16))
  out.append(C.cylinder(f'Motor_filtro_{s}',Vector((s*.24,1.60,.77)),Vector((0,0,1)),.07,.07,.06,m['cromo'],24))
 # The generator on the shroud, its pulley and the crank's in one plane at the back, a belt round both.
 out.append(C.cylinder('Motor_gerador',Vector((0,1.56,.66)),Vector((0,1,0)),.055,.055,.18,tin,24))
 out.append(C.cylinder('Motor_polia_gerador',Vector((0,1.745,.66)),Vector((0,1,0)),.05,.05,.02,alu,24))
 out.append(C.cylinder('Motor_polia',Vector((0,1.745,.42)),Vector((0,1,0)),.085,.085,.03,tin,32))
 out.append(C.pipe('Motor_correia',[Vector((-.05,1.765,.66)),Vector((-.085,1.765,.42)),Vector((.085,1.765,.42)),Vector((.05,1.765,.66))],.006,m['borracha'],6,closed=True))
 leaks=C.poking_out(C.Cabin(sup),out)
 assert not leaks,'motor atravessando a lataria: '+', '.join(f'{n} {d*1000:.0f} mm' for n,d in leaks)
 return out

def build(sup,body,m):
 for name in STUDIO_MIRRORS:
  o=bpy.data.objects.get(name)
  if o:bpy.data.objects.remove(o)
 glass=C.material('Espelho_fusca',(.62,.65,.68),metal=1,rough=.03)
 out=seals(sup,m)
 # What stands between the cockpit camera and a door mirror: the body and its doors (fusca_aberturas.py), the windows'
 # rubber, the cage.
 V,F=[],[];dg=bpy.context.evaluated_depsgraph_get()
 for o in [body]+out+[o for o in bpy.data.objects if o.name.startswith('Gaiola_coluna_A') or o.name in ('Porta_E','Porta_D')]:
  me=o.evaluated_get(dg).to_mesh();W=o.matrix_world;base=len(V);V+=[W@v.co for v in me.vertices];F+=[[base+i for i in p.vertices] for p in me.polygons];o.evaluated_get(dg).to_mesh_clear()
 bvh=BVHTree.FromPolygons(V,F)
 for s in (1,-1):out+=door_mirror(sup,bvh,s,m,glass)
 out+=engine_lid(sup,m)
 headlamps(m);plate()
 return out

def engine_lid(sup,m):
 """The lid's panel gap (criar_fusca_v2 draws the hood's only) and, in place of the studio's twenty lines across
 the tail, two banks of nine louvres on the lid's top, each a dark slot under a raised lip of paint."""
 for o in [o for o in bpy.data.objects if STUDIO_LOUVRES.match(o.name)]:bpy.data.objects.remove(o)
 out=[];pts=[]
 for x,y in V2.densificar(MED.PLANTA_TAMPA_MOTOR,.02,True):
  loc,nor=sup.topo(x,y)
  if loc is not None:pts.append(loc+nor*.0008)
 out.append(C.pipe('Junta_tampa_motor',pts,.0024,m['linha'],6,closed=True))
 for s in (1,-1):
  for k in range(9):
   y=1.548+k*.0118;slot,lip=[],[]
   for x in np.linspace(s*.075,s*.30,12):
    a,n=sup.topo(float(x),y);b,_=sup.topo(float(x),y-.0045)
    if a is None or b is None:continue
    slot.append(a+n*.0004);lip.append(b+n*.0016)
   if len(slot)>3:
    out.append(C.pipe(f'Veneziana_fenda_{s}_{k}',slot,.0021,m['linha'],6))
    out.append(C.pipe(f'Veneziana_aba_{s}_{k}',lip,.0032,m['tinta'],6))
 return out

def headlamps(m):
 """The studio lights the scene with its headlamps; in the game's daylight they are off: the disc behind the
 lens is the reflector's chrome, not a glowing cream face (exportar_fusca_jogo.py EMISSION keeps the bulb dim)."""
 b=bpy.data.materials['Farol_Disco'].node_tree.nodes['Principled BSDF']
 b.inputs['Base Color'].default_value=(.82,.83,.84,1);b.inputs['Metallic'].default_value=1.;b.inputs['Roughness'].default_value=.12

def plate():
 """UVs on the rear plate's face (the game paints its letters, fusca.js): u to the right seen from behind, v up."""
 o=bpy.data.objects.get('Placa')
 if o is None:return
 bpy.context.view_layer.update();R=o.matrix_world.to_3x3();right=(R@Vector((-1,0,0))).normalized();up=(R@Vector((0,0,1))).normalized()
 if right.x>0:right=-right
 C.disc_uv(o,o.matrix_world.translation.copy(),right,up,.34,.13)

def door_mirror(sup,bvh,s,m,glass):
 side='E' if s>0 else 'D'
 # The base on the door's front corner that brings the head nearest the middle of the cockpit camera's view with
 # all of its glass in sight through the window (past the rubber and the cage), a margin round it.
 chosen=None;w,h,_=HEAD
 for y in np.arange(-.575,-.38,.005):
  for up in (.06,.075,.09):
   base,n=sup.lado(float(y),.99,s)
   if base is None:continue
   head=base+Vector((s*OUT,-.01,up));normal=glass_normal(head,s);R=C.frame_from(normal)
   ring=[head]+[head+R@Vector((w/2*1.1*math.cos(a),h/2*1.1*math.sin(a),0)) for a in np.linspace(0,2*math.pi,12,endpoint=False)]
   clear=all(bvh.ray_cast(C.EYE,(q-C.EYE).normalized(),(q-C.EYE).length-.002)[0] is None for q in ring)
   angle=math.atan2(abs(head.x-C.EYE.x),C.EYE.y-head.y)
   if clear and (chosen is None or angle<chosen[3]):chosen=(base,n,head,angle)
 assert chosen,'retrovisor sem visada'
 base,n,head,_=chosen
 angle=math.degrees(math.atan2(abs(head.x-C.EYE.x),C.EYE.y-head.y))
 print(f'RETROVISOR_{side} base y {base.y:.3f} cabeca {tuple(round(v,3) for v in head)} angulo {angle:.1f} graus',flush=True)
 normal=glass_normal(head,s)
 out=[]
 # Base plate on the door skin, the arm curving out and up, the head's chrome shell open toward the glass.
 out.append(C.box('Retrovisor_base_'+side,base+n*.004,(.05,.028,.008),m['cromo'],.004,z_axis=n,up=Vector((0,0,1))))
 # The arm rises into the head from under it, behind the glass (to its middle it crossed the glass the driver sees).
 w,h,dpt=HEAD;under=head+C.frame_from(normal)@Vector((0,-h*.36,-dpt*.55))
 arm=[base+n*.006,base+n*.04+Vector((0,0,.012)),under-Vector((0,0,.03)),under]
 out.append(C.pipe('Retrovisor_braco_'+side,arm,.0075,m['cromo'],10,smooth=True,step=.012))
 V,F=[],[];seg,rings=40,8
 for i in range(rings+1):
  a=(i/rings)*math.pi/2;depth=-dpt*math.cos(a)**.6;scale=math.sin(a)**.55 if i else 0
  for k in range(seg):
   t=2*math.pi*k/seg;V.append(Vector((w/2*scale*math.cos(t),h/2*scale*math.sin(t),depth)))
 for i in range(rings):
  for k in range(seg):F.append((i*seg+k,i*seg+(k+1)%seg,(i+1)*seg+(k+1)%seg,(i+1)*seg+k))
 # The rim: a lip turned in round the glass.
 lip=len(V)
 for k in range(seg):t=2*math.pi*k/seg;V.append(Vector((w/2*.93*math.cos(t),h/2*.9*math.sin(t),.002)))
 for k in range(seg):F.append((rings*seg+k,rings*seg+(k+1)%seg,lip+(k+1)%seg,lip+k))
 shell=C.obj('Retrovisor_'+side,V,F,m['cromo'],True,70)
 C.place(shell,head,normal,Vector((0,0,1)));out.append(shell)
 g=V2.novo_objeto('Retrovisor_vidro_'+side,[(w/2*.92*math.cos(2*math.pi*k/seg),h/2*.89*math.sin(2*math.pi*k/seg),-.002) for k in range(seg)],[tuple(range(seg))],[glass])
 C.place(g,head,normal,Vector((0,0,1)));out.append(g)
 # Their own nodes in the GLB (exportar_fusca_jogo.py): they stand out of the body's outline (testar_colisao_fusca.mjs).
 for o in out:o['grupo']='Retrovisores'
 return out

def glass_normal(head,s):
 """Set as a driver sets it: the cockpit camera sees the road straight back, OUTWARD past the flank, in its middle."""
 ray=(Vector((0,1,0))+Vector((s*OUTWARD,0,0))).normalized();return (ray+(C.EYE-head).normalized()).normalized()

# The seals' radius: a thin black edge round each opening seen from the cockpit (they were 13-14 mm).
SEAL=.009
def seals(sup,m):
 """Black rubber round each window's opening, in the middle of its cut edge (exportar_fusca_jogo.py cuts the side
 windows straight across the car, the windscreen and the rear window straight down): it hides the edge's steps."""
 out=[]
 for s in (1,-1):
  for name,poly in (('porta',MED.JAN_PORTA),('quarto',MED.JAN_QUARTO)):
   pts=[]
   for y,z in V2.densificar(poly,.02,True):
    loc,n=sup.lado(y,z,s)
    if loc:pts.append(loc-Vector((s*min(.03,.5*C.SKIN/max(abs(n.x),.2)),0,0)))
   out.append(C.pipe(f'Borracha_{name}_{"E" if s>0 else "D"}',pts,SEAL,m['borracha'],8,closed=True))
 for name,poly in (('parabrisa',MED.PLANTA_PARABRISA),('traseiro',MED.PLANTA_VIDRO_TRAS)):
  pts=[]
  for x,y in V2.densificar(poly,.02,True):
   loc,n=sup.topo(x,y)
   if loc:pts.append(loc-Vector((0,0,min(.03,.5*C.SKIN/max(abs(n.z),.2)))))
  out.append(C.pipe('Borracha_'+name,pts,SEAL,m['borracha'],8,closed=True))
 return out
