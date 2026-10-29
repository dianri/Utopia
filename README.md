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
  - **"MASCOTAS":** Panel de gestión de la comitiva de acompañantes (máximo 3 por jugador, `MAX_PETS_PER_PLAYER = 3`) con contador dinámico `X/3`, distintivo de capacidad máxima, tarjetas de estado en vivo, barras de salud, bonificaciones pasivas únicas (rastreo, apoyo aéreo, descargas eléctricas, avance veloz, evasión felina o nanobots médicos) y estadísticas de combate.
- **Cupo Máximo de Mascotas por Jugador (Máximo 3 Simultáneas):** Cada cazador puede vincular un máximo de 3 mascotas a la vez en su comitiva. Si un agente con 3 mascotas interactúa o se aproxima a una mascota silvestre, el sistema bloquea la adopción, emite el aviso táctico *"CAPACIDAD MÁXIMA DE MASCOTAS (3/3): No puedes vincular más acompañantes."* con sonido de alarma y vibración háptica, y deja la criatura intacta en el mapa para el resto de los aliados.
- **Desgaste Dinámico y Auto-Fallback:** Al agotarse la munición o romperse un arma de durabilidad, el sistema equipa automáticamente la siguiente mejor arma disponible en la mochila hasta recurrir a Puños (Tier 0). Al recoger cualquier nueva arma, se auto-equipa al instante si se portaban los puños.
- **Descarte Total en el Suelo (`DroppedItem`):** Los jugadores pueden soltar cualquier arma en el terreno (incluido el cuchillo táctico). Los objetos caen al terreno como marcadores interactivos en MapLibre GL con colores por Tier y halo de influencia GeoJSON de 25m visible desde la carga inicial, con navegación automática hacia ellos al pulsar sobre el marcador.
- **Generación Progresiva, Control de Densidad y Airdrop con Paracaídas Animado:**
  - **Lote Base Mínimo Inicial y Persistencia Autoritativa en Supabase:** Al arrancar o crear la partida se genera un lote inicial ligero de 3 cajas de suministros y 1 mascota silvestre guardado en las columnas `active_crates`, `active_wild_pets`, `active_dropped_items` y `active_loot` de `public.games`.
  - **Reconexión y F5 sin Regeneración Masiva:** Al recargar el navegador o unirse a una partida en curso, el cliente hidrata el mapa directamente desde el estado autoritativo de Supabase con una guardia estricta que prohíbe la recreación de entidades si la partida ya existe, garantizando que los objetos recogidos y mascotas adoptadas no reaparezcan en el suelo.
  - **Control Estricto de Densidad en el Mapa (Máx 3 Armas/Loot y 3 Mascotas Silvestres):** En el terreno solo puede haber simultáneamente un máximo de 3 suministros sin reclamar (`MAX_UNCLAIMED_LOOT = 3`) y un máximo de 3 mascotas libres (`MAX_UNCLAIMED_WILD_PETS = 3`). Si se alcanza dicho cupo, el bucle del Host pausa el lanzamiento de paracaídas y la generación de criaturas.
  - **Reactivación Inmediata por Recolección:** En cuanto cualquier jugador saquea una caja o recoge un arma descartada, el cupo activo baja a 2 o menos, permitiendo que el siguiente ciclo de airdrop vuelva a lanzar una caja con paracaídas hasta volver a 3. Igualmente, al adoptar una mascota silvestre, el contador libre se reduce y el temporizador engendra nuevas criaturas hasta el tope de 3.
  - **Ciclo Periódico de Airdrops (Cada 50s):** Durante la partida, el bucle del Host lanza airdrops regulares sincronizados con el tiempo transcurrido desde el inicio (`started_at`), ajustando el retraso del primer despliegue al residuo del intervalo para evitar desincronizaciones al reconectar.
  - **Animación Táctica de Vaivén con Paracaídas (`@keyframes airdropSway`):** Las nuevas cajas descienden desde el cielo durante 5 segundos con una cúpula militar de paracaídas y balanceo pendular lateral con rotación oscilante. Al tomar tierra, el paracaídas se pliega y desprende suavemente (`@keyframes parachuteFold`), dejando la caja firme con su aura táctica de 40m.
  - **Aparición Paulatina de Mascotas Silvestres (Cada 95s):** Aparecen nuevas criaturas silvestres periódicamente en el terreno con un tope máximo estricto de 3 simultáneas sin adoptar en el mapa para evitar saturación y preservar el rendimiento.
  - **Sincronización Inmediata en Supabase y Realtime:** Cada apertura de caja, adopción de mascota, descarte o recogida de objetos actualiza al instante la fila de la sala en Supabase (`syncRoomEntitiesToSupabase`) y se transmite por broadcast a toda la escuadra.
