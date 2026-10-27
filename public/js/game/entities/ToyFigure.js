/**
 * Aspecto del personaje: un muñeco articulado hecho de piezas sueltas (piernas, brazos, torso, cabeza).
 * Mira hacia +x en coordenadas locales; el contenedor gira hacia donde mira el personaje.
 * Las mismas piezas son las que salen despedidas al desmontarse.
 */
export class ToyFigure extends Phaser.GameObjects.Container {
  constructor(scene, x, y, color) {
    super(scene, x, y);
    const legColor = Phaser.Display.Color.ValueToColor(color).darken(30).color;

    this.legL = scene.add.image(-2, -7, 'toy-leg').setTint(legColor);
    this.legR = scene.add.image(-2, 7, 'toy-leg').setTint(legColor);
    this.armL = scene.add.image(2, -17, 'toy-arm').setTint(color);
    this.armR = scene.add.image(2, 17, 'toy-arm').setTint(color);
    this.torso = scene.add.image(0, 0, 'toy-torso').setTint(color);
    this.head = scene.add.image(2, 0, 'toy-head');
    this.add([this.legL, this.legR, this.armL, this.armR, this.torso, this.head]);

    this.walkPhase = 0;
    scene.add.existing(this);
  }

  /** @param {number} speed01 velocidad relativa (0..1) @param {boolean} aiming brazo adelantado */
  animate(dt, speed01, aiming) {
    this.walkPhase += dt * 14 * speed01;
    const swing = speed01 > 0.05 ? Math.sin(this.walkPhase) * 5 : 0;
    this.legL.x = -2 + swing;
    this.legR.x = -2 - swing;
    this.armL.x = 2 - swing * 0.7;
    this.armR.x = aiming ? 11 : 2 + swing * 0.7;
    this.head.setScale(1 + Math.abs(swing) * 0.008);
  }

  /** Posición de la mano que sujeta el arma, en coordenadas del mundo. */
  handPosition() {
    const m = this.armR.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty };
  }

  /** Datos de cada pieza en coordenadas del mundo, para crear los restos al desmontarse. */
  partsInWorld() {
    return this.list.map((part) => {
      const m = part.getWorldTransformMatrix();
      return { key: part.texture.key, tint: part.tintTopLeft, x: m.tx, y: m.ty, rotation: m.rotation };
    });
  }
}
