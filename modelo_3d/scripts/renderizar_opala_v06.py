"""Render the V06 presentation views to modelo_3d/v06_pecas_separadas/renders/*.jpg, framed like the matching photos
in carro/ where one exists, so they can be compared side by side. The .blend is not modified: parts are opened (and
the exploded view spread out) in memory only, through their pivots. Colours use the Khronos PBR Neutral view transform (set
in memory), as in the photos: AgX would wash the yellows out to beige, and Standard blows out the floor and the lit
amber of the turn signals.

Usage, from the project root:
 blender --background modelo_3d/v06_pecas_separadas/opala99_seiva_danilo.blend --python-exit-code 2 --python modelo_3d/scripts/renderizar_opala_v06.py [-- --views a,b --samples 96 --out folder]
The Seiva/Danilo blend writes <view>.jpg; another livery writes <view>_<livery>.jpg.
"""
import bpy,math,os,shutil,subprocess,sys,tempfile,time
from pathlib import Path
from mathutils import Vector,Matrix,Euler
R=Path(__file__).resolve().parents[2]
source=Path(bpy.data.filepath);assert source.name.startswith('opala99_'),'open a V06 opala99_<livery>.blend'
LIVERY=source.stem[len('opala99_'):]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
def arg(name,default):return args[args.index(name)+1] if name in args else default
OUT=Path(arg('--out',R/'modelo_3d/v06_pecas_separadas/renders')).resolve()
SAMPLES=int(arg('--samples',96))
FFMPEG=os.environ.get('FFMPEG') or str(R.parent/'apps/ffmpeg-n9.0-latest-win64-gpl-9.0/ffmpeg-n9.0-latest-win64-gpl-9.0/bin/ffmpeg.exe')
O=bpy.data.objects

# view: camera location, target, lens (mm), parts opened, extra light ('bay','trunk','cabin','under','day' or None), photo
DOORS=('Porta_Motorista_DOBRADICA','Porta_Passageiro_DOBRADICA');ALL=DOORS+('Capo_DOBRADICA','Tampa_porta_malas_DOBRADICA')
VIEWS={
 'fechado_frente':((10.9,5.75,1.25),(.12,0,.52),85,(),None,'carro_1_perspectiva_frente.jpg'),
 'fechado_lateral':((.05,14.,1.35),(.05,0,.58),85,(),None,'carro_5_lateral_completa_longe.jpg'),
 'traseira':((-9.0,1.7,1.9),(-1.2,.05,.60),95,(),None,'carro_22_tanque_caindo.jpg'),
 'aberto_tudo_frente':((6.3,4.9,2.7),(.05,0,.62),38,ALL,'bay',None),
 'aberto_tudo_tras':((-6.2,-4.7,2.6),(-.35,0,.6),38,ALL,'trunk',None),
 'motor_capo_aberto':((2.30,.50,1.50),(1.33,-.10,.44),17,('Capo_DOBRADICA',),'bay','carro_41_motor.JPG'),
 'porta_malas_aberto':((-2.36,.24,1.30),(-1.78,.04,.30),17,('Tampa_porta_malas_DOBRADICA',),'trunk','carro_37_tanque_porta_malas.JPG'),
 'porta_motorista_aberta':((-1.05,2.25,1.18),(.45,.95,.55),26,('Porta_Motorista_DOBRADICA',),'cabin',None),
 'interior_pela_porta':((.02,1.42,1.02),(.36,.12,.66),22,('Porta_Motorista_DOBRADICA',),'cabin',None),
 # the onboard GoPro of carro_14: low (0.95 m) beside the driver, as the game's 'frente' photo pose
 'interior_frente':((-.12,-.20,.95),(.876,-.15,.87),13.6,(),'day','carro_14_interna.JPG'),
 'explodida':((6.5,5.5,3.5),(.15,0,.78),34,DOORS+('Tampa_porta_malas_DOBRADICA',),'bay',None),
 'por_baixo':((.2,1.7,-2.5),(-.1,0,.2),20,(),'under',None),
 'frente_capo':((4.0,.05,1.55),(1.6,0,.62),28,(),None,'carro_23_capo_omp_melhor.JPG')}
