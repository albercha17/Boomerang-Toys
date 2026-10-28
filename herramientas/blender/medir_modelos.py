"""Mide los GLB de una carpeta (ancho x, fondo y, alto z de Blender = ancho, fondo, alto del juego).

  blender -b --factory-startup --python herramientas/blender/medir_modelos.py -- <carpeta>
"""
import sys
from pathlib import Path

import bpy
from mathutils import Vector

carpeta = Path(sys.argv[sys.argv.index("--") + 1])
for ruta in sorted(carpeta.glob("*.glb")):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ruta))
    pts = [o.matrix_world @ Vector(c) for o in bpy.data.objects if o.type == "MESH" for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    d = mx - mn
    print(f"MEDIDA {ruta.stem}: ancho {d.x:.2f} fondo {d.y:.2f} alto {d.z:.2f}", flush=True)
