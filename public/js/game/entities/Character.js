import * as THREE from 'three';
import { makeFigure } from './makeFigure.js';
import { AimIndicator } from './AimIndicator.js';
import { ButtonGesture } from '../input/ButtonGesture.js';
import { POWERUPS, ALL, MAX_ABILITIES, ICONS_ON_PICKUP_MS } from '../content/powerups.js';

const { BUTTONS } = window.Protocol;

/** Gira un ángulo hacia otro sin pasar de maxStep radianes. */
function rotateTowards(current, target, maxStep) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return Math.abs(diff) <= maxStep ? target : current + Math.sign(diff) * maxStep;
}

const SHIELD_GEOMETRY = new THREE.SphereGeometry(1, 24, 16);
const ICE_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const ACCELERATION = 16; // 1/s: lo rápido que alcanza la velocidad del joystick (arranque y frenada suaves, no de golpe)

/** Etiqueta "J1" flotando sobre la cabeza, con los iconos de sus habilidades debajo. */
export function createTag(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 112;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(2, 0.875, 1);
  sprite.renderOrder = 10;
  sprite.draw = (text, icons, iconColor = color) => {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 40px Trebuchet MS, Arial, sans-serif';
    g.lineWidth = 9;
    g.strokeStyle = '#2a1d14';
    g.strokeText(text, 128, 34);
    g.fillStyle = color;
    g.fillText(text, 128, 34);
    if (icons) {
      g.font = 'bold 34px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Trebuchet MS, sans-serif';
      g.lineWidth = 7;
      g.strokeText(icons, 128, 84);
      g.fillStyle = iconColor;
      g.fillText(icons, 128, 84);
    }
    texture.needsUpdate = true;
  };
  return sprite;
}

/**
 * Personaje controlado por un mando. Separa el cuerpo físico (esfera en el plano del suelo)
 * de su aspecto (la figura de makeFigure). No conoce a los demás personajes: devuelve sus intenciones
 * (golpear, lanzar) y ArenaGame las resuelve.
 */
export class Character {
  constructor(game, player, def, x, z) {
    this.game = game;
    this.def = def;
    this.id = player.id;
    this.color = new THREE.Color(player.color).getHex();

    this.body = game.physics.createCharacterBody(def.radius, x, z);
    this.body.entity = this;
    this.figureId = player.character ?? 'peon';
    this.figure = makeFigure(this.figureId, this.color, def.scale);
    this.aim = new AimIndicator(this.color);
    this.tag = createTag(player.color);
    // Burbuja del escudo (solo visible con esa habilidad).
    this.shield = new THREE.Mesh(SHIELD_GEOMETRY, new THREE.MeshStandardMaterial({ color: POWERUPS.escudo.color, transparent: true, opacity: 0.25, depthWrite: false }));
    this.shield.scale.setScalar(def.radius * 2.1);
    this.shield.visible = false;
    // Bloque de hielo (Onda helada)
    this.ice = new THREE.Mesh(ICE_GEOMETRY, new THREE.MeshStandardMaterial({ color: 0xbfefff, transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false }));
    this.ice.scale.set(def.radius * 2.6, 1.3 * def.scale + 0.3, def.radius * 2.6);
    this.ice.visible = false;
    game.stage.scene.add(this.figure.group, this.aim.group, this.tag, this.shield, this.ice);
    this.superPower = null; // superhabilidad de un solo uso (caja dorada)
    this.frozenUntil = 0; // congelado por una Onda helada
    this.invisibleUntil = 0; // Fantasma
    this.leap = null; // Supersalto en curso: { fromX, fromZ, toX, toZ, start, until }
    this.iconsUntil = 0; // los iconos de los power-ups se ven al cogerlos y en la cuenta atrás
    this.moveInput = { x: 0, y: 0 }; // último joystick de movimiento (Telequinesis guía el búmerang con él)
    this.abilities = []; // ids de power-up, de la más antigua a la más nueva
    this.lunge = null; // embestida de la cuchillada: { target, until }

    this.gesture = new ButtonGesture(def.tapMs);
    this.connected = true;
    this.tagText = '';
    this.alive = true;
    this.facing = 0;
    this.moving = 0;
    this.charging = false;
    this.charge = 0;
    this.weapon = null; // arma en la mano
    this.homeWeapon = null; // arma con la que reaparece
    this.meleeReadyAt = 0;
    this.aimedThisPress = false; // se arrastró el joystick de ataque en la pulsación actual
    this.lastDashes = null;
    this.dashStart = -Infinity;
    this.dashAngle = 0;
    this.dashReadyAt = 0;
    this.invulnerableUntil = 0;
    this.respawnAt = 0;
    this.setPlayerInfo(player);
  }

