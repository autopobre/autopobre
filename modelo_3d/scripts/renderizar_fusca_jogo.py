"""Preview renders of the game's Fusca GLB (exportar_fusca_jogo.py) in Blender: the cockpit camera's views and the car
outside, painted in a team's colour, plus a mosaic of them all.

Usage, from the project root:
 blender --background --factory-startup --python modelo_3d/scripts/renderizar_fusca_jogo.py -- [glb] [out_dir] [--cor RRGGBB] [--cor2 RRGGBB] [--so vista,vista] [--amostras N] [--esconder parte,parte] [--abrir F]
Defaults: pista_interlagos/teste/assets/fusca_v2.glb, modelo_3d/fusca_v2/previas/jogo/blender (gitignored), the #73's orange
with white fenders (--cor2: the fenders' colour, the team's second one).
--abrir F opens every hinged part (doors, front lid, engine lid: fusca_aberturas.py) by the fraction F of its opening, as
the game's car-openings.js turns them; --abrir porta=1,capo=.5 opens only those (by the hinges' peca).
The cockpit views put the camera where the game's does (main.js: cockpit.js eye plus fusca.js FUSCA_EYE, vertical
field of view 74 degrees, 16:10), without the driver; EEVEE, a sun from the game's late afternoon and a plain sky.
"""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector,Euler,Quaternion
R=Path(__file__).resolve().parents[2]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
flags={a:args[i+1] for i,a in enumerate(args) if a.startswith('--') and i+1<len(args)}
plain=[a for i,a in enumerate(args) if not a.startswith('--') and not (i and args[i-1].startswith('--'))]
# Relative paths from where blender was started (Blender would take them from the drive's root).
GLB=Path(plain[0]).resolve() if plain else R/'pista_interlagos/teste/assets/fusca_v2.glb'
OUT=Path(plain[1]).resolve() if len(plain)>1 else R/'modelo_3d/fusca_v2/previas/jogo/blender'
HIDE=[h for h in flags.get('--esconder','').split(',') if h];OPEN=flags.get('--abrir','');COLOR=flags.get('--cor','f07a2a');COLOR2=flags.get('--cor2','f2f0ea');ONLY=set(flags['--so'].split(',')) if '--so' in flags else None;SAMPLES=int(flags.get('--amostras','32'))
# Game frame (x forward, y up, z the passenger's side) -> Blender after the glTF import (x, -z, y).
G=lambda x,y,z:Vector((x,-z,y))
EYE=(.057,1.01,.015)
# name: (eye in the game frame, yaw (positive toward the passenger), pitch, vertical fov)
VIEWS={
 'interna':(EYE,0,-.01,74),
 'interna_esquerda':(EYE,-.9,-.1,74),
 'interna_direita':(EYE,.9,-.1,74),
 'interna_painel':(EYE,-.35,-.42,60),
 'interna_baixo':(EYE,0,-.75,74),
 'interna_tras':((EYE[0]-.05,EYE[1],EYE[2]),math.pi,-.12,74),
 'porta_aberta':((.15,1.05,1.25),-math.pi+.35,-.25,55),
 'carona':((.0,1.05,.45),-.75,-.28,70),
}
OUTSIDE={'frente34':((4.6,1.25,-3.4),(.2,.65,0),30),'tras34':((-4.4,1.5,3.6),(-.2,.7,0),30),'lado':((.2,.9,-6.5),(.2,.7,0),26),
 'banco':((.42,1.12,.5),(-.15,.72,-.28),62),'nariz':((3.3,.85,-1.55),(1.9,.6,-.1),28),'nariz_lado':((2.2,.7,-2.6),(1.85,.62,-.2),26),'nariz_frente':((4.6,.75,0),(1.9,.6,0),24),'nariz_cima':((2.9,2.0,-.9),(1.8,.62,0),30),'nariz_perto':((2.75,.78,-.95),(1.9,.62,-.25),34),'cima':((1.2,4.6,-2.2),(.1,.6,0),32),'retrovisor':((1.15,1.25,-1.35),(.7,1.06,-.72),30),'traseira':((-5.2,1.1,0),(-.2,.7,0),26),
 # The parts that open (with --abrir): the car opened from the front quarter, the driver's door, its front edge and the
 # opening behind it, the trunk under the front lid, the engine lid lifted and the engine under it.
 'aberto_34':((3.9,1.9,-3.6),(.2,.6,0),34),'porta_aberta':((-1.4,1.35,-2.9),(.45,.7,-.75),42),'porta_frente':((1.9,1.0,-2.0),(.7,.62,-.75),36),
 'vao_porta':((.05,1.1,-2.3),(.3,.62,-.3),46),'porta_malas':((2.75,2.05,-.25),(1.2,.42,0),40),'capo_aberto':((3.6,1.25,-1.6),(1.3,.75,0),38),
 'tampa_aberta':((-3.7,1.9,1.4),(-1.3,.75,0),36),'motor':((-2.75,1.75,.35),(-1.45,.45,0),40),
 'quina_capo':((1.55,1.05,-1.75),(.86,.68,-.58),20),'pe_tampa':((-2.6,1.0,-.9),(-1.75,.45,-.1),26)}

