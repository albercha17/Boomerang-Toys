const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const config = require('./server/config');
const { getLanAddresses } = require('./server/network');
const { PlayerManager } = require('./server/PlayerManager');
const { registerSocketHandlers } = require('./server/socketHandlers');

const CONTROLLER_PATH = '/mando';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 5000,
  pingTimeout: 5000,
  maxHttpBufferSize: 10000, // los mensajes del juego son diminutos
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'phaser', 'dist')));
app.get(CONTROLLER_PATH, (req, res) => res.sendFile(path.join(__dirname, 'public', 'controller.html')));

const addresses = getLanAddresses();
const serverInfo = {
  port: config.PORT,
  controllerPath: CONTROLLER_PATH,
  addresses: addresses.map(({ address, name, likely }) => ({ address, name, likely })),
  maxPlayers: config.MAX_PLAYERS,
};

const players = new PlayerManager({
  maxPlayers: config.MAX_PLAYERS,
  reconnectGraceMs: config.RECONNECT_GRACE_MS,
  inputStaleMs: config.INPUT_STALE_MS,
  maxInputsPerSecond: config.MAX_INPUTS_PER_SECOND,
});
registerSocketHandlers(io, players, config, serverInfo);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${config.PORT} está ocupado. Prueba otro: npm start -- --port 4000`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(config.PORT, config.HOST, () => {
  console.log('\n  Bumerán de Juguete · servidor listo\n');
  console.log(`  Pantalla de juego (este ordenador): http://localhost:${config.PORT}/`);
  if (addresses.length === 0) {
    console.log('  No se ha encontrado ninguna IP de red local. ¿Está conectado el Wi-Fi?');
  }
  for (const { address, name, likely } of addresses) {
    const note = likely ? '' : '   (adaptador virtual, probablemente no sirve)';
    console.log(`  Mando en el móvil [${name}]: http://${address}:${config.PORT}${CONTROLLER_PATH}${note}`);
  }
  console.log('');
});
