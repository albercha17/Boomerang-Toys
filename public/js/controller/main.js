import { Joystick } from './Joystick.js';
import { ActionButton } from './ActionButton.js';
import { InputSender } from './InputSender.js';

const { ROLES, EVENTS, REASONS, FEEDBACK } = window.Protocol;

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
  actionBtn: document.getElementById('action-btn'),
  actionLabel: document.getElementById('action-label'),
  actionHint: document.getElementById('action-hint'),
};

const DEFAULT_HINT = 'toca: golpe<br>mantén y suelta: lanzar';
let lastFeedback = null;

/** Refleja en el botón el estado del personaje (vivo, con o sin búmerang). */
function showFeedback(flags) {
  const alive = (flags & FEEDBACK.ALIVE) !== 0;
  const armed = (flags & FEEDBACK.ARMED) !== 0;
  const wasAlive = lastFeedback === null || (lastFeedback & FEEDBACK.ALIVE) !== 0;
  if (wasAlive && !alive && navigator.vibrate) navigator.vibrate([90, 50, 160]);
  lastFeedback = flags;

  ui.actionBtn.classList.toggle('ko', !alive);
  ui.actionBtn.classList.toggle('unarmed', alive && !armed);
  ui.actionLabel.textContent = !alive ? 'K.O.' : armed ? 'LANZAR' : 'SIN BÚMERANG';
  ui.actionHint.innerHTML = !alive ? 'reapareces en un momento' : armed ? DEFAULT_HINT : 'pasa por encima<br>de uno para cogerlo';
}

function resetFeedback() {
  lastFeedback = null;
  ui.actionBtn.classList.remove('ko', 'unarmed');
  ui.actionLabel.textContent = 'ACCIÓN';
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

const actionButton = new ActionButton(document.getElementById('action-btn'), (pressed) => sender.setAction(pressed));

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
  actionButton.release();
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
    actionButton.release();
    sender.reset();
  }
});

const root = document.documentElement;
if (root.requestFullscreen) {
  ui.fullscreen.hidden = false;
  ui.fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await root.requestFullscreen();
        await screen.orientation?.lock?.('landscape');
      }
    } catch { /* el navegador puede no permitir bloquear la orientación */ }
  });
}
