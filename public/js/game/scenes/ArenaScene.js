import { createTestArena } from '../arena/TestArena.js';
import { Character } from '../entities/Character.js';
import { Boomerang, WEAPON_STATE } from '../entities/Boomerang.js';
import { DebrisSystem } from '../effects/DebrisSystem.js';
import { CHARACTERS, DEFAULT_CHARACTER } from '../content/characters.js';
import { WEAPONS } from '../content/weapons.js';

const { FEEDBACK } = window.Protocol;

const RESPAWN_MS = 2500;
// Clase que implementa cada tipo de arma del catálogo.
const WEAPON_CLASSES = { boomerang: Boomerang };

/**
 * Escena de juego: personajes, armas, colisiones e impactos.
 * La simulación corre aquí (pantalla anfitriona); el servidor aporta jugadores y entradas validadas.
 */
export class ArenaScene extends Phaser.Scene {
  constructor(store, network) {
    super('arena');
    this.store = store;
    this.network = network;
  }

  create() {
    this.arena = createTestArena(this);
    this.characters = new Map(); // idJugador -> Character
    this.weapons = [];
    this.characterGroup = this.physics.add.group();
    this.weaponGroup = this.physics.add.group();
    this.debris = new DebrisSystem(this);
    this.feedbackSent = new Map();
    this.feedbackVersion = -1;

    const physics = this.physics;
    physics.add.collider(this.characterGroup, this.arena.walls);
    physics.add.collider(this.characterGroup, this.characterGroup);
    physics.add.collider(this.weaponGroup, this.arena.walls, (sprite) => sprite.entity.onWallHit());
    physics.add.overlap(this.weaponGroup, this.characterGroup, (sprite, hitbox) => this.onWeaponTouch(sprite.entity, hitbox.entity));
    this.debris.addColliders(this.arena.walls, this.characterGroup);
  }

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.syncRoster(time);

    for (const character of this.characters.values()) {
      const actions = character.update(dt, time, this.store.inputs.get(character.id) ?? null);
      if (actions.throwCharge !== null && character.weapon) character.weapon.throw(actions.throwCharge);
      if (actions.melee) this.melee(character, time);
      if (!character.alive && time >= character.respawnAt) this.respawn(character, time);
      character.render(dt, time);
    }
    for (const weapon of this.weapons) weapon.update(dt);

    this.debris.update(time);
    this.sendFeedback();
  }

  // --- Jugadores ---------------------------------------------------------

  syncRoster(now) {
    const roster = this.store.roster;
    for (const [id, character] of this.characters) {
      if (!roster.has(id)) this.removeCharacter(character);
    }
    for (const player of roster.values()) {
      const character = this.characters.get(player.id) ?? this.addCharacter(player, now);
      character.setPlayerInfo(player);
    }
  }

  addCharacter(player, now) {
    const def = CHARACTERS[DEFAULT_CHARACTER];
    const spawn = this.pickSpawn();
    const character = new Character(this, this.characterGroup, player, def, spawn.x, spawn.y);
    character.invulnerableUntil = now + def.spawnInvulnerableMs;

    const weaponDef = WEAPONS[def.weapon];
    const weapon = new WEAPON_CLASSES[weaponDef.type](this, this.weaponGroup, weaponDef);
    weapon.attachTo(character);
    character.homeWeapon = weapon;
    this.weapons.push(weapon);

    this.characters.set(player.id, character);
    return character;
  }

  removeCharacter(character) {
    if (character.weapon && character.weapon !== character.homeWeapon) {
      character.weapon.dropAt(character.x, character.y, 0);
    }
    const home = character.homeWeapon;
    home.destroy();
    this.weapons = this.weapons.filter((weapon) => weapon !== home);
    character.destroy();
    this.characters.delete(character.id);
    this.feedbackSent.delete(character.id);
  }

  /** Punto de aparición más alejado de los personajes vivos. */
  pickSpawn() {
    const alive = [...this.characters.values()].filter((c) => c.alive);
    let best = null;
    let bestDistance = -1;
    for (const point of Phaser.Utils.Array.Shuffle([...this.arena.spawnPoints])) {
      const nearest = alive.reduce((min, c) => Math.min(min, Phaser.Math.Distance.Between(point.x, point.y, c.x, c.y)), Infinity);
      if (nearest > bestDistance) {
        best = point;
        bestDistance = nearest;
      }
    }
    return best;
  }

  respawn(character, now) {
    const spawn = this.pickSpawn();
    character.respawn(spawn.x, spawn.y, now);
    const home = character.homeWeapon;
    if (!character.weapon && home.state === WEAPON_STATE.GROUND) home.attachTo(character);
  }

  // --- Combate -----------------------------------------------------------

  onWeaponTouch(weapon, character) {
    if (!weapon || !character || !character.alive) return;
    if (weapon.dangerous) {
      if (character === weapon.owner) {
        if (!character.weapon && weapon.catchable) weapon.attachTo(character);
        return;
      }
      const velocity = weapon.sprite.body.velocity;
      this.kill(character, Math.atan2(velocity.y, velocity.x), this.time.now);
    } else if (weapon.state === WEAPON_STATE.GROUND && !character.weapon) {
      weapon.attachTo(character);
    }
  }

  melee(attacker, now) {
    const def = attacker.weapon.def;
    const fx = Math.cos(attacker.facing);
    const fy = Math.sin(attacker.facing);
    this.debris.slash(attacker.x, attacker.y, attacker.facing, def.meleeRange, attacker.color);

    for (const other of this.characters.values()) {
      if (other === attacker || !other.alive) continue;
      const dx = other.x - attacker.x;
      const dy = other.y - attacker.y;
      const distance = Math.hypot(dx, dy);
      if (distance > def.meleeRange + other.def.radius) continue;
      if (distance > 1 && (dx * fx + dy * fy) / distance < def.meleeArc) continue;
      this.kill(other, Math.atan2(dy, dx), now);
    }
  }

  kill(victim, angle, now) {
    if (!victim.isVulnerable(now)) return;
    this.debris.burst(victim, angle); // antes de ocultar la figura: usa la posición de sus piezas
    if (victim.weapon) victim.weapon.dropAt(victim.x, victim.y, angle);
    victim.kill(now + RESPAWN_MS);
  }

  // --- Estado en los mandos -----------------------------------------------

  sendFeedback() {
    // Si la pantalla se reconecta al servidor, se reenvía todo.
    if (this.feedbackVersion !== this.store.serverInfoVersion) {
      this.feedbackVersion = this.store.serverInfoVersion;
      this.feedbackSent.clear();
    }
    if (!this.store.serverConnected) return;
    for (const character of this.characters.values()) {
      const flags = (character.alive ? FEEDBACK.ALIVE : 0) | (character.weapon ? FEEDBACK.ARMED : 0);
      if (this.feedbackSent.get(character.id) === flags) continue;
      this.feedbackSent.set(character.id, flags);
      this.network.sendFeedback(character.id, flags);
    }
  }
}
