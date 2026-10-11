"""Check a V06 blend: pivots and their custom properties, what hangs on each pivot, wheels and wheel pivots identical
to V05, every opening part swept to its open angle without touching the body, hinges on their pins and clear of their
panels' frames, closed parts sitting in their openings with a gap, visible seam widths, engine clear of the hood,
interior clear of roof/glass/doors, nothing internal poking through the skin, the static overlaps against the accepted
baseline (v06_sobreposicoes_base.py), the fuel cell 10 mm or more from the rear panel, the cell, its cradle and the
trunk invisible from behind and from below, the cabin floor closed, the window nets' span and straps, side stickers
clear of the door seams, face budget, materials, and a scratch GLB export (with the exporter's own checks) re-imported
to find the pivot nodes and check the glTF opening axes. Exits with code 2 on any failure. GLB sizes are in MiB.

Usage, from the project root (the scratch GLB defaults to the system temp folder, never the game assets):
 blender --background modelo_3d/v06_pecas_separadas/opala99_seiva_danilo.blend --python-exit-code 2 --python modelo_3d/scripts/verificar_opala_v06.py [-- scratch.glb] [--gravar-base]
"""
import bpy,math,subprocess,sys,tempfile
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from v06_comum import world_verts,bvh
R=Path(__file__).resolve().parents[2]
source=Path(bpy.data.filepath);assert source.name.startswith('opala99_'),'open a V06 opala99_<livery>.blend'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
write_base='--gravar-base' in args;args=[a for a in args if a!='--gravar-base']
scratch=Path(args[0]).resolve() if args else Path(tempfile.mkdtemp(prefix='opala_v06_check_'))/(source.stem+'_v06.glb')
assert 'pista_interlagos' not in str(scratch),'never export the check GLB over the game assets'
V05=R/'modelo_3d/v05_opala_real'/source.name
O=bpy.data.objects;root=O['OPALA_99_ROOT'];fails=[];notes=[]
def check(ok,msg):
 (notes if ok else fails).append(('ok  ' if ok else 'FAIL ')+msg)

HINGED={'Porta_Motorista_DOBRADICA':('porta','Z',(-75,-60)),'Porta_Passageiro_DOBRADICA':('porta','Z',(60,75)),
 'Capo_DOBRADICA':('capo','Y',(-60,-45)),'Tampa_porta_malas_DOBRADICA':('porta_malas','Y',(55,75))}
STATIC={'Motor_CONJUNTO':'motor','Tanque_combustivel_CONJUNTO':'tanque_combustivel'}
MUST_HANG={'Porta_Motorista_DOBRADICA':('Porta_Motorista_pele','Porta_Motorista_faixa','Porta_Motorista_estrutura','Carcaca_espelho_Motorista'),
 'Porta_Passageiro_DOBRADICA':('Porta_Passageiro_pele','Porta_Passageiro_faixa','Porta_Passageiro_estrutura','Carcaca_espelho_Passageiro'),
 'Capo_DOBRADICA':('Capo_painel','Decal_capo','Capo_estrutura_interna','Base_trava','Argola_trava'),
 'Tampa_porta_malas_DOBRADICA':('Tampa_porta_malas_painel','Decal_RTJ','Tampa_porta_malas_travas'),
 'Tanque_combustivel_CONJUNTO':('Tanque_combustivel',)}
SKIN={'Porta_Motorista_DOBRADICA':'Porta_Motorista_pele','Porta_Passageiro_DOBRADICA':'Porta_Passageiro_pele',
 'Capo_DOBRADICA':'Capo_painel','Tampa_porta_malas_DOBRADICA':'Tampa_porta_malas_painel'}

def meshes_under(o):return [c for c in o.children_recursive if c.type=='MESH']
def rotate(piv,deg):
 i='XYZ'.index(piv['eixo_local']);r=[0.,0.,0.];r[i]=math.radians(deg);piv.rotation_euler=r;bpy.context.view_layer.update()

# ---------------------------------------------------------------- pivots and properties
pivots={o.name:o for o in root.children_recursive if o.type=='EMPTY' and 'peca' in o}
for name,(peca,eixo,(a0,a1)) in HINGED.items():
 p=pivots.get(name);check(p is not None,f'pivo {name} existe')
 if p is None:continue
 check(p.parent==root,f'{name} filho direto de OPALA_99_ROOT')
 check(p.get('peca')==peca and p.get('eixo_local')==eixo and isinstance(p.get('descricao'),str) and p['descricao'],f'{name} peca/eixo/descricao')
 check(a0<=p.get('angulo_aberto_graus',0)<=a1,f'{name} angulo {p.get("angulo_aberto_graus")} em [{a0},{a1}]')
 check(p.rotation_euler.to_matrix()==Matrix.Identity(3),f'{name} fechado (sem rotacao salva)')
for name,peca in STATIC.items():
 p=pivots.get(name);check(p is not None and p.get('peca')==peca and p.parent==root,f'pivo estatico {name}')