def setup():
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(GLB))
 scene=bpy.context.scene
 for engine in ('BLENDER_EEVEE','BLENDER_EEVEE_NEXT'):
  try:scene.render.engine=engine;break
  except TypeError:pass
 try:scene.eevee.taa_render_samples=SAMPLES
 except AttributeError:pass
 scene.render.resolution_x,scene.render.resolution_y=1440,900;scene.render.film_transparent=False
 scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
 world=bpy.data.worlds.new('Ceu');scene.world=world;world.use_nodes=True;bg=world.node_tree.nodes['Background']
 sky=world.node_tree.nodes.new('ShaderNodeTexGradient');coords=world.node_tree.nodes.new('ShaderNodeTexCoord');ramp=world.node_tree.nodes.new('ShaderNodeValToRGB')
 sep=world.node_tree.nodes.new('ShaderNodeSeparateXYZ');world.node_tree.links.new(coords.outputs['Generated'],sep.inputs[0])
 world.node_tree.links.new(sep.outputs['Z'],ramp.inputs[0]);world.node_tree.links.new(ramp.outputs[0],bg.inputs[0])
 ramp.color_ramp.elements[0].position=.48;ramp.color_ramp.elements[0].color=(.32,.3,.27,1);ramp.color_ramp.elements[1].position=.62;ramp.color_ramp.elements[1].color=(.55,.68,.88,1)
 bg.inputs[1].default_value=1.0
 sun=bpy.data.objects.new('Sol',bpy.data.lights.new('Sol','SUN'));sun.data.energy=4.2;sun.data.angle=math.radians(1.5);sun.data.color=(1,.9,.78)
 sun.rotation_euler=Euler((math.radians(55),0,math.radians(140)));scene.collection.objects.link(sun)
 bpy.ops.mesh.primitive_plane_add(size=60,location=(0,0,0));ground=bpy.context.object
 gm=bpy.data.materials.new('Asfalto');gm.use_nodes=True;gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.07,.07,.075,1);gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85;ground.data.materials.append(gm)
 lin=lambda c:c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4;rgb=lambda h:tuple(lin(int(h[i:i+2],16)/255) for i in (0,2,4))
 for m in bpy.data.materials:
  if m.name.split('.')[0] in ('Pintura_fusca','Fusca_painel','Pintura_interna_fusca'):
   m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*rgb(COLOR),1)
  elif m.name.split('.')[0]=='Paralama_fusca':m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*rgb(COLOR2),1)
 # Glass as the game draws it (main.js, fusca.js prepareFusca): plain see-through, no refraction.
 for m in bpy.data.materials:
  if m.name.split('.')[0] in ('Vidro_fusca','Vidro_farol') and m.node_tree:
   p=m.node_tree.nodes['Principled BSDF'];p.inputs['Transmission Weight'].default_value=0;p.inputs['Alpha'].default_value=.3 if m.name.startswith('Vidro_fusca') else .2
   p.inputs['Base Color'].default_value=(.1,.13,.15,1) if m.name.startswith('Vidro_fusca') else (.9,.9,.9,1);p.inputs['Roughness'].default_value=.03
   try:m.surface_render_method='BLENDED'
   except AttributeError:m.blend_method='BLEND'
 # The Fusca's own wheel shows only on the car screen: hidden in the cockpit, as in a driven car (--esconder: more).
 for o in bpy.data.objects:
  if o.name.startswith('Volante_Fusca') or any(h in o.name for h in HIDE):o.hide_render=True
 cam=bpy.data.objects.new('Camera',bpy.data.cameras.new('Camera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.sensor_fit='VERTICAL';cam.data.clip_start=.02
 # The hinged parts opened as car-openings.js turns them: about eixo_gltf by angulo_gltf_graus times the fraction (the
 # same smoothstep as the game's), from rest (the GLB's empties are unrotated).
 if OPEN:
  share={k:float(v) for k,v in (kv.split('=') for kv in OPEN.split(',') if '=' in kv)};whole=None if share else float(OPEN)
  for o in bpy.data.objects:
   if o.type!='EMPTY' or 'eixo_gltf' not in o:continue
   t=whole if whole is not None else share.get(o.get('peca'),0.);t=t*t*(3-2*t);a=list(o['eixo_gltf'])
   o.rotation_mode='QUATERNION';o.rotation_quaternion=Quaternion(Vector((a[0],-a[2],a[1])),math.radians(o['angulo_gltf_graus']*t))
 return scene,cam

def shoot(scene,cam,name,eye,target=None,yaw=0,pitch=0,fov=74):
 cam.location=G(*eye);cam.data.angle=math.radians(fov)
 if target is not None:look=(G(*target)-cam.location).normalized()
 else:look=Vector((math.cos(pitch)*math.cos(yaw),-math.cos(pitch)*math.sin(yaw),math.sin(pitch)))
 cam.rotation_euler=look.to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(OUT/f'{name}.png');bpy.ops.render.render(write_still=True);return OUT/f'{name}.png'

def mosaic(files,path,cols=3,width=720):
 import numpy as np
 tiles=[]
 for f in files:
  im=bpy.data.images.load(str(f));w,h=im.size;px=np.array(im.pixels[:],dtype=np.float32).reshape(h,w,4)
  step=w/width;rows=(np.arange(int(h/step))*step).astype(int);colsx=(np.arange(width)*step).astype(int);tiles.append(px[rows][:,colsx]);bpy.data.images.remove(im)
 th=tiles[0].shape[0];n=len(tiles);rws=(n+cols-1)//cols;canvas=np.ones((rws*th,cols*width,4),np.float32)
 for i,t in enumerate(tiles):
  r=rws-1-i//cols;c=i%cols;canvas[r*th:(r+1)*th,c*width:(c+1)*width]=t
 out=bpy.data.images.new('mosaico',cols*width,rws*th);out.pixels=canvas.ravel().tolist();out.filepath_raw=str(path);out.file_format='JPEG';out.save()

OUT.mkdir(parents=True,exist_ok=True)
scene,cam=setup();files=[]
for name,(eye,yaw,pitch,fov) in VIEWS.items():
 if ONLY is None or name in ONLY:files.append(shoot(scene,cam,name,eye,yaw=yaw,pitch=pitch,fov=fov))
for name,(eye,target,fov) in OUTSIDE.items():
 if ONLY is None or name in ONLY:files.append(shoot(scene,cam,name,eye,target,fov=fov))
if len(files)>1:mosaic(files,OUT/'mosaico.jpg')
print('PREVIAS',OUT,len(files),flush=True)
