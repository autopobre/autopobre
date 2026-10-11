"""V06 finishing details seen with everything closed: satin hood and lid undersides, the hood's sharp centre crease and
two side creases, deeper-red faceted tail lamps, the tail's 99 at its photo size, square headlamp surrounds, black
window nets and neutral smoke polycarbonate, the stripe re-laid over the front fenders, the stickers' baked stripe and
pin cut-outs removed, the wipers parked at the foot of the windscreen, and (OMP livery) the four auxiliary lamps."""
import bpy,bmesh,math
import numpy as np
from mathutils import Vector,Matrix
from v06_comum import *

def undersides(mats):
 """The hood and lid skins are two-sided shells: the faces looking down get the satin interior black, so the open
 hood no longer mirrors the bay (the painted top keeps Pintura_preta, material slot 0)."""
 for n in ('Capo_painel','Tampa_porta_malas_painel'):
  o=bpy.data.objects[n];me=o.data;me.materials.append(mats['interna_fosca'])
  N=np.zeros(len(me.polygons)*3);me.polygons.foreach_get('normal',N);N=N.reshape(-1,3)@np.array(o.matrix_world)[:3,:3].T
  idx=np.zeros(len(me.polygons),np.int32);me.polygons.foreach_get('material_index',idx)
  idx[N[:,2]<-.3]=len(me.materials)-1;me.polygons.foreach_set('material_index',idx);me.update()

# carro_23: a raised centre line from the cowl to the hood's front edge that bends the OMP letters, and a softer crease
# along each side over the grille's ends. Tent profiles (y, half width, height, top radius): the top of each ridge is
# rounded over +-2 cm and its foot blends into the skin, so the reflection bends across the crease in a gradient
# instead of splitting on a hard line. Extra cut lines along each ridge carry the rounded top.
CREASES=((0.,.080,.007,.020),(-.44,.055,.0040,.014),(.44,.055,.0040,.014))
s5=lambda t:(lambda c:c*c*c*(c*(6*c-15)+10))(np.clip(t,0,1))
def crease_lift(y):
 out=np.zeros_like(y)
 for c,w,h,r in CREASES:
  d=np.abs(y-c)/w;rho=r/w;q=lambda t:np.sqrt(t*t+rho*rho)-rho
  out+=h*np.clip(1-q(d)/q(1.),0,1)*s5((1-d)/.35)
 return out
def hood_creases():
 for n,upper in (('Capo_painel',True),('Decal_capo',False)):
  o=bpy.data.objects[n];me=o.data;bm=bmesh.new();bm.from_mesh(me)
  for c,w,h,r in CREASES:
   for dy in (0.,-r*.5,r*.5,-r,r,-2*r,2*r):   # UVs are interpolated on the cuts
    bmesh.ops.bisect_plane(bm,geom=bm.verts[:]+bm.edges[:]+bm.faces[:],plane_co=(0,c+dy,0),plane_no=(0,1,0))
  bm.to_mesh(me);bm.free();me.update()
  W=world_verts(o)
  if upper:                                      # only the top layer of the shell moves (normals up)
   up=np.zeros(len(W),bool)
   for p in me.polygons:
    if (o.matrix_world.to_3x3()@p.normal).z>.3:up[list(p.vertices)]=True
  else:up=np.ones(len(W),bool)
  fade=s5((W[:,0]-1.02)/.06)*s5((2.165-W[:,0])/.05)    # dies out at the rear and front edges
  W[up,2]+=crease_lift(W[up,1])*fade[up];set_world_verts(o,W)
  near=up&(fade>0)&np.any([np.abs(W[:,1]-c)<w for c,w,_,_ in CREASES],axis=0)
  for e in me.edges:                             # the ridges shade smoothly (round 3 marked them sharp)
   if near[e.vertices[0]] and near[e.vertices[1]]:e.use_edge_sharp=False
  me.update()

def tail_lamps():
 """carro_6: deep red lenses sitting back in their chrome bezels (V05's stood 14 mm proud and read as pink buttons):
 lens and core go 10 mm in, a darker red with little specular, flat-shaded so the lens facets catch the light."""
 m=bpy.data.materials['Lanterna_vermelha'];p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 col=tuple(srgb(c/255) for c in (112,5,4));p.inputs['Base Color'].default_value=(*col,1);m.diffuse_color=(*col,1)
 p.inputs['Roughness'].default_value=.4;p.inputs['Coat Weight'].default_value=0.;p.inputs['Specular IOR Level'].default_value=.12
 p.inputs['Emission Color'].default_value=(*col,1);p.inputs['Emission Strength'].default_value=.15
 for o in bpy.data.objects:
  if o.type=='MESH' and o.name.startswith(('Lanterna_redonda','Miolo_lanterna')):
   W=world_verts(o);W[:,0]+=.010;set_world_verts(o,W)
   if o.name.startswith('Lanterna_redonda'):finish(o.data,None)

