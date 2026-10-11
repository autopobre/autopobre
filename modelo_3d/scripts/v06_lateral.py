"""V06 side greenhouse and rear stickers, moved to the photos before the doors are cut.

carro_5 (V05 ortho camera matched to the photo by the wheel hubs), carro_7 and carro_18 put the door rear seam at
x ~ -0.28 (V05 painted it 0.22 m further back), the quarter glass between x ~ -0.25 and -0.83 with a painted sail
panel behind it (the JESUS sticker sits there), a flat riveted post between the door window and the quarter glass,
and the RR IMPORT / invent / 99 stickers further forward and larger. The roof, the belt line, the C pillar, the wheels
and the axles do not move: only the glass, its frame, the post, the window-net ends and the stickers."""
import bpy,bmesh,math,os,tempfile
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
from v06_comum import *

SEAM_DX=.219                  # the V05 rear seam (x -0.499 at the belt) moved to -0.28 (carro_5), same shape
SIDES=(('Motorista',1),('Passageiro',-1))
FONTS=Path('C:/Windows/Fonts')

# ---------------------------------------------------------------- quarter glass
def xf(z):return -.259+.03*(z-.911)/.29      # glass front edge; leans forward 3 cm at the top like V05's
POST_W=.042                                  # the flat post ahead of it (carro_7: rivets along it)
def zb(x):return .911+.03*max(0.,-.519-x)    # the belt the glass seats on (V05 frame bottom)
TOP=np.array([(-.20,1.212),(-.30,1.208),(-.437,1.200),(-.569,1.185),(-.688,1.167)])   # V05 frame top, under the header
def zt(x):return float(np.interp(-x,-TOP[:,0],TOP[:,1]))
# Rear edge (carro_5, carro_18): from the top-rear corner it bulges back to x -0.83 a third of the way up and rounds
# forward into the belt at -0.775; behind it is painted sheet metal up to the C pillar.
REAR=[(-.640,None),(-.700,1.163),(-.765,1.135),(-.810,1.085),(-.830,1.030),(-.826,.975),(-.805,.940),(-.775,None)]

def quarter_outline():
 """New quarter-glass outline as (x,z) points, going round front edge, top, rear curve, belt."""
 z0=zb(xf(.911));z1=zt(xf(1.21));pts=[(xf(z),z) for z in np.linspace(z0,z1,8)]
 pts+=[(x,zt(x)) for x in np.linspace(xf(z1),-.62,12)[1:]]
 ctl=[Vector((-.640,zt(-.640),0))]+[Vector((x,z,0)) for x,z in REAR[1:-1]]+[Vector((-.775,zb(-.775),0))]
 pts+=[(p.x,p.y) for p in catmull(ctl,40)[1:]]
 pts+=[(x,zb(x)) for x in np.linspace(-.775,xf(z0),16)[1:-1]]
 return pts

def old_frame(side):
 """V05 quarter-glass frame: a tube of rings of 8 vertices; the ring centres trace the old glass outline."""
 return world_verts(bpy.data.objects['Moldura_vigia_'+side]).reshape(-1,8,3).mean(1)

def plane_of(C):
 """y of the greenhouse side as a plane through the old frame's ring centres (residual under 1 cm)."""
 A=np.c_[np.ones(len(C)),C[:,2],C[:,0]];k=np.linalg.lstsq(A,C[:,1],rcond=None)[0]
 return lambda x,z:float(k[0]+k[1]*z+k[2]*x)

def flat_mesh(name,pts2d,y_of,mat,collection,s):
 pts,tris=polygon_fill(pts2d)
 return new_mesh(name,[(x,y_of(x,z),z) for x,z in pts],[tuple(t) for t in tris],mat,collection,outward=(0,s,0))

