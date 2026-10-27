/**
 * Conjuntos de muebles de cada zona de la casa (datos puros: los usa ArenaGenerator para colocarlos y
 * ArenaBuilder para dibujarlos). Los muebles son los de Kenney (render/furniture.js) a escala de casa de
 * muñecas: FURNITURE_SCALE veces su tamaño original (un armario de cocina = 1 casilla).
 *
 * Cada conjunto: w × h casillas y sus muebles. Cada mueble: [modelo, x, z, giro, uso, alto]
 *   x, z  centro del mueble en casillas dentro del conjunto
 *   giro  en cuartos de vuelta (0 = mira hacia abajo de la pantalla, 1 = hacia la derecha, 2 = arriba, -1 = izquierda)
 *   uso   'pared' (bloquea: sus casillas son sólidas), 'suelto' (se empuja) o 'adorno' (no choca)
 *   alto  opcional: se pone encima de otro mueble (en unidades del juego)
 */
export const FURNITURE_SCALE = 2.3;

const P = 'pared';
const S = 'suelto';
const A = 'adorno';

export const ROOM_SETS = {
  salon: [
    { w: 5, h: 4, weight: 3, items: [
      ['rugRectangle', 2.5, 2, 0, A], ['loungeSofa', 2.5, 0.55, 0, P], ['tableCoffee', 2.5, 2.1, 0, P],
      ['loungeChair', 0.55, 2.1, 1, P], ['loungeChair', 4.45, 2.1, -1, P], ['pillow', 2, 0.6, 0, A, 0.55],
    ] },
    { w: 4, h: 1, weight: 2, items: [
      ['cabinetTelevision', 2, 0.35, 0, P], ['televisionModern', 2, 0.3, 0, A, 0.71], ['speaker', 0.35, 0.4, 0, P], ['speaker', 3.65, 0.4, 0, P],
    ] },
    { w: 2, h: 1, weight: 2, items: [['bookcaseClosedWide', 1, 0.35, 0, P]] },
    { w: 2, h: 2, weight: 2, items: [['loungeChairRelax', 0.9, 1, 0, P], ['lampRoundFloor', 1.7, 0.4, 0, P]] },
    { w: 1, h: 1, weight: 1, items: [['pottedPlant', 0.5, 0.5, 0, P]] },
    { w: 2, h: 1, weight: 1, items: [['cardboardBoxClosed', 0.5, 0.5, 0, S], ['cardboardBoxOpen', 1.5, 0.5, 0, S]] },
  ],
  cocina: [
    { w: 3, h: 2, weight: 3, items: [ // isla
      ['kitchenCabinet', 0.5, 0.5, 2, P], ['kitchenSink', 1.5, 0.5, 2, P], ['kitchenCabinet', 2.5, 0.5, 2, P],
      ['kitchenCabinetDrawer', 0.5, 1.5, 0, P], ['kitchenStove', 1.5, 1.5, 0, P], ['kitchenCabinetDrawer', 2.5, 1.5, 0, P],
      ['toaster', 0.5, 0.9, 0, A, 1.04], ['kitchenBlender', 2.5, 1.1, 0, A, 1.04],
    ] },
    { w: 4, h: 4, weight: 3, items: [ // mesa con sillas que se pueden empujar
      ['tableRound', 2, 2, 0, P], ['chair', 2, 0.55, 0, S], ['chair', 2, 3.45, 2, S], ['chair', 0.55, 2, 1, S], ['chair', 3.45, 2, -1, S],
    ] },
    { w: 1, h: 1, weight: 1, items: [['kitchenFridgeLarge', 0.5, 0.5, 0, P]] },
    { w: 3, h: 1, weight: 2, items: [
      ['kitchenCabinetDrawer', 0.5, 0.5, 0, P], ['kitchenStove', 1.5, 0.5, 0, P], ['kitchenCabinet', 2.5, 0.5, 0, P],
      ['kitchenMicrowave', 2.5, 0.4, 0, A, 1.04],
    ] },
    { w: 1, h: 1, weight: 1, items: [['trashcan', 0.5, 0.5, 0, S]] },
  ],
  dormitorio: [
    { w: 4, h: 3, weight: 3, items: [
      ['bedSingle', 2, 1.35, 0, P], ['cabinetBedDrawerTable', 0.55, 0.4, 0, P], ['cabinetBedDrawerTable', 3.45, 0.4, 0, P],
      ['lampRoundTable', 0.55, 0.4, 0, A, 0.6], ['bear', 2, 0.5, 0, A, 0.85],
    ] },
    { w: 3, h: 2, weight: 2, items: [['desk', 1.5, 0.5, 0, P], ['chairDesk', 1.5, 1.45, 2, S], ['lampRoundTable', 0.6, 0.4, 0, A, 0.88]] },
    { w: 2, h: 1, weight: 2, items: [['bookcaseOpen', 0.5, 0.35, 0, P], ['bookcaseClosed', 1.5, 0.35, 0, P]] },
    { w: 3, h: 3, weight: 1, items: [['rugRound', 1.5, 1.5, 0, A], ['cardboardBoxOpen', 1.5, 1.5, 0, P], ['bear', 1.5, 1.5, 0, A, 0.55]] },
    { w: 2, h: 1, weight: 1, items: [['cardboardBoxClosed', 0.5, 0.5, 0, S], ['cardboardBoxClosed', 1.5, 0.5, 0, S]] },
  ],
  bano: [
    { w: 3, h: 2, weight: 3, items: [['bathtub', 1.5, 0.75, 0, P]] },
    { w: 2, h: 1, weight: 2, items: [['bathroomSink', 0.5, 0.4, 0, P], ['bathroomSink', 1.5, 0.4, 0, P]] },
    { w: 2, h: 1, weight: 2, items: [['washer', 0.5, 0.5, 0, P], ['dryer', 1.5, 0.5, 0, P]] },
    { w: 1, h: 2, weight: 2, items: [['toilet', 0.5, 0.6, 0, P]] },
    { w: 2, h: 2, weight: 2, items: [['showerRound', 1, 1, 0, P]] },
    { w: 1, h: 1, weight: 1, items: [['bathroomCabinetDrawer', 0.5, 0.5, 0, P]] },
  ],
  patio: [
    { w: 4, h: 1, weight: 3, items: [
      ['plant_bushDetailed', 0.5, 0.5, 0, P], ['plant_bushDetailed', 1.5, 0.5, 0, P], ['plant_bushDetailed', 2.5, 0.5, 0, P], ['plant_bushDetailed', 3.5, 0.5, 0, P],
    ] },
    { w: 1, h: 1, weight: 3, items: [['tree_default', 0.5, 0.5, 0, P]] },
    { w: 1, h: 1, weight: 2, items: [['tree_oak', 0.5, 0.5, 0, P]] },
    { w: 4, h: 1, weight: 2, items: [['fence_planks', 1.15, 0.5, 0, P], ['fence_planks', 3.35, 0.5, 0, P]] },
    { w: 2, h: 2, weight: 2, items: [
      ['flower_redA', 0.4, 0.5, 0, A], ['flower_yellowB', 1.2, 0.4, 0, A], ['flower_purpleA', 0.7, 1.4, 0, A], ['plant_flatTall', 1.5, 1.4, 0, A],
    ] },
    { w: 2, h: 1, weight: 1, items: [['log_stack', 1, 0.5, 1, P]] },
    { w: 2, h: 2, weight: 1, items: [['tent_detailedClosed', 1, 1, 0, P]] },
  ],
};