def tail_number():
 """The 99 on the tail (carro_6): the same heavy slanted numerals as the quarter panels, about 1.25 lamp diameters
 tall (V05's thin one was about 0.7), in place of V05's text mesh, on the flat part of the panel."""
 O=bpy.data.objects;old=O['Numero_traseiro'];W=world_verts(old);c=(W.min(0)+W.max(0))/2
 mat=old.data.materials[0];coll=old.users_collection[0].name;parent=old.parent
 lamp=world_verts(O['Lanterna_redonda']);h=1.25*(lamp[:,2].max()-lamp[:,2].min())
 cu=bpy.data.curves.new('TMP_99','FONT');cu.body='99';cu.font=bpy.data.fonts.load('C:/Windows/Fonts/FRAHV.TTF',check_existing=True)
 cu.shear=.22;cu.align_x='CENTER';cu.align_y='CENTER';tmp=bpy.data.objects.new('TMP_99',cu);bpy.context.scene.collection.objects.link(tmp)
 dg=bpy.context.evaluated_depsgraph_get();me=bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
 bpy.data.objects.remove(tmp,do_unlink=True);bpy.data.curves.remove(cu)
 V=np.array([v.co[:] for v in me.vertices]);lo,hi=V.min(0),V.max(0);k=h/(hi[1]-lo[1]);ctr=(lo+hi)/2
 x=float(W[:,0].min())-.002                        # 2 mm off the panel, like V05's
 N=np.c_[np.full(len(V),x),c[1]-(V[:,0]-ctr[0])*k,c[2]+(V[:,1]-ctr[1])*k]  # text x -> car -y (read from behind), text y -> up
 F=[tuple(p.vertices) for p in me.polygons];bpy.data.meshes.remove(me);remove(old)
 o=new_mesh('Numero_traseiro',N,F,mat,coll,outward=(-1,0,0));o.parent=parent or o.parent
 return h/(W[:,2].max()-W[:,2].min())