def build_greenhouse(mats):
 O=bpy.data.objects;out=quarter_outline();jesus=None
 for side,s in SIDES:
  low=side.lower();C=old_frame(side);Y=plane_of(C)
  glass=O['Vigia_lateral_'+side];gm=glass.data.materials[0];gcol=glass.users_collection[0].name
  fr=O['Moldura_vigia_'+side];fm=fr.data.materials[0];fcol=fr.users_collection[0].name
  remove(glass);remove(fr)
  sail=sail_panel(side,s,out,Y,mats)
  flat_mesh('Vigia_lateral_'+side,out,Y,gm,gcol,s)
  # Frame tube round the new glass, as the V05 one (r 7.5 mm, dark metal). It is left open over the door's belt:
  # from the front edge 2 cm up to the belt behind the door's rear seam, so the door opens under the glass.
  P=Part('Moldura_vigia_'+side,fcol,None,smooth=40)
  path=[p for p in out if not (p[0]>-.29 and p[1]<.93)]
  i0=next(i for i,p in enumerate(path) if p[0]>-.29);path=path[i0:]+path[:i0]
  P.sweep(fm,[(x,Y(x,z),z) for x,z in path],.0075,8,samples=6*len(path));P.build()
  # Flat post between the door window and the quarter glass, 12 mm thick, with 6 rivets (carro_7).
  z0,z1=zb(xf(.911))+.001,zt(xf(1.21))+.008;zz=np.linspace(z0,z1,10);V=[]
  for z in zz:
   for x,dy in ((xf(z)+.002,.004),(xf(z)+.002+POST_W,.004),(xf(z)+.002+POST_W,-.008),(xf(z)+.002,-.008)):
    V.append((x,Y(x,z)+s*dy,z))
  F=[]
  for i in range(len(zz)-1):
   for k in range(4):a=i*4+k;b=i*4+(k+1)%4;F.append((a,b,b+4,a+4))
  n=len(zz)*4;F+=[(0,1,2,3),(n-4,n-3,n-2,n-1)]
  B=Part('Coluna_B_'+side,'01_Carroceria',None,smooth=30)
  def away(c,z0=z0,z1=z1,Y=Y,s=s):      # from the slab's centre line (caps: up / down)
   if c.z<z0+.001 or c.z>z1-.001:return Vector((0,0,c.z-(z0+z1)/2))
   x=xf(c.z)+.002+POST_W/2;return Vector((c.x-x,c.y-(Y(x,c.z)-s*.002),0))
  B.mesh(mats['pintura'],V,F,outward=away)
  for z in np.linspace(z0+.03,z1-.03,6):
   x=xf(z)+.002+POST_W/2;y=Y(x,z)+s*.004
   B.cyl(mats['aco'],(x,y,z),(x,y+s*.002,z),.0045,10)
  B.build()
  # The door window frame loses its old rear post: it now ends 3 mm ahead of the new post (its lower rail opens with the door).
  poly=[(-2.,.5),(xf(.5)+POST_W+.005,.5),(xf(1.4)+POST_W+.005,1.4),(-2.,1.4)]
  cut=prism('CUT_mj',poly,'Y',min(s*.4,s*1.0),max(s*.4,s*1.0));boolean(O['Moldura_janela_'+side],cut,'DIFFERENCE');remove(cut)
  rebuild_net(side,s)
  # Stickers and fillers that sat on the old glass move with it.
  dx=.21
  movers=['Adesivos_vigia_'+low]+(['Bocal_combustivel','Bocal_combustivel.001','Tampa_bocal','Tampa_bocal.001'] if s<0 else [])
  for n in movers:
   o=O[n];W=world_verts(o);W[:,1]+=np.array([Y(x+dx,z)-Y(x,z) for x,_,z in W]);W[:,0]+=dx;set_world_verts(o,W)
  # JESUS TA ON: on the sail behind the glass, centred at x ~ -1.0 and 0.275 m wide (carro_5, carro_18). carro_5
  # puts it 7 cm higher, but its stripe on the quarter is 6 cm higher too (the car is pitched in that photo): measured
  # from the stripe it sits where the photo has it. It is 8 % bigger than in round 2, as big as the sail allows (the
  # sail's top edge runs down to z 1.11 at x -1.12).
  jesus=jesus or texture_jesus()
  j=refit_decal(O['Jesus_TaOn_'+low],(-.857,-1.132,.94,1.126),side,s,jesus,off=.002,surfaces=[sail,O['Coluna_C_'+side]])
  if s>0:                                        # carro_5: the round white sticker over JESUS's front end
   o=j.copy();o.data=j.data.copy();o.name='Adesivo_redondo_'+low;j.users_collection[0].objects.link(o)
   m=j.data.materials[0].copy();m.name='Adesivo_redondo';o.data.materials[0]=m
   refit_decal(o,(-.808,-.878,1.117,1.187),side,s,texture_disc(),off=.0035,surfaces=[sail,O['Coluna_C_'+side]])

