"""Export the Fusca V2 (modelo_3d/fusca_v2, modelled from measurements by criar_fusca_v2.py) to the game GLB.

Usage, from the project root (the output defaults to pista_interlagos/teste/assets/fusca_v2.glb):
 blender --background --factory-startup --python-exit-code 2 --python modelo_3d/scripts/exportar_fusca_jogo.py [-- output.glb]

The car is built again by criar_fusca_v2.py's own functions, at a game resolution: the body's sections and the
lathed parts are coarser, the thin trims lose bevel steps; nothing is decimated. No .blend is opened or changed.
The GLB is in the Opala's frame (main.js): +X forward, +Y up, -Z the driver's (left) side, the tyres on y=0. The
Fusca's 2.40 m wheelbase is centred on the Opala's (physics axles at +1.55 and -1.117 m), so each axle sits about
13 cm inside the physics' contact points. What the game (fusca.js, fusca-cockpit.js) finds by name:
 - Roda_{Dianteira,Traseira}_{Esquerda,Direita}_PIVO: an unrotated empty at each wheel centre (axle along Z) holding
   tyre, wheel, drum, hubcap and trim ring, turned and spun by main.js as the Opala's.
 - Pintura_fusca: the body paint (the team's colour); Paralama_fusca: the four fenders' (the team's second colour, as
   the Copa Fusca's liveries wear it). Fusca_painel: the dash's face toward the driver, painted like the body as a
   Fusca's metal dash is; Pintura_interna_fusca: the bare metal inside, the same colour in satin.
 - Lanterna_fusca: the tail lamps' red lens (lit while braking). Volante_Fusca: the Fusca's own two-spoke wheel,
   hidden in a driven car (the driver brings the race wheel he turns); the column's collar stays.
 - Vidro_fusca: the windows. Espelho_fusca: the door mirrors' glass (the player's show the road behind); the
   mirrors (arms, chrome heads, glass) are nodes of their own, named ..._Retrovisores (they stand out of the body).
 - Espelho_interno_fusca: the rear-view mirror's glass; Mostrador_velocimetro, Mostrador_contagiros: the dials,
   with UVs for the faces the game paints. Nodes with the extra "interno" are the player's only (the rivals drop them).
 - Porta_Motorista_DOBRADICA, Porta_Passageiro_DOBRADICA, Capo_DOBRADICA (the front lid, over the trunk and the tank),
   Tampa_motor_DOBRADICA: unrotated empties on the hinges' axes with the V06 Opala's extras (peca, eixo_gltf,
   angulo_gltf_graus, descricao); each part and what rides on it hang from its empty (fusca_aberturas.py, which cuts
   them out of the body with a panel gap and places each hinge where its part swings clear; car-openings.js turns them).
Changed from the studio model, a Fusca prepared to race: no bumpers, the body 5 cm lower on its wheels
(fusca_cabine.LOWER), the fenders in their own material with a welt along each seam, the door windows reaching
further forward round a slimmer A-pillar (fusca_acabamento.py), its cabin (fusca_cabine.py: dash, door cards, headliner,
cage on the pillars, bucket seat, mirror...), the door mirrors, the windscreen and rear window cut open whole, a yellow plate; the headlamps and indicators glow less (in the studio the 30 W bulbs light
the scene, on track they are off in daylight); the doors, the front lid with the trunk under it and the engine lid open
on hinges (fusca_aberturas.py). Left out: its driver (the game seats its own), scenery, cameras, lights.
"""
import bpy,sys,math,re
from pathlib import Path
from mathutils import Matrix,Vector
R=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(R/'modelo_3d/fusca_v2'));sys.path.insert(0,str(Path(__file__).resolve().parent))
import criar_fusca_v2 as V2,medidas_fusca as MED
# criar_fusca_v2.py: front -Y, Z up, origin at the wheelbase's middle on the ground. Turned +90 degrees about Z (front to
# +X, left to +Y, which glTF makes -Z) and moved forward to the middle of the Opala's wheelbase: axles at x +1.417, -0.983.
OFFSET_X=.2165
TO_GAME=Matrix.Translation((OFFSET_X,0,0))@Matrix.Rotation(math.radians(90),4,'Z')
# Everything but the wheels comes down by fusca_cabine.LOWER (a race Fusca is lowered: the tyres fill the arches); the
# wheel arches' dark liners come down less, so the tyres' tops stay under them.
LINER=re.compile(r'^Caixa_roda_')
def to_game(o):
 if WHEEL.match(o.name):return TO_GAME
 return Matrix.Translation((0,0,-CABIN.LOWER+(LINER_LIFT if LINER.match(o.name) else 0)))@TO_GAME
