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
    { id: 'barbie', name: 'Muñeca Pop', emoji: '💃', description: 'Siempre a la última moda.' },
    { id: 'peluche', name: 'Peluche azul', emoji: '🧸', description: 'Blandito, achuchable y peligroso con el búmerang.' },
    { id: 'mago', name: 'Mago', emoji: '🧙', description: 'Magito de sombrero morado y calcetines de rayas.' },
    { id: 'vikingo', name: 'Vikingo', emoji: '🪓', description: 'Bajito, barbudo y con casco de cuernos.' },
    { id: 'dino', name: 'Dinosaurio', emoji: '🦖', description: 'Dinosaurio de juguete verde.' },
    { id: 'bichito', name: 'Bichito amarillo', emoji: '👓', description: 'Amarillo, con gafas y peto vaquero.' },
    { id: 'soldado', name: 'Soldadito', emoji: '🪖', description: 'Soldadito de juguete en posición de firmes.' },
    { id: 'robot', name: 'Robot transformable', emoji: '🤖', description: 'Robot de juguete de piezas de colores.' },
    { id: 'astronauta', name: 'Astronauta', emoji: '🚀', description: 'Traje espacial blanco y azul, recién llegado de la Luna.' },
    { id: 'cristi', name: 'Cristi', emoji: '⭐', description: 'Melena rubia ondulada y chaqueta vaquera.' },
    { id: 'woody', name: 'Woody', emoji: '🤠', description: 'Vaquero de trapo con sombrero y estrella de sheriff.' },
    { id: 'buzz', name: 'Buzz', emoji: '🚀', description: 'Guardián espacial con alas y casco.' },
    { id: 'mario', name: 'Mario', emoji: '🍄', description: 'Fontanero de gorra roja y bigote.' },
    { id: 'stitch', name: 'Stitch', emoji: '👽', description: 'Bichito azul de orejas grandes. Travieso.' },
    { id: 'olaf', name: 'Muñeco de nieve', emoji: '⛄', description: 'Le encantan los abrazos calentitos.' },
    { id: 'ironman', name: 'Hombre de hierro', emoji: '🦾', description: 'Armadura gigante roja y dorada.' },
    { id: 'arana', name: 'Hombre araña', emoji: '🕷️', description: 'Traje rojo y azul con telarañas.' },
    { id: 'goku', name: 'Príncipe Z', emoji: '🐉', description: 'Pelo de punta y armadura de saiyan.' },
    { id: 'levi', name: 'Capitán Levi', emoji: '🗡️', description: 'Capa verde y dos espadas.' },
    { id: 'baloncesto', name: 'Baloncestista', emoji: '🏀', description: 'No suelta el balón ni para dormir.' },
    { id: 'acorazado', name: 'Caballero oscuro', emoji: '🦇', description: 'Capa, máscara de orejas y armadura negra.' },
    { id: 'dibujo', name: 'Plátano', emoji: '🍌', description: 'Plátano con chaleco y muchas ganas de pelea.' },
    { id: 'jengibre', name: 'Galleta de jengibre', emoji: '🍪', description: 'Crujiente y con botones de caramelo.' },
    { id: 'cascanueces', name: 'Cascanueces', emoji: '🥜', description: 'Soldado de madera de Navidad.' },
    { id: 'calavera', name: 'Calavera mexicana', emoji: '💀', description: 'Catrina llena de flores y colores.' },
    { id: 'jesus', name: 'Jesús', emoji: '✝️', description: 'Túnica larga y sandalias.' },
  ]);

  const BY_ID = Object.freeze(Object.fromEntries(CHARACTERS.map((c) => [c.id, c])));
  const isCharacterId = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, id);

  return Object.freeze({ CHARACTERS, BY_ID, isCharacterId });
});
