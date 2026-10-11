"""V06 body: doors cut out of the side panels, hood split from the fixed "eletric" header panel, trunk lid, jambs,
gaps, hinges, pins and latches. Every moving part hangs from an empty on its real hinge axis, carrying the custom
properties peca / eixo_local / angulo_aberto_graus / descricao (the game's future API)."""
import bpy,bmesh,math
import numpy as np
from mathutils import Vector,Matrix
from v06_comum import *

GAP=.004;G=GAP/2                     # panel gap (4 mm), half on each side of the old painted seam
SIDES=(('Motorista',1),('Passageiro',-1))
# Door: bottom edge just above the rocker trim (Soleira top .198); sill box the door closes over.
DOOR_BOTTOM,SILL_TOP,SILL_OUT,SILL_IN,DOOR_STEP=.203,.296,.785,.695,.310   # sill inner edge = game's sill line
DOOR_DEPTH,DOOR_ANGLE=.118,67.      # skin to inner panel; opening about the (vertical) hinge axis
# Hinge axis (vertical) on the A pillar, in the cavity under the fender's rear edge: 15 mm ahead of the front seam's
# most forward point (the seam leans forward 4 cm toward the belt) and 19 mm inside the skin at the lower hinge. Door
# points outboard of the axis then move outward before they move forward, so the door's leading edge clears the
# fender edge through the whole swing. Two hinges 0.32 m apart, the lower one at z 0.38 (a real Opala's spacing).
HINGE_Z,HINGE_Y=(.38,.70),.840
HINGE_ARM=.050                         # the door leaf leaves the knuckle inboard, then runs back into the door
# Hood: rear edge by the cowl, front edge where the nose starts to roll down to the grille; the curved nose with the
# eletric band stays on the car as a header panel (carro_41/42). Hinged at the rear: the axis runs 6.5 cm ahead of
# the rear edge, low enough (z .85) for the knuckles to hide under the crowned skin at y +-0.56, and was chosen by
# sweeping the hood through its opening for every candidate position (the rear edge must clear the cowl).
HOOD_X0,HOOD_X1,HOOD_W0,HOOD_W1,HOOD_ANGLE=1.000,2.172,.745,.705,52.
HOOD_AXIS,HOOD_HINGE_Y=(1.065,.850),.56
# Trunk lid: from the rear-window base to the tail; flush Aerocatch latches (carro_39/40) near its side edges. Its
# axis sits 4.5 cm behind the front edge and 2 cm under the skin line; the knuckles fit under the crown at y +-0.28
# (lower, the lid's front edge would swing forward into the rear window).
LID_X0,LID_W,LID_ANGLE=-1.535,.725,65.
LID_AXIS,LID_HINGE_Y=(-1.580,.950),.28

def seams(side):
 """Front and rear door seam x per height, read from the painted seam of V05 (Junta_porta_*). The rear one keeps
 its shape but moves SEAM_DX forward, to x -0.28 at the belt (carro_5, carro_7: between the two R's of RR)."""
 from v06_lateral import SEAM_DX
 J=world_verts(bpy.data.objects['Junta_porta_'+side]);fz=[];fx=[];rx=[]
 for z in np.arange(.22,.885,.03):
  q=J[np.abs(J[:,2]-z)<.016];f=q[q[:,0]>.5];r=q[q[:,0]<0]
  if len(f) and len(r):fz.append(z);fx.append(f[:,0].mean());rx.append(r[:,0].mean()+SEAM_DX)
 fz=np.array(fz);fx=np.array(fx);rx=np.array(rx)
 # Straight continuation above the last sample (belt molding and the window rail sit up to ~0.95).
 ext=lambda a:float(a[-1]+(a[-1]-a[-4])/(fz[-1]-fz[-4])*(1.05-fz[-1]))
 fz=np.append(fz,1.05);fx=np.append(fx,ext(fx));rx=np.append(rx,ext(rx))
 return (lambda z:np.interp(z,fz,fx)),(lambda z:np.interp(z,fz,rx))

def clearance(side,s,front,xh,ya):
 """R(z): radius about the hinge axis the door must stay outside of near its front edge: 1 mm beyond the outermost
 fender layer (skin, stripe, belt, stickers) within 4 cm ahead of the seam, and never less than the radius of the
 door skin's own front edge. Parts on that circle only turn along it as the door opens, so they never reach the
 fender. Where the fender is flush with the door this is just the skin's edge; the proud stripe and belt only trim
 the layers under them."""
 O=bpy.data.objects;low=side.lower()
 Tf=bvh([O['Lateral_'+side],O['Faixa_'+side],O['Peitoril_chapa_'+side]]+[o for o in O if o.type=='MESH' and o.name.startswith('Decal_'+low)])
 Ts=bvh(O['Lateral_'+side])
 zs=np.arange(DOOR_BOTTOM-.01,1.065,.003);fen=[];own=[]
 def hits(T,x,z):                                # every layer the ray crosses, outboard of the axis
  o=Vector((x,s*1.5,z));out=[]
  while True:
   h=T.ray_cast(o,Vector((0,-s,0)))
   if h[0] is None or abs(h[0].y)<ya:return out
   out.append(abs(h[0].y));o=h[0]+Vector((0,-s*1e-4,0))
 for z in zs:
  f=float(front(z))
  fen.append(max([math.hypot(xh-x,y-ya) for dx in (G+.0005,.003,.006,.01,.02,.04) for x in [f+dx] for y in hits(Tf,x,z)],default=0.))
  own.append(max([math.hypot(xh-(f-G),y-ya) for y in hits(Ts,f-G-.0003,z)],default=0.))
 fen=np.array(fen)
 # the widest fender layer within 3 mm up or down (the door cutter is lofted through sections 7 mm apart)
 R=[max(fen[max(0,i-1):i+2].max()+.001,own[i]) for i in range(len(zs))]
 return lambda z:float(np.interp(z,zs,R))

def arc_x(xh,ya,R,z,y,back=0.):
 """x of the arc of radius R(z)+back about the hinge axis at height y (outboard of the axis); flat inboard of it."""
 r=R(z)+back;dy=y-ya
 if dy<=0:return xh-r
 return xh-math.sqrt(r*r-dy*dy) if dy<r else xh

def loft(name,sections):
 """Closed solid through sections (same number of (x,y,z) points each), capped at both ends."""
 n=len(sections[0]);V=[v for sec in sections for v in sec];F=[]
 for i in range(len(sections)-1):
  for k in range(n):F.append((i*n+k,i*n+(k+1)%n,(i+1)*n+(k+1)%n,(i+1)*n+k))
 F+=[tuple(range(n))[::-1],tuple(range((len(sections)-1)*n,len(sections)*n))]
 me=bpy.data.meshes.new(name);me.from_pydata(V,[],F);bm=bmesh.new();bm.from_mesh(me)
 bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]);bm.to_mesh(me);bm.free()
 o=bpy.data.objects.new(name,me);bpy.context.scene.collection.objects.link(o);return o

def door_cutters(side,s,front,rear,ztop=1.05,tag='',arc=None):
 """Door (in) and fender (out) cutters, 4 mm apart along the painted seam. With arc=(xh,ya,R) the door's front
 boundary also stays outside the clearance radius (it trims the skin's inner layer and cut face near the edge)."""
 zs=np.linspace(DOOR_BOTTOM,ztop,80)                    # dense: the seam bends at the belt and above the sill
 def poly(g):
  zz=zs.copy();zz[0]=DOOR_BOTTOM-g;zz[-1]=ztop+g          # every edge of the outline moves by the half gap
  return [(front(z)+g,z) for z in zz]+[(rear(z)-g,z) for z in zz[::-1]]
 y0,y1=sorted((s*.55,s*1.3));cout=prism(f'CUT_out_{side}{tag}',poly(G),'Y',y0,y1)
 if arc is None:return prism(f'CUT_in_{side}{tag}',poly(-G),'Y',y0,y1),cout
 xh,ya,R=arc;zz=np.linspace(DOOR_BOTTOM+G,ztop-G,120)
 ys=list(np.linspace(.55,ya,4))+list(np.linspace(ya+.002,.92,40))+[1.0,1.3];secs=[]
 for z in zz:
  fr=[(min(float(front(z))-G,arc_x(xh,ya,R,z,y)),s*y,z) for y in ys[::-1]]
  secs.append([(float(rear(z))+G,s*y,z) for y in ys]+fr)
 return loft(f'CUT_in_{side}{tag}',secs),cout

def shows_texels(o):
 """True when some face of sticker o maps onto texels of alpha > 0.2 (at its corners or centre)."""
 me=o.data;img=next(n for n in me.materials[0].node_tree.nodes if n.type=='TEX_IMAGE').image;w,h=img.size
 A=np.array(img.pixels[:],np.float32).reshape(h,w,4)[:,:,3]
 uv=np.zeros(len(me.loops)*2);me.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,2)
 for p in me.polygons:
  U=uv[list(p.loop_indices)];U=np.vstack([U,U.mean(0)])
  if (A[np.clip((U[:,1]*h).astype(int),0,h-1),np.clip((U[:,0]*w).astype(int),0,w-1)]>.2).any():return True
 return False

