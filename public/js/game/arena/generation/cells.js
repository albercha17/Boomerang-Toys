// Tipos de casilla de la rejilla de una arena.
export const CELL = Object.freeze({
  EMPTY: 0, // suelo libre
  BLOCK: 1, // bloque de construcción
  BORDER: 2, // borde exterior
  PILLAR: 3, // torre de madera redonda
});

export const isSolid = (type) => type !== CELL.EMPTY;

/**
 * Piezas que se estampan en la rejilla (coordenadas relativas [col, fila]).
 * El generador las gira y las coloca dejando siempre un pasillo libre alrededor.
 */
export const STAMPS = Object.freeze([
  { name: 'bloque', weight: 3, cells: [[0, 0]] },
  { name: 'pareja', weight: 3, cells: [[0, 0], [1, 0]] },
  { name: 'muro', weight: 2, cells: [[0, 0], [1, 0], [2, 0]] },
  { name: 'muro largo', weight: 1, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { name: 'ele', weight: 2, cells: [[0, 0], [1, 0], [0, 1]] },
  { name: 'cuadrado', weight: 1, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: 'te', weight: 1, cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { name: 'torre', weight: 2, cells: [[0, 0]], type: CELL.PILLAR },
]);

// Juguetes sueltos (con física, se pueden empujar).
export const PROP_TYPES = Object.freeze(['dado', 'pelota']);