def rear_x(out,z):
 """Rear-most x of the glass outline at height z (None where the line misses it)."""
 xs=[x0+(x1-x0)*(z-z0)/(z1-z0) for (x0,z0),(x1,z1) in zip(out,out[1:]+out[:1]) if (z0-z)*(z1-z)<=0 and z0!=z1]
 return min(xs) if xs else None

def sail_panel(side,s,out,Y,mats):
 """Painted sheet between the new glass and the C pillar (where V05 had glass). V05 set its glass 2-3 cm inside the
 C pillar's surface, so each row runs from the glass plane at the glass edge (under the frame tube) and blends into
 the pillar, 12 mm under its front edge."""
 TC=bvh(bpy.data.objects['Coluna_C_'+side]);rows=[];zz=np.linspace(.905,1.176,28)
 for z in zz:
  xg=rear_x(out,min(max(z,.912),1.171));xg=-.64 if xg is None else xg;xc=None
  for x in np.arange(xg-.01,xg-.6,-.005):
   if TC.ray_cast(Vector((x,s*1.5,z)),Vector((0,-s,0)))[0] is not None:xc=x;break
  if xc is None:xe,ye=xg-.05,Y(xg-.05,z)
  else:
   xe=xc-.012;h=TC.ray_cast(Vector((xe,s*1.5,z)),Vector((0,-s,0)))
   ye=(h[0].y-s*.002) if h[0] is not None else Y(xe,z)
  rows.append((z,xg,xe,ye))
 V=[];nu=14
 for z,xg,xe,ye in rows:
  for t in np.linspace(0,1,nu):
   x=xg+(xe-xg)*t;b=t*t*(3-2*t);V.append((x,Y(x,z)*(1-b)+ye*b,z))
 return new_mesh(f'Painel_coluna_{side}',V,grid_faces(len(rows),nu),mats['pintura'],'01_Carroceria',smooth=40,outward=(0,s,0))

NET_V,NET_H,NET_W,NET_T=7,5,.030,.004     # carro_3, carro_5, carro_21: 7 upright and 5 cross straps, 30 mm webbing
NET_FRONT=(.52,.40)                        # front column at the belt and at the head (it leans with the A pillar)
def rebuild_net(side,s):
 """Window net rebuilt on the V05 net's own frame (its bottom and top straps give the belt and head lines and the
 plane): from the new post to x 0.535 at the belt (carro_5 0.51, carro_21 about 0.60), 7 x 5 straps, none scaled."""
 o=bpy.data.objects['Rede_janela_'+side];W=world_verts(o);mat=o.data.materials[0];coll=o.users_collection[0].name
 bm=bmesh.new();bm.from_mesh(o.data);comp=np.full(len(W),-1);k=0
 for v in bm.verts:
  if comp[v.index]>=0:continue
  st=[v]
  while st:
   a=st.pop()
   if comp[a.index]>=0:continue
   comp[a.index]=k;st+=[e.other_vert(a) for e in a.link_edges]
  k+=1
 bm.free()
 # cross straps run long in x and short in z; the lowest and highest are the belt and head lines
 cross=sorted([c for c in range(k) if np.ptp(W[comp==c,0])>2*np.ptp(W[comp==c,2])],key=lambda c:W[comp==c,2].mean())
 def line(c):
  q=W[comp==c];p=np.polyfit(q[:,0],q[:,2],2);return lambda x:float(np.polyval(p,x))   # the strap's centre line
 zb,zt=line(cross[0]),line(cross[-1])
 A=np.c_[np.ones(len(W)),W[:,2],W[:,0]];kp=np.linalg.lstsq(A,W[:,1],rcond=None)[0]
 Y=lambda x,z:float(kp[0]+kp[1]*z+kp[2]*x)
 n=np.array([0.,1.,-kp[1]]);n/=np.linalg.norm(n);n*=np.sign(n[1]*s)          # outward normal of the net plane
 zb0=zb(0.);xr_b=xf(zb0)+.002+POST_W+NET_W/2+.002;xr_t=xf(zt(0.))+.002+POST_W+NET_W/2+.002   # just ahead of the post
 def P(a,b):
  x0=xr_b+a*(NET_FRONT[0]-xr_b);x1=xr_t+a*(NET_FRONT[1]-xr_t)
  x=x0+(x1-x0)*b;z=zb(x0)+(zt(x1)-zb(x0))*b;return np.array([x,Y(x,z),z])
 V=[];F=[]
 def ribbon(pts):
  pts=[np.asarray(p,float) for p in pts];m=len(pts);i0=len(V)
  for i,p in enumerate(pts):
   tg=pts[min(i+1,m-1)]-pts[max(i-1,0)];tg/=np.linalg.norm(tg);w=np.cross(n,tg);w/=np.linalg.norm(w)
   for dw,dn in ((-1,-1),(1,-1),(1,1),(-1,1)):V.append(tuple(p+w*dw*NET_W/2+n*dn*NET_T/2))
  for i in range(m-1):
   for j in range(4):a=i0+i*4+j;b=i0+i*4+(j+1)%4;F.append((a,b,b+4,a+4))
  F.append(tuple(i0+j for j in range(4))[::-1]);F.append(tuple(i0+(m-1)*4+j for j in range(4)))
 for i in range(NET_V):ribbon([P(i/(NET_V-1),b) for b in np.linspace(0,1,8)])
 for j in range(NET_H):
  b=j/(NET_H-1);pts=[P(a,b)+n*NET_T for a in np.linspace(0,1,13)]         # over the uprights
  d0=pts[1]-pts[0];d1=pts[-1]-pts[-2];pts[0]=pts[0]-d0/np.linalg.norm(d0)*NET_W/2;pts[-1]=pts[-1]+d1/np.linalg.norm(d1)*NET_W/2
  ribbon(pts)
 remove(o);new_mesh('Rede_janela_'+side,V,F,mat,coll)

