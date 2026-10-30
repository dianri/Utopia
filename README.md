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
  - **Perímetro Defensivo del Cofre (Zona Contenciosa $\le 25\text{m}$):** Si al menos un monstruo vivo se encuentra a 25 metros o menos del cofre activo, el cofre pasa a estado bloqueado (`isChestGuarded = true`). El marcador del mapa exterior muta a un candado carmesí (`🔒 ⚠️ Custodiado`), se inhabilita la apertura manual y automática por proximidad emitiendo un toast táctico (*"ACCESO DENEGADO // Zona hostil activa"*), y si un monstruo penetra en el perímetro mientras el modal de cerrojos está abierto, el minijuego se cierra de forma inmediata interrumpiendo el descifrado.
- **Muerte Temporal y Reaparición Silenciosa (`dead` / `respawning`):**
  - Al caer a 0 HP, el monstruo queda abatido temporalmente durante **60 segundos** sin emitir alertas ni carteles de respawn intrusivos en el HUD.
  - Al expirar los 60s, reaparece silenciosamente en una posición alejada dentro del área de juego con su salud restablecida, reanudando su patrulla sin ruidos ni avisos sonoros molestos.
- **Escalado Concurrente e Identidad Visual de Monstruos por Cofres Activos:**
  - **Monstruo 1 (Fase 1 — Rastreador Sombrío / Stalker):** Depredador rápido y perimetral con icono 🐺, halo rojo carmesí (`border-red-500`, sombra `shadow-red-500/70`), placa táctica `"RASTREADOR SOMBRÍO"` y cabecera de combate en rojo (`AMENAZA: ACECHADOR`).
  - **Monstruo 2 (Fase 2 — Devorador Alfa / Quimera Mecánica):** Engendrado al abrir el Cofre 1 (`monster_2`, 1400 HP, 3.2 m/s). Posee icono 👹, halo púrpura neón (`border-purple-500`, sombra `shadow-purple-500/70`), placa táctica `"DEVORADOR ALFA"` y cabecera de combate en violeta (`AMENAZA: ALFA`).
  - **Monstruo 3 (Fase 3 — Coloso de Sombra / Titan Apex):** Engendrado al abrir el Cofre 2 (`monster_3`, 1600 HP, 3.6 m/s). Posee icono 🐲, silueta ampliada (`scale-110`), halo naranja ígneo / ámbar (`border-amber-500`, sombra `shadow-amber-500/80`), placa táctica `"COLOSO DE SOMBRA"` y cabecera de combate dorada (`AMENAZA: TITÁN APEX`).
  - **Persistencia Concurrente:** Los monstruos existentes persisten y patrullan simultáneamente en el terreno con controladores de IA independientes gobernados en paralelo por el Host, siendo perfectamente distinguibles a simple vista en el mapa satélite y táctico.
- **Cola de Combate Estricta 1 vs 1:**
  - La Arena de Combate (`CombatArena.tsx`) se enfoca estrictamente en un único duelo a la vez (`activeCombatMonsterId`).
  - Si otros monstruos alcanzan al cazador ($\le 20\text{m}$), aguardan fuera en el mapa sin interrumpir ni superponer pantallas de combate.
  - Al derrotar al monstruo actual, si otro monstruo se encuentra en rango inmediato ($\le 20\text{m}$), se realiza una transición táctica automática e inmediata contra la siguiente amenaza.
- **Niebla de Guerra y Radar:**
  - El monstruo permanece oculto en el mapa exterior a menos que esté dentro del radio de visión (70m base, 85m con dron, 105m/120m explorador) o que el Explorador active el **Radar Táctico**.