/** Medidas originales [ancho x, alto y, fondo z] de los modelos (para saber qué casillas ocupan). */
export const MODEL_SIZE = {
  bathroomCabinetDrawer: [0.43, 0.47, 0.32], bathroomSink: [0.34, 0.56, 0.29], bathtub: [1.19, 0.42, 0.56],
  bedSingle: [0.57, 0.37, 1.13], bookcaseClosed: [0.4, 0.85, 0.25], bookcaseClosedWide: [0.8, 0.79, 0.25],
  bookcaseOpen: [0.4, 0.88, 0.25], cabinetBedDrawerTable: [0.27, 0.26, 0.22], cabinetTelevision: [0.8, 0.31, 0.25],
  cardboardBoxClosed: [0.21, 0.28, 0.21], cardboardBoxOpen: [0.37, 0.28, 0.21], chair: [0.2, 0.47, 0.2],
  chairDesk: [0.33, 0.61, 0.31], coatRackStanding: [0.27, 0.77, 0.27], desk: [0.73, 0.38, 0.39], dryer: [0.39, 0.47, 0.38],
  kitchenCabinet: [0.43, 0.45, 0.45], kitchenCabinetDrawer: [0.43, 0.45, 0.45], kitchenFridgeLarge: [0.52, 0.92, 0.41],
  kitchenSink: [0.43, 0.49, 0.45], kitchenStove: [0.43, 0.45, 0.45], lampRoundFloor: [0.15, 0.86, 0.18],
  loungeChair: [0.49, 0.46, 0.41], loungeChairRelax: [0.49, 0.63, 0.67], loungeSofa: [0.98, 0.46, 0.41],
  pottedPlant: [0.21, 0.65, 0.24], showerRound: [0.56, 1.09, 0.56], speaker: [0.15, 0.64, 0.15], tableCoffee: [0.66, 0.23, 0.4],
  tableRound: [0.69, 0.37, 0.8], toilet: [0.31, 0.45, 0.48], trashcan: [0.21, 0.43, 0.23], washer: [0.39, 0.47, 0.39],
  plant_bushDetailed: [0.6, 0.36, 0.6], tree_default: [0.3, 1.71, 0.3], tree_oak: [0.3, 1.23, 0.3], // árboles: solo el tronco choca
  fence_planks: [1.0, 0.35, 0.1], log_stack: [0.42, 0.35, 0.71], tent_detailedClosed: [0.87, 0.56, 0.64],
};

export const ROOM_MODELS =[...new Set(Object.values(ROOM_SETS).flatMap((sets) => sets.flatMap((s) => s.items.map((i) => i[0]))))];
