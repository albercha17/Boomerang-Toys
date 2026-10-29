import * as THREE from 'three';
import { flat } from '../render/materials.js';

const PARTICLE_GEOMETRY = new THREE.BoxGeometry(0.09, 0.09, 0.09);
const GRAVITY = 18;
const DUST_GEOMETRY = new THREE.SphereGeometry(1, 8, 6);

/**
 * Efectos visuales efímeros: confeti de impacto, onda expansiva y arco del golpe.
 * No tienen física real (son decorativos) y se eliminan solos.
 */
export class Effects {
  constructor(stage) {
    this.stage = stage;
    this.particles = [];
    this.transients = []; // { mesh, age, life, tick(t) }
  }

  /** Confeti en todas direcciones. `power` escala la fuerza (1 = estallido de un muñeco). */
  burst(x, y, z, colors, count = 28, power = 1) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(PARTICLE_GEOMETRY, flat(colors[i % colors.length]));
      mesh.position.set(x, y, z);
      const angle = Math.random() * Math.PI * 2;
      const speed = (2 + Math.random() * 4.5) * power;
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(Math.cos(angle) * speed, (3 + Math.random() * 4.5) * power, Math.sin(angle) * speed),
        spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, 0),
        age: 0,
        life: 0.5 + Math.random() * 0.45,
      });
      this.stage.scene.add(mesh);
    }
  }

  /** Polvillo de una pisada: una nubecita que crece, sube un poco y se desvanece. */
  dust(x, z, color = 0xf1eadf) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
    const mesh = new THREE.Mesh(DUST_GEOMETRY, material);
    mesh.position.set(x + (Math.random() - 0.5) * 0.2, 0.08, z + (Math.random() - 0.5) * 0.2);
    this.addTransient(mesh, 0.45, (t) => {
      mesh.scale.setScalar(0.12 + t * 0.28);
      mesh.position.y = 0.08 + t * 0.18;
      material.opacity = 0.55 * (1 - t);
    });
  }

  /** Onda blanca en el suelo. */
  ring(x, z) {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.05, z);
    this.addTransient(mesh, 0.3, (t) => {
      mesh.scale.setScalar(1 + t * 2.5);
      material.opacity = 1 - t;
    });
  }

  /** Arco del golpe cuerpo a cuerpo delante del personaje. */
  slash(x, z, angle, range, color) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    // RingGeometry se dibuja en XY; al tumbarla, el ángulo θ queda en -θ sobre el suelo.
    const mesh = new THREE.Mesh(new THREE.RingGeometry(range - 0.2, range, 24, 1, -angle - 1.1, 2.2), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.5, z);
    this.addTransient(mesh, 0.16, (t) => { material.opacity = 0.95 * (1 - t); });
  }

  addTransient(mesh, life, tick) {
    this.stage.scene.add(mesh);
    this.transients.push({ mesh, age: 0, life, tick });
  }

  update(dt) {
    this.particles = this.particles.filter((p) => {
      p.age += dt;
      if (p.age >= p.life) {
        this.stage.scene.remove(p.mesh);
        return false;
      }
      p.velocity.y -= GRAVITY * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      if (p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.velocity.y *= -0.4;
      }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.scale.setScalar(1 - p.age / p.life);
      return true;
    });

    this.transients = this.transients.filter((fx) => {
      fx.age += dt;
      const t = Math.min(1, fx.age / fx.life);
      fx.tick(t);
      if (t < 1) return true;
      this.stage.scene.remove(fx.mesh);
      fx.mesh.geometry.dispose();
      fx.mesh.material.dispose();
      return false;
    });
  }
}
