import { COLORS } from '../render/materials.js';

const LIFETIME_MS = 8000; // tiempo que las piezas quedan en el suelo
const SHRINK_MS = 600;
const MAX_PIECES = 160; // límite para mantener el rendimiento: se retiran las más antiguas

/**
 * Restos de los personajes desmontados. Cada pieza es una copia de la pieza del muñeco
 * con su propio cuerpo físico 3D: sale despedida, rebota, rueda y los personajes la empujan.
 */
export class DebrisSystem {
  constructor(stage, physics, effects) {
    this.stage = stage;
    this.physics = physics;
    this.effects = effects;
    this.pieces = [];
  }

  /** Desmonta el personaje: cada pieza sale despedida en la dirección del golpe. */
  burst(character, angle, now) {
    for (const part of character.figure.partsInWorld()) {
      const mesh = part.object.clone(true);
      mesh.position.copy(part.position);
      mesh.quaternion.copy(part.quaternion);
      mesh.scale.copy(part.scale);
      this.stage.scene.add(mesh);

      const body = this.physics.createDebrisBody(part.shape, part.position, part.quaternion);
      const direction = angle + (Math.random() - 0.5) * 1.6;
      const speed = (3.5 + Math.random() * 4) * (part.kind === 'head' ? 1.2 : 1);
      body.velocity.set(Math.cos(direction) * speed, 3 + Math.random() * 3.5, Math.sin(direction) * speed);
      body.angularVelocity.set((Math.random() - 0.5) * 28, (Math.random() - 0.5) * 28, (Math.random() - 0.5) * 28);
      this.pieces.push({ mesh, body, bornAt: now, baseScale: mesh.scale.clone() });
    }
    while (this.pieces.length > MAX_PIECES) this.removePiece(this.pieces.shift());

    this.effects.burst(character.x, 0.7, character.z, [character.color, COLORS.wood, 0xffffff]);
    this.effects.ring(character.x, character.z);
    this.stage.shake(160, 0.25);
  }

  /** Después del paso de física: copia posición y giro, y retira las piezas viejas encogiéndolas. */
  sync(now) {
    this.pieces = this.pieces.filter((piece) => {
      const age = now - piece.bornAt;
      if (age > LIFETIME_MS + SHRINK_MS) {
        this.removePiece(piece);
        return false;
      }
      const { position, quaternion } = piece.body;
      piece.mesh.position.set(position.x, position.y, position.z);
      piece.mesh.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      if (age > LIFETIME_MS) {
        piece.mesh.scale.copy(piece.baseScale).multiplyScalar(1 - (age - LIFETIME_MS) / SHRINK_MS);
      }
      return true;
    });
  }

  removePiece(piece) {
    this.physics.remove(piece.body);
    this.stage.scene.remove(piece.mesh);
  }
}
