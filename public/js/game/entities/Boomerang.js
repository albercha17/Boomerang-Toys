import * as THREE from 'three';
import { plastic } from '../render/materials.js';
import { POWERUPS } from '../content/powerups.js';
import { addOutlines } from '../render/toon.js';

export const WEAPON_STATE = Object.freeze({
  HELD: 'held', // en la mano de alguien
  OUT: 'out', // ida: frena poco a poco y rebota
  RETURN: 'return', // vuelta: busca a quien lo lanzó
  GROUND: 'ground', // en el suelo, lo puede recoger cualquiera sin arma
});

const SPIN = 24; // rad/s en vuelo
const HELD_SCALE = 0.75;
const GROUND_HEIGHT = 0.07;
const BOUNCE_DEBOUNCE_MS = 60; // un mismo choque puede avisar en varios pasos seguidos
const NORMAL_FLIGHT = Object.freeze({ explosive: false, fire: false, telekinesis: false });

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
 * Búmerang: sale, frena, rebota en paredes y juguetes y vuelve a su dueño.
 * Los power-ups de quien lo lanza cambian su vuelo (explosivo, fuego, telequinesis).
 * Con `temporary` es una copia del Multibúmerang: desaparece al volver o al caer.
 * Interfaz de arma (para futuras armas): def, state, owner, holder, x, z, hitRadius, velocityAngle, dangerous,
 * catchable, attachTo, throw, throwFrom, dropAt, onWallHit, steer, sync, destroy.
 */
export class Boomerang {
  constructor(game, def, { temporary = false } = {}) {
    this.game = game;
    this.def = def;
    this.temporary = temporary;
    this.mesh = new THREE.Mesh(GEOMETRY, plastic(0xffffff));
    this.mesh.scale.setScalar(def.scale);
    this.mesh.castShadow = true;
    addOutlines(this.mesh, 0.018);
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
    this.lastFireAt = 0;
    this.exploded = false;
    this.flight = NORMAL_FLIGHT; // efectos del vuelo actual según los power-ups de quien lo lanzó
    this.hand = new THREE.Vector3();
  }

  get hitRadius() { return this.def.radius; }
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
    this.throwFrom(thrower, thrower.facing, charge);
  }

  /** Vuelo desde un personaje en una dirección (también para las copias del Multibúmerang). */
  throwFrom(thrower, angle, charge) {
    this.owner = thrower;
    this.mesh.material = plastic(thrower.color);
    this.state = WEAPON_STATE.OUT;
    this.flightMs = 0;
    this.bounces = 0;
    this.pendingBounce = false;
    this.exploded = false;
    this.lastFireAt = 0;
    this.flight = {
      explosive: thrower.hasAbility('explosivo'),
      fire: thrower.hasAbility('fuego'),
      telekinesis: thrower.hasAbility('telequinesis'),
    };
    const speed = THREE.MathUtils.lerp(this.def.minSpeed, this.def.maxSpeed, charge);
    this.launch(thrower.x, thrower.z, Math.cos(angle) * speed, Math.sin(angle) * speed);
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
    this.mesh.scale.setScalar(this.def.scale);
  }

  toGround() {
    if (this.temporary) {
      this.game.removeWeapon(this); // las copias del Multibúmerang no se quedan en el suelo
      return;
    }
    this.state = WEAPON_STATE.GROUND;
    this.flight = NORMAL_FLIGHT;
    this.body.linearDamping = this.def.groundDamping;
  }

  /** Rebote en pared, torre o juguete: en la ida sigue rebotando hasta agotar sus rebotes. */
  onWallHit() {
    const now = performance.now();
    if (!this.dangerous || now - this.lastBounceAt < BOUNCE_DEBOUNCE_MS) return;
    this.lastBounceAt = now;
    this.detonate(); // Explosivo: estalla en el primer choque
    if (this.state !== WEAPON_STATE.OUT) return;
    this.bounces++;
    this.pendingBounce = true;
    if (this.bounces > this.def.maxBounces) this.state = WEAPON_STATE.RETURN;
  }

  /** Con Explosivo, estalla una vez por lanzamiento (al chocar o al dar a alguien). */
  detonate() {
    if (!this.flight.explosive || this.exploded) return;
    this.exploded = true;
    this.game.explode(this.x, this.z, this.owner, performance.now());
  }

  /** Antes del paso de física: frenado de ida, efectos de los power-ups y corrección de rumbo en la vuelta. */
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

    // Fuego: deja un rastro de llamas por donde pasa.
    if (this.flight.fire && this.flightMs - this.lastFireAt >= POWERUPS.fuego.intervalMs) {
      this.lastFireAt = this.flightMs;
      this.game.fire.add(this.x, this.z, this.owner, performance.now());
    }

    if (this.state === WEAPON_STATE.OUT) {
      if (this.flight.telekinesis) this.steerWithJoystick(dt);
      const speed = Math.hypot(velocity.x, velocity.z);
      const next = speed - this.def.deceleration * dt;
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

  /** Telequinesis: en la ida, el búmerang gira hacia donde apunta el joystick de movimiento de su dueño. */
  steerWithJoystick(dt) {
    const { x, y } = this.owner.moveInput;
    if (Math.hypot(x, y) < 0.3) return;
    const velocity = this.body.velocity;
    const speed = Math.hypot(velocity.x, velocity.z) || 1;
    const current = Math.atan2(velocity.z, velocity.x);
    const diff = Math.atan2(Math.sin(Math.atan2(y, x) - current), Math.cos(Math.atan2(y, x) - current));
    const step = Math.sign(diff) * Math.min(Math.abs(diff), POWERUPS.telequinesis.steer * dt);
    velocity.x = Math.cos(current + step) * speed;
    velocity.z = Math.sin(current + step) * speed;
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
  }

  destroy() {
    this.release();
    this.game.physics.remove(this.body);
    this.game.stage.scene.remove(this.mesh);
  }
}
