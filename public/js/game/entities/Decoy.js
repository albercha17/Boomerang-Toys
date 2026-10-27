import { makeFigure } from './makeFigure.js';
import { POWERUPS } from '../content/powerups.js';

/**
 * Señuelo: copia de un personaje que sigue corriendo en línea recta un rato y luego se queda quieta.
 * Engaña a los rivales (y al bot); si la alcanza un búmerang, fuego o explosión, se desmonta como uno de verdad.
 * Tiene lo que DebrisSystem necesita para desmontarla: x, z, color y figure.
 */
export class Decoy {
  constructor(game, owner, angle, now) {
    this.game = game;
    this.owner = owner;
    this.color = owner.color;
    this.def = owner.def; // mismo tamaño y radio que el original
    this.angle = angle;
    this.bornAt = now;
    this.alive = true;
    this.isDecoy = true;

    this.body = game.physics.createCharacterBody(owner.def.radius, owner.x, owner.z);
    this.figure = makeFigure(owner.figureId, owner.color, owner.def.scale);
    this.figure.group.position.set(owner.x, 0, owner.z);
    game.stage.scene.add(this.figure.group);
  }

  get x() { return this.body.position.x; }
  get z() { return this.body.position.z; }

  /** @returns {boolean} false cuando ya ha cumplido su tiempo */
  update(dt, now) {
    const { runMs, lifeMs, speed } = POWERUPS.senuelo;
    const age = now - this.bornAt;
    const running = age < runMs;
    const v = running ? speed : 0;
    this.body.velocity.set(Math.cos(this.angle) * v, 0, Math.sin(this.angle) * v);
    this.figure.group.position.set(this.x, 0, this.z);
    this.figure.group.rotation.y = -this.angle;
    this.figure.animate(dt, running ? 1 : 0, false);
    return age < lifeMs;
  }

  destroy() {
    this.alive = false;
    this.game.physics.remove(this.body);
    this.game.stage.scene.remove(this.figure.group);
  }
}
