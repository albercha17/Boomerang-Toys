/**
 * Juguetes 3D: para cada personaje (ids de shared/characters.js), el modelo base de Kenney «Blocky Characters»
 * (a..r, ver public/models/blocky), su piel (public/models/skins, pintadas por herramientas/pieles.py)
 * y los accesorios de bloque.
 *
 * Medidas de las piezas (unidades del modelo; delante = +z):
 *   cabeza  x ±0.4, y 0..0.8 (desde el cuello), z ±0.4
 *   torso   x ±0.4, y 0.3..1.2, z ±0.3
 *   brazos  cuelgan del hombro: y -1..0.1; el derecho en x -0.4..0, el izquierdo en x 0..0.4
 */
const skin = (id) => `/models/skins/${id}.png`;

const antenna = (h, head, color) => {
  h.cylinder(head, [0.025, 0.025, 0.32], 0x9aa3b5, [0.22, 0.95, 0]);
  h.box(head, [0.12, 0.12, 0.12], color, [0.22, 1.13, 0]);
};

export const TOYS = {
  // Maniquí de pruebas de choque (amarillo, con dianas)
  peon: { base: 'd' },

  muneca: {
    base: 'e',
    skin: skin('muneca'),
    accessories(n, h) {
      const head = h.on(n.head);
      h.box(head, [0.24, 0.18, 0.08], 0xff4fa8, [0.14, 0.86, 0.12], [0, 0, 0.45]);
      h.box(head, [0.24, 0.18, 0.08], 0xff4fa8, [0.38, 0.86, 0.12], [0, 0, -0.45]);
      h.box(head, [0.1, 0.1, 0.1], 0xd6247f, [0.26, 0.86, 0.13]);
      const torso = h.on(n.torso);
      h.box(torso, [0.98, 0.3, 0.76], 0xff5cad, [0, 0.42, 0]); // falda
      h.box(torso, [1.08, 0.1, 0.86], 0xffffff, [0, 0.27, 0]); // volante
    },
  },

  // Héroe de acción con cinta roja
  heroe: {
    base: 'a',
    accessories(n, h) {
      const head = h.on(n.head);
      h.box(head, [0.84, 0.11, 0.84], 0xe11d2a, [0, 0.6, 0]);
      h.box(head, [0.07, 0.07, 0.34], 0xe11d2a, [0.12, 0.56, -0.56], [0.5, 0.2, 0]);
      h.box(head, [0.07, 0.07, 0.3], 0xe11d2a, [-0.06, 0.52, -0.54], [0.8, -0.2, 0]);
    },
  },

  // Soldadito de plástico verde
  soldado: {
    base: 'm',
    skin: skin('soldado'),
    accessories(n, h) {
      const head = h.on(n.head);
      h.box(head, [0.94, 0.24, 0.94], 0x5a9c45, [0, 0.86, 0]);
      h.box(head, [1.02, 0.06, 1.02], 0x4c8a3a, [0, 0.74, 0.02]);
      const torso = h.on(n.torso);
      h.box(torso, [0.56, 0.6, 0.22], 0x5a9c45, [0, 0.8, -0.41]);
      h.box(torso, [0.4, 0.18, 0.08], 0x4c8a3a, [0, 0.62, -0.55]);
    },
  },

  // Astronauta
  ranger: {
    base: 'c',
    skin: skin('ranger'),
    accessories(n, h) {
      const head = h.on(n.head);
      antenna(h, head, 0xff8a24);
      const torso = h.on(n.torso);
      h.box(torso, [0.62, 0.66, 0.26], 0xf2f2f6, [0, 0.8, -0.43]);
      h.box(torso, [0.64, 0.1, 0.28], 0xff8a24, [0, 0.62, -0.43]);
      h.cylinder(torso, [0.07, 0.1, 0.18], 0x9aa3b5, [-0.18, 0.4, -0.45]);
      h.cylinder(torso, [0.07, 0.1, 0.18], 0x9aa3b5, [0.18, 0.4, -0.45]);
    },
  },

  // Monstruito azul con cuernos
  bichito: {
    base: 'o',
    skin: skin('bichito'),
    accessories(n, h) {
      const head = h.on(n.head);
      h.box(head, [0.11, 0.28, 0.11], 0xfff1c9, [0.26, 0.92, 0], [0, 0, -0.35]);
      h.box(head, [0.11, 0.28, 0.11], 0xfff1c9, [-0.26, 0.92, 0], [0, 0, 0.35]);
    },
  },

  robot: {
    base: 'g',
    accessories(n, h) {
      antenna(h, h.on(n.head), 0xff3b3b);
    },
  },

  osito: {
    base: 'a',
    skin: skin('osito'),
    accessories(n, h) {
      const head = h.on(n.head);
      for (const x of [-0.3, 0.3]) {
        h.box(head, [0.24, 0.24, 0.12], 0xb0703c, [x, 0.86, 0]);
        h.box(head, [0.13, 0.13, 0.02], 0xecc48c, [x, 0.85, 0.07]);
      }
      const torso = h.on(n.torso);
      h.box(torso, [0.16, 0.14, 0.06], 0xd61f2c, [-0.13, 1.1, 0.32], [0, 0, 0.3]);
      h.box(torso, [0.16, 0.14, 0.06], 0xd61f2c, [0.13, 1.1, 0.32], [0, 0, -0.3]);
      h.box(torso, [0.08, 0.08, 0.07], 0xa3121d, [0, 1.1, 0.33]);
    },
  },

  caballero: {
    base: 'j',
    skin: skin('caballero'),
    accessories(n, h) {
      const head = h.on(n.head);
      h.box(head, [0.12, 0.26, 0.56], 0xd6263a, [0, 0.95, -0.06]);
      h.box(head, [0.1, 0.2, 0.2], 0xd6263a, [0, 0.9, -0.4], [-0.5, 0, 0]);
      const arm = h.on(n['arm-left']);
      h.box(arm, [0.06, 0.62, 0.52], 0xf0c440, [0.43, -0.48, 0]);
      h.box(arm, [0.06, 0.52, 0.42], 0xce2636, [0.46, -0.48, 0]);
      h.box(arm, [0.02, 0.4, 0.08], 0xf0c440, [0.49, -0.48, 0]);
      h.box(arm, [0.02, 0.08, 0.3], 0xf0c440, [0.49, -0.4, 0]);
    },
  },

  dino: {
    base: 'l',
    skin: skin('dino'),
    accessories(n, h) {
      const head = h.on(n.head);
      h.box(head, [0.12, 0.16, 0.14], 0xff9a2e, [0, 0.86, -0.05]);
      h.box(head, [0.12, 0.14, 0.14], 0xff9a2e, [0, 0.84, -0.28]);
      const torso = h.on(n.torso);
      for (const [y, s] of [[1.05, 0.18], [0.82, 0.2], [0.58, 0.18]]) h.box(torso, [0.1, s, 0.14], 0xff9a2e, [0, y, -0.36]);
      h.box(torso, [0.34, 0.32, 0.4], 0x68be50, [0, 0.42, -0.48]);
      h.box(torso, [0.24, 0.24, 0.36], 0x5aa846, [0, 0.32, -0.82]);
      h.box(torso, [0.15, 0.15, 0.32], 0x68be50, [0, 0.24, -1.12]);
      h.box(torso, [0.08, 0.12, 0.1], 0xff9a2e, [0, 0.52, -0.82]);
    },
  },

  pirata: {
    base: 'p',
    accessories(n, h) {
      const head = h.on(n.head);
      h.box(head, [1.04, 0.08, 0.74], 0x24242c, [0, 0.82, 0]);
      h.box(head, [0.74, 0.24, 0.56], 0x24242c, [0, 0.96, 0]);
      h.box(head, [0.16, 0.12, 0.02], 0xf4f1ea, [0, 0.96, 0.29]);
    },
  },

  vaquero: {
    base: 'k',
    accessories(n, h) {
      const head = h.on(n.head);
      h.box(head, [1.16, 0.06, 1.16], 0x9a5b2e, [0, 0.8, 0]);
      h.box(head, [0.7, 0.32, 0.7], 0xa8673a, [0, 0.98, 0]);
      h.box(head, [0.72, 0.07, 0.72], 0x4a2b16, [0, 0.86, 0]);
      const torso = h.on(n.torso);
      h.box(torso, [0.84, 0.12, 0.64], 0xf4c430, [0, 1.15, 0]);
      h.box(torso, [0.14, 0.14, 0.04], 0xf2d24b, [-0.2, 1.0, 0.31], [0, 0, 0.78]); // estrella
    },
  },
};

// Pastillita: mientras no esté su modelo 3D (herramientas/modelos_ia.py), muñeco de bloques rojo y blanco
TOYS.capsula = { base: 'c', skin: skin('capsula') };

export const TOY_BASES =Object.values(TOYS).map((t) => t.base);
