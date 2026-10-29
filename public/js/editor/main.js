import { Stage } from '../game/render/Stage.js';
import { loadSceneMaps } from '../game/arena/SceneMapBuilder.js';
import { Editor } from './Editor.js';

// Editor de mapas (/editor?mapa=<id>): ver Editor.js
await loadSceneMaps();
const stage = new Stage(document.getElementById('view'));
const editor = new Editor(stage);
await Promise.all([editor.loadIndex(), editor.loadLibrary()]);
const wanted = new URLSearchParams(location.search).get('mapa');
await editor.open(editor.index.some((m) => m.id === wanted) ? wanted : editor.index[0].id);
editor.loadAvailable();
editor.watchJobs();

const $ = (id) => document.getElementById(id);
$('map-select').addEventListener('change', (e) => editor.open(e.target.value));
$('btn-new').addEventListener('click', () => editor.createNew());
$('btn-save').addEventListener('click', () => editor.save());
$('btn-copy').addEventListener('click', () => editor.saveCopy());
$('btn-delete').addEventListener('click', () => editor.remove());
$('btn-undo').addEventListener('click', () => editor.undo());
$('btn-redo').addEventListener('click', () => editor.redo());
$('btn-play').addEventListener('click', () => editor.play());
$('btn-view').addEventListener('click', () => editor.gameView());
$('btn-refresh-available').addEventListener('click', () => editor.loadAvailable());
for (const b of document.querySelectorAll('#tools button')) b.addEventListener('click', () => editor.setMode(b.dataset.mode));
$('snap').addEventListener('change', (e) => editor.setSnap(e.target.checked));
$('show-colliders').addEventListener('change', (e) => editor.helpers.setColliders(e.target.checked));
$('animate').addEventListener('change', (e) => { editor.animate = e.target.checked; if (!e.target.checked) editor.rebuild(); });
$('lib-filter').addEventListener('input', () => editor.renderLibrary());
$('add-mover').addEventListener('click', () => editor.addMover());
$('add-spawn').addEventListener('click', () => editor.addSpawn());
$('add-water').addEventListener('click', () => editor.addWater());
$('add-pit').addEventListener('click', () => editor.addPit());
for (const type of ['conveyor', 'door', 'fragile', 'jump', 'portal', 'train', 'maze', 'ice', 'spikes', 'spinner']) $(`add-${type}`).addEventListener('click', () => editor.addDevice(type));
window.addEventListener('resize', () => stage.resize());
window.addEventListener('beforeunload', (e) => { if (editor.dirty) e.preventDefault(); });

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 50) / 1000;
  last = now;
  editor.update(now, dt);
  stage.render(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.editor = editor; // para depurar y para las pruebas
