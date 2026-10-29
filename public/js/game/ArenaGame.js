import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { generateArena, nextMapConfig } from './arena/maps/handmade.js';
import { buildHandmade } from './arena/HandmadeBuilder.js';
import { buildSceneMap } from './arena/SceneMapBuilder.js';
import { moverCrushes, moverPushAngle } from './arena/movers.js';

/** Mapa con escena horneada (Blender) o dibujado en texto. */
const buildArena = (stage, physics, layout) => (layout.sceneMap ? buildSceneMap : buildHandmade)(stage, physics, layout);
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
import { POWERUPS, SUPERS } from './content/powerups.js';
import { Announcer } from './ui/Announcer.js';

const { FEEDBACK } = window.Protocol;
const { CharacterCatalog } = window;

const RESPAWN_MS = 2500;
// Clase que implementa cada tipo de arma del catálogo.
const WEAPON_CLASSES = { boomerang: Boomerang };
const MAX_BOTS = 1;
const BOT_COLOR = '#8d99ae';
const CATCH_MARGIN = 0.4; // tu propio búmerang de vuelta se recoge desde un poco más lejos
const PARRY_REACH = 0.6; // la cuchillada devuelve los búmerangs que pasan a este margen más de su alcance
const DASH_PUSH = 9; // velocidad con la que un dash aparta al rival con el que choca (se frena solo enseguida)

/**
 * Partida en la arena: personajes, armas, power-ups, impactos y reapariciones.
 * La simulación corre aquí (pantalla anfitriona); el servidor aporta jugadores y entradas validadas.
 */
