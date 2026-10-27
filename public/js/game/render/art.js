import * as THREE from 'three';

/**
 * Arte dibujado (generado con ChatGPT, ver herramientas/chatgpt_arte.py): ilustraciones de personajes
 * y texturas de suelo. Se cargan antes de empezar; lo que no exista se sustituye por el dibujo por código.
 */
export const ART = { characters: {}, floors: {}, textures: {} };

const loader = new THREE.TextureLoader();

function load(url) {
  return new Promise((resolve) => {
    loader.load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      resolve(texture);
    }, undefined, () => resolve(null));
  });
}

/** Carga lo que haya según public/art/manifest.json (lo escribe la herramienta al generar). */
export async function loadArt() {
  let manifest = {};
  try {
    const res = await fetch('/art/manifest.json', { cache: 'no-cache' });
    if (res.ok) manifest = await res.json();
  } catch { /* sin arte: todo dibujado por código */ }
  manifest = { characters: [], floors: [], textures: [], ...manifest };
  await Promise.all([
    ...manifest.textures.map(async (id) => { ART.textures[id] = await load(`/art/texturas/${id}.jpg`); }),
    ...manifest.characters.map(async (id) => { ART.characters[id] = await load(`/art/personajes/${id}.png`); }),
    ...manifest.floors.map(async (id) => {
      const t = await load(`/art/suelos/${id}.jpg`);
      if (t) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      ART.floors[id] = t;
    }),
  ]);
  return ART;
}
