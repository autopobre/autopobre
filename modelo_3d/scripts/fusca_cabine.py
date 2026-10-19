"""The Fusca's cabin for the game (exportar_fusca_jogo.py builds it into fusca_v2.glb): a 1970 Fusca prepared to race.

Kept from the street car: the metal dash painted like the body (the round speedometer behind the wheel, the radio
grille, the glovebox, the grab handle, two knobs) under a black padded top, vinyl door cards with crank, pull and map
pocket, the pale ribbed headliner, sun visors and the dome light. Race kit: a cage (main hoop behind the seats, bars
up the A-pillars and across the windscreen header, low door bars, a diagonal, rear stays and a harness bar), a
bucket seat with a red harness, a tachometer on the dash top, a switch panel under the dash, a shifter tower on the
tunnel, rubber mats, the rear seat taken out (battery box on its base) and a fire extinguisher where the passenger
seat was. The rear-view mirror hangs from the header bar; its glass (Espelho_interno_fusca) shows the road behind in
the game (fusca-cockpit.js), as do the dials (Mostrador_*), which carry UVs for the faces the game paints.

Frame: criar_fusca_v2.py's (front -Y, +X the driver's left side, Z up, origin at the wheelbase's middle on the
ground). The game's driver brings the controls he works (driver.js: race wheel, pedals, H lever; cockpit.js places
them in the Opala, fusca.js FUSCA_SEAT moves them into this car); the cabin is built round those places.
Objects flagged "interno" are the player's only: the rivals (immersive-visuals.js fuscaRival) drop them.
"""
import bpy,bmesh,math
import numpy as np
from mathutils import Vector,Matrix
import criar_fusca_v2 as V2,medidas_fusca as MED

OFFSET_X=.2165 # exportar_fusca_jogo.py: game x = OFFSET_X - y
# The race car sits LOWER than criar_fusca_v2's street car (a Copa Fusca photo: smaller wheels, the sills a few cm off
# the ground, the arches just over the tyres): the exporter brings everything but the wheels down by it, so a point of
# the game's frame is that much higher in this one.
LOWER=.19
# The race wheels (fusca_acabamento.race_wheels): the tyre's radius and its half width either side of V2.BITOLA. The
# exporter leaves them where they are while the rest comes down by LOWER, so in this frame they sit LOWER higher. The
# cabin keeps out of the space they turn in (in_wheels): the rear seat's back wall stands 3 cm ahead of the rear tyres
# and the parcel shelf's underside 4 cm over them.
WHEEL_R,TYRE_HALF=.27,.09
REAR_WALL,SHELF=V2.EIXO_T-WHEEL_R-.03,LOWER+2*WHEEL_R+.04
def game(x,y,z):
 """A point of the game's car frame (+X forward, +Y up, -Z the driver's side) in this frame."""
 return Vector((-z,OFFSET_X-x,y+LOWER))
# fusca.js FUSCA_SEAT plus cockpit.js's V06 drop: where the driver's group (with cockpit.js's controls) sits.
SEAT=(.257,-.077-.093,.06)
def opala(x,y,z):
 """A point of cockpit.js's frame (the Opala's controls, as the driver carries them) in this car."""
 return game(x+SEAT[0],y+SEAT[1],z+SEAT[2])
DRIVER=opala(0,0,-.34).x # the driver's centre line: 28 cm left of the car's
WHEEL,WHEEL_TILT=opala(.22,.88,-.34),.38 # the race wheel's centre; its top leans toward the windscreen
COLUMN=(opala(.368,.821,-.34),opala(.62,.719,-.34)) # the column's start behind the hub, and its slope
AXLE=opala(.755,.70,-.34) # the hanging pedals' axle (cockpit.js), clutch to throttle across x
PEDALS=[opala(.755,.70,z).x for z in (-.46,-.35,-.248)]
SHIFTER=opala(.095,.472,.02) # the H lever's base plate
EYE=game(.057,1.01,.015) # main.js: cockpit.js eye + fusca.js FUSCA_EYE
SKIN=.02 # criar_fusca_v2.casca_oca
FLOOR=.312 # the cabin floor's top (the driver's heels rest at .332)

def material(name,color,metal=0.,rough=.5,**kw):
 return bpy.data.materials.get(name) or V2.material(name,color,metal,rough,**kw)
def materials(m):
 """The cabin's materials, by role; m: criar_fusca_v2.criar_materiais()."""
 return {
  'painted':material('Pintura_interna_fusca',(.006,.03,.22),metal=.2,rough=.42), # the team's colour in the game (fusca.js)
  'face':bpy.data.materials.get('Fusca_painel') or material('Fusca_painel',(.006,.03,.22),metal=.3,rough=.25),
  'liner':material('Forro_teto',(.62,.6,.55),rough=.82),
  'vinyl':material('Vinil_preto',(.018,.018,.02),rough=.55,Coat_Weight=.15,Coat_Roughness=.4),
  'cage':material('Gaiola',(.36,.37,.38),metal=.55,rough=.34),
  'shell':material('Banco_concha',(.012,.012,.014),rough=.3,Coat_Weight=.6,Coat_Roughness=.15),
  'fabric':material('Banco_tecido',(.035,.036,.04),rough=.95),
  'belt':material('Cinto',(.5,.03,.03),rough=.8),
  'alu':material('Aluminio',(.62,.63,.64),metal=.85,rough=.32),
  'steel':material('Aco_escuro',(.05,.05,.055),metal=.6,rough=.45),
  'rubber':m['borracha'],'chrome':m['cromo'],'line':m['linha'],
  'speedo':material('Mostrador_velocimetro',(.012,.012,.014),rough=.4),
  'tacho':material('Mostrador_contagiros',(.012,.012,.014),rough=.4),
  'mirror':material('Espelho_interno_fusca',(.55,.58,.6),metal=1,rough=.04),
  'red':material('Extintor',(.6,.02,.015),metal=.1,rough=.3,Coat_Weight=.5),
  'lamp':material('Luz_teto',(.9,.88,.8),rough=.3,Emission_Color=(1,.95,.85),Emission_Strength=.15),
  'wheel':material('Volante_baquelite',(.012,.012,.012),rough=.25),
 }

# --- Geometry helpers --------------------------------------------------------------------------------------------------
def obj(name,verts,faces,mat,smooth=True,sharp=35,interno=False):
 o=V2.novo_objeto(name,verts,faces,mat if isinstance(mat,(list,tuple)) else [mat],smooth)
 V2.recalcular_normais(o)
 if smooth and sharp:o.data.set_sharp_from_angle(angle=math.radians(sharp))
 if interno:o['interno']=True
 return o
def flag(o,interno=True):
 if interno:o['interno']=True
 return o
def frame_from(z_axis,up=Vector((0,0,1))):
 z=Vector(z_axis).normalized();x=up.cross(z)
 if x.length<1e-6:x=Vector((1,0,0)).cross(z)
 x.normalize();y=z.cross(x);return Matrix((x,y,z)).transposed()
