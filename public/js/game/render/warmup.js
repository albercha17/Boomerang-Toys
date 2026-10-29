import * as THREE from 'three';
import { makeFigure } from '../entities/makeFigure.js';
import { PowerUp } from '../entities/PowerUp.js';
import { ALL } from '../content/powerups.js';

/**
 * Precalentamiento: la primera vez que algo se dibuja, la tarjeta gráfica tiene que compilar sus shaders y subir
 * sus texturas, y ese fotograma se queda congelado (un tirón de 150-300 ms al salir la primera caja o al entrar los
 * personajes). Aquí se dibuja todo una vez al cargar, diminuto y en el centro de la vista, y luego se quita.
 */
export function warmUp(stage, game) {
  // En calidad baja (sin tarjeta gráfica que valga) precalentarlo todo tarda segundos: cuesta más de lo que ahorra
  if (new URLSearchParams(location.search).get('calidad') === 'baja') return;
  // Un personaje de verdad, con todo lo que puede llevar a la vista (escudo, hielo, etiqueta, flecha de apuntar)
  const dummy = game?.addCharacter({ id: '__precalentar', label: 'J1', color: '#ffffff', connected: true, character: window.CharacterCatalog.CHARACTERS[0].id }, performance.now());
  if (dummy) {
    dummy.shield.visible = true;
    dummy.ice.visible = true;
    dummy.ice.position.copy(stage.target);
    dummy.aim.update(stage.target.x, stage.target.z, 0, true, 0.5);
  }
  const group = new THREE.Group();
  const extras = [];
  for (const { id } of window.CharacterCatalog.CHARACTERS) {
    const figure = makeFigure(id, 0xffffff, 1.4);
    group.add(figure.group);
    for (const part of figure.parts ?? []) group.add(part.object); // las piezas en que se desmonta al morir
  }
  // Cajas (regalo y cofre) con sus iconos: una de cada power-up (los iconos quedan guardados para reutilizarlos)
  for (const def of Object.values(ALL)) {
    const box = new PowerUp(stage, def, 0, 0);
    stage.scene.remove(box.group);
    box.icon.visible = true; // lo que sale al abrirla (cerrada no se ve)
    group.add(box.group);
    extras.push(box);
  }
  group.position.copy(stage.target);
  group.scale.setScalar(0.001);
  stage.scene.add(group);
  const textures = new Set();
  group.traverse((o) => {
    for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[key]) textures.add(m[key]);
    }
  });
  for (const t of textures) stage.renderer.initTexture(t);
  stage.renderer.compile(stage.scene, stage.camera);
  stage.render(performance.now()); // un fotograma de verdad: también las sombras
  stage.scene.remove(group);
  for (const box of extras) box.release?.();
  if (dummy) game.removeCharacter(dummy);
}
