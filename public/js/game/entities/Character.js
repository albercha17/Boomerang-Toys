import { ToyFigure } from './ToyFigure.js';
import { ButtonGesture } from '../input/ButtonGesture.js';

const TAG_STYLE = {
  fontFamily: 'Trebuchet MS, Arial, sans-serif',
  fontSize: '15px',
  fontStyle: 'bold',
  stroke: '#2a1d14',
  strokeThickness: 4,
};

/**
 * Personaje controlado por un mando. Separa el cuerpo físico (círculo invisible)
 * de su aspecto (ToyFigure). No conoce a los demás personajes: devuelve sus intenciones
 * (golpear, lanzar) y la escena las resuelve.
 */
export class Character {
  constructor(scene, group, player, def, x, y) {
    this.scene = scene;
    this.def = def;
    this.id = player.id;
    this.color = Phaser.Display.Color.HexStringToColor(player.color).color;

    this.hitbox = scene.add.zone(x, y, def.radius * 2, def.radius * 2);
    group.add(this.hitbox);
    this.hitbox.entity = this;
    this.body = this.hitbox.body;
    this.body.setCircle(def.radius);

    this.shadow = scene.add.image(x, y + 6, 'shadow').setDepth(2);
    this.figure = new ToyFigure(scene, x, y, this.color).setDepth(10);
    this.aimGraphics = scene.add.graphics().setDepth(6);
    this.tag = scene.add.text(x, y - 36, '', { ...TAG_STYLE, color: player.color }).setOrigin(0.5).setDepth(30);

    this.gesture = new ButtonGesture(def.tapMs);
    this.connected = true;
    this.alive = true;
    this.facing = 0;
    this.moving = 0;
    this.charging = false;
    this.charge = 0;
    this.weapon = null; // arma en la mano
    this.homeWeapon = null; // arma con la que reaparece
    this.meleeReadyAt = 0;
    this.invulnerableUntil = 0;
    this.respawnAt = 0;
    this.setPlayerInfo(player);
  }

  get x() { return this.hitbox.x; }
  get y() { return this.hitbox.y; }

  setPlayerInfo(player) {
    this.connected = player.connected;
    const label = `J${player.number}`;
    if (this.tag.text !== label) this.tag.setText(label);
  }

  isVulnerable(now) {
    return this.alive && now >= this.invulnerableUntil;
  }

  /** Aplica la entrada del mando. Devuelve las acciones que debe resolver la escena. */
  update(dt, now, rawInput) {
    const input = rawInput && this.connected && !rawInput.stale ? rawInput : null;
    const gesture = this.gesture.update(input, now);
    const actions = { melee: false, throwCharge: null };
    if (!this.alive) return actions;

    const mx = input ? input.x : 0;
    const my = input ? input.y : 0;
    this.moving = Math.min(1, Math.hypot(mx, my));
    if (this.moving > 0.25) {
      this.facing = Phaser.Math.Angle.RotateTo(this.facing, Math.atan2(my, mx), this.def.turnRate * dt);
    }

    const weapon = this.weapon;
    if (gesture.release && this.charging) actions.throwCharge = this.charge;
    if (weapon && gesture.holding) {
      this.charging = true;
      this.charge = Math.min(1, (gesture.holdTime - this.def.tapMs) / weapon.def.chargeMs);
    } else {
      this.charging = false;
      this.charge = 0;
    }
    if (gesture.tap && weapon && now >= this.meleeReadyAt) {
      actions.melee = true;
      this.meleeReadyAt = now + weapon.def.meleeCooldownMs;
    }

    const speed = this.def.speed * (this.charging ? this.def.chargeSpeedFactor : 1);
    this.body.setVelocity(mx * speed, my * speed);
    return actions;
  }

  /** Sincroniza el aspecto con el cuerpo físico. */
  render(dt, now) {
    const { x, y } = this;
    this.figure.setPosition(x, y).setRotation(this.facing);
    this.figure.animate(dt, this.moving, this.charging);
    this.shadow.setPosition(x, y + 6);
    this.tag.setPosition(x, y - 36);

    let alpha = this.connected ? 1 : 0.45;
    if (now < this.invulnerableUntil && Math.floor(now / 90) % 2) alpha *= 0.35;
    this.figure.setAlpha(alpha);
    this.drawAim();
  }

  drawAim() {
    const g = this.aimGraphics;
    g.clear();
    if (!this.charging) return;
    const cos = Math.cos(this.facing);
    const sin = Math.sin(this.facing);
    const length = 40 + this.charge * 170;
    g.fillStyle(this.color, 0.9);
    for (let d = 28; d < length; d += 14) g.fillCircle(this.x + cos * d, this.y + sin * d, 3 + this.charge * 1.5);
    const tipX = this.x + cos * (length + 10);
    const tipY = this.y + sin * (length + 10);
    g.fillTriangle(
      tipX, tipY,
      tipX - cos * 14 - sin * 8, tipY - sin * 14 + cos * 8,
      tipX - cos * 14 + sin * 8, tipY - sin * 14 - cos * 8,
    );
  }

  handPosition() {
    return this.figure.handPosition();
  }

  kill(respawnAt) {
    this.alive = false;
    this.respawnAt = respawnAt;
    this.charging = false;
    this.charge = 0;
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.figure.setVisible(false);
    this.shadow.setVisible(false);
    this.tag.setAlpha(0.35);
    this.aimGraphics.clear();
  }

  respawn(x, y, now) {
    this.alive = true;
    this.body.enable = true;
    this.body.reset(x, y);
    this.invulnerableUntil = now + this.def.spawnInvulnerableMs;
    this.figure.setVisible(true);
    this.shadow.setVisible(true);
    this.tag.setAlpha(1);
  }

  destroy() {
    this.alive = false;
    this.hitbox.destroy();
    this.shadow.destroy();
    this.figure.destroy();
    this.aimGraphics.destroy();
    this.tag.destroy();
  }
}
