# Las Meriendas: Monster Hunt 👹⚔️

> **Utopia** — Juego web táctico y cooperativo de geolocalización en tiempo real desarrollado como Progressive Web App (PWA).

---

## 🎮 Descripción General

En **Las Meriendas: Monster Hunt**, una escuadra de cazadores debe coordinarse en un mapa táctico del mundo real para explorar estructuras, adoptar compañeros de apoyo, gestionar mochilas de armamento, enfrentarse en combates por turnos/tiempo real contra el temible **Monstruo de Las Meriendas** y desbloquear cooperativamente las fases de seguridad del cofre del tesoro para asegurar la victoria.

---

## ⚡ Novedades y Mecánicas Principales

### ⚔️ 1. Combate Táctico en Modo Arena (RPG / Puntería Activa Touch-Target)
- **Eliminación del Auto-Combate Pasivo y Botón Estático:** Se ha suprimido el ataque automático y el botón estático rectangular "ATACAR". Toda la ofensiva en combate se traslada a la puntería táctica interactiva directa sobre el cuerpo del adversario.
- **Sistema de Puntería y Evasión Dinámica (`Touch-Target Evasion Combat` / `useEnemyEvasion.ts`):**
  - **Hitbox Compacta y Exclusión Central (Anti-Camp):** Se redujo el tamaño base de la figura de 112-128px a 64-80px (`w-16 h-16 sm:w-20 sm:h-20`), obligando a un desplazamiento mínimo radial de seguridad ($\ge 25\text{-}30\text{px}$) en cada salto. El objetivo nunca permanece fijo en las coordenadas centrales `(0, 0)`, erradicando el exploit de pulsar en el medio de la pantalla y forzando al jugador a seguir activamente la trayectoria del blanco.
  - **Escala Procedural Dinámica (Breathing / Zooming Target):** El adversario varía su tamaño aleatoria y orgánicamente entre 0.70x y 1.25x en cada ciclo de evasión y respuesta a daño (según el arquetipo de amenaza), generando sensación de profundidad física y alterando en tiempo real la dificultad del disparo.
  - **Desplazamiento Evasivo Procedural:** El avatar 3D se traslada en rangos adaptados a su agilidad (`stalker` / `scout`: 650ms, $\pm 95\times 60\text{px}$; `alpha` / `marksman`: 850ms, $\pm 85\times 55\text{px}$; `colossus` / `tank`: 1200ms, $\pm 70\times 45\text{px}$).
  - **Puntería Táctil Requerida e Impacto Físico:** Tocar con precisión al enemigo acciona el arma equipada, genera micro-reacción física (`scale(currentScale * 0.88)` y destello `brightness-150 animate-hitShake`) y fuerza una esquiva evasiva instantánea del blanco hacia una nueva coordenada de fuga.
  - **Penalización por Disparo Fallido:** Tocar el área vacía fuera del cuerpo del enemigo cuenta como disparo fallido: consume 1 bala de munición, proyecta una marca visual momentánea de impacto fallido (❌) y muestra el texto flotante `"¡FALLO!"` en tono grisáceo.
  - **Retícula Giratoria e Indicador Táctico:** El objetivo está rodeado por un círculo indicador de impacto en rotación continua (`animate-spinSlow`) y la base de la carta incorpora la directriz táctica concisa y adaptativa *"🎯 TOCA AL BLANCO PARA DISPARAR"* (PvE) / *"🎯 TOCA AL RIVAL PARA DISPARAR"* (PvP), blindada contra desbordamientos y recortes laterales en cualquier ancho de pantalla móvil (`inset-x-2`, `truncate`).
- **Arena de Combate Interactiva (`CombatArena.tsx` y `PvPArena.tsx`):** Al aproximarse a menos de 20 metros del monstruo (o enfrentarse a un rival), el jugador entra en la interfaz táctica:
  - **Aislamiento Estricto de Duelo 1v1 (`currentDuelMonster` / `activeCombatMonsterId`):** La arena se vincula de manera irrevocable y exclusiva al ID específico de la entidad desafiada (`activeCombatMonsterId`). Se erradica cualquier caída o fallback predeterminado a `monsters[0]` o `monster_1`. Si el jugador combate contra el Monstruo 2 o 3, la interfaz renderiza únicamente sus estadísticas y el daño infligido se aplica de forma atómica a dicha criatura en la base de datos y Supabase Realtime.
  - Barra de vida global y compartida del monstruo sincronizada por Supabase Realtime.
  - **Avisos Flotantes de Mascotas Despejados del Centro:** Las notificaciones de ataque y mitigación de mascotas se proyectan en el flanco superior derecho (`top-2.5 right-2.5`) con píldoras minimalistas (`.floating-pet-notice`, `.animate-floatNotice`) y blindaje táctil absoluto (`pointer-events: none !important`), liberando al 100% el centro de la arena para que el jugador visualice y toque al enemigo evasivo sin intercepciones.
  - **Bucle Continuo de Contraataque del Monstruo:** El monstruo ataca periódica y sostenidamente cada 2.5s (20-24 DMG), acelerándose a 1.8s con daño potenciado (28-34 DMG) al entrar en modo furia (`isEnraged`), con sacudida de pantalla, viñeta roja e impacto auditivo/háptico.
  - **Escudo Táctico de Mascotas y Mitigación:** Las mascotas activas y vivas forman una barrera protectora de primera línea para el cazador. El monstruo concentra su ataque de forma secuencial sobre una mascota a la vez; mientras quede al menos un compañero con vida, el jugador no recibe daño a su salud. Al caer una mascota (0 HP / incapacitada), el daño pasa a la siguiente. Solo si todas caen (o si el jugador carece de mascotas), el monstruo golpea la salud del cazador. Además, la habilidad del Tanque reduce el daño en un 50% y la pasiva del Gato Callejero otorga un 10% de probabilidad de esquivar el ataque por completo.
  - **Daño Monotónico y Umbral de Muerte:** La salud del jugador se reduce de forma estricta y decreciente sin oscilaciones ni sobrescrituras por sincronización en red; al llegar a <= 0 HP, pasa inmediatamente a "Herido de Muerte" (1 HP), cerrando el combate para iniciar el repliegue al Hospital.
  - **Opción de Huida Táctica Centralizada:** Botón "HUIR (5S SPRINT)" expandido y centrado a ancho completo que otorga un sprint de emergencia (+30% de velocidad durante 5s) e inmunidad temporal de combate, reseteando síncronamente `activeCombatMonsterId = null` y limpiando cualquier temporizador de duelo activo.
