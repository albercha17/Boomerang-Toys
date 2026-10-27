import * as THREE from 'three';

const DOTS = 18;
const DOT_GAP = 0.24;
const START = 0.75; // distancia al centro del personaje donde empieza la flecha
const DOT_GEOMETRY = new THREE.CircleGeometry(0.06, 12);
const TIP_GEOMETRY = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(0.22, 0);
  shape.lineTo(-0.08, 0.16);
  shape.lineTo(-0.08, -0.16);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
})();

/** Flecha de puntos pintada en el suelo mientras se carga un lanzamiento. Crece con la carga. */
export class AimIndicator {
  constructor(color) {
    this.group = new THREE.Group();
    this.group.visible = false;
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
    this.dots = Array.from({ length: DOTS }, (_, i) => {
      const dot = new THREE.Mesh(DOT_GEOMETRY, material);
      dot.rotation.x = -Math.PI / 2;
      dot.position.x = START + i * DOT_GAP;
      this.group.add(dot);
      return dot;
    });
    this.tip = new THREE.Mesh(TIP_GEOMETRY, material);
    this.tip.rotation.x = -Math.PI / 2;
    this.group.add(this.tip);
  }

  update(x, z, facing, visible, charge) {
    this.group.visible = visible;
    if (!visible) return;
    this.group.position.set(x, 0.03, z);
    this.group.rotation.y = -facing;
    const length = START + 0.35 + charge * 3.6;
    const scale = 1 + charge * 0.6;
    for (const dot of this.dots) {
      dot.visible = dot.position.x < length;
      dot.scale.setScalar(scale);
    }
    this.tip.position.x = length + 0.1;
    this.tip.scale.setScalar(scale);
  }
}
