"""The Fusca's doors, front lid and engine lid as parts that open (exportar_fusca_jogo.py), as the V06 Opala's do.

Each part is cut out of the body with a panel gap all round (GAP) and hangs, with what rides on it (glass, seals,
handles, mirrors, the door cards; the lid's chrome strip and handle; the engine lid's louvres, handle and plate), from an
empty on its hinge's axis. The empty carries the opening as glTF extras (peca, eixo_gltf, angulo_gltf_graus), the
same API as the V06 Opala's pivots: the game (car-openings.js) turns it from rest by that angle. The doors swing out on
vertical hinges just ahead of their front edges; the front lid (over the trunk: the Fusca's engine is at the back)
lifts from the nose on hinges by the windscreen; the engine lid, propped open 12 degrees for the race
(fusca_acabamento.open_lid), lifts further about the same hinge across its top. Each hinge's place was chosen by
swinging its part through its whole opening against the rest of the car (hinge_search): no new contact anywhere.

In each gap a black rubber seal on the body, under the skin: from outside it reads as the dark line between the panels
(the street model drew them as tubes on the paint), and it closes the gaps seen from the cabin. Under the front lid the
trunk: a tub painted like the body, a well between the front wheels' housings with shelves curving over them, the fuel
tank at its back with its filler on top (the crew opens this lid to refuel, as a Fusca's), the brake fluid's bottle;
no spare wheel (a race car carries none, and the lowered nose leaves no room to stand one). Under the engine lid,
fusca_acabamento.engine; the stays that prop it for the race rise with it. Inside each part, the body's inner paint
(and a stamped frame under the front lid); the door hinges' leaves bridge the gap at the front of an open door.

Frame: criar_fusca_v2.py's (front -Y, +X the driver's left side, Z up), as fusca_cabine.py.
"""
import bpy,bmesh,math
import numpy as np
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
import criar_fusca_v2 as V2,medidas_fusca as MED
import fusca_cabine as C,fusca_acabamento as FINISH

GAP=.004 # the panel gap round each part: 2 mm either side of its outline
SEAL_R,SEAL_DEPTH=.0045,.009 # the rubber in each gap: its radius, its centre under the skin
EDGE_STEP=.012 # the outlines' points (the body's faces are 2 to 3 cm across)
DEPTH_IN,DEPTH_OUT=.035,.01 # the cutting solids: this far into the skin and out of it, along its normal (short: the
# skin is 2 cm thick, and offset further the solids fold over themselves where it is hollow, as in the valleys by the
# fenders, which made the cuts jagged)
FRONT,REAR,SILL=MED.PORTA_Y_FRENTE,MED.PORTA_Y_TRAS,MED.PORTA_Z_SOLEIRA # the door's edges (criar_fusca_v2's seams)
DOOR_FRAME=.018 # the door's frame round its window (in the side view): along the A-pillar and over the top
DOOR_BELT=.965 # its front edge stands straight up to here, then follows the window's front edge
DOOR_ANGLE,HOOD_ANGLE,LID_ANGLE=65.,62.,46. # how far each opens (the engine lid: past its race prop's 12 degrees)
# The front lid's foot on the nose: z at its middle and at its corners (the nose's front is upright below .55), its
# half width there; it climbs the nose to meet the measured outline (MED.PLANTA_CAPO) at HOOD_JOIN.
HOOD_FOOT,HOOD_FOOT_CORNER,HOOD_FOOT_X,HOOD_JOIN=.522,.552,.252,-1.68

# --- Hinges: name -> where its axis passes, which way it runs, how far the part turns about it ----------------------
HINGES={}
def hinge(name,at,axis,angle,peca,descricao):
 HINGES[name]=dict(at=Vector(at),axis=Vector(axis).normalized(),angulo=float(angle),peca=peca,descricao=descricao)
def ride(objects,name):
 for o in objects:o['dobradica']=name
DOORS={1:'Porta_Motorista_DOBRADICA',-1:'Porta_Passageiro_DOBRADICA'}
HOOD,LID='Capo_DOBRADICA','Tampa_motor_DOBRADICA'

# --- Outlines in a view of the skin ----------------------------------------------------------------------------------
class View:
 """The skin seen along look: points of the plane across it (across, and up: look x across unless given) and where a
 ray along look through one meets the uncut skin (criar_fusca_v2.Superficie: its windows and lamps not yet cut)."""
 def __init__(self,sup,look,across,up=None):
  self.sup=sup;self.look=Vector(look).normalized();a=Vector(across)
  self.across=(a-self.look*a.dot(self.look)).normalized();self.up=self.look.cross(self.across) if up is None else Vector(up).normalized()
 def flat(self,p):return Vector((Vector(p).dot(self.across),Vector(p).dot(self.up)))
 def cast(self,q):
  hit,nor,*_=self.sup.bvh.ray_cast(self.across*q[0]+self.up*q[1]-self.look*5,self.look,10);return hit,nor
 def normal(self,q,reach=.015):
  """The skin's normal under q, averaged over the faces round it (the uncut skin's faces are flat)."""
  n=Vector()
  for dx,dy in ((0,0),(reach,0),(-reach,0),(0,reach),(0,-reach)):
   _,m=self.cast((q[0]+dx,q[1]+dy))
   if m is not None:n+=m
  return n.normalized()

