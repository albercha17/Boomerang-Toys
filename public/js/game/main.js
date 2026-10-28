import { PlayerStore } from './PlayerStore.js';
import { GameNetwork } from './GameNetwork.js';
import { Stage } from './render/Stage.js';
import { ArenaGame } from './ArenaGame.js';
import { Match } from './match/Match.js';
import { Hud } from './ui/Hud.js';
import { MatchOverlay } from './ui/MatchOverlay.js';
import { loadArt } from './render/art.js';
import { loadIaModels } from './entities/IaFigure.js';
import { loadFurniture } from './render/furniture.js';
import { HANDMADE_MAPS, readMapConfig, registerSceneMaps } from './arena/maps/handmade.js';
import { loadSceneMaps } from './arena/SceneMapBuilder.js';
import { loadBoomerangModels } from './render/boomerangModels.js';
import { loadBoxModels } from './render/boxModels.js';

// Modelos de los mapas dibujados en texto (bloques, matorrales, sueltos y lo que se mueve)
const MAP_MODELS = HANDMADE_MAPS.filter((m) => !m.scene)
  .flatMap((m) => [...m.blocks, ...(m.props ?? []), m.bush, ...(m.movers ?? []).map((v) => v.model)])
  .filter((name) => name && name !== 'patito');

// Personajes (sus modelos 3D), mapas (modelos y escenas horneadas) y suelos ilustrados.
const CHARACTER_IDS = window.CharacterCatalog.CHARACTERS.map((c) => c.id);
await Promise.all([loadArt(), loadFurniture(MAP_MODELS), loadIaModels(['muneca', ...CHARACTER_IDS]), loadSceneMaps().then(registerSceneMaps), loadBoomerangModels(), loadBoxModels()]);

// Puntos para ganar la partida: 10 por defecto, o /?puntos=3 para partidas cortas (1 a 50).
const params = new URLSearchParams(location.search);
const targetScore = Math.min(50, Math.max(1, Math.round(Number(params.get('puntos'))) || 10));

const store = new PlayerStore();
const network = new GameNetwork(store);
const stage = new Stage(document.getElementById('game'));
// Mapa: se van turnando; /?mapa=mesa juega siempre ese (ver arena/maps/handmade.js)
const game = new ArenaGame(store, network, stage, readMapConfig(location.search));
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
