import * as THREE from 'three';
import { plastic } from '../render/materials.js';
import { POWERUPS } from '../content/powerups.js';

export const WEAPON_STATE = Object.freeze({
  HELD: 'held', // en la mano de alguien
  OUT: 'out', // ida: frena poco a poco
  RETURN: 'return', // vuelta: busca a quien lo lanzó
  GROUND: 'ground', // en el suelo, lo puede recoger cualquiera sin arma
});

const SPIN = 24; // rad/s en vuelo
const HELD_SCALE = 0.75;
const GROUND_HEIGHT = 0.07;
const BOUNCE_DEBOUNCE_MS = 60; // un mismo choque puede avisar en varios pasos seguidos
const NORMAL_FLIGHT = Object.freeze({ maxBounces: 0, decelerationFactor: 1, homing: false, big: false });

// Búmerang en V con volumen (extruido y biselado), tumbado en el plano del suelo.
const GEOMETRY = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.38, -0.2);
  shape.lineTo(0, 0.22);
  shape.lineTo(0.38, -0.2);
  shape.lineTo(0.27, -0.27);
  shape.lineTo(0, 0.06);
  shape.lineTo(-0.27, -0.27);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 });
  geometry.rotateX(-Math.PI / 2);
  geometry.center();
  return geometry;
})();

/**
 * Búmerang: sale, frena, vuelve a su dueño y rebota en las paredes.
 * Interfaz de arma (para futuras armas): def, state, owner, holder, x, z, velocityAngle, dangerous, catchable,
 * attachTo, throw, dropAt, onWallHit, steer, sync, destroy.
 */
export class Boomerang {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.mesh = new THREE.Mesh(GEOMETRY, plastic(0xffffff));
    this.mesh.scale.setScalar(def.scale);
    this.mesh.castShadow = true;
    game.stage.scene.add(this.mesh);

    this.body = game.physics.createWeaponBody(def.radius);
    this.body.entity = this;
    this.body.addEventListener('collide', () => this.onWallHit()); // choca con paredes, torres y juguetes

