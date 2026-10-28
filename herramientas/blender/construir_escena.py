"""Monta en Blender la escena de un mapa (public/maps/<id>.json) y hornea su luz. Se ejecuta sin ventana:

  blender -b --factory-startup --python herramientas/blender/construir_escena.py -- <id> [--muestras 96] [--rapido]

Lee los modelos de herramientas/modelos_mapa/<id>/<modelo>.glb (de Tripo); si falta uno, pone una forma provisional.
Escribe public/models/mapas/<id>/escena.glb (tablero, suelo, objetos fijos y fondo; la luz y las sombras de los
objetos quedan horneadas en el tablero y el suelo) y los modelos que se mueven (p. ej. rodillo.glb) por separado.

Ejes: el juego usa y arriba y z hacia la cámara; Blender usa z arriba. Punto del juego (x, y, z) = Blender (x, -z, y).
"""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

RAIZ = Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MAPA = args[0] if args else "mesa"
MUESTRAS = int(args[args.index("--muestras") + 1]) if "--muestras" in args else 96
RAPIDO = "--rapido" in args
datos = json.loads((RAIZ / "public" / "maps" / f"{MAPA}.json").read_text(encoding="utf-8"))
MODELOS = RAIZ / "herramientas" / "modelos_mapa" / MAPA
SALIDA = RAIZ / "public" / "models" / "mapas" / MAPA
SALIDA.mkdir(parents=True, exist_ok=True)
SUELOS = RAIZ / "public" / "art" / "suelos"

g2b = lambda x, y, z: Vector((x, -z, y))  # noqa: E731  juego -> Blender

# --- escena vacía -------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 16 if RAPIDO else MUESTRAS
scene.render.bake.margin = 8


def material_imagen(nombre, ruta, escala=(1, 1)):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.6
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(ruta))
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (escala[0], escala[1], 1)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def material_color(nombre, rgb, rugosidad=0.5):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rugosidad
    return m


# --- la mesa: tablero con esquinas recortadas y patas -------------------------
t = datos["table"]
W, D, C, GROSOR, ALTO = t["w"], t["d"], t["chamfer"], t["thickness"], t["height"]
contorno = [(-W / 2 + C, -D / 2), (W / 2 - C, -D / 2), (W / 2, -D / 2 + C), (W / 2, D / 2 - C),
            (W / 2 - C, D / 2), (-W / 2 + C, D / 2), (-W / 2, D / 2 - C), (-W / 2, -D / 2 + C)]
malla = bpy.data.meshes.new("tablero")
bm = bmesh.new()
arriba = [bm.verts.new(g2b(x, 0, z)) for x, z in contorno]
abajo = [bm.verts.new(g2b(x, -GROSOR, z)) for x, z in contorno]
bm.faces.new(arriba)
bm.faces.new(list(reversed(abajo)))
for i in range(len(contorno)):
    j = (i + 1) % len(contorno)
    bm.faces.new([arriba[i], abajo[i], abajo[j], arriba[j]])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(malla)
bm.free()
tablero = bpy.data.objects.new("HORNEADO_tablero", malla)
scene.collection.objects.link(tablero)
madera = material_imagen("madera", SUELOS / "salon.jpg", (W / 7, D / 7))
tablero.data.materials.append(madera)
bpy.context.view_layer.objects.active = tablero
tablero.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.cube_project(cube_size=W)  # coordenadas para la textura de madera
bpy.ops.object.mode_set(mode="OBJECT")
tablero.select_set(False)

patas = material_color("patas", (0.55, 0.32, 0.16), 0.55)
for sx in (-1, 1):
    for sz in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.55, depth=ALTO - GROSOR,
                                            location=g2b(sx * (W / 2 - 1.6), -GROSOR - (ALTO - GROSOR) / 2, sz * (D / 2 - 1.4)))
        pata = bpy.context.active_object
        pata.name = f"pata_{sx}_{sz}"
        pata.data.materials.append(patas)

# --- suelo de la cocina -----------------------------------------------------------
bpy.ops.mesh.primitive_plane_add(size=1, location=g2b(0, -ALTO, 0))
suelo = bpy.context.active_object
suelo.name = "HORNEADO_suelo"
suelo.scale = (70, 50, 1)
bpy.ops.object.transform_apply(scale=True)
suelo.data.materials.append(material_imagen("baldosas", SUELOS / "cocina.jpg", (70 / 5, 50 / 5)))


# --- objetos -----------------------------------------------------------------------
def importar(modelo, nombre):
    """Importa el GLB del modelo y lo junta en un objeto vacío (pivote en la base, centrado). None si no existe."""
    ruta = MODELOS / f"{modelo}.glb"
    if not ruta.exists():
        return None
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ruta))
    nuevos = [o for o in bpy.data.objects if o not in antes]
    mallas = [o for o in nuevos if o.type == "MESH"]
    if not mallas:
        return None
    for o in nuevos:
        o.select_set(o in mallas)
    bpy.context.view_layer.objects.active = mallas[0]
    if len(mallas) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    for o in nuevos:
        if o != obj and o.name in bpy.data.objects and o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    obj.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # pivote abajo y en el centro
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    centro = Vector((sum(p.x for p in pts) / 8, sum(p.y for p in pts) / 8, min(p.z for p in pts)))
    obj.data.transform(__import__("mathutils").Matrix.Translation(-centro))
    obj.location = (0, 0, 0)
    obj.name = nombre
    return obj


