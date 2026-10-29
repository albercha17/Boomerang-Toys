import * as THREE from 'three';

/**
 * Esqueleto para los muñecos de IA (que llegan en una sola pieza rígida): se hace al cargar el modelo, sin Blender.
 * - Las articulaciones salen de las zonas del modelo (las mismas que IaFigure usa para desmontarlo): cadera y cuello
 *   por alturas, hombros donde arrancan los brazos, la mano donde acaba el brazo, el codo y la rodilla a medio camino.
 * - Cada vértice se reparte entre 1-3 huesos con transiciones suaves (cadera, codos, rodillas, cuello), así que al
 *   moverse la malla se dobla en vez de partirse en bloques. El reparto depende solo de la posición del vértice: los
 *   vértices repetidos (la malla va sin índices) reciben lo mismo y no se abren rendijas.
 * - Los brazos levantados se bajan doblándolos desde el hombro poco a poco (sin cortar la malla).
 * Huesos: root > hips > spine > chest > head; chest > upperArm/foreArm/hand (L, R); hips > thigh/shin/foot (L, R).
 */
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * @param geometry malla sin índices, normalizada (pies en y=0, centrada, mirando a +z); se modifica (brazos bajados)
 * @param o { H, W, D, legTop, neck, armX, armBoxes, legsAxis, regionOf(x, y, z) → 'head'|'torso'|'armL'|... , hang }
 * @returns plantilla { bones: [{ name, parent, position (del mundo del modelo) }] } y escribe skinIndex/skinWeight
 */