- **Protocolo de Migración Determinista de Anfitrión / Host Failover (`useHostElection.ts`, `useMonsterAI.ts`):**
  - **Detección Determinista de Desconexión:** Mediante Supabase Realtime Presence (`sync`, `join`, `leave`), todos los clientes conectados rastrean la presencia del anfitrión activo en tiempo real.
  - **Criterio de Sucesión sin Carreras:** Si el host actual cierra el navegador o pierde la conexión, el cliente activo con menor marca temporal de unión (`joinedAt`) o menor ID alfanumérico (`playerId.localeCompare`) asume de inmediato la titularidad de la sala.
  - **Persistencia y Broadcast Inmediato:** El nuevo host electo actualiza la sala en Supabase (`host_id`) y emite un broadcast `host_migrated` al resto de la escuadra.
  - **Reactivación Instantánea del Bucle de IA y Airdrops:** Al recibir el rol, `useMonsterAI.ts` activa de inmediato el bucle de ticks (1000ms) de IA para todos los monstruos de la partida sin requerir recargar la página ni sufrir congelamiento de patrullas o persecuciones.

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
    - **Cabecera Táctica Auto-Alineada (3 Bloques Flexbox):** Icono médico contenido (`+` con `h-10 w-10 shrink-0`), bloque central de información con título *"UNIDAD MÉDICA AVANZADA"*, insignia de bahía e indicador *"SOPORTE VITAL EN CURSO (+15 HP/s)"*, y botón voluntario de salida *"SALIR DE LA BAHÍA"* perfectamente encajado dentro del padding de la tarjeta.
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
- **Píldora Táctica de Alerta y Telemetría Médica (`CriticallyWoundedOverlay.tsx`):** Viñeta roja pulsante en pantalla y píldora compacta horizontal (< 40px de altura) en `top-14` centrada (`max-w-md mx-auto`) con borde carmesí brillante, advertencia de emergencia, distancia métrica (`🏥 {hospitalDistance}m`) y brújula direccional en tiempo real hacia el Hospital de Campaña, despejando completamente la barra de cabecera y los controles de orientación y mapa en pantallas móviles.
- **Aislamiento Táctico del Mapa, Círculo Perimetral y Línea Guía de Emergencia Persistente:**
  - Al entrar en estado herido, **desaparecen todos los iconos del mapa** (monstruo, cofre del tesoro, cajas de suministros, armas en el suelo, mascotas, pings y otros jugadores), manteniendo únicamente visible la estructura del Hospital (`🏥`) y la posición del jugador.
  - **Línea Directa de Evacuación Médica (`hospital-guideline`):** Se traza una línea GeoJSON discontinua de alta visibilidad cian brillante (`#22d3ee`, grosor 3.5px) reforzada con un halo oscuro inferior (`#000000`, grosor 5.5px) que une en tiempo real al combatiente con el Hospital de Campaña, garantizando contraste nítido tanto en modo táctico como sobre fotografía aérea satelital.
  - **Radio Perimetral Herido (`wounded-perimeter`):** Se proyecta un círculo de 12 metros alrededor del avatar herido con relleno carmesí translúcido (`rgba(239, 68, 68, 0.15)`) y contorno discontinuo rojo (`#ef4444`, grosor 2.5px), sustituyendo temporalmente el radio de visión habitual.
  - **Persistencia y Reenganche entre Estilos (Táctico y Satélite):** Tanto la línea de rescate como el círculo perimetral se dibujan y sincronizan activamente en la vista satelital (`MAP_STYLES.satellite`) y en la vista táctica (`MAP_STYLES.tactical`), reenganchándose instantáneamente al conmutar de estilo (`style.load`) o al desplazarse sin latencia ni parpadeo.
  - Al alcanzar >= 20 HP dentro del Hospital y salir del estado herido, todos los elementos del mapa vuelven a mostrarse instantáneamente y los overlays de emergencia se retiran.
- **Recuperación Infinita en Hospital (Sin Derrota Global):** Al alcanzar >= 20 HP dentro del Hospital, el combatiente se estabiliza y reanuda el combate activo. La partida no tiene condición de derrota global (`defeat`); se mantiene en bucle continuo en estado `'playing'` permitiendo reapariciones y curaciones infinitas en el Hospital hasta que la escuadra consiga abrir el cofre del tesoro y alcance la victoria.

---

