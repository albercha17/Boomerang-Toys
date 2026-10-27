import * as THREE from 'three';
import {
  G, M, faceTexture, camoTexture, stripesTexture, checkerTexture, dotsTexture, denimTexture,
  furTexture, metalTexture, scalesTexture, panelTexture,
} from '../figures/kit.js';

/**
 * Aspecto 3D de cada personaje elegible (mismos ids que shared/characters.js).
 * Cada función devuelve la especificación para buildRig (figures/rig.js): proporciones, materiales,
 * texturas pintadas por código y accesorios colgados de la parte que les corresponde.
 * Todos comparten el mismo tamaño de cuerpo físico: solo cambia el aspecto.
 */
const SKIN = 0xf2c9a0;
const WOOD = 0xe7bf86;
const BLACK = 0x1b1b1b;
const WHITE = 0xf4f1ea;

const box = (w, h, d) => G.box(w, h, d);
const add = (parent, helpers, geometry, material, pos, rot, scale) => {
  const m = helpers.mesh(geometry, material, { pos, rot, scale });
  parent.add(m);
  return m;
};

export const FIGURES = {
  peon: () => ({
    legs: { mat: M.matte(0xc99a5e) },
    torso: { mat: M.matte(WOOD) },
    arms: { mat: M.matte(WOOD), hand: M.matte(0xc99a5e) },
    head: { mat: M.matte(WOOD, faceTexture({ skin: WOOD, eyes: 'dots', mouth: 'smile' })) },
    decorate(r, h) {
      add(r.head, h, G.hemi(0.235), M.plastic(0xe63946), [0, 0.02, 0]);
      add(r.torso, h, G.torus(0.2, 0.025), M.plastic(0xe63946), [0, 0.12, 0], [Math.PI / 2, 0, 0]);
    },
  }),

  muneca: () => ({
    size: { legR: 0.06, legSpread: 0.08, torsoW: 0.34, torsoH: 0.5, torsoY: 0.6, armR: 0.05, shoulderZ: 0.22, headR: 0.2, headY: 1.05 },
    legs: { mat: M.plastic(0xf6cfb5), foot: M.plastic(0xff4fa3), footSize: [0.15, 0.06, 0.09] },
    torso: { shape: 'dress', mat: M.fabric(0xff6fb5, dotsTexture(0xff6fb5, 0xffffff)) },
    arms: { mat: M.plastic(0xf6cfb5), hand: M.plastic(0xf6cfb5) },
    head: { mat: M.plastic(0xf6cfb5, faceTexture({ skin: 0xf6cfb5, eyes: 'lashes', eyeColor: 0x2f7fd8, mouth: 'lips', blush: true })) },
    decorate(r, h) {
      const hair = M.plastic(0xffd86b);
      add(r.head, h, G.hemi(0.215), hair, [-0.01, 0.02, 0]);
      add(r.head, h, G.capsule(0.13, 0.32), hair, [-0.13, -0.18, 0], [0, 0, 0.1], [0.7, 1, 1.55]); // melena por la espalda
      add(r.head, h, G.torus(0.2, 0.025), M.plastic(0xff4fa3), [0, 0.07, 0], [0, 0, Math.PI / 2 - 0.25]); // diadema
      add(r.torso, h, G.cyl(0.13, 0.12, 0.2, 16), M.fabric(0xff4fa3), [0, 0.3, 0]); // cuerpo del vestido
    },
  }),

  heroe: () => ({
    size: { torsoW: 0.5, torsoD: 0.3, torsoH: 0.52, shoulderZ: 0.32, armR: 0.085, armLen: 0.22, headR: 0.2, headY: 1.06, legR: 0.1 },
    legs: { mat: M.fabric(0x4b5320, camoTexture([0x4b5320, 0x6b7a3a, 0x2f3418, 0x8a7d5a])), foot: M.rubber(BLACK) },
    torso: { shape: 'box', mat: M.fabric(0x5f6f2f, camoTexture([0x5f6f2f, 0x86934a, 0x37401d, 0x9c8b5f])) },
    arms: { mat: M.plastic(0xd8a47f), hand: M.plastic(0xd8a47f) },
    head: { mat: M.plastic(0xd8a47f, faceTexture({ skin: 0xd8a47f, eyes: 'angry', mouth: 'flat', stubble: true, scar: true })) },
    decorate(r, h) {
      add(r.head, h, G.hemi(0.205), M.matte(0x2a1d14), [-0.01, 0.03, 0]);
      add(r.head, h, G.torus(0.2, 0.03), M.fabric(0xd7263d), [0, 0.06, 0], [Math.PI / 2, 0, 0]); // cinta
      add(r.torso, h, box(0.32, 0.06, 0.52), M.rubber(0x3b2a1e), [0, -0.22, 0]); // cinturón
      add(r.torso, h, box(0.04, 0.05, 0.05), M.metal(0xc9c9c9), [0.17, 0.1, 0.04]); // chapa
    },
  }),

  soldado: () => {
    const green = M.plastic(0x5d7a2a);
    return {
      legs: { mat: green, foot: green },
      torso: { shape: 'box', mat: green },
      arms: { mat: green, hand: green },
      head: { mat: M.plastic(0x5d7a2a, faceTexture({ skin: 0x5d7a2a, eyes: 'dots', eyeColor: 0x3d521a, mouth: 'flat' })) },
      decorate(r, h) {
        add(r.head, h, G.hemi(0.24), green, [0, 0.03, 0]); // casco
        add(r.head, h, G.cyl(0.29, 0.29, 0.03, 22), green, [0, 0.04, 0]); // ala del casco
        add(r.torso, h, box(0.14, 0.3, 0.3), green, [-0.22, 0.04, 0]); // mochila
        add(r.arms[0], h, G.cyl(0.025, 0.025, 0.5, 8), green, [0.06, -0.05, 0], [0, 0, 0.2]); // fusil de juguete
        add(r.group, h, G.cyl(0.36, 0.38, 0.05, 24), green, [0, 0.025, 0]); // peana
      },
    };
  },

  ranger: () => ({
    size: { torsoW: 0.46, torsoD: 0.36 },
    legs: { mat: M.plastic(WHITE), foot: M.plastic(0x7b3fb5) },
    torso: { mat: M.plastic(WHITE, panelTexture('space', WHITE)) },
    arms: { mat: M.plastic(WHITE), hand: M.plastic(0x37b34a) },
    head: { mat: M.plastic(SKIN, faceTexture({ skin: SKIN, eyes: 'dots', mouth: 'grin', brows: 0x5a3a20 })) },
    decorate(r, h) {
      add(r.head, h, G.sphere(0.235, 22, 12), M.plastic(0x7b3fb5), [-0.04, 0.02, 0], null, [0.9, 1, 1]); // capucha
      add(r.head, h, G.sphere(0.32, 26, 18), M.glass(0xcfe8ff), [0.02, 0, 0]); // casco de burbuja
      for (const side of [-1, 1]) {
        const wing = add(r.torso, h, box(0.04, 0.12, 0.5), M.plastic(WHITE), [-0.22, 0.12, side * 0.3], [side * 0.5, 0, 0]);
        add(wing, h, box(0.05, 0.13, 0.12), M.plastic(0xe63946), [0, 0, side * 0.22]);
      }
      add(r.torso, h, G.torus(0.21, 0.03), M.plastic(0x37b34a), [0, -0.2, 0], [Math.PI / 2, 0, 0]);
      for (const arm of r.arms) add(arm, h, G.cyl(0.075, 0.075, 0.08, 12), M.plastic(0x37b34a), [0, -0.06, 0]);
    },
  }),

  bichito: () => {
    const yellow = M.plastic(0xffd23f);
    return {
      size: { legLen: 0.22, hipY: 0.24, torsoY: 0.56, torsoH: 0.64, torsoW: 0.48, torsoD: 0.46, shoulderY: 0.62, shoulderZ: 0.27, armLen: 0.18, headR: 0.24, headY: 0.98 },
      legs: { mat: M.fabric(0x3b5ba5, denimTexture()), foot: M.rubber(BLACK) },
      torso: { mat: M.plastic(0xffd23f, panelTexture('overalls', 0xffd23f)) },
      arms: { mat: yellow, hand: M.rubber(BLACK) },
      head: { shape: 'capsule', length: 0.02, mat: M.plastic(0xffd23f, faceTexture({ skin: 0xffd23f, eyes: 'goggle', mouth: 'grin' })) },
      decorate(r, h) {
        add(r.head, h, G.torus(0.1, 0.035), M.metal(0x9aa3ad), [0.215, 0.04, 0], [0, Math.PI / 2, 0]); // montura de las gafas
        add(r.head, h, G.torus(0.245, 0.02), M.rubber(BLACK), [0, 0.04, 0], [Math.PI / 2, 0, 0]); // goma de las gafas
        for (const [z, a] of [[-0.04, -0.3], [0, 0], [0.04, 0.3]]) add(r.head, h, G.cyl(0.008, 0.008, 0.12, 5), M.rubber(BLACK), [0, 0.28, z], [a, 0, 0]); // pelos
      },
    };
  },

  robot: () => {
    const tin = M.metal(0xaab4be, metalTexture(0xaab4be));
    const face = M.metal(0xaab4be, faceTexture({ skin: 0x9aa4ae, eyes: 'led', eyeColor: 0x35e0ff, mouth: 'grille' }));
    return {
      size: { legR: 0.095, torsoW: 0.44, torsoD: 0.34 },
      legs: { shape: 'box', mat: tin, foot: M.metal(0x6c7680) },
      torso: { shape: 'box', mats: [M.metal(0xaab4be, panelTexture('robot', 0xaab4be)), tin, tin, tin, tin, tin] },
      arms: { mat: tin, hand: null },
      head: { shape: 'box', size: [0.36, 0.32, 0.38], mats: [face, tin, tin, tin, tin, tin] },
      decorate(r, h) {
        add(r.head, h, G.cyl(0.012, 0.012, 0.16, 6), M.metal(0x6c7680), [0, 0.24, 0]);
        add(r.head, h, G.sphere(0.04, 10, 8), M.glow(0xff3b30), [0, 0.33, 0]); // luz de la antena
        for (const z of [-0.2, 0.2]) add(r.head, h, G.cyl(0.05, 0.05, 0.04, 12), M.metal(0x6c7680), [0, 0, z], [Math.PI / 2, 0, 0]); // tornillos
        for (const arm of r.arms) {
          for (const z of [-0.03, 0.03]) add(arm, h, box(0.05, 0.1, 0.02), M.metal(0x6c7680), [0, -0.19, z]); // pinza
        }
      },
    };
  },

  osito: () => {
    const fur = M.fabric(0xa86b3c, furTexture(0xa86b3c, 0xc98d55));
    const light = M.fabric(0xe8c39a, furTexture(0xe8c39a, 0xf5dcbc));
    return {
      size: { legR: 0.11, legLen: 0.26, hipY: 0.28, torsoY: 0.56, torsoW: 0.5, torsoD: 0.44, torsoH: 0.54, armR: 0.085, armLen: 0.2, headR: 0.25, headY: 1.04 },
      legs: { mat: fur, foot: light, footSize: [0.24, 0.08, 0.2] },
      torso: { shape: 'sphere', mat: fur },
      arms: { mat: fur, hand: light },
      head: { mat: M.fabric(0xa86b3c, faceTexture({ skin: 0xa86b3c, eyes: 'dots', mouth: 'none' })) },
      decorate(r, h) {
        add(r.head, h, G.sphere(0.11, 16, 12), light, [0.2, -0.06, 0], null, [0.8, 0.75, 1]); // hocico
        add(r.head, h, G.sphere(0.045, 12, 10), M.plastic(BLACK), [0.29, -0.03, 0]); // nariz
        for (const z of [-0.16, 0.16]) {
          add(r.head, h, G.sphere(0.08, 14, 10), fur, [-0.02, 0.2, z], null, [0.6, 1, 1]);
          add(r.head, h, G.sphere(0.05, 12, 8), light, [0.01, 0.2, z], null, [0.4, 1, 1]);
        }
        add(r.torso, h, G.sphere(0.17, 18, 12), light, [0.13, -0.04, 0], null, [0.5, 1.1, 1]); // tripa
        add(r.torso, h, G.sphere(0.07, 12, 10), M.fabric(0xd7263d), [0.17, 0.25, 0], null, [0.6, 0.7, 1.6]); // lazo
      },
    };
  },

  caballero: () => {
    const steel = M.metal(0xc8ced6, metalTexture(0xc8ced6));
    return {
      size: { torsoW: 0.46, torsoD: 0.34 },
      legs: { shape: 'box', mat: steel, foot: M.metal(0x8f99a4) },
      torso: { shape: 'box', mats: [M.fabric(0xd7263d, panelTexture('cross', 0xc8ced6)), steel, steel, steel, steel, steel] },
      arms: { mat: steel, hand: M.metal(0x8f99a4) },
      head: { shape: 'capsule', length: 0.08, mat: M.metal(0xc8ced6, faceTexture({ skin: 0xb8bfc8, eyes: 'led', eyeColor: 0x111111, mouth: 'grille' })) },
      decorate(r, h) {
        add(r.head, h, G.capsule(0.05, 0.16), M.fabric(0xd7263d), [-0.04, 0.32, 0], [0, 0, 0.5]); // penacho
        add(r.torso, h, box(0.03, 0.62, 0.42), M.fabric(0xb01f30), [-0.19, -0.1, 0], [0, 0, -0.08]); // capa
        const shield = add(r.arms[0], h, G.cyl(0.17, 0.17, 0.04, 20), M.metal(0x8f99a4), [0.07, -0.06, -0.05], [0, 0, Math.PI / 2]);
        add(shield, h, box(0.05, 0.03, 0.18), M.plastic(0xd7263d), [0, 0.025, 0]);
        add(shield, h, box(0.18, 0.03, 0.05), M.plastic(0xd7263d), [0, 0.025, 0]);
        add(r.torso, h, G.sphere(0.1, 14, 10), steel, [0, 0.24, 0.24], null, [1, 0.7, 1]); // hombreras
        add(r.torso, h, G.sphere(0.1, 14, 10), steel, [0, 0.24, -0.24], null, [1, 0.7, 1]);
      },
    };
  },

  dino: () => {
    const skin = M.rubber(0x3fae49, scalesTexture(0x3fae49, 0x2c8a37));
    const belly = M.rubber(0xc9e86b);
    return {
      size: { legR: 0.11, legLen: 0.28, hipY: 0.3, torsoY: 0.6, torsoW: 0.44, torsoD: 0.44, armR: 0.045, armLen: 0.14, shoulderY: 0.72, shoulderZ: 0.2, headR: 0.2, headY: 1.02 },
      legs: { mat: skin, foot: skin, footSize: [0.26, 0.08, 0.18] },
      torso: { mat: skin },
      arms: { mat: skin, hand: skin },
      head: { shape: 'box', size: [0.46, 0.3, 0.32], mats: [M.rubber(0x3fae49, faceTexture({ skin: 0x3fae49, eyes: 'reptile', mouth: 'teeth' })), skin, skin, skin, skin, skin] },
      decorate(r, h) {
        add(r.head, h, box(0.22, 0.12, 0.28), skin, [0.2, -0.09, 0]); // mandíbula
        for (let i = 0; i < 4; i++) add(r.head, h, G.cone(0.025, 0.06, 6), M.plastic(WHITE), [0.29, -0.03, -0.09 + i * 0.06], [Math.PI, 0, 0]); // dientes
        add(r.torso, h, G.cone(0.17, 0.62, 14), skin, [-0.42, -0.14, 0], [0, 0, Math.PI / 2 + 0.25]); // cola
        add(r.torso, h, G.sphere(0.18, 16, 12), belly, [0.14, -0.02, 0], null, [0.45, 1.2, 1]); // tripa
        for (let i = 0; i < 4; i++) add(r.torso, h, G.cone(0.05, 0.12, 6), M.plastic(0xff7f11), [-0.18 - i * 0.04, 0.28 - i * 0.13, 0], [0, 0, 0.9]); // pinchos
      },
    };
  },

  pirata: () => ({
    legs: { mat: M.fabric(0x2a3a6b), foot: M.rubber(BLACK) },
    torso: { mat: M.fabric(0xe9e3d8, stripesTexture(0xe9e3d8, 0xc8102e, 10)) },
    arms: { mat: M.fabric(0xe9e3d8, stripesTexture(0xe9e3d8, 0xc8102e, 6)), hand: M.plastic(SKIN) },
    head: { mat: M.plastic(SKIN, faceTexture({ skin: SKIN, eyes: 'dots', mouth: 'grin', patch: true, beard: 0x3b2314 })) },
    decorate(r, h) {
      const hat = M.matte(0x1b1b1b);
      add(r.head, h, G.cyl(0.3, 0.3, 0.04, 3), hat, [0, 0.15, 0], [0, Math.PI / 6, 0]); // tricornio
      add(r.head, h, G.cyl(0.17, 0.2, 0.15, 18), hat, [0, 0.22, 0]);
      add(r.head, h, G.torus(0.19, 0.012), M.metal(0xe6b422), [0, 0.165, 0], [Math.PI / 2, 0, 0]); // galón dorado
      add(r.head, h, G.torus(0.05, 0.012), M.metal(0xe6b422), [0.22, 0.05, 0.11], [0, Math.PI / 2, 0]); // pendiente
      add(r.legs[1], h, G.cyl(0.04, 0.03, 0.12, 8), M.matte(0x8a5a2b), [0, -0.2, 0]); // pata de palo
      add(r.torso, h, box(0.32, 0.07, 0.44), M.rubber(0x3b2a1e), [0, -0.2, 0]); // cinturón
      add(r.torso, h, box(0.04, 0.06, 0.08), M.metal(0xe6b422), [0.17, -0.2, 0]); // hebilla
    },
  }),

  vaquero: () => ({
    legs: { mat: M.fabric(0x3b5ba5, denimTexture(0x3b5ba5)), foot: M.rubber(0x6b3d1e), footSize: [0.24, 0.1, 0.18] },
    torso: { mat: M.fabric(0xc8102e, checkerTexture(0xc8102e, 0x7c0a1d, 8)) },
    arms: { mat: M.fabric(0xc8102e, checkerTexture(0xc8102e, 0x7c0a1d, 6)), hand: M.plastic(SKIN) },
    head: { mat: M.plastic(SKIN, faceTexture({ skin: SKIN, eyes: 'happy', mouth: 'smile', brows: 0x5a3a20 })) },
    decorate(r, h) {
      const leather = M.matte(0x8b5a2b);
      add(r.head, h, G.cyl(0.36, 0.36, 0.03, 26), leather, [0, 0.13, 0]); // ala del sombrero
      add(r.head, h, G.cyl(0.17, 0.19, 0.18, 20), leather, [0, 0.23, 0]); // copa
      add(r.head, h, G.torus(0.185, 0.018), M.matte(0x3b2314), [0, 0.165, 0], [Math.PI / 2, 0, 0]);
      add(r.torso, h, G.star(0.07), M.metal(0xe6b422), [0.18, 0.08, 0.08]); // estrella de sheriff
      add(r.torso, h, G.cone(0.12, 0.12, 4), M.fabric(0xf4b400), [0.12, 0.24, 0], [0, 0, Math.PI * 1.1]); // pañuelo
    },
  }),
};

/** Aro del color del jugador a los pies (cada personaje tiene sus colores; así se sabe quién es quién). */
export function playerRing(color) {
  const ring = new THREE.Mesh(G.torus(0.3, 0.035), M.glow(color));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.03;
  return ring;
}
