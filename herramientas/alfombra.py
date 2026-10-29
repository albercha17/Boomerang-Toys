"""Dibuja la alfombra infantil de carreteras (public/art/suelos/alfombra.png) para el suelo «alfombra».

  python herramientas/alfombra.py [ancho alto]      medidas del mapa en unidades (por defecto 36 × 22)

La imagen cubre la zona de juego entera (arriba = fondo del mapa). 64 píxeles por unidad.
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

W, D = (float(sys.argv[1]), float(sys.argv[2])) if len(sys.argv) > 2 else (36.0, 22.0)
PX = 64
img = Image.new("RGB", (int(W * PX), int(D * PX)), "#b9e3a4")
g = ImageDraw.Draw(img)
random.seed(4)


def P(x, z):
    """Punto del juego (x, z) -> píxel."""
    return ((x + W / 2) * PX, (z + D / 2) * PX)


def rect(x0, z0, x1, z1, fill, radius=0, outline=None, width=0):
    g.rounded_rectangle([P(x0, z0), P(x1, z1)], radius=radius * PX, fill=fill, outline=outline, width=width)


def circle(x, z, r, fill, outline=None, width=0):
    cx, cy = P(x, z)
    g.ellipse([cx - r * PX, cy - r * PX, cx + r * PX, cy + r * PX], fill=fill, outline=outline, width=width)


# Pelusa de la alfombra: motitas de dos tonos
for _ in range(int(W * D * 6)):
    x, y = random.uniform(0, W * PX), random.uniform(0, D * PX)
    c = random.choice(["#acd897", "#c4ebb0", "#a5d08f"])
    g.ellipse([x, y, x + 5, y + 5], fill=c)

ROAD = "#7d828c"
LINE = "#f5f5f0"
RW = 1.5  # ancho de las carreteras

# Carretera de circunvalación (rectángulo redondeado) y las dos calles que se cruzan en la rotonda
ring = (W / 2 - 2.6, D / 2 - 2.2)
rect(-ring[0] - RW / 2, -ring[1] - RW / 2, ring[0] + RW / 2, ring[1] + RW / 2, ROAD, radius=3.2)
rect(-ring[0] + RW / 2, -ring[1] + RW / 2, ring[0] - RW / 2, ring[1] - RW / 2, "#b9e3a4", radius=3.2 - RW)
rect(-RW / 2, -ring[1], RW / 2, ring[1], ROAD)
rect(-ring[0], -RW / 2, ring[0], RW / 2, ROAD)
circle(0, 0, 2.3, ROAD)
circle(0, 0, 1.1, "#8fd06f", outline=LINE, width=6)


def dashes(points, step=0.9, length=0.45, width=5):
    """Raya discontinua por una lista de puntos."""
    acc = 0.0
    for (x0, z0), (x1, z1) in zip(points, points[1:]):
        seg = math.hypot(x1 - x0, z1 - z0)
        t = 0.0
        while t < seg:
            if (acc + t) % step < length:
                a = t / seg
                b = min(seg, t + 0.1) / seg
                g.line([P(x0 + (x1 - x0) * a, z0 + (z1 - z0) * a), P(x0 + (x1 - x0) * b, z0 + (z1 - z0) * b)], fill=LINE, width=width)
            t += 0.1
        acc += seg


# Rayas: por el centro de la circunvalación y de las calles (sin entrar en la rotonda)
rx, rz = ring
r = 3.2
arc = lambda cx, cz, a0: [(cx + math.cos(a0 + k * math.pi / 2 / 12) * (r - 0.0), cz + math.sin(a0 + k * math.pi / 2 / 12) * r) for k in range(13)]  # noqa: E731
loop = [(-rx + r, -rz), (rx - r, -rz)] + arc(rx - r, -rz + r, -math.pi / 2) + [(rx, rz - r)] + arc(rx - r, rz - r, 0) + [(-rx + r, rz)] \
    + arc(-rx + r, rz - r, math.pi / 2) + [(-rx, -rz + r)] + arc(-rx + r, -rz + r, math.pi) + [(-rx + r, -rz)]
dashes(loop)
for pts in ([(0, -rz + RW / 2), (0, -2.4)], [(0, 2.4), (0, rz - RW / 2)], [(-rx + RW / 2, 0), (-2.4, 0)], [(2.4, 0), (rx - RW / 2, 0)]):
    dashes(pts)


def zebra(x, z, along_x):
    """Paso de cebra atravesando una calle."""
    for k in range(5):
        o = -RW / 2 + 0.15 + k * 0.28
        if along_x:
            rect(x - 0.45, z + o, x + 0.45, z + o + 0.16, LINE)
        else:
            rect(x + o, z - 0.45, x + o + 0.16, z + 0.45, LINE)


for x in (-4.2, 4.2):  # en la calle de lado a lado, rayas a lo largo de x
    zebra(x, 0, True)
for z in (-3.4, 3.4):
    zebra(0, z, False)

# Manzanas: dentro, un estanque, un parque, casitas y una plaza; fuera, árboles y aparcamientos
circle(-7.2, -3.0, 1.9, "#6ec6f0", outline="#4aa3d8", width=8)
circle(-7.9, -3.4, 0.35, "#ffffff")
rect(4.2, -4.4, 9.6, -1.6, "#95d97a", radius=0.6, outline="#6fbf55", width=6)
for x, z in [(5.2, -3.6), (6.6, -2.5), (8.4, -3.5), (9.0, -2.3)]:
    circle(x, z, 0.45, "#4fae3f")


def house(x, z, color):
    rect(x - 0.8, z - 0.55, x + 0.8, z + 0.55, color, radius=0.1, outline="#00000022", width=3)
    g.polygon([P(x - 0.9, z - 0.55), P(x, z - 1.25), P(x + 0.9, z - 0.55)], fill="#e8574d")
    rect(x - 0.18, z + 0.05, x + 0.18, z + 0.55, "#8a5a3c")


for i, x in enumerate((-9.2, -6.8, -4.4)):
    house(x, 3.6, ["#ffd36b", "#9ad0ff", "#ffb3c7"][i])
rect(4.4, 2.0, 9.4, 4.6, "#f0d9a8", radius=0.4)  # plaza
circle(6.9, 3.3, 0.7, "#6ec6f0", outline="#ffffff", width=6)
for x in range(-16, 17, 3):
    for z in (-D / 2 + 1.3, D / 2 - 1.3):
        if abs(x) > 1.5:
            circle(x + random.uniform(-0.3, 0.3), z, 0.42, "#4fae3f")
for sx in (-1, 1):
    for k in range(3):
        rect(sx * (W / 2 - 1.4) - 0.5, -2 + k * 1.4, sx * (W / 2 - 1.4) + 0.5, -1.0 + k * 1.4, "#c9ccd2", radius=0.1, outline=LINE, width=4)

# Borde de la alfombra: banda azul con puntos blancos y ribete amarillo
B = 0.55
g.rectangle([0, 0, W * PX, B * PX], fill="#2f6db5")
g.rectangle([0, (D - B) * PX, W * PX, D * PX], fill="#2f6db5")
g.rectangle([0, 0, B * PX, D * PX], fill="#2f6db5")
g.rectangle([(W - B) * PX, 0, W * PX, D * PX], fill="#2f6db5")
for x in [i * 0.8 + 0.4 for i in range(int(W / 0.8))]:
    for z in (B / 2, D - B / 2):
        circle(x - W / 2, z - D / 2, 0.09, "#ffffff")
for z in [i * 0.8 + 0.4 for i in range(int(D / 0.8))]:
    for x in (B / 2, W - B / 2):
        circle(x - W / 2, z - D / 2, 0.09, "#ffffff")
g.rectangle([B * PX, B * PX, (W - B) * PX, (D - B) * PX], outline="#ffd43b", width=10)

out = Path(__file__).resolve().parents[1] / "public" / "art" / "suelos" / "alfombra.png"
img.save(out, optimize=True)
print(out, img.size)
