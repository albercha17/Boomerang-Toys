"""Pinta las pieles de los juguetes sobre la plantilla de Kenney «Blocky Characters» (texturas 1024×1024).

Uso:  python herramientas/pieles.py      -> public/models/skins/<id>.png

Zonas de la plantilla (px; cada cara en su casilla):
  cabeza  arriba (128,0)-(256,128) · fila y128-256: lado 0-128, CARA 128-256, lado 256-384, nuca 384-512 · cuello (128,256)-(256,384)
  torso   arriba (96,688)-(224,784) · fila y784-928: lado 0-96, PECHO 96-224, lado 224-320, espalda 320-448 · abajo (96,928)-(224,1024)
  brazos  izq. x480-736, der. x768-1024: hombro y534-598 (1.ª casilla), mano (2.ª casilla); lados y598-768 (mano abajo)
  piernas izq. x480-736, der. x768-1024: arriba y800-864 (1.ª), suela (2.ª); lados y864-1024 (pie abajo)
"""
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
BASES = RAIZ / "public" / "models" / "blocky" / "Textures"
SALIDA = RAIZ / "public" / "models" / "skins"
S = 2  # se pinta al doble y se reduce: bordes suaves

HEAD_TOP, HEAD_BOTTOM = (128, 0, 256, 128), (128, 256, 256, 384)
HEAD_ROW = [(0, 128, 128, 256), (128, 128, 256, 256), (256, 128, 384, 256), (384, 128, 512, 256)]  # lado, cara, lado, nuca
TORSO_TOP, TORSO_BOTTOM = (96, 688, 224, 784), (96, 928, 224, 1024)
TORSO_ROW = [(0, 784, 96, 928), (96, 784, 224, 928), (224, 784, 320, 928), (320, 784, 448, 928)]  # lado, pecho, lado, espalda
ARMS = [480, 768]
LEGS = [480, 768]


def oscuro(c, f=0.78):
    return tuple(int(v * f) for v in c[:3])


def claro(c, f=0.25):
    return tuple(int(v + (255 - v) * f) for v in c[:3])


