"""Hornea en Blender la base de un mapa (mesa o suelo con huecos y paredes) con su luz. Se ejecuta sin ventana:

  blender -b --factory-startup --python herramientas/blender/hornear_base.py -- <id> [--muestras 64] [--rapido] [--json <ruta>]

Lee public/maps/<id>.json (o el de --json) y escribe public/models/mapas/<id>/base.glb y las texturas horneadas.
Los objetos NO van horneados: el juego los pone en vivo (con sombras en tiempo real) para poder editarlos.
Lo lanza el servidor al guardar un mapa en el editor (server/maps.js), que luego escribe base.json con su huella.

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
RUTA_JSON = Path(args[args.index("--json") + 1]) if "--json" in args else RAIZ / "public" / "maps" / f"{MAPA}.json"
datos = json.loads(RUTA_JSON.read_text(encoding="utf-8"))
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


def material_madera(nombre, tablones=6, largo_x=True):
    """Madera de mesa por código: tablones anchos (a lo largo de x), veta suave y color miel."""
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    n = nt.nodes
    bsdf = n["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.45
    coord = n.new("ShaderNodeTexCoord")
    sep = n.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])
    # índice de tablón según y (Blender) -> cada tablón con su tono
    tabla = n.new("ShaderNodeMath"); tabla.operation = "MULTIPLY"; tabla.inputs[1].default_value = tablones / D
    nt.links.new(sep.outputs["Y"], tabla.inputs[0])
    suelo_t = n.new("ShaderNodeMath"); suelo_t.operation = "FLOOR"
    nt.links.new(tabla.outputs[0], suelo_t.inputs[0])
    frac = n.new("ShaderNodeMath"); frac.operation = "FRACT"
    nt.links.new(tabla.outputs[0], frac.inputs[0])
    ruido_t = n.new("ShaderNodeTexWhiteNoise"); ruido_t.noise_dimensions = "1D"
    nt.links.new(suelo_t.outputs[0], ruido_t.inputs["W"])
    # veta: ondas a lo largo del tablón con algo de ruido
    veta = n.new("ShaderNodeTexWave"); veta.wave_type = "BANDS"; veta.bands_direction = "Y"
    veta.inputs["Scale"].default_value = 1.6
    veta.inputs["Distortion"].default_value = 6
    veta.inputs["Detail"].default_value = 3
    nt.links.new(coord.outputs["Object"], veta.inputs["Vector"])
    rampa = n.new("ShaderNodeValToRGB")
    rampa.color_ramp.elements[0].color = (0.42, 0.21, 0.08, 1)
    rampa.color_ramp.elements[1].color = (0.66, 0.38, 0.16, 1)
    mezcla = n.new("ShaderNodeMath"); mezcla.operation = "MULTIPLY_ADD"
    nt.links.new(veta.outputs["Fac"], mezcla.inputs[0]); mezcla.inputs[1].default_value = 0.35
    nt.links.new(ruido_t.outputs["Value"], mezcla.inputs[2])
    nt.links.new(mezcla.outputs[0], rampa.inputs["Fac"])
    # juntas oscuras entre tablones
    junta = n.new("ShaderNodeMath"); junta.operation = "LESS_THAN"; junta.inputs[1].default_value = 0.025
    nt.links.new(frac.outputs[0], junta.inputs[0])
    oscuro = n.new("ShaderNodeMix"); oscuro.data_type = "RGBA"
    nt.links.new(junta.outputs[0], oscuro.inputs["Factor"])
    nt.links.new(rampa.outputs["Color"], oscuro.inputs["A"])
    oscuro.inputs["B"].default_value = (0.32, 0.17, 0.07, 1)
    nt.links.new(oscuro.outputs["Result"], bsdf.inputs["Base Color"])
    return m


def material_baldosas(nombre, lado=1.6, color2=(0.36, 0.58, 0.85)):
    """Baldosas por código: blancas con algunas de color (azul claro; rosas en el mundo Barbie) y junta gris."""
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.25
    coord = nt.nodes.new("ShaderNodeTexCoord")
    ladrillo = nt.nodes.new("ShaderNodeTexBrick")
    ladrillo.offset = 0
    ladrillo.inputs["Scale"].default_value = 1 / lado
    ladrillo.inputs["Brick Width"].default_value = 1
    ladrillo.inputs["Row Height"].default_value = 1
    ladrillo.inputs["Mortar Size"].default_value = 0.03
    ladrillo.inputs["Color1"].default_value = (0.95, 0.95, 0.93, 1)
    ladrillo.inputs["Color2"].default_value = (*color2, 1)
    ladrillo.inputs["Mortar"].default_value = (0.7, 0.7, 0.72, 1)
    ladrillo.inputs["Bias"].default_value = 0.35  # mezcla de blancas y azules
    nt.links.new(coord.outputs["Object"], ladrillo.inputs["Vector"])
    nt.links.new(ladrillo.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def material_terreno(nombre, tipo):
    """Arena del desierto o hierba por código: dos tonos mezclados con ruido y piedrecitas más oscuras."""
    claro, oscuro, piedra = {
        "arena": ((0.60, 0.40, 0.20), (0.43, 0.27, 0.13), (0.28, 0.17, 0.09)),
        "hierba": ((0.22, 0.42, 0.12), (0.14, 0.30, 0.08), (0.11, 0.21, 0.06)),
        "noche": ((0.10, 0.15, 0.10), (0.06, 0.09, 0.08), (0.05, 0.05, 0.07)),  # césped de cementerio, de noche
    }[tipo]
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.95
    coord = nt.nodes.new("ShaderNodeTexCoord")
    ruido = nt.nodes.new("ShaderNodeTexNoise")
    ruido.inputs["Scale"].default_value = 1.1
    ruido.inputs["Detail"].default_value = 6
    nt.links.new(coord.outputs["Object"], ruido.inputs["Vector"])
    mezcla = nt.nodes.new("ShaderNodeMix")
    mezcla.data_type = "RGBA"
    mezcla.inputs[6].default_value = (*claro, 1)
    mezcla.inputs[7].default_value = (*oscuro, 1)
    nt.links.new(ruido.outputs["Fac"], mezcla.inputs[0])
    piedras = nt.nodes.new("ShaderNodeTexVoronoi")
    piedras.inputs["Scale"].default_value = 5
    nt.links.new(coord.outputs["Object"], piedras.inputs["Vector"])
    umbral = nt.nodes.new("ShaderNodeMath")
    umbral.operation = "LESS_THAN"
    umbral.inputs[1].default_value = 0.07
    nt.links.new(piedras.outputs["Distance"], umbral.inputs[0])
    final = nt.nodes.new("ShaderNodeMix")
    final.data_type = "RGBA"
    final.inputs[7].default_value = (*piedra, 1)
    nt.links.new(umbral.outputs[0], final.inputs[0])
    nt.links.new(mezcla.outputs[2], final.inputs[6])
    nt.links.new(final.outputs[2], bsdf.inputs["Base Color"])
    return m


def material_alfombra(nombre):
    """Alfombra infantil de carreteras (herramientas/alfombra.py): una imagen que cubre la zona de juego entera."""
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.95
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(SUELOS / "alfombra.png"))
    tex.extension = "EXTEND"
    mapa = nt.nodes.new("ShaderNodeMapping")  # coordenadas del objeto -> 0..1 sobre la zona de juego
    mapa.inputs["Scale"].default_value = (1 / W, 1 / D, 1)
    mapa.inputs["Location"].default_value = (0.5, 0.5, 0)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coord.outputs["Object"], mapa.inputs["Vector"])
    nt.links.new(mapa.outputs["Vector"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def material_suelo(nombre, tipo, lado):
    if tipo == "alfombra":
        return material_alfombra(nombre)
    if tipo == "rosa":
        return material_baldosas(nombre, lado, (0.97, 0.60, 0.77))
    return material_baldosas(nombre, lado) if tipo == "baldosas" else material_terreno(nombre, tipo)


def material_color(nombre, rgb, rugosidad=0.5):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rugosidad
    return m


HORNEAR = []  # (objeto, tamaño de la imagen, nombre)
if "table" in datos:
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
    madera = material_madera("madera")
    tablero.data.materials.append(madera)
    bpy.context.view_layer.objects.active = tablero
    tablero.select_set(True)
    canto = tablero.modifiers.new("canto", "BEVEL")  # canto redondeado, como una mesa de verdad
    canto.width = 0.22
    canto.segments = 4
    bpy.ops.object.modifier_apply(modifier=canto.name)
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
    suelo.scale = (W * 3.6, D * 4.2, 1)
    bpy.ops.object.transform_apply(scale=True)
    suelo.data.materials.append(material_baldosas("baldosas"))



    HORNEAR += [(tablero, 1024 if RAPIDO else 2048, "tablero_luz"), (suelo, 512 if RAPIDO else 1024, "suelo_luz")]
else:
    # --- habitación: suelo de azulejos con huecos (la bañera hundida) y paredes al fondo y a los lados ----------
    r = datos["room"]
    W, D, ALTO_PARED = r["w"], r["d"], r.get("wallHeight", 3)
    ALTO = r.get("pitDepth", 3)  # profundidad de los huecos (allí va el suelo de fondo de la física)
    huecos = r.get("pits", [])
    # Suelo: losa fina con los huecos recortados (cajas de esquinas redondeadas, con la forma de la bañera)
    bpy.ops.mesh.primitive_cube_add(size=1, location=g2b(0, -0.05, 0))
    suelo = bpy.context.active_object
    suelo.name = "HORNEADO_suelo"
    suelo.scale = (W, D, 0.1)
    bpy.ops.object.transform_apply(scale=True)
    for i, h in enumerate(huecos):
        bpy.ops.mesh.primitive_cube_add(size=1, location=g2b(h["x"], -1, h["z"]))
        corte = bpy.context.active_object
        corte.scale = (h["w"], h["d"], 4)
        bpy.ops.object.transform_apply(scale=True)
        if h.get("round"):
            bisel = corte.modifiers.new("redondo", "BEVEL")
            bisel.width = min(h["round"], h["w"] / 2 - 0.01, h["d"] / 2 - 0.01)
            bisel.segments = 10
            bisel.affect = "EDGES"
            bpy.context.view_layer.objects.active = corte
            bpy.ops.object.modifier_apply(modifier=bisel.name)
        hueco = suelo.modifiers.new(f"hueco{i}", "BOOLEAN")
        hueco.operation = "DIFFERENCE"
        hueco.solver = "EXACT"
        hueco.object = corte
        bpy.context.view_layer.objects.active = suelo
        bpy.ops.object.modifier_apply(modifier=hueco.name)
        bpy.data.objects.remove(corte, do_unlink=True)
    suelo.data.materials.clear()  # el recorte deja huecos de material vacíos
    TIPO = r.get("floor", "baldosas")
    suelo.data.materials.append(material_suelo("suelo", TIPO, r.get("tile", 1.4)))
    for poligono in suelo.data.polygons:
        poligono.material_index = 0
    fuera = []
    FUERA = {"arena": "arena", "hierba": "hierba", "rosa": "hierba", "alfombra": "madera", "noche": "noche"}.get(TIPO)  # la terraza rosa, sobre césped; la alfombra, sobre parqué
    if FUERA and r.get("walls", "baldosas") == "ninguna":  # al aire libre: el terreno sigue más allá de la zona de juego
        bpy.ops.mesh.primitive_plane_add(size=1, location=g2b(0, -0.12, 0))
        f = bpy.context.active_object
        f.name = "HORNEADO_fuera"
        f.scale = (W * 3, D * 4, 1)
        bpy.ops.object.transform_apply(scale=True)
        # agujero del tamaño de la zona de juego: el terreno de fuera no tapa los huecos ni el agua
        bpy.ops.mesh.primitive_cube_add(size=1, location=g2b(0, -0.12, 0))
        corte = bpy.context.active_object
        corte.scale = (W, D, 1)
        bpy.ops.object.transform_apply(scale=True)
        agujero = f.modifiers.new("agujero", "BOOLEAN")
        agujero.operation = "DIFFERENCE"
        agujero.solver = "EXACT"
        agujero.object = corte
        bpy.context.view_layer.objects.active = f
        bpy.ops.object.modifier_apply(modifier=agujero.name)
        bpy.data.objects.remove(corte, do_unlink=True)
        f.data.materials.clear()  # el recorte deja huecos de material vacíos
        f.data.materials.append(material_madera("fuera", tablones=int(D)) if FUERA == "madera" else material_terreno("fuera", FUERA))
        for poligono in f.data.polygons:
            poligono.material_index = 0
        fuera.append(f)
    # Paredes: fondo y lados (la de delante no se pone: taparía la vista); ninguna si el mapa no las quiere
    paredes = []
    muros = {"fondo": (0, -D / 2 - 0.25, W + 1, 0.5), "izq": (-W / 2 - 0.25, 0, 0.5, D), "der": (W / 2 + 0.25, 0, 0.5, D)}
    for nombre, (x, z, w, d) in (muros.items() if r.get("walls", "baldosas") == "baldosas" else []):
        bpy.ops.mesh.primitive_cube_add(size=1, location=g2b(x, ALTO_PARED / 2, z))
        p = bpy.context.active_object
        p.scale = (w, d, ALTO_PARED)
        bpy.ops.object.transform_apply(scale=True)
        p.name = f"HORNEADO_pared_{nombre}"
        p.data.materials.append(material_baldosas(f"azulejos_{nombre}", r.get("wallTile", 0.7)))
        paredes.append(p)
    HORNEAR += [(suelo, 1024 if RAPIDO else 2048, "suelo_luz")] + [(p, 512 if RAPIDO else 1024, f"{p.name[9:]}_luz") for p in paredes]
    HORNEAR += [(f, 512 if RAPIDO else 1024, "fuera_luz") for f in fuera]


# --- luz: sol de ventana y cielo cálido (misma dirección que el sol del juego) ------------
sol = bpy.data.lights.new("sol", type="SUN")
sol.energy = 2.4
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
mundo.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.42
if datos.get("room", {}).get("floor") == "noche":  # de noche: luz de luna, más floja y azulada, y cielo oscuro
    sol.energy = 1.2
    sol.color = (0.72, 0.78, 1.0)
    mundo.node_tree.nodes["Background"].inputs["Color"].default_value = (0.35, 0.32, 0.55, 1)
    mundo.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.3


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


for objeto, tam, nombre in HORNEAR:
    hornear(objeto, tam, nombre)


# --- exportar ------------------------------------------------------------------------------------
for o in list(scene.objects):
    if o.type == "LIGHT":
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=str(SALIDA / "base.glb"), export_format="GLB", export_yup=True,
                          export_image_format="JPEG", export_apply=True)
print("base exportada", SALIDA / "base.glb", flush=True)
print("FIN", flush=True)
