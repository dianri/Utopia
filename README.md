# Las Meriendas: Monster Hunt 👹⚔️

> **Utopia** — Juego web táctico y cooperativo de geolocalización en tiempo real desarrollado como Progressive Web App (PWA).

---

## 🎮 Descripción General

En **Las Meriendas: Monster Hunt**, una escuadra de cazadores debe coordinarse en un mapa táctico del mundo real para explorar estructuras, adoptar compañeros de apoyo, gestionar mochilas de armamento, enfrentarse en combates por turnos/tiempo real contra el temible **Monstruo de Las Meriendas** y desbloquear cooperativamente las fases de seguridad del cofre del tesoro para asegurar la victoria.

---

## ⚡ Novedades y Mecánicas Principales

### ⚔️ 1. Combate Táctico en Modo Arena (RPG / Cartas)
- **Eliminación del Auto-Combate Pasivo:** Se ha suprimido el ataque automático en el mapa por simple proximidad. El mapa táctico se reserva para exploración, rescate, suministros y posicionamiento.
- **Arena de Combate Interactiva (`CombatArena.tsx`):** Al aproximarse a menos de 20 metros del monstruo, el jugador entra en una interfaz de combate inmersiva estilo RPG de cartas:
  - Barra de vida global y compartida del monstruo sincronizada por Supabase Realtime.
  - Ataque manual con cadencia estricta (`cadenceMs`), consumo de munición/usos y feedback háptico.
  - Asistencia en combate de las mascotas activas que infligen daño continuo.
  - **Bucle Continuo de Contraataque del Monstruo:** El monstruo ataca periódica y sostenidamente cada 2.5s (20-24 DMG), acelerándose a 1.8s con daño potenciado (28-34 DMG) al entrar en modo furia (`isEnraged`), con sacudida de pantalla, viñeta roja e impacto auditivo/háptico.
  - **Escudo Táctico de Mascotas y Mitigación:** Las mascotas activas y vivas forman una barrera protectora de primera línea para el cazador. El monstruo concentra su ataque de forma secuencial sobre una mascota a la vez; mientras quede al menos un compañero con vida, el jugador no recibe daño a su salud. Al caer una mascota (0 HP / incapacitada), el daño pasa a la siguiente. Solo si todas caen (o si el jugador carece de mascotas), el monstruo golpea la salud del cazador. Además, la habilidad del Tanque reduce el daño en un 50% y la pasiva del Gato Callejero otorga un 10% de probabilidad de esquivar el ataque por completo.
  - **Daño Monotónico y Umbral de Muerte:** La salud del jugador se reduce de forma estricta y decreciente sin oscilaciones ni sobrescrituras por sincronización en red; al llegar a <= 0 HP, pasa inmediatamente a "Herido de Muerte" (1 HP), cerrando el combate para iniciar el repliegue al Hospital.
  - **Opción de Huida Táctica:** Botón "HUIR" que otorga un sprint de emergencia (+30% de velocidad durante 5s) e inmunidad temporal de combate.

---