class Piel:
    def __init__(self, base="a"):
        img = Image.open(BASES / f"texture-{base}.png").convert("RGBA")
        self.img = img.resize((img.width * S, img.height * S), Image.NEAREST)
        self.d = ImageDraw.Draw(self.img)

    # --- primitivas en coordenadas de la plantilla (1024) ---
    def rect(self, box, color, r=0):
        x0, y0, x1, y1 = (v * S for v in box)
        if r:
            self.d.rounded_rectangle((x0, y0, x1 - 1, y1 - 1), r * S, fill=color)
        else:
            self.d.rectangle((x0, y0, x1 - 1, y1 - 1), fill=color)

    def ellipse(self, box, color):
        self.d.ellipse(tuple(v * S for v in box), fill=color)

    def poly(self, pts, color):
        self.d.polygon([(x * S, y * S) for x, y in pts], fill=color)

    def arc(self, box, a0, a1, color, w):
        self.d.arc(tuple(v * S for v in box), a0, a1, fill=color, width=w * S)

    # --- piezas enteras ---
    def cabeza(self, color, cara=None):
        for box in [HEAD_TOP, HEAD_BOTTOM, *HEAD_ROW]:
            self.rect(box, color)

    def torso(self, color, lados=None):
        for box in [TORSO_TOP, TORSO_BOTTOM, *TORSO_ROW]:
            self.rect(box, color)
        if lados:
            for box in (TORSO_ROW[0], TORSO_ROW[2]):
                self.rect(box, lados)
        self.franja_torso(oscuro(color, 0.9), 914, 928)  # sombra suave abajo, como Kenney

    def franja_torso(self, color, y0, y1):
        for x0, _, x1, _ in TORSO_ROW:
            self.rect((x0, y0, x1, y1), color)

    def brazos(self, manga, mano, puno=None, corte=704):
        for x in ARMS:
            self.rect((x, 534, x + 64, 598), manga)  # hombro
            self.rect((x + 64, 534, x + 128, 598), mano)  # palma
            self.rect((x, 598, x + 256, corte), manga)
            if puno:
                self.rect((x, corte, x + 256, corte + 22), puno)
                self.rect((x, corte + 22, x + 256, 768), mano)
            else:
                self.rect((x, corte, x + 256, 768), mano)
            self.rect((x, corte - 10, x + 256, corte), oscuro(manga, 0.9))

    def piernas(self, color, zapato, alto_zapato=40):
        for x in LEGS:
            self.rect((x, 800, x + 64, 864), color)
            self.rect((x + 64, 800, x + 128, 864), oscuro(zapato, 0.85))  # suela
            self.rect((x, 864, x + 256, 1024 - alto_zapato), color)
            self.rect((x, 1024 - alto_zapato, x + 256, 1024), zapato)
            self.rect((x, 1024 - alto_zapato - 8, x + 256, 1024 - alto_zapato), oscuro(color, 0.88))

    # --- caras (casilla 128×128 que empieza en x0,y0) ---
    def ojos(self, x0, y0, color=(40, 30, 35), y=66, sep=26, w=14, h=22, brillo=True, pestanas=False):
        for cx in (x0 + 64 - sep, x0 + 64 + sep):
            self.rect((cx - w // 2, y0 + y - h // 2, cx + w // 2, y0 + y + h // 2), color, r=w // 2)
            if brillo:
                self.ellipse((cx - 2, y0 + y - h // 2 + 3, cx + 4, y0 + y - h // 2 + 9), (255, 255, 255))
            if pestanas:
                lado = -1 if cx < x0 + 64 else 1
                self.poly([(cx + lado * w // 2, y0 + y - h // 2 + 2), (cx + lado * (w // 2 + 8), y0 + y - h // 2 - 4),
                           (cx + lado * (w // 2 + 2), y0 + y - h // 2 + 8)], color)

    def mejillas(self, x0, y0, color=(255, 140, 150), y=86, sep=40):
        for cx in (x0 + 64 - sep, x0 + 64 + sep):
            self.ellipse((cx - 9, y0 + y - 5, cx + 9, y0 + y + 5), color)

    def sonrisa(self, x0, y0, color=(70, 30, 30), y=92, ancho=20, grosor=4):
        self.arc((x0 + 64 - ancho, y0 + y - ancho // 2, x0 + 64 + ancho, y0 + y + ancho // 2), 20, 160, color, grosor)

    def guardar(self, nombre):
        SALIDA.mkdir(parents=True, exist_ok=True)
        img = self.img.resize((self.img.width // S, self.img.height // S), Image.LANCZOS)
        img.save(SALIDA / f"{nombre}.png", optimize=True)


def lunares(p, box, color, paso=22, r=4):
    x0, y0, x1, y1 = box
    fila = 0
    for y in range(y0 + 10, y1 - 4, paso):
        for x in range(x0 + 8 + (paso // 2 if fila % 2 else 0), x1 - 4, paso):
            p.ellipse((x - r, y - r, x + r, y + r), color)
        fila += 1


# ---------------------------------------------------------------- juguetes pintados

def muneca():
    p = Piel("e")
    piel, pelo, pelo2, rosa = (255, 216, 194), (250, 212, 92), (226, 176, 58), (255, 92, 170)
    p.cabeza(pelo)
    x0, y0 = HEAD_ROW[1][:2]
    p.rect((x0, y0, x0 + 128, y0 + 128), piel)
    # flequillo con ondas
    p.rect((x0, y0, x0 + 128, y0 + 30), pelo)
    for i in range(4):
        p.ellipse((x0 + i * 32 - 6, y0 + 16, x0 + i * 32 + 38, y0 + 46), pelo)
    p.rect((x0, y0, x0 + 14, y0 + 128), pelo)
    p.rect((x0 + 114, y0, x0 + 128, y0 + 128), pelo)
    p.ojos(x0, y0, color=(40, 90, 200), y=70, w=16, h=24, pestanas=True)
    p.mejillas(x0, y0, y=92)
    p.ellipse((x0 + 56, y0 + 98, x0 + 72, y0 + 108), (225, 40, 110))  # labios
    p.rect(HEAD_BOTTOM, piel)
    for box in (HEAD_ROW[0], HEAD_ROW[2], HEAD_ROW[3]):  # mechas en los lados
        for i in range(0, 128, 24):
            p.rect((box[0] + i, box[1], box[0] + i + 8, box[3]), pelo2)
    p.torso(rosa)
    for box in [TORSO_TOP, *TORSO_ROW]:
        lunares(p, box, (255, 255, 255))
    p.rect((TORSO_ROW[1][0] + 30, 784, TORSO_ROW[1][2] - 30, 806), piel, r=8)  # escote
    p.brazos(piel, piel)
    for x in ARMS:
        p.rect((x, 598, x + 256, 616), rosa)  # tirante
    p.piernas(piel, rosa, 34)
    p.guardar("muneca")


def osito():
    p = Piel("a")
    pelo, claro_, nariz = (176, 112, 60), (236, 196, 140), (58, 34, 26)
    p.cabeza(pelo)
    x0, y0 = HEAD_ROW[1][:2]
    p.ellipse((x0 + 30, y0 + 70, x0 + 98, y0 + 120), claro_)  # hocico
    p.rect((x0 + 52, y0 + 76, x0 + 76, y0 + 90), nariz, r=6)
    p.arc((x0 + 50, y0 + 84, x0 + 78, y0 + 108), 20, 160, nariz, 3)
    p.ojos(x0, y0, y=56, sep=28, w=14, h=16)
    p.mejillas(x0, y0, (240, 130, 110), y=84, sep=46)
    for x in range(0, 512, 20):  # textura de peluche
        for y in (140, 190, 236):
            if not (128 <= x < 256):
                p.ellipse((x + 4, y, x + 10, y + 6), oscuro(pelo, 0.92))
    p.torso(pelo)
    bx0, by0, bx1, by1 = TORSO_ROW[1]
    p.ellipse((bx0 + 14, by0 + 22, bx1 - 14, by1 - 6), claro_)  # tripa
    p.brazos(pelo, claro_)
    p.piernas(pelo, claro_, 30)
    p.guardar("osito")


def dino():
    p = Piel("l")
    verde, verde2, tripa = (104, 190, 80), (72, 148, 58), (250, 214, 104)
    p.cabeza(verde)
    x0, y0 = HEAD_ROW[1][:2]
    p.ojos(x0, y0, y=44, sep=30, w=20, h=24)
    for cx in (x0 + 34, x0 + 94):  # blanco del ojo alrededor
        p.ellipse((cx - 16, y0 + 28, cx + 16, y0 + 60), (255, 255, 255))
        p.rect((cx - 8, y0 + 34, cx + 8, y0 + 56), (30, 30, 30), r=8)
        p.ellipse((cx - 2, y0 + 36, cx + 4, y0 + 42), (255, 255, 255))
    p.rect((x0 + 10, y0 + 84, x0 + 118, y0 + 96), verde2)  # boca
    for i in range(6):
        tx = x0 + 18 + i * 17
        p.poly([(tx, y0 + 96), (tx + 12, y0 + 96), (tx + 6, y0 + 108)], (255, 255, 255))
    for box in (HEAD_ROW[0], HEAD_ROW[2], HEAD_ROW[3], HEAD_TOP):  # manchas
        p.ellipse((box[0] + 20, box[1] + 30, box[0] + 50, box[1] + 56), verde2)
        p.ellipse((box[0] + 74, box[1] + 70, box[0] + 104, box[1] + 92), verde2)
    p.torso(verde)
    bx0, by0, bx1, by1 = TORSO_ROW[1]
    p.rect((bx0 + 20, by0, bx1 - 20, by1), tripa)
    for y in range(by0 + 18, by1 - 10, 22):
        p.rect((bx0 + 20, y, bx1 - 20, y + 4), oscuro(tripa, 0.85))
    p.brazos(verde, verde2)
    p.piernas(verde, verde2, 30)
    p.guardar("dino")


def caballero():
    p = Piel("j")
    acero, acero2, rojo, oro = (196, 202, 214), (120, 126, 142), (206, 38, 52), (240, 196, 64)
    p.cabeza(acero)
    x0, y0 = HEAD_ROW[1][:2]
    p.rect((x0 + 10, y0 + 50, x0 + 118, y0 + 70), (34, 36, 46), r=6)  # visera
    p.rect((x0 + 58, y0 + 50, x0 + 70, y0 + 118), acero2)  # nasal
    for cx in (x0 + 34, x0 + 94):
        p.ellipse((cx - 5, y0 + 56, cx + 5, y0 + 64), (255, 255, 255))
    for i in range(5):
        p.ellipse((x0 + 20 + i * 22, y0 + 92, x0 + 28 + i * 22, y0 + 100), acero2)
    p.rect((HEAD_TOP[0] + 56, 0, HEAD_TOP[0] + 72, 128), acero2)  # cresta
    p.torso(acero)
    bx0, by0, bx1, by1 = TORSO_ROW[1]
    p.rect((bx0 + 14, by0, bx1 - 14, by1), rojo)  # sobreveste
    p.rect((bx0 + 56, by0 + 14, bx0 + 72, by1 - 26), oro)
    p.rect((bx0 + 30, by0 + 42, bx1 - 30, by0 + 58), oro)
    p.franja_torso((110, 70, 40), 896, 910)  # cinturón
    p.brazos(acero, acero2, puno=acero2, corte=690)
    for x in ARMS:
        p.rect((x, 640, x + 256, 652), acero2)
    p.piernas(acero, acero2, 36)
    for x in LEGS:
        p.rect((x, 920, x + 256, 932), acero2)  # rodillera
    p.guardar("caballero")


def astronauta():
    p = Piel("c")
    blanco, naranja, marino, gris = (242, 242, 246), (255, 136, 36), (36, 46, 92), (170, 176, 190)
    p.cabeza(blanco)
    x0, y0 = HEAD_ROW[1][:2]
    p.rect((x0 + 12, y0 + 22, x0 + 116, y0 + 106), marino, r=26)  # visor
    p.rect((x0 + 24, y0 + 32, x0 + 56, y0 + 44), (120, 150, 230), r=6)  # reflejo
    p.ellipse((x0 + 86, y0 + 80, x0 + 98, y0 + 92), (90, 110, 190))
    for box in (HEAD_ROW[0], HEAD_ROW[2]):
        p.ellipse((box[0] + 40, box[1] + 40, box[0] + 88, box[1] + 88), naranja)
    p.torso(blanco)
    bx0, by0, bx1, by1 = TORSO_ROW[1]
    p.rect((bx0 + 24, by0 + 18, bx1 - 24, by0 + 74), marino, r=8)  # panel
    for i, c in enumerate([(255, 70, 70), (80, 220, 120), (255, 210, 60)]):
        p.ellipse((bx0 + 36 + i * 20, by0 + 38, bx0 + 48 + i * 20, by0 + 50), c)
    p.franja_torso(naranja, 880, 898)
    p.brazos(blanco, gris, puno=naranja)
    p.piernas(blanco, marino, 40)
    for x in LEGS:
        p.rect((x, 900, x + 256, 914), naranja)
    p.guardar("ranger")


def monstruito():
    p = Piel("o")
    azul, azul2, rojo = (110, 196, 245), (78, 160, 220), (232, 52, 60)
    p.cabeza(azul)
    for box in [HEAD_TOP, *HEAD_ROW]:  # pelillo
        for i in range(6):
            x = box[0] + 10 + i * 20
            p.poly([(x, box[1] + 128), (x + 10, box[1] + 112), (x + 20, box[1] + 128)], azul2)
    x0, y0 = HEAD_ROW[1][:2]
    for cx, cy, r in [(x0 + 34, y0 + 46, 15), (x0 + 64, y0 + 32, 13), (x0 + 94, y0 + 46, 15)]:  # tres ojos
        p.ellipse((cx - r, cy - r, cx + r, cy + r), (255, 255, 255))
        p.ellipse((cx - r // 2, cy - r // 2 + 2, cx + r // 2, cy + r // 2 + 2), (36, 30, 40))
        p.ellipse((cx - 2, cy - 3, cx + 3, cy + 2), (255, 255, 255))
    p.rect((x0 + 30, y0 + 74, x0 + 98, y0 + 104), (60, 20, 40), r=14)  # boca
    p.rect((x0 + 50, y0 + 74, x0 + 63, y0 + 90), (255, 255, 255), r=2)  # dientes de conejo
    p.rect((x0 + 65, y0 + 74, x0 + 78, y0 + 90), (255, 255, 255), r=2)
    p.ellipse((x0 + 52, y0 + 94, x0 + 76, y0 + 104), (240, 110, 130))  # lengua
    p.torso(azul)
    bx0, by0, bx1, by1 = TORSO_ROW[1]
    p.ellipse((bx0 + 16, by0 + 24, bx1 - 16, by1 - 8), (176, 226, 250))  # tripa
    for box in TORSO_ROW:
        for i in range(0, box[2] - box[0] - 8, 18):
            p.poly([(box[0] + i, box[1] + 16), (box[0] + i + 9, box[1]), (box[0] + i + 18, box[1] + 16)], azul2)
    p.brazos(azul, azul2)
    p.piernas(azul, rojo, 44)
    for x in LEGS:
        p.rect((x, 1024 - 44, x + 256, 1024 - 36), (255, 255, 255))  # puntera
    p.guardar("bichito")


# ---------------------------------------------------------------- recoloreados

def monocromo(base, color, nombre):
    """Toda la figura de un color, conservando los dibujos en tonos (soldadito de plástico)."""
    img = Image.open(BASES / f"texture-{base}.png").convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            l = (0.3 * r + 0.59 * g + 0.11 * b) / 255
            t = 0.55 + l * 0.75
            px[x, y] = (min(255, int(color[0] * t)), min(255, int(color[1] * t)), min(255, int(color[2] * t)), a)
    SALIDA.mkdir(parents=True, exist_ok=True)
    img.save(SALIDA / f"{nombre}.png", optimize=True)


if __name__ == "__main__":
    muneca()
    osito()
    dino()
    caballero()
    astronauta()
    monocromo("m", (92, 168, 70), "soldado")
    monstruito()
    print("pieles en", SALIDA.relative_to(RAIZ))