def resample(ring,step):
 """A closed polyline (2D points) with a point every step or less along it."""
 out=[];n=len(ring)
 for i in range(n):
  a,b=Vector(ring[i]),Vector(ring[(i+1)%n]);k=max(1,int(math.ceil((b-a).length/step)))
  out+=[a+(b-a)*(j/k) for j in range(k)]
 return out
def smooth(ring,sigma,step=.004):
 """The closed polyline resampled and smoothed along its length (Gaussian, sigma metres): corners round over about
 two sigmas, straight runs stay straight."""
 P=np.array([tuple(p) for p in resample(ring,step)]);n=len(P);k=int(math.ceil(3*sigma/step))
 w=np.exp(-.5*(np.arange(-k,k+1)*step/sigma)**2);w/=w.sum()
 out=sum(np.roll(P,-j,axis=0)*w[j+k] for j in range(-k,k+1))
 return [Vector(p) for p in out]
def thin(ring,step):
 """The closed polyline with its points at least step apart along it (the outlines come out of smooth every 4 mm:
 the cuts' walls would cross the skin's faces in slivers)."""
 out=[ring[0]]
 for p in ring[1:]:
  if (p-out[-1]).length>=step:out.append(p)
 if len(out)>3 and (out[-1]-out[0]).length<step/2:out.pop()
 return out
def area(ring):
 return .5*sum(ring[i].x*ring[(i+1)%len(ring)].y-ring[(i+1)%len(ring)].x*ring[i].y for i in range(len(ring)))
def offset(ring,d):
 """The closed polyline moved d outward (inward for d < 0), each point along its corner's bisector."""
 sign=1 if area(ring)>0 else -1;n=len(ring);out=[]
 for i in range(n):
  a,b,c=ring[i-1],ring[i],ring[(i+1)%n]
  n1=Vector(((b-a).y,-(b-a).x)).normalized()*sign;n2=Vector(((c-b).y,-(c-b).x)).normalized()*sign
  m=(n1+n2);m=m.normalized() if m.length>1e-9 else n1
  out.append(b+m*(d/max(m.dot(n1),.3)))
 return out

def slab(view,edge,grid=.04):
 """A solid through the skin under a closed outline of the view's plane: from DEPTH_OUT out of the skin to DEPTH_IN
 into it along the skin's normal, over a mesh of the outline's face (points every grid inside it), so it follows the
 skin's curve (fusca_acabamento.cut_lid's went along the view: where the skin turns away, as at the front lid's rear
 corners wrapping down the cowl, it caught the side behind them). Its walls stand square to the skin: so do the cuts."""
 from mathutils.geometry import delaunay_2d_cdt
 edge=[Vector(p) for p in edge];n=len(edge)
 lo=Vector((min(p.x for p in edge),min(p.y for p in edge)));hi=Vector((max(p.x for p in edge),max(p.y for p in edge)))
 pts=[Vector((a,b)) for a in np.arange(lo.x,hi.x,grid) for b in np.arange(lo.y,hi.y,grid)]
 inside=V2.dentro_poligono(np.array([(q.x,q.y) for q in pts]),np.array([(p.x,p.y) for p in edge]))
 pts=[q for q,k in zip(pts,inside) if k and min((q-p).length for p in edge)>grid/2]
 verts,_,faces,*_=delaunay_2d_cdt(edge+pts,[(i,(i+1)%n) for i in range(n)],[list(range(n))],1,1e-7)
 hits=[(view.cast(v)[0],view.normal(v)) for v in verts];missed=[tuple(v) for v,(h,_) in zip(verts,hits) if h is None]
 assert not missed,('corte sem lataria',missed[:5])
 k=len(hits);V=[h-n*DEPTH_IN for h,n in hits]+[h+n*DEPTH_OUT for h,n in hits];F=[];count={}
 for f in faces:
  F.append(tuple(f));F.append(tuple(k+i for i in reversed(f)))
  for a,b in zip(f,f[1:]+f[:1]):count[frozenset((a,b))]=count.get(frozenset((a,b)),0)+1
 F+=[(a,b,k+b,k+a) for a,b in (tuple(e) for e,c in count.items() if c==1)]
 return V,F

