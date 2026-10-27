import { MODELS } from '../render/models.js';
import { TOYS } from '../content/toys.js';
import { BlockyFigure } from './BlockyFigure.js';
import { ToyFigure } from './ToyFigure.js';

/** Figura de un personaje: el muñeco 3D animado si su modelo está cargado; si no, el hecho por código. */
export function makeFigure(figureId, ringColor, scale = 1) {
  const look = TOYS[figureId];
  return look && MODELS[look.base] ? new BlockyFigure(look, ringColor, scale) : new ToyFigure(figureId, ringColor, scale);
}