def place(o,at,z_axis,up=Vector((0,0,1)),spin=0.):
 """Turns o's local +Z to z_axis (its +Y as near up as it goes), spun about it, and moves it to at."""
 o.matrix_world=Matrix.Translation(at)@frame_from(z_axis,up).to_4x4()@Matrix.Rotation(spin,4,'Z');return o
def box(name,at,size,mat,bevel=.004,z_axis=None,up=Vector((0,0,1)),spin=0.,interno=False):
 o=V2.caixa(name,(0,0,0),size,mat,bevel,2) if bevel else V2.caixa(name,(0,0,0),size,mat)
 o.data.set_sharp_from_angle(angle=math.radians(40))
 if z_axis is None:o.location=at
 else:place(o,Vector(at),z_axis,up,spin)
 return flag(o,interno)
def cylinder(name,at,axis,r1,r2,length,mat,seg=24,interno=False,cap=True):
 """A tube from at along axis (r1 there, r2 at its far end); cap: both ends closed, False open, 'back' only at."""
 bm=bmesh.new();bmesh.ops.create_cone(bm,cap_ends=bool(cap),segments=seg,radius1=r1,radius2=r2,depth=length)
 if cap=='back':bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.normal.z>.9],context='FACES_ONLY')
 bmesh.ops.translate(bm,verts=bm.verts,vec=(0,0,length/2))
 me=bpy.data.meshes.new(name);bm.to_mesh(me);bm.free();me.materials.append(mat)
 o=V2.linkar(bpy.data.objects.new(name,me))
 for p in me.polygons:p.use_smooth=True
 me.set_sharp_from_angle(angle=math.radians(40));place(o,Vector(at),axis);return flag(o,interno)
def spline(points,step=.03):
 """A Catmull-Rom curve through the points, resampled about every step metres."""
 P=[Vector(p) for p in points];P=[P[0]+(P[0]-P[1])]+P+[P[-1]+(P[-1]-P[-2])];out=[]
 for i in range(1,len(P)-2):
  a,b,c,d=P[i-1],P[i],P[i+1],P[i+2];n=max(1,int((c-b).length/step))
  for k in range(n):
   t=k/n;out.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
 out.append(P[-2]);return out
def pipe(name,points,r,mat,sides=12,closed=False,interno=False,smooth=False,step=.03):
 """A round tube along the points (Catmull-Rom smoothed when smooth), its frames carried along without twisting."""
 C=spline(points,step) if smooth else [Vector(p) for p in points]
 n=len(C);T=[]
 for i in range(n):
  a=C[max(i-1,0)] if not closed else C[(i-1)%n];b=C[min(i+1,n-1)] if not closed else C[(i+1)%n];T.append((b-a).normalized())
 u=T[0].orthogonal().normalized();V,F=[],[]
 for i in range(n):
  if i:u=(u-T[i]*u.dot(T[i])).normalized()
  w=T[i].cross(u)
  for k in range(sides):
   a=2*math.pi*k/sides;V.append(C[i]+(u*math.cos(a)+w*math.sin(a))*r)
 for i in range(n if closed else n-1):
  j=(i+1)%n
  for k in range(sides):F.append((i*sides+k,i*sides+(k+1)%sides,j*sides+(k+1)%sides,j*sides+k))
 if not closed:F+=[tuple(range(sides))[::-1],tuple(range((n-1)*sides,n*sides))]
 return obj(name,V,F,mat,True,60,interno)