- **Disparo y Ataque Universal a Distancia desde el Mapa Exterior (Fases 1, 2 y 3):**
  - **Identificación Dinámica de Blanco:** Cada marcador de monstruo en MapLibre GL porta su identificador único (`data-monster-id`). Al pulsar sobre cualquier criatura viva en el mapa, el sistema recupera la entidad más reciente desde referencias mutables en tiempo real, garantizando la operatividad contra los Monstruos 2 y 3 tras abrir cofres de fase previa sin cierres obsoletos.
  - **Ataque con Armas de Fuego a Distancia:** Si el jugador equipa un arma de fuego (pistola, rifle, escopeta), se calcula la distancia geodésica exacta frente al monstruo tocado. Si se halla dentro del alcance efectivo (`equippedWeapon.rangeMeters`, potenciado un +50% por la habilidad del Tirador), se efectúa el disparo directo desde el mapa: consume munición, dispara el audio procedural (`playGunshot`), activa la vibración táctica y la animación en la rueda de armas (`WeaponWheel`), y emite el daño atómico por Supabase Realtime (`monster_damaged`) asignado específicamente a ese `targetMonster.id`.
  - **Avisos Tácticos de Alcance:** Si el blanco se encuentra más allá del alcance de fuego, se proyecta un aviso informativo con los metros actuales y requeridos, orientando la navegación asistida hacia sus coordenadas.
  - **Apertura de Arena por Contacto o Melee:** Si el jugador interactúa con el monstruo sin arma de fuego o en distancia de combate cuerpo a cuerpo ($\le 5\text{m}$), se abre de inmediato la arena táctica fijando `activeCombatMonsterId = targetMonster.id`.

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
  - **Ataque en Mapa y Triple Capa Anti-Fantasmas (`useMonsterAI.ts` / `monsterAI.ts`):** A distancia $\le 15\text{m}$, inflige 24 DMG cada 1.2s (35 DMG en Fase 2). Todo ataque exterior pasa por un triple filtro estricto: 1) Monstruos convalecientes (`wounded` o $\le 0$ HP) no pueden atacar; 2) La distancia física real debe ser $\le 28\text{m}$ geodésicos; y 3) Jugadores inmersos en una arena de duelo activa quedan blindados contra agresiones simultáneas de monstruos del mapa exterior.
- **Fase 2: Modo Enfurecimiento (`enraged` al $\le 30\%$ HP / 150 HP):**
  - **Rugido Sísmico:** Reproduce alerta y rugido procedural en toda la escuadra.
  - **Onda de Ralentización:** Ralentiza a todos los cazadores al aire libre a $\le 35\text{m}$ durante 5 segundos.
  - **Aceleración Drástica:** Incrementa su velocidad un **+40% (4.5 m/s / ~16.2 km/h)**, superando el sprint de los jugadores.
  - **Aggro Ampliado:** Radio de detección incrementado a 120 metros.
- **Furia Defensiva del Cofre (`defend_chest`):**
  - **Generación Anclada al Perímetro del Cofre (`spawnNearTreasure`):** Cada criatura custodia se engendra de forma procedural a una distancia táctica de 15 a 35 metros alrededor de las coordenadas del cofre activo, garantizando coherencia territorial en cada fase de la cacería.
  - Se activa en el instante en que cualquier cazador abre el minijuego de cerrojos del cofre.
  - Cancela la patrulla y corre en **sprint directo hacia el cofre a 3.8 m/s** (4.2 m/s enfurecido).
  - Al llegar a $\le 30\text{m}$, ataca a los defensores en el radio de 25m del tesoro, forzando la apertura de la Arena de Combate e interrumpiendo el minijuego.
  - **Perímetro Defensivo del Cofre (Zona Contenciosa $\le 25\text{m}$):** Si al menos un monstruo vivo se encuentra a 25 metros o menos del cofre activo, el cofre pasa a estado bloqueado (`isChestGuarded = true`). El marcador del mapa exterior muta a un candado carmesí (`🔒 ⚠️ Custodiado`), se inhabilita la apertura manual y automática por proximidad emitiendo un toast táctico (*"ACCESO DENEGADO // Zona hostil activa"*), y si un monstruo penetra en el perímetro mientras el modal de cerrojos está abierto, el minijuego se cierra de forma inmediata interrumpiendo el descifrado.
- **Persistencia Física de Monstruos Convalecientes, Alerta de Reanimación y Bucle de Revival (`wounded` / `defeated`):**
  - **Permanencia Física como Criatura Herida:** Al reducir los puntos de vida del monstruo a 0 HP, la criatura no desaparece ni se descarta del mapa exterior. Permanece físicamente sobre sus últimas coordenadas en estado convaleciente con `isGuardingChest: false`, `hp: 0`, `defeatedAt` y registro de autoría (`defeatedBy`).
  - **Diseño Gráfico de Monstruo Herido y Alerta de Reanimación (`.monster-corpse-marker`):** El sprite se muestra derribado sobre el terreno (`rotate(65deg) scale(0.9)`), conservando el contraste y coloración de la criatura para distinguirse nítidamente sobre la ortofoto satelital. Incorpora la animación continua de latido táctico `@keyframes monsterRevivalPulse` (1.3s) con modulación de escala y resplandor carmesí brillante en `drop-shadow`, simulando una reactivación latente inminente. El marcador se acompaña de la insignia militar compacta de advertencia `⚠️ HERIDO` con fondo carbón y reborde rojo parpadeante.
  - **Bucle de Convalecencia y Reanimación Automática (35s):** Gobernado por el controlador de IA del host, el monstruo permanece inmovilizado y sin agresividad durante 35 segundos. Al expirar el temporizador, se reanima automáticamente con su vitalidad al 100% (`hp: maxHp`, `status: 'patrolling'`), emite su rugido táctico (`playMonsterRoar`) y reanuda la patrulla perimetral e iniciación de combate.
  - **Permeabilidad e Interacción Libre de Clics:** El marcador del monstruo herido cuenta con `pointer-events: none`, permitiendo a los cazadores interactuar libremente con el terreno, airdrops o el cofre del tesoro sin obstrucciones de clic mientras dure su convalecencia.
  - **Condicionamiento de Círculos GeoJSON a la Visión del Jugador:** Los círculos de amenaza roja (`#ef4444`) en la capa GeoJSON solo se proyectan para monstruos **vivos** que estén activamente avistados dentro del radio de visión del avatar o con radar activo; los enemigos ocultos en la niebla de guerra nunca revelan su posición ni proyectan geometrías. Los monstruos heridos no proyectan ningún círculo hasta su reanimación.
  - **Erradicación de Círculos Residuales en el Tesoro:** Se eliminan los círculos ámbar residuales en cofres desbloqueados. El cofre únicamente proyecta un perímetro rojo (`#ef4444`, 25m) si está activamente custodiado por un monstruo vivo y se encuentra en el rango de visión del jugador. Al caer el monstruo, la custodia se libera instantáneamente (`isChestGuarded = false`) y el cofre queda despejado sin círculos invasivos.