def cut(body,view,edge,name,m):
 """The part inside the outline (GAP/2 in from it) cut out of the body as its own object, and the body cut back GAP/2
 outside it. Called with the windows' cuts, while the body's material slots are criar_fusca_v2's (fusca_acabamento
 cut_lid: a boolean once the cabin's and the fenders' slots are added would paint the wrong faces)."""
 part=bpy.data.objects.new(name,body.data.copy());V2.linkar(part)
 V,F=slab(view,offset(edge,-GAP/2));cutter=V2.novo_objeto('Cortador_'+name,V,F,suave=False);V2.recalcular_normais(cutter)
 b=part.modifiers.new('Peca','BOOLEAN');b.operation='INTERSECT';b.object=cutter;b.solver='MANIFOLD';V2.aplicar_mods(part)
 bpy.data.objects.remove(cutter)
 V,F=slab(view,offset(edge,GAP/2));V2.subtrair(body,V,F)
 for i,mat in enumerate(part.data.materials):
  if mat is None:part.data.materials[i]=m['interior']
 islands=pieces(part)
 print(f'RECORTE {name}: {len(part.data.polygons)} faces, {len(islands)} peca(s)',islands if len(islands)>1 else '',flush=True)
 assert len(part.data.polygons)>200 and sum(i[0] for i in islands[1:])<.05*islands[0][0],(name,len(part.data.polygons),islands)
 return part
def pieces(o):
 """The separate pieces of the object's mesh: [(vertices, lowest corner, highest corner)]."""
 bm=bmesh.new();bm.from_mesh(o.data);seen=set();out=[]
 for v in bm.verts:
  if v in seen:continue
  stack=[v];seen.add(v);group=[v]
  while stack:
   u=stack.pop()
   for e in u.link_edges:
    w=e.other_vert(u)
    if w not in seen:seen.add(w);stack.append(w);group.append(w)
  P=np.array([tuple(q.co) for q in group]);out.append((len(group),tuple(P.min(0).round(3)),tuple(P.max(0).round(3))))
 bm.free();return out

def seal(view,edge,name,m):
 """The rubber along the middle of the gap round the outline, SEAL_DEPTH under the skin."""
 pts=[]
 for q in thin(smooth(edge,.004),.02):
  hit,_=view.cast(q);_,n,_,_=view.sup.bvh.find_nearest(hit);pts.append(hit-n*SEAL_DEPTH)
 return C.pipe(name,pts,SEAL_R,m['borracha'],6,closed=True)

# --- The outlines --------------------------------------------------------------------------------------------------
def door_view(sup,s):return View(sup,(-s,0,0),(0,1,0),(0,0,1))
def door_outline():
 """The door's outline in the side view (y, z): criar_fusca_v2's seams (front and rear edges, sill), its top a frame
 round the window (MED.JAN_PORTA, fusca_acabamento's door window): DOOR_FRAME over it and along the A-pillar, out to
 the rear seam behind it. The front edge stands straight up to DOOR_BELT and turns there to the window's front."""
 # Points of the side view as 2D vectors: x the car's y (forward is -), y its z.
 win=smooth([Vector(p) for p in MED.JAN_PORTA],.006)
 if area(win)<0:win.reverse() # counter-clockwise: the bottom from front to back, the rear edge up, the top forward...
 frame=offset(win,DOOR_FRAME);top=max(p.x for p in win)+DOOR_FRAME
 # The frame's top run from its rear edge (stretched back to the rear seam) over the top and down the A-pillar,
 # kept above the window's bottom corners.
 zcut=min(p.y for p in win)+.045;n=len(frame)
 start=max(range(n),key=lambda i:(frame[i].y>zcut and frame[i-1].y<=zcut and frame[i].x>0))
 chain=[]
 for k in range(n):
  p=frame[(start+k)%n]
  if p.y<=zcut and chain:break
  chain.append(Vector((p.x+(REAR-top)*float(np.clip((p.x-.18)/(top-.18),0,1)),p.y)))
 ring=[Vector((FRONT,SILL)),Vector((REAR,SILL)),Vector((REAR,zcut))]+chain+[Vector((FRONT,DOOR_BELT))]
 return thin(smooth(ring,.008),EDGE_STEP)

def hood_view(sup):return View(sup,(0,1,-1),(1,0,0))
# The front lid's rear corners rounded wider than the measured outline's: from its side at CORNER_Y to its rear edge at
# CORNER_X. The measured corners sit low on the cowl's shoulders, where the rear edge climbs back up to the middle:
# cut there, each corner was a sharp downward point (and swung forward into the shoulder as the lid opened).
CORNER_X,CORNER_Y=.40,-.82
def hood_plan():
 """MED.PLANTA_CAPO with its rear corners rounded (CORNER_X, CORNER_Y): (x, y) points from the left side's front
 round the rear edge to the right side's front."""
 P=MED.PLANTA_CAPO
 back=sorted([(x,y) for x,y in P if 0<=x<=CORNER_X and y>-.75],key=lambda p:p[0])
 side=sorted([(x,y) for x,y in P if x>0 and y<CORNER_Y],key=lambda p:-p[1])
 r=np.array([(x,y) for x,y in P if x>0 and -.9<y<-.7]);r=r[np.argsort(r[:,1])]
 R=Vector(back[-1]);S=Vector((float(np.interp(CORNER_Y,r[:,1],r[:,0])),CORNER_Y));Cp=Vector((S.x+.01,R.y))
 corner=[tuple((1-t)**2*R+2*(1-t)*t*Cp+t*t*S) for t in np.linspace(0,1,9)[1:-1]]
 right=back+corner+[tuple(S)]+side
 left=[(-x,y) for x,y in right if x>0]
 return list(reversed(left))+right
