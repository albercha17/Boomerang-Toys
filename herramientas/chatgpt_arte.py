"""Genera el arte del juego con la web de ChatGPT (Chrome abierto en el puerto 9222) y lo prepara para el juego.

Uso:  python herramientas/chatgpt_arte.py                     # lo que falte
      python herramientas/chatgpt_arte.py --solo personaje_muneca suelo_cocina
      python herramientas/chatgpt_arte.py --procesar            # solo vuelve a recortar lo descargado
Se puede cortar y relanzar: salta lo que ya existe. Si ChatGPT pone límite de imágenes, para.

Descargas en herramientas/arte_bruto/ (no se suben); resultado en public/art/:
  personajes/<id>.png  figura recortada con fondo transparente
  suelos/<zona>.jpg    textura de suelo 1024×1024
"""
import argparse
import json
import random
import sys
import time
from collections import deque
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
BRUTO = AQUI / "arte_bruto"
ARTE = RAIZ / "public" / "art"
sys.path.insert(0, str(AQUI))
from arte import lista  # noqa: E402


CARPETAS = {"personaje": ("personajes", "png"), "suelo": ("suelos", "jpg"), "textura": ("texturas", "jpg")}


def destino(clave):
    tipo, nombre = clave.split("_", 1)
    carpeta, ext = CARPETAS[tipo]
    return ARTE / carpeta / f"{nombre}.{ext}"


def quitar_fondo(ruta_entrada, ruta_salida, umbral=38):
    """Fondo blanco -> transparente rellenando desde los bordes (el contorno negro del dibujo hace de muro)."""
    img = Image.open(ruta_entrada).convert("RGBA")
    w, h = img.size
    px = img.load()
    blanco = lambda p: p[0] > 255 - umbral and p[1] > 255 - umbral and p[2] > 255 - umbral  # noqa: E731
    visto = bytearray(w * h)
    cola = deque()
    for x in range(w):
        cola.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        cola.extend([(0, y), (w - 1, y)])
    while cola:
        x, y = cola.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visto[y * w + x]:
            continue
        visto[y * w + x] = 1
        if not blanco(px[x, y]):
            continue
        px[x, y] = (255, 255, 255, 0)
        cola.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    # Suaviza el borde: los píxeles casi blancos pegados al fondo quedan semitransparentes
    caja = img.getbbox()
    if caja:
        margen = 6
        caja = (max(0, caja[0] - margen), max(0, caja[1] - margen), min(w, caja[2] + margen), min(h, caja[3] + margen))
        img = img.crop(caja)
    img.thumbnail((512, 512), Image.LANCZOS)
    ruta_salida.parent.mkdir(parents=True, exist_ok=True)
    img.save(ruta_salida, optimize=True)


