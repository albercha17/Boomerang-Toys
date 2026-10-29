"""Pone esqueleto a un personaje (sin ventana):

  blender -b --factory-startup --python herramientas/blender/riggear_personaje.py -- <malla.glb> <huesos.json> <salida.glb> [--vóxel]

La malla y los huesos salen del juego (tmp exportar_rig.js: la malla normalizada, con los brazos ya bajados, y dónde
van cadera, columna, pecho, cabeza, hombros, codos, manos, muslos, rodillas y pies). Blender reparte los pesos con
su método automático (calor de los huesos), que sigue la superficie: la melena va con la cabeza, la falda con la
cadera. Si deja muchos vértices sin peso (mallas rotas), lo hace sobre una copia cerrada rehecha en vóxeles y le
pasa los pesos al original (--vóxel lo fuerza). El juego carga public/models/ia/rig/<id>.glb (IaFigure.js).
Ejes: juego (x, y, z) = Blender (x, -z, y).
"""
import json
import sys

import bmesh
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
entrada, ruta_huesos, salida = args[0], args[1], args[2]
VOXEL = "--vóxel" in args or "--voxel" in args
TAM_VOXEL = float(args[args.index("--tam") + 1]) if "--tam" in args else 0.012  # --tam: vóxel más grande = copia más sencilla
g2b = lambda p: Vector((p[0], -p[2], p[1]))  # noqa: E731

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=entrada)
malla = [o for o in bpy.data.objects if o.type == "MESH"][0]
malla.parent = None
bpy.context.view_layer.objects.active = malla
malla.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.data.objects):
    if o != malla:
        bpy.data.objects.remove(o, do_unlink=True)
# La malla viene sin índices (un triángulo suelto por cara): se cosen los vértices repetidos (las UV van por esquina)
bm = bmesh.new()
bm.from_mesh(malla.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0004)
bm.to_mesh(malla.data)
bm.free()
malla.name = "personaje"
# Sombreado suave: normales por vértice (la malla llega con una por triángulo); así los vértices se comparten al
# exportar (el archivo pesa mucho menos) y el muñeco se ve más redondito
for poligono in malla.data.polygons:
    poligono.use_smooth = True

# --- esqueleto ---------------------------------------------------------------------------------------------------
huesos = json.loads(open(ruta_huesos, encoding="utf-8").read())
pos = {h["name"]: g2b(h["position"]) for h in huesos}
padre = {h["name"]: h["parent"] for h in huesos}
hijos = {}
for h in huesos:
    if h["parent"]:
        hijos.setdefault(h["parent"], []).append(h["name"])
siguiente = {"hips": "spine", "spine": "chest", "chest": "head"}  # el pecho apunta al cuello, no a los hombros

arm_data = bpy.data.armatures.new("esqueleto")
arm = bpy.data.objects.new("esqueleto", arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
eb = {}
for h in huesos:
    n = h["name"]
    b = arm_data.edit_bones.new(n)
    b.head = pos[n]
    hijo = siguiente.get(n) or (hijos.get(n, [None])[0] if len(hijos.get(n, [])) == 1 else None)
    if hijo:
        b.tail = pos[hijo]
    elif n == "head":
        b.tail = pos[n] + Vector((0, 0, 0.35))
    elif n == "root":
        b.tail = pos[n] + Vector((0, 0, 0.1))
    else:  # manos y pies: siguen la dirección del hueso de antes
        d = pos[n] - pos[padre[n]]
        b.tail = pos[n] + (d.normalized() * 0.08 if d.length > 1e-4 else Vector((0, 0, -0.08)))
    if (b.tail - b.head).length < 0.01:
        b.tail = b.head + Vector((0, 0, 0.05))
    b.roll = 0
    eb[n] = b
for h in huesos:
    if h["parent"]:
        eb[h["name"]].parent = eb[h["parent"]]
        eb[h["name"]].use_connect = False
eb["root"].use_deform = False
bpy.ops.object.mode_set(mode="OBJECT")


def pesar(obj):
    """Pesos automáticos de obj respecto al esqueleto; devuelve cuántos vértices se quedan sin peso."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    sin = 0
    for v in obj.data.vertices:
        if not any(g.weight > 1e-4 for g in v.groups):
            sin += 1
    return sin


sin_peso = len(malla.data.vertices) if VOXEL else pesar(malla)
total = len(malla.data.vertices)
metodo = "directo"
if sin_peso > total * 0.01:
    metodo = "vóxel"
    for mod in list(malla.modifiers):
        malla.modifiers.remove(mod)
    malla.vertex_groups.clear()
    malla.parent = None
    # Copia cerrada: vóxeles, pesos sobre ella y se pasan al original por cercanía
    copia = malla.copy()
    copia.data = malla.data.copy()
    bpy.context.scene.collection.objects.link(copia)
    rem = copia.modifiers.new("voxel", "REMESH")
    rem.mode = "VOXEL"
    rem.voxel_size = TAM_VOXEL
    bpy.context.view_layer.objects.active = copia
    bpy.ops.object.modifier_apply(modifier=rem.name)
    pesar(copia)
    for mod in list(copia.modifiers):
        copia.modifiers.remove(mod)
    bpy.ops.object.select_all(action="DESELECT")
    tr = malla.modifiers.new("pesos", "DATA_TRANSFER")
    tr.object = copia
    tr.use_vert_data = True
    tr.data_types_verts = {"VGROUP_WEIGHTS"}
    tr.vert_mapping = "POLYINTERP_NEAREST"
    tr.layers_vgroup_select_src = "ALL"
    tr.layers_vgroup_select_dst = "NAME"
    bpy.context.view_layer.objects.active = malla
    malla.select_set(True)
    bpy.ops.object.datalayout_transfer(modifier=tr.name)
    bpy.ops.object.modifier_apply(modifier=tr.name)
    bpy.data.objects.remove(copia, do_unlink=True)
    malla.parent = arm
    am = malla.modifiers.new("esqueleto", "ARMATURE")
    am.object = arm
    sin_peso = sum(1 for v in malla.data.vertices if not any(g.weight > 1e-4 for g in v.groups))

# Como mucho 4 huesos por vértice y que sumen 1 (lo que admite el juego)
bpy.context.view_layer.objects.active = malla
bpy.ops.object.select_all(action="DESELECT")
malla.select_set(True)
bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
bpy.ops.object.mode_set(mode="OBJECT")

bpy.ops.object.select_all(action="SELECT")
# Sin materiales: el juego le pone el del modelo original (misma textura y mismas UV), así pesa mucho menos
bpy.ops.export_scene.gltf(filepath=salida, export_format="GLB", export_skins=True, export_animations=False, export_yup=True,
                          export_apply=False, export_materials="NONE")
# Lista de los que tienen esqueleto (el juego solo pide esos)
from pathlib import Path
carpeta = Path(salida).parent
(carpeta / "manifest.json").write_text(json.dumps(sorted(p.stem for p in carpeta.glob("*.glb"))), encoding="utf-8")
print(f"ok {salida} · {total} vértices, {sin_peso} sin peso · pesos {metodo}")
