import { MODELS } from '../render/models.js';
import { TOYS } from '../content/toys.js';
import { BlockyFigure } from './BlockyFigure.js';
import { IaFigure, hasIaModel } from './IaFigure.js';
import { ToyFigure } from './ToyFigure.js';

/**
 * Figura de un personaje, de mejor a peor: el muñeco 3D sacado de su dibujo (IA), el muñeco de bloques
 * animado y, si nada ha cargado, el hecho por código.
 */
export function makeFigure(figureId, ringColor, scale = 1) {
  if (hasIaModel(figureId)) return new IaFigure(figureId, ringColor, scale);
  const look = TOYS[figureId];
  return look && MODELS[look.base] ? new BlockyFigure(look, ringColor, scale) : new ToyFigure(figureId, ringColor, scale);
}