- **Curación Instantánea Aislada:** Los botiquines de primeros auxilios y suministros médicos se consumen inmediatamente al abrir cajas médicas o recoger kits del terreno, restaurando la salud sin ocupar espacio en la mochila. El armamento, munición y llaves están estrictamente aislados y no alteran los puntos de vida del jugador al ser recogidos.

---

### 🐾 4. Sistema de Mascotas de Apoyo (Pets)
- **Adopción Táctica Ampliada (25m) y Auto-Navegación:** Spawneo procedural de mascotas silvestres en el mapa con marcadores animados interactivos y auras de rango de influencia GeoJSON de 25m visibles inmediatamente desde el inicio. Al pulsar sobre cualquier mascota lejana, el cazador camina automáticamente hacia sus coordenadas y la adopta de forma continua al entrar dentro del radio de proximidad.
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
- **Hospital de Campaña (`🏥`) // Bahía Táctica de Bio-Regeneración (`HospitalModal.tsx`):**
  - **Radio de Influencia:** 18 metros con detección automática al ingresar.
  - **Desencadenante Inteligente de Entrada y Aislamiento de Curación:** Si el jugador o alguna de sus mascotas tienen < 100% de HP o sufren estado crítico/herido (`critically_wounded` / `isWounded`), se activa automáticamente la **Bahía de Regeneración Táctica** (`HospitalModal.tsx`) y se detiene el movimiento del personaje (`cancelMovement()`) mientras dure el tratamiento médico. Toda regeneración de salud transcurre de forma visible y audible en dicha interfaz, sin curación pasiva silenciosa en segundo plano. Si la escuadra ya se encuentra sana al 100%, se presenta de manera unificada y sin parpadeos el cartel estático superior: *"INSTALACIÓN MÉDICA: HOSPITAL // Todos los signos vitales se encuentran al 100%"* (`IndoorStatusBanner.tsx`), silenciando toasts flotantes repetitivos y ocultando botones intermitentes.
  - **Interfaz Ciberpunk / Bio-Médica Militar:** Inspirada en la arquitectura visual de la Arena de Combate (`CombatArena.tsx`), adaptando la ambientación a tonos verde esmeralda (`#10b981`), cian bio-médico (`#06b6d4`), tramas de escáner y cruces de auxilio pulsantes (`🏥` / `➕`):
    - **Cabecera Táctica:** Título *"UNIDAD MÉDICA AVANZADA // BAHÍA DE REGENERACIÓN"*, frecuencia de soporte vital y botón voluntario *"SALIR DE LA BAHÍA"*.
    - **Pod Central del Paciente:** Avatar del jugador con halo bio-regenerativo esmeralda, indicador dinámico (*"REANIMANDO CONSTANTES VITALES..."* si estaba en estado crítico o *"ESTABILIZANDO CONSTANTES..."*), y barra de vida de gran tamaño con incremento numérico visible en tiempo real `HP / MaxHP (+15 HP/s)`.
    - **Bahía Médica de Mascotas (Reactivación de Escudos):** Despliegue de los compañeros adoptados con barras individuales (+20 HP/s), alertas de desfibrilación para mascotas caídas (`💫`), y destello esmeralda triunfal con *"¡REPARADA / LISTA PARA COMBATE!"* al reactivar sus escudos al 100%.
  - **Ciclo de Ticks Médicos y Audio Procedural:**
    - Recarga periódica continua cada 1 segundo: **+15 HP/s** para el jugador y **+20 HP/s** para las mascotas dañadas o noqueadas.
    - Latidos cardíacos y tonos bio-sintetizados en Web Audio API (`soundEffects.playHeartbeat()`, `soundEffects.playMedicalTick()`), números flotantes animados (`+15 HP`, `+20 HP ESCUADRA`) y viñeta perimetral esmeralda que pulsa al compás de la regeneración.
  - **Alta Médica Automática y Persistencia:**
    - Al alcanzar el 100% de salud tanto el jugador como todas sus mascotas, se proyecta el overlay triunfal *"TRATAMIENTO COMPLETADO: ESCUADRA 100% OPERATIVA"*, suena el acorde de alta médica (`soundEffects.playMedicalSuccess()`), se actualiza y persiste el estado en Supabase y Realtime (`status: 'active'`, `isCriticallyWounded: false`), y el modal se auto-cierra a los 1.5s devolviendo el control al mapa.
    - Si el jugador sale voluntariamente antes de completar la curación permaneciendo dentro del radio, el HUD ofrece un acceso táctico directo *"BAHÍA MÉDICA ACTIVA"* para reingresar al pod en cualquier momento (oculto automáticamente una vez que la escuadra recupera el 100% de salud).
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
  2. **Fase 2 (Código Lumínico / Simón Dice):** Secuencia de memoria táctica de 3 a 4 colores con feedback audiovisual inmediato bidireccional (tanto en la demostración automática como en la pulsación táctil del jugador: destello de 200ms con halo perimetral brillante, vibración táctica y tonos armónicos sintetizados dedicados para cyan, emerald, amber y purple mediante Web Audio API).
  3. **Fase 3 (Frecuencia Magnética):** Dial rotatorio sintonizador con respuesta háptica.