def headlamps(mats):
 """carro_23: round sealed-beam headlamps with clear glass lenses over a chrome reflector and bulb, each set in a
 square black surround shaped like a bucket that follows the nose: its front follows the housings' sweep back toward
 the fender, its top rises to the nose panel's lower edge and turns back under it (the lifted nose left a gap over
 the housings), and its sides turn back to the body, so no corner stands proud of the fender (round 3's flat plate
 floated in front of it)."""
 O=bpy.data.objects
 m=O['Farol_circular'].data.materials[0];p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 # (a faint frost stands in for the sealed beam's fluted glass, which scatters the reflector's light: pale in carro_23)
 col=(.90,.94,.97);p.inputs['Base Color'].default_value=(*col,1);m.diffuse_color=(*col,1)
 p.inputs['Metallic'].default_value=0.;p.inputs['Roughness'].default_value=.10;p.inputs['IOR'].default_value=1.5
 p.inputs['Transmission Weight'].default_value=1.;p.inputs['Coat Weight'].default_value=0.
 Tn=bvh([O[n] for n in ('Painel_frontal_superior','Paralamas_topo','Painel_frontal_faixa') if n in O])
 S=Part('Moldura_farol','04_Farois_Lanternas_Detalhes',None,smooth=30);R=Part('Refletor_farol','04_Farois_Lanternas_Detalhes',None,smooth=30)
 blk=mats['pintura'];refl=material('Refletor_farol',(236,238,240),metal=1.,rough=.16)   # aluminised, slightly dull
 for o in [o for o in O if o.type=='MESH' and o.name.startswith('Farol_circular')]:
  W=world_verts(o);c=(W.min(0)+W.max(0))/2;s=1 if c[1]>0 else -1;r=(W[:,2].max()-W[:,2].min())/2
  hous=min([h for h in O if h.type=='MESH' and h.name.startswith('Alojamento_farol')],key=lambda h:abs(world_verts(h)[:,1].mean()-c[1]))
  H=world_verts(hous)
  # housing front (it sweeps back about 1 cm toward the fender) and the round opening for the reflector
  fr=lambda ay:float(np.interp(ay,[abs(H[:,1]).min(),abs(H[:,1]).max()],[H[abs(H[:,1])<abs(H[:,1]).min()+.02,0].max(),H[abs(H[:,1])>abs(H[:,1]).max()-.02,0].max()]))
  cut=prism('CUT_farol',ellipse(c[1],c[2],r-.004,r-.004,40),'X',W[:,0].min()-.08,W[:,0].max()+.05)
  boolean(hous,cut,'DIFFERENCE');remove(cut)
  # chrome reflector from the lens rim back to its vertex, the bulb at the focus under a small shield
  x0=W[:,0].min()+.002
  R.lathe(refl,[(r-.005,0.),(r-.012,.010),(.062,.024),(.045,.036),(.028,.045),(.012,.050),(0.,.051)],(x0,c[1],c[2]),(-1,0,0),40)
  R.cyl(mats['aco'],(x0-.050,c[1],c[2]),(x0-.022,c[1],c[2]),.006,12)
  R.lathe(mats['cromado'],[(0.,-.012),(.009,-.009),(.011,0.),(.009,.009),(0.,.012)],(x0-.016,c[1],c[2]),(1,0,0),16)
  R.cyl(mats['aco'],(x0-.006,c[1],c[2]),(x0-.004,c[1],c[2]),.012,16)
  # surround: a flat face round the lens opening, and above the housing a strip that bends back to meet the nose
  # panel's lower edge, so its top and its outer top corner lie on the nose and fender corner instead of standing proud
  a0,a1=abs(c[1])-.103,abs(c[1])+.103;zb=c[2]-.104;zm=c[2]+r+.008
  def nose_front(ay,z):
   h=Tn.ray_cast(Vector((3,s*ay,z)),Vector((-1,0,0)));return h[0].x if h[0] is not None else 2.26
  top=lambda ay:(lambda h:h[0].z-.003 if h[0] is not None else c[2]+.12)(Tn.ray_cast(Vector((2.25,s*ay,c[2]+.07)),Vector((0,0,1))))
  xf=lambda ay:fr(ay)+.011
  A=np.linspace(a0,a1,11);Zt=[top(a) for a in A];Xt=[min(xf(a),nose_front(a,z-.004)+.002) for a,z in zip(A,Zt)]
  hole=[(abs(c[1])+(r+.002)*math.cos(t_),c[2]+(r+.002)*math.sin(t_)) for t_ in np.linspace(0,2*math.pi,40,endpoint=False)]
  pts,tris=polygon_fill([(a0,zb),(a1,zb),(a1,zm),(a0,zm)],[hole])
  S.mesh(blk,[(xf(a),s*a,z) for a,z in pts],[tuple(t_) for t_ in tris],outward=(1,0,0))
  rows=7;G=[[(xf(a)+(xt-xf(a))*(k/(rows-1))**1.6,s*a,zm+(zt-zm)*k/(rows-1)) for a,zt,xt in zip(A,Zt,Xt)] for k in range(rows)]
  S.mesh(blk,[p_ for row in G for p_ in row],grid_faces(rows,len(A)),outward=(1,0,.6))
  # the edges turned back toward the body: bottom, both sides (following the bent strip) and the top under the nose
  edge=[(xf(a0),a0,zb),(xf(a1),a1,zb)]+[(G[k][-1][0],a1,G[k][-1][2]) for k in range(rows)]+[(G[-1][i][0],A[i],G[-1][i][2]) for i in range(len(A)-1,-1,-1)]+[(G[k][0][0],a0,G[k][0][2]) for k in range(rows-1,-1,-1)]
  V=[];F=[]
  for (x1,a_1,z1),(x2,a_2,z2) in zip(edge,edge[1:]+edge[:1]):
   d1=.03 if z1>=zm+.001 and a0<a_1<a1 else .045;d2=.03 if z2>=zm+.001 and a0<a_2<a1 else .045
   k=len(V);V+=[(x1,s*a_1,z1),(x1-d1,s*a_1,z1),(x2,s*a_2,z2),(x2-d2,s*a_2,z2)];F.append((k,k+2,k+3,k+1))
  S.mesh(blk,V,F,outward=lambda q,cc=c:Vector((0,q.y-cc[1],q.z-cc[2])))
  m_=len(hole);S.mesh(blk,[(xf(a),s*a,z) for a,z in hole]+[(xf(a)-.012,s*a,z) for a,z in hole],[(k,(k+1)%m_,m_+(k+1)%m_,m_+k) for k in range(m_)],
   outward=lambda q,cc=c:Vector((0,cc[1]-q.y,cc[2]-q.z)))
 S.build();R.build()

