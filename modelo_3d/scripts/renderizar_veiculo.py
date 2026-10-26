"""Previews of a vehicle's game GLB (the tow truck's criar_guincho_v1.py, the rescue pickup's criar_caminhonete_v1.py,
...) in Blender: views round it, the one the towed car's driver gets, close-ups, and a mosaic of them all. The views
are in the game's frame round a vehicle of about 5.5 m facing +x with its centre at the origin.

Usage, from the project root:
 blender --background --factory-startup --python modelo_3d/scripts/renderizar_veiculo.py -- <glb> <out_dir> [--so vista,vista] [--amostras N]
EEVEE, a late-afternoon sun, a plain sky; the beacon and hazards lit as the game lights them while it tows.
"""
import bpy, sys, math
from pathlib import Path
from mathutils import Vector, Euler
R = Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
flags = {a: args[i + 1] for i, a in enumerate(args) if a.startswith('--') and i + 1 < len(args)}
plain = [a for i, a in enumerate(args) if not a.startswith('--') and not (i and args[i - 1].startswith('--'))]
GLB = Path(plain[0]).resolve()
OUT = Path(plain[1]).resolve()
ONLY = set(flags['--so'].split(',')) if '--so' in flags else None
SAMPLES = int(flags.get('--amostras', '32'))
# Game frame (x forward, y up, z right) -> Blender after the glTF import (x, -z, y).
G = lambda x, y, z: Vector((x, -z, y))
# name: (eye, target, vertical fov), game frame
VIEWS = {
    'tras34': ((-6.4, 2.0, -3.8), (-.5, 1.0, 0), 34),
    'frente34': ((6.8, 1.7, 4.4), (.6, 1.0, 0), 34),
    'lado': ((.2, 1.2, -9.5), (.2, 1.0, 0), 30),
    'frente': ((8.0, 1.3, 0), (1.5, 1.1, 0), 26),
    'rebocado': ((-7.6, 1.55, 0), (-1.0, 1.2, 0), 55),
    'cima': ((-3.5, 7.5, -5.0), (0, .7, 0), 36),
    'cabine': ((4.4, 1.7, -2.6), (2.4, 1.35, 0), 40),
    'roda': ((1.0, .6, -3.4), (-.2, .5, 0), 40),
    'traseira': ((-4.2, 1.0, -1.2), (-2.4, .75, 0), 38),
    'plataforma': ((-1.0, 2.9, 1.8), (.7, 1.3, 0), 48),
    'farol': ((4.3, 1.25, -1.2), (2.95, 1.0, -.45), 30),
    'motorista': ((3.6, 1.75, -2.4), (1.95, 1.55, -.45), 32),
}


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    scene = bpy.context.scene
    for engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            pass
    try:
        scene.eevee.taa_render_samples = SAMPLES
    except AttributeError:
        pass
    scene.render.resolution_x, scene.render.resolution_y = 1440, 900
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('Ceu')
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes['Background']
    coords = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(coords.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], bg.inputs[0])
    ramp.color_ramp.elements[0].position = .48
    ramp.color_ramp.elements[0].color = (.32, .3, .27, 1)
    ramp.color_ramp.elements[1].position = .62
    ramp.color_ramp.elements[1].color = (.55, .68, .88, 1)
    bg.inputs[1].default_value = 1.0
    sun = bpy.data.objects.new('Sol', bpy.data.lights.new('Sol', 'SUN'))
    sun.data.energy = 4.2
    sun.data.angle = math.radians(1.5)
    sun.data.color = (1, .92, .8)
    sun.rotation_euler = Euler((math.radians(52), 0, math.radians(-35)))
    scene.collection.objects.link(sun)
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    gm = bpy.data.materials.new('Asfalto')
    gm.use_nodes = True
    p = gm.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (.07, .07, .075, 1)
    p.inputs['Roughness'].default_value = .85
    bpy.context.object.data.materials.append(gm)
    # The lamps as the game lights them while it tows (tow-truck.js): beacon and hazards on.
    for m in bpy.data.materials:
        if m.name.split('.')[0] in ('Giroflex_A', 'Pisca_ambar') and m.node_tree:
            m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2.5
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.clip_start = .02
    return scene, cam


def shoot(scene, cam, name, eye, target, fov):
    cam.location = G(*eye)
    cam.data.angle = math.radians(fov)
    cam.rotation_euler = (G(*target) - cam.location).normalized().to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(OUT / f'{name}.png')
    bpy.ops.render.render(write_still=True)
    return OUT / f'{name}.png'


def mosaic(files, path, cols=3, width=720):
    import numpy as np
    tiles = []
    for f in files:
        im = bpy.data.images.load(str(f))
        w, h = im.size
        px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
        step = w / width
        rows = (np.arange(int(h / step)) * step).astype(int)
        cx = (np.arange(width) * step).astype(int)
        tiles.append(px[rows][:, cx])
        bpy.data.images.remove(im)
    th = tiles[0].shape[0]
    n = len(tiles)
    rws = (n + cols - 1) // cols
    canvas = np.ones((rws * th, cols * width, 4), np.float32)
    for i, t in enumerate(tiles):
        r = rws - 1 - i // cols
        c = i % cols
        canvas[r * th:(r + 1) * th, c * width:(c + 1) * width] = t
    out = bpy.data.images.new('mosaico', cols * width, rws * th)
    out.pixels = canvas.ravel().tolist()
    out.filepath_raw = str(path)
    out.file_format = 'JPEG'
    out.save()


OUT.mkdir(parents=True, exist_ok=True)
scene, cam = setup()
files = [shoot(scene, cam, name, *view) for name, view in VIEWS.items() if ONLY is None or name in ONLY]
if len(files) > 1:
    mosaic(files, OUT / 'mosaico.jpg')
print('PREVIAS', OUT, len(files), flush=True)
