import { WEAPON_STATE } from '../entities/Boomerang.js';

const { BUTTONS } = window.Protocol;

const AIM_ERROR = 0.18; // radianes de error al apuntar (para que se le pueda ganar)
const THROW_RANGE = 9; // distancia máxima a la que intenta lanzar
const PREFERRED_DISTANCE = [3, 5.5]; // se acerca si está más lejos y se aparta si está más cerca
const DODGE_DISTANCE = 3.5;
const STUCK_MS = 450;

const random = (min, max) => min + Math.random() * (max - min);

/**
 * Cerebro de un bot: cada fotograma produce una entrada con el mismo formato que la de un mando
 * ({ x, y, aimX, aimY, buttons, presses, dashes, stale }), así el personaje no distingue bots de jugadores.
 */
export class BotBrain {
  constructor(character) {
    this.character = character;
    this.input = { x: 0, y: 0, aimX: 0, aimY: 0, buttons: 0, presses: 0, dashes: 0, stale: false };
    this.mode = 'idle'; // idle | aiming | tapping
    this.aimAngle = 0;
    this.releaseAt = 0;
    this.nextAttackAt = performance.now() + 1500; // no ataca nada más aparecer
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.blockedSince = 0;
  }

  update(now, game) {
    const me = this.character;
    const input = this.input;
    if (!me.alive) {
      this.setAttack(false);
      this.mode = 'idle';
      input.x = input.y = input.aimX = input.aimY = 0;
      return input;
    }

    // Termina la acción en curso.
    if (this.mode === 'tapping') {
      this.setAttack(false);
      this.mode = 'idle';
    } else if (this.mode === 'aiming' && now >= this.releaseAt) {
      this.setAttack(false); // suelta: lanza en la última dirección apuntada
      this.mode = 'idle';
      this.nextAttackAt = now + random(700, 1400);
    }

    const target = this.nearestEnemy(game);
    let moveAngle = null;
    let speed = 1;

    if (!me.weapon) {
      const loot = this.nearestGroundWeapon(game);
      if (loot) moveAngle = Math.atan2(loot.z - me.z, loot.x - me.x);
    } else if (target) {
      const dx = target.x - me.x;
      const dz = target.z - me.z;
      const distance = Math.hypot(dx, dz);
      const toTarget = Math.atan2(dz, dx);
      const melee = me.weapon.def.meleeRange + target.def.radius * 0.6;

      if (this.mode === 'idle' && now >= this.nextAttackAt) {
        if (distance < melee) {
          // Cuchillada: un toque sin apuntar, mirando al rival.
          me.facing = toTarget;
          input.aimX = input.aimY = 0;
          this.setAttack(true);
          this.mode = 'tapping';
          this.nextAttackAt = now + random(450, 800);
        } else if (distance < THROW_RANGE) {
          this.aimAngle = toTarget + random(-AIM_ERROR, AIM_ERROR);
          this.releaseAt = now + random(250, 300 + distance * 60); // más carga cuanto más lejos
          this.setAttack(true);
          this.mode = 'aiming';
        }
      }

      if (distance > PREFERRED_DISTANCE[1]) moveAngle = toTarget;
      else if (distance < PREFERRED_DISTANCE[0]) moveAngle = toTarget + Math.PI;
      else moveAngle = toTarget + (Math.PI / 2) * this.strafe;
    } else {
      this.wanderAngle += random(-0.6, 0.6) * 0.1;
      moveAngle = this.wanderAngle;
      speed = 0.5;
    }

    if (this.mode === 'aiming') {
      input.aimX = Math.cos(this.aimAngle);
      input.aimY = Math.sin(this.aimAngle);
    } else if (this.mode !== 'tapping') {
      input.aimX = input.aimY = 0;
    }

    moveAngle = this.avoidWalls(now, moveAngle);
    input.x = moveAngle === null ? 0 : Math.cos(moveAngle) * speed;
    input.y = moveAngle === null ? 0 : Math.sin(moveAngle) * speed;
    this.dodge(game, now); // si esquiva, sustituye la dirección de movimiento por la del dash
    return input;
  }

  setAttack(pressed) {
    const input = this.input;
    const wasPressed = (input.buttons & BUTTONS.ACTION) !== 0;
    if (pressed && !wasPressed) input.presses++;
    input.buttons = pressed ? input.buttons | BUTTONS.ACTION : input.buttons & ~BUTTONS.ACTION;
  }

  nearestEnemy(game) {
    let best = null;
    let bestDistance = Infinity;
    for (const other of game.characters.values()) {
      if (other === this.character || !other.alive) continue;
      const d = Math.hypot(other.x - this.character.x, other.z - this.character.z);
      if (d < bestDistance) {
        best = other;
        bestDistance = d;
      }
    }
    return best;
  }

  nearestGroundWeapon(game) {
    let best = null;
    let bestDistance = Infinity;
    for (const weapon of game.weapons) {
      if (weapon.state !== WEAPON_STATE.GROUND) continue;
      const d = Math.hypot(weapon.x - this.character.x, weapon.z - this.character.z);
      if (d < bestDistance) {
        best = weapon;
        bestDistance = d;
      }
    }
    return best;
  }

  /** Si lleva un rato queriendo andar sin avanzar (contra un bloque), cambia de rumbo. */
  avoidWalls(now, angle) {
    if (angle === null) return angle;
    const velocity = this.character.body.velocity;
    const actual = Math.hypot(velocity.x, velocity.z);
    if (actual > 1) {
      this.blockedSince = 0;
      return angle;
    }
    if (!this.blockedSince) this.blockedSince = now;
    if (now - this.blockedSince > STUCK_MS) {
      this.strafe = -this.strafe;
      this.wanderAngle = angle + Math.PI / 2 * this.strafe;
      this.blockedSince = 0;
    }
    return now - this.blockedSince > STUCK_MS / 2 ? angle + (Math.PI / 2) * this.strafe : angle;
  }

  /** Dash lateral si un búmerang ajeno viene directo hacia él. */
  dodge(game, now) {
    const me = this.character;
    if (now < me.dashReadyAt) return;
    for (const weapon of game.weapons) {
      if (!weapon.dangerous || weapon.owner === me) continue;
      const rx = me.x - weapon.x;
      const rz = me.z - weapon.z;
      const distance = Math.hypot(rx, rz);
      if (distance > DODGE_DISTANCE) continue;
      const vx = weapon.body.velocity.x;
      const vz = weapon.body.velocity.z;
      const speed = Math.hypot(vx, vz) || 1;
      const closing = (rx * vx + rz * vz) / speed; // cuánto se acerca en su dirección
      const miss = Math.abs(rx * vz - rz * vx) / speed; // a qué distancia pasará
      if (closing <= 0 || miss > 1.2) continue;
      const side = Math.sign(rx * vz - rz * vx) || 1;
      const angle = Math.atan2(vz, vx) + (Math.PI / 2) * side;
      this.input.x = Math.cos(angle);
      this.input.y = Math.sin(angle);
      this.input.dashes++;
      return;
    }
  }
}
