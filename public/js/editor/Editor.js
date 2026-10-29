import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { PhysicsWorld } from '../game/physics/PhysicsWorld.js';
import { buildSceneMap, setSceneMapData, ensureModels, modelSize, usesBakedBase } from '../game/arena/SceneMapBuilder.js';
import { EditorHelpers } from './helpers.js';

/**
 * Editor de mapas: abre un mapa (public/maps/<id>.json), lo pinta igual que el juego y deja elegir y cambiar cada
 * cosa (objetos, rodillos, apariciones, agua, huecos y la propia mesa o habitación). Cada cambio guarda una copia
 * para deshacer y vuelve a montar el mapa. «Guardar» lo manda al servidor (server/maps.js).
 */
const { normalizeMap, emptyMap, ID_PATTERN, THEMES } = window.MapFormat;
const DEG = Math.PI / 180;
const r2 = (v) => Math.round(v * 100) / 100;
const normDeg = (d) => r2(((((d + 180) % 360) + 360) % 360) - 180);
const THEME_NAMES = { cocina: 'Cocina', bano: 'Baño', dormitorio: 'Dormitorio', salon: 'Salón', patio: 'Patio', oeste: 'Oeste', barbie: 'Mundo Barbie', selva: 'Selva azteca', cuarto: 'Cuarto de juegos', halloween: 'Halloween', piratas: 'Isla pirata', espacio: 'Base lunar', dulces: 'Golosinas' };
const FLOOR_NAMES = { baldosas: 'Baldosas', rosa: 'Baldosas rosas', arena: 'Arena (desierto)', hierba: 'Hierba' };
const WALL_NAMES = { baldosas: 'Alicatadas', ninguna: 'Ninguna (al aire libre)' };
const COLLIDERS = { box: 'Caja', cylinder: 'Cilindro', none: 'Ninguno (se atraviesa)' };
const MAX_UNDO = 100;

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

const slug = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '').slice(0, 40) || 'mapa';

