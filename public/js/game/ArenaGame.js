import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { generateArena } from './arena/generation/ArenaGenerator.js';
import { buildArena } from './arena/ArenaBuilder.js';
import { withNewSeed } from './arena/presets.js';
import { Character } from './entities/Character.js';
import { Boomerang, WEAPON_STATE } from './entities/Boomerang.js';
import { Decoy } from './entities/Decoy.js';
import { Effects } from './effects/Effects.js';
import { DebrisSystem } from './effects/DebrisSystem.js';
import { FireSystem } from './effects/FireSystem.js';
import { CHARACTERS, DEFAULT_CHARACTER } from './content/characters.js';
import { WEAPONS } from './content/weapons.js';
import { BotBrain } from './bots/BotBrain.js';
import { PowerUpSpawner } from './powerups/PowerUpSpawner.js';
import { POWERUPS } from './content/powerups.js';

const { FEEDBACK } = window.Protocol;
const { CharacterCatalog } = window;

const RESPAWN_MS = 2500;
const OUTSIDE_LIMIT_MS = 5000; // tiempo fuera de la línea roja antes de explotar
// Clase que implementa cada tipo de arma del catálogo.
const WEAPON_CLASSES = { boomerang: Boomerang };
const MAX_BOTS = 1;
const BOT_COLOR = '#8d99ae';

