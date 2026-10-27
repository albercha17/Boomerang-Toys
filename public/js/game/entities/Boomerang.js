export const WEAPON_STATE = Object.freeze({
  HELD: 'held', // en la mano de alguien
  OUT: 'out', // ida: frena poco a poco
  RETURN: 'return', // vuelta: busca a quien lo lanzó
  GROUND: 'ground', // en el suelo, lo puede recoger cualquiera sin arma
});

const SPIN = 24; // rad/s en vuelo
const HELD_SCALE = 0.75;

/**
 * Búmerang: proyectil que sale, frena, vuelve a su dueño y rebota en las paredes.
 * Interfaz de arma (para futuras armas): def, state, owner, dangerous, attachTo, throw, dropAt, onWallHit, update, destroy.
 */
export class Boomerang {
  constructor(scene, group, def) {
    this.scene = scene;
    this.def = def;
    this.sprite = scene.physics.add.image(0, 0, def.texture).setDepth(12);
    group.add(this.sprite); // el grupo aplica sus valores por defecto: configurar el cuerpo después
    this.sprite.entity = this;

    const body = this.sprite.body;
    const half = this.sprite.width / 2;
    body.setCircle(def.radius, half - def.radius, half - def.radius);
    body.setBounce(1, 1);
    body.setDamping(true);

    this.state = WEAPON_STATE.GROUND;
    this.holder = null;
    this.owner = null;
    this.flightMs = 0;
  }

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
    this.sprite.body.stop();
    this.sprite.body.enable = false;
    this.sprite.setTint(character.color).setScale(HELD_SCALE);
  }

  /** Lanza el arma desde el centro del portador (nunca empieza dentro de una pared). */
  throw(charge) {
    const thrower = this.holder;
    this.release();
    this.state = WEAPON_STATE.OUT;
    this.flightMs = 0;
    const speed = Phaser.Math.Linear(this.def.minSpeed, this.def.maxSpeed, charge);
    const body = this.sprite.body;
    body.enable = true;
    body.reset(thrower.x, thrower.y);
    body.setDrag(1, 1);
    body.setVelocity(Math.cos(thrower.facing) * speed, Math.sin(thrower.facing) * speed);
  }

  /** Suelta el arma en el suelo (p. ej. al morir el portador). */
  dropAt(x, y, angle) {
    this.release();
    const body = this.sprite.body;
    body.enable = true;
    body.reset(x, y);
    this.toGround();
    body.setVelocity(Math.cos(angle) * 160, Math.sin(angle) * 160);
  }

  release() {
    if (this.holder) this.holder.weapon = null;
    this.holder = null;
    this.sprite.setScale(1); // antes de activar el cuerpo, que escala con el sprite
  }

  toGround() {
    this.state = WEAPON_STATE.GROUND;
    this.sprite.body.setDrag(this.def.groundDrag, this.def.groundDrag);
  }

  onWallHit() {
    if (this.state === WEAPON_STATE.OUT) this.state = WEAPON_STATE.RETURN;
  }

  update(dt) {
    const sprite = this.sprite;
    const body = sprite.body;

    if (this.state === WEAPON_STATE.HELD) {
      const hand = this.holder.handPosition();
      sprite.setPosition(hand.x, hand.y);
      sprite.rotation = this.holder.facing + Math.PI / 2;
      return;
    }
    if (this.state === WEAPON_STATE.GROUND) {
      sprite.rotation += body.speed * 0.02 * dt;
      return;
    }

    this.flightMs += dt * 1000;
    sprite.rotation += SPIN * dt;
    if (this.flightMs > this.def.maxFlightMs) {
      this.toGround();
      body.velocity.scale(0.4);
      return;
    }

    if (this.state === WEAPON_STATE.OUT) {
      const speed = body.velocity.length() - this.def.deceleration * dt;
      if (speed <= this.def.turnSpeed) this.state = WEAPON_STATE.RETURN;
      else body.velocity.setLength(speed);
      return;
    }

    // Vuelta: corrige el rumbo hacia el dueño; si ya no está, cae al suelo.
    const owner = this.owner;
    if (!owner || !owner.alive) {
      this.toGround();
      body.velocity.scale(0.5);
      return;
    }
    const dx = owner.x - sprite.x;
    const dy = owner.y - sprite.y;
    const distance = Math.hypot(dx, dy) || 1;
    const steer = Math.min(1, this.def.returnSteer * dt);
    body.velocity.x += ((dx / distance) * this.def.returnSpeed - body.velocity.x) * steer;
    body.velocity.y += ((dy / distance) * this.def.returnSpeed - body.velocity.y) * steer;
  }

  destroy() {
    this.release();
    this.sprite.destroy();
  }
}