def turn_signals():
 """Seta_ambar: a deeper amber (linear 0.90/0.22/0.0) with a rougher, slightly translucent lens, so faces in strong
 light stay amber instead of clipping to lemon."""
 m=bpy.data.materials.get('Seta_ambar')
 if m is None:return
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');c=(.90,.22,0.)
 p.inputs['Base Color'].default_value=(*c,1);m.diffuse_color=(*c,1);p.inputs['Roughness'].default_value=.35
 p.inputs['Transmission Weight'].default_value=.15
 if p.inputs['Emission Strength'].default_value>0:p.inputs['Emission Color'].default_value=(*c,1)

def nets():
 """Nets that read black under the studio lights (carro_7, carro_21), and the polycarbonate a neutral dark smoke
 (sRGB 45/48/52) instead of V05's teal. The name stays: the game only sets the glass's opacity."""
 m=bpy.data.materials['Rede_tecido_preto'];p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 p.inputs['Base Color'].default_value=(.008,.0082,.0088,1);m.diffuse_color=(.008,.0082,.0088,1)
 p.inputs['Roughness'].default_value=1.;p.inputs['Specular IOR Level'].default_value=.2
 m=bpy.data.materials['Policarbonato_fume'];p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 c=tuple(srgb(v/255) for v in (45,48,52));p.inputs['Base Color'].default_value=(*c,1);m.diffuse_color=(*c,1)

WIPER_REST_DEG=(5.5,2.5)          # the blade that sweeps over the other's pivot rests above it
def parked_wipers():
 """carro_14: at rest the wipers lie along the foot of the windscreen, under the driver's line of sight. V05's were
 one bent tube each (arm and blade at 21 and 33 degrees up the glass, sinking from 3 to 33 mm under its outer face),
 so from the cockpit they crossed the view inside the car. Each is rebuilt parked from its own pivot: a cap on the
 glass, a slim arm and the blade under it, along the foot of the glass and just off its outer face. The glass is
 crowned (v06_vidros): each point of a wiper sits over the glass's own surface, along its local normal, as a blade
 bends to the glass."""
 O=bpy.data.objects;G=world_verts(O['Para_brisa']);c=G.mean(0);Tg=bvh(O['Para_brisa'])
 n=np.linalg.svd(G-c,full_matrices=False)[2][2];n*=np.sign(n[2])      # mean glass normal, outward and up
 up=np.array((0,0,1.))-n[2]*n;up/=np.linalg.norm(up)                  # up the slope
 side=np.cross(up,n)                                                  # across the car
 def surface(q):
  """The glass's outer face under q (along the mean normal) and its normal there, outward."""
  h=Tg.ray_cast(Vector(q+n*.3),Vector(-n))
  nn=np.array(h[1]);nn*=np.sign(nn@n);return np.array(h[0]),nn
 wipers=[]
 for o in [o for o in O if o.type=='MESH' and o.name.startswith('Limpador_parabrisa')]:
  W=world_verts(o);p=W[np.argmin(W@up)];tip=W[np.argmax(np.linalg.norm(W-p,axis=1))]
  wipers.append((o.name,o.data.materials[0],o.users_collection[0].name,surface(p)[0],side*np.sign((tip-p)@side)))
 for rank,(name,mat,collection,p,e) in enumerate(sorted(wipers,key=lambda w:w[3]@w[4])):
  r=math.radians(WIPER_REST_DEG[min(rank,1)]);d=e*math.cos(r)+up*math.sin(r)
  def at(s,h,p=p,d=d):                                                 # s along the wiper, h off the glass
   q,nn=surface(p+d*s);return tuple(q+nn*h)
  P=Part(name,collection,None,smooth=40)
  P.cyl(mat,at(0,.001),at(0,.024),.013,16)                               # pivot cap
  P.sweep(mat,[at(0,.020),at(.04,.019),at(.25,.015),at(.43,.012)],.0045,10)   # arm
  P.sweep(mat,[at(.05,.0055),at(.44,.0055)],.0035,8)                   # blade
  for s in (.20,.33):P.cyl(mat,at(s,.006),at(s,.013),.003,6)           # blade holder
  P.build()
  print(f'V06 wiper {name}: parked {WIPER_REST_DEG[min(rank,1)]} degrees up the glass',flush=True)