# ---------------------------------------------------------------- stickers: vector textures and placement
def srgb_lin(c):return ((c/255+.055)/1.055)**2.4 if c/255>.04045 else c/255/12.92
def masks(layers,width,height,px_per_m=1000):
 """Renders each layer of flat text/shapes (metres, origin at the centre, y up) white on transparent in a throwaway
 scene and returns its alpha (H x W, top row first). Items: ('text',txt,font,(w,h),(cx,cy),shear[,offset]) with the
 glyphs' bounding box fitted to (w,h) and offset thinning the strokes (font units), or ('poly',pts)."""
 sc=bpy.data.scenes.new('TEX_V06');cam=bpy.data.cameras.new('TEX_CAM');cam.type='ORTHO';cam.ortho_scale=max(width,height)
 co=bpy.data.objects.new('TEX_CAM',cam);co.location=(0,0,5);sc.collection.objects.link(co);sc.camera=co
 m=bpy.data.materials.new('TEX_white');m.use_nodes=True;nt=m.node_tree;nt.nodes.clear()
 e=nt.nodes.new('ShaderNodeEmission');e.inputs['Color'].default_value=(1,1,1,1);o_=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(e.outputs[0],o_.inputs[0])
 r=sc.render;r.engine='BLENDER_EEVEE';r.film_transparent=True;r.resolution_x=int(width*px_per_m);r.resolution_y=int(height*px_per_m)
 r.resolution_percentage=100;r.image_settings.file_format='PNG';r.image_settings.color_mode='RGBA'
 sc.view_settings.view_transform='Standard'
 try:sc.eevee.taa_render_samples=16
 except AttributeError:pass
 tmp=Path(tempfile.mkdtemp(prefix='opala_v06_tex_'));out=[];made=[]
 for li,items in enumerate(layers):
  objs=[]
  for it in items:
   if it[0]=='text':
    _,txt,font,(w,h),(cx,cy),shear=it[:6];off=it[6] if len(it)>6 else 0.
    cu=bpy.data.curves.new('TEX_TXT','FONT');cu.body=txt;cu.font=bpy.data.fonts.load(str(FONTS/font),check_existing=True)
    cu.align_x='CENTER';cu.align_y='CENTER';cu.shear=shear;cu.materials.append(m)
    ob=bpy.data.objects.new('TEX_TXT',cu);bpy.context.scene.collection.objects.link(ob)
    dg=bpy.context.evaluated_depsgraph_get();dg.update();bb=[Vector(b) for b in ob.evaluated_get(dg).bound_box]
    bpy.context.scene.collection.objects.unlink(ob)
    x0,x1=min(b.x for b in bb),max(b.x for b in bb);y0,y1=min(b.y for b in bb),max(b.y for b in bb)
    ob.scale=(w/(x1-x0),h/(y1-y0),1);ob.location=(cx-(x0+x1)/2*w/(x1-x0),cy-(y0+y1)/2*h/(y1-y0),0)
    cu.offset=off                   # thinner (off<0) strokes, placed as the full-weight letter
   else:
    me=bpy.data.meshes.new('TEX_SHAPE');me.from_pydata([(*p,0) for p in it[1]],[],[list(range(len(it[1])))]);me.materials.append(m)
    ob=bpy.data.objects.new('TEX_SHAPE',me)
   sc.collection.objects.link(ob);objs.append(ob)
  f=tmp/f'l{li}.png';r.filepath=str(f);bpy.ops.render.render(write_still=True,scene=sc.name)
  img=bpy.data.images.load(str(f));a=np.array(img.pixels[:],np.float32).reshape(img.size[1],img.size[0],4)[::-1,:,3].copy()
  bpy.data.images.remove(img);os.remove(f);out.append(a)
  for ob in objs:
   d=ob.data;bpy.data.objects.remove(ob,do_unlink=True)
   (bpy.data.curves if isinstance(d,bpy.types.Curve) else bpy.data.meshes).remove(d)
 bpy.data.objects.remove(co,do_unlink=True);bpy.data.cameras.remove(cam);bpy.data.scenes.remove(sc);bpy.data.materials.remove(m)
 for f_ in [f_ for f_ in bpy.data.fonts if f_.users==0]:bpy.data.fonts.remove(f_)
 os.rmdir(tmp);return out

