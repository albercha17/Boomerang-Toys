# Bumerán de Juguete

Juego multijugador local para navegador inspirado en Boomerang Fu. El ordenador muestra la partida y cada móvil hace de mando (sin instalar nada).

**Estado: Fase 4**: partidas por rondas con sala de pruebas, marcador y victoria; arenas generadas por procedimiento (bloques, torres y juguetes sueltos), en 3D con cámara cenital inclinada (como Boomerang Fu), búmerangs, cuchilladas, dash, muñecos que se desmontan y un bot.

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

### La partida

1. **Sala de pruebas.** Al abrir la pantalla, los jugadores que se conectan aparecen en un mapa aleatorio con **vidas infinitas** para practicar. Aquí se puede cambiar de mapa y añadir o quitar el bot.
2. **«▶ Empezar partida»** (o la tecla **Intro**), cuando haya al menos 2 jugadores (vale el bot).
3. Cada ronda empieza con una **cuenta atrás** (3, 2, 1) en un **mapa nuevo**, con todos quietos. En la ronda **no se reaparece**: quien cae queda eliminado (su móvil muestra **ELIMINADO · espera a la siguiente ronda**).
4. **El último que queda vivo gana un punto.** Si caen todos a la vez, es empate y nadie suma. Se muestra el marcador y empieza la siguiente ronda en otro mapa.
5. **Quien llega a 10 puntos gana la partida.** Pantalla de victoria y **«Volver a la sala»** para jugar otra, sin reiniciar nada.
6. **Pausa** con el botón de la barra o la tecla **P** (o Esc): todo se congela; desde ahí se puede continuar o terminar la partida.

Quien conecta su móvil con una ronda empezada espera a la siguiente. Los puntos se ven en la barra superior (`J1 · 3`). Para partidas cortas: `/?puntos=3` (de 1 a 50).

1. Abre `http://localhost:3000/` en el ordenador (mejor a pantalla completa con F11).
2. En cada móvil, abre la dirección que aparece arriba a la derecha (`http://<IP-del-ordenador>:3000/mando`).
3. Cada jugador aparece en la arena con su color y su búmerang en la mano.
4. Para jugar contra la máquina, en la sala pulsa **«+ Añadir bot»** (o la tecla **B**). El mismo botón lo quita. Por ahora hay un bot como máximo.
5. En la sala, **«Nuevo mapa»** (o la tecla **M**) genera otra arena al momento. Pasando el ratón por el botón se ve la semilla del mapa actual.

### Mando a pantalla completa y sin zoom

- **Android (Chrome):** al primer toque el mando se pone a pantalla completa y en horizontal. Si se sale, el siguiente toque lo recupera (el botón ⛶ también la quita y la pone).
- **iPhone (Safari):** Apple no deja que una web se ponga sola a pantalla completa. Pulsa **Compartir → Añadir a pantalla de inicio** y abre el mando desde ese icono: así ocupa toda la pantalla, sin barras. El mando muestra un aviso con estos pasos (se puede cerrar).
- En los dos, el doble toque, el pellizco y la pulsación larga no hacen zoom ni abren menús.

### Elegir la arena

Desde la dirección de la pantalla del juego (todo opcional):

| Parámetro | Ejemplo | Qué hace |
|---|---|---|
| `mapa` | `/?mapa=grande` | Tamaño predefinido: `pequena` (20×12), `mediana` (26×14, por defecto), `grande` (34×20) |
| `ancho`, `alto` | `/?ancho=30&alto=16` | Tamaño a medida en casillas, borde incluido (ancho 12–64, alto 10–40) |
| `densidad` | `/?densidad=0.25` | Cantidad de obstáculos (0–0,3) |
| `semilla` | `/?semilla=42` | Repite exactamente un mapa (misma semilla = mismo mapa) |
| `simetria` | `/?simetria=no` | Por defecto el mapa es simétrico izquierda-derecha, para que sea justo |

El mando funciona como en Brawl Stars (mejor con el móvil en horizontal):

| En el mando | Qué hace |
|---|---|
| Joystick izquierdo | Moverse |
| Joystick derecho (**LANZAR**): arrastrar | Apuntar y cargar el lanzamiento. Mientras apuntas avanzas muy despacio y una flecha en el suelo marca la dirección |
| Joystick derecho: soltar | Lanzar hacia donde apuntabas. Cuanto más tiempo cargues, más lejos llega |
| Joystick derecho: **toque** sin arrastrar | Cuchillada cuerpo a cuerpo |
| Joystick derecho: mantener sin arrastrar | Lanzar hacia donde mira el muñeco |
| Botón **DASH** | Saltito rápido hacia donde te mueves (o hacia delante). Se recarga en 0,7 s |

