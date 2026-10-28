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

  // Se van añadiendo uno a uno (modelo 3D sacado de su dibujo con herramientas/modelos_ia.py).
  const CHARACTERS = Object.freeze([
    { id: 'muneca', name: 'Muñeca fashion', emoji: '👗', description: 'Melena rubia, vestido rosa de lunares y lazo.' },
  ]);

  const BY_ID = Object.freeze(Object.fromEntries(CHARACTERS.map((c) => [c.id, c])));
  const isCharacterId = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, id);

  return Object.freeze({ CHARACTERS, BY_ID, isCharacterId });
});