def hood_outline(sup):
 """The front lid's outline: the measured one (hood_plan) seen from above along its sides and its rear edge by the
 windscreen, and on the nose's upright front a foot just over the apron, its corners rounded into the sides."""
 view=hood_view(sup)
 # The outline from its left side's HOOD_JOIN round the rear edge to the right side's.
 run=[p for p in hood_plan() if p[1]>=HOOD_JOIN-.003]
 top=[sup.topo(x,y)[0] for x,y in V2.densificar(run,.01,False)]
 assert all(top),'contorno do capo fora da lataria'
 xj,zj=abs(run[-1][0]),sup.topo(abs(run[-1][0]),run[-1][1])[0].z
 # Down the nose from the right side's join, across the foot, up to the left side's.
 down=[]
 for t in np.linspace(0,1,14)[1:]:
  z=zj+(HOOD_FOOT_CORNER-zj)*t;x=xj+(HOOD_FOOT_X-xj)*t;down.append(sup.frente(x,z)[0])
 foot=[sup.frente(float(x),HOOD_FOOT+(HOOD_FOOT_CORNER-HOOD_FOOT)*(float(x)/HOOD_FOOT_X)**2)[0] for x in np.linspace(HOOD_FOOT_X,-HOOD_FOOT_X,26)[1:-1]]
 up=[Vector((-p.x,p.y,p.z)) for p in reversed(down)]
 assert all(down+foot),'pe do capo fora da lataria'
 ring=[view.flat(p) for p in top+down+foot+up]
 return thin(smooth(ring,.01),EDGE_STEP)

def lid_view(sup):return View(sup,FINISH.LOOK,FINISH.ACROSS)
def lid_outline(sup):
 view=lid_view(sup);return thin(smooth([view.flat(p) for p in FINISH.lid_outline(sup)],.004),EDGE_STEP)

def cut_all(sup,body,m):
 """The four parts cut out of the body (and the seals in their gaps): {side or 'capo' or 'tampa': part}. Replaces
 fusca_acabamento.cut_lid in exportar_fusca_jogo.py's build (the engine lid's own outline, now with a gap)."""
 for o in [o for o in bpy.data.objects if o.name.startswith(('Junta_porta_','Junta_capo'))]:bpy.data.objects.remove(o)
 parts,seals={},[]
 for s in (1,-1):
  view,edge=door_view(sup,s),door_outline()
  parts[s]=cut(body,view,edge,'Porta_'+('E' if s>0 else 'D'),m);seals.append(seal(view,edge,'Vedacao_porta_'+('E' if s>0 else 'D'),m))
 view,edge=hood_view(sup),hood_outline(sup)
 parts['capo']=cut(body,view,edge,'Capo',m);seals.append(seal(view,edge,'Vedacao_capo',m))
 view,edge=lid_view(sup),lid_outline(sup)
 parts['tampa']=cut(body,view,edge,'Tampa_motor',m);seals.append(seal(view,edge,'Vedacao_tampa_motor',m))
 parts['vedacoes']=seals
 return parts

# --- What rides on each part, its inside painted, the trunk, the hinges ----------------------------------------------
def riders(parts):
 """{part key: [the part, what rides on it]}: the door's glass, its rubber inside and out, the outer handle, the door
 mirror, the door card with its pocket, pull, crank, inner handle and lock knob; the front lid's chrome strip, handle
 and inner frame; the engine lid's louvres, handle, plate and the stays that prop it (they rest on the apron below)."""
 O=bpy.data.objects;out={}
 for s in (1,-1):
  side='E' if s>0 else 'D'
  names=[f'Vidro_porta_{side}',f'Moldura_porta_{side}',f'Borracha_porta_{side}',f'Macaneta_{side}',f'Macaneta_botao_{side}',
   f'Retrovisor_base_{side}',f'Retrovisor_braco_{side}',f'Retrovisor_{side}',f'Retrovisor_vidro_{side}',
   f'Forro_porta_{side}',f'Forro_porta_friso_{side}',f'Bolsa_porta_{side}',f'Bolsa_porta_friso_{side}',f'Puxador_porta_{side}',
   f'Manivela_cubo_{side}',f'Manivela_braco_{side}',f'Manivela_pegador_{side}',f'Macaneta_interna_{side}',f'Macaneta_interna_base_{side}',f'Pino_trava_{side}']
  missing=[n for n in names if n not in O];assert not missing,('porta sem',missing)
  out[s]=[parts[s]]+[O[n] for n in names]
 out['capo']=[parts['capo'],O['Capo_tira'],O['Capo_puxador']]+[o for o in O if o.name.startswith('Capo_estrutura')]
 out['tampa']=[parts['tampa']]+[o for o in O if o.name.startswith(('Veneziana_','Tampa_macaneta','Tampa_haste_')) or o.name=='Placa']
 return out

