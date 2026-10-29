// Paso 1 de poner esqueleto a los personajes (el 2 es herramientas/blender/riggear_personaje.py).
// Necesita el juego arrancado en el puerto 3321 y puppeteer-core (npm i puppeteer-core en otra carpeta).
// Exporta, para cada personaje, la malla del juego (normalizada, brazos bajados) y sus articulaciones, para que
// Blender le ponga el esqueleto. Uso: node exportar_rig.js <carpeta_salida> [ids,separados]
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const OUT = process.argv[2];
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--headless=new', '--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('error:', e.message));
  await p.goto('http://localhost:3321/?mapa=prueba&calidad=baja');
  await p.waitForFunction(() => window.game && window.game.arena, { timeout: 60000 });
  const ids = await p.evaluate(async () => (await (await fetch('/models/ia/manifest.json')).json()));
  for (const id of ids.filter((i) => !ONLY || ONLY.includes(i))) {
    const res = await p.evaluate(async (id) => {
      const m = await import('/js/game/entities/IaFigure.js');
      await m.loadIaModels([id]);
      const src = m.rigSource(id);
      if (!src) return null;
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const glb = await new GLTFExporter().parseAsync(src.mesh, { binary: true });
      const bytes = new Uint8Array(glb);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { glb: btoa(bin), bones: src.bones };
    }, id);
    if (!res) { console.log(id, 'sin modelo'); continue; }
    fs.writeFileSync(path.join(OUT, `${id}.glb`), Buffer.from(res.glb, 'base64'));
    fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(res.bones, null, 1));
    console.log(id, res.bones.length, 'huesos');
  }
  await b.close();
})();
