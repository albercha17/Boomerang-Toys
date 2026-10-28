"""Pinta un modelo de Tripo que viene en partes SIN textura (cada parte de un color de la paleta) y lo prepara:

  blender -b --factory-startup --python herramientas/blender/pintar_partes.py -- <entrada.glb> <salida.glb> [caras] [paleta]

Paletas: «barbie» (rosas, blanco, lila, menta y amarillo pastel). Las partes más grandes llevan los primeros colores.
Después hace lo mismo que preparar_objeto.py: junta, reduce, apoya en el suelo centrado y exporta.
"""
import sys

import bpy
from mathutils import Matrix, Vector

PALETAS = {
    "barbie": [(1.0, 0.56, 0.78), (0.98, 0.96, 0.97), (0.80, 0.66, 0.96), (1.0, 0.36, 0.64), (0.62, 0.92, 0.85),
               (1.0, 0.86, 0.45), (0.98, 0.74, 0.86), (0.70, 0.86, 1.0)],
}
args = sys.argv[sys.argv.index("--") + 1:]
entrada, salida = args[0], args[1]
CARAS = int(args[2]) if len(args) > 2 else 15000
paleta = PALETAS[args[3] if len(args) > 3 else "barbie"]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=entrada)
mallas = sorted([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: -len(o.data.polygons))
for i, o in enumerate(mallas):
    m = bpy.data.materials.new(f"color_{i}")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*paleta[i % len(paleta)], 1)
    bsdf.inputs["Roughness"].default_value = 0.45
    o.data.materials.clear()
    o.data.materials.append(m)
for o in bpy.data.objects:
    o.select_set(o in mallas)
bpy.context.view_layer.objects.active = mallas[0]
bpy.ops.object.join()
obj = bpy.context.active_object
obj.parent = None
for o in list(bpy.data.objects):
    if o != obj:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
caras = len(obj.data.polygons)
if caras > CARAS:
    mod = obj.modifiers.new("aligerar", "DECIMATE")
    mod.ratio = CARAS / caras
    bpy.ops.object.modifier_apply(modifier=mod.name)
print(f"caras: {caras} -> {len(obj.data.polygons)} · {len(mallas)} partes pintadas", flush=True)
pts = [Vector(c) for c in obj.bound_box]
centro = Vector((sum(p.x for p in pts) / 8, sum(p.y for p in pts) / 8, min(p.z for p in pts)))
obj.data.transform(Matrix.Translation(-centro))
obj.location = (0, 0, 0)
bpy.context.view_layer.update()
d = obj.dimensions
print(f"medidas: ancho {d.x:.2f}, fondo {d.y:.2f}, alto {d.z:.2f}", flush=True)
bpy.ops.export_scene.gltf(filepath=salida, export_format="GLB", export_yup=True)
print("ok", salida, flush=True)
