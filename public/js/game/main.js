import { PlayerStore } from './PlayerStore.js';
import { GameNetwork } from './GameNetwork.js';
import { Stage } from './render/Stage.js';
import { ArenaGame } from './ArenaGame.js';
import { Match } from './match/Match.js';
import { Hud } from './ui/Hud.js';
import { MatchOverlay } from './ui/MatchOverlay.js';
import { readArenaConfig } from './arena/presets.js';
import { loadArt } from './render/art.js';
import { loadModels } from './render/models.js';
import { TOY_BASES, TOYS } from './content/toys.js';
import { loadIaModels } from './entities/IaFigure.js';
import { loadFurniture } from './render/furniture.js';
import { FURNITURE_NAMES } from './arena/themes.js';
import { ROOM_MODELS } from './arena/generation/rooms.js';
import { HANDMADE_MAPS } from './arena/maps/handmade.js';

const WALL_MODELS = ['wall', 'wallWindow', 'wallWindowSlide', 'fence_planks', 'tree_oak', 'tree_default'];
// Modelos de los mapas hechos a mano (bloques, matorrales, sueltos y lo que se mueve)
const MAP_MODELS = HANDMADE_MAPS.flatMap((m) => [...m.blocks, ...(m.props ?? []), m.bush, ...(m.movers ?? []).map((v) => v.model)])
  .filter((name) => name && name !== 'patito');
MAP_MODELS.push('chair', 'plant_bushDetailed');

// Muñecos 3D animados, muebles de cada zona y suelos ilustrados; lo que falte se dibuja por código.
await Promise.all([loadArt(), loadModels(TOY_BASES), loadFurniture([...FURNITURE_NAMES, ...ROOM_MODELS, ...WALL_MODELS, ...MAP_MODELS]), loadIaModels(Object.keys(TOYS))]);

// Puntos para ganar la partida: 10 por defecto, o /?puntos=3 para partidas cortas (1 a 50).
const params = new URLSearchParams(location.search);
const targetScore = Math.min(50, Math.max(1, Math.round(Number(params.get('puntos'))) || 10));

const store = new PlayerStore();
const network = new GameNetwork(store);
const stage = new Stage(document.getElementById('game'));
// Tamaño, densidad y semilla de la arena desde la dirección: /?mapa=grande&semilla=42 (ver arena/presets.js)
const game = new ArenaGame(store, network, stage, readArenaConfig(location.search));
const match = new Match(game, { targetScore });
const hud = new Hud(store, game, match);
const overlay = new MatchOverlay(document.getElementById('match-overlay'), match);

// La fase (sala o partida) se avisa a los móviles: en la sala se puede cambiar de personaje.
let phaseSent = '';
function reportPhase() {
  const phase = match.phase === 'lobby' ? 'lobby' : 'match';
  const key = `${phase}:${store.serverInfoVersion}`;
  if (!store.serverConnected || key === phaseSent) return;
  phaseSent = key;
  network.sendPhase(phase);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 50) / 1000; // evita saltos enormes si la pestaña estuvo en segundo plano
  last = now;
  match.update(now);
  reportPhase();
  if (!match.paused) game.update(now, dt);
  hud.update();
  overlay.update(now);
  stage.render(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Útil para depurar desde la consola del navegador.
window.game = game;
window.match = match;
