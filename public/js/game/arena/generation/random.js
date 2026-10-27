/** Mezcla varios enteros en una semilla de 32 bits (FNV-1a). Sirve para derivar semillas por zona. */
export function hashSeed(...values) {
  let h = 2166136261;
  for (const value of values) {
    let v = value | 0;
    for (let i = 0; i < 4; i++) {
      h ^= v & 0xff;
      h = Math.imul(h, 16777619);
      v >>>= 8;
    }
  }
  return h >>> 0;
}

/**
 * Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da siempre el mismo mapa.
 */
export function createRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, maxExclusive) => min + Math.floor(next() * (maxExclusive - min)),
    pick: (items) => items[Math.floor(next() * items.length)],
    /** Elige un elemento según su campo `weight`. */
    weighted: (items) => {
      const total = items.reduce((sum, item) => sum + item.weight, 0);
      let roll = next() * total;
      for (const item of items) {
        roll -= item.weight;
        if (roll < 0) return item;
      }
      return items[items.length - 1];
    },
  };
}
