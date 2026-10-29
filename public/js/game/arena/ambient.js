import * as THREE from 'three';

/**
 * Ambiente de los mapas (solo se ve, no juega): humo que sale de los volcanes (objetos con el modelo «volcan») y
 * burbujas que revientan en la lava. Pocas mallas que se reutilizan; update(now, dt) las anima.
 */
export function buildAmbient(root, data, own) {
  const parts = [];
  const puffGeometry = own(new THREE.SphereGeometry(1, 10, 8));

  for (const o of data.objects.filter((it) => it.model === 'volcan')) {
    const [, h] = o.size;
    const top = { x: o.x, y: (o.y ?? 0) + h * 0.95, z: o.z };
    const scale = h / 4;
    for (let i = 0; i < 7; i++) {
      const material = own(new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 1, transparent: true, opacity: 0, depthWrite: false }));
      const mesh = new THREE.Mesh(puffGeometry, material);
      root.add(mesh);
      parts.push({ kind: 'smoke', mesh, top, scale, period: 4200, phase: i / 7 });
    }
  }

  // Bajo las pasarelas no salen burbujas (asomarían por encima)
  const bridges = (data.devices ?? []).filter((d) => d.type === 'fragile');
  const covered = (x, z) => bridges.some((d) => {
    const turned = Math.abs(Math.round((d.rot ?? 0) / 90)) % 2 === 1;
    const hw = (turned ? d.d : d.w) / 2 + 0.4;
    const hd = (turned ? d.w : d.d) / 2 + 0.4;
    return Math.abs(x - d.x) < hw && Math.abs(z - d.z) < hd;
  });
  const bubbleGeometry = own(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)); // media esfera
  const bubbleMaterial = own(new THREE.MeshBasicMaterial({ color: 0xffe36a }));
  for (const w of (data.water ?? []).filter((it) => it.lava)) {
    const n = Math.max(2, Math.round((w.w * w.d) / 6));
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
      mesh.visible = false;
      root.add(mesh);
      parts.push({ kind: 'bubble', mesh, pool: w, period: 1400 + (i % 3) * 500, phase: i / n, seed: i * 7.31 });
    }
  }

  return {
    update(now) {
      for (const p of parts) {
        const k = ((now / p.period + p.phase) % 1 + 1) % 1; // 0..1 a lo largo de su vida
        if (p.kind === 'smoke') {
          const drift = Math.sin(p.phase * 12 + now / 3000) * 0.4;
          p.mesh.position.set(p.top.x + drift * p.scale + k * 0.8 * p.scale, p.top.y + k * 3.2 * p.scale, p.top.z - k * 0.5 * p.scale);
          p.mesh.scale.setScalar((0.35 + k * 0.9) * p.scale);
          p.mesh.material.opacity = Math.sin(k * Math.PI) * 0.55;
        } else {
          // Cada vuelta sale en otro sitio de la lava, crece y revienta
          const round = Math.floor(now / p.period + p.phase);
          const rx = Math.sin(round * 12.9898 + p.seed) * 43758.5453;
          const rz = Math.sin(round * 78.233 + p.seed) * 12345.6789;
          const fx = (rx - Math.floor(rx) - 0.5) * (p.pool.w - 0.8);
          const fz = (rz - Math.floor(rz) - 0.5) * (p.pool.d - 0.8);
          const grow = k < 0.6 ? k / 0.6 : 0;
          p.mesh.visible = grow > 0 && !covered(p.pool.x + fx, p.pool.z + fz);
          p.mesh.position.set(p.pool.x + fx, (p.pool.y ?? -0.3) + 0.02, p.pool.z + fz);
          p.mesh.scale.set(0.08 + grow * 0.45, 0.06 + grow * 0.34, 0.08 + grow * 0.45);
        }
      }
    },
  };
}
