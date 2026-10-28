/**
 * Lo que se mueve y aplasta (rodillos). Cada uno va y vuelve por su recorrido con un ángulo `angle` (0 = a lo largo
 * de x); el rodillo queda atravesado al recorrido. Estas funciones miran un punto en sus coordenadas propias:
 * `along` en el sentido del recorrido y `across` a lo largo del rodillo.
 */
export function moverLocal(m, x, z) {
  const a = m.angle ?? 0;
  const dx = x - m.x;
  const dz = z - m.z;
  return { along: dx * Math.cos(a) + dz * Math.sin(a), across: -dx * Math.sin(a) + dz * Math.cos(a) };
}

/** ¿Pilla el rodillo un círculo de radio r en (x, z)? */
export function moverHits(m, x, z, r) {
  const { along, across } = moverLocal(m, x, z);
  return Math.abs(along) < m.radius + r * 0.7 && Math.abs(across) < m.halfLength + r * 0.5;
}

/** ¿Está el punto cerca de donde pasa el rodillo ahora mismo? (para que los bots no se metan delante) */
export function moverNear(m, x, z, alongMargin, acrossMargin) {
  const { along, across } = moverLocal(m, x, z);
  return Math.abs(along) < alongMargin && Math.abs(across) < m.halfLength + acrossMargin;
}

/** Hacia dónde empuja al aplastar: el sentido en que va. */
export const moverPushAngle = (m) => (m.angle ?? 0) + ((m.forward ?? m.x >= m.lastX) ? 0 : Math.PI);

/** Ida y vuelta con pausa en cada extremo y arranque/frenada suaves: 0 en el inicio, 1 en el final. */
export function moverProgress(m, now) {
  const cycle = m.periodMs + m.pauseMs * 2;
  const t = (now % cycle) / cycle;
  const travel = m.periodMs / 2 / cycle;
  const pause = m.pauseMs / cycle;
  let k;
  if (t < travel) k = t / travel;
  else if (t < travel + pause) k = 1;
  else if (t < travel * 2 + pause) k = 1 - (t - travel - pause) / travel;
  else k = 0;
  return k * k * (3 - 2 * k);
}