    this.state = WEAPON_STATE.GROUND;
    this.holder = null;
    this.owner = null;
    this.flightMs = 0;
    this.bounces = 0;
    this.lastBounceAt = -Infinity;
    this.pendingBounce = false;
    this.flight = NORMAL_FLIGHT; // modificadores del vuelo actual según las habilidades de quien lo lanzó
    this.hand = new THREE.Vector3();
  }

  /** Radio con el que alcanza a los personajes (mayor con el búmerang gigante). */
  get hitRadius() {
    return this.def.radius * (this.flight.big ? POWERUPS.gigante.hitFactor : 1);
  }

  get x() { return this.body.position.x; }
  get z() { return this.body.position.z; }
  get velocityAngle() { return Math.atan2(this.body.velocity.z, this.body.velocity.x); }

  get dangerous() {
    return this.state === WEAPON_STATE.OUT || this.state === WEAPON_STATE.RETURN;
  }

  get catchable() {
    return this.state === WEAPON_STATE.RETURN || (this.state === WEAPON_STATE.OUT && this.flightMs >= this.def.catchDelayMs);
  }

  attachTo(character) {
    this.state = WEAPON_STATE.HELD;
    this.holder = character;
    this.owner = character;
    character.weapon = this;
    this.game.physics.remove(this.body);
    this.mesh.material = plastic(character.color);
    this.mesh.scale.setScalar(this.def.scale * HELD_SCALE);
  }

  /** Lanza el arma desde el centro del portador (nunca empieza dentro de una pared). */
  throw(charge) {
    const thrower = this.holder;
    this.release();
    this.state = WEAPON_STATE.OUT;
    this.flightMs = 0;
    this.bounces = 0;
    this.pendingBounce = false;
    const rebote = thrower.hasAbility('rebote');
    this.flight = {
      maxBounces: this.def.maxBounces + (rebote ? POWERUPS.rebote.extraBounces : 0),
      decelerationFactor: rebote ? POWERUPS.rebote.decelerationFactor : 1,
      homing: thrower.hasAbility('teledirigido'),
      big: thrower.hasAbility('gigante'),
    };
    const speed = THREE.MathUtils.lerp(this.def.minSpeed, this.def.maxSpeed, charge) * (rebote ? POWERUPS.rebote.speedFactor : 1);
    this.launch(thrower.x, thrower.z, Math.cos(thrower.facing) * speed, Math.sin(thrower.facing) * speed);
    this.body.linearDamping = 0;
  }

  /** Suelta el arma en el suelo (p. ej. al morir el portador). */
  dropAt(x, z, angle) {
    this.release();
    this.launch(x, z, Math.cos(angle) * 2.5, Math.sin(angle) * 2.5);
    this.toGround();
  }

  launch(x, z, vx, vz) {
    this.body.position.set(x, this.def.flightHeight, z);
    this.body.velocity.set(vx, 0, vz);
    this.game.physics.add(this.body);
  }

  release() {
    if (this.holder) this.holder.weapon = null;
    this.holder = null;
    this.flight = NORMAL_FLIGHT;
    this.mesh.scale.setScalar(this.def.scale);
  }

  toGround() {
    this.state = WEAPON_STATE.GROUND;
    this.body.linearDamping = this.def.groundDamping;
  }

  /** Rebote en pared, torre o juguete: en la ida sigue rebotando hasta agotar sus rebotes. */
  onWallHit() {
    const now = performance.now();
    if (this.state !== WEAPON_STATE.OUT || now - this.lastBounceAt < BOUNCE_DEBOUNCE_MS) return;
    this.lastBounceAt = now;
    this.bounces++;
    this.pendingBounce = true;
    if (this.bounces > this.flight.maxBounces) this.state = WEAPON_STATE.RETURN;
  }

  /** Antes del paso de física: frenado de ida y corrección de rumbo en la vuelta. */
  steer(dt) {
    if (!this.dangerous) return;
    const velocity = this.body.velocity;
    this.flightMs += dt * 1000;
    if (this.flightMs > this.def.maxFlightMs) {
      this.toGround();
      velocity.scale(0.4, velocity);
      return;
    }

    if (this.pendingBounce) {
      this.pendingBounce = false;
      velocity.scale(this.def.bounceSpeedKeep, velocity); // cada rebote le quita un poco de fuerza
    }

    if (this.state === WEAPON_STATE.OUT) {
      if (this.flight.homing) this.homeIn(dt);
      const speed = Math.hypot(velocity.x, velocity.z);
      const next = speed - this.def.deceleration * this.flight.decelerationFactor * dt;
      if (next <= this.def.turnSpeed) {
        this.state = WEAPON_STATE.RETURN;
      } else {
        velocity.x *= next / speed;
        velocity.z *= next / speed;
      }
      return;
    }

    // Vuelta: si el dueño ya no está, cae al suelo.
    const owner = this.owner;
    if (!owner || !owner.alive) {
      this.toGround();
      velocity.scale(0.5, velocity);
      return;
    }
    const dx = owner.x - this.x;
    const dz = owner.z - this.z;
    const distance = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, this.def.returnSteer * dt);
    velocity.x += ((dx / distance) * this.def.returnSpeed - velocity.x) * k;
    velocity.z += ((dz / distance) * this.def.returnSpeed - velocity.z) * k;
  }

  /** Teledirigido: en la ida tuerce poco a poco hacia el rival más cercano que tenga delante. */
  homeIn(dt) {
    const velocity = this.body.velocity;
    const speed = Math.hypot(velocity.x, velocity.z) || 1;
    const { range, steer } = POWERUPS.teledirigido;
    let target = null;
    let best = range;
    for (const other of this.game.characters.values()) {
      if (other === this.owner || !other.alive) continue;
      const dx = other.x - this.x;
      const dz = other.z - this.z;
      const distance = Math.hypot(dx, dz);
      if (distance < best && (dx * velocity.x + dz * velocity.z) / (distance * speed) > 0.2) {
        best = distance;
        target = { dx: dx / distance, dz: dz / distance };
      }
    }
    if (!target) return;
    const k = Math.min(1, steer * dt);
    const vx = velocity.x / speed + (target.dx - velocity.x / speed) * k;
    const vz = velocity.z / speed + (target.dz - velocity.z / speed) * k;
    const length = Math.hypot(vx, vz) || 1;
    velocity.x = (vx / length) * speed;
    velocity.z = (vz / length) * speed;
  }

  /** Después del paso de física: coloca la malla (en la mano, en vuelo o en el suelo). */
  sync(dt) {
    const mesh = this.mesh;
    if (this.state === WEAPON_STATE.HELD) {
      this.holder.handPosition(this.hand);
      mesh.position.copy(this.hand);
      mesh.rotation.set(0, -this.holder.facing - Math.PI / 2, 0);
      mesh.visible = this.holder.figure.group.visible;
      return;
    }
    mesh.visible = true;
    if (this.state === WEAPON_STATE.GROUND) {
      mesh.position.set(this.x, GROUND_HEIGHT, this.z);
      mesh.rotation.y += Math.hypot(this.body.velocity.x, this.body.velocity.z) * 2 * dt;
      return;
    }
    mesh.position.set(this.x, this.def.flightHeight, this.z);
    mesh.rotation.y += SPIN * dt;
    mesh.scale.setScalar(this.def.scale * (this.flight.big ? POWERUPS.gigante.scale : 1));
  }

  destroy() {
    this.release();
    this.game.physics.remove(this.body);
    this.game.stage.scene.remove(this.mesh);
  }
}
