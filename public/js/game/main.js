import { PlayerStore } from './PlayerStore.js';
import { GameNetwork } from './GameNetwork.js';
import { ConnectionScene } from './ConnectionScene.js';

const store = new PlayerStore();
new GameNetwork(store);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#2a1d14',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  scene: [new ConnectionScene(store)],
});