def compose(name,shape,parts):
 """parts: (alpha, sRGB colour) painted in order; returns a packed image."""
 rgba=np.zeros((*shape,4),np.float32)
 for a,c in parts:
  a=np.clip(a,0,1)[...,None];rgba[...,:3]=rgba[...,:3]*(1-a)+np.array(c,np.float32)/255*a;rgba[...,3:]=rgba[...,3:]*(1-a)+a
 # colour bleeds under the transparent border, so filtering never darkens the letter edges
 cov=rgba[...,3]>.01
 if cov.any():rgba[~cov,:3]=rgba[cov,:3].mean(0)
 return image_from_array(name,rgba)

def texture_rr(ghost=False):
 """RR IMPORT (carro_5, carro_7): two R's drawn as a thick outline with a thin dark line inside, the right one over
 the left, IMPORT in thin capitals under them; 0.50 x 0.39 m. IMPORT is spelled out in full (the V05 photo crop had
 lost the T's bar: "IMPOR1"). ghost: the dark trace a peeled-off sticker leaves in the paint, under the names written
 over the driver door (carro_21)."""
 W,H=.50,.39;R=lambda cx,off=0.:('text','R','GOTHICB.TTF',(.150,.245),(cx,.0725),0,off)
 l=masks([[R(-.045)],[R(-.045,-.045)],[R(.045)],[R(.045,-.045)],[('text','IMPORT','GOTHIC.TTF',(.50,.115),(0,-.1375),0)]],W,H)
 a1=l[0]*(1-l[1])*(1-l[2]);a2=l[2]*(1-l[3]);grey=(17,17,19) if ghost else (186,188,192)
 return compose('rr_import_fantasma_v06.png' if ghost else 'rr_import_v06.png',l[0].shape,[(a1,grey),(a2,grey),(l[4],grey)])

