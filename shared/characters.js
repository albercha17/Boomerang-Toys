/**
 * Catálogo de personajes elegibles, compartido por servidor (valida que no se repitan), pantalla y mandos.
 * Su aspecto 3D está en public/js/game/content/toys.js (mismo id).
 * Se carga con require() en Node y como <script> clásico en el navegador (window.CharacterCatalog).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CharacterCatalog = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHARACTERS = Object.freeze([
    { id: 'peon', name: 'Maniquí de choque', emoji: '🎯', description: 'El muñeco de las pruebas de choque: aguanta lo que le echen.' },
    { id: 'muneca', name: 'Muñeca fashion', emoji: '👗', description: 'Melena rubia, vestido rosa de lunares y lazo.' },
    { id: 'heroe', name: 'Héroe de acción', emoji: '💪', description: 'Barba, músculos y cinta roja en la frente.' },
    { id: 'soldado', name: 'Soldadito verde', emoji: '🪖', description: 'De plástico verde, con casco y mochila.' },
    { id: 'ranger', name: 'Astronauta', emoji: '🚀', description: 'Traje blanco y naranja, visor y mochila espacial.' },
    { id: 'bichito', name: 'Monstruito', emoji: '👾', description: 'Peludo y azul, con tres ojos y cuernecitos.' },
    { id: 'robot', name: 'Robot', emoji: '🤖', description: 'Chapa gris, luces rojas y antena.' },
    { id: 'osito', name: 'Osito de peluche', emoji: '🧸', description: 'Blandito, con orejas redondas y pajarita roja.' },
    { id: 'caballero', name: 'Caballero', emoji: '🛡️', description: 'Armadura plateada, penacho rojo y escudo.' },
    { id: 'dino', name: 'Dinosaurio', emoji: '🦖', description: 'Dientes, cola y pinchos naranjas en la espalda.' },
    { id: 'pirata', name: 'Pirata', emoji: '🏴‍☠️', description: 'Tricornio, parche y barba pelirroja.' },
    { id: 'vaquero', name: 'Vaquero', emoji: '🤠', description: 'Sombrero, pañuelo amarillo y estrella de sheriff.' },
  ]);

  const BY_ID = Object.freeze(Object.fromEntries(CHARACTERS.map((c) => [c.id, c])));
  const isCharacterId = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, id);

  return Object.freeze({ CHARACTERS, BY_ID, isCharacterId });
});
