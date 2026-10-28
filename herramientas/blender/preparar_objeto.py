"""Prepara un objeto de mapa para la biblioteca del editor (sin ventana):

  blender -b --factory-startup --python herramientas/blender/preparar_objeto.py -- <entrada.glb> <salida.glb> [caras] [giro]

Junta sus mallas, lo reduce (12.000 caras por defecto) con texturas de 1024 px, le aplica el giro de corrección
(«x,y,z» en grados, para modelos que vienen tumbados), lo apoya en el suelo centrado y lo exporta.
Lo usan la biblioteca de objetos (public/models/objetos) y el botón «Traer modelos» del editor de mapas.
"""
import math
import sys

import bpy
from mathutils import Euler, Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
entrada, salida = args[0], args[1]
CARAS = int(args[2]) if len(args) > 2 else 12000
GIRO = [float(g) for g in args[3].split(",")] if len(args) > 3 and args[3] else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=entrada)
mallas = [o for o in bpy.data.objects if o.type == "MESH"]
if not mallas:
    raise SystemExit("el modelo no tiene mallas")
for o in bpy.data.objects:
    o.select_set(o in mallas)
bpy.context.view_layer.objects.active = mallas[0]
if len(mallas) > 1:
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
print(f"caras: {caras} -> {len(obj.data.polygons)}", flush=True)

for slot in obj.material_slots:
    if slot.material and slot.material.use_nodes:
        for nodo in slot.material.node_tree.nodes:
            img = getattr(nodo, "image", None)
            if img and max(img.size) > 1024:
                img.scale(1024, 1024)

if GIRO:
    obj.data.transform(Euler([math.radians(g) for g in GIRO]).to_matrix().to_4x4())

# Apoyado en el suelo y centrado
pts = [Vector(c) for c in obj.bound_box]
centro = Vector((sum(p.x for p in pts) / 8, sum(p.y for p in pts) / 8, min(p.z for p in pts)))
obj.data.transform(Matrix.Translation(-centro))
obj.location = (0, 0, 0)
bpy.context.view_layer.update()
dims = obj.dimensions
print(f"medidas: ancho {dims.x:.2f}, fondo {dims.y:.2f}, alto {dims.z:.2f}", flush=True)
bpy.ops.export_scene.gltf(filepath=salida, export_format="GLB", export_yup=True, export_image_format="JPEG")
print("ok", salida, flush=True)