def clear_front_seam(o,front,side,s,margin=.034):
 """A fender sticker whose artwork comes within 34 mm of the door's front seam (the seam leans forward toward the
 belt) slides forward along the skin until it clears it: the NIPO logo's top corner reached 5 mm onto the door."""
 me=o.data;img=next((n.image for n in me.materials[0].node_tree.nodes if n.type=='TEX_IMAGE'),None)
 if img is None or not me.uv_layers:return
 W=world_verts(o)
 if not (W[:,0].min()>float(front(.6))-.03 and W[:,0].max()>float(front(.6))+.10):return
 w,h=img.size;A=np.array(img.pixels[:],np.float32).reshape(h,w,4)[:,:,3]
 uv=np.zeros(len(me.loops)*2);me.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,2)
 vi=np.zeros(len(me.loops),int);me.loops.foreach_get('vertex_index',vi)
 # every opaque texel, placed on the car through the sticker's (affine) uv -> x, z mapping
 M=np.c_[uv,np.ones(len(uv))];kx=np.linalg.lstsq(M,W[vi,0],rcond=None)[0];kz=np.linalg.lstsq(M,W[vi,2],rcond=None)[0]
 jj,ii=np.nonzero(A>.3)
 if not len(ii):return
 Q=np.c_[(ii+.5)/w,(jj+.5)/h,np.ones(len(ii))];X=Q@kx;Z=Q@kz
 need=float(np.max(np.interp(Z,np.linspace(.2,1.05,60),[float(front(z)) for z in np.linspace(.2,1.05,60)])+margin-X))
 if not 0<need<.06:return
 T=bvh([bpy.data.objects['Lateral_'+side],bpy.data.objects['Faixa_'+side]])
 def sy(x,z):
  hit=T.ray_cast(Vector((x,s*1.5,z)),Vector((0,-s,0)));return hit[0].y if hit[0] is not None else None
 # the sticker, and the one just ahead of it that it would now run into (NIPO's N and the PECOM box), move together
 x1=W[:,0].max();z0,z1=W[:,2].min(),W[:,2].max();group=[o]
 for p in bpy.data.objects:
  if p.type=='MESH' and p is not o and p.name.startswith(o.name[:o.name.index('_',6)+1]) and p.parent==o.parent:
   Q=world_verts(p)
   if W[:,0].min()<Q[:,0].min()<x1+need and Q[:,2].min()<z1 and Q[:,2].max()>z0:group.append(p)
 for g in group:
  Q=world_verts(g)
  for k,(x,y,z) in enumerate(Q):
   a,b=sy(x,z),sy(x+need,z);Q[k]=(x+need,y+(b-a if a is not None and b is not None else 0.),z)
  set_world_verts(g,Q)
 print('V06 sticker moved clear of the door seam:',[g.name for g in group],f'+{need*1000:.0f} mm',flush=True)

def build_doors(mats):
 made={}
 for side,s in SIDES:
  O=bpy.data.objects;low=side.lower()
  front,rear=seams(side)
  xh=max(float(front(z)) for z in np.linspace(DOOR_BOTTOM,.95,30))+.022;yh=s*HINGE_Y
  # Stickers near the front seam lose their transparent margin there: the fender's end 25 mm ahead of the seam, the
  # door's at the door's edge (a sticker standing proud of the fender would sit in the door's opening path).
  xs=float(front(.6))
  for o in [o for o in O if o.type=='MESH' and o.name.startswith('Decal_'+low)]:clear_front_seam(o,front,side,s)
  for o in [o for o in O if o.type=='MESH' and o.name.startswith('Decal_'+low)]:
   W=world_verts(o);x0,x1=W[:,0].min(),W[:,0].max();lo=hi=None
   if xs-.05<x0<xs+.025<x1:lo,hi=0.,xs+.025
   elif x0<xs-.004<x1:lo,hi=xs-.004,3.
   if lo is not None:
    c=box_cutter('CUT_dec',(lo,min(s*.5,s*1.2),0.),(hi,max(s*.5,s*1.2),1.2));boolean(o,c,'DIFFERENCE');remove(c)
  R=clearance(side,s,front,xh,HINGE_Y)
  cin,cout=door_cutters(side,s,front,rear,arc=(xh,HINGE_Y,R))
  piv=pivot(f'Porta_{side}_DOBRADICA',(xh,yh,DOOR_BOTTOM),'porta','Z',-s*DOOR_ANGLE,
   f'Porta do {low}: gira {DOOR_ANGLE:.0f} graus em torno do eixo vertical das dobradicas (dianteiras).')
  split(O['Lateral_'+side],cin,cout,f'Porta_{side}_pele',piv)
  for name,newname in ((f'Peitoril_chapa_{side}',f'Porta_{side}_peitoril'),(f'Faixa_{side}',f'Porta_{side}_faixa')):
   split(O[name],cin,cout,newname,piv)
  # the window molding's lower rail goes with the door; it is cut 2 mm under the window net's bottom strap
  cin2,cout2=door_cutters(side,s,front,rear,ztop=.920,tag='_mold')
  split(O[f'Moldura_janela_{side}'],cin2,cout2,f'Porta_{side}_moldura',piv)
  # Stickers: split the ones that cross a seam (each piece keeps its UVs and material).
  for o in [o for o in O if o.type=='MESH' and o.name.startswith('Decal_'+low)]:
   W=world_verts(o);x0,x1=W[:,0].min(),W[:,0].max()
   if x1<rear(.5)-.03 or x0>front(.5)+.05:continue
   _,body=split(o,cin,cout,o.name+'_porta',piv)
   if body is not None and not shows_texels(body):remove(body)        # only the sticker's clear margin was left there
  remove('Junta_porta_'+side)
  # (the quarter-glass frame is built open over the door's belt: v06_lateral)
  for n in ('Carcaca_espelho_','Haste_espelho_','Vidro_espelho_'):reparent(O[n+side],piv)
  # The cabin side wall, the sill return and the floor edge sat where the door now swings: trimmed.
  x_front=float(front(.5))+.03;x_rear=min(float(rear(z)) for z in np.linspace(.2,.95,16))-G-.004
  lo=(x_rear,min(s*.52,s*1.0),.0);hi=(x_front+.1,max(s*.52,s*1.0),1.2)
  c=box_cutter('CUT_cabin',lo,hi);boolean(O[f'Painel_interno_{low}'],c,'DIFFERENCE');remove(c)
  lo=(rear(.25)-G-.002,min(s*SILL_OUT,s*1.0),.0);hi=(front(.25)+G+.002,max(s*SILL_OUT,s*1.0),.40)
  c=box_cutter('CUT_sill',lo,hi);boolean(O[f'Retorno_soleira_{low}'],c,'DIFFERENCE');boolean(O['Assoalho_continuo_V04'],c,'DIFFERENCE');remove(c)
  remove(cin);remove(cout);remove(cin2);remove(cout2)
  door_structure(side,s,front,rear,piv,mats,xh,yh,R)
  jambs(side,s,front,rear,mats,xh,yh,R)
  made[side]=piv
 return made