- **Sistema de Botín Táctico por Abatimiento de Monstruos (*Loot Drop*):**
  - **Generación Inmediata de Recompensa:** Al reducir los puntos de vida de cualquier monstruo a 0 HP o entrar en estado convaleciente/herido, la criatura engendra de forma autoritativa en el terreno dos recompensas tácticas inmediatas: un **arma de fuego** y una **caja de vida (botiquín militar)**.
  - **Desfase Geodésico Separador (2.5m):** Los objetos caídos se dispersan mediante cálculo geodésico (`getDestinationPoint`) a 2.5 metros en rumbos opuestos (el arma al Noreste a 45° y el botiquín al Suroeste a 225°), evitando que queden ocultos bajo el cuerpo caído del monstruo o solapados entre sí.
  - **Armamento Escalado por Fase de Cacería:** El arma generada se adapta a la fase del cofre activo: Fase 1 (pistola, escopeta o rifle táctico), Fase 2 (rifle de asalto, escopeta de combate o granada táctica) y Fase 3 (lanzacohetes RPG pesado, granada o rifle de asalto).
  - **Botiquín Táctico de Campaña (+100 HP):** Restaura de forma instantánea 100 puntos de salud (calibrado a la nueva escala de 300 HP base). Si el jugador que lo recoge se encuentra en estado crítico o herido, el botiquín lo estabiliza (`isCriticallyWounded: false`), restaurando su estado operativo (`status: 'active'`) sin necesidad de regresar obligatoriamente al hospital.
  - **Interacción Dual Táctil y Recogida Automática por Proximidad:** Los objetos caídos se pueden recoger tocando su marcador en el mapa exterior a una distancia de hasta 25 metros o pasando por encima de ellos (recogida automática al entrar en su perímetro de 12 metros).
  - **Sincronización Autoritativa del Host y Supabase Realtime:** El host de la sala coordina la creación de los objetos caídos, previene duplicados mediante la propiedad `lootDropped` y el control de IDs, persiste las entidades en Supabase y emite los eventos `spawn_entity` e `item_dropped` a todos los jugadores conectados. Al completarse el ciclo de reanimación del monstruo tras 35 segundos, el estado se resetea permitiendo nuevas recompensas en futuros abatimientos.
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
- **Cupo Máximo de Mascotas por Jugador (Máximo 3 Simultáneas):** Cada cazador puede vincular un máximo de 3 mascotas a la vez en su comitiva. Si un agente con 3 mascotas interactúa con una mascota silvestre en el mapa, el sistema inhibe cualquier alarma molesta o vibración de error, muestra el aviso táctico *"Escuadra completa (3/3 mascotas activas)."*, y desplaza de forma asistida al jugador hacia las coordenadas de la mascota sin bloquear su movilidad ni desincronizar la interfaz.
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
- **Hospital de Campaña Único (`🏥`) // Bahía Táctica de Bio-Regeneración (`HospitalModal.tsx`):**
  - **Instalación Médica Centralizada:** El sector operativo cuenta con un **único Hospital de Campaña oficial** dedicado a la estabilización, curación y reanimación médica de los cazadores y sus mascotas.
  - **Radio de Influencia y Curación (20m):** Cuenta con un equilibrado radio táctico de **20 metros** con detección y entrada automática a la bahía médica, complementado por imán táctico de destino (*snap-to-center*) al pulsar el marcador HTML del edificio o tocar el terreno a <= 25 metros del centro, garantizando la recuperación al 100% y una delimitación ceñida a la edificación física.
  - **Directriz Fija de Evacuación Médica:** Al caer en estado crítico o herido (`isCriticallyWounded`), el vector de emergencia (overlay SVG) traza de forma unívoca y constante la directriz roja discontinua hacia las coordenadas de este único hospital.
  - **Desencadenante Inteligente de Entrada y Aislamiento de Curación:** Si el jugador o alguna de sus mascotas tienen < 100% de HP o sufren estado crítico/herido (`critically_wounded` / `isWounded`), ingresar al hospital abre automáticamente la **Bahía de Regeneración Táctica** (`HospitalModal.tsx`) y detiene el movimiento del personaje (`cancelMovement()`) mientras dure el tratamiento médico. Toda regeneración de salud transcurre de forma visible y audible en dicha interfaz, sin curación pasiva silenciosa en segundo plano. Si la escuadra ya se encuentra sana al 100%, se presenta de manera unificada y sin parpadeos el cartel estático superior: *"INSTALACIÓN MÉDICA: HOSPITAL // Todos los signos vitales se encuentran al 100%"* (`IndoorStatusBanner.tsx`), silenciando toasts flotantes repetitivos y ocultando botones intermitentes.
  - **Interfaz Ciberpunk / Bio-Médica Militar:** Inspirada en la arquitectura visual de la Arena de Combate (`CombatArena.tsx`), adaptando la ambientación a tonos verde esmeralda (`#10b981`), cian bio-médico (`#06b6d4`), tramas de escáner y cruces de auxilio pulsantes (`🏥` / `➕`):
    - **Cabecera Táctica Auto-Alineada (3 Bloques Flexbox):** Icono médico contenido (`+` con `h-10 w-10 shrink-0`), bloque central de información con título *"UNIDAD MÉDICA AVANZADA"*, insignia de bahía e indicador *"SOPORTE VITAL ACELERADO (+60 HP/s)"*, y botón voluntario de salida *"SALIR DE LA BAHÍA"* perfectamente encajado dentro del padding de la tarjeta.
    - **Pod Central del Paciente:** Avatar del jugador con halo bio-regenerativo esmeralda, indicador dinámico (*"REANIMANDO CONSTANTES VITALES..."* si estaba en estado crítico o *"ESTABILIZANDO CONSTANTES..."*), y barra de vida de gran tamaño con incremento numérico visible en tiempo real `HP / MaxHP (+60 HP/s)`.
    - **Bahía Médica de Mascotas (Reactivación de Escudos):** Despliegue de los compañeros adoptados con barras individuales (+40 HP/s), alertas de desfibrilación para mascotas caídas (`💫`), y destello esmeralda triunfal con *"¡REPARADA / LISTA PARA COMBATE!"* al reactivar sus escudos al 100%.
  - **Ciclo de Ticks Médicos Acelerados y Audio Procedural:**
    - Recarga periódica intensiva cada 1 segundo: **+60 HP/s** para el jugador y **+40 HP/s** para las mascotas dañadas o noqueadas.
    - Latidos cardíacos y tonos bio-sintetizados en Web Audio API (`soundEffects.playHeartbeat()`, `soundEffects.playMedicalTick()`), números flotantes animados (`+60 HP`, `+40 HP ESCUADRA`) y viñeta perimetral esmeralda que pulsa al compás de la regeneración.
  - **Alta Médica Automática y Persistencia:**
    - Al alcanzar el 100% de salud tanto el jugador como todas sus mascotas, se proyecta el overlay triunfal *"TRATAMIENTO COMPLETADO: ESCUADRA 100% OPERATIVA"*, suena el acorde de alta médica (`soundEffects.playMedicalSuccess()`), se actualiza y persiste el estado en Supabase y Realtime (`status: 'active'`, `isCriticallyWounded: false`), y el modal se auto-cierra a los 1.5s devolviendo el control al mapa.
    - Si el jugador sale voluntariamente antes de completar la curación permaneciendo dentro del radio, el HUD ofrece un acceso táctico directo *"BAHÍA MÉDICA ACTIVA"* para reingresar al pod en cualquier momento (oculto automáticamente una vez que la escuadra recupera el 100% de salud).
