"""Door mirrors of the Opala 99 V06, rebuilt from the photos (carro_20, carro_21 both doors, carro_23 from the front,
carro_3 on track). The V04 mirror that V05 carried (a round pod at the end of a long thin rod out of the window frame,
its back turned to the driver and its glass buried inside) is replaced by the car's real one: a modern gloss-black
mirror, a rounded box a little wider than tall whose domed back faces forward and whose glass faces the driver,
standing on a thick tapered foot bolted to the door's outer skin at its front top corner, on the yellow stripe right
under the window's front corner.

Sizes come from the front view carro_23 (a normal lens from ~4 m, scaled by the windscreen's width); carro_20/21 were
shot close up with a wide-angle lens, so they only gave proportions (the foot's visible height ~0.56 of the housing's,
its length ~0.8, its front edge ~7 cm behind the door's front seam at the stripe):
- housing 14.5 cm across (inner end beside the A pillar, 1 cm outboard of the window frame; outer end 7 cm past the
  door skin, carro_23 / carro_3), 12 cm tall (bottom just over the sloping sill), 10.5 cm deep at the inner end and
  8 cm at the outer one, its back a rounded dome; its glass toed in 8 degrees toward the cabin, the outer end swept
  back with it;
- foot about 9.5 cm long seen from the side, leaning forward as it goes down to z 0.835 on the stripe; seen from the
  front a slim neck (3.5 cm) under the housing's inner half, 1.5-2 cm proud of the door skin.

Objects (per side, parented to the door's pivot so they swing with it; names kept from V05, whose Haste_espelho rod
is gone):
 Carcaca_espelho_<side>  housing shell and foot, one mesh in the body paint (rivals repaint it with their colour)
 Vidro_espelho_<side>    the flat glass inside the rim, material Espelho (the game draws the road behind on it:
                         side-mirrors.js takes its outline and plane)
"""
import bpy,bmesh,math
import numpy as np
from mathutils import Vector,Matrix
from v06_comum import new_mesh,remove,reparent,finish

SIDES=(('Motorista',1),('Passageiro',-1))
# Housing: the rim (glass side) starts at its inner bottom corner (RIM_X, Y_IN, Z_BOTTOM), toed in TOE degrees.
RIM_X=.738;Y_IN=.80;Z_BOTTOM=.905;WIDTH=.145;HEIGHT=.12;HEIGHT_IN=.12;TOE=8.
DEPTH_IN=.105;DEPTH_OUT=.08
LIP=.0035;RECESS=.003          # rim turned in round the glass; glass sunk behind the rim
RADII=(.02,.045,.06,.025)     # rim corners: inner bottom, outer bottom, outer top, inner top
DOME=.85                       # superellipsoid exponent of the domed back (1 = round, smaller = boxier)
# Foot: horizontal sections from inside the housing down to its rounded bottom on the yellow stripe:
# z, rear x, front x, inner |y| (inside the door skin, 0.87), outer |y|
FOOT=((.94,.737,.832,.838,.874),(.905,.738,.834,.842,.877),(.875,.741,.834,.848,.882),(.85,.745,.833,.852,.885),(.835,.747,.832,.854,.886))
FOOT_CORNER=.015;FOOT_ROUND_X=.022;FOOT_ROUND_Y=.012

def fillet(points,radii,n=8):
 """Closed polygon with each corner rounded by its own radius (n segments per arc)."""
 out=[];P=[Vector((p[0],p[1],0)) for p in points];k=len(P)
 for i in range(k):
  a,p,b=P[i-1],P[i],P[(i+1)%k];d1=(a-p).normalized();d2=(b-p).normalized();half=d1.angle(d2)/2
  c=p+(d1+d2).normalized()*(radii[i]/math.sin(half));v1=p+d1*(radii[i]/math.tan(half))-c;v2=p+d2*(radii[i]/math.tan(half))-c
  sweep=math.atan2(v1.cross(v2).z,v1.dot(v2))
  out+=[c+Matrix.Rotation(sweep*j/n,3,'Z')@v1 for j in range(n+1)]
 return [(q.x,q.y) for q in out]
def densify(poly,step=.008):
 out=[]
 for i,p in enumerate(poly):
  q=poly[(i+1)%len(poly)];n=max(1,round(math.dist(p,q)/step))
  out+=[(p[0]+(q[0]-p[0])*t/n,p[1]+(q[1]-p[1])*t/n) for t in range(n)]
 return [p for i,p in enumerate(out) if math.dist(p,out[i-1])>1e-5]
def inset(poly,d):
 """Offset a convex counter-clockwise polygon inward by d."""
 P=np.array(poly);n=len(P);out=[]
 for i in range(n):
  t=P[(i+1)%n]-P[i-1];t/=np.linalg.norm(t);out.append(tuple(P[i]+np.array((-t[1],t[0]))*d))
 return out

def frame(s):
 """Housing axes: u outward along it, v up, w from the glass toward the domed back (forward, a little outward)."""
 t=math.radians(TOE);return Vector((RIM_X,s*Y_IN,Z_BOTTOM)),Vector((-math.sin(t),s*math.cos(t),0)),Vector((0,0,1)),Vector((math.cos(t),s*math.sin(t),0))