def world_mesh(objects,owners=None):
 """The objects' meshes as shown (curves too), in world coordinates: (vertices, faces); owners (a list) gets each
 face's object name."""
 dg=bpy.context.evaluated_depsgraph_get();V,F=[],[]
 for o in objects:
  if o.type not in ('MESH','CURVE'):continue
  ev=o.evaluated_get(dg);me=ev.to_mesh();W=o.matrix_world;b=len(V)
  V+=[W@v.co for v in me.vertices];F+=[[b+i for i in p.vertices] for p in me.polygons]
  if owners is not None:owners+=[o.name]*len(me.polygons)
  ev.to_mesh_clear()
 return V,F
def turn(at,axis,degrees):
 return Matrix.Translation(at)@Matrix.Rotation(math.radians(degrees),4,Vector(axis))@Matrix.Translation(-Vector(at))
def swing(moving,static,at,axis,angle,steps=12,who=None):
 """The part's mesh (moving) swung about the hinge to each step of its opening: the contacts with the rest of the car
 (static, a BVH) at each step, beyond those it already has shut. who (a set) gets (step, its face, the face met)."""
 V,F=moving;shut=None;out=[]
 for k in range(steps+1):
  T=turn(at,axis,angle*k/steps);pairs=set(BVHTree.FromPolygons([T@v for v in V],F).overlap(static))
  if shut is None:shut={i for i,_ in pairs}
  new={(i,j) for i,j in pairs if i not in shut};out.append(len({i for i,_ in new}))
  if who is not None:who.update((k,i,j) for i,j in new)
 return out,len(shut)
def hinge_search(name,ride_on,static,candidates,axis,angle,peca,descricao):
 """The first candidate place of the axis (in order of preference) through which the part swings its whole opening
 with no new contact; hinge() records it. static: (BVH, each face's object name)."""
 static,owners=static;mine=[];moving=world_mesh(ride_on,mine);report=[]
 for at in candidates:
  who=set();hits,shut=swing(moving,static,at,axis,angle,who=who)
  report.append((tuple(round(v,3) for v in at),sum(hits),hits,sorted({(k,mine[i],owners[j]) for k,i,j in who})[:12]))
  if not sum(hits):
   print(f'DOBRADICA {name} em {tuple(round(v,3) for v in at)} ({len(report)} tentativa(s), {shut} contato(s) fechada)',flush=True)
   hinge(name,at,axis,angle,peca,descricao);return at
 report.sort(key=lambda r:r[1])
 raise AssertionError((name,'nenhuma dobradica sem colisao; melhores:',report[:4]))

def paint_insides(parts,m):
 """The parts' inner faces (criar_fusca_v2's dark 'interior', as cut) as the body's around them: bare metal in the
 team's colour (fusca_cabine.recolor_shell)."""
 M=C.materials(m)
 for key in (1,-1,'capo','tampa'):C.recolor_shell(parts[key],M)

def clear_of(part,objects,margin=.006):
 """The objects' vertices within margin of the part's inner side (or inside its shell) moved off it, square to it:
 fusca_cabine builds the dash's ends on the inner skin, which by the doors is now the doors' (they must swing free)."""
 V,F=world_mesh([part]);T=BVHTree.FromPolygons(V,F);moved=0
 for o in objects:
  W=o.matrix_world;Wi=W.inverted();me=o.data
  for v in me.vertices:
   p=W@v.co;loc,n,_,d=T.find_nearest(p,.05)
   if loc is None:continue
   sd=(p-loc).dot(n)
   if sd<margin:v.co=Wi@(p+n*(margin-sd));moved+=1
 return moved

