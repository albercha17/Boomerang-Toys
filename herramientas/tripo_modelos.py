"""Convierte imágenes de objetos en modelos 3D con Tripo (cuenta Pro, en el Chrome del puerto 9222) y los descarga.

Uso:  python herramientas/tripo_modelos.py <carpeta_imagenes> <carpeta_salida> [nombres...]
      python herramientas/tripo_modelos.py --exportar-abierto <salida.glb>   (modelo ya abierto con su diálogo)
Por cada <nombre>.png de la carpeta: lo sube, genera (HD), exporta en GLB y lo guarda como <salida>/<nombre>.glb.
Salta los que ya existen. Deja capturas en <salida>/_capturas si algo falla.
"""
import shutil
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By

sys.stdout.reconfigure(encoding="utf-8")
DESCARGAS = Path.home() / "Downloads"
GENERAR = "https://studio.tripo3d.ai/workspace/generate"


def conectar():
    opts = webdriver.ChromeOptions()
    opts.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    d = webdriver.Chrome(options=opts)
    for h in d.window_handles:
        d.switch_to.window(h)
        if "tripo3d" in d.current_url:
            return d
    d.switch_to.new_window("tab")
    return d


def texto(d):
    return d.execute_script("return document.body ? document.body.innerText : ''")


def pulsar(d, patron, dentro=None):
    """Pulsa el primer botón visible y activo cuyo texto cumpla la expresión `patron`."""
    return d.execute_script("""
const [patron, dentro] = arguments;
const raiz = dentro ? [...document.querySelectorAll(dentro)].find(e => e.offsetParent) : document;
if (!raiz) return null;
const re = new RegExp(patron);
const b = [...raiz.querySelectorAll('button, [role=button]')]
  .find(b => b.offsetParent && !b.disabled && re.test((b.innerText || '').replace(/\\s+/g, ' ').trim()));
if (b) { b.click(); return b.innerText.replace(/\\s+/g, ' ').trim(); }
return null;
""", patron, dentro)


def abrir_generador(d):
    d.get(GENERAR)
    for _ in range(40):
        time.sleep(2)
        if "Verificación de seguridad" not in texto(d) and d.find_elements(By.CSS_SELECTOR, "input[type=file]"):
            return True
    return False


def generar(d, imagen, capturas, nombre):
    if not abrir_generador(d):
        d.save_screenshot(str(capturas / f"{nombre}-sin-pagina.png"))
        return False
    d.find_elements(By.CSS_SELECTOR, "input[type=file]")[0].send_keys(str(imagen))
    url_antes = d.current_url
    pulsado = None
    for _ in range(30):  # el botón se activa cuando la imagen termina de subir
        time.sleep(2)
        pulsado = pulsar(d, r"^Generate \d+$")
        if pulsado:
            break
    if not pulsado:
        d.save_screenshot(str(capturas / f"{nombre}-sin-generar.png"))
        return False
    # Listo cuando la página es la del modelo y se puede exportar (sin porcentaje de progreso)
    t0 = time.time()
    while time.time() - t0 < 600:
        time.sleep(6)
        t = texto(d)
        progreso = any(f"{p}%" in t for p in range(0, 100))
        listo = d.current_url != url_antes and "/generate/" in d.current_url and "Export" in t and not progreso
        if listo:
            time.sleep(4)
            print(f"  generado en {time.time() - t0:.0f} s", flush=True)
            return True
    d.save_screenshot(str(capturas / f"{nombre}-sin-terminar.png"))
    return False


JS_EXPORTS = """
return [...document.querySelectorAll('button, [role=button]')]
  .filter(b => b.offsetParent && !b.disabled && /^Export( \\d+)?$/.test((b.innerText || '').replace(/\\s+/g, ' ').trim()))
  .map(b => ({ b, top: b.getBoundingClientRect().top }));
"""


def exportar(d, destino, capturas, nombre, dialogo_abierto=False):
    antes = {p.name for p in DESCARGAS.iterdir()}
    if not dialogo_abierto:
        if not pulsar(d, r"^Export$"):
            d.save_screenshot(str(capturas / f"{nombre}-sin-export.png"))
            return False
        time.sleep(3)
    # En el diálogo (formato GLB por defecto): su botón amarillo «Export» está más arriba que el de la barra de abajo
    hecho = d.execute_script(JS_EXPORTS.replace("return [", "const l = [") + """
if (l.length < 2) return false;
l.sort((a, c) => a.top - c.top);
l[0].b.click();
return true;
""")
    if not hecho:
        d.save_screenshot(str(capturas / f"{nombre}-sin-dialogo.png"))
        return False
    t0 = time.time()
    while time.time() - t0 < 300:
        time.sleep(3)
        nuevos = [p for p in DESCARGAS.iterdir() if p.name not in antes]
        listos = [p for p in nuevos if p.suffix.lower() == ".glb"]
        if listos and not any(p.suffix in (".crdownload", ".tmp") for p in nuevos):
            shutil.move(str(listos[0]), destino)
            print(f"  descargado -> {destino.name} ({destino.stat().st_size // 1024} KB)", flush=True)
            return True
    d.save_screenshot(str(capturas / f"{nombre}-sin-descarga.png"))
    return False


def main():
    if sys.argv[1] == "--exportar-abierto":  # el modelo ya generado y abierto en Tripo, con el diálogo de exportar
        destino = Path(sys.argv[2])
        destino.parent.mkdir(parents=True, exist_ok=True)
        ok = exportar(conectar(), destino, destino.parent, destino.stem, dialogo_abierto=True)
        print("ok" if ok else "x falló", flush=True)
        return
    origen, salida = Path(sys.argv[1]), Path(sys.argv[2])
    nombres = sys.argv[3:] or [p.stem for p in sorted(origen.glob("*.png"))]
    salida.mkdir(parents=True, exist_ok=True)
    capturas = salida / "_capturas"
    capturas.mkdir(exist_ok=True)
    d = conectar()
    for nombre in nombres:
        destino = salida / f"{nombre}.glb"
        if destino.exists():
            continue
        print(f"[{nombre}]", flush=True)
        if generar(d, origen / f"{nombre}.png", capturas, nombre) and exportar(d, destino, capturas, nombre):
            continue
        print(f"  x falló {nombre} (mira {capturas})", flush=True)
    print("FIN", flush=True)


if __name__ == "__main__":
    main()