LINER_LIFT=.045
# Game resolution: body sections along and round the car (the studio model has 300 x 192), lathed parts' segments
# (up to 96), the step between the points of the trims round the windows (1.5 cm) and the trims' bevel steps (none
# for the hair-thin panel gaps and louvres).
SECTIONS,RING=170,112
LATHE=36
TRIM_STEP=.03
TRIM_BEVEL,THIN=1,.005
EMISSION={'Farol_Luz':.8,'Farol_Disco':0,'Seta_Ambar':.4}
RENAME={'Tinta_Azul':'Pintura_fusca','Lanterna':'Lanterna_fusca','Vidro':'Vidro_fusca'}
WHEEL=re.compile(r'^(Pneu|Roda|Tambor|Calota|Aro_roda)_([ED])_([+-]1\.2)$')
# criar_fusca_v2.py's cabin (box seats, dash, wheel, column and its driver): fusca_cabine.py builds this one's.
STUDIO_CABIN=re.compile(r'^(Piso|Banco_-?1|Encosto_-?1|Banco_tras|Encosto_tras|Painel|Volante|Volante_raio|Coluna|Piloto_.*)$')

lathe,dense=V2.revolucao,V2.densificar
V2.revolucao=lambda nome,perfil,cx,cy,cz,seg,mat,sinal=1,suave=True:lathe(nome,perfil,cx,cy,cz,min(seg,LATHE),mat,sinal,suave)
V2.densificar=lambda pts,passo=.02,fechar=True:dense(pts,max(passo,TRIM_STEP),fechar)
import fusca_cabine as CABIN,fusca_acabamento as FINISH,fusca_aberturas as OPEN
# The body with a rounded nose (fusca_acabamento.py RoundNose) in place of the studio's flat front.
V2.Carroceria,V2.Y_NARIZ=FINISH.RoundNose,FINISH.NOSE_Y
# The headlamps leaning back into the fenders, near flush with them (fusca_acabamento.py construir_farois).
V2.construir_farois=FINISH.construir_farois
# The door windows reaching further forward, round a slimmer A-pillar (fusca_acabamento.py door_window).
MED.JAN_PORTA=FINISH.DOOR_WINDOW