- **Refugios Tácticos de Guarecimiento y Regeneración Paulatina (Alfa, Bravo, Charlie y Delta):**
  - **Zonas de Resguardo y Cobertura Pasiva:** 4 instalaciones tácticas (`type: 'shelter'`, radio 14m, color perimetral cian `#06b6d4`) distribuidas en el terreno con sprite de búnker y aura cian.
  - **Inmunidad Táctica y Cobertura:** Al ingresar a un refugio, el avatar obtiene cobertura táctica: el monstruo pierde el aggro de inmediato y se suspende la elegibilidad para combates PvP.
  - **Regeneración Paulatina de Salud (+15 HP/s) y Mascotas (+5 HP/s):** Los refugios proporcionan una recarga paulatina cada 1s (+15 HP/s jugador, +5 HP/s mascotas). Si el combatiente ingresa en estado `[HERIDO]`, el primer pulso paulatino eleva su salud superando el umbral vital (`WOUNDED_SURVIVAL_THRESHOLD = 20 HP`), restableciendo inmediatamente su operatividad activa (`status: 'active'`, `isCriticallyWounded: false`), retirando la línea de emergencia SVG hacia el hospital y permitiéndole reanudar su movimiento y operaciones mientras se cura gradualmente hasta el máximo de 300 HP.
  - **Sincronización Multijugador Inmediata en Supabase Realtime (`player_healed`):** Al estabilizarse en el refugio o en el hospital, el cliente emite de inmediato el broadcast formal `player_healed` y persiste en Supabase DB con prioridad instantánea (`immediate: true`). Todos los clientes en la sala reciben el cese de incapacitación (`isCriticallyWounded: false`, `isWounded: false`, `status: 'active'`), actualizan la barra de salud sin restricciones de clamping y vuelven a habilitar la targeteabilidad y el combate PvP tan pronto el jugador abandone la zona segura.
  - **Retroalimentación en HUD Superior (`IndoorStatusBanner.tsx`):** Mientras el jugador está guarecido y herido o por debajo de su salud máxima, se proyecta *"REFUGIO (+15 HP/s): [NOMBRE]"* con icono palpitante de `HeartPulse`. Al completar la regeneración al 100%, pasa a mostrar *"REFUGIADO: [NOMBRE] // A cubierto: El monstruo no puede verte"* con distintivo de escudo `ShieldCheck`.
- **Inmutabilidad Geográfica Absoluta de las Estructuras (Desacoplamiento de Fases):**
  - **Entidades Fijas vs. Dinámicas:** El Hospital de Campaña y los 4 Refugios Tácticos son entidades maestras inmutables de sala, completamente desacopladas de las coordenadas móviles de los cofres del tesoro de fase.
  - **Coordenadas Maestras de Las Meriendas (`MASTER_LAS_MERIENDAS_STRUCTURES`):** Para partidas en el sector operativo de Las Meriendas, las estructuras ocupan coordenadas fijas reales en el terreno (`Hospital de Campaña: 37.4010, -2.1558`, Refugio Alfa, Bravo, Charlie y Delta), manteniéndose congeladas en el estado sin importar cuántas fases o cofres se descifren.
  - **Directriz de Emergencia Fija:** En `GameMap.tsx`, la directriz médica (`updateSvgGuideline`) conecta matemáticamente los pies del cazador herido con el centro del Hospital de Campaña principal con total certidumbre espacial.
- **Capa Táctica Visual:** Representación poligonal GeoJSON de las zonas de influencia estructural (`structures-zones`) con perímetro esmeralda de 20m para el hospital y cian de 14m para los refugios, acompañadas de su banner contextual de estado interior (`IndoorStatusBanner.tsx`).

---

