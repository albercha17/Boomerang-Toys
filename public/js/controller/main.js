import { Joystick } from './Joystick.js';
import { ActionButton } from './ActionButton.js';
import { InputSender } from './InputSender.js';
import { setupScreenMode } from './screenMode.js';

const { ROLES, EVENTS, REASONS, FEEDBACK, BUTTONS } = window.Protocol;

const TOKEN_KEY = 'bumeran.playerToken';
const PING_INTERVAL_MS = 2000;

const ui = {
  swatch: document.getElementById('swatch'),
  name: document.getElementById('player-name'),
  status: document.getElementById('status'),
  ping: document.getElementById('ping'),
  fullscreen: document.getElementById('fullscreen-btn'),
  overlay: document.getElementById('overlay'),
  overlayText: document.getElementById('overlay-text'),
  overlayBtn: document.getElementById('overlay-btn'),
  aimStick: document.getElementById('aim-stick'),
  actionLabel: document.getElementById('action-label'),
  actionHint: document.getElementById('action-hint'),
};

const DEFAULT_HINT = 'arrastra y suelta: lanzar · toca: cuchillada';
let lastFeedback = null;

/** Refleja en el joystick de ataque el estado del personaje (vivo, con o sin búmerang). */
function showFeedback(flags) {
  const alive = (flags & FEEDBACK.ALIVE) !== 0;
  const armed = (flags & FEEDBACK.ARMED) !== 0;
  const wasAlive = lastFeedback === null || (lastFeedback & FEEDBACK.ALIVE) !== 0;
  if (wasAlive && !alive && navigator.vibrate) navigator.vibrate([90, 50, 160]);
  lastFeedback = flags;

  ui.aimStick.classList.toggle('ko', !alive);
  ui.aimStick.classList.toggle('unarmed', alive && !armed);
  const inMatch = (flags & FEEDBACK.IN_MATCH) !== 0;
  const deadLabel = inMatch ? 'ELIMINADO' : 'K.O.';
  const deadHint = inMatch ? 'espera a la siguiente ronda' : 'reapareces en un momento';
  ui.actionLabel.textContent = !alive ? deadLabel : armed ? 'LANZAR' : 'SIN BÚMERANG';
  ui.actionHint.innerHTML = !alive ? deadHint : armed ? DEFAULT_HINT : 'pasa por encima de uno para cogerlo';
}

function resetFeedback() {
  lastFeedback = null;
  ui.aimStick.classList.remove('ko', 'unarmed');
  ui.actionLabel.textContent = 'LANZAR';
  ui.actionHint.innerHTML = DEFAULT_HINT;
}

// sessionStorage: sobrevive a recargar la pestaña, pero cada pestaña es un jugador distinto.
function readToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function saveToken(token) {
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* modo privado: sin reconexión tras recargar */ }
}

function setStatus(state, text) {
  ui.status.dataset.state = state;
  ui.status.textContent = text;
}

function showOverlay(text, buttonText, onClick) {
  ui.overlayText.textContent = text;
  ui.overlayBtn.textContent = buttonText;
  ui.overlayBtn.onclick = onClick;
  ui.overlay.hidden = false;
}

const socket = io({
  auth: { role: ROLES.CONTROLLER, token: readToken() },
  transports: ['websocket', 'polling'],
});

const sender = new InputSender(socket, EVENTS.INPUT);

const joystick = new Joystick({
  zone: document.getElementById('stick-zone'),
  base: document.getElementById('stick-base'),
  knob: document.getElementById('stick-knob'),
  onChange: (x, y) => sender.setMove(x, y),
});

// Joystick de ataque (fijo, a la derecha): arrastrar apunta, soltar lanza; un toque es una cuchillada.
const aimStick = new Joystick({
  zone: ui.aimStick,
  base: document.getElementById('aim-base'),
  knob: document.getElementById('aim-knob'),
  floating: false,
  radius: 70, // recorrido acorde al joystick de ataque, más grande
  deadZone: 0.2,
  onChange: (x, y) => sender.setAim(x, y),
  onPress: (pressed) => {
    if (pressed && navigator.vibrate) navigator.vibrate(10);
    sender.setButton(BUTTONS.ACTION, pressed);
  },
});

const dashButton = new ActionButton(document.getElementById('dash-btn'), (pressed) => sender.setButton(BUTTONS.DASH, pressed));

socket.on(EVENTS.WELCOME, (player) => {
  saveToken(player.token);
  socket.auth.token = player.token; // se reutiliza en las reconexiones automáticas
  document.documentElement.style.setProperty('--player-color', player.color);
  ui.name.textContent = player.name;
  ui.overlay.hidden = true;
  setStatus('connected', 'Conectado');
  resetFeedback(); // si el servidor conoce el estado, llega justo después
  sender.start();
});

socket.on(EVENTS.FEEDBACK, (flags) => {
  if (Number.isInteger(flags)) showFeedback(flags);
});

socket.on(EVENTS.REJECTED, ({ reason }) => {
  const text = reason === REASONS.FULL ? 'La partida está llena.' : 'El servidor ha rechazado la conexión.';
  showOverlay(text, 'Reintentar', () => {
    ui.overlay.hidden = true;
    socket.connect();
  });
});

socket.on(EVENTS.KICKED, ({ reason }) => {
  const text = reason === REASONS.REPLACED
    ? 'Este jugador se ha abierto en otra pestaña o dispositivo.'
    : 'El servidor ha cerrado este mando.';
  showOverlay(text, 'Recuperar el control aquí', () => {
    ui.overlay.hidden = true;
    socket.connect();
  });
});

socket.on('connect', () => setStatus('connecting', 'Uniéndose…'));

socket.on('disconnect', (reason) => {
  sender.stop();
  joystick.release();
  aimStick.release();
  dashButton.release();
  ui.ping.textContent = '';
  // Si lo desconecta el servidor (rechazo/expulsión), Socket.io no reintenta solo.
  setStatus('offline', reason === 'io server disconnect' ? 'Desconectado' : 'Reconectando…');
});

// Latencia medida en el mando; el último valor se envía al servidor para mostrarlo en pantalla.
let lastRtt = null;
setInterval(() => {
  if (!socket.connected) return;
  const sentAt = performance.now();
  socket.timeout(3000).emit(EVENTS.PING, lastRtt, (error) => {
    if (error) return;
    lastRtt = Math.round(performance.now() - sentAt);
    ui.ping.textContent = `${lastRtt} ms`;
  });
}, PING_INTERVAL_MS);

// Al bloquear el móvil o cambiar de app, el mando queda en neutro.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    joystick.release();
    aimStick.release();
    dashButton.release();
    sender.reset();
  }
});

setupScreenMode({
  fullscreenButton: ui.fullscreen,
  iosHint: document.getElementById('ios-hint'),
  iosHintClose: document.getElementById('ios-hint-close'),
});
