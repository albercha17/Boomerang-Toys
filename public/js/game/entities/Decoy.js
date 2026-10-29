import { makeFigure } from './makeFigure.js';
import { createTag } from './Character.js';
import { POWERUPS } from '../content/powerups.js';

/**
 * Señuelo: copia de un personaje que sigue corriendo en línea recta un rato y luego se queda quieta.
 * Engaña a los rivales (y al bot); si la alcanza un búmerang, fuego o explosión, se desmonta como uno de verdad.
 * Lleva encima la misma etiqueta que el original (nombre e iconos): así no se sabe cuál es la copia.
 * Tiene lo que DebrisSystem necesita para desmontarla: x, z, color y figure.
 */
export class Decoy {
  /** @param params { runMs, lifeMs, speed } (por defecto, los del Señuelo; la Hipermultiplicación pasa los suyos) */
  constructor(game, owner, angle, now, params = POWERUPS.senuelo) {
    this.params = params;
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
    this.tag = createTag(owner.cssColor ?? '#ffffff'); // el color en CSS, como la del original
    this.tagText = '';
    game.stage.scene.add(this.figure.group, this.tag);
  }

  get x() { return this.body.position.x; }
  get z() { return this.body.position.z; }

  /** @returns {boolean} false cuando ya ha cumplido su tiempo */
  update(dt, now) {
    const { runMs, lifeMs, speed } = this.params;
    const age = now - this.bornAt;
    const running = age < runMs;
    const v = running ? speed : 0;
    this.body.velocity.set(Math.cos(this.angle) * v, 0, Math.sin(this.angle) * v);
    this.figure.group.position.set(this.x, 0, this.z);
    this.figure.group.rotation.y = -this.angle;
    this.figure.animate(dt, running ? 1 : 0, false);
    // La etiqueta, copiada de la del original (si cambia la suya, cambia esta)
    const owner = this.owner;
    if (owner.tagText !== this.tagText && owner.tagText) {
      this.tagText = owner.tagText;
      const [label, line] = owner.tagText.split('|');
      this.tag.draw(label, line);
    }
    this.tag.position.set(this.x, 1.3 * this.def.scale + 0.55, this.z);
    return age < lifeMs;
  }

  destroy() {
    this.alive = false;
    this.game.physics.remove(this.body);
    this.game.stage.scene.remove(this.figure.group, this.tag);
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
  }
}