  get x() { return this.body.position.x; }
  get z() { return this.body.position.z; }

  setPlayerInfo(player) {
    this.connected = player.connected;
    this.label = player.label ?? `J${player.number}`;
    this.cssColor = player.color;
    this.tagLabel = `${this.label}${player.connected ? '' : ' ✕'}`;
    this.refreshTag();
  }

  /** Etiqueta: nombre y, debajo, los iconos de los power-ups (si toca verlos). */
  refreshTag(now = performance.now()) {
    let line = '';
    let lineColor;
    if (now < this.iconsUntil || this.game.frozen) {
      line = this.abilities.map((id) => POWERUPS[id].icon).join(' ');
    }
    if (this.superPower) line = `★${ALL[this.superPower].icon}${line ? `  ${line}` : ''}`; // la súper se ve siempre: ¡cuidado!
    const key = `${this.tagLabel}|${line}`;
    if (key === this.tagText) return;
    this.tagText = key;
    this.tag.draw(this.tagLabel, line, lineColor);
  }

  // --- Habilidades (power-ups) ---------------------------------------------

  hasAbility(id) {
    return this.abilities.includes(id);
  }

  /** Añade una habilidad; con el máximo ya lleno se pierde la más antigua. Repetir una la renueva. */
  addAbility(id) {
    this.abilities = this.abilities.filter((a) => a !== id);
    this.abilities.push(id);
    while (this.abilities.length > MAX_ABILITIES) this.abilities.shift();
    this.iconsUntil = performance.now() + ICONS_ON_PICKUP_MS;
    this.refreshTag();
  }


  removeAbility(id) {
    this.abilities = this.abilities.filter((a) => a !== id);
    this.refreshTag();
  }

  clearAbilities() {
    this.abilities = [];
    this.superPower = null;
    this.refreshTag();
  }

  /** Superhabilidad de la caja dorada: solo una; la nueva sustituye a la que hubiera. */
  setSuper(id) {
    this.superPower = id;
    this.iconsUntil = performance.now() + ICONS_ON_PICKUP_MS;
    this.refreshTag();
  }

  /** Si la superhabilidad se dispara con este gesto ('dash' o 'throw'), la gasta y devuelve su id. */
  useSuper(trigger) {
    const id = this.superPower;
    if (!id || ALL[id].trigger !== trigger) return null;
    this.superPower = null;
    this.refreshTag();
    return id;
  }

  isFrozen(now) { return now < this.frozenUntil; }

  isInvisible(now) { return now < this.invisibleUntil; }

  // --- Cuchillada con embestida (como el cuchillo del COD) -----------------

  /** Se lanza hacia el objetivo; ArenaGame resuelve el golpe al llegar o al acabar el tiempo. */
  startLunge(target, now) {
    this.lunge = { target, until: now + this.def.lunge.maxMs };
    this.facing = Math.atan2(target.z - this.z, target.x - this.x);
  }

  isLunging() {
    return this.lunge !== null;
  }

  isVulnerable(now) {
    return this.alive && now >= this.invulnerableUntil;
  }

