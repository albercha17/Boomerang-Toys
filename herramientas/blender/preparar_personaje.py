"""Prepara el modelo 3D de un personaje para el juego (sin ventana):

  blender -b --factory-startup --python herramientas/blender/preparar_personaje.py -- <entrada.glb> <salida.glb> [caras] [--quitar-arriba F]

Junta sus mallas, lo reduce (15.000 caras por defecto) con texturas de 1024 px, lo apoya en el suelo centrado
y lo exporta. Si trae varios materiales, los hornea en una sola textura (el juego trabaja con una malla y un
material por personaje). --quitar-arriba F borra las piezas sueltas que empiezan por encima de esa fracción de la
altura (un casco suelto flotando sobre la cabeza). El juego le pone luego el esqueleto (entities/IaFigure.js).
"""
import sys

import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
QUITAR_ARRIBA = float(args[args.index("--quitar-arriba") + 1]) if "--quitar-arriba" in args else None
if "--quitar-arriba" in args:
    del args[args.index("--quitar-arriba"):args.index("--quitar-arriba") + 2]
entrada, salida = args[0], args[1]
CARAS = int(args[2]) if len(args) > 2 else 15000

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=entrada)
mallas = [o for o in bpy.data.objects if o.type == "MESH"]
# Fuera las mallas diminutas que a veces traen (una esfera suelta) y el esqueleto que traiga: el juego pone el suyo
mayor = max(len(o.data.polygons) for o in mallas)
mallas = sorted([o for o in mallas if len(o.data.polygons) >= mayor * 0.01], key=lambda o: -len(o.data.polygons))
for o in mallas:
    for mod in list(o.modifiers):
        if mod.type == "ARMATURE":
            o.modifiers.remove(mod)
    matriz = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = matriz
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

if QUITAR_ARRIBA is not None:
    # Piezas sueltas que empiezan muy arriba (flotando sobre la cabeza): fuera
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    zs = [v.co.z for v in bm.verts]
    z0, z1 = min(zs), max(zs)
    limite = z0 + (z1 - z0) * QUITAR_ARRIBA
    sin_visitar = set(bm.verts)
    borrar = []
    while sin_visitar:
        pila = [sin_visitar.pop()]
        isla = []
        while pila:
            v = pila.pop()
            isla.append(v)
            for e in v.link_edges:
                o = e.other_vert(v)
                if o in sin_visitar:
                    sin_visitar.discard(o)
                    pila.append(o)
        if min(v.co.z for v in isla) > limite:
            borrar.extend(isla)
    bmesh.ops.delete(bm, geom=borrar, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    print(f"quitadas piezas sueltas de arriba: {len(borrar)} vértices", flush=True)

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

# Varios materiales: se hornean en una sola textura (UV nuevas) con un solo material
if len([s for s in obj.material_slots if s.material]) > 1:
    me = obj.data
    nombre_viejo = me.uv_layers.active.name
    me.uv_layers.active.active_render = True  # los materiales siguen leyendo sus UV de siempre
    uv_nuevo = me.uv_layers.new(name="atlas")
    me.uv_layers.active = uv_nuevo
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    atlas = bpy.data.images.new("atlas", 2048, 2048)
    for slot in obj.material_slots:
        m = slot.material
        if not m:
            continue
        m.use_nodes = True
        nodo = m.node_tree.nodes.new("ShaderNodeTexImage")
        nodo.image = atlas
        m.node_tree.nodes.active = nodo
    escena = bpy.context.scene
    escena.render.engine = "CYCLES"
    escena.cycles.device = "CPU"
    escena.cycles.samples = 4
    escena.render.bake.margin = 6
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})
    nuevo = bpy.data.materials.new("personaje")
    nuevo.use_nodes = True
    tex = nuevo.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = atlas
    nuevo.node_tree.links.new(tex.outputs["Color"], nuevo.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    me.materials.clear()
    me.materials.append(nuevo)
    for poligono in me.polygons:
        poligono.material_index = 0
    me.uv_layers.remove(me.uv_layers[nombre_viejo])
    me.uv_layers["atlas"].active = True
    me.uv_layers["atlas"].active_render = True
    atlas.pack()
    print("textura única horneada (2048)", flush=True)

# Pies en el suelo y centrado
pts = [Vector(c) for c in obj.bound_box]
centro = Vector((sum(p.x for p in pts) / 8, sum(p.y for p in pts) / 8, min(p.z for p in pts)))
obj.data.transform(Matrix.Translation(-centro))
obj.location = (0, 0, 0)
dims = obj.dimensions
print(f"medidas: ancho {dims.x:.2f}, fondo {dims.y:.2f}, alto {dims.z:.2f}", flush=True)
bpy.ops.export_scene.gltf(filepath=salida, export_format="GLB", export_yup=True, export_image_format="JPEG")
print("ok", salida, flush=True)
