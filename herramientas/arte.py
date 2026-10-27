"""Encargos de arte para ChatGPT: personajes y suelos de las zonas de la casa.

Cada entrada: id -> (tipo, prompt). Tipos:
  personaje: figura de cuerpo entero sobre fondo blanco (se recorta y se le quita el fondo)
  suelo:     textura cuadrada repetible vista desde arriba
"""

ESTILO = (
    "Estilo de videojuego de dibujos animados moderno, como Boomerang Fu u Overcooked: "
    "formas redondeadas y simpáticas, contorno negro grueso y limpio, colores vivos y saturados, "
    "sombreado plano en dos tonos, aspecto de juguete de plástico brillante. Sin texto ni letras."
)

FIGURA = (
    "Un solo personaje de cuerpo entero, de pie, visto de frente y ligeramente de tres cuartos, "
    "con los brazos un poco separados del cuerpo y las piernas visibles, centrado y ocupando casi toda la altura. "
    "Fondo completamente blanco liso (#FFFFFF), sin suelo, sin sombra, sin marco y sin nada más alrededor. "
    "Proporciones chibi: cabeza grande, cuerpo pequeño. Imagen cuadrada."
)

PERSONAJES = {
    "peon": "un muñeco peón de madera barnizada, con cara sonriente pintada y un gorrito rojo",
    "muneca": "una muñeca fashion de plástico con melena rubia, vestido rosa de lunares blancos, diadema y tacones rosas",
    "heroe": "un muñeco de acción musculoso con chaleco de camuflaje, cinta roja en la frente, pantalón militar y botas",
    "soldado": "un muñequito clásico de plástico verde de una sola pieza, como los de las bolsas de juguetes, con casco redondo y mochila, sin armas, saludando, de pie sobre su peana verde",
    "ranger": "un astronauta de juguete original y redondito con traje espacial naranja y azul marino, mochila cohete con dos llamitas, casco redondo con visera de cristal y antenita",
    "bichito": "un monstruito de juguete original, peludo y azul celeste, con tres ojos saltones, cuernecitos, dientes de conejo y zapatillas rojas",
    "robot": "un robot de hojalata de juguete antiguo, de color plateado, con antena con bombilla roja, remaches, ojos luminosos y pinzas",
    "osito": "un osito de peluche marrón blandito con orejas redondas, hocico claro, tripa clara y lazo rojo al cuello",
    "caballero": "un caballero de juguete con armadura plateada, penacho rojo en el casco, capa roja y escudo con una cruz",
    "dino": "un dinosaurio tiranosaurio de goma verde, simpático, con dientes, pinchos naranjas en la espalda y tripa amarilla",
    "pirata": "un pirata de juguete con sombrero tricornio negro, parche en el ojo, barba, camiseta de rayas rojas y pata de palo",
    "vaquero": "un vaquero de juguete con sombrero marrón, camisa de cuadros rojos, pañuelo amarillo, vaqueros, botas y estrella de sheriff",
}

SUELO = (
    "Textura cuadrada de suelo vista exactamente desde arriba (cenital, sin perspectiva), repetible sin cortes "
    "en los bordes (seamless), sin objetos, sin muebles, sin personajes y sin sombras de objetos. "
    "Colores alegres de dibujos animados con contornos finos. Imagen cuadrada."
)

SUELOS = {
    "salon": "suelo de tarima de madera cálida de un salón, con listones y alguna veta",
    "cocina": "suelo de baldosas de cocina a cuadros color crema y terracota",
    "patio": "césped de jardín verde con florecitas blancas y amarillas sueltas",
    "dormitorio": "moqueta de dormitorio infantil morada con estrellitas amarillas",
    "bano": "suelo de azulejos pequeños de baño de color turquesa con juntas blancas",
}


TEXTURAS = {
    # En blanco y grises claros: el juego la tiñe del color de cada bloque
    "bloque": (
        "Textura cuadrada de la cara lateral de un bloque de construcción de juguete de plástico, vista de frente y "
        "llenando toda la imagen hasta los bordes: plástico blanco brillante con un bisel redondeado en los cuatro "
        "bordes, un brillo suave arriba a la izquierda y sombreado gris muy claro, contorno oscuro fino en el borde. "
        "Solo blanco y grises claros, sin otros colores, sin fondo, sin texto. Imagen cuadrada."
    ),
}


def lista():
    encargos = []
    for id_, desc in PERSONAJES.items():
        encargos.append((f"personaje_{id_}", "personaje", f"Dibuja {desc}. {FIGURA} {ESTILO}"))
    for id_, desc in SUELOS.items():
        encargos.append((f"suelo_{id_}", "suelo", f"Dibuja una {SUELO} Tema: {desc}. {ESTILO}"))
    for id_, desc in TEXTURAS.items():
        encargos.append((f"textura_{id_}", "textura", f"Dibuja una {desc} {ESTILO}"))
    return encargos