export class Editor {
  constructor(stage) {
    this.stage = stage;
    this.physics = new PhysicsWorld();
    this.helpers = new EditorHelpers(stage.scene);
    this.arena = null;
    this.data = null;
    this.id = null;
    this.saved = '';
    this.undoStack = [];
    this.redoStack = [];
    this.selection = null;
    this.library = [];
    this.index = [];
    this.buildToken = 0;
    this.animate = false;
    this.el = (id) => document.getElementById(id);

    // Cámara libre (botón derecho gira, central desplaza, rueda acerca); el izquierdo es para elegir y las flechas
    stage.freeCamera = true;
    const dom = stage.renderer.domElement;
    this.orbit = new OrbitControls(stage.camera, dom);
    this.orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.orbit.enableDamping = true;
    this.orbit.maxPolarAngle = Math.PI * 0.49;
    this.transform = new TransformControls(stage.camera, dom);
    this.transform.setSize(0.9);
    stage.scene.add(this.transform);
    this.transform.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value;
      if (!e.value) this.commitTransform();
    });
    this.transform.addEventListener('objectChange', () => this.onTransformLive());
    this.setSnap(true);

    this.setupPicking(dom);
    this.setupKeys();
  }

  // --- carga y guardado ---------------------------------------------------------------------------

  async loadIndex() {
    this.index = await api('GET', '/api/mapas');
    const select = this.el('map-select');
    select.innerHTML = '';
    for (const m of this.index) select.add(new Option(`${m.name}${m.play === false ? ' (oculto)' : ''}`, m.id));
    if (this.id) select.value = this.id;
  }

  async loadLibrary() {
    this.library = await api('GET', '/api/modelos');
    this.renderLibrary();
  }

  async open(id) {
    if (!this.confirmDiscard()) { this.el('map-select').value = this.id; return; }
    const data = await api('GET', `/api/mapas/${id}`);
    this.id = id;
    this.data = normalizeMap(data);
    this.data.id = id;
    this.saved = JSON.stringify(this.data);
    this.undoStack = [];
    this.redoStack = [];
    this.selection = null;
    await setSceneMapData(id, this.data, { reloadBase: true });
    await this.rebuild();
    this.gameView();
    this.el('map-select').value = id;
    history.replaceState(null, '', `/editor?mapa=${id}`);
    this.renderAll();
  }

  get dirty() { return this.data && JSON.stringify(this.data) !== this.saved; }

  confirmDiscard() {
    return !this.dirty || confirm('Hay cambios sin guardar en este mapa. ¿Seguro que quieres dejarlos?');
  }

  async save({ quiet = false } = {}) {
    try {
      const res = await api('PUT', `/api/mapas/${this.id}`, this.data);
      this.data = normalizeMap(res.map);
      this.data.id = this.id;
      this.saved = JSON.stringify(this.data);
      await this.loadIndex();
      if (res.job) this.toast('Guardado. Las medidas de la base han cambiado: Blender la está horneando (unos minutos). Mientras, se ve la base hecha por código.');
      else if (!quiet) this.toast('Guardado');
      this.watchJobs();
      this.renderStatus();
      return true;
    } catch (error) {
      this.toast(`No se ha podido guardar: ${error.message}`, true);
      return false;
    }
  }

  /** Pide nombre (y tipo, si es nuevo) en una ventanita. Devuelve { name, kind } o null. */
  ask({ title, name, withKind }) {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'ask';
      dialog.innerHTML = `<form method="dialog"><h3>${title}</h3>
        <label>Nombre <input type="text" name="name" required maxlength="40"></label>
        ${withKind ? `<p><label><input type="radio" name="kind" value="table" checked> Encima de una mesa (salirse = caer)</label><br>
          <label><input type="radio" name="kind" value="room"> Habitación con paredes (huecos y agua)</label></p>` : ''}
        <div class="actions"><button value="cancel" type="submit">Cancelar</button><button value="ok" class="primary" type="submit">Aceptar</button></div></form>`;
      document.body.append(dialog);
      dialog.querySelector('[name=name]').value = name ?? '';
      dialog.addEventListener('close', () => {
        const form = dialog.querySelector('form');
        const ok = dialog.returnValue === 'ok' && form.name.value.trim();
        resolve(ok ? { name: form.name.value.trim(), kind: withKind ? form.kind.value : null } : null);
        dialog.remove();
      });
      dialog.showModal();
    });
  }

  freeId(name) {
    const base = slug(name);
    let id = base;
    for (let i = 2; this.index.some((m) => m.id === id); i++) id = `${base}_${i}`;
    return ID_PATTERN.test(id) ? id : `mapa_${Date.now()}`;
  }

  async createNew() {
    if (!this.confirmDiscard()) return;
    const answer = await this.ask({ title: 'Mapa nuevo', name: '', withKind: true });
    if (!answer) return;
    const id = this.freeId(answer.name);
    const data = emptyMap(id, answer.kind);
    data.name = answer.name;
    this.data = data;
    this.id = id;
    this.saved = '';
    if (await this.save({ quiet: true })) {
      await this.open(id);
      this.toast(`Creado «${answer.name}». Añade objetos desde la izquierda.`);
    }
  }

  async saveCopy() {
    const answer = await this.ask({ title: 'Guardar una copia', name: `${this.data.name} (copia)` });
    if (!answer) return;
    const id = this.freeId(answer.name);
    const copy = { ...JSON.parse(JSON.stringify(this.data)), id, name: answer.name };
    try {
      await api('PUT', `/api/mapas/${id}?desde=${this.id}`, copy); // con la base horneada del original, si vale
      this.saved = JSON.stringify(this.data); // el original se queda como estaba guardado; seguimos en la copia
      await this.loadIndex();
      await this.open(id);
      this.toast(`Copia guardada como «${answer.name}»`);
      this.watchJobs();
    } catch (error) {
      this.toast(`No se ha podido copiar: ${error.message}`, true);
    }
  }

  async remove() {
    if (this.index.length <= 1) return this.toast('Es el único mapa: no se puede quitar', true);
    if (!confirm(`¿Quitar «${this.data.name}» del juego? (el fichero se guarda en public/maps/borrados)`)) return;
    await api('DELETE', `/api/mapas/${this.id}`);
    this.saved = JSON.stringify(this.data);
    await this.loadIndex();
    await this.open(this.index[0].id);
  }

  async play() {
    if (this.dirty && !(await this.save({ quiet: true }))) return;
    window.open(`/?mapa=${this.id}`, '_blank');
  }

  // --- trabajos de Blender (hornear bases, traer modelos) ----------------------------------------------

  watchJobs() {
    if (this.jobTimer) return;
    const tick = async () => {
      let jobs = [];
      try { jobs = await api('GET', '/api/trabajos'); } catch { /* servidor ocupado */ }
      const active = jobs.filter((j) => j.state === 'cola' || j.state === 'trabajando');
      this.jobs = active;
      const seen = (this.seenJobs ??= new Set());
      for (const j of jobs.filter((j) => (j.state === 'hecho' || j.state === 'error') && !seen.has(j.id))) {
        seen.add(j.id);
        if (j.state === 'error') this.toast(`${j.label}: ${j.error}`, true);
        else if (j.kind === 'base' && j.target === this.id) {
          await setSceneMapData(this.id, this.data, { reloadBase: true });
          await this.rebuild();
          this.toast('La base horneada ya está lista');
        } else if (j.kind === 'modelo') {
          await this.loadLibrary();
          await this.loadAvailable();
          this.toast(`${j.label}: listo. Ya está en «Añadir».`);
        }
      }
      this.renderStatus();
      this.jobTimer = active.length ? setTimeout(tick, 3000) : null;
    };
    this.jobTimer = setTimeout(tick, 500);
  }

  async loadAvailable() {
    let info = { carpeta: '', modelos: [] };
    try { info = await api('GET', '/api/modelos/disponibles'); } catch { /* sin carpeta */ }
    this.el('available-folder').textContent = info.modelos.length
      ? `En ${info.carpeta}:` : `No hay modelos nuevos en ${info.carpeta || 'la carpeta de elementos'}. Deja ahí los .glb que descargues.`;
    const box = this.el('available');
    box.innerHTML = '';
    for (const m of info.modelos) {
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `<div class="file"></div><div class="row"><input type="text" class="name" placeholder="Nombre"></div>
        <div class="row"><input type="text" class="giro" placeholder="Giro x,y,z (si viene tumbado)" title="Grados, p. ej. 90,0,0"><button type="button">Traer</button></div>`;
      item.querySelector('.file').textContent = m.ruta;
      const name = item.querySelector('.name');
      name.value = m.id.replace(/_/g, ' ');
      item.querySelector('button').addEventListener('click', async (e) => {
        e.target.disabled = true;
        try {
          await api('POST', '/api/modelos/importar', { ruta: m.ruta, id: slug(name.value), name: name.value, giro: item.querySelector('.giro').value.replace(/\s/g, '') });
          this.toast(`Preparando «${name.value}» con Blender (un minuto o dos)…`);
          this.watchJobs();
        } catch (error) {
          e.target.disabled = false;
          this.toast(error.message, true);
        }
      });
      box.append(item);
    }
  }

  // --- montar el mapa -------------------------------------------------------------------------------

  async rebuild() {
    const token = ++this.buildToken;
    await setSceneMapData(this.id, this.data);
    if (token !== this.buildToken) return; // llegó otro cambio mientras cargaba
    this.arena?.dispose();
    this.arena = buildSceneMap(this.stage, this.physics, { sceneMap: this.id });
    this.arena.sync();
    this.helpers.build(this.data, this.arena);
    this.attachSelection();
    this.renderStatus();
  }

  /** Cambia los datos (guardando una copia para deshacer) y vuelve a montar. */
  async change(mutate, { keepSelection = true } = {}) {
    this.undoStack.push(JSON.stringify(this.data));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
    mutate(this.data);
    if (!keepSelection) this.selection = null;
    if (!this.selectionExists()) this.selection = null;
    await this.rebuild();
    this.renderProps();
  }

  async undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.data));
    this.data = JSON.parse(this.undoStack.pop());
    if (!this.selectionExists()) this.selection = null;
    await this.rebuild();
    this.renderProps();
  }

  async redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.data));
    this.data = JSON.parse(this.redoStack.pop());
    if (!this.selectionExists()) this.selection = null;
    await this.rebuild();
    this.renderProps();
  }

  gameView() {
    this.stage.resize();
    this.stage.camera.position.copy(this.stage.basePosition);
    this.orbit.target.copy(this.stage.target);
    this.orbit.update();
  }

  update(now, dt) {
    this.orbit.update();
    if (this.animate && this.arena && !this.transform.dragging) this.arena.update(now, dt);
    this.helpers.update();
  }

  // --- selección y flechas ------------------------------------------------------------------------------

  item(sel = this.selection) {
    if (!sel || !this.data) return null;
    if (sel.kind === 'object') return this.data.objects.find((o) => o.id === sel.id) ?? null;
    if (sel.kind === 'mover' || sel.kind === 'moverEnd') return this.data.movers.find((m) => m.id === sel.id) ?? null;
    if (sel.kind === 'spawn') return this.data.spawns[sel.index] ?? null;
    if (sel.kind === 'water') return this.data.water[sel.index] ?? null;
    if (sel.kind === 'pit') return this.data.room?.pits?.[sel.index] ?? null;
    if (sel.kind === 'device' || sel.kind === 'deviceTarget') return (this.data.devices ?? []).find((d) => d.id === sel.id) ?? null;
    return null;
  }

  selectionExists() { return !this.selection || Boolean(this.item()); }

  targetOf(sel) {
    if (!sel || !this.arena) return null;
    if (sel.kind === 'object') return this.arena.handles.objects.get(sel.id) ?? null;
    if (sel.kind === 'mover') return this.arena.handles.movers.get(sel.id) ?? null;
    if (sel.kind === 'device') return this.arena.handles.devices?.get(sel.id) ?? null;
    return this.helpers.find(sel);
  }

  select(sel) {
    this.selection = sel;
    this.attachSelection();
    this.renderProps();
  }

  attachSelection() {
    const target = this.targetOf(this.selection);
    if (!target) {
      this.transform.detach();
      this.helpers.select(null);
      return;
    }
    const kind = this.selection.kind;
    // Qué flechas tiene cada cosa: los objetos, todo; el resto se mueve por el suelo y algunos giran o cambian de tamaño
    const allowed = { object: ['translate', 'rotate', 'scale'], mover: ['translate', 'rotate'], moverEnd: ['translate'], spawn: ['translate'], water: ['translate', 'scale'], pit: ['translate', 'scale'], device: ['translate', 'rotate', 'scale'], deviceTarget: ['translate'] }[kind];
    let mode = this.mode ?? 'translate';
    if (!allowed.includes(mode)) mode = 'translate';
    this.transform.setMode(mode);
    this.transform.setSpace(kind === 'object' && mode === 'scale' ? 'local' : 'world');
    const flat = kind !== 'object';
    this.transform.showY = !(flat && mode === 'translate') && !(flat && mode === 'scale');
    this.transform.showX = !(mode === 'rotate' && flat);
    this.transform.showZ = !(mode === 'rotate' && flat);
    this.transform.attach(target);
    this.helpers.select(kind === 'object' || kind === 'mover' ? target : null);
    this.dragStart = { position: target.position.clone(), quaternion: target.quaternion.clone(), scale: target.scale.clone() };
  }

  setMode(mode) {
    this.mode = mode;
    for (const b of document.querySelectorAll('#tools button')) b.classList.toggle('active', b.dataset.mode === mode);
    this.attachSelection();
  }

  setSnap(on) {
    this.transform.setTranslationSnap(on ? 0.5 : null);
    this.transform.setRotationSnap(on ? 15 * DEG : null);
    this.transform.setScaleSnap(on ? 0.1 : null);
  }

  /** Mientras se arrastra: lo que depende de lo arrastrado (la línea del rodillo, las cajas). */
  onTransformLive() {
    this.helpers.update();
  }

  /** Al soltar las flechas: lo arrastrado pasa a los datos. */
  commitTransform() {
    const sel = this.selection;
    const target = this.transform.object;
    if (!sel || !target || !this.dragStart) return;
    const p = target.position;
    const moved = !p.equals(this.dragStart.position) || !target.quaternion.equals(this.dragStart.quaternion) || !target.scale.equals(this.dragStart.scale);
    if (!moved) return;
    const scale = target.scale.clone();
    const euler = new THREE.Euler().setFromQuaternion(target.quaternion, 'YXZ');
    const startEuler = new THREE.Euler().setFromQuaternion(this.dragStart.quaternion, 'YXZ');
    this.change((data) => {
      const it = this.item(sel);
      if (sel.kind === 'object') {
        it.x = r2(p.x);
        it.z = r2(p.z);
        if (!it.loose) {
          it.y = r2(p.y);
          it.tilt = [normDeg(euler.x / DEG), normDeg(euler.z / DEG)];
          if (!it.tilt[0] && !it.tilt[1]) delete it.tilt;
        }
        it.rot = normDeg(euler.y / DEG);
        const uniform = Math.abs(scale.x - scale.y) < 1e-3 && Math.abs(scale.y - scale.z) < 1e-3;
        if (uniform) it.size = it.size.map((v) => r2(Math.max(0.05, v * scale.x)));
        else {
          const st = (it.stretch ?? [1, 1, 1]).map((v, i) => r2(Math.max(0.05, v * [scale.x, scale.y, scale.z][i])));
          if (st.every((v) => v === 1)) delete it.stretch; else it.stretch = st;
        }
      } else if (sel.kind === 'mover') {
        const dx = p.x - it.from[0];
        const dz = p.z - it.from[1];
        const turn = -(euler.y - startEuler.y); // el giro del grupo es -ángulo del recorrido
        const vx = it.to[0] - it.from[0];
        const vz = it.to[1] - it.from[1];
        it.from = [r2(it.from[0] + dx), r2(it.from[1] + dz)];
        it.to = [r2(it.from[0] + vx * Math.cos(turn) - vz * Math.sin(turn)), r2(it.from[1] + vx * Math.sin(turn) + vz * Math.cos(turn))];
      } else if (sel.kind === 'moverEnd') {
        it[sel.end] = [r2(p.x), r2(p.z)];
      } else if (sel.kind === 'spawn') {
        data.spawns[sel.index] = [r2(p.x), r2(p.z)];
      } else if (sel.kind === 'water' || sel.kind === 'pit') {
        Object.assign(it, { x: r2(p.x), z: r2(p.z), w: r2(Math.max(0.5, it.w * scale.x)), d: r2(Math.max(0.5, it.d * scale.z)) });
      } else if (sel.kind === 'device') {
        const dx = p.x - it.x;
        const dz = p.z - it.z;
        Object.assign(it, { x: r2(p.x), z: r2(p.z), rot: normDeg(euler.y / DEG), w: r2(Math.max(0.3, it.w * scale.x)), d: r2(Math.max(0.3, it.d * scale.z)) });
        if (it.target) it.target = [r2(it.target[0] + dx), r2(it.target[1] + dz)]; // el trampolín se lleva su punto
      } else if (sel.kind === 'deviceTarget') {
        it.target = [r2(p.x), r2(p.z)];
      }
    });
  }

  setupPicking(dom) {
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down = null;
    dom.addEventListener('pointerdown', (e) => { if (e.button === 0) down = { x: e.clientX, y: e.clientY }; });
    dom.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !down || this.transform.dragging) return;
      const click = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5;
      down = null;
      if (!click || this.transform.axis) return; // estaba usando las flechas
      const rect = dom.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, this.stage.camera);
      this.select(this.pick(ray));
    });
  }

  /** Lo que hay bajo el ratón: primero apariciones y extremos de rodillos, luego objetos y rodillos, luego agua y huecos. */
  pick(ray) {
    const ids = new Set(this.data.objects.map((o) => o.id));
    const moverIds = new Set(this.data.movers.map((m) => m.id));
    const deviceIds = new Set((this.data.devices ?? []).map((d) => d.id));
    const candidates = this.stage.scene.children.filter((c) => c !== this.transform && c !== this.helpers.selectionBox && !this.helpers.colliderBoxes.includes(c));
    const hits = ray.intersectObjects(candidates, true);
    let best = null;
    for (const hit of hits) {
      let o = hit.object;
      let found = null;
      while (o && !found) {
        if (o.userData.pick) found = { ...o.userData.pick };
        else if (ids.has(o.name)) found = { kind: 'object', id: o.name };
        else if (moverIds.has(o.name)) found = { kind: 'mover', id: o.name };
        else if (deviceIds.has(o.name)) found = { kind: 'device', id: o.name };
        o = o.parent;
      }
      if (!found || !hit.object.visible) continue;
      const rank = { spawn: 0, moverEnd: 0, deviceTarget: 0, object: 1, mover: 1, device: 1, water: 2, pit: 3 }[found.kind];
      if (!best || rank < best.rank) best = { ...found, rank };
      if (rank === 0) break;
    }
    if (!best) return null;
    delete best.rank;
    return best;
  }

  setupKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea, dialog')) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 's') { e.preventDefault(); this.save(); return; }
      if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); this.redo(); return; }
      if ((e.ctrlKey || e.metaKey) && key === 'd') { e.preventDefault(); this.duplicate(); return; }
      if (key === 'w') this.setMode('translate');
      else if (key === 'e') this.setMode('rotate');
      else if (key === 'r') this.setMode('scale');
      else if (key === 'v') this.gameView();
      else if (key === 'escape') this.select(null);
      else if (key === 'delete' || key === 'backspace') this.removeSelected();
      else if (key === 'm') this.mirror('x');
      else if (key === 'q' || key === 'a') this.rotateSelected(key === 'q' ? 15 : -15);
      else if (key === '+' || key === '-') this.resizeSelected(key === '+' ? 1.1 : 1 / 1.1);
      else if (key.startsWith('arrow')) {
        const step = e.shiftKey ? 1 : 0.1;
        const d = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[key];
        this.nudge(d[0], d[1]);
      } else return;
      e.preventDefault();
    });
  }

  nudge(dx, dz) {
    const sel = this.selection;
    if (!sel) return;
    this.change((data) => {
      const it = this.item(sel);
      if (sel.kind === 'spawn') data.spawns[sel.index] = [r2(it[0] + dx), r2(it[1] + dz)];
      else if (sel.kind === 'mover') { it.from = [r2(it.from[0] + dx), r2(it.from[1] + dz)]; it.to = [r2(it.to[0] + dx), r2(it.to[1] + dz)]; }
      else if (sel.kind === 'moverEnd') it[sel.end] = [r2(it[sel.end][0] + dx), r2(it[sel.end][1] + dz)];
      else if (sel.kind === 'deviceTarget') it.target = [r2(it.target[0] + dx), r2(it.target[1] + dz)];
      else { it.x = r2(it.x + dx); it.z = r2(it.z + dz); }
    });
  }

  rotateSelected(deg) {
    const sel = this.selection;
    if (sel?.kind === 'object' || sel?.kind === 'device') this.change(() => { const it = this.item(sel); it.rot = normDeg((it.rot ?? 0) + deg); });
    else if (sel?.kind === 'mover') {
      this.change(() => {
        const it = this.item(sel);
        const a = deg * DEG;
        const cx = (it.from[0] + it.to[0]) / 2;
        const cz = (it.from[1] + it.to[1]) / 2;
        const turn = ([x, z]) => [r2(cx + (x - cx) * Math.cos(a) - (z - cz) * Math.sin(a)), r2(cz + (x - cx) * Math.sin(a) + (z - cz) * Math.cos(a))];
        it.from = turn(it.from);
        it.to = turn(it.to);
      });
    }
  }

  resizeSelected(k) {
    const sel = this.selection;
    if (sel?.kind === 'object') this.change(() => { const it = this.item(sel); it.size = it.size.map((v) => r2(Math.max(0.05, v * k))); });
    else if (sel?.kind === 'mover') this.change(() => { const it = this.item(sel); it.length = r2(it.length * k); it.radius = r2(it.radius * k); });
    else if (sel?.kind === 'water' || sel?.kind === 'pit' || sel?.kind === 'device') this.change(() => { const it = this.item(sel); it.w = r2(it.w * k); it.d = r2(it.d * k); });
  }

  newObjectId(model) {
    const used = new Set(this.data.objects.map((o) => o.id));
    let i = 1;
    while (used.has(`${model}_${i}`)) i++;
    return `${model}_${i}`;
  }

  newDeviceId(type) {
    const used = new Set((this.data.devices ?? []).map((d) => d.id));
    let i = 1;
    while (used.has(`${type}_${i}`)) i++;
    return `${type}_${i}`;
  }

  /** Artefacto nuevo en el centro de la vista (los portales, en pareja). */
  async addDevice(type) {
    const [x, z] = this.viewCenter();
    const base = { conveyor: { w: 6, d: 2.2, speed: 3.5 }, door: { w: 4, d: 0.5, openMs: 2500, closedMs: 2500, offsetMs: 0, height: 2.6 },
      fragile: { w: 5, d: 2.2, shakeMs: 600, respawnMs: 5000 }, jump: { w: 2, d: 2, target: [r2(x + 6), z], height: 3.5, durationMs: 800 }, portal: { w: 2, d: 2 },
      train: { w: 14, d: 8, radius: 3, speed: 4, carLength: 2.6, cars: ['locomotora', 'vagon_cisterna', 'vagon_tolva', 'furgon_cola'] } }[type];
    const added = [];
    await this.change((d) => {
      d.devices = d.devices ?? [];
      if (type === 'portal') {
        const links = new Set(d.devices.filter((o) => o.type === 'portal').map((o) => o.link));
        let n = 1;
        while (links.has(`p${n}`)) n++;
        for (const dx of [-3, 3]) {
          const dev = { id: this.newDeviceId(type), type, x: r2(x + dx), z, rot: 0, ...base, link: `p${n}` };
          d.devices.push(dev);
          added.push(dev);
        }
      } else {
        const dev = { id: this.newDeviceId(type), type, x, z, rot: 0, ...base };
        d.devices.push(dev);
        added.push(dev);
      }
    });
    this.select({ kind: 'device', id: added[0].id });
  }

  newMoverId() {
    const used = new Set(this.data.movers.map((m) => m.id));
    let i = 1;
    while (used.has(`rodillo_${i}`)) i++;
    return `rodillo_${i}`;
  }

  duplicate() {
    const sel = this.selection;
    const it = this.item(sel);
    if (!it) return;
    if (sel.kind === 'object') {
      const copy = { ...JSON.parse(JSON.stringify(it)), id: this.newObjectId(it.model), x: r2(it.x + 1.5) };
      this.change((d) => d.objects.push(copy)).then(() => this.select({ kind: 'object', id: copy.id }));
    } else if (sel.kind === 'mover' || sel.kind === 'moverEnd') {
      const copy = { ...JSON.parse(JSON.stringify(it)), id: this.newMoverId(), from: [it.from[0], r2(it.from[1] + 2)], to: [it.to[0], r2(it.to[1] + 2)] };
      this.change((d) => d.movers.push(copy)).then(() => this.select({ kind: 'mover', id: copy.id }));
    } else if (sel.kind === 'spawn') {
      this.change((d) => d.spawns.push([r2(it[0] + 1.5), it[1]])).then(() => this.select({ kind: 'spawn', index: this.data.spawns.length - 1 }));
    } else if (sel.kind === 'water') {
      this.change((d) => d.water.push({ ...it, x: r2(it.x + 2) })).then(() => this.select({ kind: 'water', index: this.data.water.length - 1 }));
    } else if (sel.kind === 'pit') {
      this.change((d) => d.room.pits.push({ ...it, x: r2(it.x + 2) })).then(() => this.select({ kind: 'pit', index: this.data.room.pits.length - 1 }));
    } else if (sel.kind === 'device' || sel.kind === 'deviceTarget') {
      const copy = { ...JSON.parse(JSON.stringify(it)), id: this.newDeviceId(it.type), x: r2(it.x + 2) };
      if (copy.target) copy.target = [r2(copy.target[0] + 2), copy.target[1]];
      this.change((d) => d.devices.push(copy)).then(() => this.select({ kind: 'device', id: copy.id }));
    }
  }

  /** Copia simétrica: `x` = al otro lado (izquierda/derecha), `z` = arriba/abajo. */
  mirror(axis) {
    const sel = this.selection;
    const it = this.item(sel);
    if (!it) return;
    if (sel.kind === 'object') {
      const copy = { ...JSON.parse(JSON.stringify(it)), id: this.newObjectId(it.model) };
      if (axis === 'x') { copy.x = r2(-it.x); copy.rot = normDeg(-(it.rot ?? 0)); } else { copy.z = r2(-it.z); copy.rot = normDeg(180 - (it.rot ?? 0)); }
      if (copy.tilt) copy.tilt = axis === 'x' ? [copy.tilt[0], -copy.tilt[1]] : [-copy.tilt[0], copy.tilt[1]];
      this.change((d) => d.objects.push(copy)).then(() => this.select({ kind: 'object', id: copy.id }));
    } else if (sel.kind === 'mover' || sel.kind === 'moverEnd') {
      const f = axis === 'x' ? ([x, z]) => [r2(-x), z] : ([x, z]) => [x, r2(-z)];
      const copy = { ...JSON.parse(JSON.stringify(it)), id: this.newMoverId(), from: f(it.from), to: f(it.to) };
      this.change((d) => d.movers.push(copy)).then(() => this.select({ kind: 'mover', id: copy.id }));
    } else if (sel.kind === 'spawn') {
      this.change((d) => d.spawns.push(axis === 'x' ? [r2(-it[0]), it[1]] : [it[0], r2(-it[1])]));
    } else if (sel.kind === 'water' || sel.kind === 'pit') {
      const copy = { ...it, [axis]: r2(-it[axis]) };
      this.change((d) => (sel.kind === 'water' ? d.water : d.room.pits).push(copy));
    } else if (sel.kind === 'device' || sel.kind === 'deviceTarget') {
      const copy = { ...JSON.parse(JSON.stringify(it)), id: this.newDeviceId(it.type), [axis]: r2(-it[axis]), rot: normDeg(axis === 'x' ? 180 - (it.rot ?? 0) : -(it.rot ?? 0)) };
      if (copy.target) copy.target = axis === 'x' ? [r2(-it.target[0]), it.target[1]] : [it.target[0], r2(-it.target[1])];
      this.change((d) => d.devices.push(copy)).then(() => this.select({ kind: 'device', id: copy.id }));
    }
  }

  removeSelected() {
    const sel = this.selection;
    if (!this.item(sel)) return;
    if (sel.kind === 'spawn' && this.data.spawns.length <= 2) return this.toast('Hacen falta al menos 2 apariciones', true);
    this.change((d) => {
      if (sel.kind === 'object') d.objects = d.objects.filter((o) => o.id !== sel.id);
      else if (sel.kind === 'mover' || sel.kind === 'moverEnd') d.movers = d.movers.filter((m) => m.id !== sel.id);
      else if (sel.kind === 'spawn') d.spawns.splice(sel.index, 1);
      else if (sel.kind === 'water') d.water.splice(sel.index, 1);
      else if (sel.kind === 'pit') d.room.pits.splice(sel.index, 1);
      else if (sel.kind === 'device' || sel.kind === 'deviceTarget') d.devices = d.devices.filter((x) => x.id !== sel.id);
    }, { keepSelection: false });
  }

  /** Punto del suelo en el centro de la vista (donde aparece lo que se añade). */
  viewCenter() {
    const t = this.orbit.target;
    const area = this.data.table ?? this.data.room;
    const clamp = (v, half) => r2(Math.max(-half + 1, Math.min(half - 1, Math.round(v * 2) / 2)));
    return [clamp(t.x, area.w / 2), clamp(t.z, area.d / 2)];
  }

  async addObject(model) {
    await ensureModels([model]);
    const size = modelSize(model);
    const k = size ? 2 / Math.max(size.x, size.z) : 1; // de entrada, unas 2 casillas de ancho
    const [x, z] = this.viewCenter();
    const o = { id: this.newObjectId(model), model, x, y: 0, z, rot: 0,
      size: size ? [r2(size.x * k), r2(size.y * k), r2(size.z * k)] : [2, 2, 2], collider: 'box' };
    await this.change((d) => d.objects.push(o));
    this.select({ kind: 'object', id: o.id });
  }

  async addMover() {
    const [, z] = this.viewCenter();
    const area = this.data.table ?? this.data.room;
    const m = { id: this.newMoverId(), model: 'rodillo', from: [r2(-area.w * 0.33), z], to: [r2(area.w * 0.33), z], length: 6, radius: 0.75, periodMs: 7000, pauseMs: 900 };
    await this.change((d) => d.movers.push(m));
    this.select({ kind: 'mover', id: m.id });
  }

  async addSpawn() {
    const [x, z] = this.viewCenter();
    await this.change((d) => d.spawns.push([x, z]));
    this.select({ kind: 'spawn', index: this.data.spawns.length - 1 });
  }

  async addWater() {
    const [x, z] = this.viewCenter();
    const pit = this.data.room?.pits?.find((p) => Math.abs(p.x - x) < p.w / 2 && Math.abs(p.z - z) < p.d / 2);
    await this.change((d) => d.water.push({ x, z, w: 5, d: 3, y: pit ? -0.35 : 0.03, round: 1 }));
    this.select({ kind: 'water', index: this.data.water.length - 1 });
  }

  async addPit() {
    if (!this.data.room) return this.toast('Los huecos son para las habitaciones (en la mesa, el borde ya es la caída)', true);
    const [x, z] = this.viewCenter();
    await this.change((d) => d.room.pits.push({ x, z, w: 5, d: 4, round: 1 }));
    this.select({ kind: 'pit', index: this.data.room.pits.length - 1 });
  }

  // --- paneles -----------------------------------------------------------------------------------------

  renderAll() {
    this.renderLibrary();
    this.renderProps();
    this.renderStatus();
  }

  renderStatus() {
    const status = this.el('status');
    if (!this.data) return;
    const base = usesBakedBase(this.id) ? 'base horneada' : 'base hecha por código';
    const job = (this.jobs ?? []).find((j) => j.state === 'trabajando') ?? (this.jobs ?? [])[0];
    status.textContent = `${this.data.name} · ${base}${job ? ` · Blender: ${job.label.toLowerCase()}…` : ''}${this.dirty ? ' · sin guardar' : ''}`;
    status.classList.toggle('dirty', this.dirty);
    this.el('btn-undo').disabled = !this.undoStack.length;
    this.el('btn-redo').disabled = !this.redoStack.length;
    document.title = `${this.dirty ? '● ' : ''}${this.data.name} · Editor de mapas`;
  }

  renderLibrary() {
    const box = this.el('library');
    const filter = (this.el('lib-filter').value || '').toLowerCase();
    box.innerHTML = '';
    for (const m of this.library) {
      if (filter && !`${m.name} ${m.id}`.toLowerCase().includes(filter)) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = m.name;
      b.title = `Añadir: ${m.name}`;
      b.addEventListener('click', () => this.addObject(m.id));
      box.append(b);
    }
    this.el('add-pit').disabled = !this.data?.room;
  }

  /** Panel de la derecha: propiedades de lo elegido, o del mapa si no hay nada elegido. */
  renderProps() {
    const box = this.el('props');
    box.innerHTML = '';
    this.renderStatus();
    if (!this.data) return;
    const sel = this.selection;
    const it = this.item(sel);
    const form = new PropsForm(box, (mutate) => this.change(mutate));
    if (!it) return this.renderMapProps(form);

    if (sel.kind === 'object') {
      const libName = this.library.find((m) => m.id === it.model)?.name ?? it.model;
      form.title(`${libName} · ${it.id}`);
      form.select('Modelo', it.model, Object.fromEntries([...this.library.map((m) => [m.id, m.name]), ...(this.library.some((m) => m.id === it.model) ? [] : [[it.model, it.model]])]),
        (v) => (d) => { this.item(sel).model = v; });
      form.triple('Posición x y z', [it.x, it.y ?? 0, it.z], 0.1, (v) => () => { Object.assign(this.item(sel), { x: v[0], y: v[1], z: v[2] }); });
      form.number('Giro (°)', it.rot ?? 0, 5, (v) => () => { this.item(sel).rot = normDeg(v); });
      form.double('Inclinar x z (°)', it.tilt ?? [0, 0], 5, (v) => () => { const o = this.item(sel); o.tilt = v.map(normDeg); if (!o.tilt[0] && !o.tilt[1]) delete o.tilt; });
      form.number('Tamaño (×)', 1, 0.1, (v) => () => { const o = this.item(sel); if (v > 0) o.size = o.size.map((s) => r2(Math.max(0.05, s * v))); }, 'Multiplica el tamaño: 2 = el doble, 0,5 = la mitad');
      form.triple('Caja an al fo', it.size, 0.1, (v) => () => { this.item(sel).size = v.map((s) => Math.max(0.05, s)); }, 'El modelo se encaja en esta caja sin deformarse');
      form.triple('Estirar x y z', it.stretch ?? [1, 1, 1], 0.1, (v) => () => { const o = this.item(sel); o.stretch = v.map((s) => Math.max(0.05, s)); if (o.stretch.every((s) => s === 1)) delete o.stretch; }, 'Deforma el modelo: 1 = como es');
      form.select('Choque', it.collider, COLLIDERS, (v) => () => { this.item(sel).collider = v; });
      form.check('Esconde (matorral)', Boolean(it.bush), (v) => () => { const o = this.item(sel); if (v) { o.bush = true; o.collider = 'none'; } else delete o.bush; });
      form.check('Se empuja (suelto)', Boolean(it.loose), (v) => () => { const o = this.item(sel); if (v) o.loose = true; else delete o.loose; });
    } else if (sel.kind === 'mover' || sel.kind === 'moverEnd') {
      form.title(`Rodillo · ${it.id}`);
      form.hint('Va y vuelve del punto verde (inicio) al rojo (final). Arrastra los puntos para cambiar por dónde rueda.');
      form.double('Inicio x z', it.from, 0.5, (v) => () => { this.item(sel).from = v; });
      form.double('Final x z', it.to, 0.5, (v) => () => { this.item(sel).to = v; });
      form.number('Largo', it.length, 0.2, (v) => () => { this.item(sel).length = Math.max(0.5, v); });
      form.number('Grosor (radio)', it.radius, 0.05, (v) => () => { this.item(sel).radius = Math.max(0.2, v); });
      form.number('Ida y vuelta (s)', it.periodMs / 1000, 0.5, (v) => () => { this.item(sel).periodMs = Math.max(1000, Math.round(v * 1000)); }, 'Segundos que tarda en ir y volver (sin las pausas)');
      form.number('Pausa en cada punta (s)', it.pauseMs / 1000, 0.1, (v) => () => { this.item(sel).pauseMs = Math.max(0, Math.round(v * 1000)); });
      form.select('Modelo', it.model, Object.fromEntries(this.library.map((m) => [m.id, m.name])), (v) => () => { this.item(sel).model = v; });
    } else if (sel.kind === 'spawn') {
      form.title(`Aparición ${sel.index + 1}`);
      form.hint('Donde salen los jugadores (y donde reaparecen).');
      form.double('Posición x z', it, 0.5, (v) => (d) => { d.spawns[sel.index] = v; });
    } else if (sel.kind === 'water') {
      form.title(`${it.lava ? 'Lava' : 'Agua'} ${sel.index + 1}`);
      form.hint('Quien cae dentro se ahoga (o se quema, si es lava). En un hueco, ponla algo por debajo del suelo (altura negativa).');
      form.check('Es lava', Boolean(it.lava), (v) => () => { const w = this.item(sel); if (v) w.lava = true; else delete w.lava; });
      form.double('Centro x z', [it.x, it.z], 0.5, (v) => () => { Object.assign(this.item(sel), { x: v[0], z: v[1] }); });
      form.double('Ancho y fondo', [it.w, it.d], 0.5, (v) => () => { Object.assign(this.item(sel), { w: Math.max(0.5, v[0]), d: Math.max(0.5, v[1]) }); });
      form.number('Esquinas (radio)', it.round ?? 0, 0.2, (v) => () => { this.item(sel).round = Math.max(0, v); });
      form.number('Altura', it.y ?? 0, 0.05, (v) => () => { this.item(sel).y = v; });
    } else if (sel.kind === 'pit') {
      form.title(`Hueco ${sel.index + 1}`);
      form.hint('Agujero en el suelo: si no tiene agua, quien entra se cae. Al guardar se vuelve a hornear la base.');
      form.double('Centro x z', [it.x, it.z], 0.5, (v) => () => { Object.assign(this.item(sel), { x: v[0], z: v[1] }); });
      form.double('Ancho y fondo', [it.w, it.d], 0.5, (v) => () => { Object.assign(this.item(sel), { w: Math.max(0.5, v[0]), d: Math.max(0.5, v[1]) }); });
      form.number('Esquinas (radio)', it.round ?? 0, 0.2, (v) => () => { this.item(sel).round = Math.max(0, v); });
    } else if (sel.kind === 'device' || sel.kind === 'deviceTarget') {
      const set = (patch) => () => { Object.assign(this.item(sel), patch); };
      const titles = {
        conveyor: ['Cinta transportadora', 'Arrastra a quien la pisa (y búmerangs del suelo y sueltos) hacia donde apuntan las flechas. Gírala para cambiar la dirección.'],
        door: ['Puerta', 'Sube y baja sola: cerrada es una pared, también para los búmerangs. Primero está cerrada y luego abierta.'],
        fragile: ['Pasarela que se cae', 'Se puede pisar aunque debajo haya un hueco o el vacío. Al pisarla tiembla, se cae y vuelve a salir.'],
        jump: ['Trampolín', 'Lanza por el aire hasta el punto rosa (arrástralo), por encima de todo.'],
        train: ['Tren', 'Da vueltas por su vía (estírala con la escala o con largo y ancho) y atropella a quien pilla. Se cruza entre vagón y vagón, o saltando.'],
        portal: ['Portal', 'Lleva al otro portal con el mismo enlace (y a los búmerangs que vuelan). Cambia el enlace para emparejarlo con otro.'],
      }[it.type];
      form.title(`${titles[0]} · ${it.id}`);
      form.hint(titles[1]);
      form.double('Centro x z', [it.x, it.z], 0.5, (v) => set({ x: v[0], z: v[1] }));
      form.double('Largo y ancho', [it.w, it.d], 0.2, (v) => set({ w: Math.max(0.3, v[0]), d: Math.max(0.3, v[1]) }));
      form.number('Giro (°)', it.rot ?? 0, 15, (v) => set({ rot: normDeg(v) }));
      if (it.type === 'conveyor') form.number('Velocidad', it.speed, 0.5, (v) => set({ speed: v }), 'Casillas por segundo (negativo: al revés)');
      if (it.type === 'door' || it.type === 'fragile') {
        form.select('Aspecto', it.style ?? 'normal', { normal: it.type === 'door' ? 'Roja de fábrica' : 'Tablas', piedra: 'Piedra con musgo' },
          (v) => set({ style: v === 'piedra' ? 'piedra' : undefined }));
      }
      if (it.type === 'door') {
        form.number('Cerrada (s)', it.closedMs / 1000, 0.5, (v) => set({ closedMs: Math.max(200, Math.round(v * 1000)) }));
        form.number('Abierta (s)', it.openMs / 1000, 0.5, (v) => set({ openMs: Math.max(200, Math.round(v * 1000)) }));
        form.number('Desfase (s)', it.offsetMs / 1000, 0.5, (v) => set({ offsetMs: Math.round(v * 1000) }), 'Para que varias puertas no se abran a la vez');
        form.number('Altura', it.height, 0.2, (v) => set({ height: Math.max(0.5, v) }));
      }
      if (it.type === 'fragile') {
        form.number('Tiembla (s)', it.shakeMs / 1000, 0.1, (v) => set({ shakeMs: Math.max(100, Math.round(v * 1000)) }), 'Lo que aguanta tras pisarla');
        form.number('Vuelve a los (s)', it.respawnMs / 1000, 0.5, (v) => set({ respawnMs: Math.max(500, Math.round(v * 1000)) }));
      }
      if (it.type === 'jump') {
        form.double('Aterriza en x z', it.target, 0.5, (v) => set({ target: v }));
        form.number('Altura del salto', it.height, 0.5, (v) => set({ height: Math.max(0.5, v) }));
        form.number('Duración (s)', it.durationMs / 1000, 0.1, (v) => set({ durationMs: Math.max(200, Math.round(v * 1000)) }));
      }
      if (it.type === 'portal') form.text('Enlace', it.link, (v) => set({ link: v.slice(0, 20) || it.link }));
      if (it.type === 'train') {
        form.number('Velocidad', it.speed, 0.5, (v) => set({ speed: Math.max(0.5, v) }), 'Casillas por segundo');
        form.number('Radio de las curvas', it.radius, 0.5, (v) => set({ radius: Math.max(0.5, v) }));
        form.number('Largo de la locomotora', it.carLength, 0.2, (v) => set({ carLength: Math.max(0.5, v) }), 'Los vagones van a su misma escala');
        form.text('Vagones', it.cars.join(', '), (v) => set({ cars: v.split(',').map((c) => c.trim()).filter(Boolean) }), 'Modelos de la biblioteca, el primero es la locomotora');
        form.check('Del revés', Boolean(it.flip), (v) => set({ flip: v || undefined }));
      }
    }
    const actions = form.actions();
    actions.button('Duplicar (Ctrl+D)', () => this.duplicate());
    actions.button('Simétrica ↔', () => this.mirror('x'), 'Copia al otro lado (izquierda / derecha)');
    actions.button('Simétrica ↕', () => this.mirror('z'), 'Copia arriba / abajo');
    actions.button('Borrar (Supr)', () => this.removeSelected(), '', 'danger');
    actions.button('Soltar (Esc)', () => this.select(null));
  }

  renderMapProps(form) {
    const d = this.data;
    form.title('Mapa');
    form.text('Nombre', d.name, (v) => (data) => { data.name = v.slice(0, 40) || data.name; });
    form.info('Identificador', d.id);
    form.select('Tema', d.theme, THEME_NAMES, (v) => (data) => { data.theme = v; });
    form.check('Sale en el juego', d.play !== false, (v) => (data) => { data.play = v; });
    if (d.table) {
      form.hint('Encima de la mesa: salirse del tablero = caer. Cambiar sus medidas vuelve a hornear la base al guardar.');
      form.double('Ancho y fondo', [d.table.w, d.table.d], 1, (v) => (data) => { data.table.w = Math.max(8, v[0]); data.table.d = Math.max(6, v[1]); });
      form.number('Esquinas cortadas', d.table.chamfer, 0.2, (v) => (data) => { data.table.chamfer = Math.max(0, Math.min(v, data.table.d / 2 - 0.5)); });
      form.number('Altura de la mesa', d.table.height, 0.5, (v) => (data) => { data.table.height = Math.max(2, v); }, 'Lo que se cae hasta el suelo');
      form.number('Grosor del tablero', d.table.thickness, 0.1, (v) => (data) => { data.table.thickness = Math.max(0.1, v); });
    } else {
      form.hint('Habitación con paredes: los huecos sin agua son caída. Cambiar medidas o huecos vuelve a hornear la base al guardar.');
      form.double('Ancho y fondo', [d.room.w, d.room.d], 1, (v) => (data) => { data.room.w = Math.max(8, v[0]); data.room.d = Math.max(6, v[1]); });
      form.number('Alto de las paredes', d.room.wallHeight, 0.2, (v) => (data) => { data.room.wallHeight = Math.max(0.5, v); });
      form.number('Profundidad huecos', d.room.pitDepth, 0.5, (v) => (data) => { data.room.pitDepth = Math.max(1, v); });
      form.select('Suelo', d.room.floor ?? 'baldosas', FLOOR_NAMES, (v) => (data) => { data.room.floor = v; });
      form.select('Paredes', d.room.walls ?? 'baldosas', WALL_NAMES, (v) => (data) => { data.room.walls = v; });
      form.number('Baldosa del suelo', d.room.tile, 0.1, (v) => (data) => { data.room.tile = Math.max(0.3, v); });
    }
    const list = form.list(`Objetos (${d.objects.length})`);
    for (const o of d.objects) list.item(`${this.library.find((m) => m.id === o.model)?.name ?? o.model} · ${o.id}`, () => this.select({ kind: 'object', id: o.id }));
    const DEVICE_NAMES = { conveyor: 'Cinta', door: 'Puerta', fragile: 'Pasarela', jump: 'Trampolín', portal: 'Portal' };
    if ((d.devices ?? []).length) {
      const devs = form.list(`Artefactos (${d.devices.length})`);
      for (const dev of d.devices) devs.item(`${DEVICE_NAMES[dev.type]} · ${dev.id}`, () => this.select({ kind: 'device', id: dev.id }));
    }
    const others = form.list('Rodillos, apariciones, agua y huecos');
    for (const m of d.movers) others.item(`Rodillo · ${m.id}`, () => this.select({ kind: 'mover', id: m.id }));
    d.spawns.forEach((s, i) => others.item(`Aparición ${i + 1}`, () => this.select({ kind: 'spawn', index: i })));
    d.water.forEach((w, i) => others.item(`${w.lava ? 'Lava' : 'Agua'} ${i + 1}`,() => this.select({ kind: 'water', index: i })));
    (d.room?.pits ?? []).forEach((p, i) => others.item(`Hueco ${i + 1}`, () => this.select({ kind: 'pit', index: i })));
  }

  toast(text, error = false) {
    const t = this.el('toast');
    t.textContent = text;
    t.classList.toggle('error', error);
    t.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.hidden = true; }, error ? 6000 : 3500);
  }
}