def strip(name,a,b,width,thick,mat,normal,interno=False):
 """A flat strap from a to b, width across, facing normal."""
 a,b=Vector(a),Vector(b);t=(b-a).normalized();n=(Vector(normal)-t*t.dot(Vector(normal))).normalized();s=t.cross(n)
 V=[a+s*sx*width/2+n*nz*thick/2 for sx,nz in ((-1,-1),(1,-1),(1,1),(-1,1))];V+=[v+(b-a) for v in V]
 F=[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
 return obj(name,V,F,mat,False,0,interno)
def sweep(name,path,section,mat,closed_section=True,caps=True,side=Vector((1,0,0)),mats_of=None,interno=False):
 """section [(u,v)]: u along side (+X), v along the path's normal in the plane across side (toward +Z for a path
 heading +Y). mats_of(k): material slot of the band after section point k."""
 path=[Vector(p) for p in path];n=len(path);m=len(section);V,F=[],[]
 for i in range(n):
  t=(path[min(i+1,n-1)]-path[max(i-1,0)]).normalized();nv=t.cross(side).normalized()
  for u,v in section:V.append(path[i]+side*u-nv*v)
 bands=m if closed_section else m-1
 for i in range(n-1):
  for k in range(bands):F.append((i*m+k,i*m+(k+1)%m,(i+1)*m+(k+1)%m,(i+1)*m+k))
 if caps and closed_section:F+=[tuple(range(m)),tuple(range((n-1)*m,n*m))[::-1]]
 o=obj(name,V,F,mat,True,40,interno)
 if mats_of:
  for p in o.data.polygons[:(n-1)*bands]:p.material_index=mats_of(p.index%bands)
 return o
def disc_uv(o,center,right,up,width,height=None):
 """Planar UVs: u to the driver's right (width across the unit square; negative mirrors it), v up. The glTF export
 turns v over: a canvas the game paints there goes with flipY false, as the GLTFLoader's own textures."""
 me=o.data;uv=me.uv_layers.new(name='UVMap');W=o.matrix_world;height=height or width
 for loop in me.loops:
  p=W@me.vertices[loop.vertex_index].co-center;uv.data[loop.index].uv=(.5+p.dot(right)/width,.5+p.dot(up)/height)
 o['uv']=True;return o
def disc(name,at,normal,radius,mat,seg=40,interno=True,up=Vector((0,0,1))):
 """A flat disc facing normal (its local +Z), with dial UVs."""
 bm=bmesh.new();bmesh.ops.create_circle(bm,cap_ends=True,segments=seg,radius=radius)
 me=bpy.data.meshes.new(name);bm.to_mesh(me);bm.free();me.materials.append(mat)
 o=V2.linkar(bpy.data.objects.new(name,me));place(o,Vector(at),normal,up);bpy.context.view_layer.update()
 R=o.matrix_world.to_3x3();disc_uv(o,Vector(at),R@Vector((1,0,0)),R@Vector((0,1,0)),2*radius)
 return flag(o,interno)

class Cabin:
 """The skin the cabin is built against: sup (criar_fusca_v2.Superficie, the body's outer surface before it was
 hollowed) and the inner skin SKIN inside it."""
 def __init__(self,sup):self.sup=sup;self.bvh=sup.bvh
 def wall(self,y,z,s=1,inset=0.):
  loc,nor=self.sup.lado(y,z,s);return (loc-nor*(SKIN+inset),-nor) if loc else (None,None)
 def half(self,y,z,inset=0.,reach=.03):
  """The inner skin's half width at (y, z): the narrowest within reach up and down (the cowl and the front
  fenders round in fast near the windscreen's base)."""
  xs=[p.x for p in (self.wall(y,z+d,1,inset)[0] for d in (-reach,0,reach)) if p]
  return min(xs) if xs else .5
 def roof(self,x,y,inset=0.):
  loc,nor=self.sup.topo(x,y);return (loc-nor*(SKIN+inset),-nor) if loc else (None,None)
 def inside(self,p,margin,axis_z=.85):
  """p pulled toward the cabin's middle (0, p.y, axis_z) until it is margin inside the outer surface."""
  p=Vector(p);c=Vector((0,p.y,axis_z));d=p-c;length=d.length
  if length<1e-6:return p
  d/=length;hit,*_=self.bvh.ray_cast(c,d,4.)
  if hit is None:return p
  reach=(hit-c).length-margin;return c+d*min(length,reach)

# --- The cabin ---------------------------------------------------------------------------------------------------------
def build(sup,body,m):
 """Everything inside, in criar_fusca_v2's frame. Returns the new objects."""
 M=materials(m);cab=Cabin(sup);made=[]
 add=lambda o:(made.append(o),o)[1]
 global BARS
 BARS=pillar_bars(cab)
 recolor_shell(body,M)
 for o in headliner(cab,M):add(o)
 for o in dash(cab,M):add(o)
 for o in doors(cab,M):add(o)
 for o in floor(cab,M):add(o)
 for o in seat(cab,M):add(o)
 for o in cage(cab,M):add(o)
 for o in mirror_inside(cab,M):add(o)
 for o in classic_wheel(M):add(o)
 leaks=poking_out(cab,made)
 assert not leaks,'peças da cabine atravessando a lataria: '+', '.join(f'{n} {d*1000:.0f} mm' for n,d in leaks)
 clash=in_wheels(made)
 assert not clash,'peças da cabine dentro das rodas: '+', '.join(f'{n} ({k} pontos)' for n,k in clash)
 return made

def in_wheels(objects,margin=.015):
 """The objects reaching into the space a tyre turns in (its radius and half width round each wheel's centre, plus
 margin), with how many points do: points spread over the triangles the GLB gets near a wheel, as a large end cap
 can cross a tyre between its corners (the rear seat's base once showed through the rear wheels' faces)."""
 bpy.context.view_layer.update();out=[];reach=Vector((TYRE_HALF+margin,WHEEL_R+margin,WHEEL_R+margin))
 wheels=[Vector((s*V2.BITOLA,ya,WHEEL_R+LOWER)) for ya in (V2.EIXO_F,V2.EIXO_T) for s in (1,-1)]
 inside=lambda p:any(abs(p.x-w.x)<reach.x and math.hypot(p.y-w.y,p.z-w.z)<reach.y for w in wheels)
 for o in objects:
  if o.type!='MESH':continue
  me=o.data;me.calc_loop_triangles();W=o.matrix_world;co=[W@v.co for v in me.vertices];hits=0
  for t in me.loop_triangles:
   a,b,c=(co[i] for i in t.vertices)
   lo=Vector([min(a[k],b[k],c[k]) for k in range(3)]);hi=Vector([max(a[k],b[k],c[k]) for k in range(3)])
   if not any(all(lo[k]<w[k]+reach[k] and hi[k]>w[k]-reach[k] for k in range(3)) for w in wheels):continue
   hits+=sum(inside(a+(b-a)*(u/6)+(c-a)*(v/6)) for u in range(7) for v in range(7-u))
  if hits:out.append((o.name,hits))
 return out

def poking_out(cab,objects,tolerance=.003):
 """The objects with vertices, faces' middles or (larger faces, a dash's end caps) their fan triangles' middles
 outside the body's outer surface: in front of the nearest point of it, along its normal (criar_fusca_v2's body is
 one closed surface, its normals outward)."""
 bpy.context.view_layer.update();out=[]
 for o in objects:
  if o.type!='MESH':continue
  W=o.matrix_world;worst=0.
  co=[v.co for v in o.data.vertices];points=co+[f.center for f in o.data.polygons]
  for f in o.data.polygons:
   if len(f.vertices)>4:points+=[(co[f.vertices[0]]+co[f.vertices[i]]+co[f.vertices[i+1]])/3 for i in range(1,len(f.vertices)-1)]
  for p in (W@q for q in points):
   loc,nor,_,dist=cab.bvh.find_nearest(p)
   if loc is not None and dist<.2:worst=max(worst,(p-loc).dot(nor))
  if worst>tolerance:out.append((o.name,worst))
 return out

# The cage's A-pillar bars hug the pillars (from the cockpit each bar stands in front of its pillar, as in a race
# Fusca), then run along the roof's edge over the door to the main hoop; the header bar crosses under the roof at
# HEADER_Y, behind the windscreen's top, out of the way of the glass. The headliner covers the roof between them; the
# pillars, the header and the doors' frames are bare metal, and the edge between the two hides under the bars.
HEADER_Y=-.33
def on_skin(cab,p,inset):
 """The outer surface's point nearest p, moved inset along its inward normal."""
 loc,n,_,_=cab.bvh.find_nearest(Vector(p));return loc-n*inset
def pillar_bars(cab):
 """{side: points} of each A-pillar bar's centre line, front to back (y growing): up from the footwell's front inside
 the cowl, along the middle of the pillar (between the windscreen's edge and the door window's), then along the roof's
 edge over the door window."""
 inset=SKIN+CAGE_R+.004;bars={}
 at=lambda pts,z:Vector([float(np.interp(z,[p.z for p in pts],[p[i] for p in pts])) for i in range(3)])
 for s in (1,-1):
  screen=sorted((cab.sup.topo(x,y)[0] for x,y in V2.densificar(MED.PLANTA_PARABRISA,.01,True) if s*x>.40 and -.58<y<-.405),key=lambda p:p.z)
  window=sorted((cab.sup.lado(y,z,s)[0] for y,z in V2.densificar(MED.JAN_PORTA,.01,True) if y<-.25 and z>1.03),key=lambda p:p.z)
  low=[cab.inside(Vector(p),SKIN+CAGE_R+.022) for p in ((s*.56,-.74,FLOOR+.005),(s*.60,-.70,.62),(s*.60,-.62,.86))];low[0].z=FLOOR+.005
  pillar=[on_skin(cab,(at(screen,z)+at(window,z))/2,inset) for z in np.linspace(1.07,1.26,6)]
  rail=[on_skin(cab,cab.sup.lado(float(y),1.405,s)[0],inset) for y in (-.26,-.14,0.,.14,.28,.42)]
  bars[s]=low+pillar+rail
 return bars
BARS={}
def along(path,y):
 """The point of a path (y growing) at y."""
 ys=[p.y for p in path];return Vector([float(np.interp(y,ys,[p[i] for p in path])) for i in range(3)])
def under_bars(c):
 """c (on the side walls, from the windscreen to the main hoop) lower round the cabin's axis than its A-pillar bar."""
 b=along(BARS[1 if c.x>0 else -1],c.y);return math.atan2(c.z-.85,abs(c.x))<math.atan2(b.z-.85,abs(b.x))

def recolor_shell(body,M):
 """The body's inner faces (criar_fusca_v2: the dark 'interior' slots): the headliner over the roof between the cage's
 bars, back to the rear window, the rest painted like the body, bare metal inside (the pillars and the header too, as
 in a Fusca prepared to race)."""
 me=body.data;slots=[i for i,mt in enumerate(me.materials) if mt and mt.name=='Interior_Escuro']
 me.materials.append(M['liner']);liner=len(me.materials)-1;me.materials.append(M['painted']);paint=len(me.materials)-1
 for p in me.polygons:
  if p.material_index in slots:
   c,n=p.center,p.normal
   # Its edge hides under the header bar and the A-pillar bars, under the main hoop, behind the side panels' tops
   # and under the parcel shelf at the back (the lining covers the wall under the rear window): the faces' steps
   # along it never show.
   lined=c.z>.97 if c.y<REAR_WALL-.015 else c.z>.81
   bare=c.y<HEADER_Y or (c.y<MAIN_Y and under_bars(c))
   p.material_index=liner if lined and -.62<c.y<1.32 and not bare else paint

def headliner(cab,M):
 """Bows under the lined roof (the headliner's seams), sun visors on the header and the dome light."""
 out=[]
 for k,y in enumerate((-.24,.0,.24,.48,.72,.96)):
  pts=[]
  for x in np.linspace(-.62,.62,25):
   p,n=cab.roof(float(x),y,.002)
   if p is not None and n.z<-.45 and p.z>1.375 and not (y<MAIN_Y and under_bars(p)):pts.append(p)
  if len(pts)>4:out.append(pipe(f'Forro_costura_{k}',pts,.0055,M['liner'],8))
 # Sun visors folded up against the lining, hinged behind the cage's header bar over each seat.
 for s in (1,-1):
  p,n=cab.roof(s*.27,-.22,.03)
  v=box(f'Quebra_sol_{"E" if s>0 else "D"}',p,(.30,.15,.014),M['liner'],.006,z_axis=-n,up=Vector((0,-1,0)))
  bpy.context.view_layer.update();W=v.matrix_world
  out.append(v);out.append(pipe(f'Quebra_sol_eixo_{s}',[W@Vector((-.13,.078,0)),W@Vector((.13,.078,0))],.005,M['chrome'],8,interno=True))
 p,n=cab.roof(0,.42,.004)
 out.append(box('Luz_teto_base',p,(.12,.07,.012),M['chrome'],.004,z_axis=-n,up=Vector((0,-1,0)),interno=True))
 out.append(box('Luz_teto',p-n*.007,(.105,.055,.008),M['lamp'],.004,z_axis=-n,up=Vector((0,-1,0)),interno=True))
 return out

# The dash's face (y DASH_Y) runs from DASH_LOW up under the padded top; the column comes through it at the collar.
DASH_Y,DASH_LOW,DASH_TOP=-.43,.79,.995
FIREWALL_Y=-.86
GLASS_Y=-.587 # the windscreen's base (criar_fusca_v2 PLANTA_PARABRISA)
def base(cab,x):
 """The height of the inner skin under the windscreen's base, x across."""
 p,_=cab.roof(x,GLASS_Y);return p.z if p else 1.05
def loft(name,profile,mats,cab,mat_of,follow={},inset=.004,stations=33,interno=False):
 """A profile [(y, z)] across the cabin, each point's ends on the inner skin; follow {index: f(base, z)} sets those
 points' height from the windscreen's base at that station (the cowl rises toward the middle)."""
 # Edges between fixed points are split every 3 cm, so the ends follow the skin between the profile's points.
 dense,source,keep=[],[],{}
 for i,(y,z) in enumerate(profile):
  if i in follow:keep[len(dense)]=follow[i]
  dense.append((y,z));source.append(i);j=(i+1)%len(profile);y2,z2=profile[j]
  if i not in follow and j not in follow:
   k=max(1,int(math.hypot(y2-y,z2-z)/.03))
   for q in range(1,k):dense.append((y+(y2-y)*q/k,z+(z2-z)*q/k));source.append(i)
 # Ahead of the windscreen's base the skin rounds in under the cowl, and an end cap's chords between points on it
 # would cut outside: the ends there stay well inside.
 n=len(dense);halfs=[cab.half(y,z,inset) if y>GLASS_Y else cab.half(y,z,inset+.035,.09) for y,z in dense];V,F=[],[]
 for j in range(stations):
  t=2*j/(stations-1)-1
  for i,(y,z) in enumerate(dense):
   x=halfs[i]*t
   if i in keep:z=keep[i](base(cab,x),z)
   V.append((x,y,z))
 for j in range(stations-1):
  for i in range(n):F.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
 F+=[tuple(range(n))[::-1],tuple(range((stations-1)*n,stations*n))]
 o=obj(name,V,F,mats,True,30,interno)
 for p in o.data.polygons[:(stations-1)*n]:p.material_index=mat_of(source[p.index%n])
 V2.recalcular_normais(o);return o

def dash(cab,M):
 out=[]
 # The metal dash: its face toward the driver (the team's colour), its underside back to the footwell's front wall
 # (closing off the front trunk behind it) and its top under the pad, up to the windscreen.
 body=[(DASH_Y,DASH_LOW),(DASH_Y,DASH_TOP),(-.46,DASH_TOP+.012),(GLASS_Y+.007,1.0),(-.62,.95),(FIREWALL_Y,.86),(FIREWALL_Y,DASH_LOW)]
 out.append(loft('Painel_jogo',body,[M['vinyl'],M['face']],cab,lambda k:1 if k==0 else 0,follow={3:lambda b,z:b-.035}))
 # The padded top: a rounded roll over the face's top edge, flattening forward to the windscreen's base.
 top=DASH_TOP+.034
 pad=[(DASH_Y+.012,DASH_TOP-.018),(DASH_Y+.016,DASH_TOP+.004),(DASH_Y+.004,DASH_TOP+.026),(-.46,top),(-.52,top),
      (GLASS_Y+.001,top),(GLASS_Y+.001,top),(-.52,DASH_TOP+.006),(-.45,DASH_TOP+.002),(DASH_Y-.004,DASH_TOP-.012)]
 out.append(loft('Painel_acolchoado',pad,[M['vinyl']],cab,lambda k:0,inset=.006,
  follow={4:lambda b,z:z+(b-.012-z)*.5,5:lambda b,z:b-.012,6:lambda b,z:b-.03,7:lambda b,z:z+(b-.03-z)*.45}))
 face=lambda x,z,d=0:Vector((x,DASH_Y+d,z));toward=Vector((0,1,0))
 # The speedometer pod over the column, its chrome ring and dial (VDO, 0-140 km/h; fusca-cockpit.js paints it).
 sx,sz,sr=DRIVER,.94,.054
 out.append(cylinder('Velocimetro_caixa',face(sx,sz,-.004),toward,sr+.012,sr+.009,.016,M['face'],32,cap='back'))
 out.append(cylinder('Velocimetro_aro',face(sx,sz,.012),toward,sr+.008,sr+.003,.006,M['chrome'],32,interno=False,cap=False))
 out.append(disc('Velocimetro_mostrador',face(sx,sz,.006),toward,sr,M['speedo']))
 # Light and wiper knobs on either side; the radio's grille in the middle, the glovebox and grab handle opposite.
 for k,x in enumerate((sx+.13,sx-.13)):
  out.append(cylinder(f'Botao_painel_{k}',face(x,.905),toward,.012,.011,.022,M['wheel'],16,interno=True))
  out.append(cylinder(f'Botao_painel_aro_{k}',face(x,.905),toward,.016,.016,.004,M['chrome'],16,interno=True))
 out.append(box('Radio_moldura',face(0,.925,.004),(.20,.008,.068),M['chrome'],.003))
 out.append(box('Radio_grade',face(0,.925,.0085),(.186,.002,.056),M['line'],0))
 for k in range(6):out.append(box(f'Radio_aleta_{k}',face(0,.902+k*.0092,.0095),(.184,.004,.0034),M['chrome'],0,interno=True))
 gx=-.33
 out.append(pipe('Porta_luvas_junta',[face(gx+a,z,.0012) for a,z in ((.15,.85),(.15,.94),(-.15,.94),(-.15,.85))],.0016,M['line'],6,closed=True))
 out.append(cylinder('Porta_luvas_botao',face(gx,.928),toward,.011,.009,.012,M['chrome'],16,interno=True))
 out.append(pipe('Alca_painel',[face(gx-.14,.958,.004),face(gx-.12,.962,.03),face(gx+.12,.962,.03),face(gx+.14,.958,.004)],.009,M['chrome'],10,smooth=True,step=.02))
 # Race kit: the tachometer in a cup on the pad over the driver's knee, its face to the eye; a switch panel under
 # the face's middle (ignition, fuel pump, fan, lights, a red starter button).
 tx,ty=DRIVER-.04,-.475;tz=DASH_TOP+.034
 eye_dir=(EYE-Vector((tx,ty,tz+.05))).normalized()
 cup=Vector((tx,ty,tz+.048))
 out.append(cylinder('Contagiros_caixa',cup-eye_dir*.05,eye_dir,.043,.047,.06,M['steel'],32,interno=True,cap='back'))
 out.append(cylinder('Contagiros_aro',cup+eye_dir*.008,eye_dir,.048,.044,.006,M['chrome'],32,interno=True,cap=False))
 out.append(disc('Contagiros_mostrador',cup+eye_dir*.006,eye_dir,.04,M['tacho']))
 out.append(box('Contagiros_suporte',(tx,ty,tz+.004),(.03,.05,.02),M['steel'],.003,interno=True))
 out.append(cylinder('Luz_troca',cup+Vector((-.035,0,.045))-eye_dir*.01,eye_dir,.011,.011,.03,M['steel'],16,interno=True))
 out.append(disc('Luz_troca_lente',cup+Vector((-.035,0,.045))+eye_dir*.021,eye_dir,.0095,material('Luz_troca',(.9,.45,.02),rough=.2,Emission_Color=(1,.4,0),Emission_Strength=0.),16))
 plate=Vector((.06,DASH_Y+.03,DASH_LOW-.04));tilt=Vector((0,1,.55)).normalized()
 out.append(box('Painel_chaves',plate,(.20,.075,.004),M['alu'],.002,z_axis=tilt,up=Vector((0,0,1)),interno=True))
 for k in range(4):
  at=plate+Vector((.07-k*.035,0,0))+tilt*.004
  out.append(cylinder(f'Chave_base_{k}',at,tilt,.006,.006,.006,M['chrome'],12,interno=True))
  out.append(cylinder(f'Chave_alavanca_{k}',at+tilt*.004,(tilt+Vector((0,0,.5))).normalized(),.0022,.0016,.018,M['chrome'],8,interno=True))
 out.append(cylinder('Botao_partida',plate+Vector((-.075,0,0))+tilt*.004,tilt,.011,.01,.012,M['red'],16,interno=True))
 out.append(box('Painel_chaves_suporte',plate+Vector((0,-.02,.03)),(.18,.004,.06),M['alu'],.002,interno=True))
 # The column: a black collar where it comes through the face, the shaft under the dash to the front wall.
 a,b=COLUMN;axis=(b-a).normalized()
 at_face=a+axis*((DASH_Y-a.y)/axis.y)
 out.append(cylinder('Coluna_colar',a+axis*.004,axis,.042,.05,(at_face-a).length+.004,M['steel'],24))
 end=a+axis*((FIREWALL_Y+.01-a.y)/axis.y)
 out.append(cylinder('Coluna_eixo',at_face,axis,.02,.02,(end-at_face).length,M['steel'],16,interno=True))
 # The pedals' box: side plates and a top from the axle up to the dash's underside, the axle across.
 lo,hi=min(PEDALS)-.05,max(PEDALS)+.05
 z0=AXLE.z-.035
 for k,x in enumerate((lo,hi)):out.append(box(f'Pedaleira_lado_{k}',(x,AXLE.y-.025,(z0+DASH_LOW)/2),(.006,.11,DASH_LOW-z0),M['alu'],.002,interno=True))
 out.append(box('Pedaleira_topo',((lo+hi)/2,AXLE.y-.025,DASH_LOW-.006),(hi-lo+.006,.11,.006),M['alu'],.002,interno=True))
 out.append(cylinder('Pedaleira_eixo',Vector((lo,AXLE.y,AXLE.z)),Vector((1,0,0)),.009,.009,hi-lo,M['steel'],12,interno=True))
 out.append(cylinder('Cilindro_freio',Vector((PEDALS[1],AXLE.y-.06,AXLE.z+.03)),Vector((0,-1,0)),.022,.022,.09,M['alu'],16,interno=True))
 return out

def card(cab,name,s,y0,y1,z0,z1,M,front=.013,back=.004,ny=26,nz=14,interno=False):
 """A trim panel on the side wall s: from the inner skin plus back to plus front, its edges rounded in."""
 V,F=[],[];ys=np.linspace(y0,y1,ny);zs=np.linspace(z0,z1,nz)
 def at(y,z,d):
  p,n=cab.wall(float(y),float(z),s,d);return p
 for depth in (back,front):
  for z in zs:
   for y in ys:
    edge=min(y-y0,y1-y,z-z0,z1-z)/.012;d=back+(depth-back)*min(1,max(.35,edge)) if depth==front else depth
    V.append(at(y,z,d))
 g=lambda layer,i,j:layer*ny*nz+i*ny+j
 for i in range(nz-1):
  for j in range(ny-1):
   F.append((g(1,i,j),g(1,i,j+1),g(1,i+1,j+1),g(1,i+1,j)));F.append((g(0,i,j),g(0,i+1,j),g(0,i+1,j+1),g(0,i,j+1)))
 ring=[(0,j) for j in range(ny)]+[(i,ny-1) for i in range(1,nz)]+[(nz-1,j) for j in range(ny-2,-1,-1)]+[(i,0) for i in range(nz-2,0,-1)]
 for k in range(len(ring)):
  (i,j),(i2,j2)=ring[k],ring[(k+1)%len(ring)];F.append((g(0,i,j),g(0,i2,j2),g(1,i2,j2),g(1,i,j)))
 return obj(name,V,F,M['vinyl'],True,50,interno)

def doors(cab,M):
 """Door cards: black vinyl from the sill to the window, a chrome strip on top, a map pocket, the pull, the
 window crank, the inner handle and the lock knob; behind the doors, the rear side panels."""
 out=[]
 FRONT,BACK=-.586,.347 # criar_fusca_v2 PORTA_Y_FRENTE/TRAS
 for s in (1,-1):
  side='E' if s>0 else 'D'
  out.append(card(cab,'Forro_porta_'+side,s,FRONT+.03,BACK-.025,.37,.985,M))
  w=lambda y,z,d:cab.wall(y,z,s,d)
  out.append(pipe('Forro_porta_friso_'+side,[w(float(y),.982,.014)[0] for y in np.linspace(FRONT+.04,BACK-.035,12)],.0045,M['chrome'],8))
  out.append(card(cab,'Bolsa_porta_'+side,s,-.46,.18,.40,.55,M,front=.03,back=.014,ny=14,nz=6,interno=True))
  out.append(pipe('Bolsa_porta_friso_'+side,[w(float(y),.55,.031)[0] for y in np.linspace(-.455,.175,10)],.003,M['chrome'],6,interno=True))
  # Pull: a padded black bar forward of the elbow.
  a,n=w(-.40,.80,.02);b,_=w(-.18,.80,.02)
  out.append(pipe('Puxador_porta_'+side,[a,a+n*.035+(b-a)*.12,b+n*.035-(b-a)*.12,b],.014,M['vinyl'],10,smooth=True,step=.02,interno=True))
  # Window crank (low, clear of the driver's elbow): hub, arm and knob.
  hub,n=w(.14,.62,.013)
  out.append(cylinder('Manivela_cubo_'+side,hub,n,.018,.014,.02,M['chrome'],16,interno=True))
  knob=hub+n*.022+Vector((0,.065,-.03))
  out.append(pipe('Manivela_braco_'+side,[hub+n*.018,knob],.0055,M['chrome'],8,interno=True))
  out.append(cylinder('Manivela_pegador_'+side,knob,n,.011,.009,.035,M['wheel'],12,interno=True))
  # Inner handle (a chrome lever toward the front, just behind the dash's end: the door swings open past it,
  # fusca_aberturas.py) and the lock knob on the sill under the window.
  h,n=w(-.37,.875,.016)
  out.append(box('Macaneta_interna_'+side,h+n*.008,(.085,.012,.018),M['chrome'],.004,z_axis=n,up=Vector((0,0,1)),interno=True))
  out.append(box('Macaneta_interna_base_'+side,h,(.05,.004,.03),M['chrome'],.002,z_axis=n,up=Vector((0,0,1)),interno=True))
  k,_=w(.28,1.0,.03)
  out.append(cylinder('Pino_trava_'+side,k-Vector((0,0,.01)),Vector((0,0,1)),.0045,.004,.03,M['chrome'],8,interno=True))
  out.append(card(cab,'Forro_lateral_'+side,s,BACK+.03,REAR_WALL-.015,.37,.98,M))
 return out

def floor(cab,M):
 """The floor pan, the tunnel down the middle, the footwell's front wall, rubber mats, the shifter tower, the
 handbrake, the rear seat's base (seat taken out) with the battery, and the extinguisher on the passenger's side."""
 out=[]
 half=lambda y:cab.half(y,FLOOR-.02,.008)
 V,F=[],[];ys=np.linspace(FIREWALL_Y,1.0,24)
 for y in ys:V+=[(-half(y),y,FLOOR),(half(y),y,FLOOR),(half(y),y,FLOOR-.02),(-half(y),y,FLOOR-.02)]
 for i in range(len(ys)-1):
  for k in range(4):F.append((i*4+k,i*4+(k+1)%4,(i+1)*4+(k+1)%4,(i+1)*4+k))
 F+=[(0,1,2,3)[::-1],tuple(range(len(V)-4,len(V)))]
 out.append(obj('Assoalho_cabine',V,F,M['painted'],True,40))
 # The tunnel (the Fusca's backbone): a rounded hump 20 cm wide.
 hump=[(-.10,0),(-.095,.03),(-.08,.065),(-.05,.083),(0,.088),(.05,.083),(.08,.065),(.095,.03),(.10,0)]
 out.append(sweep('Tunel',[(0,FIREWALL_Y,FLOOR-.005),(0,1.0,FLOOR-.005)],[(u,v) for u,v in hump],M['painted'],side=Vector((1,0,0))))
 # The front wall of the footwells, under the dash.
 out.append(loft('Parede_pedais',[(FIREWALL_Y,FLOOR-.01),(FIREWALL_Y,DASH_LOW+.01),(FIREWALL_Y-.02,DASH_LOW+.01),(FIREWALL_Y-.02,FLOOR-.01)],[M['painted']],cab,lambda k:0,inset=.006,stations=9))
 # Rubber mats with ribs.
 y0,y1=FIREWALL_Y+.02,-.10;edge=min(cab.half(float(y),FLOOR+.01,.012) for y in np.linspace(y0,y1,12))
 for s,x0,x1,name in ((1,.11,edge,'motorista'),(-1,-edge,-.11,'carona')):
  out.append(box('Tapete_'+name,((x0+x1)/2,(y0+y1)/2,FLOOR+.004),(x1-x0,y1-y0,.008),M['rubber'],.003))
  for k in range(12):
   y=y0+.03+k*(y1-y0-.06)/11
   out.append(box(f'Tapete_{name}_friso_{k}',((x0+x1)/2,y,FLOOR+.009),(x1-x0-.04,.008,.004),M['rubber'],0,interno=True))
 # Shifter tower: an aluminium box from the floor up under the H lever's base plate.
 top=SHIFTER.z-.004
 out.append(box('Torre_cambio',(SHIFTER.x,SHIFTER.y,(FLOOR+top)/2),(.13,.15,top-FLOOR),M['alu'],.004,interno=True))
 out.append(box('Torre_cambio_tampa',(SHIFTER.x,SHIFTER.y,top-.002),(.14,.16,.004),M['steel'],.002,interno=True))
 # The handbrake lying back on the tunnel between the seats.
 pivot=Vector((0,.02,FLOOR+.09))
 out.append(box('Freio_mao_base',pivot,(.05,.08,.03),M['steel'],.004,interno=True))
 grip=pivot+Vector((0,.24,.06))
 out.append(pipe('Freio_mao_alavanca',[pivot,pivot+Vector((0,.12,.035)),grip],.011,M['steel'],10,interno=True))
 out.append(cylinder('Freio_mao_pegador',pivot+Vector((0,.12,.035)),(grip-pivot).normalized(),.016,.015,.13,M['wheel'],12,interno=True))
 out.append(cylinder('Freio_mao_botao',grip,(grip-pivot).normalized(),.007,.006,.012,M['chrome'],10,interno=True))
 # The rear seat's base and back wall (the seat is out) and the parcel shelf behind, carpeted black as a Fusca's;
 # the battery in a box on the base. The back wall stands just ahead of the rear wheels (REAR_WALL) and the shelf
 # over them, wall to wall: under it the wheels turn in their housings (from the arches the tyres show against the
 # housings' dark liners, criar_fusca_v2.caixa_de_roda).
 out.append(loft('Base_banco_tras',[(.60,FLOOR),(.60,.47),(REAR_WALL-.015,.47),(REAR_WALL-.015,.80),(1.30,.80),(1.30,SHELF),(REAR_WALL,SHELF),(REAR_WALL,FLOOR)],
  [M['vinyl']],cab,lambda k:0,inset=.006,stations=13))
 out.append(box('Bateria_caixa',(-.25,.80,.47+.09),(.26,.17,.18),M['shell'],.008,interno=True))
 out.append(box('Bateria_tampa',(-.25,.80,.47+.183),(.27,.18,.012),M['vinyl'],.004,interno=True))
 for k,c in enumerate((M['red'],M['wheel'])):out.append(cylinder(f'Bateria_polo_{k}',Vector((-.33+k*.16,.80,.47+.19)),Vector((0,0,1)),.012,.01,.02,c,12,interno=True))
 # The extinguisher on its brackets where the passenger seat was.
 e=Vector((-.30,-.02,FLOOR+.075))
 out.append(cylinder('Extintor',e+Vector((0,-.17,0)),Vector((0,1,0)),.06,.06,.34,M['red'],24,interno=True))
 out.append(cylinder('Extintor_valvula',e+Vector((0,-.20,0)),Vector((0,1,0)),.022,.03,.035,M['chrome'],16,interno=True))
 for k,y in enumerate((-.10,.08)):out.append(box(f'Extintor_cinta_{k}',e+Vector((0,y,0)),(.14,.025,.13),M['alu'],.003,interno=True))
 return out

# The seat: a bucket swept along its centre line, cushion front to headrest; the driver's pelvis sits at
# opala(-.18,.48,-.34) (driver.js), his back and helmet in front of y .31.
SEAT_PATH=[(-.10,.425),(-.03,.40),(.08,.388),(.20,.388),(.28,.40),(.325,.45),(.338,.56),(.35,.72),(.365,.88),(.38,1.04),(.392,1.18),(.40,1.32),(.402,1.37)]
def seat(cab,M):
 out=[];x=DRIVER
 path=[Vector((x,y,z)) for y,z in SEAT_PATH];path=spline(path,.025)
 # Along the path: the shell's inner half width and its sides' height (the bolsters, the shoulders, the wings).
 L=np.cumsum([0]+[(path[i+1]-path[i]).length for i in range(len(path)-1)]);L/=L[-1]
 width=lambda t:float(np.interp(t,[0,.3,.45,.75,.85,1],[.205,.215,.22,.215,.165,.165]))
 height=lambda t:float(np.interp(t,[0,.12,.3,.42,.6,.75,.82,.9,1],[.03,.07,.09,.12,.11,.06,.05,.09,.07]))
 V,F=[],[];K=18;T=.012
 def section(w,h):
  """U section (u across, v toward the occupant): the shell's outer face from lip to lip, then its inner face back."""
  r=min(.04,h*.8);mid=[(-w,h)]+[(-w+r-r*math.cos(a),r-r*math.sin(a)) for a in np.linspace(0,math.pi/2,4)]+[(0,0)]
  mid+=[(-u,v) for u,v in reversed(mid[:-1])]
  P=np.array(mid);T2=np.gradient(P,axis=0);T2/=np.linalg.norm(T2,axis=1)[:,None];N=np.stack([-T2[:,1],T2[:,0]],1)
  return [tuple(p) for p in P-N*T/2]+[tuple(p) for p in (P+N*T/2)[::-1]]
 sec0=section(.2,.05);m=len(sec0);half=m//2
 for i,p in enumerate(path):
  t=(path[min(i+1,len(path)-1)]-path[max(i-1,0)]).normalized();nv=t.cross(Vector((1,0,0))).normalized()
  for u,v in section(width(L[i]),height(L[i])):V.append(p+Vector((u,0,0))-nv*v)
 n=len(path)
 for i in range(n-1):
  for k in range(m):F.append((i*m+k,i*m+(k+1)%m,(i+1)*m+(k+1)%m,(i+1)*m+k))
 F+=[tuple(range(m)),tuple(range((n-1)*m,n*m))[::-1]]
 shell=obj('Banco_concha',V,F,[M['shell'],M['fabric']],True,50)
 for poly in shell.data.polygons[:(n-1)*m]:poly.material_index=1 if half<=poly.index%m<m-1 else 0
 out.append(shell)
 # Cushions: a padded insert on the base and up the back.
 pad=[(u,v) for u,v in ((-.17,.0),(-.175,.012),(-.165,.03),(-.12,.036),(0,.038),(.12,.036),(.165,.03),(.175,.012),(.17,0))]
 base_path=[q for q,t in zip(path,L) if .02<t<.32];back_path=[q for q,t in zip(path,L) if .42<t<.78]
 for name,pp in (('Banco_almofada',base_path),('Banco_encosto',back_path)):
  if len(pp)>2:out.append(sweep(name,[q+Vector((0,0,0))-((pp[min(i+1,len(pp)-1)]-pp[max(i-1,0)]).normalized().cross(Vector((1,0,0))).normalized())*T/2 for i,q in enumerate(pp)],pad,M['fabric']))
 # Harness slots and the straps back to the bar on the main hoop; lap belts down to the floor.
 slot=lambda u:path[int(np.searchsorted(L,.7))]+Vector((u,.0,0))
 for k,u in enumerate((-.07,.07)):
  a=slot(u)+Vector((0,.02,0))
  out.append(box(f'Banco_fenda_{k}',a-Vector((0,.012,0)),(.055,.006,.012),M['line'],0,interno=True))
  out.append(strip(f'Cinto_ombro_{k}',a,Vector((x+u*1.2,MAIN_Y-.03,HARNESS_Z+.01)),.05,.003,M['belt'],Vector((0,0,1)),interno=True))
 for k,u in enumerate((-.225,.225)):
  out.append(strip(f'Cinto_abdominal_{k}',Vector((x+u,.24,.47)),Vector((x+u*1.05,.30,FLOOR+.01)),.045,.003,M['belt'],Vector((u,0,0)),interno=True))
 # Mounting: aluminium side brackets and rails to the floor.
 for k,u in enumerate((-.19,.19)):
  out.append(box(f'Banco_trilho_{k}',(x+u,.12,FLOOR+.012),(.03,.46,.024),M['alu'],.003,interno=True))
  out.append(box(f'Banco_suporte_{k}',(x+u*1.12,.16,FLOOR+.05),(.006,.30,.075),M['alu'],.002,interno=True))
 return out

# The cage: the main hoop at MAIN_Y behind the seat, the harness bar across it at HARNESS_Z.
MAIN_Y,HARNESS_Z,CAGE_R=.50,1.0,.019
def cage(cab,M):
 out=[];margin=SKIN+CAGE_R+.022
 # Main hoop: round the inside of the body at MAIN_Y, feet on the floor.
 c=Vector((0,MAIN_Y,.85));hoop=[]
 for a in np.linspace(math.radians(-62),math.radians(242),61):
  d=Vector((math.cos(a),0,math.sin(a)));hit,*_=cab.bvh.ray_cast(c,d,3.)
  if hit is None:continue
  p=c+d*((hit-c).length-margin)
  if p.z>FLOOR+.05:hoop.append(p)
 foot=cab.half(MAIN_Y,FLOOR+.03,margin-SKIN)
 hoop=[Vector((foot,MAIN_Y,FLOOR+.005))]+hoop+[Vector((-foot,MAIN_Y,FLOOR+.005))]
 out.append(pipe('Gaiola_arco_principal',hoop,CAGE_R,M['cage'],14,smooth=True,step=.04))
 near=lambda pts,**k:min(pts,key=lambda p:sum((getattr(p,a)-v)**2 for a,v in k.items()))
 corner={s:near(hoop,x=BARS[s][-1].x,z=BARS[s][-1].z) for s in (1,-1)}
 for s in (1,-1):
  side='E' if s>0 else 'D'
  # A-pillar bar (pillar_bars): from the front of the footwell up the pillar, over the door along the roof to the hoop.
  pts=spline(BARS[s],.04)
  pts.append(corner[s]);out.append(pipe('Gaiola_coluna_A_'+side,pts,CAGE_R,M['cage'],14,smooth=True,step=.04))
  if s>0:
   # Foam on the driver's side over his helmet.
   foam=[p for p in pts if -.12<p.y<.35]
   out.append(pipe('Gaiola_espuma',foam,CAGE_R+.014,M['vinyl'],12,smooth=True,step=.04,interno=True))
  # Low door bar, under the driver's elbow.
  a=near(pts,z=.56);b=near(hoop[:len(hoop)//2] if s>0 else hoop[len(hoop)//2:],z=.56)
  mid=cab.inside((a+b)/2+Vector((s*.05,0,.03)),margin)
  out.append(pipe('Gaiola_porta_'+side,[a,mid,b],CAGE_R,M['cage'],12,smooth=True,step=.05))
  # Rear stay from the hoop's top corner down to the parcel shelf.
  end=cab.inside(Vector((s*.50,.97,.81)),margin)
  out.append(pipe('Gaiola_escora_'+side,[corner[s],cab.inside(Vector((s*.46,.75,1.18)),margin),end],CAGE_R,M['cage'],12,smooth=True,step=.05))
  out.append(box('Gaiola_sapata_'+side,(pts[0].x,pts[0].y,FLOOR+.003),(.07,.07,.006),M['cage'],.002,interno=True))
 # Header bar across under the roof behind the windscreen's top, from one A-pillar bar to the other (it carries the
 # rear-view mirror), the diagonal and the harness bar.
 ends=[along(BARS[s],HEADER_Y) for s in (-1,1)];inset=SKIN+CAGE_R+.004
 header=[ends[0]]+[on_skin(cab,cab.sup.topo(float(x),HEADER_Y)[0],inset) for x in np.linspace(ends[0].x,ends[1].x,11)[1:-1] if abs(x)<ends[1].x-.06]+[ends[1]]
 global HEADER
 HEADER=header[len(header)//2]
 out.append(pipe('Gaiola_travessa_parabrisa',header,CAGE_R,M['cage'],12,smooth=True,step=.05))
 lo=near(hoop[len(hoop)//2:],z=.42)
 out.append(pipe('Gaiola_diagonal',[corner[1],lo],CAGE_R,M['cage'],12))
 l=near(hoop[:len(hoop)//2],z=HARNESS_Z);r=near(hoop[len(hoop)//2:],z=HARNESS_Z)
 out.append(pipe('Gaiola_cinto',[l,r],CAGE_R*.9,M['cage'],12))
 return out

HEADER=None
def mirror_inside(cab,M):
 """The rear-view mirror on a stalk from the header bar: a black housing and its glass toward the eye."""
 out=[];top=HEADER or Vector((0,-.36,1.34))
 c=Vector((0,top.y+.03,top.z-.045));look=(EYE-c).normalized();n=(look+Vector((0,1,0))).normalized()
 out.append(pipe('Retrovisor_interno_haste',[top,top+Vector((0,.012,-.02)),c+n*-.015],.006,M['steel'],8))
 out.append(box('Retrovisor_interno',c,(.32,.07,.026),M['wheel'],.01,z_axis=n,up=Vector((0,0,1))))
 # The glass shows the rear camera's picture (fusca-cockpit.js) mirrored: its left, the picture's right. The glTF
 # export turns v over (v = 1 - v), and a render target's picture has its bottom at v = 0: v runs down here.
 g=V2.caixa('Retrovisor_interno_vidro',(0,0,0),(.30,.05,.002),M['mirror']);place(g,c+n*.0135,n,Vector((0,0,1)));g['interno']=True
 bpy.context.view_layer.update();R=g.matrix_world.to_3x3();disc_uv(g,c+n*.0135,R@Vector((1,0,0)),R@Vector((0,1,0)),-.30,-.05)
 out.append(g)
 return out

def classic_wheel(M):
 """The Fusca's own two-spoke wheel at the race wheel's place (the car screen shows it; a driven car hides it)."""
 axis=Vector((0,-math.cos(WHEEL_TILT),-math.sin(WHEEL_TILT)));up=Vector((0,-math.sin(WHEEL_TILT),math.cos(WHEEL_TILT)));right=Vector((-1,0,0))
 c=WHEEL+axis*.01;r=.19
 rim=[c+(right*math.cos(a)+up*math.sin(a))*r for a in np.linspace(0,2*math.pi,48,endpoint=False)]
 parts=[pipe('Volante',rim,.012,M['wheel'],10,closed=True)]
 for k,s in enumerate((1,-1)):
  parts.append(pipe(f'Volante_raio_{k}',[c+right*s*.03-up*.02,c+right*s*.11-up*.045,c+right*s*.185-up*.03],.0085,M['wheel'],8,smooth=True,step=.02))
 parts.append(cylinder('Volante_cubo',c-axis*.005,axis,.045,.035,.04,M['wheel'],24))
 parts.append(cylinder('Volante_buzina',c-axis*.012,axis,.03,.03,.008,M['chrome'],24))
 return parts
