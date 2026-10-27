/**
 * Texturas provisionales dibujadas por código (no hay archivos de imagen todavía).
 * Las piezas que llevan el color del jugador se dibujan en blanco y gris para teñirlas con setTint().
 */
const WOOD = 0xf0c991;
const WOOD_DARK = 0xb8894f;
const INK = 0x2a1d14;

export function createToyTextures(scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const make = (key, width, height, draw) => {
    g.clear();
    draw(g);
    g.generateTexture(key, width, height);
  };

  // Personaje visto desde arriba, mirando hacia +x (derecha).
  make('toy-head', 28, 28, (g) => {
    g.fillStyle(WOOD).fillCircle(14, 14, 13);
    g.lineStyle(2, WOOD_DARK).strokeCircle(14, 14, 12);
    g.fillStyle(0xffffff, 0.45).fillCircle(9, 9, 4);
    g.fillStyle(INK).fillCircle(20, 9, 2.4).fillCircle(20, 19, 2.4);
    g.fillStyle(0xd9a066).fillCircle(24, 14, 2.2);
  });
  make('toy-torso', 22, 36, (g) => {
    g.fillStyle(0xffffff).fillRoundedRect(1, 1, 20, 34, 8);
    g.fillStyle(0x000000, 0.14).fillRoundedRect(1, 1, 7, 34, { tl: 8, bl: 8, tr: 0, br: 0 });
    g.lineStyle(2, 0x9a9a9a).strokeRoundedRect(1, 1, 20, 34, 8);
  });
  make('toy-arm', 14, 14, (g) => {
    g.fillStyle(0xffffff).fillCircle(7, 7, 6);
    g.lineStyle(2, 0x9a9a9a).strokeCircle(7, 7, 5.5);
  });
  make('toy-leg', 16, 10, (g) => {
    g.fillStyle(0xdedede).fillRoundedRect(1, 1, 14, 8, 4);
    g.lineStyle(2, 0x8a8a8a).strokeRoundedRect(1, 1, 14, 8, 4);
  });
  make('shadow', 44, 24, (g) => {
    g.fillStyle(0x000000, 0.25).fillEllipse(22, 12, 40, 20);
  });

  // Búmerang en V, centrado para que gire sobre sí mismo.
  make('boomerang', 40, 40, (g) => {
    const pts = [[7, 30], [20, 11], [33, 30]];
    g.lineStyle(10, 0x8a8a8a);
    g.lineBetween(...pts[0], ...pts[1]).lineBetween(...pts[1], ...pts[2]);
    g.fillStyle(0x8a8a8a);
    pts.forEach(([x, y]) => g.fillCircle(x, y, 5));
    g.lineStyle(6, 0xffffff);
    g.lineBetween(...pts[0], ...pts[1]).lineBetween(...pts[1], ...pts[2]);
    g.fillStyle(0xffffff);
    pts.forEach(([x, y]) => g.fillCircle(x, y, 3));
  });

  // Bloque de construcción con tetones.
  make('block', 48, 48, (g) => {
    g.fillStyle(0x000000, 0.3).fillRoundedRect(1, 5, 46, 43, 8);
    g.fillStyle(0xffffff).fillRoundedRect(1, 1, 46, 43, 8);
    g.lineStyle(2, 0xa8a8a8).strokeRoundedRect(1, 1, 46, 43, 8);
    for (const [x, y] of [[14, 13], [34, 13], [14, 31], [34, 31]]) {
      g.fillStyle(0xbdbdbd).fillCircle(x, y + 1, 6);
      g.fillStyle(0xf2f2f2).fillCircle(x, y, 6);
    }
  });

  // Suelo: tablero de listones de madera.
  make('floor', 96, 96, (g) => {
    g.fillStyle(0xd3ad7f).fillRect(0, 0, 96, 96);
    for (let y = 0; y < 96; y += 24) {
      g.fillStyle(y % 48 ? 0xcaa375 : 0xd8b385).fillRect(0, y, 96, 23);
      g.fillStyle(0x9c7a52, 0.6).fillRect(0, y + 23, 96, 1);
      g.fillStyle(0x9c7a52, 0.5).fillRect((y * 7) % 96, y, 1, 23);
    }
    g.lineStyle(1, 0xb8915f, 0.35);
    g.lineBetween(8, 7, 40, 9).lineBetween(55, 33, 90, 31).lineBetween(20, 58, 62, 60).lineBetween(48, 82, 85, 84);
  });

  make('spark', 10, 10, (g) => {
    g.fillStyle(0xffffff).fillCircle(5, 5, 5);
  });

  g.destroy();
}