def build(sup,body,m,parts,cavity):
 """After the cabin, the finish and the race prep (exportar_fusca_jogo.py build): the parts' insides painted, the
 trunk and its tank, then each hinge placed where its part swings clear and what rides on the part hung on it."""
 paint_insides(parts,m)
 O=bpy.data.objects
 for s in (1,-1):
  moved=clear_of(parts[s],[O['Painel_jogo'],O['Painel_acolchoado']])
  print(f'PAINEL afastado da porta {"E" if s>0 else "D"}: {moved} vertices',flush=True)
 made=trunk(sup,m,cavity)+hood_frame(sup,m)
 groups=riders(parts)
 seals=set(parts['vedacoes']);mine=lambda key:set(groups[key])
 everything=[o for o in bpy.data.collections['Fusca_v2'].objects if o.type in ('MESH','CURVE') and o not in seals]
 def static(key):
  owners=[];V,F=world_mesh([o for o in everything if o not in mine(key)],owners);return BVHTree.FromPolygons(V,F),owners
 # The doors: a vertical axis just ahead of the front seam, a little inside the skin (the hinges hide behind it).
 for s in (1,-1):
  skin=max(sup.lado(FRONT-.004,float(z),s)[0].x*s for z in np.linspace(.42,.9,9))
  cands=[Vector((s*(skin-i),FRONT-a,.6)) for i in (.012,.008,.004,0.,-.004) for a in (.012,.018,.024,.03,.04)]
  hinge_search(DOORS[s],groups[s],static(s),cands,(0,0,1),-s*DOOR_ANGLE,'porta',
   f'Porta do {"motorista" if s>0 else "passageiro"}: gira {DOOR_ANGLE:.0f} graus para fora em torno do eixo vertical das dobradicas, a frente da porta.')
 # The front lid: across the car by the windscreen, behind its rear corners.
 back=max(p[1] for p in hood_plan())
 cands=[]
 for dz in (.035,.02,.01,0.,-.01):
  for dy in (.01,.025,.04,.055):
   y=back+dy;cands.append(Vector((0,y,sup.topo(0,y)[0].z-dz)))
 hinge_search(HOOD,groups['capo'],static('capo'),cands,(1,0,0),-HOOD_ANGLE,'capo',
  f'Capo dianteiro (porta-malas e tanque): levanta {HOOD_ANGLE:.0f} graus pela frente, dobradicas junto ao para-brisa.')
 # The engine lid: on its own hinge (fusca_acabamento.open_lid), from its race prop on.
 at=Vector((0,FINISH.HINGE_Y,sup.topo(0,FINISH.HINGE_Y)[0].z-.015))
 hinge_search(LID,groups['tampa'],static('tampa'),[at],(1,0,0),LID_ANGLE,'tampa_motor',
  f'Tampa do motor: ja apoiada aberta {math.degrees(FINISH.LID_OPEN):.0f} graus para a corrida, levanta mais {LID_ANGLE:.0f} graus pela dobradica do topo.')
 for s in (1,-1):groups[s]+=door_hinges(sup,s,m)
 for key,name in ((1,DOORS[1]),(-1,DOORS[-1]),('capo',HOOD),('tampa',LID)):ride(groups[key],name)
 return made

def door_hinges(sup,s,m):
 """The door's two hinge leaves: from the knuckle on the axis (inside the body's edge, ahead of the gap) into the
 door's front edge, across the gap behind the seal. Open, they bridge the gap at the front, as a Fusca's do. Each at
 the height, low and high, where the axis lies deepest under the skin (the body narrows toward the cowl above and
 tucks in toward the sill below): the knuckle stays hidden in the body's edge."""
 M=C.materials(m);at=HINGES[DOORS[s]]['at'];out=[];side='E' if s>0 else 'D'
 depth=lambda z:s*sup.lado(at.y,float(z),s)[0].x-s*at.x
 heights=[max(np.arange(lo,hi,.01),key=depth) for lo,hi in ((.42,.6),(.6,.86))]
 assert all(depth(z)>.009 for z in heights),('dobradica da porta fora da lataria',[(round(float(z),2),round(depth(z),4)) for z in heights])
 for k,z in enumerate(heights):
  z=float(z)
  a=Vector((at.x,at.y,z));b=Vector((at.x-s*.008,FRONT+.03,z))
  out.append(C.box(f'Dobradica_porta_{side}_{k}',(a+b)/2,((b-a).length,.045,.005),M['steel'],.0015,z_axis=Vector((0,0,1)).cross(b-a).normalized(),up=Vector((0,0,1)),interno=True))
  out.append(C.cylinder(f'Dobradica_porta_pino_{side}_{k}',a-Vector((0,0,.03)),Vector((0,0,1)),.0045,.0045,.06,M['steel'],12,interno=True))
 return out