- El búmerang sale, frena, vuelve hacia ti y rebota en los bloques. Recógelo pasando por encima cuando vuelve.
- Cualquier búmerang en vuelo (o un golpe) elimina al instante: el muñeco se desmonta en cabeza, torso, brazos y piernas, que saltan, ruedan, pueden quedar encima de los bloques y se pueden empujar.
- Si muere su dueño, el búmerang cae al suelo; quien no tenga arma puede cogerlo.
- A los 2,5 s reapareces lejos de los demás, con 1,2 s de invulnerabilidad (parpadeas).
- El joystick de ataque del móvil muestra tu estado: **LANZAR**, **SIN BÚMERANG** o **K.O.** (y vibra al morir).
- El bot busca al rival más cercano, mantiene la distancia, apunta con algo de error, da cuchilladas de cerca, esquiva con dash los búmerangs que le vienen encima y recoge su búmerang si lo pierde.

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
public/js/game/arena/          presets (tamaños y límites), ArenaBuilder (3D y física de la arena)
public/js/game/arena/generation/  Generador procedural puro: semillas, zonas, piezas, accesibilidad, apariciones
public/js/game/bots/           BotBrain: inteligencia del bot (genera la misma entrada que un mando)
public/js/game/match/          Match: sala, rondas, puntos, victoria y pausa
public/js/game/ui/             Hud (barra superior: jugadores y puntos, botones, dirección) y MatchOverlay (pantallas de la partida)
public/controller.html         Mando móvil (también en /mando)
public/manifest.webmanifest    Mando como app de pantalla completa al abrirlo desde la pantalla de inicio
public/icons/                  Iconos del mando
public/js/controller/          Joysticks (movimiento y ataque), botón de dash, envío de entradas, pantalla completa y bloqueo del zoom
```

### Generación de arenas

1. Se crea la rejilla con su borde y se divide en **zonas de 8×8 casillas** (chunks). Cada zona tiene su propia semilla derivada de la semilla del mapa, así que se puede generar por separado: es la base para escenarios más grandes o que se amplían.
2. En cada zona se estampan piezas al azar (bloque, pareja, muro, ele, cuadrado, te, torre redonda), siempre con al menos una casilla libre alrededor: nunca se cierran pasillos ni se pegan al borde.
3. Con simetría, solo se genera la mitad izquierda y se refleja.
4. Se buscan las regiones de suelo conectadas: los huecos aislados se rellenan con bloques, así **todo el suelo libre es accesible**. Si queda poco suelo libre, se repite con otra variante.
5. Las **apariciones** se eligen en casillas con todo su alrededor libre, lo más separadas posible entre sí; nadie aparece dentro de un obstáculo ni pegado a él.
6. Los **juguetes sueltos** (dados y pelotas, con física: se empujan y ruedan) se colocan en el suelo libre, lejos de las apariciones.

Para el rendimiento, los bloques y torres se dibujan con mallas instanciadas (una llamada de dibujo por tipo de pieza, se vea el tamaño que se vea) y las filas de bloques de cada zona comparten una sola caja física. `buildArena(..., { meshPerChunk: true })` crea mallas por zona para que la cámara descarte las que no ve en escenarios más grandes que la pantalla. Generar un mapa tarda menos de 1 ms.

### Añadir personajes y armas

- **Personaje**: nueva entrada en `content/characters.js` (tamaño, radio, velocidad, apuntado, tiempos y arma inicial) y, si cambia de aspecto, otra figura con la interfaz de `ToyFigure` (`group`, `animate`, `handWorldPosition`, `partsInWorld`).
- **Arma**: nueva entrada en `content/weapons.js` y, si se comporta distinto, una clase con la misma interfaz que `Boomerang` (`attachTo`, `throw`, `dropAt`, `onWallHit`, `steer`, `sync`, `destroy`, `dangerous`, `catchable`), registrada en `WEAPON_CLASSES` de `ArenaGame.js`.

## Protocolo Socket.io

El rol se indica al conectar: `io({ auth: { role: 'screen' } })` o `io({ auth: { role: 'controller', token } })`.

| Evento | Sentido | Contenido |
|---|---|---|
| `c:input` | mando → servidor | `[seq, mx, my, ax, ay, botones]`: movimiento y puntería con ejes enteros −100..100; botones como máscara de bits (1 = ataque, 2 = dash) |
| `c:ping` | mando → servidor | `(últimoRttMs, ack)` cada 2 s |
| `g:feedback` | pantalla anfitriona → servidor | `[idJugador, estado]`: solo cuando cambia |
| `s:welcome` | servidor → mando | `{ id, number, name, color, token }` |
| `s:rejected` | servidor → mando | `{ reason: 'full' }` |
| `s:kicked` | servidor → mando | `{ reason: 'replaced' }` (mismo jugador abierto en otra pestaña) |
| `s:feedback` | servidor → mando | `estado`: máscara de bits, 1 = vivo, 2 = con arma, 4 = ronda en juego (no se reaparece) |
| `s:screenInit` | servidor → pantalla | `{ server, roster, state }` al conectar |
| `s:roster` | servidor → pantalla | lista de jugadores (al entrar/salir; latencia como mucho 1/s) |
| `s:state` | servidor → pantalla | `{ t, p: [[id, mx, my, ax, ay, botones, ataques, dashes, obsoleto]] }`, a 20 Hz y solo si hay cambios |

Reglas:

- El mando envía al momento los cambios de botón, el joystick a 30 Hz como máximo y una señal de vida cada 500 ms.
- El servidor valida cada paquete (formato, rango, vector limitado al círculo unidad, secuencia creciente y un máximo de 60 paquetes/s).
- Si un mando no envía nada en 1,5 s, su entrada pasa a neutro y se marca *obsoleta*.
- Las pulsaciones de ataque y de dash se cuentan en el servidor, así que un toque muy corto no se pierde entre dos envíos.
- Los bots no pasan por el servidor: viven en la pantalla anfitriona y no ocupan plaza de jugador.
- Un jugador desconectado conserva la plaza 60 s; al volver con su token recupera id, número, color y estado del botón.

## Limitaciones conocidas

- La simulación del combate corre en la pantalla anfitriona, no en el servidor. Si se abren dos pantallas, cada una simula su propia partida (solo la primera avisa a los mandos). La puntuación de la Fase 4 deberá guardarse en el servidor.
- El bot es sencillo: no planifica rutas (si se atasca contra un bloque cambia de rumbo) y no usa los rebotes a propósito.
- La cámara encuadra siempre la arena entera: en mapas muy grandes (más de unas 40×24 casillas) los muñecos se ven pequeños. Para escenarios expansivos hará falta una cámara que siga a los jugadores (la generación por zonas ya lo permite).
- En iPhone la pantalla completa solo es posible abriendo el mando desde el icono de la pantalla de inicio (limitación de Safari). Al no haber HTTPS en la red local, en Android el mando no se puede «instalar» como app: la pantalla completa se consigue con el primer toque.
- La partida (rondas y puntos) la lleva la pantalla del juego: si se recarga esa página, se vuelve a la sala y el marcador empieza de cero. Los jugadores conectados siguen ahí.
- No hay límite de tiempo por ronda: si los dos últimos se esconden, la ronda sigue hasta que uno caiga.
- Aún no se puede elegir personaje ni color (el color depende de la plaza del jugador).
- Un jugador desconectado sigue en la arena (quieto, con «✕» en su etiqueta) hasta que caduca su plaza a los 60 s, y se le puede eliminar.
- El 3D necesita la tarjeta gráfica del ordenador: con aceleración por hardware va a 60 fotogramas por segundo; sin ella (por ejemplo, Chrome sin pantalla) baja a unos 25 y la partida va más lenta.
- Los muñecos y el búmerang son provisionales, hechos con formas básicas (sin modelos 3D ni animaciones elaboradas).
- El golpe cuerpo a cuerpo no desvía búmerangs ni atraviesa paredes con precisión: comprueba distancia y ángulo.
- Si el mando pierde la señal mientras carga, el lanzamiento se cancela.
- Sin HTTPS en la red local no hay bloqueo de pantalla encendida (Wake Lock): si el móvil se apaga solo, súbele el tiempo de bloqueo. La vibración no funciona en iPhone.
- Todo el estado está en memoria: reiniciar el servidor desconecta a todos (los mandos se reconectan solos como jugadores nuevos).