- **Resolución Atómica del Sexto Cerrojo y Transición a Victoria:** Al resolver el segundo reto de la Fase 3, el cofre confirma el estado atómico en 6/6 cerrojos superados (100%), transformando el marcador del mapa a "Cofre Abierto / Saqueado" (`🔓`) y presentando de forma inmediata el modal de "¡TESORO ASEGURADO!".
- **Sello Autoritativo de Sala y Cierre para Clientes No-Anfitriones (`finish_game_victory`):** Si un jugador que no inició la sala completa el sexto cerrojo, la sala se sella de forma atómica e irreversible mediante la función RPC PostgreSQL con `SECURITY DEFINER` `finish_game_victory(p_game_id, p_winner_nickname)` (respaldada por la política RLS `games_update_participants`), registrando `status = 'victory'`, `ended_at = now()`, `chest_opened = true` y el apodo del ganador. Los miembros que reciben el broadcast de victoria también invocan la persistencia en base de datos.
- **Política Estricta Anti-Reconexión a Partidas Finalizadas:** Al registrarse la victoria o derrota, se purga de inmediato el snapshot local de sesión (`clearPlayerSessionSnapshot`) y la clave de sala activa (`utopia_active_room`). El explorador de partidas (`GameExplorer`) y el verificador de reconexión del lobby filtran estrictamente por `.is('ended_at', null)` y descartan partidas en estado `victory`, `defeat` o `cancelled`, impidiendo que salas concluidas continúen apareciendo como activas o reanudables tras recargar la página.
- **Furia Defensiva del Monstruo:** Cuando cualquier agente inicia el desbloqueo del cofre, el monstruo entra en modo `defend_chest` y realiza un sprint a 3.8 m/s directamente hacia las coordenadas del cofre.
- **Aislamiento por Partida:** Estado de desbloqueo estricto por ID único de sala (`game.id`), evitando que nuevas partidas hereden progreso residual.

---