/**
 * Partida en la arena: personajes, armas, power-ups, impactos y reapariciones.
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
    this.fire = new FireSystem(stage);
    this.characters = new Map(); // idJugador (o 'bot-N') -> Character
    this.bots = new Map(); // 'bot-N' -> BotBrain
    this.nextBotId = 1;
    this.weapons = [];
    this.decoys = [];
    this.feedbackSent = new Map();
    this.abilitiesSent = new Map();
    this.feedbackVersion = -1;
    // Los controla Match: en la sala se reaparece siempre; en una ronda, no. Congelado = cuenta atrás.
    this.respawnEnabled = true;
    this.frozen = false;
    this.powerups = new PowerUpSpawner(this);
  }

  aliveCharacters() {
    return [...this.characters.values()].filter((c) => c.alive);
  }

  /** Lo que se puede golpear: personajes y señuelos. */
  targets() {
    return [...this.characters.values(), ...this.decoys];
  }

  /** Un fotograma: entradas -> rumbo de las armas -> física -> aspecto -> impactos. */
  update(now, dt) {
    this.syncRoster(now);

    for (const character of [...this.characters.values()]) {
      let input = null; // congelados: nadie se mueve ni ataca
      if (!this.frozen) input = character.isBot ? this.bots.get(character.id).update(now, this) : this.store.inputs.get(character.id) ?? null;
      const actions = character.update(dt, now, input);
      if (actions.throwCharge !== null && character.weapon) this.throwWeapon(character, actions.throwCharge, now);
      if (actions.melee) this.melee(character, now);
      if (actions.dash) this.onDash(character, now);
      if (actions.teleport) this.teleport(character, now);
      if (this.respawnEnabled && !character.alive && now >= character.respawnAt) this.respawn(character, now);
    }
    this.decoys = this.decoys.filter((decoy) => {
      if (decoy.update(dt, now)) return true;
      decoy.destroy();
      return false;
    });
    for (const weapon of [...this.weapons]) weapon.steer(dt);

    this.physics.step(dt);

    this.arena.sync();
    this.checkBoundary(now);
    for (const character of this.characters.values()) character.render(dt, now);
    for (const weapon of this.weapons) weapon.sync(dt);
    this.checkWeaponHits(now);
    this.resolveLunges(now);
    this.fire.update(now, this.targets(), (target) => this.hit(target, 0, now));
    this.powerups.update(now);
    this.debris.sync(now);
    this.effects.update(dt);
    this.sendFeedback();
  }

  // --- Arena -------------------------------------------------------------

  /** Genera y construye otra arena; todos reaparecen en ella con su búmerang (y conservan sus power-ups). */
  newArena(now, config = withNewSeed(this.arenaConfig)) {
    this.arenaConfig = config;
    this.arena.dispose();
    this.debris.clear();
    this.fire.clear();
    for (const decoy of this.decoys) decoy.destroy();
    this.decoys = [];
    this.arena = buildArena(this.stage, this.physics, generateArena(config));
    this.powerups.reset(now);

    for (const weapon of [...this.weapons]) {
      if (weapon.temporary) {
        this.removeWeapon(weapon);
        continue;
      }
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
      character.lunge = null;
      character.outsideSince = 0;
      character.outsideLeftMs = null;
      character.homeWeapon.attachTo(character);
    }
  }

  /** Al empezar una partida o volver a la sala, nadie conserva power-ups. */
  clearAllAbilities() {
    for (const character of this.characters.values()) character.clearAbilities();
  }

  /** Línea roja: fuera de la zona hay 5 s para volver; después, se explota. */
  checkBoundary(now) {
    const { minX, maxX, minZ, maxZ } = this.arena.bounds;
    for (const character of this.characters.values()) {
      const outside = character.alive && !this.frozen
        && (character.x < minX || character.x > maxX || character.z < minZ || character.z > maxZ);
      if (!outside) {
        character.outsideSince = 0;
        character.outsideLeftMs = null;
        continue;
      }
      if (!character.outsideSince) character.outsideSince = now;
      character.outsideLeftMs = Math.max(0, OUTSIDE_LIMIT_MS - (now - character.outsideSince));
      if (character.outsideLeftMs === 0) {
        this.explosionEffect(character.x, character.z);
        this.hit(character, Math.random() * Math.PI * 2, now, { force: true });
      }
    }
  }

  // --- Jugadores ---------------------------------------------------------

  /** Solo juegan los que ya han elegido personaje en el móvil; si alguien lo cambia (en la sala), se reconstruye. */
  syncRoster(now) {
    const roster = this.store.roster;
    for (const [id, character] of this.characters) {
      if (character.isBot) continue;
      const player = roster.get(id);
      if (!player || !player.character || player.character !== character.figureId) this.removeCharacter(character);
    }
    for (const player of roster.values()) {
      if (!player.character) continue;
      const character = this.characters.get(player.id) ?? this.addCharacter(player, now);
      character.setPlayerInfo(player);
    }
    this.keepBotsUnique(now);
  }

  /** Personajes cogidos por los jugadores (el bot elige entre los que quedan). */
  takenFigures() {
    return new Set([...this.store.roster.values()].map((p) => p.character).filter(Boolean));
  }

  freeFigure(except = new Set()) {
    const taken = this.takenFigures();
    for (const c of this.characters.values()) if (c.isBot) taken.add(c.figureId);
    const free = CharacterCatalog.CHARACTERS.map((c) => c.id).filter((id) => !taken.has(id) && !except.has(id));
    return free[Math.floor(Math.random() * free.length)] ?? 'peon';
  }

  /** Si un jugador elige el personaje que llevaba el bot, el bot se cambia a otro libre. */
  keepBotsUnique(now) {
    const taken = this.takenFigures();
    for (const [id, bot] of [...this.characters]) {
      if (!bot.isBot || !taken.has(bot.figureId)) continue;
      this.removeCharacter(bot);
      this.bots.delete(id);
      this.addBot(now, id);
    }
  }

  // --- Bots (se controlan desde esta pantalla, no pasan por el servidor) ---

  addBot(now, id = `bot-${this.nextBotId++}`) {
    if (this.bots.size >= MAX_BOTS) return;
    const character = this.addCharacter({ id, label: 'BOT', color: BOT_COLOR, connected: true, character: this.freeFigure() }, now);
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

    const weapon = this.createWeapon(def.weapon);
    weapon.attachTo(character);
    character.homeWeapon = weapon;

    if (!this.respawnEnabled) character.waitForRound(); // entra a mitad de ronda: juega la siguiente
    this.characters.set(player.id, character);
    return character;
  }

  removeCharacter(character) {
    if (character.weapon && character.weapon !== character.homeWeapon) {
      character.weapon.dropAt(character.x, character.z, 0);
    }
    for (const weapon of this.weapons.filter((w) => w.temporary && w.owner === character)) this.removeWeapon(weapon);
    this.removeWeapon(character.homeWeapon);
    character.destroy();
    this.characters.delete(character.id);
    this.feedbackSent.delete(character.id);
    this.abilitiesSent.delete(character.id);
  }

  createWeapon(id, options) {
    const def = WEAPONS[id];
    const weapon = new WEAPON_CLASSES[def.type](this, def, options);
    this.weapons.push(weapon);
    return weapon;
  }

  removeWeapon(weapon) {
    weapon.destroy();
    this.weapons = this.weapons.filter((w) => w !== weapon);
  }

  /** @param occupied posiciones a evitar; por defecto, los personajes vivos. Devuelve el punto de aparición más alejado. */
  pickSpawn(occupied = [...this.characters.values()].filter((c) => c.alive)) {
    let best = null;
    let bestDistance = -1;
    const points = [...this.arena.spawnPoints].sort(() => Math.random() - 0.5);
    for (const point of points) {
      const nearest = occupied.reduce((min, c) => Math.min(min, Math.hypot(point.x - c.x, point.z - c.z)), Infinity);
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

  // --- Power-ups ---------------------------------------------------------

  /** Lanzamiento; con Multibúmerang salen dos copias temporales en abanico. */
  throwWeapon(character, charge, now) {
    const weapon = character.weapon;
    weapon.throw(charge);
    character.thrownWeapon = weapon;
    if (!character.hasAbility('multi')) return;
    const { extra, spread } = POWERUPS.multi;
    for (let i = 0; i < extra; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const copy = this.createWeapon(weapon.def.id, { temporary: true });
      copy.throwFrom(character, character.facing + side * spread * (1 + Math.floor(i / 2)), charge);
    }
  }

  onDash(character, now) {
    this.effects.burst(character.x, 0.1, character.z, [0xe8d3b0, 0xffffff], 10, 0.35); // polvo
    if (character.hasAbility('senuelo')) {
      // Un señuelo por jugador: el nuevo sustituye al anterior.
      for (const old of this.decoys.filter((d) => d.owner === character)) old.destroy();
      this.decoys = this.decoys.filter((d) => d.alive);
      this.decoys.push(new Decoy(this, character, character.dashAngle, now));
    }
  }

  /** Teletransporte: apareces donde está tu búmerang lanzado y lo recoges. */
  teleport(character, now) {
    const weapon = character.thrownWeapon;
    if (!weapon || weapon.holder || weapon.temporary || now < (character.teleportReadyAt ?? 0)) return;
    if (weapon.state === WEAPON_STATE.HELD) return;
    character.teleportReadyAt = now + POWERUPS.teletransporte.cooldownMs;
    const color = POWERUPS.teletransporte.color;
    this.effects.burst(character.x, 0.7, character.z, [color, 0xffffff], 16, 0.6);
    character.body.position.set(weapon.x, character.body.position.y, weapon.z);
    character.body.velocity.set(0, 0, 0);
    this.effects.burst(weapon.x, 0.7, weapon.z, [color, 0xffffff], 16, 0.6);
    this.effects.ring(weapon.x, weapon.z);
    weapon.attachTo(character);
  }

  /** Explosión (búmerang Explosivo): elimina a quien esté cerca, salvo a quien lo lanzó, y empuja piezas y juguetes. */
  explode(x, z, owner, now) {
    const { radius } = POWERUPS.explosivo;
    this.explosionEffect(x, z);
    for (const target of this.targets()) {
      if (!target.alive || target === owner || target.owner === owner) continue;
      if (Math.hypot(target.x - x, target.z - z) <= radius + target.def.radius) this.hit(target, Math.atan2(target.z - z, target.x - x), now);
    }
  }

  explosionEffect(x, z) {
    this.effects.burst(x, 0.6, z, [0xff4d00, 0xffd000, 0xffffff, 0x2a1d14], 44, 1.3);
    this.effects.ring(x, z);
    this.physics.blast(x, z, POWERUPS.explosivo.radius * 1.6, 7);
    this.stage.shake(260, 0.5);
  }

  // --- Combate -----------------------------------------------------------

  /** Las armas atraviesan a los personajes en la física; el contacto se comprueba aquí en el plano. */
  checkWeaponHits(now) {
    for (const weapon of [...this.weapons]) {
      if (weapon.state === WEAPON_STATE.HELD) continue;
      for (const target of this.targets()) {
        if (!target.alive) continue;
        const reach = target.def.radius + weapon.hitRadius;
        if (Math.hypot(weapon.x - target.x, weapon.z - target.z) < reach) this.onWeaponTouch(weapon, target, now);
      }
    }
  }

  onWeaponTouch(weapon, target, now) {
    if (target.isDecoy) {
      if (weapon.dangerous && target.owner !== weapon.owner) this.hit(target, weapon.velocityAngle, now);
      return;
    }
    if (weapon.dangerous) {
      if (target === weapon.owner) {
        if (!weapon.catchable) return;
        if (weapon.temporary) this.removeWeapon(weapon); // la copia vuelve a la mano y desaparece
        else if (!target.weapon) weapon.attachTo(target);
        return;
      }
      if (!target.isVulnerable(now)) return;
      weapon.detonate();
      this.hit(target, weapon.velocityAngle, now);
    } else if (weapon.state === WEAPON_STATE.GROUND && !target.weapon) {
      weapon.attachTo(target);
    }
  }

  /**
   * Cuchillada. Como el cuchillo del COD: si hay un rival a alcance de embestida y sin pared en medio,
   * el personaje se lanza hacia él y el golpe se aplica al llegar (resolveLunges); si no, golpea delante.
   */
  melee(attacker, now) {
    const target = this.lungeTarget(attacker);
    if (!target) {
      this.strike(attacker, now);
      return;
    }
    const reach = attacker.weapon.def.meleeRange + target.def.radius;
    if (Math.hypot(target.x - attacker.x, target.z - attacker.z) <= reach * 0.85) {
      attacker.facing = Math.atan2(target.z - attacker.z, target.x - attacker.x);
      this.strike(attacker, now);
    } else {
      attacker.startLunge(target, now);
    }
  }

  /** Rival (o señuelo ajeno) vivo más cercano dentro del alcance de la embestida y a la vista. */
  lungeTarget(attacker) {
    let best = null;
    let bestDistance = attacker.def.lunge.range + 0.001;
    for (const other of this.targets()) {
      if (other === attacker || other.owner === attacker || !other.alive) continue;
      const distance = Math.hypot(other.x - attacker.x, other.z - attacker.z);
      if (distance >= bestDistance) continue;
      if (!this.physics.lineOfSight(attacker.x, attacker.z, other.x, other.z)) continue;
      best = other;
      bestDistance = distance;
    }
    return best;
  }

  /** Termina las embestidas: al llegar junto al objetivo, si muere o si se acaba el tiempo, golpea. */
  resolveLunges(now) {
    for (const attacker of this.characters.values()) {
      const lunge = attacker.lunge;
      if (!lunge) continue;
      if (!attacker.alive || !attacker.weapon) {
        attacker.lunge = null;
        continue;
      }
      const { target } = lunge;
      const reach = attacker.weapon.def.meleeRange + target.def.radius;
      const close = Math.hypot(target.x - attacker.x, target.z - attacker.z) <= reach * 0.8;
      if (close || !target.alive || now >= lunge.until) {
        attacker.lunge = null;
        attacker.body.velocity.set(0, 0, 0);
        this.strike(attacker, now);
      }
    }
  }

  /** El golpe en sí: arco delante del personaje. */
  strike(attacker, now) {
    const def = attacker.weapon.def;
    const fx = Math.cos(attacker.facing);
    const fz = Math.sin(attacker.facing);
    this.effects.slash(attacker.x, attacker.z, attacker.facing, def.meleeRange, attacker.color);

    for (const other of this.targets()) {
      if (other === attacker || other.owner === attacker || !other.alive) continue;
      const dx = other.x - attacker.x;
      const dz = other.z - attacker.z;
      const distance = Math.hypot(dx, dz);
      if (distance > def.meleeRange + other.def.radius) continue;
      if (distance > 0.01 && (dx * fx + dz * fz) / distance < def.meleeArc) continue;
      this.hit(other, Math.atan2(dz, dx), now);
    }
  }

  /** Impacto sobre un personaje o un señuelo. `force` ignora escudo e invulnerabilidad (explotar fuera de la zona). */
  hit(target, angle, now, { force = false } = {}) {
    if (target.isDecoy) {
      if (!target.alive) return;
      this.debris.burst(target, angle, now);
      target.destroy();
      this.decoys = this.decoys.filter((d) => d !== target);
      return;
    }
    this.kill(target, angle, now, { force });
  }

  kill(victim, angle, now, { force = false } = {}) {
    if (!victim.alive || (!force && !victim.isVulnerable(now))) return;
    if (!force && victim.hasAbility('escudo')) {
      // El escudo aguanta un golpe y se rompe; un instante de invulnerabilidad para no caer justo después.
      victim.removeAbility('escudo');
      victim.invulnerableUntil = now + POWERUPS.escudo.graceMs;
      this.effects.ring(victim.x, victim.z);
      this.effects.burst(victim.x, 0.8, victim.z, [POWERUPS.escudo.color, 0xffffff], 16, 0.7);
      return;
    }
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
      this.abilitiesSent.clear();
    }
    if (!this.store.serverConnected) return;
    for (const character of this.characters.values()) {
      if (character.isBot) continue; // los bots no tienen mando
      const flags = (character.alive ? FEEDBACK.ALIVE : 0)
        | (character.weapon ? FEEDBACK.ARMED : 0)
        | (this.respawnEnabled ? 0 : FEEDBACK.IN_MATCH)
        | (character.outsideLeftMs !== null ? FEEDBACK.OUTSIDE : 0);
      if (this.feedbackSent.get(character.id) !== flags) {
        this.feedbackSent.set(character.id, flags);
        this.network.sendFeedback(character.id, flags);
      }
      const abilities = character.abilities.join(',');
      if (this.abilitiesSent.get(character.id) !== abilities) {
        this.abilitiesSent.set(character.id, abilities);
        this.network.sendAbilities(character.id, [...character.abilities]);
      }
    }
  }
}
