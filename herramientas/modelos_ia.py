"""Convierte los dibujos de los personajes (ChatGPT, fondo blanco) en modelos 3D con TRELLIS (Hugging Face, gratis).

Uso:  python herramientas/modelos_ia.py <carpeta con personaje_<id>.png> [ids...]
Resultado: public/models/ia/<id>.glb (malla simplificada + textura 1024). Salta los que ya existen.
"""
import json
import shutil
import sys
import time
from pathlib import Path

from gradio_client import Client, handle_file

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "models" / "ia"
IDS = ["peon", "muneca", "heroe", "soldado", "ranger", "bichito", "robot", "osito", "caballero", "dino", "pirata", "vaquero"]


def generar(client, imagen, destino):
    pre = client.predict(image=handle_file(str(imagen)), api_name="/preprocess_image")
    res = client.predict(
        image=handle_file(pre), multiimages=[], seed=1,
        ss_guidance_strength=7.5, ss_sampling_steps=12, slat_guidance_strength=3.0, slat_sampling_steps=12,
        multiimage_algo="stochastic", mesh_simplify=0.95, texture_size=1024,
        api_name="/generate_and_extract_glb",
    )
    shutil.copy(res[2] or res[1], destino)


def main():
    origen = Path(sys.argv[1])
    ids = sys.argv[2:] or IDS
    SALIDA.mkdir(parents=True, exist_ok=True)
    client = Client("trellis-community/TRELLIS")
    for id_ in ids:
        imagen = origen / f"personaje_{id_}.png"
        destino = SALIDA / f"{id_}.glb"
        if destino.exists() or not imagen.exists():
            print(f"salto {id_}", flush=True)
            continue
        for intento in range(3):
            try:
                t0 = time.time()
                generar(client, imagen, destino)
                print(f"ok {id_} ({time.time() - t0:.0f}s, {destino.stat().st_size // 1024} KB)", flush=True)
                break
            except Exception as e:  # noqa: BLE001  (cola llena, cupo de GPU...)
                print(f"  fallo {id_} (intento {intento + 1}): {str(e)[:200]}", flush=True)
                time.sleep(30)
    hechos = sorted(p.stem for p in SALIDA.glob("*.glb"))
    (SALIDA / "manifest.json").write_text(json.dumps(hechos) + "\n", encoding="utf-8")  # el juego carga estos
    print("FIN", hechos, flush=True)


if __name__ == "__main__":
    main()