def texture_invent():
 """invent / software (carro_5): white lower case, the V in a red and a taller yellow stroke; 0.732 x 0.24 m.
 Letters placed one by one where the photo has them (the t and the V's right stroke rise above the others)."""
 W,H=.732,.24;b=-.050;x=.100
 l=masks([[('text','i','GOTHIC.TTF',(.020,.132),(-.354,b+.066),0),('text','n','GOTHIC.TTF',(.098,x),(-.258,b+x/2),0),
   ('text','e','GOTHIC.TTF',(.105,x),(.050,b+x/2),0),('text','n','GOTHIC.TTF',(.098,x),(.178,b+x/2),0),
   ('text','t','GOTHIC.TTF',(.085,.166),(.300,b+.083),0),
   ('text','software','GOTHIC.TTF',(.40,.042),(.045,-.099),0)],
  [('poly',[(-.196,b+x),(-.158,b+x),(-.103,b),(-.139,b)])],
  [('poly',[(-.139,b),(-.103,b),(-.004,.118),(-.044,.118)])]],W,H)
 return compose('invent_v06.png',l[0].shape,[(l[0],(242,242,240)),(l[1],(226,58,36)),(l[2],(250,196,22))])

def texture_jesus():
 """JESUS / TA ON sticker of the sail (carro_5, carro_18): white capitals over a light-blue pill with TA and a white
 disc with ON; 0.26 x 0.175 m (the V05 photo crop carried a grey background with it)."""
 blue=(28,150,226)
 l=masks([[('text','JESUS','segoeuib.ttf',(.235,.075),(0,.045),0)],[('poly',rounded_rect(0,-.047,.25,.07,.035,6))],
  [('text','TÁ','seguibli.ttf',(.060,.046),(-.062,-.047),0)],[('poly',ellipse(.080,-.047,.031,.031,32))],
  [('text','ON','segoeuib.ttf',(.044,.030),(.080,-.047),0)]],.26,.175)
 return compose('jesus_ta_on_v06.png',l[0].shape,[(l[0],(242,242,240)),(l[1],blue),(l[2],(250,250,250)),(l[3],(250,250,250)),(l[4],(40,140,215))])

def texture_disc():
 """Round white sticker (carro_5, over JESUS): white disc with a thin dark ring near its edge, 0.07 m."""
 l=masks([[('poly',ellipse(0,0,.035,.035,64))],[('poly',ellipse(0,0,.0315,.0315,64))],[('poly',ellipse(0,0,.0295,.0295,64))]],.07,.07,2000)
 return compose('adesivo_redondo_v06.png',l[0].shape,[(l[0],(244,244,242)),(l[1]*(1-l[2]),(38,40,44))])

def texture_99():
 """99 of the quarter panel (carro_5): heavy white numerals slanted like the photo's, 0.477 x 0.40 m."""
 l=masks([[('text','99','FRAHV.TTF',(.477,.40),(0,0),.22)]],.477,.40)
 return compose('numero_99_v06.png',l[0].shape,[(l[0],(240,240,238))])

def content_box(img):
 """u0,u1,v0,v1 of the image's visible part: rows and columns with 3 or more texels of alpha > 0.2 (a stray texel
 in a corner does not count)."""
 a=np.array(img.pixels[:],np.float32).reshape(img.size[1],img.size[0],4)[:,:,3]>.2
 xs=np.where(a.sum(0)>=3)[0];ys=np.where(a.sum(1)>=3)[0]
 return xs.min()/img.size[0],(xs.max()+1)/img.size[0],ys.min()/img.size[1],(ys.max()+1)/img.size[1]
def content_x(o):
 """x range of the visible part of sticker o as it is mapped now (u along the car)."""
 me=o.data;tex=next(n for n in me.materials[0].node_tree.nodes if n.type=='TEX_IMAGE');u0,u1,_,_=content_box(tex.image)
 uv=np.zeros(len(me.loops)*2);me.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,2)
 vi=np.zeros(len(me.loops),int);me.loops.foreach_get('vertex_index',vi);k=np.polyfit(uv[:,0],world_verts(o)[vi,0],1)
 return tuple(sorted((float(np.polyval(k,u0)),float(np.polyval(k,u1)))))
