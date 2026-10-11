"""Build the Opala 99 V06 ("pecas separadas") from a V05 blend: doors, hood, trunk lid and fuel cell as separate parts
on their hinge axes, engine bay with the Chevrolet 250 six, trunk interior, and the game's cockpit interior.

Usage, from the project root (the output defaults to modelo_3d/v06_pecas_separadas/<same name>.blend):
 blender --background modelo_3d/v05_opala_real/opala99_seiva_danilo.blend --python-exit-code 2 --python modelo_3d/scripts/construir_opala_v06.py [-- out.blend]

The interior comes from the game (pista_interlagos/teste/cockpit*.js): exportar_interior_jogo.py exports it to a GLB
with headless Edge; that needs a Python with Playwright, found in OPALA_PLAYWRIGHT_PYTHON or the project's browser-check
venv (%TEMP%\\pwv). Set OPALA_INTERIOR_GLB to reuse an exported GLB instead.
Wheels, their pivots, track and wheelbase are not touched (physics.js depends on them).
"""
import bpy,sys,time
from pathlib import Path
sys.dont_write_bytecode=True          # no __pycache__ next to the scripts
sys.path.insert(0,str(Path(__file__).resolve().parent))
import v06_comum as C
import v06_carroceria as carroceria
import v06_lateral as lateral
import v06_detalhes as detalhes
import v06_motor as motor
import v06_porta_malas as porta_malas
import v06_interior as interior
import v06_vigia as vigia
import v06_retrovisores as retrovisores
import v06_vidros as vidros
R=Path(__file__).resolve().parents[2]
source=Path(bpy.data.filepath);assert source.name.startswith('opala99_'),'open opala99_<livery>.blend before running'
assert 'OPALA_99_ROOT' in bpy.data.objects and 'Capo' in bpy.data.objects,'run on a V05 blend (it still has the one-piece hood)'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
output=Path(args[0]).resolve() if args else R/'modelo_3d/v06_pecas_separadas'/source.name

def materials():
 M=bpy.data.materials;m=C.material
 return {'pintura':M['Pintura_preta'],'aco':M['Disco_aco'],'aco_escuro':M['Metal_escuro'],'cromado':M['Aros_polidos'],
  'aluminio':M['Aluminio_rodas'],'borracha_pneu':M['Pneu_slick_borracha'],'estrutura':M['Chapa_fechamento_V04'],
  # Bare steel painted gloss black inside the doors and the cabin (carro_30, 33-36).
  'interna':m('Chapa_interna_preta',(16,17,19),metal=.15,rough=.3,coat=.6),
  'borracha':m('Borracha_vedacao',(12,12,13),rough=.85),
  'cinza_claro':m('Plastico_cinza_claro',(176,180,184),rough=.45),
  # Satin black of the hood and lid undersides and their inner panels (a gloss underside mirrored the bay).
  'interna_fosca':m('Pintura_preta_interna',(12,13,15),metal=.1,rough=.5)}

def material_signature(m):
 """Principled inputs of a material: numbers for the free ones, the image (or node type) for the linked ones."""
 nt=m.node_tree;p=next((n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'),None) if nt else None
 if p is None:return None
 sig=[]
 for i in p.inputs:
  if i.is_linked:n=i.links[0].from_node;sig.append((i.name,'link',n.image.name if getattr(n,'image',None) else n.bl_idname))
  elif hasattr(i,'default_value'):v=i.default_value;sig.append((i.name,tuple(v) if hasattr(v,'__len__') else (v,)))
 return (m.surface_render_method,tuple(sig))

def merge_materials(keep):
 """Materials the V06 build added (engine, trunk, the game's cockpit) that are identical or nearly so share one:
 same links and images, colours within 0.012 (linear), other values within 0.06. V05's materials are never touched
 (the game looks some of them up by name). Fewer materials = fewer draw calls per car."""
 def close(a,b):
  if a[0]!=b[0] or len(a[1])!=len(b[1]):return False
  for (na,va,*ra),(nb,vb,*rb) in zip(a[1],b[1]):
   if na!=nb or (va=='link')!=(vb=='link'):return False
   if va=='link':
    if ra!=rb:return False
   elif any(abs(x-y)>(.012 if 'Color' in na else .06) for x,y in zip(va,vb)):return False
  return True
 reps=[];remap={}
 for m in sorted(bpy.data.materials,key=lambda m:m.name):
  if m.name in keep or m.users==0:continue
  s=material_signature(m)
  if s is None:continue
  r=next((r for r,rs in reps if close(s,rs)),None)
  if r is None:reps.append((m,s))
  else:remap[m]=r
 for me in bpy.data.meshes:
  for i,m in enumerate(me.materials):
   if m in remap:me.materials[i]=remap[m]
 for m in remap:bpy.data.materials.remove(m)
 print('V06 materials merged',len(remap),'->',len(reps),'kept among the added ones',flush=True)

def structure_finish():
 """The V04 closing panels (bay floor, cabin floor, tunnel, walls, underside) are gloss black like the body in the
 photos (carro_30, 33-36, 41/42); V04's grey satin read as bare primer. Name and the single-material rule stay."""
 m=bpy.data.materials['Chapa_fechamento_V04'];p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 p.inputs['Base Color'].default_value=(.010,.011,.012,1);m.diffuse_color=(.010,.011,.012,1)
 p.inputs['Metallic'].default_value=0.;p.inputs['Roughness'].default_value=.32;p.inputs['Coat Weight'].default_value=.5

def main():
 t0=time.time();v05=set(bpy.data.materials.keys());mats=materials()
 structure_finish()
 vidros.build()                       # windscreen and rear window bent to the roof, cowl and deck (before the A pillars)
 lateral.build(mats)                  # greenhouse and stickers to the photos, before the doors are cut
 vigia.build()                        # quarter-glass stickers and fuel fillers (carro_18, 44, 45), before the cap hinges
 carroceria.build_doors(mats)
 retrovisores.build(mats)             # door mirrors from carro_20/21/23, on the doors' pivots
 carroceria.build_hood(mats);carroceria.hood_pin_posts(mats)
 carroceria.build_lid(mats);carroceria.small_pivots(mats)
 detalhes.build(mats)
 print('V06 body',round(time.time()-t0,1),'s',flush=True)
 motor.build(mats);print('V06 engine',round(time.time()-t0,1),'s',flush=True)
 porta_malas.build(mats);print('V06 trunk',round(time.time()-t0,1),'s',flush=True)
 interior.build(mats);print('V06 interior',round(time.time()-t0,1),'s',flush=True)
 merge_materials(v05)
 # Leftover cutters or temporary meshes must not reach the file.
 for o in [o for o in bpy.data.objects if o.name.startswith(('CUT_','tmp'))]:bpy.data.objects.remove(o,do_unlink=True)
 for me in [me for me in bpy.data.meshes if me.users==0]:bpy.data.meshes.remove(me)
 output.parent.mkdir(parents=True,exist_ok=True);bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(output),copy=True,compress=True)
 print('V06_SAVED',output,round(time.time()-t0,1),'s',flush=True)
main()
