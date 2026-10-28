import { IaFigure, hasIaModel } from './IaFigure.js';

/**
 * Figura de un personaje: su modelo 3D (public/models/ia/<id>.glb). Si el suyo no ha cargado, se usa el de
 * la muñeca para que la partida no se rompa.
 */
export function makeFigure(figureId, ringColor, scale = 1) {
  return new IaFigure(hasIaModel(figureId) ? figureId : 'muneca', ringColor, scale);
}