### ⚔️ 7. Modo Competitivo, Combate PvP en Tiempo Real y Conquista de Cofres
- **Victoria por Mayoría de Cofres (Modo Competitivo Individual):**
  - El juego evoluciona a un formato competitivo donde cada cazador compite individualmente por el dominio de la zona.
  - La partida mantiene la cadena de **3 cofres secuenciales** en el mapa (Fase 1, 2 y 3) con actualización atómica sincrónica en estado local y memoria (`roomRef.current` y `setRoom`), reubicación obligatoria a distancia mínima garantizada ($\ge 70\text{m}$ del cofre previo y del avatar mediante `generateNextChestLocation`), persistencia segura en Supabase con fallback en la función RPC `transition_to_next_chest` (SECURITY DEFINER), período de enfriamiento de 5 segundos (`isChestTransitioning`) y barrera de salida física obligatoria (`lastDecryptedChestLocationRef`, $> 25\text{m}$) para imposibilitar reaperturas indeseadas sobre el jugador estático:
    - **Cofre 1 (Fase 1):** Aparece al iniciar la partida con 6 cerrojos distribuidos en minijuegos tácticos.
    - **Cofre 2 (Fase 2):** Al ser descifrado, desaparece del mapa y otorga **1 punto de cofre** al jugador que superó el último cerrojo (`chests_opened`). Se engendra el Cofre 2 en un nuevo sector distante del área y convoca al Devorador Alfa.
    - **Cofre 3 (Fase 3):** Al completarse el cofre 2, se otorga el punto al jugador que lo descifró, desaparece y se despliega el tercer y último cofre en otra ubicación remota junto al Coloso de Sombra.
  - **Vencedor Oficial de la Sesión y Pantalla de Fin de Partida (`VictoryModal.tsx`):** Al descifrar el tercer cofre, gana la partida el jugador con **mayor cantidad de cofres abiertos** (desempatando por bajas enemigas/PvP, daño infligido y menor cantidad de caídas a estado herido grave). La pantalla de fin de partida adapta su cabecera según el destinatario: el campeón recibe *"¡VICTORIA ABSOLUTA!"* y confeti triunfal, mientras que el resto observa *"OPERACIÓN FINALIZADA"*, el nombre del ganador oficial y su posición individual (*"Tu clasificación: #[X]"*). El marcador final clasifica limpiamente a todos los agentes en 4 columnas (# POS con medallas 🥇🥈🥉, Agente con distintivo `[TÚ]`, Cofres 👑 [X/3] y Bajas 💀) con resaltado cian para el usuario local y ámbar para el vencedor.
- **Duelo PvP Automático en Tiempo Real (`PvPArena.tsx` / `usePvPCombat.ts`):**
  - **Avatar Central Interactivo del Rival (Mecánica Tap-to-Attack unificada):**
    - El objetivo enemigo se proyecta en el centro de la arena como un avatar táctico circular de gran tamaño (`h-36 w-36`) con borde neón carmesí hostil, resplandor pulsante (`animate-ping`) y soporte para toque táctil directo en pantallas móviles y clic en PC (`onClick` / `onTouchStart`), unificando la memoria muscular con el combate PvE.
    - Al pulsar sobre el avatar del adversario, se dispara inmediatamente el arma equipada (o ataque básico) sincronizando el daño por Supabase Realtime, reproduciendo el sonido balístico/cuerpo a cuerpo correspondiente y activando una animación de sacudida (`animate-hitShake`) y destello blanco de impacto (`animate-flash`).
    - La barra de salud del oponente (HP [X/100]) y sus cofres conquistados se mantienen destacados justo encima del avatar para visualizar la reducción continua de vida con cada impacto.
  - **Radio de Encuentro Agresivo (<= 12m):** Si dos jugadores activos (`status === 'active'`) se encuentran a 12 metros o menos en el mapa exterior, se dispara de inmediato la arena de combate PvP para ambos participantes, cancelando las trayectorias de movimiento.
  - **Zonas Seguras Inviolables (Refugios y Hospital de Campaña):** Si cualquiera de los dos jugadores está dentro del perímetro de un Refugio o del Hospital, **el combate PvP no puede iniciarse bajo ninguna circunstancia**. Si un jugador en persecución entra a una zona segura antes de abrirse la arena, queda protegido.
  - **Aislamiento Táctico y Cola de Monstruos ("Burbuja de Duelo"):** Mientras los dos jugadores luchan en la arena PvP, los monstruos no pueden intervenir ni interrumpir la pelea. Si un monstruo entra en rango durante el duelo, queda en espera exterior en el mapa (en cola de combate). Al concluir el duelo, el vencedor (si permanece en rango) inicia secuencialmente el combate 1 vs 1 contra el monstruo en cola.
  - **Interrupción Inmediata de Desencriptación de Cofres:** Si un jugador es emboscado o alcanzado por un rival ($\le 12\text{m}$) mientras se encuentra descifrando un cofre en `ChestLockModal`, el defensor es expulsado de inmediato del minijuego, cancelando su interacción y desplegando la arena `PvPArena` cara a cara con el agresor con alerta sonora y táctica. El progreso de cerrojos previamente resueltos (ej. 3/6) se preserva intacto sin penalización.
  - **Sincronización Atómica de Derrota PvP y Blindaje contra Re-enganche:** En cuanto la salud de un duelista llega a cero, se emite una notificación de derrota en tiempo real (`pvp_player_defeated` y `pvp_defeat` con marca temporal) y se persiste atómicamente en Supabase (`hp: 0, status: 'critically_wounded'`). El cliente del vencedor procesa el evento al instante, cierra la arena PvP, entona la fanfarria de victoria y actualiza la lista local de jugadores. El evaluador de proximidad (`canEngageInPvP`) bloquea de forma estricta cualquier intento de re-enganche si cualquiera de los combatientes tiene `hp <= 0` o se encuentra en estado crítico, erradicando bucles infinitos contra rivales caídos e inmunizándolos en el suelo hasta su traslado y reanimación en el Hospital de Campaña.
  - **Activación Bidireccional de Duelo por Marcador en el Mapa y Corrección de Asimetría al Reconectar:**
    - Se incorporó interacción táctica al pulsar directamente sobre el marcador de un rival en el mapa exterior (`onPlayerMarkerClick`): si la distancia es $\le 15\text{m}$, desencadena el duelo PvP cara a cara; si el contrincante está distante, traza la navegación asistida hacia sus coordenadas.
    - Al reconectar a la partida, se limpian de forma atómica los flags y cooldowns de combate residuales (`isPvPModalOpen: false`, `fleeImmunityUntil: 0`), se reevalúa `in_safe_zone` según las coordenadas vivas frente a estructuras y se remonta limpiamente el canal Realtime (`connectionEpoch`), erradicando cualquier asimetría de detección entre el jugador reconectado y sus rivales.
  - **Failover Determinista de Host y Watchdog de IA (`useMonsterAI.ts` / `useHostElection.ts`):** Supervisión continua del host activo basada en `presenceState` determinista (ordenado por `joinedAt` y `playerId`). Si el host abandona la sesión o no emite ticks durante más de 5 segundos (`host_heartbeat`), el siguiente jugador conectado y con vida toma el relevo automáticamente activando el bucle de simulación de monstruos sin recargar la página.
  - **Canal de Sincronización Bidireccional (`pvp_combat_${combatId}`):** Comunicación efímera por Supabase Realtime donde cada participante transmite disparos, daño de armas equipadas, bonificaciones de clase, ataques automáticos de mascotas compañeras, sincronización de salud y desenlaces (victoria, derrota crítica o retirada táctica).
- **Apertura Inmediata por Coordenadas y Clic Táctico con Navegación Viva (`CHEST_TRIGGER_RADIUS = 15m`):** Al desplazarse y cruzar el umbral de 15 metros del cofre activo, el movimiento se detiene automáticamente mediante un cerrojo por referencia (`hasTriggeredChestOpenRef`) y se abre de inmediato la interfaz de descifrado (`ChestLockModal`), erradicando bucles de cancelación y llamadas circulares recursivas. Pulsar directamente sobre el marcador de TESORO (👑) en el mapa lee de forma continua la referencia en tiempo real (`activeChestCoordsRef`), dirigiendo con precisión milimétrica la navegación asistida hacia las coordenadas actuales del cofre en la fase vigente (incluyendo Cofre 2 y Cofre 3 sin retención de cierres obsoletos) e iniciando la desencriptación al ingresar en el radio de 15m.
- **Minijuegos Cooperativos por Fases:**
  1. **Fase 1 (Sincronización QTE):** Puntería temporal sobre zonas oscilantes.
  2. **Fase 2 (Código Lumínico / Simón Dice):** Secuencia de memoria táctica de 3 a 4 colores con feedback audiovisual inmediato interactivo.
  3. **Fase 3 (Frecuencia Magnética):** Dial rotatorio sintonizador con respuesta háptica.
- **Furia Defensiva del Monstruo:** Cuando cualquier agente inicia el desbloqueo de cualquier cofre activo, el monstruo entra en modo `defend_chest` y corre directamente hacia las coordenadas del cofre.
- **Aislamiento por Partida:** Estado de desbloqueo estricto por ID único de sala (`game.id`), evitando que nuevas partidas hereden progreso residual.

---

### 📱 8. Optimización Mobile-First y HUD Táctico
- **Vista Satélite por Defecto y Selector Táctico FAB (Terreno Real vs. Modo Oscuro):** La simulación táctica arranca predeterminadamente con ortofoto satelital de alta resolución (ArcGIS World Imagery), permitiendo reconocer calles, edificios y terreno real en el teatro de operaciones. Las 8 capas GeoJSON de influencia y emergencia táctica (perímetro, zona del cofre, visión del jugador, suministros, hospitales/refugios, radios de interacción, círculo perimetral del herido y línea directa de auxilio médico con halo oscuro) se proyectan con alto contraste lumínico (cian `#00f2fe` / `#22d3ee`, carmesí `#ef4444` y ámbar `#ffd000`) de forma persistente y sin pérdidas sobre la fotografía aérea. Los controles de la esquina superior derecha (brújula interactiva 🧭 para reorientar al norte y botón selector TÁCTICO / SATÉLITE) están integrados en una columna vertical unificada (`fixed top-20 right-4 z-30 flex flex-col items-center gap-3`), eliminando cualquier solapamiento físico en móvil y PC con respuesta sonora (`playRadarPing`) y háptica (`vibrate`).
- **Eliminación Total de Widgets Invasivos del Cofre y Apertura 100% Automática:** El widget de progreso y botón manual de desencriptación (`ChestCountdown.tsx`) ha sido completamente retirado de la interfaz gráfica exterior, dejando la esquina superior izquierda y el mapa 100% despejados tanto en móvil como en PC. La desencriptación se activa de forma totalmente automática e imperativa al entrar en el radio de 15 metros de las coordenadas del cofre (o al pulsar directamente sobre el marcador de TESORO en el mapa), deteniendo el movimiento y montando al instante la consola táctica de cerrojos (`ChestLockModal.tsx`).
- **Alerta Unificada de Instalación Médica:** Tarjeta horizontal compacta (`IndoorStatusBanner.tsx`, altura máx. 44px `max-h-11` en móvil) que unifica el estado de salud y el acceso directo al Pod de Regeneración (`"INGRESAR"`), eliminando banners superpuestos en la cabecera del mapa.
- **Barra de Acciones Inferior Unificada (Flexbox Táctico):** Integración en una sola fila responsive (`fixed bottom-4 left-3 right-3 flex items-center gap-2 z-30 pointer-events-none`) del botón de Mochila (`w-12 h-12 shrink-0`), la tarjeta de Arma Equipada (`flex-1 min-w-0` con textos adaptables que evitan truncamientos agresivos) y el botón circular de Habilidad/Cura (`w-12 h-12 sm:w-14 sm:h-14 shrink-0`), garantizando cero solapamientos entre la munición y las acciones del cazador.
- **Soporte para Safe Area:** Separación inferior del panel de armas (`pb-[env(safe-area-inset-bottom)]`) evitando colisiones con la barra de navegación del sistema operativo móvil.
- **Contenedor Flex Vertical de Alertas Tácticas Centrales:** Alertas médicas de hospital y avisos de límites de perímetro apiladas en columna central (`top-20 z-40 flex-col gap-2`) completamente despejadas y sin solapamiento con otros controles (reemplazando banners invasivos de respawn por reapariciones silenciosas).
- **Autocierre de Mensajes de Bitácora:** Desvanecimiento temporal del log de combate (`CombatLog.tsx`) tras 3.5 segundos de inactividad para mantener despejada la vista de mapa.
- **Renderizado Seguro de Marcadores en MapLibre:** Guardia estricta de ciclo de vida del mapa WebGL y revelación diferida mediante doble `requestAnimationFrame` que elimina cualquier parpadeo de marcadores en la coordenada `(0, 0)`.
- **Blindaje contra Desreferenciación Nula en MapLibre GL (`isMapStyleLoaded`):** Protección estricta con guardas de estilo cargado (`isMapStyleLoaded`) y bloques defensivos `try/catch` en todas las consultas de capas y fuentes (`getLayer`, `getSource`, `setLayoutProperty`) de `GameMap.tsx`. Al alternar en caliente entre vista satelital y táctica o durante transiciones reactivas del mapa WebGL, las operaciones que actualizan visibilidad o capas de emergencia se difieren de forma segura mediante `map.once('style.load')` erradicando excepciones `TypeError: Cannot read properties of null (reading 'getLayer')`.
- **Sincronización Estricta y Purga de Círculos GeoJSON de Interacción:** Eliminación total de círculos huérfanos cian y verdes vacíos en el mapa exterior. Las capas GeoJSON (`crates-zones`, `interaction-ranges` y `structures-zones`) derivan sus geometrías exclusivamente del listado de entidades activas, no recolectadas y con coordenadas válidas (`lat !== 0 || lng !== 0`). Al saquear una caja o recoger un arma arrojada, los marcadores DOM y sus radios de interacción correspondientes (40m para cajas, 25m para botín y mascotas) se purgan al instante tanto del canvas de MapLibre GL como de la persistencia de sala en Supabase. Si el jugador entra en estado herido grave (`isMeWounded`), todos los radios de interacción se vacían sincrónicamente con el desmontaje de sus elementos interactivos.
- **Marcadores del Mapa Exterior Libres de Recuadros y Renderizado 3D Nítido:** Erradicados los marcos cuadrados artificiales (`border-2 rounded-lg bg-...`) en MapLibre GL. Los cofres, suministros, airdrops, refugios, hospital, armas caídas y mascotas se proyectan directamente sobre la ortofoto satelital como objetos isométricos 3D a escala generosa (48-56px), con sombras proyectadas realistas (`drop-shadow-[0_6px_12px_rgba(0,0,0,0.95)]`) y cápsulas de telemetría flotantes independientes (`MUNICIÓN (40m)`, `REFUGIO ALFA (15m)`).
- **Mochila Táctica con Armamento e Iconografía de Mascotas 3D:** La interfaz de `BackpackModal.tsx` incorpora las ilustraciones de armas 3D de alta fidelidad sin marcos pesados (`h-14 w-14 object-contain`) en la pestaña de Equipo y miniaturas 3D de mascotas con salvaguarda defensiva `onError` y sombras tácticas, eliminando volcados erróneos de rutas de texto.

---

## 🕹️ Modos de Movimiento y Conectividad

- **Movimiento Dual:**
  - **GPS Real:** Geolocalización de alta precisión en vivo (`navigator.geolocation.watchPosition`). Indicador de distancia si te encuentras fuera del área sin teletransporte forzado.
  - **Tap-to-Move:** Navegación táctil configurable al crear la partida con 4 niveles de velocidad de desplazamiento: Lento (0.8 m/s ~3 km/h), Normal (1.4 m/s ~5 km/h), Rápido (2.8 m/s ~10 km/h) y Muy Rápido (27.8 m/s ~100 km/h), con reajuste perimetral automático si pulsas fuera del radio de juego.
- **Lobby y Explorador de Operaciones en Vivo:**
  - **Validación Visual Reactiva por Campo (`CreateRoomModal.tsx`, `JoinRoomModal.tsx`):** Control estricto de campos obligatorios en los formularios de Crear y Unirse a Partida. Si el usuario pulsa "CREAR PARTIDA" o "UNIRSE A LA PARTIDA" con campos vacíos, el sistema activa al instante bordes carmesí brillantes (`border-red-500`), fondo tintado (`bg-red-950/25`), resplandor táctico y microtexto de advertencia explicativo (*"⚠️ El nombre de agente es obligatorio..."* / *"⚠️ El código de sala es obligatorio..."*), enfocando automáticamente el primer campo no completado sin bloqueos silenciosos. Al teclear el primer carácter, el error se disipa de inmediato restaurando el estilo cian táctico estándar.
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

| Clase | Icono Táctico | Rol Táctico | Habilidad Especial / Ventaja |
| :--- | :--- | :--- | :--- |
| **Médico** | `/assets/icons/roles/role-medic.png` | Soporte y Sanación | Reanimación rápida y radio de curación táctica ampliado a 35m. |
| **Tanque** | `/assets/icons/roles/role-tank.png` | Primera Línea | +50% de vida base (150 HP) y atracción prioritaria del aggro del monstruo. |
| **Explorador** | `/assets/icons/roles/role-scout.png` | Reconocimiento | Radio de visión de 105m y habilidad activa **Radar Táctico** (revela al monstruo a toda la escuadra). |
| **Tirador** | `/assets/icons/roles/role-marksman.png` | Daño a Distancia | +35% de daño con armas de fuego y mayor alcance efectivo de disparo. |

---

## 🎨 Iconografía Táctica Militar (Suite 50 Assets PNG)

El juego cuenta con un atlas completo de **50 iconos tácticos militares ciberpunk** con transparencia alfa limpia generados y organizados en `public/assets/icons/`:

- **App & Hero (`app/`):** Logo táctico vectorial (`app-logo.png`) y emblema biomecánico de portada (`app-hero.png`).
- **Cofres del Tesoro (`chests/`):** Cofre activo iluminado (`chest-active.png`), custodiado bajo alarma perimetral (`chest-guarded.png`), saqueado/abierto (`chest-looted.png`) y microchip de cerrojos (`chest-key-chip.png`).
- **Cajas de Suministros & Airdrops (`crates/`):** Airdrop en paracaídas (`crate-airdrop.png`), caja de munición (`crate-ammo.png`), dial magnético de fase (`crate-dial.png`), caja de explosivos (`crate-explosives.png`), botiquín médico (`crate-medkit.png`) y caja de armamento (`crate-weapons.png`).
- **HUD & Navegación (`hud/`):** Modo audio activo (`hud-audio-on.png`), modo sigilo táctico (`hud-audio-stealth.png`), acceso a mochila táctica (`hud-backpack.png`), brújula al norte (`hud-compass.png`), botón de salida de misión (`hud-leave-mission.png`), centrado de cámara (`hud-locate-center.png`), conmutador de satélite (`hud-map-satellite.png`), conmutador táctico (`hud-map-tactical.png`), trofeo de campeón (`hud-trophy.png`), y pings de auxilio, peligro y botín (`ping-assist.png`, `ping-danger.png`, `ping-loot.png`).
- **Monstruos Biomecánicos (`monsters/`):** Rastreador Sombrío (`monster-stalker.png`), Devorador Alfa (`monster-alpha.png`) y Coloso de Sombra (`monster-colossus.png`).
- **Mascotas Silvestres y Compañeros (`pets/`):** Perro Guardián (`pet-dog.png`), Dron Táctico (`pet-drone.png`), Roedor Eléctrico (`pet-electric-mouse.png`), Conejo Veloz (`pet-rabbit.png`), Gato Callejero (`pet-cat.png`) y Robot Médico (`pet-medbot.png`).
- **Roles y Estados de Agente (`roles/`):** Insignias de Médico (`role-medic.png`), Tanque (`role-tank.png`), Explorador (`role-scout.png`), Tirador (`role-marksman.png`), Agente Herido de Muerte (`player-wounded.png`) y Modo Fantasma (`player-ghost.png`).
- **Estructuras Tácticas (`structures/`):** Hospital de Campaña (`structure-hospital.png`), Refugio Táctico (`structure-shelter.png`) y Cápsula Bio-Médica del Pod (`hospital-pod.png`).
- **Arsenal y Armas (`weapons/`):** Puños (`weapon-fists.png`), Cuchillo táctico (`weapon-knife.png`), Hacha táctica (`weapon-axe.png`), Pistola 9mm (`weapon-pistol.png`), Escopeta de postas (`weapon-shotgun.png`), Fusil táctico M4 (`weapon-rifle.png`), Granadas (`weapon-grenade.png`) y Lanzacohetes RPG (`weapon-rpg.png`).

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
