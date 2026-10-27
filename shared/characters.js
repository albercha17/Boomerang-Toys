/**
 * Catálogo de personajes elegibles, compartido por servidor (valida que no se repitan), pantalla y mandos.
 * Su aspecto 3D está en public/js/game/content/figures.js (mismo id).
 * Se carga con require() en Node y como <script> clásico en el navegador (window.CharacterCatalog).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CharacterCatalog = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHARACTERS = Object.freeze([
    { id: 'peon', name: 'Peón de madera', emoji: '♟️', description: 'El clásico de madera de toda la vida.' },
    { id: 'muneca', name: 'Muñeca fashion', emoji: '👗', description: 'Melena rubia, vestido rosa y tacones. Siempre a la moda.' },
    { id: 'heroe', name: 'Héroe de acción', emoji: '💪', description: 'Músculos de plástico, camuflaje y cinta en la frente.' },
    { id: 'soldado', name: 'Soldadito verde', emoji: '🪖', description: 'Casco, mochila y su peana pegada a los pies.' },
    { id: 'ranger', name: 'Astronauta', emoji: '🚀', description: 'Traje naranja, mochila cohete y casco con antenita.' },
    { id: 'bichito', name: 'Monstruito', emoji: '👾', description: 'Peludo y azul, con tres ojos saltones y cuernecitos.' },
    { id: 'robot', name: 'Robot de hojalata', emoji: '🤖', description: 'Chapa, remaches, antena y pinzas.' },
    { id: 'osito', name: 'Osito de peluche', emoji: '🧸', description: 'Blandito, con orejas redondas y lazo rojo.' },
    { id: 'caballero', name: 'Caballero', emoji: '🛡️', description: 'Armadura plateada, penacho rojo, capa y escudo.' },
    { id: 'dino', name: 'Dinosaurio de goma', emoji: '🦖', description: 'Dientes, cola y pinchos en la espalda.' },
    { id: 'pirata', name: 'Pirata', emoji: '🏴‍☠️', description: 'Sombrero, parche, barba y camiseta de rayas.' },
    { id: 'vaquero', name: 'Vaquero', emoji: '🤠', description: 'Sombrero, camisa de cuadros y estrella de sheriff.' },
  ]);

  const BY_ID = Object.freeze(Object.fromEntries(CHARACTERS.map((c) => [c.id, c])));
  const isCharacterId = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, id);

  return Object.freeze({ CHARACTERS, BY_ID, isCharacterId });
});