# The Seiva blend renders the full set; the OMP livery (hood of carro_23) only the front views.
DEFAULT=[v for v in VIEWS if v!='frente_capo'] if LIVERY=='seiva_danilo' else ['fechado_frente','frente_capo','aberto_tudo_frente','motor_capo_aberto']
views=arg('--views',','.join(DEFAULT)).split(',')

def gpu():
 sc=bpy.context.scene;sc.render.engine='CYCLES'
 prefs=bpy.context.preferences.addons['cycles'].preferences
 for kind in ('OPTIX','CUDA'):
  try:
   prefs.compute_device_type=kind;prefs.get_devices()
   if any(d.type==kind for d in prefs.devices):
    for d in prefs.devices:d.use=d.type==kind
    sc.cycles.device='GPU';break
  except TypeError:continue
 sc.cycles.samples=SAMPLES;sc.cycles.use_denoising=True;sc.cycles.use_adaptive_sampling=True
 sc.render.resolution_x=1280;sc.render.resolution_y=840;sc.render.resolution_percentage=100
 sc.render.image_settings.file_format='PNG';sc.render.film_transparent=False
 # Khronos PBR Neutral view transform, no look (in memory only): these renders are compared with the photos. AgX
 # washes the yellow stripe and stickers out to beige; Standard keeps the yellows but blows out the floor and clips
 # strongly lit amber to lemon. PBR Neutral keeps all three.
 sc.view_settings.view_transform='Khronos PBR Neutral';sc.view_settings.look='None'

def set_open(names,f=1.):
 for o in O:
  if o.type=='EMPTY' and 'angulo_aberto_graus' in o and o.get('eixo_local'):
   r=[0.,0.,0.]
   if o.name in names:r['XYZ'.index(o['eixo_local'])]=math.radians(o['angulo_aberto_graus']*f)
   o.rotation_euler=r

MOVED={}
def explode(on):
 """Exploded view: every separable part slides away from the body along a readable direction."""
 plan={'Porta_Motorista_DOBRADICA':(0,.85,0),'Porta_Passageiro_DOBRADICA':(0,-.85,0),'Capo_DOBRADICA':(0,0,1.0),
  'Tampa_porta_malas_DOBRADICA':(-.4,0,.75),'Motor_CONJUNTO':(1.55,0,.75),'Tanque_combustivel_CONJUNTO':(-1.4,0,.45),
  'Saia_dianteira_PIVO':(.28,0,-.26),'Tampa_bocal_1_DOBRADICA':(0,-.3,0),'Tampa_bocal_2_DOBRADICA':(0,-.3,0)}
 for n,d in plan.items():
  o=O.get(n)
  if o is None:continue
  if on:MOVED[n]=o.location.copy();o.location=o.location+Vector(d)
  elif n in MOVED:o.location=MOVED[n]

LIGHTS=[]
def extra_light(kind):
 for l in LIGHTS:bpy.data.objects.remove(l,do_unlink=True)
 LIGHTS.clear()
 spots={'bay':[((1.5,0,2.1),(1.5,0,.5),130,1.6),((3.2,.8,1.4),(1.5,0,.5),60,1.)],
  'trunk':[((-1.85,0,2.0),(-1.85,0,.4),90,1.4),((-3.2,.4,1.3),(-1.8,0,.5),40,1.)],
  'cabin':[((.1,1.9,1.1),(.2,0,.6),70,.8),((-.2,0,1.25),(-.2,0,.4),40,.9)],'day':[((-.2,0,1.25),(-.2,0,.4),40,.9)],
  'under':[((0,0,-1.2),(0,0,.3),35,2.5)]}.get(kind,[])
 for loc,tgt,power,size in spots:
  d=bpy.data.lights.new('V06_luz','AREA');d.energy=power;d.size=size;o=bpy.data.objects.new('V06_luz',d)
  bpy.context.scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(tgt)-Vector(loc)).to_track_quat('-Z','Y').to_euler();LIGHTS.append(o)