export function buildSkin(geometry, o) {
  const pos = geometry.attributes.position;
  const n = pos.count;
  const v = new THREE.Vector3();
  const regions = new Array(n);
  for (let i = 0; i < n; i++) regions[i] = o.regionOf(pos.getX(i), pos.getY(i), pos.getZ(i));

  const hipY = o.legTop * o.H;
  const neckY = o.neck * o.H;
  const shoulders = {
    L: o.armBoxes.L?.shoulder ? new THREE.Vector3(o.armBoxes.L.shoulder[0], o.armBoxes.L.shoulder[1] * o.H, 0) : new THREE.Vector3(o.armX * o.W, (o.neck - 0.03) * o.H, 0),
    R: o.armBoxes.R?.shoulder ? new THREE.Vector3(o.armBoxes.R.shoulder[0], o.armBoxes.R.shoulder[1] * o.H, 0) : new THREE.Vector3(-o.armX * o.W, (o.neck - 0.03) * o.H, 0),
  };

  // Brazos levantados: se bajan girándolos desde el hombro, más cuanto más lejos del hombro (dobla, no corta)
  for (const side of ['L', 'R']) {
    const box = o.armBoxes[side];
    if (!box) continue;
    const s = shoulders[side];
    const centroid = new THREE.Vector3();
    let count = 0;
    for (let i = 0; i < n; i++) if (regions[i] === `arm${side}`) { centroid.add(v.fromBufferAttribute(pos, i).sub(s)); count++; }
    if (!count) continue;
    centroid.divideScalar(count);
    const sign = side === 'L' ? 1 : -1;
    const turn = new THREE.Quaternion().setFromUnitVectors(centroid.clone().normalize(), new THREE.Vector3(sign * (box.hang ?? o.hang), -1, 0.04).normalize());
    const id = new THREE.Quaternion();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      if (regions[i] !== `arm${side}`) continue;
      v.fromBufferAttribute(pos, i).sub(s);
      q.slerpQuaternions(id, turn, smooth(0.01, 0.16, v.length()));
      v.applyQuaternion(q).add(s);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  // Articulaciones de brazos y piernas, sacadas de sus vértices
  const joints = {};
  for (const side of ['L', 'R']) {
    const s = shoulders[side];
    const arm = [];
    for (let i = 0; i < n; i++) if (regions[i] === `arm${side}`) arm.push(new THREE.Vector3().fromBufferAttribute(pos, i));
    if (arm.length > 20) {
      const far = arm.map((p) => ({ p, d: p.distanceTo(s) })).sort((a, b) => b.d - a.d).slice(0, Math.max(5, Math.round(arm.length * 0.08)));
      const hand = far.reduce((acc, f) => acc.add(f.p), new THREE.Vector3()).divideScalar(far.length);
      const elbow = s.clone().lerp(hand, 0.5);
      elbow.z -= 0.02; // el codo, algo hacia atrás
      joints[`arm${side}`] = { shoulder: s, elbow, hand };
    }
    const leg = [];
    for (let i = 0; i < n; i++) if (regions[i] === `leg${side}`) leg.push(new THREE.Vector3().fromBufferAttribute(pos, i));
    if (leg.length > 20) {
      const c = leg.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(leg.length);
      const hip = new THREE.Vector3(c.x, hipY, c.z);
      const foot = new THREE.Vector3(c.x, 0.03 * o.H, c.z);
      const knee = hip.clone().lerp(foot, 0.5);
      knee.z += 0.02; // la rodilla, algo hacia delante
      joints[`leg${side}`] = { hip, knee, foot };
    }
  }

  const bones = [
    { name: 'root', parent: null, position: new THREE.Vector3(0, 0, 0) },
    { name: 'hips', parent: 'root', position: new THREE.Vector3(0, hipY, 0) },
    { name: 'spine', parent: 'hips', position: new THREE.Vector3(0, hipY + (neckY - hipY) * 0.45, 0) },
    { name: 'chest', parent: 'spine', position: new THREE.Vector3(0, hipY + (neckY - hipY) * 0.8, 0) },
    { name: 'head', parent: 'chest', position: new THREE.Vector3(0, neckY, 0) },
  ];
  for (const side of ['L', 'R']) {
    const a = joints[`arm${side}`];
    if (a) bones.push({ name: `upperArm${side}`, parent: 'chest', position: a.shoulder }, { name: `foreArm${side}`, parent: `upperArm${side}`, position: a.elbow }, { name: `hand${side}`, parent: `foreArm${side}`, position: a.hand });
    const l = joints[`leg${side}`];
    if (l) bones.push({ name: `thigh${side}`, parent: 'hips', position: l.hip }, { name: `shin${side}`, parent: `thigh${side}`, position: l.knee }, { name: `foot${side}`, parent: `shin${side}`, position: l.foot });
  }
  const index = Object.fromEntries(bones.map((b, i) => [b.name, i]));

  // Pesos: cada vértice, según su zona y dónde está dentro de ella
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const ab = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    const r = regions[i];
    const w = {};
    if (r === 'head') {
      const h = smooth(neckY, neckY + 0.07 * o.H, v.y);
      w.head = h; w.chest = 1 - h;
    } else if (r.startsWith('arm') && joints[r]) {
      const side = r.slice(3);
      const a = joints[r];
      ab.subVectors(a.hand, a.shoulder);
      const t = Math.max(0, v.clone().sub(a.shoulder).dot(ab) / ab.lengthSq());
      const chest = 1 - smooth(0, 0.22, t);
      const fore = smooth(0.4, 0.6, t);
      w.chest = chest; w[`foreArm${side}`] = fore * (1 - chest); w[`upperArm${side}`] = (1 - fore) * (1 - chest);
    } else if (r.startsWith('leg') && joints[r]) {
      const side = r.slice(3);
      const t = Math.min(1, Math.max(0, (hipY - v.y) / (hipY - 0.03 * o.H)));
      const hips = 1 - smooth(0, 0.22, t);
      const shin = smooth(0.4, 0.6, t);
      w.hips = hips; w[`shin${side}`] = shin * (1 - hips); w[`thigh${side}`] = (1 - shin) * (1 - hips);
    } else {
      const u = Math.min(1, Math.max(0, (v.y - hipY) / (neckY - hipY)));
      let hips = 1 - smooth(0.12, 0.45, u);
      const chest = smooth(0.5, 0.85, u);
      // Faldas y pantalones cortos: lo bajo del tronco va algo con el muslo de su lado (más abajo y más al lado,
      // más), para que la pierna no lo atraviese al correr; en el centro, nada (no se rompe entre las dos)
      const side = v.x < 0 ? 'R' : 'L';
      const legW = joints[`leg${side}`] ? 0.6 * (1 - smooth(hipY, hipY + 0.12 * o.H, v.y)) * smooth(0, 0.1 * o.W, Math.abs(v.x)) : 0;
      if (legW > 0) { w[`thigh${side}`] = legW * hips; hips *= 1 - legW; }
      w.hips = hips; w.chest = chest; w.spine = Math.max(0, 1 - (w.hips + (w[`thigh${side}`] ?? 0)) - chest);
    }
    const list = Object.entries(w).filter(([, x]) => x > 0.001).sort((p, q) => q[1] - p[1]).slice(0, 4);
    const total = list.reduce((s, [, x]) => s + x, 0) || 1;
    list.forEach(([name, x], k) => { skinIndex[i * 4 + k] = index[name] ?? index.chest; skinWeight[i * 4 + k] = x / total; });
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  return { bones };
}

/** Huesos de una figura (cada muñeco los suyos) a partir de la plantilla; devuelve { root, byName, skeleton }. */
export function makeBones(template) {
  const byName = {};
  const list = template.bones.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    byName[b.name] = bone;
    return bone;
  });
  template.bones.forEach((b, i) => {
    const bone = list[i];
    if (b.parent) {
      byName[b.parent].add(bone);
      bone.position.copy(b.position).sub(template.bones.find((p) => p.name === b.parent).position);
    } else {
      bone.position.copy(b.position);
    }
  });
  return { root: list[0], byName, skeleton: new THREE.Skeleton(list) };
}
