import { PowerUp } from '../entities/PowerUp.js';
import { POWERUPS, SUPERS, POWERUP_SPAWN as CFG, SUPER_SPAWN } from '../content/powerups.js';

const random = (min, max) => min + Math.random() * (max - min);
const TYPES = Object.values(POWERUPS);
const SUPER_TYPES = Object.values(SUPERS);

/**
 * Hace aparecer cajas sorpresa en casillas libres de la arena y entrega su habilidad a quien las coge.
 * De vez en cuando sale una caja dorada con una superhabilidad (de un solo uso).
 */
export class PowerUpSpawner {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.opening = []; // cogidas: se están abriendo antes de desaparecer
    this.nextSpawnAt = 0;
  }

  /** Quita todas las cajas (arena nueva) y programa la primera. */
  reset(now) {
    for (const item of [...this.items, ...this.opening]) item.destroy();
    this.items = [];
    this.opening = [];
    this.nextSpawnAt = now + random(...CFG.firstDelayMs);
    this.nextSuperAt = now + random(...SUPER_SPAWN.firstDelayMs);
  }

  update(now) {
    const game = this.game;
    if (!this.nextSpawnAt) this.reset(now);
    if (!game.frozen && now >= this.nextSpawnAt) {
      this.nextSpawnAt = now + random(...CFG.intervalMs);
      if (this.items.filter((i) => !i.def.super).length < CFG.maxOnMap) this.spawn(TYPES);
    }
    if (!game.frozen && now >= this.nextSuperAt) {
      this.nextSuperAt = now + random(...SUPER_SPAWN.intervalMs);
      if (this.items.filter((i) => i.def.super).length < SUPER_SPAWN.maxOnMap) this.spawn(SUPER_TYPES);
    }

    for (const item of this.items) item.update(now);
    this.opening = this.opening.filter((item) => {
      if (item.update(now)) return true;
      item.destroy();
      return false;
    });
    for (const character of game.characters.values()) {
      if (!character.alive) continue;
      const index = this.items.findIndex((item) => Math.hypot(item.x - character.x, item.z - character.z) < CFG.pickupRadius);
      if (index < 0) continue;
      const [item] = this.items.splice(index, 1);
      if (item.def.super) {
        character.setSuper(item.def.id);
        game.effects.burst(item.x, 0.8, item.z, [0xffc93c, item.def.color, 0xffffff], 34, 1);
        game.effects.ring(item.x, item.z);
        game.announce?.(item.def, `${character.label} tiene ${item.def.name}`, 'superhabilidad de un solo uso');
      } else {
        character.addAbility(item.def.id);
        game.effects.burst(item.x, 0.6, item.z, [item.def.color, 0xffffff], 18, 0.6);
      }
      character.figure.hop?.(); // saltito de alegría
      item.open(now); // se abre (la tapa salta) y luego desaparece
      this.opening.push(item);
    }
  }

  /** Una caja de uno de esos tipos en un punto libre lejos de todos. */
  spawn(types = TYPES) {
    const game = this.game;
    const occupied = [...game.characters.values()].filter((c) => c.alive).concat(this.items);
    const candidates = game.arena.freePoints.filter((p) =>
      occupied.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > CFG.minDistanceToPlayers));
    if (!candidates.length) return;
    const point = candidates[Math.floor(Math.random() * candidates.length)];
    const def = types[Math.floor(Math.random() * types.length)];
    this.items.push(new PowerUp(game.stage, def, point.x, point.z));
  }
}
