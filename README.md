# Bumerán de Juguete

Juego multijugador local para navegador inspirado en Boomerang Fu. El ordenador muestra la partida y cada móvil hace de mando (sin instalar nada).

**Estado: Fase 1** — infraestructura y conexión de mandos. Todavía no hay combate ni físicas.

## Requisitos

- Node.js 18 o superior.
- Ordenador y móviles en la misma red Wi-Fi.

## Instalar y ejecutar

```bash
npm install
npm start                  # puerto 3000
npm start -- --port 4000   # otro puerto
```

También vale la variable de entorno: `PORT=4000 npm start` (bash) o `$env:PORT=4000; npm start` (PowerShell).
Opcional: `--max-players 4` (de 1 a 8, por defecto 8).

Al arrancar, la consola muestra las direcciones:

```
Pantalla de juego (este ordenador): http://localhost:3000/
Mando en el móvil [Wi-Fi]: http://192.168.1.187:3000/mando
```

## Cómo jugar / probar

1. Abre `http://localhost:3000/` en el ordenador (mejor a pantalla completa con F11).
2. En cada móvil, abre la dirección `http://<IP-del-ordenador>:<puerto>/mando` que aparece en grande en la pantalla.
3. Cada móvil recibe un número y un color. En la pantalla verás su tarjeta:
   - el punto del joystick se mueve con el dedo en tiempo real;
   - el botón **A** se ilumina al pulsar ACCIÓN y suma el contador de pulsaciones;
   - estado: *Conectado*, *Sin señal del mando* o *Desconectado (esperando…)*; y la latencia en ms.
4. Recarga un móvil o apágale la pantalla: conserva su plaza y color durante 60 s.

Mejor jugar con el móvil en horizontal; el botón ⛶ pone el mando a pantalla completa (en Android).

### Si el móvil no conecta

- Comprueba que está en la misma Wi-Fi (no en datos móviles ni en una red de invitados).
- **Firewall de Windows**: la primera vez que se ejecuta Node, acepta el aviso en *Redes privadas*. Si lo cerraste, permite `node.exe` en *Firewall de Windows Defender → Permitir una aplicación*, o marca la red Wi-Fi como privada.
- Si aparecen varias IPs, usa la del adaptador Wi-Fi. Las de VirtualBox (`192.168.56.x`), WSL o Docker no sirven y se marcan como tal.

## Estructura

```
server.js                 Arranque: Express (archivos estáticos) + Socket.io
server/config.js          Puerto, límites y tiempos
server/network.js         Detección de IPs locales
server/PlayerManager.js   Estado autoritativo: plazas, tokens, reconexión, validación de entradas
server/socketHandlers.js  Roles de socket, eventos y bucle de envío (20 Hz)
shared/protocol.js        Protocolo común (Node y navegador)
public/index.html         Pantalla del juego (Phaser)
public/js/game/           Red, almacén de estado y escena de Phaser
public/controller.html    Mando móvil (también en /mando)
public/js/controller/     Joystick, botón y envío de entradas
```

## Protocolo Socket.io

El rol se indica al conectar: `io({ auth: { role: 'screen' } })` o `io({ auth: { role: 'controller', token } })`.

| Evento | Sentido | Contenido |
|---|---|---|
| `c:input` | mando → servidor | `[seq, x, y, botones]` — ejes enteros −100..100, botones como máscara de bits (1 = acción) |
| `c:ping` | mando → servidor | `(últimoRttMs, ack)` cada 2 s |
| `s:welcome` | servidor → mando | `{ id, number, name, color, token }` |
| `s:rejected` | servidor → mando | `{ reason: 'full' }` |
| `s:kicked` | servidor → mando | `{ reason: 'replaced' }` (mismo jugador abierto en otra pestaña) |
| `s:screenInit` | servidor → pantalla | `{ server, roster, state }` al conectar |
| `s:roster` | servidor → pantalla | lista de jugadores (al entrar/salir; latencia como mucho 1/s) |
| `s:state` | servidor → pantalla | `{ t, p: [[id, x, y, botones, pulsaciones, obsoleto]] }`, a 20 Hz y solo si hay cambios |

Reglas:

- El mando envía al momento los cambios de botón, el joystick a 30 Hz como máximo y una señal de vida cada 500 ms.
- El servidor valida cada paquete (formato, rango, vector limitado al círculo unidad, secuencia creciente y un máximo de 60 paquetes/s).
- Si un mando no envía nada en 1,5 s, su entrada pasa a neutro y se marca *obsoleta*.
- Las pulsaciones se cuentan en el servidor, así que un toque muy corto no se pierde entre dos envíos.
- Un jugador desconectado conserva la plaza 60 s; al volver con su token (guardado en `sessionStorage` de la pestaña) recupera id, número y color.

## Limitaciones conocidas (Fase 1)

- Sin HTTPS en la red local: no hay bloqueo de pantalla encendida (Wake Lock) y en iPhone no existe pantalla completa para páginas web.
- Los jugadores se llaman «Jugador N» y el color depende de la plaza. Elegir nombre y color llegará con el lobby (Fase 4).
- El token vive en la pestaña: si se cierra la pestaña (no solo recargarla), el móvil entra como jugador nuevo y la plaza antigua se libera a los 60 s.
- No hay código QR; la dirección se escribe a mano.
- Todo el estado está en memoria: reiniciar el servidor desconecta a todos (los mandos se reconectan solos como jugadores nuevos).