### 🩸 6. Rediseño del Ciclo de Vida: Estado "Herido de Muerte"
- **Sustitución de la Muerte Instantánea:** Al recibir daño letal, el HP se ancla en 1 y el jugador pasa al estado `critically_wounded`.
- **Restricciones de Combate:** Armas bloqueadas, habilidades deshabilitadas e imposibilidad de saquear cajas. La única acción disponible es replegarse hacia el Hospital de Campaña.
- **Píldora Táctica de Alerta y Telemetría Médica (`CriticallyWoundedOverlay.tsx`):** Viñeta roja pulsante en pantalla y píldora compacta horizontal (< 40px de altura) en `top-14` centrada (`max-w-md mx-auto`) con borde carmesí brillante, advertencia de emergencia, distancia métrica (`🏥 {hospitalDistance}m`) y brújula direccional en tiempo real hacia el Hospital de Campaña, despejando completamente la barra de cabecera y los controles de orientación y mapa en pantallas móviles.
- **Aislamiento Táctico del Mapa y Directriz Dinámica de Emergencia hacia el Hospital:**
  - Al entrar en estado herido, **desaparecen todos los iconos del mapa** (monstruo, cofre del tesoro, cajas de suministros, armas en el suelo, mascotas, pings y otros jugadores), manteniendo únicamente visible la estructura del Hospital (`🏥`) y la posición del jugador.
  - **Directriz Dinámica Elástica de Evacuación Médica (Overlay SVG en Espacio de Pantalla):** Se proyecta una línea SVG discontinua de alta visibilidad roja carmesí (`#ef4444`, grosor 3.5px, trazo `[10, 6]`, animación fluida `@keyframes medicalGuidelineDash` con desplazamiento hacia el hospital) reforzada con un halo oscuro inferior (`rgba(0,0,0,0.75)`, grosor 6.5px) y brillo táctico (`drop-shadow`). El vértice de origen está **indisolublemente soldado a los pies del avatar en tiempo real** mediante sincronización DOM directa y proyección síncrona `map.project()`, eliminando por completo las fuentes GeoJSON pesadas (`source.setData`) de MapLibre GL y garantizando 60 FPS cinemáticos sin tirones durante el desplazamiento.
  - **Erradicación de Círculos Residuales Huérfanos:** Eliminado el círculo punteado estático (`wounded-perimeter`) para garantizar que la directriz médica sea el único elemento vectorial limpio de advertencia y orientación sobre el terreno.
  - **Persistencia y Reenganche entre Estilos (Táctico y Satélite):** La directriz de rescate SVG se superpone de forma neutra (`pointer-events-none z-20`) tanto en la vista satelital como en la táctica, sincronizándose pasivamente a 60 FPS sin latencia ni parpadeo.
  - Al alcanzar >= 20 HP dentro del Hospital y salir del estado herido, todos los elementos del mapa vuelven a mostrarse instantáneamente y la directriz SVG se oculta por completo (`display: none`) sin dejar restos.
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
  - **Puntería Táctil y Evasión Dinámica en Duelos (`PvPArena.tsx` / `useEnemyEvasion.ts`):**
    - Se elimina el botón estático rectangular "DISPARAR": el combate PvP unifica la mecánica de habilidad táctica *Touch-Target Evasion Combat*.
    - El avatar del rival se proyecta con silueta compacta (`w-16 h-16 sm:w-20 sm:h-20`), escala dinámica orgánica (0.70x-1.25x) y desplazamiento mínimo radial fuera del centro (`minOffset: 25-30px`), desplazándose proceduralmente según el rol de su personaje (`scout`: ágil y errático cada 650ms; `marksman`: equilibrado cada 850ms; `tank`: cadencia pesada cada 1200ms; `medic`: 800ms).
    - El objetivo cuenta con retícula giratoria (`animate-spinSlow`), respuesta de impacto con sacudida e iluminación (`animate-hitShake`), salto evasivo inmediato ante cada impacto certero y penalización de disparo fallido (❌ `"¡FALLO!"` y consumo de munición) al tocar fuera del cuerpo del rival o spamear el centro vacío.
    - La barra de salud del oponente (HP [X/300] o [X/450] según clase) y sus cofres conquistados se mantienen destacados justo encima del área de duelo, y el control inferior unifica el botón expandido de "HUIR (5s SPRINT)".
  - **Radio de Encuentro Agresivo (<= 28m):** Si dos jugadores activos (`status === 'active'`) se encuentran a 28 metros o menos en el mapa exterior (`PVP_TRIGGER_RADIUS_METERS = 28`), se dispara de inmediato la arena de combate PvP para ambos participantes, cancelando las trayectorias de movimiento.
  - **Zonas Seguras Inviolables (Refugios y Hospital de Campaña):** Si cualquiera de los dos jugadores está dentro del perímetro de un Refugio o del Hospital, **el combate PvP no puede iniciarse bajo ninguna circunstancia**. Si un jugador en persecución entra a una zona segura antes de abrirse la arena, queda protegido.
  - **Aislamiento Táctico y Cola de Monstruos ("Burbuja de Duelo"):** Mientras los dos jugadores luchan en la arena PvP, los monstruos no pueden intervenir ni interrumpir la pelea. Si un monstruo entra en rango durante el duelo, queda en espera exterior en el mapa (en cola de combate). Al concluir el duelo, el vencedor (si permanece en rango) inicia secuencialmente el combate 1 vs 1 contra el monstruo en cola.
  - **Interrupción Inmediata de Desencriptación de Cofres:** Si un jugador es emboscado o alcanzado por un rival ($\le 28\text{m}$) mientras se encuentra descifrando un cofre en `ChestLockModal`, el defensor es expulsado de inmediato del minijuego, cancelando su interacción y desplegando la arena `PvPArena` cara a cara con el agresor con alerta sonora y táctica. El progreso de cerrojos previamente resueltos (ej. 3/6) se preserva intacto sin penalización.
  - **Sincronización Atómica de Derrota PvP y Mitigación de Bajas Mutuas (Anti-Doble KO):** En cuanto la salud de un duelista llega a cero, el sistema cancela de forma atómica e inmediata cualquier proyectil o daño entrante que dicho rival haya disparado en el mismo fotograma (`duelOutcomeRef`), impidiendo impactos póstumos que provoquen doble KO simultáneo. Se emite una notificación de derrota en tiempo real (`pvp_player_defeated` y `pvp_defeat` con marca temporal) y se persiste atómicamente en Supabase (`hp: 0, status: 'critically_wounded'`). El cliente del vencedor procesa el evento al instante, cierra la arena PvP, entona la fanfarria de victoria y actualiza la lista local de jugadores. El evaluador de proximidad (`canEngageInPvP`) bloquea de forma estricta cualquier intento de re-enganche si cualquiera de los combatientes tiene `hp <= 0` o se encuentra en estado crítico, erradicando bucles infinitos contra rivales caídos e inmunizándolos en el suelo hasta su traslado y reanimación en cualquiera de los Hospitales de Campaña.
  - **Activación Bidireccional de Duelo por Marcador en el Mapa y Corrección de Asimetría al Reconectar:**
    - Se incorporó interacción táctica al pulsar directamente sobre el marcador de un rival en el mapa exterior (`onPlayerMarkerClick`): si la distancia es $\le 28\text{m}$, desencadena el duelo PvP cara a cara; si el contrincante está distante, traza la navegación asistida hacia sus coordenadas.
    - Al reconectar a la partida, se limpian de forma atómica los flags y cooldowns de combate residuales (`isPvPModalOpen: false`, `fleeImmunityUntil: 0`), se reevalúa `in_safe_zone` según las coordenadas vivas frente a estructuras y se remonta limpiamente el canal Realtime (`connectionEpoch`), erradicando cualquier asimetría de detección entre el jugador reconectado y sus rivales.
  - **Failover Determinista de Host y Watchdog de IA (`useMonsterAI.ts` / `useHostElection.ts`):** Supervisión continua del host activo basada en `presenceState` determinista (ordenado por `joinedAt` y `playerId`). Si el host abandona la sesión o no emite ticks durante más de 5 segundos (`host_heartbeat`), el siguiente jugador conectado y con vida toma el relevo automáticamente activando el bucle de simulación de monstruos sin recargar la página.
  - **Canal de Sincronización Bidireccional (`pvp_combat_${combatId}`):** Comunicación efímera por Supabase Realtime donde cada participante transmite disparos, daño de armas equipadas, bonificaciones de clase, ataques automáticos de mascotas compañeras (con icono 3D y telemetría flotante `.floating-combat-effect`), sincronización de salud y desenlaces (victoria, derrota crítica o retirada táctica).
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
- **Arquitectura de Dos Contenedores contra el Desanclaje y Zoom Drift en MapLibre GL (`src/components/GameMap.tsx`, `src/index.css`):**
  - **Desacoplamiento Estricto de Proyección (`Two-Container Architecture`):** Para erradicar la sobreescritura de la matriz `transform: translate(Xpx, Ypx)` de MapLibre GL durante el zoom o paneo rápido, se divide cada marcador en dos capas funcionales:
    - **Contenedor Raíz de Anclaje Neutro (`.map-marker-anchor` / `.maplibregl-marker`):** Dimensión de punto cero estricto (`width: 0 !important; height: 0 !important; overflow: visible !important; transition: none !important; pointer-events: none;`). MapLibre calcula su centro en `(0, 0)` absoluto y lo sincroniza a nivel de píxel con las teselas WebGL sin desfases geométricos.
    - **Contenedor Visual Interno (`.marker-content`):** Posicionado en `position: absolute; top: 0; left: 0; transform: translate(-50%, -50%); transition: none !important; pointer-events: auto;`. Alberga toda la interfaz visual (animaciones procedurales de paso, orientación de mirada `scaleX`, halos pulsantes, etiquetas de texto y barras de vida) sin interferir jamás en la proyección del contenedor padre.
  - **Integración DOM de Mascotas de Escolta (`renderPlayerEscortPetsHtml`):** Las mascotas de la comitiva se integran directamente dentro del árbol DOM del propio avatar del jugador (`#player-pets-${p.id}`) con desplazamientos polares fijos (`getPetEscortOffset`), eliminando marcadores independientes de MapLibre GL para la comitiva y garantizando sincronización a 60 FPS sin lag de coordenadas ni desprendimiento visual al variar el zoom.
