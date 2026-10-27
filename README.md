# Bumerán de Juguete

Juego multijugador local para navegador inspirado en Boomerang Fu. El ordenador muestra la partida y cada móvil hace de mando (sin instalar nada).

**Estado: Fase 2** — movimiento, búmerangs, golpes y personajes que se desmontan en piezas. Aún no hay rondas ni puntuación (Fase 4) y la arena es fija (Fase 3).

## Requisitos

- Node.js 18 o superior.
- Ordenador y móviles en la misma red Wi-Fi.

## Instalar y ejecutar

Lo más fácil en Windows: doble clic en **`Iniciar juego.bat`** (instala lo necesario la primera vez, arranca el servidor y abre el juego en el navegador).

Desde una terminal:

```bash
npm install
npm start                  # puerto 3000
npm start -- --port 4000   # otro puerto
```

También vale la variable de entorno: `PORT=4000 npm start` (bash) o `$env:PORT=4000; npm start` (PowerShell).
Opcional: `--max-players 4` (de 1 a 8, por defecto 8).

## Cómo jugar

1. Abre `http://localhost:3000/` en el ordenador (mejor a pantalla completa con F11).
2. En cada móvil, abre la dirección que aparece arriba a la derecha (`http://<IP-del-ordenador>:3000/mando`).
3. Cada jugador aparece en la arena con su color y su búmerang en la mano.

| En el mando | Qué hace |
|---|---|
| Joystick | Moverse y apuntar |
| **Toque** corto en el botón | Golpe cuerpo a cuerpo con el búmerang en la mano |
| **Mantener** el botón | Cargar el lanzamiento: te mueves más despacio y aparece la flecha de puntería |
| **Soltar** | Lanzar. Cuanto más cargues, más lejos llega |

- El búmerang sale, frena, vuelve hacia ti y rebota en los bloques. Recógelo pasando por encima cuando vuelve.
- Cualquier búmerang en vuelo (o un golpe) elimina al instante: el muñeco se desmonta en piezas que salen despedidas y se pueden empujar.
- Si muere su dueño, el búmerang cae al suelo; quien no tenga arma puede cogerlo.
- A los 2,5 s reapareces lejos de los demás, con 1,2 s de invulnerabilidad (parpadeas).
- El botón del móvil muestra tu estado: **LANZAR**, **SIN BÚMERANG** o **K.O.** (y vibra al morir).

Añade `?debug` a la dirección de la pantalla (`http://localhost:3000/?debug`) para ver los cuerpos físicos.

### Si el móvil no conecta

- Comprueba que está en la misma Wi-Fi (no en datos móviles ni en una red de invitados).
- **Firewall de Windows**: la primera vez que se ejecuta Node, acepta el aviso. Si lo cerraste, permite `node.exe` en *Firewall de Windows Defender → Permitir una aplicación*.
- Si aparecen varias IPs, usa la del adaptador Wi-Fi. Las de VirtualBox (`192.168.56.x`), WSL o Docker no sirven y se marcan como tal.

## Arquitectura

- **Servidor** (Node + Express + Socket.io): autoridad sobre jugadores, plazas, reconexiones y entradas (las valida y las reparte a 20 Hz).
- **Pantalla anfitriona** (Phaser 3, físicas Arcade cenitales): ejecuta la simulación del combate con las entradas validadas. La primera pantalla conectada es la anfitriona; solo sus avisos llegan a los mandos.
- **Mandos**: envían entradas compactas y muestran el estado que reenvía el servidor.

```
server.js                      Arranque: Express (archivos estáticos) + Socket.io
server/config.js               Puerto, límites y tiempos
server/network.js              Detección de IPs locales
server/PlayerManager.js        Estado autoritativo: plazas, tokens, reconexión, validación de entradas
server/socketHandlers.js       Roles de socket, eventos y bucle de envío (20 Hz)
shared/protocol.js             Protocolo común (Node y navegador)
public/index.html              Pantalla del juego
public/js/game/main.js         Configuración de Phaser y físicas
public/js/game/GameNetwork.js  Conexión de la pantalla
public/js/game/PlayerStore.js  Copia local de jugadores y entradas
public/js/game/scenes/         BootScene (texturas), ArenaScene (juego), HudScene (barra superior)
public/js/game/content/        Catálogos de personajes y armas (aquí se añaden nuevos)
public/js/game/entities/       Character, ToyFigure (aspecto por piezas), Boomerang
public/js/game/effects/        DebrisSystem: piezas desmontadas, chispas, golpes
public/js/game/input/          ButtonGesture: toque / mantener / soltar
public/js/game/arena/          TestArena: arena fija (la sustituirá la Fase 3)
public/js/game/textures/       Texturas de juguete dibujadas por código
public/controller.html         Mando móvil (también en /mando)
public/js/controller/          Joystick, botón y envío de entradas
```

