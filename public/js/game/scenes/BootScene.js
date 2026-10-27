import { createToyTextures } from '../textures/ToyTextures.js';

/** Prepara los recursos y arranca la arena con el marcador encima. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    createToyTextures(this);
    this.scene.launch('hud');
    this.scene.start('arena');
  }
}