for name,parts in MUST_HANG.items():
 p=pivots.get(name)
 if p is None:continue
 kids={c.name for c in p.children_recursive}
 for n in parts:check(any(k.startswith(n) for k in kids),f'{n} pendurado em {name}')
hood_piv=pivots.get('Capo_DOBRADICA');fl=[o for o in O if o.name.startswith('Trava_capo_dianteira')];st=[o for o in O if o.name.startswith('Trava_capo_batente')]
check(fl and st and all(o.parent==hood_piv for o in fl) and all(o.parent==root for o in st) and O['Pino_trava'].parent==hood_piv and 'Pino_trava.002' not in O,
 'travas dianteiras do capo: placas no capo e batentes nos paralamas (carro_23); pinos traseiros sobem com o capo')
check(O.get('Painel_frontal_superior') is not None and O['Painel_frontal_superior'].parent==root and O['Logo_borda_capo'].parent==root,'painel frontal com o eletric fixo')
engine=meshes_under(pivots['Motor_CONJUNTO']) if 'Motor_CONJUNTO' in pivots else []
check(len(engine)>=5,f'motor com {len(engine)} malhas')

# ---------------------------------------------------------------- wheels identical to V05
WHEEL_PIVOTS={'Roda_Dianteira_E_PIVO':(1.55,.804,.316),'Roda_Dianteira_D_PIVO':(1.55,-.804,.316),'Roda_Traseira_E_PIVO':(-1.117,.804,.316),'Roda_Traseira_D_PIVO':(-1.117,-.804,.316)}
if V05.is_file():
 # Signature of every wheel object (world matrix and world vertices), computed in V05 and here the same way.
 SIG='''import bpy,json,numpy as np
out={}
for n in %r:
 for o in [bpy.data.objects[n]]+list(bpy.data.objects[n].children_recursive):
  W=[list(o.matrix_world@v.co) for v in o.data.vertices] if o.type=='MESH' else []
  out[o.name]=[[round(x,6) for x in r] for r in o.matrix_world]+[len(W),[round(float(x),5) for x in (np.array(W).sum(0) if W else [0,0,0])]]
print('SIG'+json.dumps(out))'''%(list(WHEEL_PIVOTS),)
 def signature(path):
  r=subprocess.run([bpy.app.binary_path,'--background',str(path),'--python-expr',SIG],capture_output=True,text=True)
  import json;return json.loads(next(l for l in r.stdout.splitlines() if l.startswith('SIG'))[3:])
 a=signature(V05);b=signature(source)
 diff=[n for n in a if a[n]!=b.get(n)]+[n for n in b if n not in a]
 check(not diff,f'{len(a)} objetos das rodas identicos a V05'+(f': mudaram {diff[:6]}' if diff else ''))
else:notes.append('--  V05 nao encontrada: rodas comparadas so com as posicoes do physics.js')
for n,p in WHEEL_PIVOTS.items():check((O[n].matrix_world.translation-Vector(p)).length<1e-3 and O[n].parent==root,f'{n} em {p} (physics.js)')