def build():
 """The game's Fusca in an empty scene, in criar_fusca_v2.py's frame (collection Fusca_v2). Returns (body, sup, mats)."""
 bpy.ops.wm.read_factory_settings(use_empty=True)
 mats=V2.criar_materiais()
 V2.usar_colecao('Fusca_v2')
 car,body=V2.construir_carroceria(mats,SECTIONS,RING)
 # The closed skin as built, before it is cut and hollowed: the trunk is the space inside it (fusca_aberturas.trunk).
 cavity=body.data.copy()
 # The fenders' seams cut into the skin before it is hollowed (fusca_acabamento.py fenders; race_prep paints them).
 seams=FINISH.fenders(car,body)
 sup=V2.construir_tudo(car,body,mats)['sup']
 # criar_fusca_v2.py cuts the windscreen and the rear window with a slab between their outlines' points only: the
 # roof's dome rises out of it across the rear window, and 40% of that opening (its middle) stays shut behind the
 # glass (the studio renders hide it under reflections; in the game the paint shows through the glass). A prism
 # straight down through each measured outline, from above the roof to 8 cm under the glass, opens them whole.
 def open_window(outline,depth=.08):
  ring=V2.densificar(outline,.02,True);low=min(sup.topo(x,y)[0].z for x,y in ring)-depth;n=len(ring);V,F=[],[]
  V.extend((x,y,low) for x,y in ring);V.extend((x,y,2.5) for x,y in ring)
  for a,b,c in V2.triangular(ring):F.append((a,c,b));F.append((n+a,n+b,n+c))
  F.extend((i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n))
  V2.subtrair(body,V,F)
 for outline in (MED.PLANTA_PARABRISA,MED.PLANTA_VIDRO_TRAS):open_window(outline)
 # The side windows the same way, with prisms straight across the car through their outlines: criar_fusca_v2.py's
 # slabs follow the surface's normals, which tilt at the windows' front edges, and leave saw-toothed wedges of the
 # inner skin standing in the opening (the cockpit camera sees them against the sky).
 V,F=[],[]
 for poly in (MED.JAN_PORTA,MED.JAN_QUARTO):
  ring=V2.densificar(poly,.02,True)
  for x0,x1 in ((.45,1.1),(-1.1,-.45)):V2.prisma_yz(ring,x0,x1,V,F)
 V2.subtrair(body,V,F)
 # The parts that open cut out as their own objects, a gap round each (fusca_aberturas.py): both doors, the front
 # lid, the engine lid (race_prep props it open).
 parts=OPEN.cut_all(sup,body,mats);lid=parts['tampa']
 # The body's 4th slot (the floor's inner faces, the dark interior in criar_fusca_v2.py) comes out of its booleans
 # empty, and an empty slot exports without a material (three.js draws it white): the dark interior again.
 for i,m in enumerate(body.data.materials):
  if m is None:body.data.materials[i]=mats['interior']
 # Every window open: rays through points inside each outline (85%) must pass the uncut body's surface.
 def shut(outline,side):
  import numpy as np
  from mathutils.bvhtree import BVHTree
  V,F=OPEN.world_mesh([body]+[parts[k] for k in (1,-1,'capo','tampa')]);bvh=BVHTree.FromPolygons(V,F);P=np.array(outline);lo,hi=P.min(0),P.max(0)
  pts=[(a,b) for a in np.linspace(lo[0],hi[0],25) for b in np.linspace(lo[1],hi[1],25)];pts=[p for p,k in zip(pts,V2.dentro_poligono(np.array(pts),V2.escalar_poligono(outline,.85))) if k];closed=0
  for a,b in pts:
   s,_=sup.lado(a,b,1.0) if side else sup.topo(a,b);h,*_=bvh.ray_cast(Vector((3,a,b)),Vector((-1,0,0)),6) if side else bvh.ray_cast(Vector((a,b,3.5)),Vector((0,0,-1)),7)
   closed+=bool(s and h and (s-h).length<.03)
  return closed/len(pts)
 for name,outline,side in (('para-brisa',MED.PLANTA_PARABRISA,False),('vidro traseiro',MED.PLANTA_VIDRO_TRAS,False),('porta',MED.JAN_PORTA,True),('lateral traseira',MED.JAN_QUARTO,True)):
  left=shut(outline,side);print('JANELA_FECHADA',name,round(left,3),flush=True);assert left<.02,(name,left)
 # The studio's cabin out, the race cabin and the finish outside in.
 for o in [o for o in bpy.data.collections['Fusca_v2'].objects if STUDIO_CABIN.match(o.name)]:bpy.data.objects.remove(o)
 painted=mats['tinta'].copy();painted.name='Fusca_painel'
 CABIN.build(sup,body,mats);FINISH.build(sup,body,mats)
 # Prepared to race: no bumpers, the fenders in their own material with a welt along each seam (fusca_acabamento.py).
 FINISH.race_prep(car,body,seams,mats,sup,lid)
 # A dull yellow plate, as Brazil's were (the .blend's light grey glares in the game's sun).
 mats['placa'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.3,.26,.07,1)
 # The parts' insides, the trunk under the front lid, each part on a hinge where it swings clear (fusca_aberturas.py).
 OPEN.build(sup,body,mats,parts,cavity)
 bpy.context.view_layer.update()
 return body,sup,mats