export class ArenaGame {
  /** @param arenaConfig mapa que se juega (ver readMapConfig en arena/maps/handmade.js) */
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
    this.announcer = new Announcer();
  }

  /** Aviso grande en la pantalla (superhabilidades). */
  announce(def, title, subtitle) {
    this.announcer.show(def, title, subtitle);
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
      if (character.falling) { // cayendo de la mesa o al agua: sin control hasta que llega abajo
        this.updateFall(character, dt, now);
        continue;
      }
      if (character.leap) { // Supersalto: por el aire, sin control, hasta que aterriza
        this.updateLeap(character, now);
        continue;
      }
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
    if (!this.frozen) this.arena.update?.(now, dt); // lo que se mueve en el mapa (rodillo...)
    if (!this.frozen) this.arena.devices?.affect(this, now, dt); // cintas, trampolines, portales, pasarelas

    this.physics.step(dt);

    this.arena.sync();
    this.dashBumps(now);
    this.checkMapHazards(now);
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

  /** Construye el mapa siguiente; todos reaparecen en él con su búmerang (y conservan sus power-ups). */
  newArena(now, config = nextMapConfig(this.arenaConfig)) {
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
      character.homeWeapon.attachTo(character);
    }
  }

  /** Al empezar una partida o volver a la sala, nadie conserva power-ups. */
  clearAllAbilities() {
    for (const character of this.characters.values()) character.clearAbilities();
  }

  /**
   * Mapas hechos a mano: caerse por el borde o al agua mata (las piezas caen), el rodillo aplasta,
   * en los matorrales no se te ve, y el búmerang que cae al agua o al vacío vuelve a suelo firme.
   */
  checkMapHazards(now) {
    const arena = this.arena;
    for (const character of this.characters.values()) {
      character.hidden = false;
      if (!character.alive || this.frozen || character.falling || character.leap) continue;
      const hazard = arena.hazardAt(character.x, character.z);
      if (hazard) {
        this.startFall(character, hazard);
        continue;
      }
      for (const m of arena.movers) {
        const r = character.def.radius;
        if (moverCrushes(m, character.x, character.z, r)) {
          this.kill(character, moverPushAngle(m), now, { force: true });
          this.stage.shake(200, 0.35);
          break;
        }
      }
      if (!character.alive) continue;
      const bush = arena.bushAt(character.x, character.z);
      if (bush) {
        character.hidden = !character.charging && !character.isLunging();
        if (character.moving > 0.1) arena.rustle(bush, now);
      }
    }
    for (const weapon of this.weapons) {
      if (weapon.state !== WEAPON_STATE.GROUND || !arena.hazardAt(weapon.x, weapon.z)) continue;
      const safe = this.nearestSafePoint(weapon.x, weapon.z);
      weapon.body.position.set(safe.x, weapon.body.position.y, safe.z);
      weapon.body.velocity.set(0, 0, 0);
      this.effects.ring(safe.x, safe.z);
    }
  }

  /** Se sale de la mesa o cae al agua (o a la lava): sigue con su impulso, sin control, y la gravedad hace el resto. */
  startFall(character, hazard) {
    const v = character.body.velocity;
    const lava = hazard === 3;
    const water = hazard === 2 || lava;
    character.falling = { y: 0, vy: water ? -0.4 : 1.4, vx: v.x * 0.9, vz: v.z * 0.9, spin: 0, water, lava };
    character.charging = false;
    character.lunge = null;
    this.physics.remove(character.body);
    if (lava) this.effects.burst(character.x, 0.3, character.z, [0xff3d00, 0xffd000, 0xff8a00, 0x3a3a3a], 34, 1.2); // ¡fsss!
    else if (water) this.effects.burst(character.x, 0.2, character.z, [0x4fc3f7, 0xffffff, 0xb3e5fc], 26, 1); // ¡chof!
  }

  /** Cayendo: gravedad y vueltas; al llegar al suelo de abajo explota (en el agua, se hunde y se ahoga). */
  updateFall(character, dt, now) {
    const f = character.falling;
    const gravity = f.water ? 6 : 24;
    f.vy -= gravity * dt;
    f.y += f.vy * dt;
    const damping = f.water ? 0.92 : 1;
    f.vx *= damping;
    f.vz *= damping;
    character.body.position.x += f.vx * dt;
    character.body.position.z += f.vz * dt;
    f.spin += dt * (f.water ? 2 : 7);
    const bottom = f.water ? -0.9 : (this.arena.fallDepth ?? -6) + 0.3;
    if (f.y > bottom) return;
    const { x, z } = character;
    if (f.lava) {
      this.effects.burst(x, 0, z, [0x555555, 0x888888, 0xff6a00], 22, 0.9); // humo
    } else if (f.water) {
      this.effects.burst(x, -0.1, z, [0x4fc3f7, 0xffffff], 18, 0.6);
    } else {
      this.effects.burst(x, f.y + 0.6, z, [0xff4d00, 0xffd000, 0xffffff, 0x2a1d14], 44, 1.3); // ¡bum! contra el suelo
      this.stage.shake(220, 0.35);
    }
    this.kill(character, Math.atan2(f.vz, f.vx), now, { force: true }); // las piezas se quedan allí abajo
  }

  nearestSafePoint(x, z) {
    const points = this.arena.freePoints.length ? this.arena.freePoints : this.arena.spawnPoints;
    return points.reduce((best, p) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(best.x - x, best.z - z) ? p : best), points[0]);
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
    const all = CharacterCatalog.CHARACTERS.map((c) => c.id);
    const free = all.filter((id) => !taken.has(id) && !except.has(id));
    const pool = free.length ? free : all; // todos cogidos: se repite
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** Si un jugador elige el personaje que llevaba el bot, el bot se cambia a otro libre (si queda alguno). */
  keepBotsUnique(now) {
    const taken = this.takenFigures();
    const anyFree = CharacterCatalog.CHARACTERS.some((c) => !taken.has(c.id));
    if (!anyFree) return;
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

  /**
   * Lanzamiento; con Multibúmerang salen dos copias temporales en abanico. Si lleva una superhabilidad de
   * lanzamiento, se gasta aquí: Tormenta (12 en todas las direcciones) o Megabúmerang.
   */
  throwWeapon(character, charge, now) {
    const weapon = character.weapon;
    weapon.throw(charge);
    character.figure.throw?.();
    character.thrownWeapon = weapon;
    const superPower = character.useSuper('throw');
    if (superPower === 'tormenta') {
      const { count } = SUPERS.tormenta;
      for (let i = 1; i < count; i++) {
        const copy = this.createWeapon(weapon.def.id, { temporary: true });
        copy.throwFrom(character, character.facing + (i * Math.PI * 2) / count, Math.max(charge, 0.6));
      }
      this.effects.ring(character.x, character.z);
      this.stage.shake(200, 0.3);
    } else if (superPower === 'mega') {
      weapon.makeMega();
      this.stage.shake(160, 0.25);
    }
    if (superPower) this.announce(SUPERS[superPower], `${character.label}: ¡${SUPERS[superPower].name}!`);
    if (!character.hasAbility('multi')) return;
    const { extra, spread } = POWERUPS.multi;
    for (let i = 0; i < extra; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const copy = this.createWeapon(weapon.def.id, { temporary: true });
      copy.throwFrom(character, character.facing + side * spread * (1 + Math.floor(i / 2)), charge);
    }
  }

  /** Dash: polvo, Señuelo (solo en el primer dash tras cogerlo) y las superhabilidades de dash. */
  onDash(character, now) {
    this.effects.burst(character.x, 0.1, character.z, [0xe8d3b0, 0xffffff], 10, 0.35); // polvo
    if (character.hasAbility('senuelo')) {
      // Una sola copia y la habilidad se gasta: no se duplica en cada dash.
      for (const old of this.decoys.filter((d) => d.owner === character)) old.destroy();
      this.decoys = this.decoys.filter((d) => d.alive);
      this.decoys.push(new Decoy(this, character, character.dashAngle, now));
      character.removeAbility('senuelo');
    }
    const superPower = character.useSuper('dash');
    if (!superPower) return;
    const def = SUPERS[superPower];
    this.announce(def, `${character.label}: ¡${def.name}!`);
    if (superPower === 'hipermultiplicacion') this.hyperClone(character, now);
    else if (superPower === 'supersalto') this.startLeap(character, now);
    else if (superPower === 'helada') this.freezeWave(character, now);
    else if (superPower === 'fantasma') {
      character.invisibleUntil = now + def.invisibleMs;
      this.effects.burst(character.x, 0.8, character.z, [def.color, 0xffffff], 22, 0.8);
    }
  }

  /** Un dash contra otro personaje lo aparta (empujón de juguete; no mata). */
  dashBumps(now) {
    const all = [...this.characters.values()].filter((c) => c.alive && !c.falling && !c.leap);
    for (const a of all) {
      if (!a.isDashing(now)) continue;
      for (const b of all) {
        if (b === a || (b.bumpedUntil ?? 0) > now) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > a.def.radius + b.def.radius + 0.15 || d < 1e-3) continue;
        b.body.velocity.x += (dx / d) * DASH_PUSH;
        b.body.velocity.z += (dz / d) * DASH_PUSH;
        b.bumpedUntil = now + 250;
        b.figure.land?.(0.6);
        this.effects.burst((a.x + b.x) / 2, 0.6, (a.z + b.z) / 2, [0xffffff, 0xe8d3b0], 10, 0.4);
        this.stage.shake(80, 0.12);
      }
    }
  }

  /** Hipermultiplicación: 10 clones en abanico alrededor del dash (solo en este primer dash). */
  hyperClone(character, now) {
    const def = SUPERS.hipermultiplicacion;
    for (let i = 0; i < def.clones; i++) {
      const angle = character.dashAngle + (i / (def.clones - 1) - 0.5) * def.fan;
      this.decoys.push(new Decoy(this, character, angle, now, def));
    }
    this.effects.burst(character.x, 0.8, character.z, [def.color, 0xffffff, 0xffc93c], 40, 1.1);
    this.effects.ring(character.x, character.z);
  }

  /**
   * Salto por el aire, por encima de todo: el Supersalto (hacia donde iba el dash, con onda al caer) o un trampolín
   * (opts: to, height, durationMs, wave).
   */
  startLeap(character, now, opts = {}) {
    const def = SUPERS.supersalto;
    const durationMs = opts.durationMs ?? def.durationMs;
    character.dashStart = -Infinity; // el salto sustituye al dash
    character.charging = false;
    const to = opts.to ?? this.leapLanding(character, def.distance);
    character.leap = { fromX: character.x, fromZ: character.z, toX: to.x, toZ: to.z, start: now, until: now + durationMs, y: 0, flip: 0,
      height: opts.height ?? def.height, wave: opts.wave ?? true };
    character.invulnerableUntil = Math.max(character.invulnerableUntil, now + durationMs + 150);
    this.physics.remove(character.body);
    this.effects.burst(character.x, 0.2, character.z, [opts.wave === false ? 0xff5fa2 : def.color, 0xffd000, 0xffffff], 26, 0.9);
  }

  /** Dónde aterriza: tan lejos como quepa sin salirse del mapa (si delante todo es vacío, se acorta). */
  leapLanding(character, distance) {
    const { dashAngle } = character;
    for (let d = distance; d >= 1; d -= 0.5) {
      const x = character.x + Math.cos(dashAngle) * d;
      const z = character.z + Math.sin(dashAngle) * d;
      if (this.arena.hazardAt(x, z) === 0) return { x, z };
    }
    return { x: character.x, z: character.z };
  }

  updateLeap(character, now) {
    const leap = character.leap;
    const t = Math.min(1, (now - leap.start) / (leap.until - leap.start));
    const ease = t * t * (3 - 2 * t);
    character.body.position.x = leap.fromX + (leap.toX - leap.fromX) * ease;
    character.body.position.z = leap.fromZ + (leap.toZ - leap.fromZ) * ease;
    leap.y = Math.sin(Math.PI * t) * leap.height;
    leap.flip = t * Math.PI * 2; // voltereta
    if (t < 1) return;
    character.leap = null;
    character.body.velocity.set(0, 0, 0);
    this.physics.add(character.body);
    character.figure.land?.(1.6);
    if (leap.wave) this.landingWave(character, now);
  }

  /** Al aterrizar del Supersalto: onda que tumba a los que estén cerca (no a ti ni a tus clones). */
  landingWave(character, now) {
    const { radius, color } = SUPERS.supersalto;
    const { x, z } = character;
    this.effects.burst(x, 0.3, z, [color, 0xffd000, 0xffffff, 0x2a1d14], 46, 1.4);
    this.effects.ring(x, z);
    this.physics.blast(x, z, radius * 1.5, 8);
    this.stage.shake(300, 0.55);
    for (const target of this.targets()) {
      if (!target.alive || target === character || target.owner === character) continue;
      if (Math.hypot(target.x - x, target.z - z) <= radius + target.def.radius) this.hit(target, Math.atan2(target.z - z, target.x - x), now);
    }
  }

  /** Onda helada: congela unos segundos a los rivales cercanos (no se mueven ni atacan; se les puede golpear). */
  freezeWave(character, now) {
    const { radius, freezeMs, color } = SUPERS.helada;
    this.effects.burst(character.x, 0.5, character.z, [color, 0xffffff, 0xbfefff], 50, 1.6);
    this.effects.ring(character.x, character.z);
    for (const other of this.characters.values()) {
      if (other === character || !other.alive) continue;
      if (Math.hypot(other.x - character.x, other.z - character.z) > radius) continue;
      other.frozenUntil = now + freezeMs;
      other.body.velocity.set(0, 0, 0); // en seco, aunque ya se hubiera movido en este fotograma
      other.charging = false;
      other.lunge = null;
      this.effects.burst(other.x, 0.8, other.z, [color, 0xffffff], 14, 0.5);
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
        const catching = weapon.owner === target && weapon.catchable && !target.weapon;
        const reach = target.def.radius + weapon.hitRadius + (catching ? CATCH_MARGIN : 0);
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
      if (other === attacker || other.owner === attacker || !other.alive || other.isInvisible?.(performance.now())) continue;
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
    attacker.figure.strike?.();
    this.parry(attacker, fx, fz, def);

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

  /** La cuchillada devuelve los búmerangs ajenos que vuelan delante (como en Boomerang Fu): ahora son tuyos. */
  parry(attacker, fx, fz, def) {
    for (const weapon of this.weapons) {
      if (!weapon.dangerous || weapon.owner === attacker) continue;
      const dx = weapon.x - attacker.x;
      const dz = weapon.z - attacker.z;
      const distance = Math.hypot(dx, dz);
      if (distance > def.meleeRange + PARRY_REACH + weapon.hitRadius) continue;
      if (distance > 0.01 && (dx * fx + dz * fz) / distance < -0.2) continue; // detrás no
      weapon.deflect(attacker, attacker.facing);
      this.effects.burst(weapon.x, 0.7, weapon.z, [0xffffff, 0xffd000], 14, 0.5);
      this.stage.shake(90, 0.15);
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
        | (this.respawnEnabled ? 0 : FEEDBACK.IN_MATCH);
      if (this.feedbackSent.get(character.id) !== flags) {
        this.feedbackSent.set(character.id, flags);
        this.network.sendFeedback(character.id, flags);
      }
      const list = [...character.abilities, ...(character.superPower ? [character.superPower] : [])]; // la súper, al final
      const abilities = list.join(',');
      if (this.abilitiesSent.get(character.id) !== abilities) {
        this.abilitiesSent.set(character.id, abilities);
        this.network.sendAbilities(character.id, list);
      }
    }
  }
}