# ---------------------------------------------------------------- opening sweeps
allm=[o for o in root.children_recursive if o.type=='MESH' and len(o.data.polygons)]
skip=lambda o:bool(o.get('ignorar_colisao')) or any(p.get('ignorar_colisao') for p in [o.parent] if p)
worst={}
for name in HINGED:
 piv=pivots.get(name)
 if piv is None:continue
 moving=[o for o in meshes_under(piv) if not skip(o)];ms=set(moving)
 fixed=[o for o in allm if o not in ms and not skip(o)]
 T=bvh(fixed);ang=piv['angulo_aberto_graus'];hits=[]
 for t in (0,.1,.25,.4,.55,.7,.85,1.0):
  rotate(piv,ang*t);n=len(T.overlap(bvh(moving)))
  if n:hits.append((round(ang*t,1),n))
 # which fixed parts are touched at the worst angle (for the report)
 if hits:
  a=max(hits,key=lambda h:h[1])[0];rotate(piv,a);Tm=bvh(moving)
  who=[f.name for f in fixed if Tm.overlap(bvh(f))];worst[name]=who[:8]
 rotate(piv,0)
 check(not hits,f'{name}: abre 0..{ang:.0f} graus sem tocar a carroceria'+(f' -> colisoes {hits} com {worst.get(name)}' if hits else ''))
 # gap: the skin never touches the fixed body when closed; nearest distance across the seam
 skin=O.get(SKIN[name])
 if skin:
  Tf=T;W=world_verts(skin);d=[]
  for v in W[::max(1,len(W)//1500)]:
   r=Tf.find_nearest(Vector(v))
   if r[0] is not None:d.append(r[3])
  gmin=min(d) if d else 0;check(gmin>=.0015,f'{name}: folga minima fechado {gmin*1000:.1f} mm')

# ---------------------------------------------------------------- hinges stay on their pins
# The hinge parts are left out of the sweeps above (knuckles and pins overlap by design), so here each moving hinge
# must stay within 1 mm of its body leaf at every angle: the knuckles turn round the body's pin.
HINGES={'Porta_Motorista_DOBRADICA':('Porta_Motorista_dobradicas','Batente_porta_Motorista_fecho'),
 'Porta_Passageiro_DOBRADICA':('Porta_Passageiro_dobradicas','Batente_porta_Passageiro_fecho'),
 'Capo_DOBRADICA':('Capo_dobradicas','Capo_dobradicas_suporte'),
 'Tampa_porta_malas_DOBRADICA':('Tampa_porta_malas_dobradicas','Tampa_porta_malas_dobradicas_suporte')}
for name,(mv,fx) in HINGES.items():
 piv=pivots.get(name);mvs=[o for o in allm if o.name.startswith(mv)];fxs=[o for o in allm if o.name.startswith(fx)]
 if piv is None or not mvs or not fxs:check(False,f'{name}: dobradicas {mv} / {fx} presentes');continue
 Tb=bvh(fxs);worst_d=0.;ang=piv['angulo_aberto_graus']
 for tt in (0,.25,.5,.75,1.):
  rotate(piv,ang*tt);W=np.concatenate([world_verts(o) for o in mvs])
  worst_d=max(worst_d,min(Tb.find_nearest(Vector(v))[3] for v in W[::max(1,len(W)//3000)]))
 rotate(piv,0)
 check(worst_d<=.001,f'{name}: dobradica presa ao pino em 0/25/50/75/100% (maior distancia ao suporte {worst_d*1000:.1f} mm)')

# the hood's and the lid's hinge arms are bolted under their frames, never through them (round 2's lid arm cut a
# notch in the frame's front beam)
for mv,fr in (('Capo_dobradicas','Capo_estrutura_interna'),('Tampa_porta_malas_dobradicas','Tampa_porta_malas_estrutura')):
 a_=[o for o in allm if o.name.startswith(mv) and '_suporte' not in o.name];b_=[o for o in allm if o.name.startswith(fr)]
 k=len(bvh(a_).overlap(bvh(b_))) if a_ and b_ else -1
 check(k==0,f'{mv} sem atravessar {fr} ({k} pares de triangulos)')

# ---------------------------------------------------------------- visible seam width
# Rays from outside step across each seam every 0.25 mm; the gap is the run between the last ray that meets the
# moving part's outer skin first and the first that meets the body's. Real seams are 4 mm; none may pass 6 mm.
SEAMSKIN=('Lateral','Soleira','Peitoril_chapa','Faixa','Paralamas_topo','Painel_frontal_superior','Torpedo','Moldura_porta_malas','Decal',
 'Porta_Motorista_pele','Porta_Motorista_faixa','Porta_Motorista_peitoril','Porta_Passageiro_pele','Porta_Passageiro_faixa','Porta_Passageiro_peitoril',
 'Capo_painel','Tampa_porta_malas_painel')
is_skin=lambda n:n.startswith(SEAMSKIN) or n=='Painel_traseiro'
Tsk,sk_owner=None,None
def seam_widths(piv_name,lines):
 """lines: (origin, ray direction, scan direction) starting on the moving panel; returns the gaps in metres."""
 mov={o.name for o in meshes_under(pivots[piv_name])};out=[]
 for org,d,u in lines:
  seen=[];org=Vector(org);d=Vector(d);u=Vector(u);d0=None
  for k in range(0,200):
   h=Tsk.ray_cast(org+u*(k*.00025),d)
   if h[0] is not None and d0 is None:d0=h[3]
   # a ray through the gap that only meets the far side of the car (5 cm or more deeper) sees the gap
   seen.append(None if h[0] is None or h[3]>d0+.05 else (sk_owner[h[2]] in mov))
  try:i=max(i for i,v in enumerate(seen) if v is True);j=min(j for j,v in enumerate(seen) if v is False and j>i)
  except ValueError:continue
  out.append((j-i-1)*.00025)
 return out
if pivots:
 from mathutils.bvhtree import BVHTree
 V_=[];F_=[];sk_owner=[]
 for o in allm:
  if is_skin(o.name) and not skip(o):
   W=world_verts(o);n=len(V_);V_.extend(map(tuple,W));F_.extend(tuple(i+n for i in p.vertices) for p in o.data.polygons);sk_owner+=[o.name]*len(o.data.polygons)
 Tsk=BVHTree.FromPolygons(V_,F_)
 for side,s in (('Motorista',1),('Passageiro',-1)):
  W=world_verts(O[f'Porta_{side}_pele']);L=[]
  for z in np.arange(.26,.84,.02):
   q=W[np.abs(W[:,2]-z)<.006]
   if len(q):L+=[((q[:,0].max()-.02,s*1.5,z),(0,-s,0),(1,0,0)),((q[:,0].min()+.02,s*1.5,z),(0,-s,0),(-1,0,0))]
  g=seam_widths(f'Porta_{side}_DOBRADICA',L)
  check(g and max(g)<=.006,f'Porta_{side}: frestas visiveis {min(g)*1000:.1f}-{max(g)*1000:.1f} mm (mediana {np.median(g)*1000:.1f}), limite 6 mm')
 W=world_verts(O['Capo_painel']);L=[];Lr=[]
 for y in np.arange(-.6,.61,.05):Lr.append(((W[:,0].min()+.02,y,2),(0,0,-1),(-1,0,0)));L.append(((W[:,0].max()-.02,y,2),(0,0,-1),(1,0,0)))
 for x in np.arange(1.1,2.1,.05):
  for s in (1,-1):q=W[(np.abs(W[:,0]-x)<.01)];L.append(((x,s*(np.abs(q[:,1]).max()-.02),2),(0,0,-1),(0,s,0)))
 g=seam_widths('Capo_DOBRADICA',L);check(g and max(g)<=.006,f'Capo: frestas visiveis {min(g)*1000:.1f}-{max(g)*1000:.1f} mm (mediana {np.median(g)*1000:.1f}), limite 6 mm')
 # the rear edge stands proud of the cowl (race set-up, carro_3): its seam is a real one plus the lip's step back
 from v06_carroceria import HOOD_REAR_LIFT,COWL_STEP_BACK
 g=seam_widths('Capo_DOBRADICA',Lr);lim=.006+COWL_STEP_BACK
 check(g and max(g)<=lim,f'Capo, borda traseira: frestas vistas de cima {min(g)*1000:.1f}-{max(g)*1000:.1f} mm, limite {lim*1000:.0f} mm')
 C=world_verts(O['Torpedo_ventilacao']);c=C[np.abs(C[:,1])<.03];h=W[np.abs(W[:,1])<.03]
 rise=h[h[:,0]<h[:,0].min()+.005][:,2].max()-c[c[:,0]>c[:,0].max()-.012][:,2].max()
 check(abs(rise-HOOD_REAR_LIFT)<.004,f'Capo: borda traseira {rise*1000:.0f} mm acima do torpedo (carro_3: {HOOD_REAR_LIFT*1000:.0f} mm)')
 W=world_verts(O['Tampa_porta_malas_painel']);L=[]
 for y in np.arange(-.6,.61,.05):L.append(((W[:,0].max()-.02,y,2),(0,0,-1),(1,0,0)))
 for x in np.arange(-2.0,-1.6,.05):
  for s in (1,-1):q=W[(np.abs(W[:,0]-x)<.01)];L.append(((x,s*(np.abs(q[:,1]).max()-.02),2),(0,0,-1),(0,s,0)))
 g=seam_widths('Tampa_porta_malas_DOBRADICA',L);check(g and max(g)<=.006,f'Tampa: frestas visiveis {min(g)*1000:.1f}-{max(g)*1000:.1f} mm (mediana {np.median(g)*1000:.1f}), limite 6 mm')

# ---------------------------------------------------------------- engine under the hood, interior in the shell
if 'Capo_DOBRADICA' in pivots:
 hood=[o for o in meshes_under(pivots['Capo_DOBRADICA'])];Th=bvh(hood)
 under=[o for o in engine+list(bpy.data.collections['08_Cofre_do_motor'].objects) if o.type=='MESH' and not skip(o)]
 touch=[o.name for o in under if Th.overlap(bvh(o))]
 check(not touch,'motor e acessorios nao tocam o capo fechado'+(f': {touch}' if touch else ''))
 clear=9.
 for o in engine:
  W=world_verts(o);top=W[W[:,2]>W[:,2].max()-.03]
  for v in top[::max(1,len(top)//200)]:
   h=Th.ray_cast(Vector(v)+Vector((0,0,.0005)),Vector((0,0,1)))
   if h[0] is not None:clear=min(clear,h[3])
 check(clear>=.015,f'folga motor-capo (raio vertical) {clear*1000:.0f} mm')
interior=[o for o in bpy.data.collections['07_Interior_do_jogo'].objects if o.type=='MESH'] if '07_Interior_do_jogo' in bpy.data.collections else []
check(len(interior)>0,f'interior do jogo presente ({len(interior)} malhas)')
shell=[o for o in allm if o.name.startswith(('Teto','Para_brisa','Vidro','Vigia','Lateral','Porta_','Coluna','Calha','Cabecalho','Moldura','Rede_janela'))]
Ts=bvh(shell);pierce=[o.name for o in interior if Ts.overlap(bvh(o))]
check(not pierce,f'interior nao fura teto, vidros, portas e laterais'+(f': {pierce}' if pierce else ''))

# ---------------------------------------------------------------- nothing internal pokes through the closed skin
# Rays from outside (the sides, and from above over the hood, the roof and the trunk lid): where a ray meets the outer
# skin, nothing internal (hinge knuckles, frames, aprons, jambs...) may be met in the 5 cm before it. Rays that pass
# the panel gaps, the wheel arches or under the car meet the skin only on the far side (or not at all) and are not
# judged: a jamb seen through a 4 mm seam is not a part poking through.
INTERNAL=('Cofre_','Estrutura_cofre','Batente_','Porta_malas_','Tanque','Motor','Transmissao','Escapamento','Radiador',
 'Interior_','Capo_estrutura','Capo_dobradicas','Tampa_porta_malas_estrutura','Tampa_porta_malas_dobradicas',
 'Porta_Motorista_estrutura','Porta_Passageiro_estrutura','Porta_Motorista_dobradicas','Porta_Passageiro_dobradicas',
 'Porta_Motorista_fechadura','Porta_Passageiro_fechadura','Painel_traseiro_interno','Assoalho_porta_malas','Gaiola','Vedacao_porta')
SKIN=('Lateral','Porta_Motorista_pele','Porta_Passageiro_pele','Capo_painel','Paralamas_topo','Painel_frontal_superior','Torpedo',
 'Tampa_porta_malas_painel','Moldura_porta_malas','Teto','Painel_traseiro','Saia','Soleira','Porta_Motorista_faixa','Porta_Passageiro_faixa',
 'Faixa','Peitoril','Porta_Motorista_peitoril','Porta_Passageiro_peitoril')
from mathutils.bvhtree import BVHTree
def tagged(objs):
 V=[];F=[];own=[]
 for o in objs:
  W=world_verts(o);n=len(V);V.extend(map(tuple,W))
  for p in o.data.polygons:F.append(tuple(i+n for i in p.vertices));own.append(o.name)
 return BVHTree.FromPolygons(V,F),own
Tall,owner=tagged([o for o in allm if o.name.startswith(INTERNAL+SKIN)])
Tskin=bvh([o for o in allm if o.name.startswith(SKIN)]);shows={}
def probe(origin,direction):
 o=Vector(origin);d=Vector(direction);h=Tall.ray_cast(o,d);k=Tskin.ray_cast(o,d)
 if h[0] is None or k[0] is None:return
 name=owner[h[2]]
 if name.startswith(INTERNAL) and h[3]<k[3]-.0005 and k[3]-h[3]<.05:shows[name]=shows.get(name,0)+1
for s in (1,-1):
 for x in np.arange(-2.15,2.28,.01):
  for z in np.arange(.18,.90,.01):probe((x,s*2,z),(0,-s,0))
for x in list(np.arange(1.0,2.17,.01))+list(np.arange(-.80,.44,.02))+list(np.arange(-2.15,-1.55,.01)):
 for y in np.arange(-.70,.71,.01):probe((x,y,2),(0,0,-1))
check(not shows,'nada interno fura a pele fechada (laterais, capo, teto e tampa)'+(f': {shows}' if shows else ''))

# ---------------------------------------------------------------- static overlaps (regression baseline)
# Parts of different groups that intersect with everything closed. A bracket welded to its panel intersects it by
# design, so the pairs found when the model was accepted are kept in v06_sobreposicoes_base.py (per livery): a pair
# that is not there fails. After a deliberate change, look at the new pairs and rewrite the baseline with
#  ... verificar_opala_v06.py -- <scratch.glb> --gravar-base
def group_of(o):
 p=o
 while p.parent and p.parent!=root:p=p.parent
 if p.name=='Motor_CONJUNTO':return 'motor'
 if p.name=='Interior_do_jogo':return 'interior'
 cs={c.name for c in o.users_collection}
 for k,g in (('08_Cofre_do_motor','cofre'),('10_Porta_malas','porta_malas'),('06_Fechamentos_estruturais_V04','estrutura'),('02_Vidros_Redes_Interior','vidros_gaiola')):
  if k in cs:return g
 return 'carroceria'
GROUPS={}
for o in allm:GROUPS.setdefault(group_of(o),[]).append(o)
BB={o.name:(world_verts(o).min(0),world_verts(o).max(0)) for o in allm};TT={}
def tb(o):
 if o.name not in TT:TT[o.name]=bvh(o)
 return TT[o.name]
report=[];pairs=set()
for ga,gb in (('motor','cofre'),('motor','carroceria'),('cofre','estrutura'),('cofre','carroceria'),('porta_malas','estrutura'),('porta_malas','carroceria'),
  ('interior','estrutura'),('interior','vidros_gaiola'),('interior','carroceria'),('interior','cofre')):
 found=[]
 for a_ in GROUPS.get(ga,[]):
  la,ha=BB[a_.name]
  for b_ in GROUPS.get(gb,[]):
   lb,hb=BB[b_.name]
   if (la>hb+.002).any() or (lb>ha+.002).any() or skip(a_) or skip(b_):continue
   k=len(tb(a_).overlap(tb(b_)))
   if k:found.append((k,a_.name,b_.name));pairs.add(f'{a_.name}|{b_.name}')
 found.sort(reverse=True)
 report.append(f'{ga} x {gb}: {len(found)} pares'+(' ('+', '.join(f'{a_}/{b_} {k}' for k,a_,b_ in found[:4])+')' if found else ''))
notes.append('--  sobreposicoes estaticas entre grupos: '+'; '.join(report))
livery=source.stem[len('opala99_'):];BASEFILE=Path(__file__).resolve().parent/'v06_sobreposicoes_base.py'
base={}
if BASEFILE.is_file():exec(BASEFILE.read_text(encoding='utf-8'),base)
known=base.get('BASE',{})
if write_base:
 known[livery]=sorted(pairs)
 BASEFILE.write_text('"""Static overlaps accepted in the V06 model (verificar_opala_v06.py): pairs "a|b" of parts of different groups\n'
  'that intersect by design (brackets on their panels, parts seated in the body). A pair not listed here fails the check.\n'
  'Rewritten with verificar_opala_v06.py -- <scratch.glb> --gravar-base."""\nBASE={\n'+
  ''.join(f' {k!r}:[\n'+''.join(f'  {p!r},\n' for p in v)+' ],\n' for k,v in sorted(known.items()))+'}\n',encoding='utf-8')
 notes.append(f'--  base de sobreposicoes gravada para {livery}: {len(pairs)} pares')
elif livery not in known:check(False,f'base de sobreposicoes sem a pintura {livery} (rode com --gravar-base)')
else:
 new=sorted(pairs-set(known[livery]));gone=len(set(known[livery])-pairs)
 check(not new,f'sobreposicoes estaticas: {len(pairs)} pares, nenhum fora da base ({gone} da base sumiram)'+(f': NOVOS {new[:8]}' if new else ''))
tank=[o for o in allm if o.name.startswith('Tanque')];Tpt=bvh(O['Painel_traseiro'])
dmin=min(Tpt.find_nearest(Vector(v))[3] for o in tank for v in world_verts(o)) if tank else 0.
check(tank and dmin>=.010 and not any(Tpt.overlap(bvh(o)) for o in tank),f'tanque e berco a {dmin*1000:.0f} mm do Painel_traseiro (minimo 10 mm, sem sobreposicao)')

# ---------------------------------------------------------------- the closing panels are all there
# Seen from below, the cabin, the bay's floor and the trunk must show the V04/V06 closing panels (gloss black), not
# the cabin's contents: a failed boolean once left the whole cabin floor out.
closing=[o for o in allm if any(m and m.name=='Chapa_fechamento_V04' for m in o.data.materials)]
Tall_b,own_b=tagged(allm);Tc=bvh(closing);open_=[]
for x in np.arange(-.9,.75,.1):
 for y in np.arange(-.45,.46,.15):
  a_=Tall_b.ray_cast(Vector((x,y,-1)),Vector((0,0,1)));b_=Tc.ray_cast(Vector((x,y,-1)),Vector((0,0,1)))
  if b_[0] is None or (a_[0] is not None and own_b[a_[2]].startswith('Interior_') and a_[3]<b_[3]-.002):open_.append((round(x,2),round(y,2)))
check(not open_,'piso da cabine fechado por baixo'+(f': aberto em {open_[:6]}' if open_ else ''))

# ---------------------------------------------------------------- the trunk's contents stay inside the body
# From behind (x -3 toward the car, under and over the valance) and from below aft of the rear axle, the first thing
# a ray meets is never the fuel cell, its cradle or the trunk's inner panels (round 2 left the cradle under the valance).
TRUNK=('Tanque','Porta_malas_','Assoalho_porta_malas','Painel_traseiro_interno');seen=[]
for y in np.arange(-.70,.705,.02):
 for z in np.arange(.15,.455,.01):
  h=Tall_b.ray_cast(Vector((-3,y,z)),Vector((1,0,0)))
  if h[0] is not None and own_b[h[2]].startswith(TRUNK):seen.append(('tras',round(y,2),round(z,2),own_b[h[2]]))
 for x in np.arange(-2.2,-1.2,.02):
  h=Tall_b.ray_cast(Vector((x,y,-1)),Vector((0,0,1)))
  if h[0] is not None and own_b[h[2]].startswith(TRUNK):seen.append(('baixo',round(x,2),round(y,2),own_b[h[2]]))
check(not seen,'tanque, berco e porta-malas invisiveis por tras (z 0.15-0.45) e por baixo atras do eixo'+(f': {len(seen)} raios, ex. {seen[:4]}' if seen else ''))

# ---------------------------------------------------------------- window nets (carro_3, carro_5, carro_21)
# From the riveted post (x -0.21) to x 0.55 at the belt, 7 upright and 5 cross straps: round 2 had silently shrunk
# them to 0.40 m.
def components(me):
 p=list(range(len(me.vertices)))
 def f(i):
  while p[i]!=i:p[i]=p[p[i]];i=p[i]
  return i
 for e in me.edges:p[f(e.vertices[0])]=f(e.vertices[1])
 return np.array([f(i) for i in range(len(p))])
for side in ('Motorista','Passageiro'):
 o=O.get('Rede_janela_'+side)
 if o is None:check(False,f'Rede_janela_{side} existe');continue
 W=world_verts(o);c=components(o.data);up=cross=0
 for k in set(c):
  q=W[c==k]
  if np.ptp(q[:,2])>np.ptp(q[:,0]):up+=1
  else:cross+=1
 check(W[:,0].min()<=-.17 and W[:,0].max()>=.52 and up==7 and cross==5,
  f'Rede_janela_{side}: x {W[:,0].min():+.3f}..{W[:,0].max():+.3f} (ate -0.17 e +0.52 no minimo), {up} tiras verticais e {cross} horizontais (7 e 5)')

# ---------------------------------------------------------------- stickers clear of the door seams
# No visible part of a side sticker (texture alpha > 0.3 at a face's corners or centre) within 3 cm of a door seam
# or of the door's edge: round 2 cut the passenger names at the seam and at the door's front edge. RR IMPORT is split
# at the seam on purpose (carro_5, carro_7: the seam runs between its two R's).
SPLIT_OK=('Decal_motorista_rr',)
near={}
for side,low in (('Motorista','motorista'),('Passageiro','passageiro')):
 D=world_verts(O[f'Porta_{side}_pele']);D=D[np.abs(D[:,1])>.8]
 zs=np.arange(D[:,2].min()+.01,D[:,2].max()-.005,.01)
 fr=np.array([D[np.abs(D[:,2]-z)<.012,0].max() for z in zs]);rr=np.array([D[np.abs(D[:,2]-z)<.012,0].min() for z in zs])
 for o in [o for o in allm if o.name.startswith('Decal_'+low) and not o.name.startswith(SPLIT_OK)]:
  tex=next((n.image for n in o.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None)
  if tex is None:continue
  w,h=tex.size;A=np.array(tex.pixels[:],np.float32).reshape(h,w,4)[:,:,3]
  uv=np.zeros(len(o.data.loops)*2);o.data.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,2)
  Wv=world_verts(o);n=0
  for p in o.data.polygons:
   L=list(p.loop_indices);U=np.vstack([uv[L],uv[L].mean(0)]);a=A[np.clip((U[:,1]*h).astype(int),0,h-1),np.clip((U[:,0]*w).astype(int),0,w-1)].max()
   if a<=.3:continue
   x,y,z=Wv[list(p.vertices)].mean(0)
   if not zs[0]<=z<=zs[-1]:continue
   if min(abs(x-np.interp(z,zs,fr)),abs(x-np.interp(z,zs,rr)))<.03:n+=1
  if n:near[o.name]=n
check(not near,'adesivos laterais longe das juntas das portas (3 cm)'+(f': faces visiveis perto da junta {near}' if near else ''))

# ---------------------------------------------------------------- stickers not cropped
# No opaque texel (alpha > 0.5) of a sticker may lie on the border of its mesh: a sticker cut through its artwork
# (round 3: the OMP driver-door names stopped mid-word at x +0.02, which the seam check cannot see). Samples along
# every border edge, 1.5 texels inside the face; where the border runs along the image's own edge the artwork ends
# there anyway and is not counted. RR IMPORT is cut at the door seam on purpose.
cropped={}
for o in [o for o in allm if o.name.startswith(('Decal_','Jesus_','Adesivo_')) and not o.name.startswith(SPLIT_OK)]:
 me=o.data;tex=next((n.image for m in me.materials if m and m.node_tree for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None)
 if tex is None or not me.uv_layers:continue
 w,h=tex.size;A=np.array(tex.pixels[:],np.float32).reshape(h,w,4)[:,:,3]
 uv=np.zeros(len(me.loops)*2);me.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,2)
 use={}
 for p in me.polygons:
  L=list(p.loop_indices)
  for k in range(len(L)):
   a_,b_=L[k],L[(k+1)%len(L)];key=tuple(sorted((me.loops[a_].vertex_index,me.loops[b_].vertex_index)))
   use.setdefault(key,[]).append((a_,b_,uv[L].mean(0)))
 n=0
 for edges in use.values():
  if len(edges)!=1:continue
  a_,b_,c=edges[0]
  for t in (.1,.3,.5,.7,.9):
   q=uv[a_]+(uv[b_]-uv[a_])*t;d=c-q;L_=np.linalg.norm(d*(w,h))
   if L_>0:q=q+d/L_*1.5
   if min(q[0],1-q[0])*w<2 or min(q[1],1-q[1])*h<2:continue
   if A[int(np.clip(q[1]*h,0,h-1)),int(np.clip(q[0]*w,0,w-1))]>.5:n+=1
 if n:cropped[o.name]=n
check(not cropped,'adesivos sem corte no desenho (nenhum texel opaco na borda da malha)'+(f': {cropped}' if cropped else ''))

# ---------------------------------------------------------------- budget, materials, structure
faces=lambda objs:sum(len(o.data.polygons) for o in objs)
total=faces(allm);f_eng=faces(engine);f_int=faces(interior)
check(total<=260000,f'faces total {total}');check(f_eng<=45000,f'faces motor {f_eng}');check(f_int<=70000,f'faces interior {f_int}')
struct=[o for o in allm if any(m and m.name=='Chapa_fechamento_V04' for m in o.data.materials)]
bads=[o.name for o in struct if o.parent!=root or len(o.data.materials)!=1]
check(not bads,f'{len(struct)} pecas de Chapa_fechamento_V04 filhas diretas do root, material unico'+(f': {bads}' if bads else ''))
paint=bpy.data.materials['Pintura_preta']
for n in ('Porta_Motorista_pele','Porta_Passageiro_pele','Capo_painel','Tampa_porta_malas_painel'):
 check(O[n].data.materials[0]==paint,f'{n} usa Pintura_preta')
bad=[]
for m in {m for o in allm for m in o.data.materials if m}:
 nodes=m.node_tree.nodes if m.node_tree else []
 out=next((n for n in nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output),None)
 src=out.inputs['Surface'].links[0].from_node if out and out.inputs['Surface'].links else None
 if src is None or src.type not in ('BSDF_PRINCIPLED','GROUP'):bad.append(m.name)
check(not bad,f'materiais Principled'+(f': {bad}' if bad else ''))
unpacked=[i.name for i in bpy.data.images if i.users and i.source=='FILE' and i.packed_file is None]
check(not unpacked,'imagens embutidas'+(f': {unpacked}' if unpacked else ''))

print('\n'.join(['V06 CHECK '+source.name]+notes+fails+[f'faces: total {total}, motor {f_eng}, interior {f_int}']),flush=True)
if fails:raise RuntimeError(f'{len(fails)} verificacao(oes) falharam')

# ---------------------------------------------------------------- scratch GLB export (exporter checks) and re-import
blender=bpy.app.binary_path
r=subprocess.run([blender,'--background',str(source),'--python-exit-code','2','--python',str(R/'modelo_3d/scripts/exportar_glb_jogo.py'),'--',str(scratch)],capture_output=True,text=True)
print('\n'.join(l for l in r.stdout.splitlines() if l.startswith(('GLB_','Error','Traceback','AssertionError'))),flush=True)
if r.returncode!=0:print(r.stdout[-3000:],r.stderr[-2000:]);raise RuntimeError('exportacao do GLB de teste falhou')
names=set(HINGED)|set(STATIC)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(scratch))
got={o.name:o for o in bpy.data.objects if o.type=='EMPTY'}
missing=[n for n in names if n not in got or not any(c.type=='MESH' for c in got[n].children_recursive)]
extras=[n for n in HINGED if n in got and 'angulo_aberto_graus' not in got[n]]
print(f'GLB {scratch} {scratch.stat().st_size/2**20:.1f} MiB, nos de pivo com malhas: {len(names)-len(missing)}/{len(names)}',flush=True)
import json,struct
from mathutils import Quaternion
raw=scratch.read_bytes();n=struct.unpack_from('<I',raw,12)[0];G=json.loads(raw[20:20+n])
def trs(nd):
 M=Matrix.Translation(nd.get('translation',(0,0,0)))
 if 'rotation' in nd:q=nd['rotation'];M=M@Quaternion((q[3],q[0],q[1],q[2])).to_matrix().to_4x4()
 if 'scale' in nd:M=M@Matrix.Diagonal((*nd['scale'],1))
 return M
def corners(i,M):
 nd=G['nodes'][i];M=M@trs(nd);out=[]
 if 'mesh' in nd:
  for pr in G['meshes'][nd['mesh']]['primitives']:
   acc=G['accessors'][pr['attributes']['POSITION']];lo,hi=acc['min'],acc['max']
   out+=[M@Vector((x,y,z)) for x in (lo[0],hi[0]) for y in (lo[1],hi[1]) for z in (lo[2],hi[2])]
 for c in nd.get('children',[]):out+=corners(c,M)
 return out
bad=[]
for i,nd in enumerate(G['nodes']):
 ex=nd.get('extras',{})
 if ex.get('peca') not in ('porta','capo','porta_malas'):continue
 P=[p for c in nd.get('children',[]) for p in corners(c,Matrix())]
 R=Quaternion(Vector(ex['eixo_gltf']),math.radians(ex['angulo_gltf_graus'])).to_matrix()
 if ex['peca']=='capo':p=max(P,key=lambda v:v.x);ok=(R@p).y>p.y+.3
 elif ex['peca']=='porta_malas':p=min(P,key=lambda v:v.x);ok=(R@p).y>p.y+.3
 else:p=min(P,key=lambda v:v.x);side=1 if nd['translation'][2]>0 else -1;ok=side*(R@p).z>side*p.z+.3
 if not ok:bad.append(nd['name'])
print('GLB eixo_gltf/angulo_gltf_graus '+('conferem (capo e tampa sobem, portas abrem para fora)' if not bad else f'ERRADOS em {bad}'),flush=True)
if bad:raise RuntimeError(f'extras glTF errados: {bad}')
if missing or extras:raise RuntimeError(f'GLB sem pivos {missing} ou sem extras {extras}')
print('V06_CHECK_OK',flush=True)
