import { ART } from '../render/art.js';
import { SpriteFigure } from './SpriteFigure.js';
import { ToyFigure } from './ToyFigure.js';

/** Figura de un personaje: la ilustración de ChatGPT si está generada; si no, el muñeco hecho por código. */
export function makeFigure(figureId, ringColor, scale = 1) {
  const texture = ART.characters[figureId];
  return texture ? new SpriteFigure(texture, ringColor, scale) : new ToyFigure(figureId, ringColor, scale);
}
