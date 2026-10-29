import * as THREE from 'three';

/**
 * Artefactos del escenario (data.devices; formato en shared/mapFormat.js). Cada uno es un rectángulo (x, z, w, d, rot)
 * con lo suyo:
 *   conveyor  cinta transportadora: arrastra personajes, búmerangs del suelo y sueltos hacia su +x local (speed)
 *   door      puerta que sube y baja: cerrada es una pared (también para los búmerangs) (openMs, closedMs, offsetMs, height)
 *   fragile   pasarela que se cae: al pisarla tiembla (shakeMs), cae y vuelve a salir (respawnMs). Mientras está,
 *             se puede pisar aunque debajo haya un hueco o el vacío
 *   jump      trampolín: te lanza por el aire hasta target [x, z] (height, durationMs)
 *   portal    portal: te lleva al otro portal con el mismo `link` (y a los búmerangs que vuelan)
 * buildDevices monta lo que se ve y la física; la partida llama a update (animación y estado) y a affect (lo que
 * hacen a personajes, búmerangs y sueltos).
 */
const DEG = Math.PI / 180;
const FALL_GRAVITY = 24;

/** Coordenadas locales del artefacto: `u` a lo largo (su +x girado) y `v` a lo ancho. */
function local(dev, x, z) {
  const a = -(dev.rot ?? 0) * DEG; // el giro del juego (rotation.y) lleva +x hacia -z
  const dx = x - dev.x;
  const dz = z - dev.z;
  return { u: dx * Math.cos(a) + dz * Math.sin(a), v: -dx * Math.sin(a) + dz * Math.cos(a) };
}

const inside = (dev, x, z, margin = 0) => {
  const { u, v } = local(dev, x, z);
  return Math.abs(u) <= dev.w / 2 + margin && Math.abs(v) <= dev.d / 2 + margin;
};

/** Dirección de la cinta en el mundo. */
const along = (dev) => ({ x: Math.cos(-(dev.rot ?? 0) * DEG), z: Math.sin(-(dev.rot ?? 0) * DEG) });

function stripeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#3b3f4a';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffcf33';
  for (const y of [32, 96]) { // flechas (chevrones) hacia +u
    g.beginPath();
    g.moveTo(40, y - 22); g.lineTo(76, y); g.lineTo(40, y + 22); g.lineTo(54, y + 22); g.lineTo(90, y); g.lineTo(54, y - 22);
    g.closePath();
    g.fill();
  }
  g.fillStyle = 'rgba(0, 0, 0, 0.25)';
  for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 2, 128);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function plankTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  const tones = ['#c8894f', '#b97a42', '#d39a5d', '#bf8147'];
  for (let i = 0; i < 4; i++) { g.fillStyle = tones[i]; g.fillRect(0, i * 32, 128, 32); g.fillStyle = 'rgba(60, 30, 10, 0.5)'; g.fillRect(0, i * 32 + 30, 128, 2); }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Bloques de piedra con musgo (pasarelas y puertas con style 'piedra', para la selva). */
function stoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#4a463e';
  g.fillRect(0, 0, 128, 128);
  const tones = ['#7d776a', '#6f6a5e', '#857f70', '#767064'];
  let k = 0;
  for (let row = 0; row < 4; row++) {
    const shift = row % 2 ? 32 : 0;
    for (let x = -32; x < 128; x += 64) {
      g.fillStyle = tones[k++ % tones.length];
      g.fillRect(x + shift + 2, row * 32 + 2, 60, 28);
    }
  }
  g.fillStyle = 'rgba(96, 150, 70, 0.55)'; // musgo
  for (const [x, y, r] of [[20, 30, 9], [90, 64, 12], [60, 110, 8], [110, 10, 7]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const PORTAL_COLORS = [0x9b5de5, 0x00b4c6, 0xff7f11, 0x2bb673, 0xe63946];

export function buildDevices(root, physics, list, own, models = {}) {
  const devices = [];
  const portalLinks = [...new Set(list.filter((d) => d.type === 'portal').map((d) => d.link))];
  for (const def of list) {
    const dev = { ...def, group: new THREE.Group(), state: 'idle', since: 0 };
    dev.group.name = def.id;
    dev.group.position.set(def.x, 0, def.z);
    dev.group.rotation.y = (def.rot ?? 0) * DEG;
    root.add(dev.group);
    const mesh = (geometry, material) => { const m = new THREE.Mesh(own(geometry), own(material)); m.castShadow = true; m.receiveShadow = true; dev.group.add(m); return m; };

    if (def.type === 'conveyor') {
      const tex = own(stripeTexture());
      tex.repeat.set(def.w / 1.2, def.d / 1.2);
      dev.texture = tex;
      const belt = mesh(new THREE.BoxGeometry(def.w, 0.12, def.d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      belt.position.y = 0.06;
      for (const side of [-1, 1]) { // barandillas
        const rail = mesh(new THREE.BoxGeometry(def.w, 0.22, 0.14), new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: 0.4, metalness: 0.3 }));
        rail.position.set(0, 0.11, side * (def.d / 2 + 0.07));
      }
    } else if (def.type === 'door') {
      const h = def.height ?? 2.6;
      dev.panel = new THREE.Group();
      dev.group.add(dev.panel);
      const stone = def.style === 'piedra';
      let slabMaterial;
      if (stone) {
        const tex = own(stoneTexture());
        tex.repeat.set(def.w / 2, h / 2);
        slabMaterial = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      } else {
        slabMaterial = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.45 });
      }
      const slab = new THREE.Mesh(own(new THREE.BoxGeometry(def.w, h, def.d)), own(slabMaterial));
      slab.position.y = h / 2;
      slab.castShadow = true;
      dev.panel.add(slab);
      for (let k = -1; k <= 1; k += 2) { // franjas amarillas de aviso (en piedra, cenefas talladas)
        const stripe = new THREE.Mesh(own(new THREE.BoxGeometry(def.w * 1.01, 0.18, def.d * 1.02)),
          own(new THREE.MeshStandardMaterial({ color: stone ? 0x2a9d8f : 0xffd166, roughness: stone ? 0.7 : 0.4 })));
        stripe.position.y = h / 2 + k * h * 0.28;
        dev.panel.add(stripe);
      }
      for (const side of [-1, 1]) { // postes
        const post = mesh(new THREE.BoxGeometry(0.3, h + 0.3, def.d + 0.25), new THREE.MeshStandardMaterial(stone
          ? { color: 0x7d7768, roughness: 0.95 } : { color: 0x5c6b7a, roughness: 0.5, metalness: 0.4 }));
        post.position.set(side * (def.w / 2 + 0.15), (h + 0.3) / 2, 0);
      }
      dev.height = h;
      dev.open = 0; // 0 cerrada, 1 abierta (bajo el suelo)
    } else if (def.type === 'fragile') {
      const tex = own(def.style === 'piedra' ? stoneTexture() : plankTexture());
      tex.repeat.set(def.w / 2, def.d / 2);
      dev.planks = new THREE.Group();
      dev.group.add(dev.planks);
      const n = Math.max(1, Math.round(def.w / 0.9));
      dev.plankMeshes = [];
      for (let i = 0; i < n; i++) {
        const p = new THREE.Mesh(own(new THREE.BoxGeometry(def.w / n - 0.06, 0.16, def.d)), own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })));
        p.position.set(-def.w / 2 + (i + 0.5) * (def.w / n), -0.06, 0);
        p.castShadow = p.receiveShadow = true;
        dev.planks.add(p);
        dev.plankMeshes.push({ mesh: p, home: p.position.clone(), vy: 0, spin: (Math.random() - 0.5) * 3 });
      }
    } else if (def.type === 'jump') {
      const r = Math.min(def.w, def.d) / 2;
      mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.18, 28), new THREE.MeshStandardMaterial({ color: 0x5c6b7a, roughness: 0.5, metalness: 0.4 })).position.y = 0.09;
      dev.top = mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.12, 28), new THREE.MeshStandardMaterial({ color: 0xff5fa2, roughness: 0.35 }));
      dev.top.position.y = 0.26;
      const spring = mesh(new THREE.TorusGeometry(r * 0.45, 0.05, 8, 24), new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.6, roughness: 0.3 }));
      spring.rotation.x = Math.PI / 2;
      spring.position.y = 0.2;
      dev.radius = r;
    } else if (def.type === 'portal') {
      const r = Math.min(def.w, def.d) / 2;
      const color = PORTAL_COLORS[portalLinks.indexOf(def.link) % PORTAL_COLORS.length];
      const ring = mesh(new THREE.TorusGeometry(r, 0.12, 10, 36), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.3 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.08;
      dev.swirl = new THREE.Mesh(own(new THREE.CircleGeometry(r * 0.95, 32)), own(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false })));
      dev.swirl.rotation.x = -Math.PI / 2;
      dev.swirl.position.y = 0.05;
      dev.group.add(dev.swirl);
      dev.radius = r;
      dev.color = color;
    }
    if (def.type === 'door') {
      dev.body = physics.addWall(def.x, (dev.height) / 2, def.z, def.w / 2, dev.height / 2, def.d / 2, (def.rot ?? 0) * DEG);
    }
    devices.push(dev);
  }

  const api = {
    list: devices,

    /** ¿Hay suelo firme de una pasarela entera en ese punto? (aunque debajo haya un hueco o el vacío) */
    solidAt(x, z) {
      return devices.some((d) => d.type === 'fragile' && d.state !== 'fallen' && inside(d, x, z));
    },

    /** Animación y estado (puertas, pasarelas, cintas, portales, trampolines). */
    update(now, dt) {
      for (const d of devices) {
        if (d.type === 'conveyor') d.texture.offset.x -= (d.speed ?? 3.5) * dt / 1.2;
        else if (d.type === 'portal') d.swirl.rotation.z += dt * 2.5;
        else if (d.type === 'jump') d.top.position.y += (0.26 - d.top.position.y) * Math.min(1, dt * 8);
        else if (d.type === 'door') {
          const open = d.openMs ?? 2500;
          const closed = d.closedMs ?? 2500;
          const cycle = open + closed;
          const t = ((now + (d.offsetMs ?? 0)) % cycle + cycle) % cycle;
          const target = t < closed ? 0 : 1; // primero cerrada, luego abierta
          d.open += (target - d.open) * Math.min(1, dt * 5);
          d.panel.position.y = -d.open * (d.height + 0.05);
          const solid = d.open < 0.5;
          if (solid && !d.bodyOn) { physics.add(d.body); d.bodyOn = true; } else if (!solid && d.bodyOn) { physics.remove(d.body); d.bodyOn = false; }
        } else if (d.type === 'fragile') {
          const shake = d.shakeMs ?? 600;
          if (d.state === 'shaking') {
            for (const p of d.plankMeshes) { p.mesh.position.x = p.home.x + Math.sin(now / 25 + p.home.x) * 0.04; p.mesh.position.y = p.home.y + Math.sin(now / 31) * 0.03; }
            if (now - d.since > shake) { d.state = 'fallen'; d.since = now; for (const p of d.plankMeshes) p.vy = 0; }
          } else if (d.state === 'fallen') {
            for (const p of d.plankMeshes) {
              p.vy -= FALL_GRAVITY * dt;
              p.mesh.position.y += p.vy * dt;
              p.mesh.rotation.x += p.spin * dt;
            }
            if (now - d.since > (d.respawnMs ?? 5000)) { d.state = 'back'; d.since = now; }
          } else if (d.state === 'back') { // vuelve a salir creciendo
            const k = Math.min(1, (now - d.since) / 400);
            for (const p of d.plankMeshes) { p.mesh.position.copy(p.home); p.mesh.rotation.set(0, 0, 0); p.mesh.scale.setScalar(Math.max(0.01, k)); }
            if (k >= 1) d.state = 'idle';
          }
        }
      }
    },

    /** Lo que hacen a personajes, búmerangs y sueltos (antes del paso de física). */
    affect(game, now, dt) {
      const chars = [...game.characters.values()].filter((c) => c.alive && !c.falling && !c.leap);
      for (const d of devices) {
        if (d.type === 'conveyor') {
          const dir = along(d);
          const step = (d.speed ?? 3.5) * dt;
          for (const c of chars) if (inside(d, c.x, c.z)) { c.body.position.x += dir.x * step; c.body.position.z += dir.z * step; }
          for (const w of game.weapons) if (w.state === 'ground' && inside(d, w.x, w.z)) { w.body.position.x += dir.x * step; w.body.position.z += dir.z * step; }
          for (const p of game.arena.props ?? []) if (inside(d, p.body.position.x, p.body.position.z)) { p.body.position.x += dir.x * step; p.body.position.z += dir.z * step; p.body.wakeUp?.(); }
        } else if (d.type === 'fragile') {
          if (d.state === 'idle' && chars.some((c) => inside(d, c.x, c.z))) { d.state = 'shaking'; d.since = now; }
        } else if (d.type === 'jump') {
          for (const c of chars) {
            if (Math.hypot(c.x - d.x, c.z - d.z) > d.radius || now < (c.jumpReadyAt ?? 0)) continue;
            c.jumpReadyAt = now + 600;
            d.top.position.y = 0.05; // el muelle se hunde y rebota
            game.startLeap(c, now, { to: { x: d.target[0], z: d.target[1] }, height: d.height ?? 3.5, durationMs: d.durationMs ?? 800, wave: false });
          }
        } else if (d.type === 'portal') {
          const other = devices.find((o) => o !== d && o.type === 'portal' && o.link === d.link);
          if (!other) continue;
          const travel = (thing, x, z, set) => {
            const near = Math.hypot(x - d.x, z - d.z) <= d.radius * 0.8;
            if (!near) { if (thing.portalLock === d.id) thing.portalLock = null; return; }
            if (thing.portalLock) return; // acaba de llegar por un portal: tiene que salir de él antes de usar otro
            thing.portalLock = other.id;
            set(other.x + (x - d.x), other.z + (z - d.z));
            game.effects.burst(other.x, 0.6, other.z, [d.color, 0xffffff], 14, 0.5);
          };
          for (const c of chars) travel(c, c.x, c.z, (x, z) => c.body.position.set(x, c.body.position.y, z));
          for (const w of game.weapons) if (w.state !== 'held') travel(w, w.x, w.z, (x, z) => w.body.position.set(x, w.body.position.y, z));
        }
      }
    },

    dispose() {
      for (const d of devices) if (d.body && d.bodyOn) physics.remove(d.body);
    },
  };
  // Las puertas empiezan con su pared puesta
  for (const d of devices) if (d.body) d.bodyOn = true;
  return api;
}
