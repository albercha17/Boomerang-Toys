import * as THREE from 'three';
import { roundedPath } from '../game/arena/proceduralBase.js';

/**
 * Lo que solo se ve en el editor: apariciones numeradas, recorrido y extremos de cada rodillo, contorno del agua y
 * de los huecos, rejilla y cajas de choque. Cada pieza que se puede elegir lleva userData.pick = { kind, ... }.
 */
const SPAWN_COLOR = 0xffcf5a;

function numberSprite(n) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#1a110c';
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffcf5a';
  g.font = 'bold 36px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(0.8, 0.8, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function outline(rect, y, color) {
  const points = roundedPath({ ...rect, x: 0, z: 0 }).getPoints(12).map((p) => new THREE.Vector3(p.x, 0, -p.y));
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, depthTest: false }));
  line.renderOrder = 9;
  const shape = new THREE.Shape(roundedPath({ ...rect, x: 0, z: 0 }, THREE.Shape).getPoints(12));
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  fill.rotation.x = -Math.PI / 2;
  const group = new THREE.Group();
  group.add(line, fill);
  group.position.set(rect.x, y, rect.z);
  return group;
}

export class EditorHelpers {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'ayudas-editor';
    scene.add(this.group);
    this.selectionBox = new THREE.BoxHelper(undefined, 0xffcf5a);
    this.selectionBox.visible = false;
    this.selectionBox.material.depthTest = false;
    this.selectionBox.renderOrder = 11;
    scene.add(this.selectionBox);
    this.colliderBoxes = [];
    this.showColliders = false;
  }

  /** Vuelve a montar las ayudas para estos datos y la arena ya construida. */
  build(data, arena) {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); });
    }
    this.pickables = [];
    const area = data.table ?? data.room;

    // Rejilla de 1 en 1 sobre la zona de juego
    const size = Math.ceil(Math.max(area.w, area.d) / 2) * 2 + 2;
    const grid = new THREE.GridHelper(size, size, 0x000000, 0x000000);
    grid.material.transparent = true;
    grid.material.opacity = 0.08;
    grid.position.y = 0.03;
    this.group.add(grid);

    // Apariciones
    data.spawns.forEach(([x, z], index) => {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 24), new THREE.MeshBasicMaterial({ color: SPAWN_COLOR, transparent: true, opacity: 0.85 }));
      disc.position.set(x, 0.06, z);
      disc.userData.pick = { kind: 'spawn', index };
      const label = numberSprite(index + 1);
      label.position.y = 0.6;
      disc.add(label);
      this.group.add(disc);
    });

    // Rodillos: recorrido y extremos (verde = inicio, rojo = final)
    for (const m of data.movers) {
      const y = m.radius;
      const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(m.from[0], 0.05, m.from[1]), new THREE.Vector3(m.to[0], 0.05, m.to[1])]),
        new THREE.LineDashedMaterial({ color: 0xffcf5a, dashSize: 0.5, gapSize: 0.3, depthTest: false }));
      path.computeLineDistances();
      path.renderOrder = 9;
      this.group.add(path);
      for (const end of ['from', 'to']) {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 12), new THREE.MeshBasicMaterial({ color: end === 'from' ? 0x2bb673 : 0xe2574c, depthTest: false }));
        ball.renderOrder = 10;
        ball.position.set(m[end][0], y * 2 + 0.4, m[end][1]);
        ball.userData.pick = { kind: 'moverEnd', id: m.id, end };
        this.group.add(ball);
      }
    }

    // Agua y huecos
    data.water.forEach((w, index) => {
      const shape = outline(w, (w.y ?? 0) + 0.04, 0x4fc3f7);
      shape.userData.pick = { kind: 'water', index };
      shape.children.forEach((c) => { c.userData.pick = shape.userData.pick; });
      this.group.add(shape);
    });
    (data.room?.pits ?? []).forEach((p, index) => {
      const shape = outline(p, 0.05, 0xff9f1c);
      shape.userData.pick = { kind: 'pit', index };
      shape.children.forEach((c) => { c.userData.pick = shape.userData.pick; });
      this.group.add(shape);
    });

    this.arena = arena;
    this.data = data;
    this.refreshColliders();
  }

  /** Pieza de ayuda de esa selección (para pegarle las flechas). */
  find(selection) {
    let found = null;
    this.group.traverse((o) => {
      const p = o.userData.pick;
      if (found || !p || p.kind !== selection.kind || o.parent !== this.group) return;
      if ((p.index !== undefined && p.index === selection.index) || (p.id !== undefined && p.id === selection.id && p.end === selection.end)) found = o;
    });
    return found;
  }

  setColliders(on) {
    this.showColliders = on;
    this.refreshColliders();
  }

  refreshColliders() {
    for (const box of this.colliderBoxes) { this.scene.remove(box); box.geometry.dispose(); }
    this.colliderBoxes = [];
    if (!this.showColliders || !this.arena) return;
    for (const o of this.data.objects) {
      if (o.collider === 'none' && !o.bush && !o.loose) continue;
      const target = this.arena.handles.objects.get(o.id);
      if (!target) continue;
      const box = new THREE.BoxHelper(target, o.bush ? 0x5aa548 : o.loose ? 0x4fc3f7 : 0xff5fa2);
      box.material.depthTest = false;
      this.scene.add(box);
      this.colliderBoxes.push(box);
    }
  }

  select(target) {
    this.selectionBox.visible = Boolean(target);
    if (target) this.selectionBox.setFromObject(target);
    this.selectionTarget = target;
  }

  update() {
    if (this.selectionTarget) this.selectionBox.setFromObject(this.selectionTarget);
  }
}