def provisional(obj_def, nombre):
    w, h, d = obj_def["size"]
    if obj_def.get("collider") == "cylinder" or obj_def.get("bush"):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.5, depth=1, location=(0, 0, 0.5))
    else:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.5))
    obj = bpy.context.active_object
    bpy.ops.object.transform_apply(location=True)
    obj.name = nombre
    color = (0.3, 0.7, 0.3) if obj_def.get("bush") else (0.85, 0.85, 0.9)
    obj.data.materials.append(material_color(f"prov_{nombre}", color))
    return obj


def encajar(obj, size):
    """Escala el objeto a sus medidas (ancho x, alto y, fondo z del juego)."""
    dims = obj.dimensions  # Blender: x, y (fondo), z (alto)
    w, h, d = size
    s = min(w / max(dims.x, 1e-3), d / max(dims.y, 1e-3), h / max(dims.z, 1e-3))
    obj.scale = (s, s, s)


faltan = []
for o in datos["objects"]:
    obj = importar(o["model"], o["id"])
    if obj is None:
        faltan.append(o["model"])
        obj = provisional(o, o["id"])
    encajar(obj, o["size"])
    obj.rotation_euler = (0, 0, math.radians(o.get("rot", 0)))
    obj.location = g2b(o["x"], 0, o["z"])

# --- sillas gigantes alrededor -----------------------------------------------------------
for i, (x, z, rot) in enumerate(datos.get("background", {}).get("chairs", [])):
    silla = importar("silla", f"silla_{i}")
    if silla is None:
        silla = provisional({"size": [4, 9, 4]}, f"silla_{i}")
    encajar(silla, [6, 11, 6])
    silla.rotation_euler = (0, 0, math.radians(rot))
    silla.location = g2b(x, -ALTO, z)

# --- luz: sol de ventana y cielo cálido (misma dirección que el sol del juego) ------------
sol = bpy.data.lights.new("sol", type="SUN")
sol.energy = 4.0
sol.angle = math.radians(8)  # sombras suaves
sol.color = (1.0, 0.95, 0.86)
sol_obj = bpy.data.objects.new("sol", sol)
scene.collection.objects.link(sol_obj)
direccion = g2b(-8, 18, 9).normalized()  # el sol del juego está en (-8, 18, 9)
sol_obj.rotation_euler = direccion.to_track_quat("Z", "Y").to_euler()
mundo = bpy.data.worlds.new("cielo")
scene.world = mundo
mundo.use_nodes = True
mundo.node_tree.nodes["Background"].inputs["Color"].default_value = (0.95, 0.88, 0.78, 1)
mundo.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9


# --- horneado: la luz y las sombras de todo, en la textura del tablero y del suelo --------------
def hornear(obj, tam, nombre):
    img = bpy.data.images.new(nombre, tam, tam)
    for slot in obj.material_slots:
        nt = slot.material.node_tree
        nodo = nt.nodes.new("ShaderNodeTexImage")
        nodo.image = img
        nt.nodes.active = nodo
    # UV propias para el horneado (la de la textura repetida se solapa)
    uv = obj.data.uv_layers.new(name="horneado")
    obj.data.uv_layers.active = uv
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    for i, layer in enumerate(obj.data.uv_layers):
        layer.active_render = layer.name != "horneado"  # la textura de madera sigue usando su UV
    bpy.ops.object.bake(type="COMBINED", margin=8)
    ruta = SALIDA / f"{nombre}.png"
    img.filepath_raw = str(ruta)
    img.file_format = "PNG"
    img.save()
    # Material final: solo la imagen horneada (en el juego se dibuja sin luz)
    final = bpy.data.materials.new(f"{nombre}_mat")
    final.use_nodes = True
    nt = final.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    uvmap = nt.nodes.new("ShaderNodeUVMap")
    uvmap.uv_map = "horneado"
    nt.links.new(uvmap.outputs["UV"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    obj.data.materials.clear()
    obj.data.materials.append(final)
    # solo la UV del horneado
    for layer in list(obj.data.uv_layers):
        if layer.name != "horneado":
            obj.data.uv_layers.remove(layer)
    print(f"horneado {nombre}", flush=True)


hornear(tablero, 1024 if RAPIDO else 2048, "tablero_luz")
hornear(suelo, 512 if RAPIDO else 1024, "suelo_luz")

# --- exportar ------------------------------------------------------------------------------------
for o in list(scene.objects):
    if o.type == "LIGHT":
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=str(SALIDA / "escena.glb"), export_format="GLB", export_yup=True,
                          export_image_format="JPEG", export_apply=True)
print("escena exportada", SALIDA / "escena.glb", flush=True)

# Modelos que se mueven (rodillo): por separado, normalizados (pivote centrado en la base)
bpy.ops.wm.read_factory_settings(use_empty=True)
for m in datos.get("movers", []):
    obj = importar(m["model"], m["model"])
    if obj is None:
        print("falta el modelo de", m["model"], flush=True)
        continue
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(SALIDA / f"{m['model']}.glb"), export_format="GLB", use_selection=True,
                              export_yup=True, export_image_format="JPEG")
print("FALTAN:", sorted(set(faltan)) if faltan else "ninguno", flush=True)
print("FIN", flush=True)