def export(output):
 scene=bpy.context.scene
 parts=[o for o in bpy.data.collections['Fusca_v2'].objects if o.type in ('MESH','CURVE')]
 # Materials: names the game knows.
 for m in bpy.data.materials:
  if m.name in RENAME:m.name=RENAME[m.name]
  b=m.node_tree.nodes.get('Principled BSDF') if m.node_tree else None
  if b and m.name in EMISSION:b.inputs['Emission Strength'].default_value=EMISSION[m.name]
 def evaluated(o):
  """The object's mesh as shown, in game coordinates (UVs only where the game paints a face: the 'uv' flag)."""
  if o.type=='CURVE':o.data.bevel_resolution=0 if o.data.bevel_depth<THIN else min(o.data.bevel_resolution,TRIM_BEVEL)
  dg=bpy.context.evaluated_depsgraph_get();me=bpy.data.meshes.new_from_object(o.evaluated_get(dg),depsgraph=dg);me.validate()
  if not o.get('uv'):
   for uv in list(me.uv_layers):me.uv_layers.remove(uv)
  # A material in two slots (the body's inner faces, criar_fusca_v2.py) goes in one: one primitive per material.
  first={}
  for i,m in enumerate(me.materials):first.setdefault(m,i)
  for p in me.polygons:p.material_index=first[me.materials[p.material_index]]
  me.transform(to_game(o)@o.matrix_world);return me
 temporary=bpy.data.collections.new('EXPORTAR_FUSCA');scene.collection.children.link(temporary)
 def place(name,me,parent=None,offset=Vector(),source=None):
  me.transform(Matrix.Translation(-offset));o=bpy.data.objects.new(name,me);temporary.objects.link(o);o.parent=parent
  for key in ('interno','uv','grupo'):
   if source is not None and source.get(key):o[key]=source[key]
  return o
 root=bpy.data.objects.new('FUSCA_ROOT',None);temporary.objects.link(root)
 root['entre_eixos_m']=2.4;root['deslocamento_x_m']=OFFSET_X;root['rebaixado_m']=CABIN.LOWER;root['origem']='Fusca V2: modelado do zero a partir de medidas (modelo_3d/fusca_v2)'
 # Wheels: each one's parts on an empty at its centre (V2.BITOLA across, V2.EIXO_F/T along, fusca_acabamento.WHEEL_R up).
 pivots={}
 for side,name in (('E','Esquerda'),('D','Direita')):
  for axle,front in (('-1.2',True),('+1.2',False)):
   s=1 if side=='E' else -1;at=TO_GAME@Vector((s*V2.BITOLA,float(axle),FINISH.WHEEL_R))
   p=bpy.data.objects.new(f'Roda_{"Dianteira" if front else "Traseira"}_{name}_PIVO',None);temporary.objects.link(p);p.parent=root;p.location=at;pivots[(side,axle)]=p
 # The parts that open (fusca_aberturas.py): an unrotated empty on each hinge's axis carrying the opening as glTF extras
 # (the V06 Opala's API: car-openings.js turns it); what rides on a part hangs from its empty.
 hinges={}
 for name,h in OPEN.HINGES.items():
  e=bpy.data.objects.new(name,None);temporary.objects.link(e);e.parent=root;e.location=Matrix.Translation((0,0,-CABIN.LOWER))@TO_GAME@h['at']
  a=TO_GAME.to_3x3()@h['axis']
  e['peca']=h['peca'];e['eixo_gltf']=[round(a.x,6),round(a.z,6),round(-a.y,6)];e['angulo_gltf_graus']=h['angulo'];e['descricao']=h['descricao'];hinges[name]=e
 steering=[]
 for o in parts:
  w=WHEEL.match(o.name)
  if w:place('roda_'+w.group(1),evaluated(o),pivots[(w.group(2),w.group(3))],pivots[(w.group(2),w.group(3))].location);continue
  hinge=hinges.get(o.get('dobradica',''))
  if hinge:place(o.name,evaluated(o),hinge,hinge.location,source=o);continue
  if o.name.startswith('Volante'):steering.append(place('volante_'+o.name,evaluated(o),root));continue
  place(o.name,evaluated(o),root,source=o)
 assert all(len(p.children)==5 for p in pivots.values()),{p.name:len(p.children) for p in pivots.values()}
 assert len(steering)>=2,len(steering)
 bpy.ops.object.select_all(action='DESELECT')
 for o in steering:o.select_set(True)
 bpy.context.view_layer.objects.active=steering[0];bpy.ops.object.join();wheel=bpy.context.object;wheel.name='Volante_Fusca'
 # One mesh per parent, material set and flags (the wheel pivots keep theirs; the steering wheel stays apart).
 groups={}
 for o in list(temporary.objects):
  if o.type=='MESH' and o.name!='Volante_Fusca':groups.setdefault((o.parent.name,tuple(m.name if m else '' for m in o.data.materials),bool(o.get('interno')),bool(o.get('uv')),o.get('grupo','')),[]).append(o)
 for (parent,names,inside,uv,group),objects in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0]
  if len(objects)>1:bpy.ops.object.join()
  joined=bpy.context.object;joined.name='GLB_'+parent+'_'+'_'.join(names)+('_interno' if inside else '')+('_'+group if group else '')
  for key in ('interno','uv','grupo'):
   if key in joined:del joined[key]
  if inside:joined['interno']=True
 bpy.ops.object.select_all(action='DESELECT')
 for o in temporary.objects:o.select_set(True)
 output.parent.mkdir(parents=True,exist_ok=True)
 bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_animations=False,
  export_cameras=False,export_lights=False,export_texcoords=True,export_tangents=False)

 # The game finds wheels, paint, dash, lamps, mirrors, dials and the steering wheel by these names.
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(output))
 imported=next(o for o in bpy.data.objects if o.name.startswith('FUSCA_ROOT'))
 found=[o for o in imported.children_recursive if o.type=='EMPTY' and o.name.startswith('Roda_') and '_PIVO' in o.name]
 assert len(found)==4 and sum('Dianteira' in o.name for o in found)==2,[o.name for o in found]
 assert all(o.rotation_quaternion.angle<1e-6 for o in found),'pivos girados'
 # Each hinge with its opening and the parts on it, shut (unrotated) as the game's copies expect (car-openings.js).
 opened={o.name:o for o in imported.children_recursive if o.type=='EMPTY' and o.get('peca')}
 assert sorted(opened)==sorted(OPEN.HINGES),sorted(opened)
 for name,o in opened.items():
  assert o.rotation_quaternion.angle<1e-6 and len(o['eixo_gltf'])==3 and o['angulo_gltf_graus'],name
  assert any(c.type=='MESH' and any(m and m.name=='Pintura_fusca' for m in c.data.materials) for c in o.children_recursive),('dobradica sem lataria',name)
 print('FUSCA_DOBRADICAS',', '.join(f'{n} {tuple(round(v,3) for v in o.matrix_world.translation)} eixo {tuple(o["eixo_gltf"])} {o["angulo_gltf_graus"]:.0f} graus' for n,o in sorted(opened.items())),flush=True)
 meshes=[o for o in imported.children_recursive if o.type=='MESH']
 assert all(m for o in meshes for m in o.data.materials),'malha sem material'
 materials={m.name for o in meshes for m in o.data.materials if m}
 missing={'Placa','Pintura_fusca','Paralama_fusca','Fusca_painel','Pintura_interna_fusca','Forro_teto','Lanterna_fusca','Vidro_fusca','Espelho_fusca','Espelho_interno_fusca','Mostrador_velocimetro','Mostrador_contagiros'}-materials;assert not missing,missing
 for name in ('Espelho_interno_fusca','Mostrador_velocimetro','Mostrador_contagiros','Placa'):
  assert all(o.data.uv_layers for o in meshes if any(m and m.name==name for m in o.data.materials)),'sem UV: '+name
 assert any(o.get('interno') for o in imported.children_recursive),'nada marcado interno'
 assert any(o.name.startswith('Volante_Fusca') for o in imported.children_recursive),'volante'
 triangles=sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons)
 inside=sum(len(p.vertices)-2 for o in meshes if o.get('interno') or (o.parent and o.parent.get('interno')) for p in o.data.polygons)
 dims=[max(v)-min(v) for v in zip(*[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box])]
 print('FUSCA_PIVOS',', '.join(f'{o.name} {tuple(round(v,3) for v in o.matrix_world.translation)}' for o in sorted(found,key=lambda o:o.name)),flush=True)
 print('FUSCA_MEDIDAS_BLENDER_XYZ',[round(d,3) for d in dims],'triangulos',triangles,'so_do_jogador',inside,'materiais',len(materials),'malhas',len(meshes),flush=True)
 print('GLB_EXPORTED',output,round(output.stat().st_size/2**20,2),'MiB',flush=True)

if __name__=='__main__':
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
 build();export(Path(args[0]).resolve() if args else R/'pista_interlagos/teste/assets/fusca_v2.glb')