def hood_frame(sup,m):
 """The front lid's inner frame, as the stamped one under a Fusca's: a band round the lid 4 to 7 cm in from its edge
 and a rib down its middle, under the inner skin (painted like it)."""
 M=C.materials(m);view=hood_view(sup);edge=hood_outline(sup)
 def band(A,B,closed,name):
  """A flat channel between the polylines A and B (the view's plane): its floor and both walls, from 2.2 to 3.4 cm
  under the skin; faces turned toward the inside of the car and away from the channel."""
  n=len(A);V=[];kinds=[];nors=[]
  for q in A+B:
   hit,_=view.cast(q);nor=view.normal(q);V+=[hit-nor*.022,hit-nor*.034];nors.append(nor)
  top=lambda i:2*i;bot=lambda i:2*i+1;F=[]
  for i in range(n if closed else n-1):
   j=(i+1)%n
   F.append((bot(i),bot(j),bot(n+j),bot(n+i)));kinds.append(('fundo',i))
   F.append((top(i),top(j),bot(j),bot(i)));kinds.append(('A',i))
   F.append((top(n+i),top(n+j),bot(n+j),bot(n+i)));kinds.append(('B',i))
  o=V2.novo_objeto(name,V,F,[M['painted']],suave=False);me=o.data
  bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
  for f,(kind,i) in zip(bm.faces,kinds):
   across=Vector(V[2*(n+i)])-Vector(V[2*i]);want=-nors[i] if kind=='fundo' else (-across if kind=='A' else across)
   if f.normal.dot(want)<0:f.normal_flip()
  bm.to_mesh(me);bm.free();o['interno']=True;return o
 A=offset(edge,-.04);B=offset(edge,-.07)
 out=[band(A,B,True,'Capo_estrutura')]
 # The rib down the middle, from the band's front to its rear.
 inner=[q for q in B if abs(q.x)<.05];u0,u1=min(q.y for q in inner),max(q.y for q in inner)
 us=np.linspace(u0,u1,24);out.append(band([Vector((-.016,u)) for u in us],[Vector((.016,u)) for u in us],False,'Capo_estrutura_nervura'))
 return out

# --- The trunk under the front lid ---------------------------------------------------------------------------------
TRUNK_FLOOR=.45 # the trunk's floor (the street body's frame: in the game it is .19 lower)
WELL=.285 # the well's half width between the front wheels' housings (their liners stand at |x| .30)
SHELF=.775 # the shelves over the housings: over the liners' tops (fusca_cabine: the exporter lifts them .045)
LAMP_X,LAMP_Y=.352,-1.55 # the headlamps' buckets stand outboard of LAMP_X, ahead of LAMP_Y
# The cabin's front (fusca_cabine: the footwells' wall at FIREWALL_Y, the dash's top sloping up to the windscreen,
# the brake cylinder through the wall): the trunk keeps ahead of and over it, by these points (y, z).
CABIN_FRONT=[(-.97,-1.),(-.97,.80),(-.875,.875),(-.62,.965),(-.50,2.5),(2.,2.5),(2.,-1.)]
def housing():
 """The front wheels' housing as seen from the side (y, z): over the arch's liner (criar_fusca_v2's ARCO_LINHA, 3 cm
 under it, lifted .045 by the exporter) and the tyre (the race wheel at fusca_cabine's height), 1.2 cm clear, at most
 SHELF: the shelves over the housings curve down to the trunk's floor ahead of and behind them."""
 arc=np.array(MED.ARCO_LINHA);ys=np.linspace(-1.76,-.74,52);out=[(-1.76,-1.)]
 for y in ys:
  a=float(np.interp(y,arc[:,0],arc[:,1]))-.03+.045+.012
  d=abs(y-V2.EIXO_F);t=C.WHEEL_R+C.LOWER+math.sqrt(max(C.WHEEL_R**2-d*d,0))+.025 if d<C.WHEEL_R else -1.
  out.append((float(y),min(SHELF,max(a,t))))
 return out+[(-.74,-1.)]
def solid(name,V,F):
 o=V2.novo_objeto(name,V,F,suave=False);V2.recalcular_normais(o);return o
def prism_x(name,poly,x0,x1):
 V,F=[],[];V2.prisma_yz(poly,x0,x1,V,F);return solid(name,V,F)
def box_solid(name,lo,hi):
 return prism_x(name,[(lo[1],lo[2]),(hi[1],lo[2]),(hi[1],hi[2]),(lo[1],hi[2])],lo[0],hi[0])
def boolean(o,other,op):
 b=o.modifiers.new('B','BOOLEAN');b.operation=op;b.object=other;b.solver='MANIFOLD';V2.aplicar_mods(o);bpy.data.objects.remove(other)
