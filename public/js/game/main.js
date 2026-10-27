import { PlayerStore } from './PlayerStore.js';
import { GameNetwork } from './GameNetwork.js';
import { Stage } from './render/Stage.js';
import { ArenaGame } from './ArenaGame.js';
import { Hud } from './ui/Hud.js';
import { readArenaConfig } from './arena/presets.js';

const store = new PlayerStore();
const network = new GameNetwork(store);
const stage = new Stage(document.getElementById('game'));
// Tamaño, densidad y semilla de la arena desde la dirección: /?mapa=grande&semilla=42 (ver arena/presets.js)
const game = new ArenaGame(store, network, stage, readArenaConfig(location.search));
const hud = new Hud(store, game);

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 50) / 1000; // evita saltos enormes si la pestaña estuvo en segundo plano
  last = now;
  game.update(now, dt);
  hud.update();
  stage.render(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.game = game; // útil para depurar desde la consola del navegador