### 👹 2. Comportamiento e Inteligencia Artificial del Monstruo
Gobernado por [`MonsterAIController`](file:///Users/dian/antigravity/Utopia/src/services/monsterAI.ts) en el cliente anfitrión (Host-Driven AI) con sincronización en tiempo real vía Supabase Realtime:
- **Patrulla Circular Táctica (`patrol`):**
  - Órbita fija a **55 metros** del cofre del tesoro con avance continuo de $+2^\circ$ por segundo a **1.1 m/s** (~4.0 km/h).
  - Los cazadores a pie (1.4 m/s) son más veloces que su patrulla, permitiendo maniobras tácticas de flanqueo y sigilo.
- **Persecución Selectiva y Jerarquía de Aggro (`chase`):**
  - **Radio de Detección:** 85 metros (ampliado a 120m en Fase 2).
  - **Velocidad de Persecución:** 3.2 m/s (~11.5 km/h).
  - **Prioridad de Objetivos:**
    1. **Venganza Prioritaria:** Persigue con máxima prioridad al jugador que le disparó recientemente (`forcedTargetPlayerId`).
    2. **Atracción del Tanque:** Si no hay agresor directo, prioriza atacar al jugador de rol **Tanque** (`role === 'tank'`).
    3. **Proximidad:** Jugador vivo más cercano al aire libre.
  - **Pérdida de Rastro:** El monstruo pierde inmediatamente el aggro si el objetivo entra a un **Refugio / Casa Táctica (`🏠`)** o al **Hospital de Campaña (`🏥`)**, y descarta a combatientes en estado "Herido de Muerte".
  - **Ataque en Mapa:** A distancia $\le 15\text{m}$, inflige 24 DMG cada 1.2s (35 DMG en Fase 2).
- **Fase 2: Modo Enfurecimiento (`enraged` al $\le 30\%$ HP / 150 HP):**
  - **Rugido Sísmico:** Reproduce alerta y rugido procedural en toda la escuadra.
  - **Onda de Ralentización:** Ralentiza a todos los cazadores al aire libre a $\le 35\text{m}$ durante 5 segundos.
  - **Aceleración Drástica:** Incrementa su velocidad un **+40% (4.5 m/s / ~16.2 km/h)**, superando el sprint de los jugadores.
  - **Aggro Ampliado:** Radio de detección incrementado a 120 metros.
- **Furia Defensiva del Cofre (`defend_chest`):**
  - Se activa en el instante en que cualquier cazador abre el minijuego de cerrojos del cofre.
  - Cancela la patrulla y corre en **sprint directo hacia el cofre a 3.8 m/s** (4.2 m/s enfurecido).
  - Al llegar a $\le 30\text{m}$, ataca a los defensores en el radio de 25m del tesoro, forzando la apertura de la Arena de Combate e interrumpiendo el minijuego.
- **Muerte Temporal y Reaparición (`dead` / `respawning`):**
  - Al caer a 0 HP, desaparece del mapa y activa un temporizador visible de **60 segundos** en el HUD.
  - Al expirar los 60s, resucita con **500 HP** en las coordenadas exactas del cofre del tesoro con rugido de alerta, reiniciando su estado a `patrol`.
- **Niebla de Guerra y Radar:**
  - El monstruo permanece oculto en el mapa exterior a menos que esté dentro del radio de visión (70m base, 85m con dron, 105m/120m explorador) o que el Explorador active el **Radar Táctico**.

---

### 🎒 3. Sistema Integral de Mochila, Jerarquía y Desgaste de Armamento
- **Mochila Táctica Ilimitada (`BackpackModal.tsx`):** Capacidad sin límite de slots con scroll fluido vertical, visor de estadísticas tácticas, nivel de daño, cadencia y munición.
- **Jerarquía de Armas (7 Tiers):**
  1. **Tier 7 — Lanzacohetes RPG:** Daño masivo de área (120 DMG, 2 cohetes).
  2. **Tier 6 — Granadas Tácticas:** Daño explosivo alto (85 DMG, 4 granadas).
  3. **Tier 5 — Fusil Táctico M4:** Ráfagas automáticas de alta cadencia (28 DMG, 45 balas).
  4. **Tier 4 — Escopeta de Postas:** Dispersión letal a corta distancia (55 DMG, 12 cartuchos).
  5. **Tier 3 — Pistola 9mm:** Arma de fuego equilibrada (22 DMG, 30 balas).
  6. **Tier 2 — Hacha Táctica:** Arma cuerpo a cuerpo avanzada con **15 usos de durabilidad** (55 DMG).
  7. **Tier 1 — Cuchillo de Supervivencia:** Arma básica cuerpo a cuerpo (22 DMG).
  8. **Tier 0 — Puños (Recurso Final):** Ataque cuerpo a cuerpo desarmado ilimitado (5 DMG, cadencia 350ms). No ocupa espacio en la mochila y se auto-equipa si no queda ningún arma usable.
- **Mochila Táctica con Pestañas (`BackpackModal.tsx`):** Vista dividida en dos secciones tácticas con selector militar segmentado:
  - **"EQUIPO / ARMAS":** Capacidad infinita sin restricción de slots con scroll táctico fluido, visor de estadísticas completas (daño, cadencia, munición actual y máxima), selector de equipamiento activo e interacción de soltar/recoger objetos en el terreno.
  - **"MASCOTAS":** Panel de gestión de la comitiva de acompañantes con tarjetas de estado en vivo, barras de salud, bonificaciones pasivas únicas (rastreo, apoyo aéreo, descargas eléctricas, avance veloz, evasión felina o nanobots médicos) y estadísticas de combate.
- **Desgaste Dinámico y Auto-Fallback:** Al agotarse la munición o romperse un arma de durabilidad, el sistema equipa automáticamente la siguiente mejor arma disponible en la mochila hasta recurrir a Puños (Tier 0). Al recoger cualquier nueva arma, se auto-equipa al instante si se portaban los puños.
- **Descarte Total en el Suelo (`DroppedItem`):** Los jugadores pueden soltar cualquier arma en el terreno (incluido el cuchillo táctico). Los objetos caen al terreno como marcadores interactivos en MapLibre GL con colores por Tier y son recolectables a menos de 20m.
- **Curación Instantánea Aislada:** Los botiquines de primeros auxilios y suministros médicos se consumen inmediatamente al abrir cajas médicas o recoger kits del terreno, restaurando la salud sin ocupar espacio en la mochila. El armamento, munición y llaves están estrictamente aislados y no alteran los puntos de vida del jugador al ser recogidos.

---

### 🐾 4. Sistema de Mascotas de Apoyo (Pets)
- **Adopción Táctica Ampliada (25m):** Spawneo procedural de mascotas silvestres en el mapa con marcadores animados interactivos. Se adoptan automáticamente o mediante clic en el marcador al aproximarse a menos de 25 metros (igualado al radio táctico de suministros/loot), sumándose al séquito del cazador.
- **Órbita Constante en Píxeles de Pantalla:** Las mascotas acompañan al jugador ancladas a sus coordenadas con una corona orbital equidistante a 42px fijos de pantalla (`transform: translate(x, y)`), garantizando una distribución circular simétrica y visible sin apelotonamiento independientemente del nivel de zoom del mapa.
- **Perfiles y Habilidades Pasivas:**
  - 🐕 **Perro Guardián (`dog`):** 60 HP, 6 DMG. Rastreo y recogida de suministros ampliada a 25m.
  - 🛸 **Dron Táctico (`drone`):** 45 HP, 10 DMG. Fuego a distancia y +15m de radio de visión en la niebla de guerra.
  - ⚡ **Roedor Eléctrico (`electric_mouse`):** 50 HP, 8 DMG. Descargas rápidas de alta cadencia.
  - 🐇 **Conejo Veloz (`rabbit`):** 40 HP, 4 DMG. Velocidad de reacción y recolección rápida.
  - 🐈 **Gato Callejero (`cat`):** 45 HP, 7 DMG. Sigilo felino que otorga al dueño +10% de evasión frente a los ataques del monstruo.
  - 🤖 **Mini Robot Médico (`med_bot`):** 50 HP, 3 DMG. Nanobots de soporte que regeneran pasivamente +2 HP cada 5s fuera de combate.
- **Recogida Pasiva de Suministros (Fetch Loot):** Las mascotas escanean y recolectan suministros automáticamente dentro de su radio de acción. Si el jugador necesita vida, la curación se transfiere a él; si está al 100%, cura a la mascota con menor salud. Las armas van directamente a la mochila.
- **Estado Desmayada y Reanimación:** Si la vida de una mascota llega a 0, queda incapacitada (`isWounded: true`) y entra en modo flotación con animación de mareo (`💫`) hasta ser revivida al 100% en el Hospital de Campaña.

---

### 🏥 5. Estructuras Tácticas en el Mapa
- **Hospital de Campaña (`🏥`):**
  - Radio de interacción de 18 metros.
  - Curación médica continua (+10 HP/segundo) para jugadores en su interior.
  - Revive y restaura automáticamente al 100% de salud a todas las mascotas desmayadas de la comitiva.
  - Centro de estabilización clínica para jugadores en estado crítico.
- **Casas / Refugios Tácticos (`🏠`):**
  - De 3 a 5 búnkeres distribuidos en el área operativa con radio de 14 metros.
  - **Mecánica de Cobertura Total:** Al entrar, el avatar se oculta visualmente del mapa exterior (`style.display = 'none'`), los aliados lo visualizan con etiqueta `[A CUBIERTO]`, y el monstruo pierde inmediatamente el aggro.
- **Capa Táctica Visual:** Representación poligonal GeoJSON de las zonas de influencia estructural (`structures-zones`) y banner contextual de estado interior (`IndoorStatusBanner.tsx`).

---

### 🩸 6. Rediseño del Ciclo de Vida: Estado "Herido de Muerte"
- **Sustitución de la Muerte Instantánea:** Al recibir daño letal, el HP se ancla en 1 y el jugador pasa al estado `critically_wounded`.
- **Restricciones de Combate:** Armas bloqueadas, habilidades deshabilitadas e imposibilidad de saquear cajas. La única acción disponible es replegarse hacia el Hospital de Campaña.
- **HUD Crítico y Brújula Médica:** Viñeta roja pulsante en pantalla y compás direccional interactivo (`CriticallyWoundedOverlay.tsx`) que señala con precisión de rumbo y distancia hacia el Hospital más cercano.
- **Aislamiento Táctico del Mapa y Línea Guía de Emergencia:**
  - Al entrar en estado herido, **desaparecen todos los iconos del mapa** (monstruo, cofre del tesoro, cajas de suministros, armas en el suelo, mascotas, pings y otros jugadores), manteniendo únicamente visible la estructura del Hospital (`🏥`) y la posición del jugador.
  - Se traza una **línea de puntos esmeralda** (`hospital-guideline-line` con `line-dasharray`) que une en tiempo real al combatiente con el Hospital indicando el camino más corto hacia la recuperación.
  - Al alcanzar >= 20 HP dentro del Hospital y salir del estado herido, todos los elementos del mapa vuelven a mostrarse instantáneamente y la línea guía se retira.
- **Recuperación Infinita en Hospital (Sin Derrota Global):** Al alcanzar >= 20 HP dentro del Hospital, el combatiente se estabiliza y reanuda el combate activo. La partida no tiene condición de derrota global (`defeat`); se mantiene en bucle continuo en estado `'playing'` permitiendo reapariciones y curaciones infinitas en el Hospital hasta que la escuadra consiga abrir el cofre del tesoro y alcance la victoria.

---

### 🗝️ 7. Apertura Cooperativa del Cofre por Fases
- Sustituida la cuenta regresiva estática por un sistema cooperativo de **3 fases con 2 cerrojos cada una** (6 desafíos en total):
  1. **Fase 1 (Sincronización QTE):** Puntería temporal sobre zonas verdes oscilantes.
  2. **Fase 2 (Código Lumínico):** Secuencia de memoria táctica tipo Simón Dice de 3 a 4 colores.
  3. **Fase 3 (Frecuencia Magnética):** Dial rotatorio sintonizador con respuesta háptica.
- **Resolución Atómica del Sexto Cerrojo y Transición a Victoria:** Al resolver el segundo reto de la Fase 3, el cofre confirma el estado atómico en 6/6 cerrojos superados (100%), actualiza Supabase (`status: 'victory'`, `chest_opened: true`), emite broadcast Realtime `game_victory` para toda la escuadra, transforma el marcador del mapa a "Cofre Abierto / Saqueado" (`🔓`) y presenta de forma inmediata el modal de "¡TESORO ASEGURADO!".
- **Furia Defensiva del Monstruo:** Cuando cualquier agente inicia el desbloqueo del cofre, el monstruo entra en modo `defend_chest` y realiza un sprint a 3.8 m/s directamente hacia las coordenadas del cofre.
- **Aislamiento por Partida:** Estado de desbloqueo estricto por ID único de sala (`game.id`), evitando que nuevas partidas hereden progreso residual.

---

### 📱 8. Optimización Mobile-First y HUD Táctico
- **Soporte para Safe Area:** Separación inferior del panel de armas (`bottom-6` / `bottom-8` y `pb-[env(safe-area-inset-bottom)]`) evitando colisiones con la barra de navegación del sistema operativo móvil.
- **Contenedor Flex Vertical de Alertas:** Notificaciones de respawn y alertas de cofre apiladas en columna (`top-20 flex-col gap-2`) sin solapamiento entre tarjetas.
- **Autocierre de Mensajes de Bitácora:** Desvanecimiento temporal del log de combate (`CombatLog.tsx`) tras 5 segundos de inactividad para mantener despejada la vista de mapa.
- **Renderizado Seguro de Marcadores en MapLibre:** Guardia estricta de ciclo de vida del mapa WebGL y revelación diferida mediante doble `requestAnimationFrame` que elimina cualquier parpadeo de marcadores en la coordenada `(0, 0)`.

---

## 🕹️ Modos de Movimiento y Conectividad

- **Movimiento Dual:**
  - **GPS Real:** Geolocalización de alta precisión en vivo (`navigator.geolocation.watchPosition`). Indicador de distancia si te encuentras fuera del área sin teletransporte forzado.
  - **Tap-to-Move:** Navegación táctil configurable al crear la partida con 4 niveles de velocidad de desplazamiento: Lento (0.8 m/s ~3 km/h), Normal (1.4 m/s ~5 km/h), Rápido (2.8 m/s ~10 km/h) y Muy Rápido (11.1 m/s ~40 km/h), con reajuste perimetral automático si pulsas fuera del radio de juego.
- **Lobby y Explorador de Operaciones en Vivo:**
  - Creación de partidas **Públicas** (visibles en el radar del lobby) o **Privadas** (acceso mediante código de 6 letras o enlace `/?room=CODIGO`).
  - Incorporación a partidas ya iniciadas (**Late Join / Reconnect**) con spawn seguro y sincronización inmediata vía Supabase Realtime.
- **Protocolo de Cancelación y Abandono:**
  - Cancelación global por el anfitrión con confirmación y redirección ordenada de la escuadra.
  - Abandono seguro individual sin romper la sesión de los demás compañeros.

---

## 🎖️ Clases de Combate

| Clase | Rol Táctico | Habilidad Especial / Ventaja |
| :--- | :--- | :--- |
| ✚ **Médico** | Soporte y Sanación | Reanimación rápida y radio de curación táctica ampliado a 35m. |
| 🛡️ **Tanque** | Primera Línea | +50% de vida base (150 HP) y atracción prioritaria del aggro del monstruo. |
| 👁️ **Explorador** | Reconocimiento | Radio de visión de 105m y habilidad activa **Radar Táctico** (revela al monstruo a toda la escuadra). |
| 🎯 **Tirador** | Daño a Distancia | +35% de daño con armas de fuego y mayor alcance efectivo de disparo. |

---

## 🛠️ Stack Tecnológico

- **Frontend:** React 18+, Vite, TypeScript estricto.
- **Estilos & HUD:** Tailwind CSS (diseño táctico oscuro mobile-first), Lucide React, Canvas Confetti.
- **Motor de Mapas:** `maplibre-gl` con azulejos vectoriales libres de OpenFreeMap (aceleración WebGL a 60 FPS).
- **Audio y Hápticos:** Web Audio API procedural (síntesis de sonido sin archivos de audio pesados) + Navigator Vibration API.
- **PWA:** `vite-plugin-pwa` con Service Worker agresivo, precache de assets y soporte offline.
- **Backend & Realtime:** Supabase.
  - Autenticación Anónima (`signInAnonymously()`).
  - Base de datos PostgreSQL con RLS estricto y triggers automáticos.
  - Supabase Realtime (Canales combinados con `broadcast` para movimiento sin saturar la BD y `presence` para sincronización de escuadra).

---

## 🚀 Instalación y Puesta en Marcha

### 1. Clonar el repositorio
```bash
git clone https://github.com/dianri/Utopia.git
cd Utopia
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Copia la plantilla `.env.example` a `.env` y añade tus claves de Supabase:
```bash
cp .env.example .env
```
Configura:
```env
VITE_SUPABASE_URL=https://iadiswktxduqetzjujli.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anonima_aqui
```

### 4. Ejecutar en desarrollo
```bash
npm run dev
```

### 5. Compilación para producción (Quality Gate)
```bash
npm run build
```
Genera la carpeta `dist/` optimizada con división de módulos (`vendor`, `maplibre`, `supabase`) y Service Worker PWA activo.

### 6. Despliegue en Vercel
El repositorio incluye [`vercel.json`](./vercel.json) con la regla de reescritura para Single Page Applications (SPA).
1. Conecta el repositorio en Vercel.
2. En **Settings > Environment Variables**, añade:
   - `VITE_SUPABASE_URL` = `https://iadiswktxduqetzjujli.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = tu clave pública/anónima de Supabase
3. La aplicación cuenta con blindaje contra fallos de inicialización:
   - Si no se configuran las variables en Vercel, muestra un banner descriptivo y activa el modo de demostración local sin pantalla negra.
   - Cuenta con un `<ErrorBoundary>` táctico que captura cualquier excepción de WebGL, audio o geolocalización.

---

## 🌿 Flujo de Desarrollo Multi-Agente

Cumpliendo las directrices de [`AGENTS.md`](./AGENTS.md):
- Todas las características se desarrollan en ramas aisladas (`feature/agent-<id>-<tarea>`).
- El comando `npm run build` debe finalizar con **0 errores y 0 advertencias** antes de cualquier commit o merge.
- **Revisión y actualización obligatoria de `README.md` y `AGENTS.md` con cada nueva feature o cambio arquitectónico.**
- Sincronización continua de `CHANGELOG.md` bajo la sección `[Unreleased]`.