/** Formulario sencillo: cada campo llama a onChange(mutador) al cambiar (Intro o al salir del campo). */
class PropsForm {
  constructor(box, onChange) {
    this.box = box;
    this.onChange = onChange;
    this.grid = null;
  }

  ensureGrid() {
    if (!this.grid) {
      this.grid = document.createElement('div');
      this.grid.className = 'props-grid';
      this.box.append(this.grid);
    }
    return this.grid;
  }

  row(label, control, title = '') {
    const grid = this.ensureGrid();
    const l = document.createElement('label');
    l.textContent = label;
    if (title) l.title = title;
    grid.append(l, control);
  }

  input(type, value, step) {
    const input = document.createElement('input');
    input.type = type;
    if (step) input.step = step;
    input.value = type === 'number' ? r2(Number(value)) : value;
    return input;
  }

  title(text) {
    const h = document.createElement('h3');
    h.textContent = text;
    this.box.append(h);
    this.grid = null;
  }

  hint(text) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = text;
    this.box.append(p);
    this.grid = null;
  }

  info(label, value) {
    const span = document.createElement('span');
    span.textContent = value;
    this.row(label, span);
  }

  text(label, value, make) {
    const input = this.input('text', value);
    input.addEventListener('change', () => this.onChange(make(input.value.trim())));
    this.row(label, input);
  }

  number(label, value, step, make, title) {
    const input = this.input('number', value, step);
    input.addEventListener('change', () => { const v = Number(input.value); if (Number.isFinite(v)) this.onChange(make(r2(v))); });
    this.row(label, input, title);
  }

  multi(label, values, step, make, title, cls) {
    const wrap = document.createElement('div');
    wrap.className = cls;
    const inputs = values.map((v) => this.input('number', v, step));
    for (const input of inputs) {
      input.addEventListener('change', () => {
        const vs = inputs.map((i) => Number(i.value));
        if (vs.every(Number.isFinite)) this.onChange(make(vs.map(r2)));
      });
      wrap.append(input);
    }
    this.row(label, wrap, title);
  }

  double(label, values, step, make, title) { this.multi(label, values, step, make, title, 'double'); }

  triple(label, values, step, make, title) { this.multi(label, values, step, make, title, 'triple'); }

  select(label, value, options, make) {
    const select = document.createElement('select');
    for (const [k, v] of Object.entries(options)) select.add(new Option(v, k));
    select.value = value;
    select.addEventListener('change', () => this.onChange(make(select.value)));
    this.row(label, select);
  }

  check(label, value, make) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => this.onChange(make(input.checked)));
    this.row(label, input);
  }

  actions() {
    const box = document.createElement('div');
    box.className = 'actions';
    this.box.append(box);
    this.grid = null;
    return {
      button: (text, onClick, title = '', cls = '') => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.title = title;
        if (cls) b.className = cls;
        b.addEventListener('click', onClick);
        box.append(b);
      },
    };
  }

  list(title) {
    const h = document.createElement('h2');
    h.textContent = title;
    h.style.marginTop = '14px';
    const box = document.createElement('div');
    box.className = 'list';
    this.box.append(h, box);
    this.grid = null;
    return {
      item: (text, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.addEventListener('click', onClick);
        box.append(b);
      },
    };
  }
}