def door_structure(side,s,front,rear,piv,mats,xh,yh,R):
 """Closed door box behind the skin: bottom hem, the step over the sill, a plain inner panel with the flat door card
 on it, top cap under the belt molding, front and rear faces with the hinges' door leaves and the latch."""
 O=bpy.data.objects;skin=O[f'Porta_{side}_pele'];T=bvh(skin);Tp=bvh(O[f'Porta_{side}_peitoril'])
 e=G+.003                                       # end faces sit 3 mm inside the skin's cut edge (hem)
 def skin_in(x,z):
  for dz in (0,.004,-.004,-.01,-.02,-.035,.01):
   h=T.ray_cast(Vector((x,s*.5,z+dz)),Vector((0,s,0)))
   if h[0] is not None:return abs(h[0].y)
  return None
 def cap_z(x):
  h=Tp.ray_cast(Vector((x,s*.80,.5)),Vector((0,0,1)))
  return (h[0].z-.002) if h[0] is not None else .862
 xmid=.2;zi=np.linspace(DOOR_STEP,.88,24)
 yin_z=np.array([(skin_in(xmid,z) or .85)-DOOR_DEPTH for z in zi])
 y_in=lambda z:float(np.interp(z,zi,yin_z))      # inner panel follows the tumblehome of the skin
 def xend(z,front_end):return float(front(z))-e if front_end else float(rear(z))+e
 ya=abs(yh)
 def xfront(z,y):                               # the door's front face: 3 mm inside the clearance arc
  return min(float(front(z))-e,arc_x(xh,ya,R,z,y,.003))
 # Faces look away from the door's core (between skin and inner panel); the end faces look along x.
 core=lambda c:Vector((0,c.y-s*.80,c.z-.55))
 P=Part(f'Porta_{side}_estrutura','01_Carroceria',piv,smooth=40)
 # --- bottom hem, lower face beside the sill, step over it and top cap: a profile swept between the end faces
 xs_n=40;V=[];F=[]
 def profile(x):
  zc=cap_z(x);zb=DOOR_BOTTOM+.001;ysk=(skin_in(x,zb+.004) or .81)-.001
  return [(ysk,zb),(SILL_OUT+.012,zb),(SILL_OUT+.012,DOOR_STEP),(y_in(DOOR_STEP),DOOR_STEP),(y_in(zc),zc),(SILL_OUT+.012,zc)]
 for i in range(xs_n):
  u=i/(xs_n-1);xm=float(rear(.5))+e+u*(float(front(.5))-float(rear(.5))-2*e)
  for (y,z) in profile(xm):V.append((xend(z,False)+u*(xfront(z,y)-xend(z,False)),s*y,z))
 n=6
 for i in range(xs_n-1):
  for k in range(n-1):
   if k==3:continue                              # the inner panel is built apart
   a,b=i*n+k,(i+1)*n+k;F.append((a,b,b+1,a+1))
 P.mesh(mats['interna'],V,F,outward=core)
 # --- inner panel (tessellated in x,z; y from the tumblehome)
 outer=[(xfront(z,y_in(z)),z) for z in np.linspace(DOOR_STEP,.86,14)]
 outer+=[(x,cap_z(x)) for x in np.linspace(xfront(.86,y_in(.86)),float(rear(.86))+e,30)]
 outer+=[(xend(z,False),z) for z in np.linspace(.86,DOOR_STEP,14)]
 pts,tris=polygon_fill(outer)
 P.mesh(mats['interna'],[(x,s*y_in(z),z) for x,z in pts],[tuple(t) for t in tris],outward=(0,-s,0))
 # --- door card (carro_30/33): a flat gloss-black sheet 5 mm proud of the inner panel from the sill step to the
 # belt, rounded top corners (R 40 mm), screws along the top edge and in the lower corners
 x0=max(xend(z,False) for z in (DOOR_STEP,.6,.84))+.022;x1=min(xfront(z,y_in(z)) for z in (DOOR_STEP,.6,.84))-.022
 z0=DOOR_STEP+.012;z1=min(cap_z(x) for x in np.linspace(x0,x1,12))-.016
 card=[]
 for cx,cz,a0,r in ((x1-.04,z1-.04,0,.04),(x0+.04,z1-.04,90,.04),(x0+.012,z0+.012,180,.012),(x1-.012,z0+.012,270,.012)):
  card+=[(cx+r*math.cos(math.radians(a0+90*k/6)),cz+r*math.sin(math.radians(a0+90*k/6))) for k in range(7)]
 yc=lambda z,d=.005:s*(y_in(z)-d)
 pts,tris=polygon_fill(card);P.mesh(mats['interna'],[(x,yc(z),z) for x,z in pts],[tuple(t) for t in tris],outward=(0,-s,0))
 m=len(card);Vr=[(x,yc(z),z) for x,z in card]+[(x,yc(z,.0005),z) for x,z in card]
 cc=np.mean(card,axis=0)
 P.mesh(mats['interna'],Vr,[(k,(k+1)%m,m+(k+1)%m,m+k) for k in range(m)],outward=lambda c:Vector((c.x-cc[0],0,c.z-cc[1])))
 S=Part(f'Porta_{side}_parafusos','01_Carroceria',piv,smooth=30)
 for x in np.linspace(x0+.035,x1-.035,6):S.cyl(mats['aco'],(x,yc(z1-.02),z1-.02),(x,yc(z1-.02,.0075),z1-.02),.004,10)
 for x in (x0+.03,x1-.03):S.cyl(mats['aco'],(x,yc(z0+.03),z0+.03),(x,yc(z0+.03,.0075),z0+.03),.004,10)
 S.build()
 # --- end faces: rows in z between the skin and the profile, so each row sits exactly on the curved seam
 for front_end in (True,False):
  x_of=lambda z,f=front_end:xend(z,f)
  zc=cap_z(x_of(.8)+(-.02 if front_end else .02))
  for z0,z1,inner in ((DOOR_BOTTOM+.001,DOOR_STEP,lambda z:SILL_OUT+.012),(DOOR_STEP,zc,y_in)):
   zz=np.linspace(z0,z1,max(3,int((z1-z0)/.02)));V=[]
   for z in zz:
    ys_=(skin_in(x_of(z),z) or .83)-.001;yi=inner(z)
    V+=[(xfront(z,y) if front_end else x_of(z),s*y,z) for y in (ys_+(yi-ys_)*t for t in np.linspace(0,1,7))]
   P.mesh(mats['interna'],V,grid_faces(len(zz),7),outward=(lambda c:Vector((c.x-xh,c.y-yh,0))) if front_end else (-1,0,0))
 P.build()
 # --- hinges: door leaves. Two knuckles on the axis (the body's knuckle and pin sit between them), an arm running
 # inboard from them and a strap back into the door's front face, where it is bolted. They turn about the pin with the
 # door, so they never leave the body leaf (checked in verificar_opala_v06.py).
 H=Part(f'Porta_{side}_dobradicas','01_Carroceria',piv,smooth=30)
 for zc in HINGE_Z:
  xf=xfront(zc,ya-HINGE_ARM)
  for z0,z1 in ((zc-.036,zc-.0122),(zc+.0122,zc+.036)):                    # 0.7 mm clear of the body's knuckle
   H.cyl(mats['aco'],(xh,yh,z0),(xh,yh,z1),.008,14)
   H.box(mats['aco'],(xh-.002,s*(ya-.004-(HINGE_ARM-.004)/2),(z0+z1)/2),(.005,HINGE_ARM-.004,z1-z0),.001)   # arm at the knuckle
  H.box(mats['aco'],(xh-.002,s*(ya-.020-(HINGE_ARM-.020)/2),zc),(.005,HINGE_ARM-.020,.072),.0015)             # arm web
  H.box(mats['aco'],((xh+xf)/2-.012,s*(ya-HINGE_ARM),zc),(xh-xf+.024,.005,.060),.0015)                         # strap to the door
  H.box(mats['aco'],(xf-.012,s*(ya-HINGE_ARM),zc),(.024,.012,.070),.002)                                        # bolted plate
 for o in H.build():o['ignorar_colisao']=True                                   # they turn round the body's pin
 L=Part(f'Porta_{side}_fechadura','01_Carroceria',piv,smooth=30)
 xr=xend(.62,False);ysk=skin_in(xr,.62) or .86
 L.box(mats['aco_escuro'],(xr+.003,s*(ysk-.045),.62),(.006,.05,.11),.002)
 L.cyl(mats['aco'],(xr+.001,s*(ysk-.045),.605),(xr-.002,s*(ysk-.045),.605),.012,16)
 L.box(mats['aco_escuro'],(xr+.03,s*(ysk-.045),.62),(.05,.012,.05),.003)       # lock body inside the door
 for o in L.build():o['ignorar_colisao']=True                                  # the latch closes on the striker