  /**
   * Aplica la entrada del mando (estilo Brawl Stars: joystick de movimiento + joystick de ataque + dash).
   * Devuelve las acciones que debe resolver la partida.
   */
  update(dt, now, rawInput) {
    const input = rawInput && this.connected && !rawInput.stale ? rawInput : null;
    const attack = this.gesture.update(input && { pressed: (input.buttons & BUTTONS.ACTION) !== 0, presses: input.presses }, now);
    const dashPressed = this.readDash(input);
    const actions = { melee: false, throwCharge: null, dash: false, teleport: false };
    if (!this.alive) {
      this.aimedThisPress = false;
      return actions;
    }
    if (this.isFrozen(now)) { // congelado: ni se mueve ni ataca
      this.body.velocity.set(0, 0, 0);
      this.moving = 0;
      this.charging = false;
      this.charge = 0;
      this.aimedThisPress = false;
      return actions;
    }
    if (this.lunge) {
      const { target } = this.lunge;
      this.facing = Math.atan2(target.z - this.z, target.x - this.x);
      const speed = this.def.lunge.speed;
      this.body.velocity.set(Math.cos(this.facing) * speed, 0, Math.sin(this.facing) * speed);
      this.moving = 1;
      return actions;
    }

    // Al soltar el joystick de ataque: si se apuntó (o se mantuvo) se lanza; un toque sin apuntar es una cuchillada.
    const weapon = this.weapon;
    if (attack.tap || attack.release) {
      if (weapon && (this.aimedThisPress || attack.release)) {
        actions.throwCharge = this.charge;
      } else if (weapon && attack.tap && now >= this.meleeReadyAt) {
        actions.melee = true;
        this.meleeReadyAt = now + weapon.def.meleeCooldownMs;
      } else if (!weapon && attack.tap && this.hasAbility('teletransporte')) {
        actions.teleport = true; // sin búmerang en la mano: un toque te lleva hasta él
      }
      this.aimedThisPress = false;
    }

    // Mientras se arrastra el joystick de ataque, el personaje mira al instante hacia donde se apunta.
    const aimX = input ? input.aimX : 0;
    const aimY = input ? input.aimY : 0;
    if (attack.pressed && Math.hypot(aimX, aimY) > this.def.aimDeadZone) {
      this.aimedThisPress = true;
      this.facing = Math.atan2(aimY, aimX);
    }
    this.charging = Boolean(weapon && attack.pressed && (this.aimedThisPress || attack.holding));
    this.charge = this.charging ? Math.min(1, attack.holdTime / weapon.def.chargeMs) : 0;

    const mx = input ? input.x : 0;
    const my = input ? input.y : 0;
    const magnitude = Math.min(1, Math.hypot(mx, my));
    this.moveInput = { x: mx, y: my };
    if (!this.charging && magnitude > 0.25) {
      this.facing = rotateTowards(this.facing, Math.atan2(my, mx), this.def.turnRate * dt);
    }

    // Dash: impulso corto hacia donde se mueve (o hacia donde mira), con tiempo de recarga.
    const dash = this.def.dash;
    if (dashPressed && now >= this.dashReadyAt) {
      this.dashAngle = magnitude > 0.2 ? Math.atan2(my, mx) : this.facing;
      this.dashStart = now;
      this.dashReadyAt = now + dash.cooldownMs;
      if (!this.charging) this.facing = this.dashAngle;
      actions.dash = true;
    }
    if (this.isDashing(now)) {
      this.body.velocity.set(Math.cos(this.dashAngle) * dash.speed, 0, Math.sin(this.dashAngle) * dash.speed);
      this.moving = 1;
      return actions;
    }

    const speed = this.def.speed * (this.charging ? this.def.aimSpeedFactor : 1);
    const k = 1 - Math.exp(-ACCELERATION * (this.grip ?? 1) * dt); // arranca y frena en ~0,15 s (en el hielo, resbala)
    const v = this.body.velocity;
    v.set(v.x + (mx * speed - v.x) * k, 0, v.z + (my * speed - v.z) * k);
    this.moving = this.charging ? magnitude * this.def.aimSpeedFactor : magnitude;
    return actions;
  }

  /** true una vez por cada pulsación nueva del dash (contadas en el servidor). */
  readDash(input) {
    if (!input) {
      this.lastDashes = null;
      return false;
    }
    const pressed = this.lastDashes !== null && input.dashes > this.lastDashes;
    this.lastDashes = input.dashes;
    return pressed;
  }

  isDashing(now) {
    return now < this.dashStart + this.def.dash.durationMs;
  }