SAVED={}
def daylight(on):
 """Seen from the cabin (carro_14 was shot on track by day): the smoked glass lets the light through and the world
 brightens to a daytime sky. In memory only, restored after the view."""
 sc=bpy.context.scene;bg=sc.world.node_tree.nodes.get('Background') if sc.world else None
 glass={m for o in O if o.type=='MESH' and o.name.startswith(('Para_brisa','Vidro','Vigia')) for m in o.data.materials if m}
 if on:
  for m in glass:
   p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
   if p:SAVED[m.name]=p.inputs['Alpha'].default_value;p.inputs['Alpha'].default_value=.12
  if bg:SAVED['_bg']=(tuple(bg.inputs['Color'].default_value),bg.inputs['Strength'].default_value);bg.inputs['Color'].default_value=(.62,.72,.86,1);bg.inputs['Strength'].default_value=1.4
 else:
  for m in glass:
   p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
   if p and m.name in SAVED:p.inputs['Alpha'].default_value=SAVED.pop(m.name)
  if bg and '_bg' in SAVED:c,s=SAVED.pop('_bg');bg.inputs['Color'].default_value=c;bg.inputs['Strength'].default_value=s

def to_jpg(png,jpg):
 if Path(FFMPEG).is_file():
  subprocess.run([FFMPEG,'-v','error','-y','-i',str(png),'-q:v','3',str(jpg)],check=True)
  if jpg.stat().st_size>500_000:subprocess.run([FFMPEG,'-v','error','-y','-i',str(png),'-q:v','6',str(jpg)],check=True)
 else:
  img=bpy.data.images.load(str(png));img.file_format='JPEG'
  sc=bpy.context.scene;sc.render.image_settings.file_format='JPEG';sc.render.image_settings.quality=90
  img.save_render(str(jpg),scene=sc);sc.render.image_settings.file_format='PNG';bpy.data.images.remove(img)
  strip_jpg(jpg)

def strip_jpg(jpg):
 # Blender's JPEG writer keeps the render's metadata in comment segments, the blend's full path among it: dropped.
 d=jpg.read_bytes();i=2;out=[d[:2]]
 while d[i]==0xFF and d[i+1]!=0xDA:
  n=int.from_bytes(d[i+2:i+4],'big')
  if d[i+1] not in (0xFE,0xE1):out.append(d[i:i+2+n])
  i+=2+n
 jpg.write_bytes(b''.join(out)+d[i:])

def main():
 gpu();OUT.mkdir(parents=True,exist_ok=True);tmp=Path(tempfile.mkdtemp(prefix='opala_v06_render_'))
 sc=bpy.context.scene;cam=bpy.data.objects.new('V06_camera',bpy.data.cameras.new('V06_camera'));sc.collection.objects.link(cam);sc.camera=cam
 floor=O.get('Piso');t0=time.time()
 for v in views:
  loc,tgt,lens,opened,light,photo=VIEWS[v]
  set_open(opened,.4 if v=='explodida' else 1.);explode(v=='explodida');extra_light(light);daylight(light=='day')
  if floor:floor.hide_render=(v=='por_baixo')
  cam.location=loc;cam.data.lens=lens;cam.data.clip_start=.05
  cam.rotation_euler=(Vector(tgt)-Vector(loc)).to_track_quat('-Z','Y').to_euler()
  png=tmp/f'{v}.png';sc.render.filepath=str(png);t=time.time();bpy.ops.render.render(write_still=True)
  name=f'{v}.jpg' if LIVERY=='seiva_danilo' else f'{v}_{LIVERY}.jpg';to_jpg(png,OUT/name)
  explode(False);set_open(())
  print('V06_RENDER',OUT/name,f'{time.time()-t:.1f}s','foto:',photo or '-',flush=True)
 shutil.rmtree(tmp,ignore_errors=True)
 print('V06_RENDERS_DONE',len(views),f'{time.time()-t0:.0f}s',flush=True)
main()
