const LIFETIME_MS = 8000; // tiempo que las piezas quedan en el suelo
const FADE_MS = 1200;
const MAX_PIECES = 160; // límite para mantener el rendimiento: se retiran las más antiguas

/**
 * Restos de los personajes desmontados y efectos visuales de impacto.
 * Las piezas tienen físicas propias: rebotan en las paredes, chocan entre sí y los personajes las empujan.
 */
export class DebrisSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = scene.physics.add.group();
    this.pieces = [];
  }

  addColliders(walls, characterGroup) {
    const physics = this.scene.physics;
    physics.add.collider(this.group, walls);
    physics.add.collider(this.group, this.group);
    physics.add.overlap(this.group, characterGroup, (piece, hitbox) => this.nudge(piece, hitbox.entity));
  }

  /** Desmonta el personaje: cada pieza sale despedida en la dirección del golpe. */
  burst(character, angle) {
    const now = this.scene.time.now;
    for (const part of character.figure.partsInWorld()) {
      const piece = this.scene.physics.add.image(part.x, part.y, part.key)
        .setRotation(part.rotation)
        .setTint(part.tint)
        .setDepth(8);
      this.group.add(piece);

      const body = piece.body;
      const radius = Math.min(piece.width, piece.height) / 2;
      body.setCircle(radius, piece.width / 2 - radius, piece.height / 2 - radius);
      body.setBounce(0.55, 0.55);
      body.setDamping(true);
      body.setDrag(0.12, 0.12);
      body.setAngularDrag(520);

      const direction = angle + Phaser.Math.FloatBetween(-0.9, 0.9);
      const speed = Phaser.Math.Between(240, 520) * (part.key === 'toy-head' ? 1.25 : 1);
      body.setVelocity(Math.cos(direction) * speed, Math.sin(direction) * speed);
      body.setAngularVelocity(Phaser.Math.Between(-900, 900));
      this.pieces.push({ piece, bornAt: now, fading: false });
    }
    while (this.pieces.length > MAX_PIECES) this.pieces.shift().piece.destroy();
    this.impact(character.x, character.y, character.color);
  }

  impact(x, y, color) {
    const scene = this.scene;
    const emitter = scene.add.particles(x, y, 'spark', {
      speed: { min: 120, max: 420 },
      lifespan: { min: 300, max: 700 },
      scale: { start: 1, end: 0 },
      tint: [color, 0xf0c991, 0xffffff],
      emitting: false,
    }).setDepth(20);
    emitter.explode(26);
    scene.time.delayedCall(900, () => emitter.destroy());

    const ring = scene.add.circle(x, y, 18).setStrokeStyle(5, 0xffffff).setDepth(19);
    scene.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 280, onComplete: () => ring.destroy() });
    scene.cameras.main.shake(150, 0.006);
  }

  /** Arco del golpe cuerpo a cuerpo. */
  slash(x, y, angle, range, color) {
    const arc = this.scene.add.graphics().setDepth(19);
    arc.lineStyle(7, 0xffffff, 0.95).beginPath().arc(x, y, range, angle - 1.1, angle + 1.1).strokePath();
    arc.lineStyle(3, color, 1).beginPath().arc(x, y, range - 6, angle - 0.9, angle + 0.9).strokePath();
    this.scene.tweens.add({ targets: arc, alpha: 0, duration: 160, onComplete: () => arc.destroy() });
  }

  nudge(piece, character) {
    if (!character || !character.alive) return;
    const dx = piece.x - character.x;
    const dy = piece.y - character.y;
    const distance = Math.hypot(dx, dy) || 1;
    piece.body.velocity.x += (dx / distance) * 30;
    piece.body.velocity.y += (dy / distance) * 30;
  }

  update(now) {
    for (const entry of this.pieces) {
      if (entry.fading || now - entry.bornAt < LIFETIME_MS) continue;
      entry.fading = true;
      this.scene.tweens.add({ targets: entry.piece, alpha: 0, duration: FADE_MS, onComplete: () => entry.piece.destroy() });
    }
    if (this.pieces.length && !this.pieces[0].piece.active) {
      this.pieces = this.pieces.filter((entry) => entry.piece.active);
    }
  }
}