- **Renderizado Seguro de Marcadores en MapLibre:** Guardia estricta de ciclo de vida del mapa WebGL y revelación diferida mediante doble `requestAnimationFrame` que elimina cualquier parpadeo de marcadores en la coordenada `(0, 0)`.
- **Blindaje contra Desreferenciación Nula en MapLibre GL (`isMapStyleLoaded`):** Protección estricta con guardas de estilo cargado (`isMapStyleLoaded`) y bloques defensivos `try/catch` en todas las consultas de capas y fuentes (`getLayer`, `getSource`, `setLayoutProperty`) de `GameMap.tsx`. Al alternar en caliente entre vista satelital y táctica o durante transiciones reactivas del mapa WebGL, las operaciones que actualizan visibilidad o capas de emergencia se difieren de forma segura mediante `map.once('style.load')` erradicando excepciones `TypeError: Cannot read properties of null (reading 'getLayer')`.
- **Sincronización Estricta y Renderizado de las 4 Capas Vectoriales GeoJSON (`setupMapLayersAndSources`, `createCircleFeature`, `syncAllInteractionCircles`, `syncHospitalGuideline`):**
  - **Generador Geodésico con Cierre Estricto (`createCircleFeature`):** Generación matemática de polígonos GeoJSON en proyección `[lng, lat]` asegurando el cierre obligatorio del anillo de coordenadas (`coords.push(coords[0])`). Esto garantiza que el motor WebGL de MapLibre GL dibuje de inmediato las geometrías de área operativa, visión y combate sin descartarlas por polígono abierto.
  - **Perímetro Operacional del Juego (`syncGameBoundary`):** Delimitación esférica de alta fidelidad con arquitectura de doble capa perimetral sobre WebGL: capa de halo base sólida `LAYER_BOUNDARY_HALO` (`#00f2fe`, 6.0px, opacidad 0.55 y desenfoque `line-blur: 1.5`) y capa superior discontinua de alta nitidez `LAYER_BOUNDARY_LINE` (`#00f2fe`, 3.2px, trazo `[3, 2]`, opacidad 1.0 con `'line-cap': 'butt'` para estabilizar el shader `lineSDF` en el vértice de cierre del polígono). Incluye sombreado interior de alta visibilidad `LAYER_BOUNDARY_FILL` al 12% de opacidad (`fill-opacity: 0.12`), filtrado estricto de geometrías (`filter: ['==', '$type', 'Polygon']` para relleno y `['==', '$type', 'LineString']` para halo/línea), anclaje reactivo a los eventos `idle` y `styledata` de MapLibre GL, y coordenadas tácticas de contingencia (`INITIAL_LAT` 37.4018, `INITIAL_LNG` -2.1565 y radio 350m) que garantizan su visualización nítida e instantánea sobre ortofoto satelital y vista táctica.
  - **Radio de Acción y Visión del Cazador (Overlay SVG en Espacio de Pantalla):** Rango táctico bajo los pies del jugador (`#00f2fe`, opacidad 0.08 con borde discontinuo `[6, 4]` y resplandor táctico) migrado íntegramente a un elemento `<polygon>` dentro del contenedor SVG en espacio de pantalla (`visionPolygonRef`). Proyecta síncronamente 48 vértices geodésicos mediante `map.project([lng, lat])` en cada fotograma (`requestAnimationFrame`) y en cada evento `render` de MapLibre GL, anclado milimétricamente a las coordenadas vivas del avatar `(liveLng, liveLat)` y `meMarker.getLngLat()`. Erradica el Web Worker overhead, el retardo inicial de carga y cualquier movimiento a trompicones, conservando la inclinación a 45° y la perspectiva 3D con 0 ms de latencia. Se oculta dinámicamente en estados de incapacitación o herido crítico (`isMeWounded`) o dentro de refugios.
  - **Radio de Combate y Amenaza de Monstruos:** Incorporación dinámica del perímetro de aggro/combate de cada criatura activa custodia del tesoro en la fuente unificada `SOURCE_CIRCLES` (`aggroRadius || 28`, color carmesí `#ef4444`, opacidad 0.12), alertando al cazador antes de entrar en rango de enfrentamiento.
  - **Directriz Dinámica de Emergencia al Hospital Más Cercano (Overlay SVG en Espacio de Pantalla):** Detección multicriterio de estados de incapacitación (`isPlayerWoundedOrCritical`, evaluando `isCriticallyWounded`, `critically_wounded`, `wounded`, `downed`, `incapacitated`, `herido` o `hp <= 1`). Proyecta de inmediato una línea discontinua animada roja carmesí de evacuación médica (`#ef4444`, grosor 3.5px, trazo `[10, 6]`, opacidad 1.0 con halo negro de 6.5px y animación `@keyframes medicalGuidelineDash`) conectando de forma síncrona los pies del avatar con el Hospital de Campaña más próximo entre todas las instalaciones activas del mapa, recalculando la distancia geodésica continuamente a 60 FPS sin tirones cinemáticos y permitiendo la curación libre en cualquiera de ellos.
