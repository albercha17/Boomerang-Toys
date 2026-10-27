import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { generateArena } from './arena/generation/ArenaGenerator.js';
import { buildArena } from './arena/ArenaBuilder.js';
import { withNewSeed } from './arena/presets.js';
import { Character } from './entities/Character.js';
import { Boomerang, WEAPON_STATE } from './entities/Boomerang.js';
import { Effects } from './effects/Effects.js';
import { DebrisSystem } from './effects/DebrisSystem.js';
import { CHARACTERS, DEFAULT_CHARACTER } from './content/characters.js';
import { WEAPONS } from './content/weapons.js';
import { BotBrain } from './bots/BotBrain.js';

const { FEEDBACK } = window.Protocol;

const RESPAWN_MS = 2500;
// Clase que implementa cada tipo de arma del catálogo.
const WEAPON_CLASSES = { boomerang: Boomerang };
const MAX_BOTS = 1;
const BOT_COLOR = '#8d99ae';

/**
 * Partida en la arena: personajes, armas, impactos y reapariciones.
 * La simulación corre aquí (pantalla anfitriona); el servidor aporta jugadores y entradas validadas.
 */
export class ArenaGame {
  /** @param arenaConfig configuración de la arena (ver arena/presets.js) */
  constructor(store, network, stage, arenaConfig) {
    this.store = store;
    this.network = network;
    this.stage = stage;
    this.physics = new PhysicsWorld();
    this.arenaConfig = arenaConfig;
    this.arena = buildArena(stage, this.physics, generateArena(arenaConfig));
    this.effects = new Effects(stage);
    this.debris = new DebrisSystem(stage, this.physics, this.effects);
    this.characters = new Map(); // idJugador (o 'bot-N') -> Character
    this.bots = new Map(); // 'bot-N' -> BotBrain
    this.nextBotId = 1;
    this.weapons = [];
    this.feedbackSent = new Map();
    this.feedbackVersion = -1;
  }

  /** Un fotograma: entradas -> rumbo de las armas -> física -> aspecto -> impactos. */
  update(now, dt) {
    this.syncRoster(now);

    for (const character of this.characters.values()) {
      const input = character.isBot ? this.bots.get(character.id).update(now, this) : this.store.inputs.get(character.id) ?? null;
      const actions = character.update(dt, now, input);
      if (actions.throwCharge !== null && character.weapon) character.weapon.throw(actions.throwCharge);
      if (actions.melee) this.melee(character, now);
      if (actions.dash) this.effects.burst(character.x, 0.1, character.z, [0xe8d3b0, 0xffffff], 10, 0.35); // polvo
      if (!character.alive && now >= character.respawnAt) this.respawn(character, now);
    }
    for (const weapon of this.weapons) weapon.steer(dt);

    this.physics.step(dt);

    this.arena.sync();
    for (const character of this.characters.values()) character.render(dt, now);
    for (const weapon of this.weapons) weapon.sync(dt);
    this.checkWeaponHits(now);
    this.debris.sync(now);
    this.effects.update(dt);
    this.sendFeedback();
  }

  // --- Arena -------------------------------------------------------------

  /** Genera y construye otra arena; todos reaparecen en ella con su búmerang. */
  newArena(now, config = withNewSeed(this.arenaConfig)) {
    this.arenaConfig = config;
    this.arena.dispose();
    this.debris.clear();
    this.arena = buildArena(this.stage, this.physics, generateArena(config));

    for (const weapon of this.weapons) {
      weapon.release();
      weapon.toGround();
      this.physics.remove(weapon.body);
    }
    const placed = [];
    for (const character of this.characters.values()) {
      const spawn = this.pickSpawn(placed);
      placed.push(spawn);
      character.respawn(spawn.x, spawn.z, now);
      character.facing = Math.atan2(-spawn.z, -spawn.x);
      character.homeWeapon.attachTo(character);
    }
  }

  // --- Jugadores ---------------------------------------------------------

  syncRoster(now) {
    const roster = this.store.roster;
    for (const [id, character] of this.characters) {
      if (!character.isBot && !roster.has(id)) this.removeCharacter(character);
    }
    for (const player of roster.values()) {
      const character = this.characters.get(player.id) ?? this.addCharacter(player, now);
      character.setPlayerInfo(player);
    }
  }

  // --- Bots (se controlan desde esta pantalla, no pasan por el servidor) ---

  addBot(now) {
    if (this.bots.size >= MAX_BOTS) return;
    const id = `bot-${this.nextBotId++}`;
    const character = this.addCharacter({ id, label: 'BOT', color: BOT_COLOR, connected: true }, now);
    character.isBot = true;
    this.bots.set(id, new BotBrain(character));
  }