  /** Sincroniza el aspecto con el cuerpo físico (después del paso de física). */
  render(dt, now) {
    const { x, z } = this;
    const group = this.figure.group;
    group.position.set(x, 0, z);
    group.rotation.y = -this.facing;
    // Movimiento real para la animación: velocidad, aceleración hacia delante y giro
    const speed = this.alive ? Math.hypot(this.body.velocity.x, this.body.velocity.z) : 0;
    const accel = dt > 0 ? (speed - (this.lastSpeed ?? speed)) / dt : 0;
    const turnDiff = Math.atan2(Math.sin(this.facing - (this.lastFacing ?? this.facing)), Math.cos(this.facing - (this.lastFacing ?? this.facing)));
    this.lastSpeed = speed;
    this.lastFacing = this.facing;
    this.smoothAccel = (this.smoothAccel ?? 0) + (accel - (this.smoothAccel ?? 0)) * Math.min(1, dt * 10);
    this.figure.animate(dt, this.moving, this.charging, {
      speed: this.isFrozen(now) ? 0 : speed, accel: this.smoothAccel, turn: dt > 0 ? turnDiff / dt : 0, dashing: this.isDashing(now),
    });
    if (this.isDashing(now)) {
      const t = (now - this.dashStart) / this.def.dash.durationMs;
      group.position.y += Math.sin(Math.PI * t) * this.def.dash.hopHeight; // saltito durante el dash
    }
    if (this.leap) group.position.y += this.leap.y; // Supersalto: por el aire
    const fall = this.falling; // cayendo: baja y da vueltas
    group.position.y += fall ? fall.y : 0;
    group.rotation.x = fall ? Math.sin(fall.spin) * 0.9 : this.leap ? -this.leap.flip : 0;
    group.rotation.z = fall ? fall.spin * 0.7 : 0;
    this.tag.position.set(x, 1.3 * this.def.scale + 0.55 + (fall ? fall.y : 0) + (this.leap ? this.leap.y : 0), z);
    const frozen = this.alive && this.isFrozen(now);
    this.ice.visible = frozen;
    if (frozen) this.ice.position.set(x, this.ice.scale.y / 2, z);
    this.shield.visible = this.alive && this.hasAbility('escudo');
    this.shield.position.set(x, this.def.radius * 1.6, z);
    this.refreshTag(now);

    const blinking = now < this.invulnerableUntil && !this.leap && Math.floor(now / 90) % 2 === 1;
    const unseen = this.hidden || this.isInvisible(now); // en un matorral o con Fantasma no se le ve
    group.visible = this.alive && !blinking && !unseen;
    this.tag.visible = !unseen;
    this.shield.visible = this.shield.visible && !unseen;
    this.aim.update(x, z, this.facing, this.alive && this.charging && !unseen, this.charge);
  }

  handPosition(target) {
    return this.figure.handWorldPosition(target);
  }

  kill(respawnAt) {
    this.alive = false;
    this.falling = null;
    this.leap = null;
    this.frozenUntil = 0;
    this.invisibleUntil = 0;
    this.lunge = null; // los power-ups se conservan durante toda la partida
    this.respawnAt = respawnAt;
    this.charging = false;
    this.charge = 0;
    this.body.velocity.set(0, 0, 0);
    this.game.physics.remove(this.body);
    this.figure.group.visible = false;
    this.tag.material.opacity = 0.35;
  }

  /** Fuera de juego hasta la próxima ronda (sin desmontarse): entró con la ronda empezada. */
  waitForRound() {
    this.kill(Infinity);
  }

  respawn(x, z, now) {
    this.alive = true;
    this.falling = null;
    this.leap = null;
    this.frozenUntil = 0;
    this.invisibleUntil = 0;
    this.body.position.set(x, this.def.radius, z);
    this.body.velocity.set(0, 0, 0);
    this.game.physics.add(this.body);
    this.invulnerableUntil = now + this.def.spawnInvulnerableMs;
    this.tag.material.opacity = 1;
  }

  destroy() {
    this.alive = false;
    this.game.physics.remove(this.body);
    this.game.stage.scene.remove(this.figure.group, this.aim.group, this.tag, this.shield, this.ice);
    this.shield.material.dispose();
    this.ice.material.dispose();
    this.tag.material.map.dispose();
    this.tag.material.dispose();
  }
}