def stripe_front():
 """The yellow stripe over the front fenders was a strip two vertices tall laid over the curved shoulder: the skin
 showed through it in black triangles near the hood's front corners. Ahead of x 1.40 it gets five more rows and every
 vertex sits 1.8 mm out from the skin, along the skin's normal."""
 O=bpy.data.objects
 for side,s in (('Motorista',1),('Passageiro',-1)):
  o=O['Faixa_'+side];me=o.data;T=bvh([O['Lateral_'+side],O['Paralamas_topo']])
  bm=bmesh.new();bm.from_mesh(me);M=o.matrix_world
  ed=[e for e in bm.edges if all((M@v.co).x>1.40 for v in e.verts) and abs((e.verts[0].co-e.verts[1].co).x)<.3*(e.verts[0].co-e.verts[1].co).length]
  bmesh.ops.subdivide_edges(bm,edges=ed,cuts=5,use_grid_fill=True)
  for v in bm.verts:
   p=M@v.co
   if p.x<=1.40:continue
   loc,n,_,_=T.find_nearest(p)
   if loc is None:continue
   if n.dot(Vector((0,s,.4)))<0:n=-n
   v.co=M.inverted()@(loc+n*.0018)
  bm.to_mesh(me);bm.free();me.update()

def ragged_hood_stickers():
 """The Seiva hood livery carried photo cut-outs of V05's front hood pins (ragged edges) at its front corners; the
 real latches are now modelled, so those two patches go (the crease lines beside them stay)."""
 im=next(n.image for n in bpy.data.objects['Decal_capo'].data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
 if 'seiva_danilo_capo' not in im.name:return
 w,h=im.size;A=np.array(im.pixels[:],np.float32).reshape(h,w,4);u=(np.arange(w)+.5)/w;v=(np.arange(h)+.5)/h
 kill=(v[:,None]>.90)&((u[None,:]<.102)|(u[None,:]>.90));A[kill,3]=0.
 im.pixels[:]=A.ravel();im.pack()

def sticker_stripe_bands():
 """The MAN-PEC and DINIZ PNEUS stickers (V05 photo crops) carried a strip of the yellow stripe above the letters,
 with ragged dark slivers where it met the real stripe: that strip is made transparent (their white letters stay)."""
 for n in ('Decal_motorista_manpec','Decal_passageiro_diniz'):
  o=bpy.data.objects.get(n)
  if o is None:continue
  im=next(x.image for x in o.data.materials[0].node_tree.nodes if x.type=='TEX_IMAGE');w,h=im.size
  A=np.array(im.pixels[:],np.float32).reshape(h,w,4);R,G,B=A[...,0],A[...,1],A[...,2]
  yellow=(R>.25)&(G>.45*R)&(B<.6*np.minimum(R,G))
  A[yellow,3]=0.;im.pixels[:]=A.ravel();im.pack()

def aux_lamps(mats):
 """OMP livery only (carro_23 in the pits, carro_15 at night): four round auxiliary lamps, 0.11 m, standing on
 brackets from the bumper in front of the headlamps' lower edge and the grille's outer corners, white LED lenses.
 They hang from the front skirt's damage pivot with the bumper."""
 if 'assinaturas_omp' not in bpy.path.basename(bpy.data.filepath):return
 O=bpy.data.objects;lens=material('Lente_auxiliar_LED',(226,230,234),rough=.22,coat=.6)
 P=Part('Farol_auxiliar','04_Farois_Lanternas_Detalhes',O['Saia_dianteira_PIVO'],smooth=30)
 for s in (-1,1):
  for y in (.500,.640):
   c=(2.350,s*y,.575)
   P.box(mats['aco_escuro'],(2.322,s*y,.515),(.028,.024,.05),.003)                              # bracket from the bumper
   P.lathe(mats['pintura'],[(.0,-.045),(.038,-.043),(.052,-.030),(.055,.0)],c,(1,0,0),24)       # body
   P.lathe(mats['cromado'],[(.055,.0),(.057,.004),(.055,.010),(.048,.012)],c,(1,0,0),24)       # bezel
   P.lathe(lens,[(.048,.006),(.032,.011),(.0,.012)],c,(1,0,0),24)                               # lens
 P.build()

def build(mats):
 undersides(mats);hood_creases();tail_lamps();k=tail_number();headlamps(mats);nets();parked_wipers();stripe_front();ragged_hood_stickers();sticker_stripe_bands();aux_lamps(mats);turn_signals()
 print(f'V06 details: rear 99 x{k:.2f}',flush=True)
