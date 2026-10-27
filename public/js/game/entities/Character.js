import * as THREE from 'three';
import { ToyFigure } from './ToyFigure.js';
import { AimIndicator } from './AimIndicator.js';
import { ButtonGesture } from '../input/ButtonGesture.js';

const { BUTTONS } = window.Protocol;

/** Gira un ángulo hacia otro sin pasar de maxStep radianes. */
function rotateTowards(current, target, maxStep) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return Math.abs(diff) <= maxStep ? target : current + Math.sign(diff) * maxStep;
}

/** Etiqueta "J1" flotando sobre la cabeza. */
function createTag(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 64;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(1.25, 0.5, 1);
  sprite.renderOrder = 10;
  sprite.draw = (text) => {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.font = 'bold 40px Trebuchet MS, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 9;
    g.strokeStyle = '#2a1d14';
    g.strokeText(text, 80, 34);
    g.fillStyle = color;
    g.fillText(text, 80, 34);
    texture.needsUpdate = true;
  };
  return sprite;
}

/**
 * Personaje controlado por un mando. Separa el cuerpo físico (esfera en el plano del suelo)
 * de su aspecto (ToyFigure). No conoce a los demás personajes: devuelve sus intenciones
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
    this.figure = new ToyFigure(this.color, def.scale);
    this.aim = new AimIndicator(this.color);
    this.tag = createTag(player.color);
    game.stage.scene.add(this.figure.group, this.aim.group, this.tag);

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
    const text = `${player.label ?? `J${player.number}`}${player.connected ? '' : ' ✕'}`;
    if (text !== this.tagText) {
      this.tagText = text;
      this.tag.draw(text);
    }
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
    const actions = { melee: false, throwCharge: null, dash: false };
    if (!this.alive) {
      this.aimedThisPress = false;
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
    this.body.velocity.set(mx * speed, 0, my * speed);
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
    this.figure.animate(dt, this.moving, this.charging);
    if (this.isDashing(now)) {
      const t = (now - this.dashStart) / this.def.dash.durationMs;
      group.position.y += Math.sin(Math.PI * t) * this.def.dash.hopHeight; // saltito durante el dash
    }
    this.tag.position.set(x, 1.3 * this.def.scale + 0.3, z);

    const blinking = now < this.invulnerableUntil && Math.floor(now / 90) % 2 === 1;
    group.visible = this.alive && !blinking;
    this.aim.update(x, z, this.facing, this.alive && this.charging, this.charge);
  }

  handPosition(target) {
    return this.figure.handWorldPosition(target);
  }

  kill(respawnAt) {
    this.alive = false;
    this.respawnAt = respawnAt;
    this.charging = false;
    this.charge = 0;
    this.body.velocity.set(0, 0, 0);
    this.game.physics.remove(this.body);
    this.figure.group.visible = false;
    this.tag.material.opacity = 0.35;
  }

  respawn(x, z, now) {
    this.alive = true;
    this.body.position.set(x, this.def.radius, z);
    this.body.velocity.set(0, 0, 0);
    this.game.physics.add(this.body);
    this.invulnerableUntil = now + this.def.spawnInvulnerableMs;
    this.tag.material.opacity = 1;
  }

  destroy() {
    this.alive = false;
    this.game.physics.remove(this.body);
    this.game.stage.scene.remove(this.figure.group, this.aim.group, this.tag);
    this.tag.material.map.dispose();
    this.tag.material.dispose();
  }
}