### Añadir personajes y armas

- **Personaje**: nueva entrada en `content/characters.js` (radio, velocidad, tiempos y arma inicial).
- **Arma**: nueva entrada en `content/weapons.js` y, si se comporta distinto, una clase con la misma interfaz que `Boomerang` (`attachTo`, `throw`, `dropAt`, `onWallHit`, `update`, `destroy`, `dangerous`, `catchable`), registrada en `WEAPON_CLASSES` de `ArenaScene.js`.

## Protocolo Socket.io

El rol se indica al conectar: `io({ auth: { role: 'screen' } })` o `io({ auth: { role: 'controller', token } })`.

| Evento | Sentido | Contenido |
|---|---|---|
| `c:input` | mando → servidor | `[seq, x, y, botones]`: ejes enteros −100..100, botones como máscara de bits (1 = acción) |
| `c:ping` | mando → servidor | `(últimoRttMs, ack)` cada 2 s |
| `g:feedback` | pantalla anfitriona → servidor | `[idJugador, estado]`: solo cuando cambia |
| `s:welcome` | servidor → mando | `{ id, number, name, color, token }` |
| `s:rejected` | servidor → mando | `{ reason: 'full' }` |
| `s:kicked` | servidor → mando | `{ reason: 'replaced' }` (mismo jugador abierto en otra pestaña) |
| `s:feedback` | servidor → mando | `estado`: máscara de bits, 1 = vivo, 2 = con arma |
| `s:screenInit` | servidor → pantalla | `{ server, roster, state }` al conectar |
| `s:roster` | servidor → pantalla | lista de jugadores (al entrar/salir; latencia como mucho 1/s) |
| `s:state` | servidor → pantalla | `{ t, p: [[id, x, y, botones, pulsaciones, obsoleto]] }`, a 20 Hz y solo si hay cambios |

Reglas:

- El mando envía al momento los cambios de botón, el joystick a 30 Hz como máximo y una señal de vida cada 500 ms.
- El servidor valida cada paquete (formato, rango, vector limitado al círculo unidad, secuencia creciente y un máximo de 60 paquetes/s).
- Si un mando no envía nada en 1,5 s, su entrada pasa a neutro y se marca *obsoleta*.
- Las pulsaciones se cuentan en el servidor, así que un toque muy corto no se pierde entre dos envíos.
- Un jugador desconectado conserva la plaza 60 s; al volver con su token recupera id, número, color y estado del botón.

## Limitaciones conocidas

- La simulación del combate corre en la pantalla anfitriona, no en el servidor. Si se abren dos pantallas, cada una simula su propia partida (solo la primera avisa a los mandos). La puntuación de la Fase 4 deberá guardarse en el servidor.
- Arena fija de pruebas; los puntos de aparición son fijos (la Fase 3 traerá generación procedural).
- Reaparición automática e infinita, sin rondas ni marcador (Fase 4).
- Un jugador desconectado sigue en la arena (semitransparente y quieto) hasta que caduca su plaza a los 60 s, y se le puede eliminar.
- El golpe cuerpo a cuerpo no desvía búmerangs ni atraviesa paredes con precisión: comprueba distancia y ángulo.
- Si el mando pierde la señal mientras carga, el lanzamiento se cancela.
- Sin HTTPS en la red local: no hay bloqueo de pantalla encendida (Wake Lock) y en iPhone no existe pantalla completa para páginas web. La vibración no funciona en iPhone.
- Todo el estado está en memoria: reiniciar el servidor desconecta a todos (los mandos se reconectan solos como jugadores nuevos).