def preparar_suelo(ruta_entrada, ruta_salida, lado_final=1024):
    img = Image.open(ruta_entrada).convert("RGB")
    lado = min(img.size)
    img = img.crop(((img.width - lado) // 2, (img.height - lado) // 2, (img.width + lado) // 2, (img.height + lado) // 2))
    img = img.resize((lado_final, lado_final), Image.LANCZOS)
    ruta_salida.parent.mkdir(parents=True, exist_ok=True)
    img.save(ruta_salida, quality=88)


def procesar(clave):
    bruto = BRUTO / f"{clave}.png"
    if not bruto.exists():
        return False
    if clave.startswith("personaje_"):
        quitar_fondo(bruto, destino(clave))
    elif clave.startswith("textura_"):
        preparar_suelo(bruto, destino(clave), 512)
    else:
        preparar_suelo(bruto, destino(clave))
    escribir_manifiesto()
    return True


def escribir_manifiesto():
    """public/art/manifest.json: qué ilustraciones hay; el juego usa estas y dibuja por código el resto."""
    nombres = lambda carpeta, ext: sorted(p.stem for p in (ARTE / carpeta).glob(f"*.{ext}"))  # noqa: E731
    datos = {"characters": nombres("personajes", "png"), "floors": nombres("suelos", "jpg"), "textures": nombres("texturas", "jpg")}
    ARTE.mkdir(parents=True, exist_ok=True)
    (ARTE / "manifest.json").write_text(json.dumps(datos, indent=2) + "\n", encoding="utf-8")


CAJA = "div[contenteditable='true'][role='textbox'], #prompt-textarea"
JS_PULSAR_ENVIAR = """
const caja = document.querySelector("#prompt-textarea, div[contenteditable='true'][role='textbox']");
const form = caja && caja.closest('form');
const botones = [...(form || document).querySelectorAll('button')].filter((b) => b.offsetParent && !b.disabled);
const enviar = botones.find((b) => /send|enviar/i.test((b.getAttribute('aria-label') || '') + (b.dataset.testid || '') + b.id))
  || botones[botones.length - 1];
if (enviar) { enviar.click(); return true; }
return false;
"""


def enviado(chat, espera=12):
    """El mensaje salió si ChatGPT abrió conversación (/c/...) y la caja de texto quedó vacía."""
    fin = time.time() + espera
    while time.time() < fin:
        time.sleep(1)
        caja = chat.d.execute_script(f"const c = document.querySelector(\"{CAJA}\"); return c ? c.innerText.trim() : '';")
        if "/c/" in chat.d.current_url and not caja:
            return True
    return False


def pedir(chat, texto):
    """Chat nuevo, escribe y envía; comprueba que se ha enviado y reintenta si la web no respondió al clic."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    for _ in range(3):
        chat.nuevo_chat()  # cada imagen en su chat: que no se contagien estilos ni personajes
        time.sleep(3)  # la caja de texto tarda en estar lista tras abrir chat
        chat.enviar(texto)
        if enviado(chat):
            return True
        # Texto escrito pero sin enviar: pulsa el botón de enviar y, si no, Intro.
        chat.d.execute_script(JS_PULSAR_ENVIAR)
        if enviado(chat):
            return True
        try:
            chat.d.find_element(By.CSS_SELECTOR, CAJA).send_keys(Keys.ENTER)
        except Exception:  # noqa: BLE001
            pass
        if enviado(chat):
            return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo", nargs="*")
    ap.add_argument("--forzar", action="store_true")
    ap.add_argument("--procesar", action="store_true")
    args = ap.parse_args()
    encargos = [e for e in lista() if not args.solo or e[0] in args.solo]

    if args.procesar:
        for clave, _, _ in encargos:
            if procesar(clave):
                print(f"procesado {clave} -> {destino(clave).relative_to(RAIZ)}", flush=True)
        return

    hecha = lambda clave: (BRUTO / f"{clave}.png").exists() or destino(clave).exists()  # noqa: E731
    pend = [e for e in encargos if args.forzar or not hecha(e[0])]
    print(f"{len(pend)} imágenes por hacer", flush=True)
    if not pend:
        return
    # Carpeta MIS PROGRAMAS (aunque se lance desde una copia en .claude/worktrees)
    programas = next(p for p in RAIZ.parents if (p / "Fritanga").is_dir())
    sys.path.insert(0, str(programas / "Fritanga"))
    sys.path.insert(0, str(programas / "Unlock" / "Unlock-CA" / "herramientas"))
    from imagenes_chatgpt import Chat  # noqa: E402  (envío adaptado a la interfaz de ChatGPT de oct 2026)

    BRUTO.mkdir(exist_ok=True)
    chat = Chat(9222)
    for n, (clave, _, prompt) in enumerate(pend, 1):
        print(f"[{n}/{len(pend)}] {clave}", flush=True)
        src = None
        for intento in range(2):  # si no sale, otra vez en un chat nuevo
            if not pedir(chat, " ".join(prompt.split())):
                print("  x ChatGPT no aceptó el mensaje", flush=True)
                continue
            src = chat.esperar_imagen()
            if src or chat.hay_limite():
                break
            print(f"  ... no salió imagen (intento {intento + 1})", flush=True)
        if not src:
            if chat.hay_limite():
                print("LIMITE: ChatGPT indica límite de imágenes. Relanza más tarde.", flush=True)
                return
            print("  x no salió imagen", flush=True)
            continue
        try:
            chat.descargar(src, BRUTO / f"{clave}.png")
            procesar(clave)
            print(f"  ok -> {destino(clave).relative_to(RAIZ)}", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"  x no pude guardarla: {e}", flush=True)
        time.sleep(random.uniform(5, 10))
    print("FIN", flush=True)


if __name__ == "__main__":
    main()
