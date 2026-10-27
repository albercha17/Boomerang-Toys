import { PowerUp } from '../entities/PowerUp.js';
import { POWERUPS, POWERUP_SPAWN as CFG } from '../content/powerups.js';

const random = (min, max) => min + Math.random() * (max - min);
const TYPES = Object.values(POWERUPS);

/**
 * Hace aparecer cajas sorpresa en casillas libres de la arena y entrega su habilidad a quien las coge.
 */
export class PowerUpSpawner {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.nextSpawnAt = 0;
  }

  /** Quita todas las cajas (arena nueva) y programa la primera. */
  reset(now) {
    for (const item of this.items) item.destroy();
    this.items = [];
    this.nextSpawnAt = now + random(...CFG.firstDelayMs);
  }

  update(now) {
    const game = this.game;
    if (!this.nextSpawnAt) this.reset(now);
    if (!game.frozen && now >= this.nextSpawnAt) {
      this.nextSpawnAt = now + random(...CFG.intervalMs);
      if (this.items.length < CFG.maxOnMap) this.spawn();
    }

    for (const item of this.items) item.update(now);
    for (const character of game.characters.values()) {
      if (!character.alive) continue;
      const index = this.items.findIndex((item) => Math.hypot(item.x - character.x, item.z - character.z) < CFG.pickupRadius);
      if (index < 0) continue;
      const [item] = this.items.splice(index, 1);
      character.addAbility(item.def.id);
      game.effects.burst(item.x, 0.6, item.z, [item.def.color, 0xffffff], 18, 0.6);
      item.destroy();
    }
  }

  spawn() {
    const game = this.game;
    const occupied = [...game.characters.values()].filter((c) => c.alive).concat(this.items);
    const candidates = game.arena.freePoints.filter((p) =>
      occupied.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > CFG.minDistanceToPlayers));
    if (!candidates.length) return;
    const point = candidates[Math.floor(Math.random() * candidates.length)];
    const def = TYPES[Math.floor(Math.random() * TYPES.length)];
    this.items.push(new PowerUp(game.stage, def, point.x, point.z));
  }
}
