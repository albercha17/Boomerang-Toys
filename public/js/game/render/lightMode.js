/**
 * Iluminación: la nueva (luz de entorno, mapeo de tonos y materiales suaves) o la de antes con /?luz=vieja
 * (sombreado de dibujos por bandas), para comparar. Los valores se pueden afinar desde la dirección:
 * ?exp= (exposición), ?hemi= (luz del cielo), ?sol=, ?env= (reflejo del entorno), ?sat= (saturación del acabado).
 */
const params = new URLSearchParams(location.search);
const num = (key, fallback) => (params.has(key) && Number.isFinite(Number(params.get(key))) ? Number(params.get(key)) : fallback);

// Con /?calidad=baja (ordenadores flojos, y las pruebas automáticas) se usa la de antes: es más barata
export const NEW_LIGHT = params.get('luz') !== 'vieja' && params.get('calidad') !== 'baja';
export const LIGHT = Object.freeze({
  exposure: num('exp', 0.95),
  hemi: num('hemi', 0.32),
  sun: num('sol', 1.55),
  env: num('env', 0.5),
  saturation: num('sat', 0.22),
  aces: params.get('tm') === 'aces', // mapeo de tonos de cine: blanquea las bases horneadas, por eso va apagado
});