- **Jerarquía de Escala Estricta en Marcadores de MapLibre GL y Avatares de Jugadores 3D:**
  - **Inmunización contra Expansión Descontrolada ("Godzilla Bug"):** Doble capa de protección inquebrantable contra el sobredimensionamiento de texturas nativas (512×512 px):
    - **Escudo Global CSS (`src/index.css`):** Reglas con especificidad forzada y selectores específicos para `.marker-structure` (68px arquitectónicos), `.marker-pet` silvestre (34px), `.companion-pet-container` en escolta (28px compactos), `.marker-monster` (48px), `.marker-player` (44px), `.marker-chest` (40px) y `.marker-crate` / `.marker-loot` (32px) usando clases y atributos `[data-entity]`.
    - **Restricciones Nativas HTML e Inline (`GameMap.tsx`):** Inyección mandatoria de atributos HTML `width` y `height` directos junto con estilos inline estrictos (`width: ...px !important; height: ...px !important; max-width: ...px !important; max-height: ...px !important; object-fit: contain;`) en todas las etiquetas `<img>` generadas y actualizadas en MapLibre GL.
  - **Jerarquía Visual de Escalas en Terreno:**
    - **Estructuras Tácticas (Hospital de Campaña y Refugios):** `68px × 68px` con escala imponente de complejo fortificado, sombras volumétricas terrestres (`drop-shadow(0 10px 18px rgba(0,0,0,0.95)) drop-shadow(0 0 8px rgba(0,242,254,0.3))`) y halo expandido (w-20 h-20).
    - **Monstruos (Jefe / Alfa / Acechador):** `48px × 48px` con aura carmesí y doble proyección de sombra hostil.
    - **Jugadores (Local y Rival):** `44px × 44px` con avatar 3D directo de su rol militar sin marcos ni círculos de color (`z-index: 40 !important` para el jugador local).
    - **Cofre del Tesoro (Activo, Custodiado, Abierto):** `42px × 42px` con resplandor dorado o de alerta.
    - **Mascotas Silvestres:** `34px × 34px` con acompañamiento perimetral en hábitat natural.
    - **Mascotas en Escolta / Comitiva:** `28px × 28px` (`z-index: 25 !important`) en formación de abanico táctico superior (`getPetEscortOffset`, distribución en sector superior/hombros: -90°, -135°/-45°, -150°/-90°/-30° a 40px con despeje vertical `y: -8px`), despejando al 100% la píldora de nombre (`[TÚ]`), la barra de salud inferior y el torso del cazador sin colisiones visuales.
    - **Cajas de Suministros (Airdrops) y Botín en Terreno:** `32px × 32px`.
    - **Pings Tácticos:** `32px × 32px` con icono centrado de 24px.
  - **Aligerado y Despeje Táctico del Mapa Exterior (Decluttering):**
    - Se suprimieron las etiquetas de texto estáticas inferiores en refugios tácticos (`REFUGIO ALFA`, `REFUGIO BRAVO`, etc.), mascotas silvestres y comitivas (`MINI ROBOT MÉDICO`, `PERRO GUARDIÁN`, etc.), y cajas o botines caídos (`BOTIQUÍN (40m)`, armamento en suelo). Los elementos preservan intactos sus sprites de alta fidelidad, animaciones, auras e interactividad táctil sin saturar el lienzo satelital con carteles redundantes.
    - El **Cofre del Tesoro (`TESORO` / `⚠️ Custodiado`)** y el **Hospital de Campaña (`HOSPITAL (40m)`)** destacan como los únicos puntos estructurales que conservan sus rótulos contextuales, garantizando una jerarquía visual limpia y profesional.
  - **Avatar de Jugador en 3D Puro:** Erradicado el círculo rígido antiguo con fondo de color en favor de la silueta 3D sin recuadros ni bordes correspondiente a su rol militar (`role-scout.png`, `role-medic.png`, `role-tank.png`, `role-marksman.png`), estado herido (`player-wounded.png`) o fantasma caído (`player-ghost.png`), complementado armónicamente con pulso de radar cian, rebote cinemático de paso (`marker-stepping`), orientación dinámica de mirada (`marker-facing`) y cápsula inferior de telemetría y salud.
- **Mochila Táctica con Armamento e Iconografía de Mascotas 3D:** La interfaz de `BackpackModal.tsx` incorpora las ilustraciones de armas 3D de alta fidelidad sin marcos pesados (`h-14 w-14 object-contain`) en la pestaña de Equipo y miniaturas 3D de mascotas con salvaguarda defensiva `onError` y sombras tácticas, eliminando volcados erróneos de rutas de texto.
- **Sistema Cinemático y Procedural de Marcadores de Jugadores y Monstruos (`GameMap.tsx`, `index.css`):**
  - **Orientación según Sentido de Marcha:** Los avatares de jugadores y monstruos orientan dinámicamente su mirada mediante transformaciones de espejo (`scaleX(1)` hacia el Este / derecha y `scaleX(-1)` hacia el Oeste / izquierda) con transiciones suaves en CSS.
  - **Patrulla con Mirada Alternada en Avance Vertical:** Si el desplazamiento es predominantemente vertical (hacia el Norte o Sur, $|dY| > 1.4 \times |dX|$), se dispara la animación `verticalLookScan`, alternando la mirada de izquierda a derecha de forma rítmica para simular vigilancia táctica del entorno.
  - **Cadencia de Zancada y Saltitos Tácticos (*Walk Bounce*):** Durante el movimiento, el contenedor de la entidad ejecuta la animación procedural `@keyframes tacticalStepBounce`, produciendo una elevación elástica (`translateY(-7px)`) y compresión suave al pisar (`scale(1.04, 0.96)`) con ciclo de 0.42s (`.marker-stepping`), deteniéndose suavemente tras 600ms de inactividad.
  - **Cinemática Activa en Estado Crítico:** Cuando el jugador cae en estado críticamente herido (`critically_wounded`), mantiene activa la cinemática de zancada (`marker-stepping`) y orientación de mirada (`marker-facing-*`) mientras se desplaza hacia el Hospital de Campaña, erradicando desplazamientos rígidos o desnaturalizados.
  - **Aislamiento de Distintivos y Barras de Salud:** La arquitectura en capas separa el contenedor de rebote y rotación respecto a la placa de nombre, distancia y barra de vida (`hp-bar`), garantizando que los textos no oscilen ni se inviertan en espejo.