def trunk(sup,m,cavity):
 """The tub (the space under the front lid, inside the body's inner skin, minus the wheels' housings, the headlamps'
 buckets and the cabin's front), the fuel tank at its back and the brake fluid's reservoir. The tub's surface is the
 boundary of that space but where it meets the skin (the lid's opening and the nose's own inside stay open)."""
 M=C.materials(m)
 # The space inside the skin: the uncut body (cavity, a copy taken before it was hollowed) moved in by the skin and 3 mm.
 inner=bpy.data.objects.new('Porta_malas_espaco',cavity);V2.linkar(inner);me=inner.data
 co=np.zeros(len(me.vertices)*3);no=np.zeros(len(me.vertices)*3);me.vertices.foreach_get('co',co);me.vertex_normals.foreach_get('vector',no)
 me.vertices.foreach_set('co',co-no*(C.SKIN+.003));me.update()
 # The opening in plan, 15 mm out from the lid's measured outline, from the floor up through the lid.
 ring=offset(resample([Vector(p) for p in hood_plan()],.02),.015);n=len(ring)
 V=[(p.x,p.y,TRUNK_FLOOR) for p in ring]+[(p.x,p.y,2.) for p in ring];F=[]
 for a,b,c in V2.triangular([(p.x,p.y) for p in ring]):F+=[(a,c,b),(n+a,n+b,n+c)]
 F+=[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
 tub=solid('Porta_malas',V,F)
 skin=inner.data.copy();boolean(tub,inner,'INTERSECT');print('PORTA_MALAS espaco',len(tub.data.polygons),flush=True)
 boolean(tub,prism_x('Cabine_frente',CABIN_FRONT,-2,2),'DIFFERENCE')
 for s in (1,-1):
  boolean(tub,prism_x('Caixa_roda',housing(),min(s*WELL,s*1.5),max(s*WELL,s*1.5)),'DIFFERENCE')
  boolean(tub,box_solid('Farol',(min(s*LAMP_X,s*1.5),-2.,-1.),(max(s*LAMP_X,s*1.5),LAMP_Y,2.)),'DIFFERENCE')
 print('PORTA_MALAS recortado',len(tub.data.polygons),flush=True)
 # Off where it lies on the skin; turned to face the space inside.
 T=BVHTree.FromPolygons([v.co for v in skin.vertices],[p.vertices for p in skin.polygons]);bpy.data.meshes.remove(skin)
 bm=bmesh.new();bm.from_mesh(tub.data)
 bmesh.ops.delete(bm,geom=[f for f in bm.faces if T.find_nearest(f.calc_center_median())[3]<.0015],context='FACES')
 bmesh.ops.reverse_faces(bm,faces=bm.faces);bm.to_mesh(tub.data);bm.free()
 tub.data.materials.clear();tub.data.materials.append(M['painted'])
 for p in tub.data.polygons:p.use_smooth=False
 tub['interno']=True;out=[tub]
 print(f'PORTA_MALAS {len(tub.data.polygons)} faces',flush=True)
 # The tank: its lower half in the well, its upper over the shelves, its top 4 cm under the lid's inside.
 tank=C.material('Tanque_fusca',(.03,.031,.034),metal=.35,rough=.45)
 y0,y1=-1.29,-.985
 top=min(sup.topo(x,float(y))[0].z for x in (-.43,.43) for y in np.linspace(y0,y1,6))-C.SKIN-.04
 out.append(C.box('Tanque_baixo',(0,(y0+y1)/2,(TRUNK_FLOOR+.005+SHELF+.03)/2),(2*WELL-.03,y1-y0,SHELF+.03-TRUNK_FLOOR-.005),tank,.03,interno=True))
 out.append(C.box('Tanque_cima',(0,(y0+y1)/2+.015,(SHELF+.015+top)/2),(.86,y1-y0-.03,top-SHELF-.015),tank,.035,interno=True))
 # The seam where its two pressed halves are welded: a flange round it.
 out.append(C.box('Tanque_flange',(0,(y0+y1)/2+.015,(SHELF+.015+top)/2),(.884,y1-y0-.006,.006),tank,.002,interno=True))
 # Its filler neck on top, toward the passenger's side, the cap; the gauge's sender in the middle.
 neck=Vector((-.22,-1.12,top))
 out.append(C.cylinder('Tanque_bocal',neck-Vector((0,0,.01)),Vector((0,.25,1)).normalized(),.034,.03,.06,tank,20,interno=True))
 cap=neck+Vector((0,.25,1)).normalized()*.05
 out.append(C.cylinder('Tanque_tampa',cap,Vector((0,.25,1)).normalized(),.043,.04,.022,M['chrome'],24,interno=True))
 out.append(C.cylinder('Tanque_boia',Vector((.08,-1.1,top-.003)),Vector((0,0,1)),.04,.04,.012,M['steel'],20,interno=True))
 # The brake fluid's reservoir: a translucent bottle by the well's left wall, ahead of the tank.
 bottle=C.material('Reservatorio_freio',(.72,.66,.45),rough=.35)
 out.append(C.cylinder('Reservatorio_freio',Vector((.2,-1.38,TRUNK_FLOOR+.18)),Vector((0,0,1)),.035,.035,.10,bottle,16,interno=True))
 out.append(C.cylinder('Reservatorio_tampa',Vector((.2,-1.38,TRUNK_FLOOR+.28)),Vector((0,0,1)),.025,.022,.02,M['wheel'],16,interno=True))
 leaks=C.poking_out(C.Cabin(sup),out[1:])
 assert not leaks,'porta-malas atravessando a lataria: '+', '.join(f'{n} {d*1000:.0f} mm' for n,d in leaks)
 return out