### 📱 8. Optimización Mobile-First y HUD Táctico
- **Vista Satélite por Defecto y Selector Táctico FAB (Terreno Real vs. Modo Oscuro):** La simulación táctica arranca predeterminadamente con ortofoto satelital de alta resolución (ArcGIS World Imagery), permitiendo reconocer calles, edificios y terreno real en el teatro de operaciones. Las 7 capas GeoJSON de influencia táctica (perímetro, zona del cofre, visión del jugador, suministros, hospitales/refugios, radios de interacción y línea de auxilio médico) se proyectan con alto contraste lumínico (cian `#00f2fe`, esmeralda `#10b981` y ámbar `#ffd000`) de forma persistente y sin pérdidas sobre la fotografía aérea. El botón flotante de acción rápida (FAB) reubicado en la columna derecha (`top-28 right-3 z-30` bajo la brújula NORTE) permite conmutar en cualquier momento entre la vista satelital y el mapa vectorial oscuro táctico (OpenFreeMap). En móviles se adapta como botón circular compacto de 38x38px (`w-[38px] h-[38px] rounded-full`) mostrando el icono dinámico (📡 para volver a TÁCTICO / 🌍 para SATÉLITE) con respuesta sonora (`playRadarPing`) y háptica (`vibrate`).
- **Alerta Unificada de Instalación Médica:** Tarjeta horizontal compacta (`IndoorStatusBanner.tsx`, altura máx. 44px `max-h-11` en móvil) que unifica el estado de salud y el acceso directo al Pod de Regeneración (`"INGRESAR"`), eliminando banners superpuestos en la cabecera del mapa.
- **Micro-Píldora Táctica en Móvil y Dock Lateral en PC para el Cofre del Tesoro:** Widget de progreso de victoria (`ChestCountdown.tsx`) desacoplado del centro superior de la pantalla: en móviles se transforma en una micro-píldora flotante compacta de una sola línea anclada en `left-3 top-[88px] z-20` (`h-7`, 👑, `X/6`, micro-barra de 3px y botón dinámico `ABRIR` en rango) con popover táctico temporal de 3 segundos; en PC se ancla en el lateral superior izquierdo (`top-24 left-4 z-20 w-56`) con panel semitransparente, dejando la franja central (`top-20 z-40`) totalmente despejada y con prioridad de capa para las alertas médicas del hospital, perímetros de operación y estado de huida.
- **Barra de Acciones Inferior Unificada (Flexbox Táctico):** Integración en una sola fila responsive (`fixed bottom-4 left-3 right-3 flex items-center gap-2 z-30 pointer-events-none`) del botón de Mochila (`w-12 h-12 shrink-0`), la tarjeta de Arma Equipada (`flex-1 min-w-0` con textos adaptables que evitan truncamientos agresivos) y el botón circular de Habilidad/Cura (`w-12 h-12 sm:w-14 sm:h-14 shrink-0`), garantizando cero solapamientos entre la munición y las acciones del cazador.
- **Soporte para Safe Area:** Separación inferior del panel de armas (`pb-[env(safe-area-inset-bottom)]`) evitando colisiones con la barra de navegación del sistema operativo móvil.
- **Contenedor Flex Vertical de Alertas Tácticas Centrales:** Notificaciones de respawn, alertas de hospital y perímetros apiladas en columna central (`top-20 z-40 flex-col gap-2`) completamente despejadas y sin solapamiento con otros controles.
- **Autocierre de Mensajes de Bitácora:** Desvanecimiento temporal del log de combate (`CombatLog.tsx`) tras 3.5 segundos de inactividad para mantener despejada la vista de mapa.
- **Renderizado Seguro de Marcadores en MapLibre:** Guardia estricta de ciclo de vida del mapa WebGL y revelación diferida mediante doble `requestAnimationFrame` que elimina cualquier parpadeo de marcadores en la coordenada `(0, 0)`.

---

## 🕹️ Modos de Movimiento y Conectividad

- **Movimiento Dual:**
  - **GPS Real:** Geolocalización de alta precisión en vivo (`navigator.geolocation.watchPosition`). Indicador de distancia si te encuentras fuera del área sin teletransporte forzado.
  - **Tap-to-Move:** Navegación táctil configurable al crear la partida con 4 niveles de velocidad de desplazamiento: Lento (0.8 m/s ~3 km/h), Normal (1.4 m/s ~5 km/h), Rápido (2.8 m/s ~10 km/h) y Muy Rápido (27.8 m/s ~100 km/h), con reajuste perimetral automático si pulsas fuera del radio de juego.
- **Lobby y Explorador de Operaciones en Vivo:**
  - Creación de partidas **Públicas** (visibles en el radar del lobby) o **Privadas** (acceso mediante código de 6 letras o enlace `/?room=CODIGO`).
  - Incorporación y reconexión completa (**Late Join / Reconnect / F5**):
    - Al recargar la página o presionar "Reanudar Misión en Curso", el jugador restaura de inmediato su última posición geográfica en el mapa, su salud, su estado vital (`active` / `critically_wounded`), todo su inventario con su arma principal equipada y sus mascotas adoptadas orbitando a su alrededor.
    - **Preservación Autoritativa de la Velocidad de Sala:** El motor de movimiento recupera de forma estricta la velocidad configurada en los parámetros de la partida (`game.settings.player_speed` / `game.player_speed`), asegurando que cazadores reconectados mantengan el ritmo de desplazamiento exacto (incluyendo 27.8 m/s ~100 km/h en modo Muy Rápido) sin degradarse a la velocidad base por defecto.
    - Mecanismo de persistencia dual: Snapshot sincrónico local (`sessionStorage` y `localStorage` bajo `utopia_player_session_${gameId}`) combinado con persistencia periódica y en eventos clave hacia las columnas `inventory`, `pets` y `status` de la tabla `players` y `player_speed` / `settings` de `games` en Supabase.
    - Centrado automático e inmediato de la cámara de MapLibre GL en la coordenada exacta recuperada del jugador.
- **Protocolo de Cancelación y Abandono:**
  - Cancelación global por el anfitrión con confirmación, limpieza de snapshots y redirección ordenada de la escuadra.
  - Abandono seguro individual desvinculando al jugador de la base de datos y limpiando la sesión local sin romper la partida de los compañeros.

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