- **Locomoción Orgánica, Inercia de Seguimiento (Spring Follow) y Cinemática Desincronizada de Mascotas (`GameMap.tsx`, `index.css`):**
  - **Amortiguador Elástico y Arrastre Inercial (Spring Follow):** Cada mascota de la comitiva se aloja en un contenedor `.escort-pet-anchor` con transición elástica `cubic-bezier(0.25, 0.8, 0.25, 1)` y latencia diferenciada según su orden en la formación (Líder del flanco: 0.22s, Centro superior: 0.28s, Retaguardia: 0.35s). Al correr el jugador, las mascotas reaccionan con un sutil arrastre elástico en hilera; al frenar, rebasan levemente su marca y se acomodan suavemente en su posición de reposo en abanico superior.
  - **Animaciones Desincronizadas por Índice:** Supresión del efecto rígido de bloque mediante ciclos procedurales desfasados (`animation-delay: -(index * 0.45)s`): respiración continua en reposo (`@keyframes petIdleBreath`, 2.1-2.6s), flotación con deriva para drones y robots médicos (`@keyframes droneHoverWobble`, 3.2-3.8s) y trote ágil de persecución (`@keyframes petTrotRun`, 0.34-0.42s).
  - **Orientación Dinámica y Vigilancia de Flanco:** Giro horizontal fluido (`transform: scaleX(1)` / `scaleX(-1)`) coordinado con el sentido de la marcha. Tras permanecer 3.5-5 segundos en reposo estático, una de las mascotas de flanco alterna aleatoriamente su mirada para vigilar la retaguardia.
  - **Arquitectura de 3 Capas Anticolisión:** Aislamiento estricto de transformaciones (Capa 1: traslación inercial `translate3d`, Capa 2: animación procedural de respiración/trote `translateY` + `scale`, Capa 3: orientación de mirada `scaleX`), asegurando 60 FPS fluidos sin reinicio destructivo de fotogramas.
- **Jerarquía Estricta de Capas y Aislamiento Z-Index (`src/index.css`):** Blindaje por niveles de profundidad para evitar intercepciones táctiles no deseadas o solapamientos visuales: canvas y marcadores de MapLibre GL en `z-index: 10`, barras e interfaces del HUD superior e inferior en `z-index: 50`, y modales tácticos de interacción en `z-index: 100`.
- **Despeje Visual del Terreno Exterior:** Retirada definitiva de la píldora flotante fija de ayuda *"👆 Toca el mapa para moverte (...)"*, proporcionando una visión despejada del mapa táctico.
- **Apertura de Cofres sin Delays Artificiales (`ChestLockModal.tsx`):** Supresión de tiempos muertos forzados de espera tras resolver los cerrojos de descifrado, cerrando el modal de forma inmediata y fluida.


---

## 🕹️ Modos de Movimiento y Conectividad

- **Movimiento Dual:**
  - **GPS Real:** Geolocalización de alta precisión en vivo (`navigator.geolocation.watchPosition`). Indicador de distancia si te encuentras fuera del área sin teletransporte forzado.
  - **Tap-to-Move:** Navegación táctil configurable al crear la partida con 4 niveles de velocidad de desplazamiento: Lento (0.8 m/s ~3 km/h), Normal (1.4 m/s ~5 km/h), Rápido (2.8 m/s ~10 km/h) y Muy Rápido (27.8 m/s ~100 km/h), con reajuste perimetral automático si pulsas fuera del radio de juego.
- **Lobby y Explorador de Operaciones en Vivo:**
  - **Selector Interactivo de Centro de Zona sobre Mapa Satelital (`LocationPickerModal.tsx`, `CreateRoomModal.tsx`):** Integrado un visor cartográfico táctico en pantalla completa con ortofoto satelital de alta resolución (ArcGIS World Imagery) para fijar interactivamente las coordenadas del centro de juego al crear una sala. El anfitrión puede tocar cualquier punto del terreno o arrastrar un marcador cian con retícula y halo pulsante, visualizando en tiempo real el círculo perimetral del radio operativo y la telemetría precisa de latitud y longitud antes de confirmar la ubicación.
  - **Configuración de Radio Operativo Mínimo a 0.2 km (200m) y Dispersión Adaptativa (`CreateRoomModal.tsx`, `mapStructures.ts`, `mapEntities.ts`):** Selector de radio en incrementos de 0.05 km con límite inferior absoluto en 0.2 km (`min="0.2"`, `max="3.0"`, `step="0.05"`) y marcas visuales calibradas (`0.2 km (200m)`, `0.35 km (Estándar)` y `3.0 km (3000m)`), garantizando una zona operativa mínima de 200 metros de radio para entornos urbanos y evitando colapsos procedurales o solapamientos. La generación procedural de hospitales de campaña, cofres de fases, cajas de suministros y criaturas adapta automáticamente sus distancias geodésicas y radios de interacción de forma proporcional si el radio de juego es inferior a 250m, previniendo solapamientos o desbordamientos del perímetro exterior.
  - **Botón Táctico de Compartir Partida con Web Share API (`TacticalHeader.tsx`, `WaitingRoom.tsx`):** Acceso directo en el HUD superior junto al identificador de sala que invoca la API nativa `navigator.share` en dispositivos móviles para compartir instantáneamente la invitación por WhatsApp, Telegram u otras aplicaciones del sistema, con respaldo automático al portapapeles y notificación toast confirmatoria en navegadores de escritorio.
  - **Selector Táctico de Clases con Iconos 3D (`RoleSelectionModal.tsx`, `RoleSelectorGrid`):** La elección de rol militar (Explorador, Médico, Tanque y Tirador) en los modales de Crear Partida, Unirse a Partida y Sala de Espera incorpora miniaturas de render 3D de alta definición (`w-16 h-16 object-contain`), tarjetas tácticas interactivas con estados activos y resumen de pasivas operativas.
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
| **Tanque** | `/assets/icons/roles/role-tank.png` | Primera Línea | +50% de vida base (450 HP frente a los 300 HP estándar) y atracción prioritaria del aggro del monstruo. |
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
