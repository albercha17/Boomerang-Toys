import { PlayerStore } from './PlayerStore.js';
import { GameNetwork } from './GameNetwork.js';
import { BootScene } from './scenes/BootScene.js';
import { ArenaScene } from './scenes/ArenaScene.js';
import { HudScene } from './scenes/HudScene.js';

const store = new PlayerStore();
const network = new GameNetwork(store);

// Añade ?debug a la dirección para ver los cuerpos físicos.
const debug = new URLSearchParams(location.search).has('debug');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#2a1d14',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug },
  },
  // El orden define el dibujo: el marcador (hud) queda encima de la arena.
  scene: [new BootScene(), new ArenaScene(store, network), new HudScene(store)],
});

window.game = game; // útil para depurar desde la consola del navegador