  removeBots() {
    for (const id of this.bots.keys()) this.removeCharacter(this.characters.get(id));
    this.bots.clear();
  }

  /** Botón de la pantalla: añade un bot o, si ya está el máximo, los quita. */
  toggleBot(now) {
    if (this.bots.size >= MAX_BOTS) this.removeBots();
    else this.addBot(now);
  }

  addCharacter(player, now) {
    const def = CHARACTERS[DEFAULT_CHARACTER];
    const spawn = this.pickSpawn();
    const character = new Character(this, player, def, spawn.x, spawn.z);
    character.facing = Math.atan2(-spawn.z, -spawn.x); // mirando hacia el centro
    character.invulnerableUntil = now + def.spawnInvulnerableMs;

    const weaponDef = WEAPONS[def.weapon];
    const weapon = new WEAPON_CLASSES[weaponDef.type](this, weaponDef);
    weapon.attachTo(character);
    character.homeWeapon = weapon;
    this.weapons.push(weapon);

    this.characters.set(player.id, character);
    return character;
  }

  removeCharacter(character) {
    if (character.weapon && character.weapon !== character.homeWeapon) {
      character.weapon.dropAt(character.x, character.z, 0);
    }
    const home = character.homeWeapon;
    home.destroy();
    this.weapons = this.weapons.filter((weapon) => weapon !== home);
    character.destroy();
    this.characters.delete(character.id);
    this.feedbackSent.delete(character.id);
  }

  /** Punto de aparición más alejado de los personajes vivos. */
  /** @param occupied posiciones a evitar; por defecto, los personajes vivos */
  pickSpawn(occupied = [...this.characters.values()].filter((c) => c.alive)) {
    const alive = occupied;
    let best = null;
    let bestDistance = -1;
    const points = [...this.arena.spawnPoints].sort(() => Math.random() - 0.5);
    for (const point of points) {
      const nearest = alive.reduce((min, c) => Math.min(min, Math.hypot(point.x - c.x, point.z - c.z)), Infinity);
      if (nearest > bestDistance) {
        best = point;
        bestDistance = nearest;
      }
    }
    return best;
  }

  respawn(character, now) {
    const spawn = this.pickSpawn();
    character.respawn(spawn.x, spawn.z, now);
    const home = character.homeWeapon;
    if (!character.weapon && home.state === WEAPON_STATE.GROUND) home.attachTo(character);
  }

  // --- Combate -----------------------------------------------------------

  /** Las armas atraviesan a los personajes en la física; el contacto se comprueba aquí en el plano. */
  checkWeaponHits(now) {
    for (const weapon of this.weapons) {
      if (weapon.state === WEAPON_STATE.HELD) continue;
      for (const character of this.characters.values()) {
        if (!character.alive) continue;
        const reach = character.def.radius + weapon.def.radius;
        if (Math.hypot(weapon.x - character.x, weapon.z - character.z) < reach) this.onWeaponTouch(weapon, character, now);
      }
    }
  }

  onWeaponTouch(weapon, character, now) {
    if (weapon.dangerous) {
      if (character === weapon.owner) {
        if (!character.weapon && weapon.catchable) weapon.attachTo(character);
        return;
      }
      this.kill(character, weapon.velocityAngle, now);
    } else if (weapon.state === WEAPON_STATE.GROUND && !character.weapon) {
      weapon.attachTo(character);
    }
  }

  melee(attacker, now) {
    const def = attacker.weapon.def;
    const fx = Math.cos(attacker.facing);
    const fz = Math.sin(attacker.facing);
    this.effects.slash(attacker.x, attacker.z, attacker.facing, def.meleeRange, attacker.color);

    for (const other of this.characters.values()) {
      if (other === attacker || !other.alive) continue;
      const dx = other.x - attacker.x;
      const dz = other.z - attacker.z;
      const distance = Math.hypot(dx, dz);
      if (distance > def.meleeRange + other.def.radius) continue;
      if (distance > 0.01 && (dx * fx + dz * fz) / distance < def.meleeArc) continue;
      this.kill(other, Math.atan2(dz, dx), now);
    }
  }

  kill(victim, angle, now) {
    if (!victim.isVulnerable(now)) return;
    this.debris.burst(victim, angle, now); // antes de ocultar la figura: usa la posición de sus piezas
    if (victim.weapon) victim.weapon.dropAt(victim.x, victim.z, angle);
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
      if (character.isBot) continue; // los bots no tienen mando
      const flags = (character.alive ? FEEDBACK.ALIVE : 0) | (character.weapon ? FEEDBACK.ARMED : 0);
      if (this.feedbackSent.get(character.id) === flags) continue;
      this.feedbackSent.set(character.id, flags);
      this.network.sendFeedback(character.id, flags);
    }
  }
}
