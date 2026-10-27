import * as CANNON from 'cannon-es';

// Grupos de colisión: cada cuerpo solo choca con los grupos de su máscara.
export const GROUP = Object.freeze({
  WALL: 1,
  FLOOR: 2,
  CHARACTER: 4,
  WEAPON: 8,
  DEBRIS: 16,
});
const MASK = Object.freeze({
  WALL: GROUP.CHARACTER | GROUP.WEAPON | GROUP.DEBRIS,
  FLOOR: GROUP.DEBRIS,
  CHARACTER: GROUP.WALL | GROUP.CHARACTER | GROUP.DEBRIS,
  WEAPON: GROUP.WALL, // los búmerangs atraviesan a los personajes: el impacto se calcula aparte
  DEBRIS: GROUP.WALL | GROUP.FLOOR | GROUP.CHARACTER | GROUP.DEBRIS,
});

const FIXED_STEP = 1 / 60;

/**
 * Mundo físico (cannon-es). Personajes y armas se mueven solo en el plano del suelo (y bloqueada);
 * las piezas desmontadas tienen física 3D completa con gravedad.
 */
export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;

    const m = (name) => new CANNON.Material(name);
    this.materials = { wall: m('wall'), floor: m('floor'), character: m('character'), weapon: m('weapon'), debris: m('debris') };
    const { wall, floor, character, weapon, debris } = this.materials;
    const contact = (a, b, friction, restitution) => {
      this.world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }));
    };
    contact(weapon, wall, 0, 1); // rebote perfecto en las paredes
    contact(character, wall, 0, 0);
    contact(character, character, 0, 0);
    contact(debris, floor, 0.5, 0.35);
    contact(debris, wall, 0.2, 0.5);
    contact(debris, character, 0.1, 0.2);
    contact(debris, debris, 0.4, 0.2);

    const ground = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: floor,
      collisionFilterGroup: GROUP.FLOOR,
      collisionFilterMask: MASK.FLOOR,
    });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
  }

  step(dt) {
    this.world.step(FIXED_STEP, dt, 5);
  }

  /** Bloque fijo: centro y semitamaños en unidades del mundo. */
  addWall(x, y, z, halfX, halfY, halfZ) {
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)),
      position: new CANNON.Vec3(x, y, z),
      material: this.materials.wall,
      collisionFilterGroup: GROUP.WALL,
      collisionFilterMask: MASK.WALL,
    });
    body.kind = 'wall';
    this.world.addBody(body);
    return body;
  }

  /** Cuerpo de un personaje: esfera que se desliza por el suelo sin girar. */
  createCharacterBody(radius, x, z) {
    const body = this.planarBody(radius, 5, this.materials.character, GROUP.CHARACTER, MASK.CHARACTER);
    body.position.set(x, radius, z);
    body.kind = 'character';
    this.world.addBody(body);
    return body;
  }

  /** Cuerpo de un arma lanzada (se añade al mundo solo mientras no está en la mano). */
  createWeaponBody(radius) {
    const body = this.planarBody(radius, 1, this.materials.weapon, GROUP.WEAPON, MASK.WEAPON);
    body.kind = 'weapon';
    return body;
  }

  /**
   * Pieza desmontada con gravedad y giro libre.
   * @param {{ sphere?: number, box?: number[] }} shape
   */
  createDebrisBody(shape, position, quaternion) {
    const body = new CANNON.Body({
      mass: shape.sphere ? 0.5 : 0.35,
      shape: shape.sphere ? new CANNON.Sphere(shape.sphere) : new CANNON.Box(new CANNON.Vec3(...shape.box)),
      material: this.materials.debris,
      collisionFilterGroup: GROUP.DEBRIS,
      collisionFilterMask: MASK.DEBRIS,
      // Las esferas (cabezas) no tienen rozamiento al rodar: se frenan más para que no rueden sin fin.
      linearDamping: shape.sphere ? 0.35 : 0.05,
      angularDamping: shape.sphere ? 0.7 : 0.1,
    });
    body.sleepSpeedLimit = 0.3;
    body.sleepTimeLimit = 0.5;
    body.position.set(position.x, position.y, position.z);
    body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    body.kind = 'debris';
    this.world.addBody(body);
    return body;
  }

  planarBody(radius, mass, material, group, mask) {
    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Sphere(radius),
      material,
      collisionFilterGroup: group,
      collisionFilterMask: mask,
      fixedRotation: true,
      linearDamping: 0,
    });
    body.linearFactor.set(1, 0, 1); // sin movimiento vertical
    body.allowSleep = false;
    return body;
  }

  add(body) {
    if (!body.world) this.world.addBody(body);
  }

  remove(body) {
    if (body.world) this.world.removeBody(body);
  }
}