def jambs(side,s,front,rear,mats,xh,yh,R):
 """Body side of the opening: the fender's closing face with slots where the hinge straps pass, the A-pillar face
 the hinges are bolted to (under the fender, 3 cm ahead of the axis), lock face with the striker, sill box.
 Painted body colour."""
 O=bpy.data.objects;T=bvh(O['Lateral_'+side]);ya=abs(yh);xp=xh+.030
 def body_in(x,z):
  for dx in (0,.004,-.004,.01):
   h=T.ray_cast(Vector((x+dx,s*.5,z)),Vector((0,s,0)))
   if h[0] is not None:return abs(h[0].y)
  return .84
 def xj(z,y):                     # the fender's closing face: under the seam, never beyond R - 5.5 mm
  x=float(front(z))+G+.0015;dy=y-ya;r=R(z)-.0055
  return max(x,xh-math.sqrt(r*r-dy*dy) if 0<dy<r else (xh-r if dy<=0 else x))
 slots=[(zh-.042,zh+.042) for zh in HINGE_Z];SLOT_Y=ya-HINGE_ARM-.015
 P=Part(f'Batente_porta_{side}','01_Carroceria',None,smooth=40)
 for front_end in (True,False):
  xe=(lambda z,y=0:xj(z,y)) if front_end else (lambda z,y=0:float(rear(z))-G-.0015)
  zz=np.linspace(DOOR_BOTTOM-G,.862,20)                   # up to the belt, not into the window opening
  if front_end:zz=np.unique(np.concatenate([zz,[z for sl in slots for z in sl]]))
  V=[]
  for z in zz:
   y0=body_in((float(front(z))+G+.004) if front_end else (xe(z)-.004),z)-.001
   ys=[y0,(y0+SLOT_Y)/2,SLOT_Y,.73,.685,.64] if front_end else list(np.linspace(y0,.70,6))
   V+=[(xe(z,y),s*y,z) for y in ys]
  F=grid_faces(len(zz),6)
  if front_end:   # the hinge straps swing through the outer part of the face: open there
   F=[f for i,f in enumerate(F) if not (i%5<2 and any(a-1e-6<=zz[i//5]<b-1e-6 for a,b in slots))]
  P.mesh(mats['pintura'],V,F,outward=(lambda c:Vector((xh-c.x,yh-c.y,0))) if front_end else (1,0,0))
  # return flange from the pillar face back to the cabin (so the gap never shows void)
  V=[];dx=.05 if front_end else -.05;yf=.64 if front_end else .70
  for z in zz:V+=[(xe(z,yf)-(.03 if front_end else 0),s*yf,z),(xe(z,yf)+dx,s*yf,z)]   # front: also under the gap
  P.mesh(mats['pintura'],V,grid_faces(len(zz),2),outward=(0,-s,0))
 # A-pillar face in the cavity under the fender's rear edge (seen through the slots and with the door open)
 zz=np.linspace(DOOR_BOTTOM+.01,.85,14);V=[]
 for z in zz:y0=body_in(xp,z)-.006;V+=[(xp,s*y,z) for y in np.linspace(y0,.70,4)]
 P.mesh(mats['pintura'],V,grid_faces(len(zz),4),outward=(-1,0,0))
 # Sill box the door closes over: outer face, top (threshold) and a rolled edge.
 xr=float(rear(.25))-G-.001;xf=float(front(.25))+G+.001
 P.box(mats['pintura'],((xr+xf)/2,s*(SILL_IN+SILL_OUT)/2,(.212+SILL_TOP)/2),(xf-xr,SILL_OUT-SILL_IN,SILL_TOP-.212),.012,3)
 P.build()
 # Striker (U-bolt) on the lock face, facing the latch.
 zc=.62;xr_=float(rear(zc))-G-.002;yst=body_in(xr_-.004,zc)-.045
 S=Part(f'Batente_porta_{side}_fecho','01_Carroceria',None,smooth=30)
 S.box(mats['aco'],(xr_-.004,s*yst,zc),(.008,.045,.07),.002)
 S.sweep(mats['aco'],[(xr_,s*(yst-.012),zc-.008),(xr_+.018,s*(yst-.012),zc-.008),(xr_+.018,s*(yst+.012),zc-.008),(xr_,s*(yst+.012),zc-.008)],.0045,8,12)
 # Hinges, body leaves: the middle knuckle and the pin on the axis, a leaf forward to the pillar face and its plate.
 for zh in HINGE_Z:
  S.cyl(mats['aco'],(xh,yh,zh-.0115),(xh,yh,zh+.0115),.008,14)
  S.cyl(mats['aco'],(xh,yh,zh-.040),(xh,yh,zh+.040),.0032,10)
  for zz_ in (zh-.040,zh+.040):S.cyl(mats['aco'],(xh,yh,zz_-.0015),(xh,yh,zz_+.0015),.0058,12)
  S.box(mats['aco'],((xh+xp)/2,yh,zh),(xp-xh,.005,.022),.001)
  S.box(mats['aco'],(xp-.002,s*(ya-.015),zh),(.004,.055,.075),.0015)
 for o in S.build():o['ignorar_colisao']=True                                   # striker and hinge leaves meet the door parts
 # Rubber seal round the opening, on the jamb faces.
 Sv=Part(f'Vedacao_porta_{side}','01_Carroceria',None,smooth=50)
 for z0,z1 in ((.26,HINGE_Z[0]-.05),(HINGE_Z[0]+.05,HINGE_Z[1]-.05),(HINGE_Z[1]+.05,.86)):   # broken at the hinges
  pts=[(z,body_in(float(front(z))+G+.004,z)-.030) for z in np.linspace(z0,z1,6)]
  Sv.sweep(mats['borracha'],[(xj(z,y)+.001,s*y,z) for z,y in pts],.0045,8)
 pts=[(float(rear(z))-G-.0015,z) for z in np.linspace(.86,.26,12)]
 Sv.sweep(mats['borracha'],[(x,s*(body_in(x-.004,z)-.030),z) for x,z in pts],.005,8)
 Sv.sweep(mats['borracha'],[(float(rear(.3))-.01,s*(SILL_OUT-.012),SILL_TOP+.003),(float(front(.3))+.01,s*(SILL_OUT-.012),SILL_TOP+.003)],.004,8)
 Sv.build()

# ---------------------------------------------------------------- hood and header panel
def hood_outline(g):
 """Hood outline in plan (x,y), grown by g; rounded corners."""
 pts=[];r=.045
 def w(x):return HOOD_W0+(HOOD_W1-HOOD_W0)*(x-HOOD_X0)/(HOOD_X1-HOOD_X0)
 x0=HOOD_X0-g;x1=HOOD_X1+g
 for x in np.linspace(x0+r,x1-r,24):pts.append((x,-(w(x)+g)))
 for k in range(1,6):a=-math.pi/2+math.pi/2*k/6;pts.append((x1-r+r*math.cos(a),-(w(x1)+g)+r+r*math.sin(a)))
 for y in np.linspace(-(w(x1)+g)+r,w(x1)+g-r,20):pts.append((x1,y))
 for k in range(1,6):a=math.pi/2*k/6;pts.append((x1-r+r*math.cos(a),(w(x1)+g)-r+r*math.sin(a)))
 for x in np.linspace(x1-r,x0+r,24):pts.append((x,w(x)+g))
 for k in range(1,6):a=math.pi/2+math.pi/2*k/6;pts.append((x0+r+r*math.cos(a),(w(x0)+g)-r+r*math.sin(a)))
 for y in np.linspace(w(x0)+g-r,-(w(x0)+g)+r,20):pts.append((x0,y))
 for k in range(1,6):a=math.pi+math.pi/2*k/6;pts.append((x0+r+r*math.cos(a),-(w(x0)+g)+r+r*math.sin(a)))
 return pts

def build_hood(mats):
 raise_nose()
 O=bpy.data.objects;capo=O['Capo']
 piv=pivot('Capo_DOBRADICA',(HOOD_AXIS[0],0,HOOD_AXIS[1]),'capo','Y',-HOOD_ANGLE,
  f'Capo: dobradicas na borda traseira (junto ao para-brisa); abre {HOOD_ANGLE:.0f} graus levantando a frente.')
 cin=prism('CUT_hood_in',hood_outline(-G),'Z',.4,1.3);cout=prism('CUT_hood_out',hood_outline(G),'Z',.4,1.3)
 hood,rest=split(capo,cin,cout,'Capo_painel',piv)
 remove(cin);remove(cout)
 # The rest of the old hood: the curved nose (header panel with the eletric band), the fender tops, the cowl strip.
 c=box_cutter('CUT_nose',(HOOD_X1-.03,-1,.3),(2.5,1,1.3))
 nose=rest.copy();nose.data=rest.data.copy();nose.name='Painel_frontal_superior'
 for cc in rest.users_collection:cc.objects.link(nose)
 boolean(nose,c,'INTERSECT');boolean(rest,c,'DIFFERENCE');remove(c)
 c=box_cutter('CUT_cowl',(.8,-1,.3),(HOOD_X0+.01,1,1.3))
 cowl=rest.copy();cowl.data=rest.data.copy();cowl.name='Torpedo_ventilacao'
 for cc in rest.users_collection:cc.objects.link(cowl)
 boolean(cowl,c,'INTERSECT');boolean(rest,c,'DIFFERENCE');remove(c)
 rest.name='Paralamas_topo'
 nose_band(mats);eletric_logo()
 # the hood livery stops 1 cm inside the hood's rear edge (the OMP one ran over the gap to the cowl)
 # (cut along x, not by whole faces: a whole row of faces took the rear end of the Seiva hood's NIPO logo with it)
 d=O['Decal_capo'];Mi=d.matrix_world.inverted();bm=bmesh.new();bm.from_mesh(d.data)
 r=bmesh.ops.bisect_plane(bm,geom=bm.verts[:]+bm.edges[:]+bm.faces[:],plane_co=Mi@Vector((HOOD_X0+.012,0,0)),
  plane_no=(Mi.to_3x3().inverted().transposed()@Vector((1,0,0))).normalized(),clear_inner=True)
 bm.to_mesh(d.data);bm.free();d.data.update()
 reparent(O['Decal_capo'],piv)
 # Rear pins: base plates, clip rings and pin heads go with the hood (they sit ahead of the hinge, where the hood moves
 # back as it opens); only their posts, below the frame, stay on the body. The front corners have flush latch plates
 # instead of V05's pin posts (carro_23).
 for i in range(2):
  sfx='' if i==0 else f'.{i:03d}'
  for n in ('Base_trava','Argola_trava','Pino_trava'):reparent(O[n+sfx],piv)
 for i in (2,3):
  for n in ('Base_trava','Argola_trava','Pino_trava'):remove(f'{n}.{i:03d}')
 hood_frame(piv,mats)
 hood_hinges(piv,mats)
 front_latches(piv,mats)
 # the rear pin posts pass through holes in the hood skin, its frame and the base plates
 for i in range(2):
  sfx='' if i==0 else f'.{i:03d}';c=world_verts(O['Pino_trava'+sfx]).mean(0)
  cut=prism('CUT_pin',ellipse(c[0],c[1],.012,.012,16),'Z',.6,1.1)
  for n in ('Capo_painel','Capo_estrutura_interna','Base_trava'+sfx):boolean(O[n],cut,'DIFFERENCE')
  remove(cut)
 lift_hood_rear(piv)
 return piv

# Race set-up (carro_3): the hood's rear edge stands proud of the cowl, as these cars run it to let the bay breathe,
# the front held down by its latches. The tilt about the hood's front edge is baked into the hood's meshes, so the
# hinge empty stays unrotated (car-openings.js and shutOpenings take its rest as the identity); the hinge axis rises
# with the hood, as on spacers, and the body leaves stretch up to it from their feet on the apron shelves.
# Flush, the rear edge dived under the cowl's lip as the hood opened; raised, it meets the lip on the way down, moving
# back up to 8 mm between 12 and 30 degrees: the lip steps back COWL_STEP_BACK (the seam seen from above: 13 mm).
HOOD_REAR_LIFT,COWL_STEP_BACK=.020,.009
def lift_hood_rear(piv):
 O=bpy.data.objects;W=world_verts(O['Capo_painel']);zf=float(W[W[:,0]>HOOD_X1-.02][:,2].max())
 th=math.atan2(HOOD_REAR_LIFT,HOOD_X1-HOOD_X0)
 R=Matrix.Translation((HOOD_X1,0,zf))@Matrix.Rotation(th,4,'Y')@Matrix.Translation((-HOOD_X1,0,-zf));Rn=np.array(R)
 hood=[o for o in piv.children_recursive if o.type=='MESH'];before={o.name:world_verts(o) for o in hood}
 a0=piv.matrix_world.translation.copy();d=R@a0-a0
 piv.matrix_world=Matrix.Translation(R@a0);bpy.context.view_layer.update()
 for o in hood:set_world_verts(o,before[o.name]@Rn[:3,:3].T+Rn[:3,3])
 for o in [o for o in O if o.type=='MESH' and o.name.startswith('Capo_dobradicas_suporte')]:
  W=world_verts(o);k=np.zeros(len(W))
  for m in (W[:,1]>0,W[:,1]<=0):                                       # each side from its own foot
   if m.any():z0=W[m,2].min();k[m]=np.clip((W[m,2]-z0)/max(a0.z-.03-z0,.01),0,1)    # rigid within 3 cm of the pin
  set_world_verts(o,W+np.outer(k,d))
 # the lip's front face all along the crown, fading out round the hood's rear corners (the fender tops meet the cowl
 # beyond them)
 o=O['Torpedo_ventilacao'];W=world_verts(o);yb=np.round(W[:,1]/.01).astype(int);lip=np.zeros(len(W),bool)
 for b in np.unique(yb):m=yb==b;lip|=m&(W[:,0]>W[m,0].max()-.0025)
 W[lip,0]-=COWL_STEP_BACK*np.clip((HOOD_W0-.02-np.abs(W[lip,1]))/.02,0,1);set_world_verts(o,W)
 print(f'V06 hood rear edge up {HOOD_REAR_LIFT*1000:.0f} mm ({math.degrees(th):.2f} degrees), hinge axis up {d.z*1000:.1f} mm',flush=True)

# Nose (carro_1, carro_4, carro_23): the black band between the hood seam and the grille is about as tall as a
# headlight, the grille's top is level with the headlights' tops and the hood's front edge runs straight across. V05
# rolled the hood down into the nose from x 2.0 (z 0.84) to 0.80 at the hood's front edge. Measured on the hub-aligned
# side photo carro_5, the real hood keeps its height to the front and sits 1-2 cm higher than V05 further back.
# A vertical field lifts the front end, built so its reflections stay as continuous as V05's (zebra test):
#  - 12 mm over the whole front, from 0 at x 1.2 to x 1.9;
#  - from x 1.9 forward every cross-section of the hood and fender tops keeps the height it has at x 1.9 (smooth-max
#    with a 1 cm softness), so V05's roll-down is cancelled section by section and the hood's front edge comes out at
#    z 0.861 at the centre (band 0.159 m over the 0.702 grille, 0.92 headlight) with the crown the hood has at 1.9;
#  - that part fades out across the fender tops (full inboard of y 0.60, none at y 0.88), so the shoulders, the stripe
#    and the side stickers are not sheared;
#  - on the nose's front face (ahead of x 2.14-2.21) the lift fades out linearly with height, from the roll's top to
#    the grille's top (z 0.712), so the slanted face stays flat instead of turning concave; the grille, headlights,
#    turn signals and the bumper do not move;
#  - on the sides everything fades out between z 0.62 and 0.50, over the wheel arch.
# The hood, fender tops, header, shoulders, stripe and stickers move as one surface; the gaps are cut afterwards.
NOSE_L1,NOSE_XREF,NOSE_K=.012,1.90,.010
NOSE_Y,NOSE_FACE,NOSE_WX=(.60,.88),(.712,.79,.8),(2.14,2.21)
NOSE_PARTS=('Capo','Decal_','Lateral_','Faixa_','Borda_caixa_roda','Revestimento_caixa_roda','Fundo_caixa_roda','Parede_frontal','Logo_borda_capo')
s5=lambda t:(lambda c:c*c*c*(c*(6*c-15)+10))(np.clip(t,0,1))        # smootherstep: no kink in the slope or curvature
def sclamp(t,a):
 """t clamped to [0,1], linear up to a, then rounded into 1 (zero slope at 2-a)."""
 t=np.clip(t,0,None);return np.where(t<a,t,np.where(t>2-a,1.,a+(t-a)-(t-a)**2/(4*(1-a))))
def nose_field():
 """The nose's part of the lift on an (x, |y|) grid over the old hood: each section held at its x 1.9 height."""
 T=bvh(bpy.data.objects['Capo']);xs=np.arange(1.2,HOOD_X1+.001,.01);ys=np.arange(0,.861,.01);Z=np.zeros((len(ys),len(xs)))
 for j,y in enumerate(ys):
  last=np.nan
  for i,x in enumerate(xs):
   h=T.ray_cast(Vector((x,y,2)),Vector((0,0,-1)));Z[j,i]=h[0].z if h[0] is not None else last;last=Z[j,i]
 for j in range(1,len(ys)):
  if np.isnan(Z[j]).any():Z[j]=Z[j-1]
 za=Z+NOSE_L1*s5((xs-1.2)/.7)[None,:];zt=za[:,[int(np.searchsorted(xs,NOSE_XREF))]]
 L2=((za+zt+np.sqrt((za-zt)**2+NOSE_K**2))/2-za)*s5((xs-1.6)/.3)[None,:]
 return xs,ys,L2
def grid_interp(xs,ys,G,x,y):
 x=np.clip(x,xs[0],xs[-1]);y=np.clip(y,ys[0],ys[-1])
 i=np.clip(np.searchsorted(xs,x)-1,0,len(xs)-2);j=np.clip(np.searchsorted(ys,y)-1,0,len(ys)-2)
 tx=(x-xs[i])/(xs[i+1]-xs[i]);ty=(y-ys[j])/(ys[j+1]-ys[j])
 return (G[j,i]*(1-tx)+G[j,i+1]*tx)*(1-ty)+(G[j+1,i]*(1-tx)+G[j+1,i+1]*tx)*ty
def nose_lift(W,g):
 x,ay,z=W[:,0],np.abs(W[:,1]),W[:,2]
 L1=NOSE_L1*s5((x-1.2)/.7);L2=grid_interp(*g,x,ay)
 Y=1-s5((ay-NOSE_Y[0])/(NOSE_Y[1]-NOSE_Y[0]))
 z0,z1,a=NOSE_FACE;F=1-(1-sclamp((z-z0)/(z1-z0),a))*s5((x-NOSE_WX[0])/(NOSE_WX[1]-NOSE_WX[0]))
 return (L1+L2*Y)*F*s5((z-.50)/.12)
def raise_nose():
 g=nose_field()
 for o in [o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(NOSE_PARTS)]:
  W=world_verts(o)
  if W[:,0].max()<1.20:continue
  W[:,2]+=nose_lift(W,g);set_world_verts(o,W)

GRILLE_TOP,GRILLE_BASE=.702,.548
LOGO_W,LOGO_BASE=1.00,.010
def nose_band(mats):
 """The grille of carro_23 (V05's slats go): 2 x 2 panes of silver expanded mesh between a 40 mm centre bar and one
 horizontal bar, in a thin black frame, over V05's black backing; a painted strip closes the header face down to it."""
 O=bpy.data.objects
 for o in [o for o in O if o.type=='MESH' and o.name.startswith(('Grade_vertical','Malha_grade','Travessa_grade'))]:remove(o)
 grille(mats)
 T=bvh(O['Painel_frontal_superior']);ys=np.linspace(-.535,.535,43);zz=np.linspace(GRILLE_TOP-.004,.714,5);V=[]
 for y in ys:
  h=T.ray_cast(Vector((3,y,.714)),Vector((-1,0,0)));x=(h[0].x if h[0] is not None else 2.29)-.0005
  V+=[(x,y,z) for z in zz]
 new_mesh('Painel_frontal_faixa',V,grid_faces(len(ys),len(zz)),mats['pintura'],O['Painel_frontal_superior'].users_collection[0].name,smooth=40,outward=(1,0,0))

def grille(mats):
 Y1,XB,XM=.512,2.303,2.297                        # half width of the opening, bar face, mesh plane
 zm=(GRILLE_TOP+GRILLE_BASE)/2
 B=Part('Grade_barras','04_Farois_Lanternas_Detalhes',None,smooth=30)
 blk=mats['interna_fosca']
 B.box(blk,(XB-.006,0,GRILLE_TOP-.006),(.014,2*Y1+.016,.012),.002)                   # frame: top, bottom, ends
 B.box(blk,(XB-.006,0,GRILLE_BASE+.005),(.014,2*Y1+.016,.010),.002)
 for s in (-1,1):B.box(blk,(XB-.006,s*(Y1+.002),zm),(.014,.012,GRILLE_TOP-GRILLE_BASE),.002)
 B.box(blk,(XB-.005,0,zm),(.016,.040,GRILLE_TOP-GRILLE_BASE-.004),.003)             # the 40 mm centre bar
 B.box(blk,(XB-.006,0,zm),(.014,2*Y1,.016),.002)                                     # and the one horizontal bar
 B.build()
 # expanded metal: two sets of flat strands 3.5 mm wide on +-0.5 slopes, 24 mm apart (diamonds twice as wide as tall)
 V=[];F=[];pitch,w,k=.024,.0035,.5
 def strand(p0,p1,x):
  d=np.subtract(p1,p0);d=d/np.linalg.norm(d);n=np.array([-d[1],d[0]])*w/2;i=len(V)
  for q in (np.add(p0,n),np.add(p0,-n),np.add(p1,-n),np.add(p1,n)):V.append((x,q[0],q[1]))
  F.append((i,i+1,i+2,i+3))
 for y0,y1 in ((-Y1+.006,-.020),(.020,Y1-.006)):
  for z0,z1 in ((GRILLE_BASE+.010,zm-.008),(zm+.008,GRILLE_TOP-.012)):
   for sg,x in ((1,XM),(-1,XM+.0008)):
    for c in np.arange(-(z1-z0)/k-pitch,(y1-y0)+pitch,pitch):   # line z = z0 + sg*k*(y - (y0+c)) (sg=-1 runs down)
     pts=[]
     for yy in (y0,y1):
      zz=z0+k*(yy-(y0+c)) if sg>0 else z1-k*(yy-(y0+c))
      if z0<=zz<=z1:pts.append((yy,zz))
     for zz in (z0,z1):
      yy=y0+c+(zz-z0)/k if sg>0 else y0+c+(z1-zz)/k
      if y0<=yy<=y1:pts.append((yy,zz))
     pts=sorted(set((round(a,6),round(b,6)) for a,b in pts))
     if len(pts)>=2 and np.hypot(pts[-1][0]-pts[0][0],pts[-1][1]-pts[0][1])>.004:strand(pts[0],pts[-1],x)
 silver=material('Malha_expandida_prata',(168,170,172),metal=.8,rough=.38)
 new_mesh('Grade_malha',V,F,silver,'04_Farois_Lanternas_Detalhes',outward=(1,0,0))

def eletric_logo():
 """The eletric logo spans the grille in carro_23 (about 1.0 m, letters about 0.10 m seen from the front): redrawn on
 the fixed header panel with the logo's own proportions, walking up the band from its bottom edge."""
 O=bpy.data.objects;old=O['Logo_borda_capo'];mat=old.data.materials[0];coll=old.users_collection[0].name
 img=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE').image
 w=LOGO_W;h=w*img.size[1]/img.size[0];T=bvh([O['Painel_frontal_superior'],O['Painel_frontal_faixa']]);ys=np.linspace(-w/2,w/2,49);V=[];UV=[];rows=16
 for y in ys:
  # profile of the band at this y: horizontal rays from the front, bottom to top
  pts=[]
  for z in np.arange(GRILLE_TOP-.004,.88,.002):
   hit=T.ray_cast(Vector((3,y,z)),Vector((-1,0,0)))
   if hit[0] is not None:pts.append((hit[0],hit[1] if hit[1].x>0 else -hit[1]))
  P=np.array([tuple(p) for p,_ in pts]);s=np.concatenate([[0],np.cumsum(np.linalg.norm(np.diff(P,axis=0),axis=1))])
  for r in range(rows):
   t=LOGO_BASE+h*r/(rows-1);k=min(max(np.searchsorted(s,t),1),len(P)-1)
   f=(t-s[k-1])/max(s[k]-s[k-1],1e-6);p=P[k-1]+(P[k]-P[k-1])*f;nrm=np.array(tuple(pts[k][1]))
   V.append(tuple(p+nrm*.003));UV.append(((y+w/2)/w,r/(rows-1)))
 remove(old);new_mesh('Logo_borda_capo',V,grid_faces(len(ys),rows),mat,coll,uv=UV,smooth=40,outward=(1,0,1))

def hood_frame(piv,mats):
 """Stamped inner frame under the hood skin: perimeter ring, two rails along the creases and three cross members,
 as hat sections 25 mm deep. Beams are routed around the air filter."""
 T=bvh(bpy.data.objects['Capo_painel']);P=Part('Capo_estrutura_interna','01_Carroceria',piv,smooth=40)
 mats=dict(mats,pintura=mats['interna_fosca'])                     # the underside is satin black, not gloss
 def under(x,y):
  h=T.ray_cast(Vector((x,y,.3)),Vector((0,0,1)));return h[0].z if h[0] is not None else None
 def beam(path,w=.055,d=.022,n=None):
  path=[Vector(p) for p in path];pts=[]
  L=sum((b-a).length for a,b in zip(path,path[1:]));n=n or max(3,int(L/.03))
  cum=[0];[cum.append(cum[-1]+(b-a).length) for a,b in zip(path,path[1:])]
  for t in np.linspace(0,L,n):
   k=min(np.searchsorted(cum,t,side='right')-1,len(path)-2);f=(t-cum[k])/max(cum[k+1]-cum[k],1e-9);pts.append(path[k].lerp(path[k+1],f))
  V=[];F=[]
  for i,p in enumerate(pts):
   tan=(pts[min(i+1,n-1)]-pts[max(i-1,0)]);tan.z=0;tan.normalize();nx=Vector((-tan.y,tan.x,0))
   ring=[]
   for off,dz in ((-w/2,0),(-w/2+.008,-d),(w/2-.008,-d),(w/2,0)):
    q=p+nx*off;z=under(q.x,q.y)
    if z is None:z=under(p.x,p.y) or .85
    ring.append((q.x,q.y,z-.0015+dz))
   V.extend(ring)
  for i in range(n-1):
   for k in range(3):a=i*4+k;F.append((a,a+1,a+5,a+4))
  F.append((0,1,2,3));F.append((4*n-1,4*n-2,4*n-3,4*n-4))
  P.mesh(mats['pintura'],V,F)
 def w(x):return HOOD_W0+(HOOD_W1-HOOD_W0)*(x-HOOD_X0)/(HOOD_X1-HOOD_X0)
 i=.05;xr=HOOD_X0+.12              # the rear beam stands clear of the hinge knuckles (axis at x 1.065)
 ring=[(xr,-(w(xr)-i)),(HOOD_X1-i,-(w(HOOD_X1)-i)),(HOOD_X1-i,w(HOOD_X1)-i),(xr,w(xr)-i),(xr,-(w(xr)-i))]
 for a,b in zip(ring,ring[1:]):beam([(*a,0),(*b,0)])
 for y in (-.44,.44):beam([(xr,y,0),(HOOD_X1-i,y,0)])
 for x in (1.20,1.78,2.02):beam([(x,-.44,0),(x,.44,0)],w=.05)
 # stamped inner web between the beams, 14 mm under the skin, with a large hole in each bay (the central one over
 # the air filter)
 outline=[(x,y) for x,y in ring[:-1]];holes=[]
 for x0,x1 in ((1.20,1.78),(1.78,2.02)):holes.append(rounded_rect((x0+x1)/2,0,x1-x0-.10,.78,.035,4))
 for s in (-1,1):
  for x0,x1 in ((xr,1.62),(1.62,HOOD_X1-i)):holes.append(rounded_rect((x0+x1)/2,s*(.44+w((x0+x1)/2)-i)/2,x1-x0-.10,(w((x0+x1)/2)-i-.44)-.10,.03,4))
 web(P,mats['interna_fosca'],outline,holes,under,.014)
 P.build()

def knuckle_hinge(H,B,mats,axis_pt,yc,arm,leaf):
 """Hinge with its axis along Y at (x,z)=axis_pt, centred at y=yc: two moving knuckles (H) with the body's knuckle, pin
 and pin heads (B) between them, so the moving leaf turns round the pin and never leaves the body leaf. arm(H) and
 leaf(B) add the straps to the moving part and to the body."""
 x,z=axis_pt
 for y0,y1 in ((yc-.036,yc-.013),(yc+.013,yc+.036)):H.cyl(mats['aco'],(x,y0,z),(x,y1,z),.007,14)
 B.cyl(mats['aco'],(x,yc-.0115,z),(x,yc+.0115,z),.007,14)
 B.cyl(mats['aco'],(x,yc-.040,z),(x,yc+.040,z),.0028,10)
 for yy in (yc-.040,yc+.040):B.cyl(mats['aco'],(x,yy-.0015,z),(x,yy+.0015,z),.0052,12)
 arm(H);leaf(B)

def web(P,mat,outline,holes,under,depth):
 """Flat-stamped inner panel: outline minus holes (x,y), following the skin's underside `depth` below it."""
 pts,tris=polygon_fill(outline,holes)
 P.mesh(mat,[(x,y,(under(x,y) or .85)-depth) for x,y in pts],[tuple(t) for t in tris],outward=(0,0,-1))
 for h in holes:                                   # each hole's pressed lip, 8 mm up toward the skin
  m=len(h);V=[(x,y,(under(x,y) or .85)-depth) for x,y in h]+[(x,y,(under(x,y) or .85)-depth+.008) for x,y in h]
  cx=sum(p[0] for p in h)/m;cy=sum(p[1] for p in h)/m
  P.mesh(mat,V,[(k,(k+1)%m,m+(k+1)%m,m+k) for k in range(m)],outward=lambda c,cx=cx,cy=cy:Vector((cx-c.x,cy-c.y,0)))

def hood_hinges(piv,mats):
 """Strap hinges under the rear corners of the hood: the hood's straps run forward from the knuckles to the frame's
 rear beam; the body leaves drop to the apron shelf."""
 from v06_motor import shelf_z
 H=Part('Capo_dobradicas','01_Carroceria',piv,smooth=30);B=Part('Capo_dobradicas_suporte','08_Cofre_do_motor',None,smooth=30)
 T=bvh(bpy.data.objects['Capo_painel']);x,z=HOOD_AXIS
 under=lambda xx,yy:(ray_z(T,xx,yy,down=False) or z+.012)
 for s in (-1,1):
  yc=s*HOOD_HINGE_Y
  def arm(H,yc=yc):
   # a short strap from each moving knuckle, a drop just behind the frame's rear beam and a plate bolted under that
   # beam: nothing passes through the beam
   for y0,y1 in ((yc-.036,yc-.013),(yc+.013,yc+.036)):
    ym=(y0+y1)/2;H.box(mats['aco'],(x+.0145,ym,z-.001),(.019,y1-y0,.005),.001)
   zt=min(under(x+xx,yc+dy) for xx in (.015,.055,.10) for dy in (-.036,0.,.036))-.029    # the skin is crowned under it
   H.box(mats['aco'],(x+.02,yc,(z+zt)/2-.001),(.010,.072,abs(zt-z)+.006),.001)
   H.box(mats['aco'],(x+.0575,yc,zt),(.085,.072,.005),.001)
  def leaf(B,yc=yc,s=s):
   z0=shelf_z(x,s);B.box(mats['aco'],(x-.004,yc,(z+z0)/2),(.014,.005,z-z0),.001)
   B.box(mats['aco'],(x-.004,yc,z0+.003),(.05,.04,.006),.0015)                 # foot on the apron shelf
  knuckle_hinge(H,B,mats,(x,z),yc,arm,leaf)
 for o in H.build()+B.build():o['ignorar_colisao']=True                       # they turn round the pins

def front_latches(piv,mats):
 """Front hood latches of carro_23: a flush rectangular plate (80 x 60 mm, domed centre) at each front corner of the
 hood, and a small square plate with its stud on the fender top beside it."""
 O=bpy.data.objects;Th=bvh(O['Capo_painel']);Tf=bvh(O['Paralamas_topo'])
 P=Part('Trava_capo_dianteira','01_Carroceria',piv,smooth=35);B=Part('Trava_capo_batente','01_Carroceria',None,smooth=35)
 def sheet(Part_,T,cx,cy,w,h,r,mat,lift=.0015,th=.0025):
  top=lambda x,y:(ray_z(T,x,y) or .83)
  o=rounded_rect(cx,cy,w,h,r,4);pts,tris=polygon_fill(o);m=len(o)
  Part_.mesh(mat,[(x,y,top(x,y)+lift+th) for x,y in pts],[tuple(t_) for t_ in tris],outward=(0,0,1))
  Part_.mesh(mat,[(x,y,top(x,y)+lift+th) for x,y in o]+[(x,y,top(x,y)-.002) for x,y in o],
   [(k,(k+1)%m,m+(k+1)%m,m+k) for k in range(m)],outward=lambda c:Vector((c.x-cx,c.y-cy,0)))
  return top(cx,cy)+lift+th
 for s in (-1,1):
  cx,cy=2.071,s*.667
  z=sheet(P,Th,cx,cy,.080,.060,.008,mats['aluminio'])
  P.lathe(mats['cromado'],[(0,.004),(.012,.0035),(.020,.002),(.024,.0006),(.026,0)],(cx,cy,z-.0005),(0,0,1),24)   # domed centre
  zf=sheet(B,Tf,cx,s*.742,.034,.034,.004,mats['aluminio'],lift=.001,th=.002)
  B.cyl(mats['cromado'],(cx,s*.742,zf),(cx,s*.742,zf+.006),.0055,14)
 P.build();B.build()

def hood_pin_posts(mats):
 """The rear pins' posts stay on the body, on a foot on the apron shelf."""
 from v06_motor import shelf_z
 O=bpy.data.objects;P=Part('Pinos_capo_suportes','08_Cofre_do_motor',None,smooth=30);T=bvh(O['Capo_estrutura_interna'])
 for i in range(2):
  sfx='' if i==0 else f'.{i:03d}';W=world_verts(O['Pino_trava'+sfx]);c=W.mean(0)
  zb=(ray_z(T,c[0]+.025,c[1],down=False) or .83)-.012             # they stop under the hood frame
  z0=shelf_z(c[0],1 if c[1]>0 else -1)                             # on the apron shelf
  P.cyl(mats['aco'],(c[0],c[1],z0),(c[0],c[1],zb+.002),.006,10)
  P.box(mats['aco_escuro'],(c[0],c[1],z0+.004),(.05,.04,.008),.002)
 P.build()

# ---------------------------------------------------------------- trunk lid
def lid_outline(g):
 x0=LID_X0+g;x1=-2.35;w=LID_W+g;r=.04
 # order: rear-left, rear-right, front-right corner arc, front-left corner arc
 fr=[(x0-r+r*math.cos(a),w-r+r*math.sin(a)) for a in np.linspace(math.pi/2,0,7)]
 fl=[(x0-r+r*math.cos(a),-w+r+r*math.sin(a)) for a in np.linspace(0,-math.pi/2,7)]
 return [(x1,-w),(x1,w)]+fr+fl

def build_lid(mats):
 O=bpy.data.objects;tampa=O['Tampa_porta_malas'];T0=bvh(tampa)
 piv=pivot('Tampa_porta_malas_DOBRADICA',(LID_AXIS[0],0,LID_AXIS[1]),'porta_malas','Y',LID_ANGLE,
  f'Tampa do porta-malas: dobradicas (pescoco de ganso) na borda dianteira, junto ao vidro traseiro; abre {LID_ANGLE:.0f} graus.')
 cin=prism('CUT_lid_in',lid_outline(-G),'Z',.6,1.3);cout=prism('CUT_lid_out',lid_outline(G),'Z',.6,1.3)
 lid,rest=split(tampa,cin,cout,'Tampa_porta_malas_painel',piv);remove(cin);remove(cout)
 # the lip that wrapped down over the rear panel top: gone, so the lid's rear edge clears the panel by a gap
 c=box_cutter('CUT_lip',(-2.4,-1,.5),(-2.10,1,.861));boolean(lid,c,'DIFFERENCE');remove(c)
 rest.name='Moldura_porta_malas'
 reparent(O['Decal_RTJ'],piv)
 for i in (4,5):
  for n in ('Base_trava','Argola_trava','Pino_trava'):remove(f'{n}.{i:03d}')
 lid_frame(piv,mats);lid_hinges(piv,mats);aerocatch(piv,mats)
 # The strip ahead of the lid (between it and the rear window) is cut back underneath where the lid's front edge
 # swings down past it: everything of it inside the circle the lid's edge describes about the axis, +2 mm.
 # The lid is crowned, so the circle is taken over 9 cm bands across its width.
 W=world_verts(lid);xa,za=LID_AXIS;W=W[W[:,0]>LID_X0-.03];secs=[];r=.05
 for y in np.linspace(-(LID_W-.01),LID_W-.01,49):
  q=W[np.abs(W[:,1]-y)<.045]
  if len(q):r=float(np.hypot(q[:,0]-xa,q[:,2]-za).max())+.003          # (the rounded corners keep the last)
  secs.append([(xa+r*math.cos(a),y,za+r*math.sin(a)) for a in np.linspace(0,2*math.pi,48,endpoint=False)])
 c=loft('CUT_lidarc',secs);boolean(rest,c,'DIFFERENCE');remove(c)
 return piv

def lid_frame(piv,mats):
 T=bvh(bpy.data.objects['Tampa_porta_malas_painel']);P=Part('Tampa_porta_malas_estrutura','01_Carroceria',piv,smooth=40)
 mats=dict(mats,pintura=mats['interna_fosca'])
 def under(x,y):
  h=T.ray_cast(Vector((x,y,.3)),Vector((0,0,1)));return h[0].z if h[0] is not None else None
 def beam(a,b,w=.05,d=.02,n=16):
  a=Vector(a);b=Vector(b);V=[];F=[];tan=(b-a).normalized();nx=Vector((-tan.y,tan.x,0))
  for t in np.linspace(0,1,n):
   p=a.lerp(b,t)
   for off,dz in ((-w/2,0),(-w/2+.007,-d),(w/2-.007,-d),(w/2,0)):
    q=p+nx*off;z=under(q.x,q.y) or under(p.x,p.y) or .9;V.append((q.x,q.y,z-.0015+dz))
  for i in range(n-1):
   for k in range(3):c=i*4+k;F.append((c,c+1,c+5,c+4))
  F.append((0,1,2,3));F.append((4*n-1,4*n-2,4*n-3,4*n-4));P.mesh(mats['pintura'],V,F)
 x0,x1,w=LID_X0-.14,-2.09,LID_W-.04        # front beam behind the hinge arms' drop (axis at x -1.58)
 for a,b in (((x0,-w,0),(x1,-w,0)),((x0,w,0),(x1,w,0)),((x0,-w,0),(x0,w,0)),((x1,-w,0),(x1,w,0)),((-1.83,-w,0),(-1.83,w,0))):beam(a,b)
 outline=[(x0,-w),(x1,-w),(x1,w),(x0,w)];holes=[]
 for xa,xb in ((x0,-1.83),(-1.83,x1)):
  for sgn in (-1,1):
   ya,yb=.07,(.58 if xb==x1 else w-.05)                          # the rear holes stop short of the latch housings
   holes.append(rounded_rect((xa+xb)/2,sgn*(ya+yb)/2,abs(xa-xb)-.10,yb-ya,.03,4))
 web(P,mats['pintura'],outline,holes,under,.018)
 P.build()

def lid_hinges(piv,mats):
 """Hinges under the front of the lid: the lid's arms run back from the knuckles to the frame's front beam; the body
 brackets drop from the pins and turn forward onto the bulkhead behind the seat."""
 H=Part('Tampa_porta_malas_dobradicas','01_Carroceria',piv,smooth=30);B=Part('Tampa_porta_malas_dobradicas_suporte','10_Porta_malas',None,smooth=30)
 T=bvh(bpy.data.objects['Tampa_porta_malas_painel']);x,z=LID_AXIS
 under=lambda xx,yy:(ray_z(T,xx,yy,down=False) or z+.01)
 xb=-1.49                                                                     # the bulkhead behind the seat
 for s in (-1,1):
  yc=s*LID_HINGE_Y
  def arm(H,yc=yc):
   # straps back from the knuckles, a drop ahead of the frame's front beam, and a plate bolted under that beam: no part
   # passes through the beam (round 2's arm cut a notch in it)
   for y0,y1 in ((yc-.036,yc-.013),(yc+.013,yc+.036)):
    ym=(y0+y1)/2;H.box(mats['aco'],(x-.025,ym,z-.001),(.040,y1-y0,.005),.001)
   zt=min(under(x-xx,yc+dy) for xx in (.045,.095,.115) for dy in (-.036,0.,.036))-.029
   H.box(mats['aco'],(x-.045,yc,(z+zt)/2-.001),(.012,.072,abs(zt-z)+.006),.001)
   H.box(mats['aco'],(x-.08,yc,zt),(.07,.072,.005),.001)
  def leaf(B,yc=yc):
   B.sweep(mats['aco'],[(x,yc,z),(x,yc,z-.05),(x+.02,yc,z-.07),(xb-.01,yc,z-.075)],.005,8)
   B.box(mats['aco'],(xb-.012,yc,z-.075),(.012,.05,.05),.0015)               # plate on the bulkhead
  knuckle_hinge(H,B,mats,(x,z),yc,arm,leaf)
 for o in H.build()+B.build():o['ignorar_colisao']=True

def aerocatch(piv,mats):
 """Flush Aerocatch latches of carro_39/40: black oval plate with a polished rim, 4 screws, trigger and spring pin,
 set into the lid near its side edges. The pins they catch stay on the body (on brackets inside the gutter)."""
 T=bvh(bpy.data.objects['Tampa_porta_malas_painel']);P=Part('Tampa_porta_malas_travas','01_Carroceria',piv,smooth=35)
 B=Part('Porta_malas_pinos_trava','10_Porta_malas',None,smooth=30)
 for s in (-1,1):
  cx,cy=-2.00,s*.655;L,W=.150,.072
  top=lambda x,y:(T.ray_cast(Vector((x,y,2)),Vector((0,0,-1)))[0] or Vector((x,y,.9))).z
  # teardrop outline (carro_39/40): a wide round end round the pin cup (rearward) tangent to a small round tip at the
  # trigger end (forward)
  x1,r1,x2,r2=cx-.035,.036,cx+.062,.013
  def outline(g):
   a1,b1=r1-g,r2-g;al=math.acos((a1-b1)/(x2-x1));pts=[]
   for a in np.linspace(al,2*math.pi-al,30):pts.append((x1+a1*math.cos(a),cy+a1*math.sin(a)))
   for a in np.linspace(-al,al,14):pts.append((x2+b1*math.cos(a),cy+b1*math.sin(a)))
   return pts
  o_out=outline(0.);o_in=outline(.0017)                # a thin polished rim
  Vr=[(x,y,top(x,y)+.0012) for x,y in o_out]+[(x,y,top(x,y)+.0022) for x,y in o_in];m=len(o_out)
  P.mesh(mats['cromado'],Vr,[(k,(k+1)%m,m+(k+1)%m,m+k) for k in range(m)])
  plate=material('Placa_trava_preta',(9,9,10),rough=.28,coat=.4)
  slot=rounded_rect(cx+.03,cy,.058,.017,.006,3)
  pts,tris=polygon_fill(o_in,[ellipse(cx-.035,cy,.025,.025,24),slot]);P.mesh(plate,[(x,y,top(x,y)+.0022) for x,y in pts],[tuple(t) for t in tris])
  hx,hy=cx-.035,cy;zt=top(hx,hy)
  P.cyl(mats['borracha'],(hx,hy,zt+.0021),(hx,hy,zt-.034),.025,24,caps=False)          # deep dark pin cup, open on top
  P.cyl(mats['borracha'],(hx,hy,zt-.034),(hx,hy,zt-.036),.025,24)
  P.box(mats['aco_escuro'],(cx,cy,zt-.028),(L*.9,W*.8,.03),.01,2)                                      # housing under the skin
  # the lid slopes about 1 cm along the latch: every part sits at the lid height under it (z of x)
  zs=lambda dx:top(cx+dx,cy)
  slope=math.atan2(zs(.03)-zs(-.03),.06);R=Matrix.Rotation(-slope,4,'Y')
  P.box(mats['borracha'],(cx+.03,cy,zs(.03)-.011),(.058,.017,.010),.003,1,M=R)                          # slot floor, dark
  coil=[(cx+.008+.036*t,cy+.0048*math.cos(t*14*math.pi),zs(.008+.036*t)-.001+.0048*math.sin(t*14*math.pi)) for t in np.linspace(0,1,120)]
  P.sweep(mats['cromado'],coil,.0011,5,samples=120)                                                    # spring in the slot
  lever=material('Plastico_translucido_fume',(150,156,162),rough=.2,alpha=.55)
  P.box(lever,(cx+.062,cy,zs(.062)+.005),(.03,.03,.006),.002,M=R)                                      # translucent trigger
  P.box(lever,(cx+.047,cy,zs(.047)+.002),(.012,.012,.008),.002,M=R)
  for dx,dy in ((-.052,-.024),(-.052,.024),(.030,-.0145),(.030,.0145)):P.cyl(mats['cromado'],(cx+dx,cy+dy,zs(dx)+.0022),(cx+dx,cy+dy,zs(dx)+.0040),.0042,12)
  P.cyl(mats['borracha'],(cx-.005,cy-.022,zs(-.005)+.0023),(cx-.005,cy-.022,zs(-.005)+.0025),.004,10)  # the fifth, empty hole
  # body pin on a bracket from the quarter inner wall
  zb=zt-.10
  B.cyl(mats['cromado'],(hx,hy,zb),(hx,hy,zt-.062),.008,12)
  B.box(mats['aco'],(hx,(hy+s*.76)/2,zb-.004),(.05,abs(s*.76-hy)+.02,.008),.002)
 P.build();B.build()

# ---------------------------------------------------------------- small pivots for future damage
def small_pivots(mats):
 O=bpy.data.objects
 for i,sfx in enumerate(('','.001')):
  W=world_verts(O['Tampa_bocal'+sfx]);c=W.mean(0)
  piv=pivot(f'Tampa_bocal_{i+1}_DOBRADICA',(c[0]+.03,c[1],c[2]),'tampa_combustivel','Z',70.,
   'Tampa do bocal de combustivel (lado do passageiro): abre girando para fora; pode ser arrancada em dano.')
  reparent(O['Tampa_bocal'+sfx],piv)
 piv=pivot('Saia_dianteira_PIVO',(2.25,0,.40),'saia_dianteira','',0.,'Saia dianteira e para-choque: peca solta para dano (sem abertura).')
 for n in ('Saia_dianteira','Para_choque_dianteiro'):reparent(O[n],piv)