def refit_decal(o,box,side,s,image=None,off=.003,surfaces=None):
 """Rebuilds sticker o over box=(x_front,x_rear,z_bottom,z_top) on the outer skin (Lateral and stripe), its image's
 visible part spanning the box. With image the material shows that image instead (full frame = content). Without
 it, the mesh reaches 4 texels past the visible part on every side (within the image), so no letter touches the
 mesh's border."""
 me=o.data;mat=me.materials[0];tex=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE')
 if image is not None:
  old=tex.image;tex.image=image;u0,u1,v0,v1=0.,1.,0.,1.;e=(0.,0.,0.,0.)
  if old.users==0:bpy.data.images.remove(old)
 else:
  u0,u1,v0,v1=content_box(tex.image);w,h=tex.image.size
  e=(min(4/w,u0),min(4/w,1-u1),min(4/h,v0),min(4/h,1-v1))
 # which way u runs along the car (V05 decals: u grows toward the tail on the driver side)
 uv=np.zeros(len(me.loops)*2);me.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,2)
 vi=np.zeros(len(me.loops),int);me.loops.foreach_get('vertex_index',vi);X=world_verts(o)[vi,0]
 back=np.polyfit(uv[:,0],X,1)[0]<0
 xa,xb=(box[0],box[1]) if back else (box[1],box[0])
 kx=(xb-xa)/(u1-u0);kz=(box[3]-box[2])/(v1-v0)
 xa,xb=xa-kx*e[0],xb+kx*e[1];za,zb=box[2]-kz*e[2],box[3]+kz*e[3];u0,u1,v0,v1=u0-e[0],u1+e[1],v0-e[2],v1+e[3]
 T=bvh(surfaces or [bpy.data.objects['Lateral_'+side],bpy.data.objects['Faixa_'+side]])
 nu,nv=41,21;V=[];UV=[];last=None
 for i in range(nu):
  for j in range(nv):
   u=u0+(u1-u0)*i/(nu-1);v=v0+(v1-v0)*j/(nv-1);x=xa+(xb-xa)*i/(nu-1);z=za+(zb-za)*j/(nv-1)
   h=T.ray_cast(Vector((x,s*1.5,z)),Vector((0,-s,0)))
   y=h[0].y+s*off if h[0] is not None else (last if last is not None else s*.88)
   last=y;V.append((x,y,z));UV.append((u,v))
 name=o.name;coll=o.users_collection[0].name;remove(o)
 return new_mesh(name,V,grid_faces(nu,nv),mat,coll,uv=UV,smooth=40,outward=(0,s,0))

