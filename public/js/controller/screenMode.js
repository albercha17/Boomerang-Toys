/**
 * Pantalla completa y bloqueo del zoom en el mando.
 *
 * - Android / Chrome: al primer toque se pide pantalla completa y orientación horizontal
 *   (el navegador solo lo permite tras un gesto del usuario). Si se sale, el siguiente toque la recupera.
 * - iPhone / Safari: Apple no permite pantalla completa a una web; sí al abrirla desde un icono
 *   de la pantalla de inicio (manifest + metas de controller.html). Se muestra un aviso explicándolo.
 * - Zoom: se bloquean el doble toque, el pellizco y el zoom con dos dedos.
 */
const HINT_KEY = 'bumeran.iosHintClosed';
const DOUBLE_TAP_MS = 350;

const root = document.documentElement;
const requestFullscreen = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root);
const fullscreenElement = () => document.fullscreenElement ?? document.webkitFullscreenElement;
const exitFullscreen = () => (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document);

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;

async function enterFullscreen() {
  if (!requestFullscreen || fullscreenElement() || isStandalone()) return;
  try {
    await requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape');
  } catch { /* sin permiso o sin soporte: se sigue jugando en la ventana normal */ }
}

export function setupScreenMode({ fullscreenButton, iosHint, iosHintClose }) {
  // Pantalla completa automática al tocar (touchend/click sí cuentan como gesto del usuario).
  document.addEventListener('touchend', enterFullscreen, { capture: true, passive: true });
  document.addEventListener('click', enterFullscreen, { capture: true });

  if (requestFullscreen && !isStandalone()) {
    fullscreenButton.hidden = false;
    fullscreenButton.addEventListener('click', (event) => {
      event.stopPropagation(); // que el listener automático no la vuelva a abrir al salir
      if (fullscreenElement()) exitFullscreen();
      else enterFullscreen();
    });
  }

  // iPhone en Safari normal: explicar cómo abrirlo a pantalla completa.
  let hintClosed = false;
  try { hintClosed = localStorage.getItem(HINT_KEY) === '1'; } catch { /* sin almacenamiento */ }
  if (isIOS && !isStandalone() && !requestFullscreen && !hintClosed) iosHint.hidden = false;
  iosHintClose.addEventListener('click', () => {
    iosHint.hidden = true;
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* sin almacenamiento */ }
  });

  blockZoom();
}

function blockZoom() {
  // Doble toque: se anula el segundo toque si llega muy seguido (los joysticks usan pointer events y no se ven afectados).
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (event) => {
    const now = event.timeStamp;
    if (now - lastTouchEnd < DOUBLE_TAP_MS && event.cancelable) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false });

  // Pellizco: Safari usa eventos gesture*; el resto, touchmove con varios dedos y escala distinta de 1.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }
  document.addEventListener('touchmove', (event) => {
    if (event.scale !== undefined && event.scale !== 1 && event.cancelable) event.preventDefault();
  }, { passive: false });
  document.addEventListener('contextmenu', (event) => event.preventDefault());
}
