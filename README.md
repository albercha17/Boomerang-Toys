# Bumerán de Juguete

Juego multijugador local para navegador inspirado en Boomerang Fu. El ordenador muestra la partida y cada móvil hace de mando (sin instalar nada).

**Estado: Fase 2 en 3D**: movimiento, búmerangs, golpes y muñecos que se desmontan en piezas con física 3D, vistos con cámara cenital inclinada (como Boomerang Fu). Aún no hay rondas ni puntuación (Fase 4) y la arena es fija (Fase 3).

## Requisitos

- Node.js 18 o superior.
- Ordenador y móviles en la misma red Wi-Fi.

## Instalar y ejecutar

Lo más fácil en Windows: doble clic en **`Iniciar juego.bat`** (instala o actualiza lo necesario, arranca el servidor y abre el juego en el navegador).

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
| **Mantener** el botón | Cargar el lanzamiento: casi te quedas quieto y el joystick apunta al instante (flecha en el suelo) |
| **Soltar** | Lanzar hacia donde apunta la flecha. Cuanto más cargues, más lejos llega |

- El búmerang sale, frena, vuelve hacia ti y rebota en los bloques. Recógelo pasando por encima cuando vuelve.
- Cualquier búmerang en vuelo (o un golpe) elimina al instante: el muñeco se desmonta en cabeza, torso, brazos y piernas, que saltan, ruedan, pueden quedar encima de los bloques y se pueden empujar.
- Si muere su dueño, el búmerang cae al suelo; quien no tenga arma puede cogerlo.
- A los 2,5 s reapareces lejos de los demás, con 1,2 s de invulnerabilidad (parpadeas).
- El botón del móvil muestra tu estado: **LANZAR**, **SIN BÚMERANG** o **K.O.** (y vibra al morir).

En la consola del navegador de la pantalla, `game` da acceso a la partida para depurar (personajes, armas, piezas).

### Si el móvil no conecta

- Comprueba que está en la misma Wi-Fi (no en datos móviles ni en una red de invitados).
- **Firewall de Windows**: la primera vez que se ejecuta Node, acepta el aviso. Si lo cerraste, permite `node.exe` en *Firewall de Windows Defender → Permitir una aplicación*.
- Si aparecen varias IPs, usa la del adaptador Wi-Fi. Las de VirtualBox (`192.168.56.x`), WSL o Docker no sirven y se marcan como tal.

## Arquitectura

- **Servidor** (Node + Express + Socket.io): autoridad sobre jugadores, plazas, reconexiones y entradas (las valida y las reparte a 20 Hz).
- **Pantalla anfitriona** (Three.js para el 3D, cannon-es para las físicas): ejecuta la simulación del combate con las entradas validadas. Personajes y búmerangs se mueven en el plano del suelo; las piezas desmontadas tienen física 3D completa. La primera pantalla conectada es la anfitriona; solo sus avisos llegan a los mandos.
- **Mandos**: envían entradas compactas y muestran el estado que reenvía el servidor.

```
server.js                      Arranque: Express (archivos estáticos) + Socket.io
server/config.js               Puerto, límites y tiempos
server/network.js              Detección de IPs locales
server/PlayerManager.js        Estado autoritativo: plazas, tokens, reconexión, validación de entradas
server/socketHandlers.js       Roles de socket, eventos y bucle de envío (20 Hz)
shared/protocol.js             Protocolo común (Node y navegador)
public/index.html              Pantalla del juego (importmap de three y cannon-es)
public/js/game/main.js         Arranque y bucle de fotogramas
public/js/game/ArenaGame.js    Partida: jugadores, combate, impactos, reapariciones, avisos a los mandos
public/js/game/GameNetwork.js  Conexión de la pantalla
public/js/game/PlayerStore.js  Copia local de jugadores y entradas
public/js/game/render/         Stage (cámara, luces, sombras) y materiales de plástico y madera
public/js/game/physics/        PhysicsWorld: mundo cannon-es, grupos de colisión y cuerpos
public/js/game/content/        Catálogos de personajes y armas (aquí se añaden nuevos)
public/js/game/entities/       Character, ToyFigure (muñeco por piezas), Boomerang, AimIndicator
public/js/game/effects/        DebrisSystem (piezas con física) y Effects (confeti, ondas, tajos)
public/js/game/input/          ButtonGesture: toque / mantener / soltar
public/js/game/arena/          TestArena: arena fija con bloques de construcción (la sustituirá la Fase 3)
public/js/game/ui/             Hud: barra superior en HTML
public/controller.html         Mando móvil (también en /mando)
public/js/controller/          Joystick, botón y envío de entradas
```

### Añadir personajes y armas

- **Personaje**: nueva entrada en `content/characters.js` (tamaño, radio, velocidad, apuntado, tiempos y arma inicial) y, si cambia de aspecto, otra figura con la interfaz de `ToyFigure` (`group`, `animate`, `handWorldPosition`, `partsInWorld`).
- **Arma**: nueva entrada en `content/weapons.js` y, si se comporta distinto, una clase con la misma interfaz que `Boomerang` (`attachTo`, `throw`, `dropAt`, `onWallHit`, `steer`, `sync`, `destroy`, `dangerous`, `catchable`), registrada en `WEAPON_CLASSES` de `ArenaGame.js`.

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
- Un jugador desconectado sigue en la arena (quieto, con «✕» en su etiqueta) hasta que caduca su plaza a los 60 s, y se le puede eliminar.
- El 3D necesita la tarjeta gráfica del ordenador: con aceleración por hardware va a 60 fotogramas por segundo; sin ella (por ejemplo, Chrome sin pantalla) baja a unos 25 y la partida va más lenta.
- Los muñecos y el búmerang son provisionales, hechos con formas básicas (sin modelos 3D ni animaciones elaboradas).
- El golpe cuerpo a cuerpo no desvía búmerangs ni atraviesa paredes con precisión: comprueba distancia y ángulo.
- Si el mando pierde la señal mientras carga, el lanzamiento se cancela.
- Sin HTTPS en la red local: no hay bloqueo de pantalla encendida (Wake Lock) y en iPhone no existe pantalla completa para páginas web. La vibración no funciona en iPhone.
- Todo el estado está en memoria: reiniciar el servidor desconecta a todos (los mandos se reconectan solos como jugadores nuevos).