# Boxes measured on carro_5 (hub-aligned): x front, x rear, z bottom, z top.
BOX_RR=(-.09,-.59,.40,.79)
BOX_INVENT=(-.713,-1.445,.655,.895)   # kept above the rear arch lip (z .67); the photo has it 4 cm lower
BOX_99=(-1.553,-2.030,.473,.875)
# The names panels of the doors (carro_20, carro_21), OMP livery: each one inside its door with margins, the top line
# right under the stripe (1-2 cm; the stripe's lower edge falls from z 0.81 at the rear to 0.79 at the front), the last
# line 12 cm over the door's bottom edge (the doors run x -0.25..+0.89 at mid height).
# They sit over everything else on the door (0.45 mm out). The Seiva livery's logos on those doors already sit inside
# them (driver x +0.05..+0.86, passenger -0.13..+0.58, as in V05) and are left alone.
BOX_NOMES=(.862,-.222,.33,.786)
def side_stickers():
 O=bpy.data.objects;names_driver=False
 for low,side,s in (('motorista','Motorista',1),('passageiro','Passageiro',-1)):
  o=O[f'Decal_{low}_porta'];x0,x1=content_x(o)
  if x0<BOX_NOMES[1] or x1>BOX_NOMES[0]:refit_decal(o,BOX_NOMES,side,s,off=.0045);names_driver|=s>0
  elif s>0:
   # the Seiva logo is transparent behind x 0.05: its mesh is trimmed there so it does not lie over RR IMPORT
   c=box_cutter('CUT_porta',(-1.,.5,0.),(.02,1.2,1.2));boolean(o,c,'DIFFERENCE');remove(c)
 # With names written over the driver door, RR IMPORT is only the ghost of a peeled-off sticker (carro_21).
 rr=refit_decal(O['Decal_motorista_rr'],BOX_RR,'Motorista',1,texture_rr(ghost=names_driver),off=.0035)
 if names_driver:                               # the ghost has the paint's own sheen, only a shade lighter
  p=next(n for n in rr.data.materials[0].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  p.inputs['Roughness'].default_value=.34;p.inputs['Specular IOR Level'].default_value=.2;p.inputs['Metallic'].default_value=.1
 refit_decal(O['Decal_motorista_invent'],BOX_INVENT,'Motorista',1,texture_invent())
 refit_decal(O['Decal_motorista_99'],BOX_99,'Motorista',1,texture_99())

# ---------------------------------------------------------------- A pillars
# V04's A pillar was a 7 cm vane standing on the windscreen rubber and leaning out and forward, away from the door
# window, twisting further toward the roof (V05's lower roof squeezed its top): from behind it left a 4-5 cm slot
# between the pillar and the window frame. It is rebuilt as a crowned skin from the rubber to the window frame, as on
# carro_3, its edges on the two tubes' centre lines, 3 mm thick.
PILLAR_CROWN,PILLAR_THICK=.006,.003
MOLD_RAIL_TOP=.920                 # the window frame's lower rail goes with the door below this (v06_carroceria)
def ring_centres(o):return world_verts(o).reshape(-1,8,3).mean(1)    # V05 tubes: rings of 8 vertices
def climb(C,seed):
 """Ring centres of a tube up the A pillar, bottom to top: from the ring nearest seed, both ways while each ring
 still climbs (the tube turns flat at the corners: along the cowl or the belt, the header or back over the roof)."""
 n=len(C);i=int(np.argmin(np.linalg.norm(C-seed,axis=1)))
 def walk(d):
  out=[];j=i
  while abs(C[(j+d)%n,2]-C[j,2])>.003:j=(j+d)%n;out.append(j)
  return out
 P=C[walk(-1)[::-1]+[i]+walk(1)];return P if P[0,2]<P[-1,2] else P[::-1]
def resample(P,n):
 L=np.r_[0,np.cumsum(np.linalg.norm(np.diff(P,axis=0),axis=1))];t=np.linspace(0,L[-1],n)
 return np.stack([np.interp(t,L,P[:,k]) for k in range(3)],1)
def a_pillars():
 """Before the doors are cut and the frame loses its rear post (the tubes are still V05's rings)."""
 O=bpy.data.objects;rubber=ring_centres(O['Borracha_parabrisa']);na,nb=48,9
 for side,s in SIDES:
  old=O['Coluna_A_'+side];seed=world_verts(old).mean(0);mat=old.data.materials[0];coll=old.users_collection[0].name
  inner=climb(rubber,seed);outer=climb(ring_centres(O['Moldura_janela_'+side]),seed)
  # the frame from where its tube clears the door's rail (z of the centre one tube radius over the cut)
  z0=MOLD_RAIL_TOP+.013;k=int(np.argmax(outer[:,2]>z0));assert k>0,side;a=outer[k-1];b=outer[k]
  outer=np.vstack([a+(b-a)*(z0-a[2])/(b[2]-a[2]),outer[k:]])
  Ci,Co=resample(inner,na),resample(outer,na)
  T=np.gradient(Ci+Co,axis=0);N=np.cross(T,Co-Ci);N/=np.linalg.norm(N,axis=1)[:,None]
  N*=np.sign(N@np.array((0,s*.6,.8)))[:,None]                         # outward: up, forward and out
  b=np.linspace(0,1,nb);crown=PILLAR_CROWN*4*b*(1-b)
  top=(Ci[:,None]*(1-b)[None,:,None]+Co[:,None]*b[None,:,None]+N[:,None]*crown[None,:,None]).reshape(-1,3)
  V=np.vstack([top,top-np.repeat(N,nb,axis=0)*PILLAR_THICK]);m=na*nb
  F=grid_faces(na,nb)+[tuple(i+m for i in f) for f in grid_faces(na,nb)]
  for i in range(na-1):
   for j in (0,nb-1):F.append((i*nb+j,(i+1)*nb+j,(i+1)*nb+j+m,i*nb+j+m))
  for i in (0,na-1):
   for j in range(nb-1):F.append((i*nb+j,i*nb+j+1,i*nb+j+1+m,i*nb+j+m))
  remove(old);new_mesh('Coluna_A_'+side,V,F,mat,coll,smooth=40)
  print(f'V06 A pillar {side}: {np.linalg.norm(Co-Ci,axis=1).min()*100:.1f}-{np.linalg.norm(Co-Ci,axis=1).max()*100:.1f} cm between the tubes',flush=True)

def build(mats):
 a_pillars();build_greenhouse(mats);side_stickers()