def housing(s,collection):
 """Shell: glass seat, the lip round it, the rim's rounded edge, then a superellipsoid cap to the domed back."""
 o,u,v,w=frame(s);P=lambda a,b,c:o+u*a+v*b+w*c
 rim=densify(fillet([(0,0),(WIDTH,0),(WIDTH,HEIGHT),(0,HEIGHT_IN)],RADII,10));n=len(rim)
 C=np.mean(np.array(rim),0);C[0]-=.008                  # the dome's tip a little inboard of the rim's middle
 depth=lambda a:DEPTH_IN+(DEPTH_OUT-DEPTH_IN)*min(1.,max(0.,a/WIDTH))
 seat=inset(rim,LIP);W0=.0025
 rings=[[P(a,b,RECESS) for a,b in seat],[P(a,b,0) for a,b in seat],[P(a,b,0) for a,b in inset(rim,.0022)],[P(a,b,W0) for a,b in rim]]
 for phi in np.linspace(0,math.pi/2,14)[1:-1]:
  r=math.cos(phi)**DOME;h=math.sin(phi)**DOME
  rings.append([P(C[0]+(a-C[0])*r,C[1]+(b-C[1])*r,W0+depth(C[0]+(a-C[0])*r)*h) for a,b in rim])
 V=[q for ring in rings for q in ring];tip=len(V);V.append(P(C[0],C[1],W0+depth(C[0])))
 F=[(i*n+k,i*n+(k+1)%n,(i+1)*n+(k+1)%n,(i+1)*n+k) for i in range(len(rings)-1) for k in range(n)]
 last=(len(rings)-1)*n;F+=[(last+k,last+(k+1)%n,tip) for k in range(n)]
 centre=P(C[0],C[1],depth(C[0])*.45)
 obj=new_mesh('tmp_carcaca',V,F,bpy.data.materials['Pintura_preta'],collection,smooth=None,outward=lambda c:c-centre)
 # the seat's wall (the first strip) looks in, toward the glass
 bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table()
 bmesh.ops.reverse_faces(bm,faces=[bm.faces[i] for i in range(n)]);bm.to_mesh(obj.data);bm.free()
 return obj,[P(a,b,RECESS-.0004) for a,b in seat]

def foot(s,collection):
 """Rounded-rectangle sections (x, |y|) at the FOOT heights, lofted; the bottom rounded off front, back and outside."""
 Z=[f[0] for f in FOOT][::-1]
 at=lambda z,i:float(np.interp(z,Z,[f[i] for f in FOOT][::-1]))
 zs=list(np.linspace(FOOT[0][0],FOOT[-1][0]+FOOT_ROUND_X,8))+[FOOT[-1][0]+FOOT_ROUND_X*(1-math.sin(a)) for a in np.linspace(.3,math.pi/2,5)]
 rings=[];seg=6
 for z in zs:
  x0,x1,y0,y1=at(z,1),at(z,2),at(z,3),at(z,4);dz=z-FOOT[-1][0]
  if dz<FOOT_ROUND_X:
   q=math.sqrt(max(0.,1-((FOOT_ROUND_X-dz)/FOOT_ROUND_X)**2));e=FOOT_ROUND_X*(1-q);x0+=e;x1-=e;y1-=FOOT_ROUND_Y*(1-q)
  rc=min(FOOT_CORNER,(x1-x0)/2.2,(y1-y0)/2.2);ring=[]
  for cx,cy,a0 in ((x1-rc,y1-rc,0),(x0+rc,y1-rc,90),(x0+rc,y0+rc,180),(x1-rc,y0+rc,270)):
   ring+=[Vector((cx+rc*math.cos(math.radians(a0+15*j)),s*(cy+rc*math.sin(math.radians(a0+15*j))),z)) for j in range(seg+1)]
  rings.append(ring)
 n=len(rings[0]);V=[q for r in rings for q in r];b=len(V);V.append(sum(rings[-1],Vector())/n)
 F=[(i*n+k,i*n+(k+1)%n,(i+1)*n+(k+1)%n,(i+1)*n+k) for i in range(len(rings)-1) for k in range(n)]
 F+=[((len(rings)-1)*n+k,(len(rings)-1)*n+(k+1)%n,b) for k in range(n)]
 def outward(c):
  d=c-Vector(((at(c.z,1)+at(c.z,2))/2,s*(at(c.z,3)+at(c.z,4))/2,c.z))
  return Vector((0,0,-1)) if c.z<FOOT[-1][0]+.0015 else d
 return new_mesh('tmp_pe',V,F,bpy.data.materials['Pintura_preta'],collection,smooth=None,outward=outward)

def join(name,objs):
 """One object (the first one's mesh) from several meshes written in world coordinates."""
 bm=bmesh.new()
 for o in objs:
  me=o.data.copy();me.transform(o.matrix_world);bm.from_mesh(me);bpy.data.meshes.remove(me)
 keep=objs[0];bm.to_mesh(keep.data);bm.free()
 for o in objs[1:]:remove(o)
 keep.name=name;keep.data.name=name;return keep

def build(mats):
 O=bpy.data.objects
 for side,s in SIDES:
  old=O.get('Carcaca_espelho_'+side);collection=old.users_collection[0].name if old else '04_Farois_Lanternas_Detalhes'
  for n in ('Carcaca_espelho_','Haste_espelho_','Vidro_espelho_'):remove(n+side)
  shell,seat=housing(s,collection);pe=foot(s,collection)
  h=join('Carcaca_espelho_'+side,[shell,pe]);h.data.materials.clear();h.data.materials.append(mats['pintura']);finish(h.data,42)
  n=len(seat)
  g=new_mesh('Vidro_espelho_'+side,seat+[sum(seat,Vector())/n],[(i,(i+1)%n,n) for i in range(n)],bpy.data.materials['Espelho'],collection,outward=-frame(s)[3])
  piv=O[f'Porta_{side}_DOBRADICA'];reparent(h,piv);reparent(g,piv)
  print(f'V06 retrovisor {side}: carcaca e pe {len(h.data.polygons)} faces, vidro {n} pontos',flush=True)
