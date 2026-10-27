# Changelog — Utopia (Las Meriendas: Monster Hunt)

Todos los cambios notables en este proyecto serán documentados en este archivo.
El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

## [Unreleased]
### Changed
- **Removed passive map-based auto-combat; attacks strictly limited to manual clicks within the combat arena (`useCombatLoop.ts`, `CombatArena.tsx`):**
  - Desactivado por completo el temporizador y el bucle de daño automático en segundo plano en el mapa táctico (`useCombatLoop.ts`). El mapa táctico ahora solo gestiona navegación, recogida de airdrops, interacción con estructuras y detección de colisión/proximidad para iniciar el combate.
  - El daño hacia el monstruo se centraliza y ejecuta exclusivamente de forma manual desde el modo combate (`CombatArena.tsx`), al presionar el botón "ATACAR" o al tocar directamente sobre la carta del monstruo.
  - La cadencia manual respeta estrictamente `cadenceMs` / `fireRateMs` del arma activa con feedback visual de recarga y descuento de munición.
  - Los ataques de asistencia de mascotas activas (`Pet[]`) se circunscriben de forma exclusiva a la vista activa de la Arena de Combate.

### Added
- **Multi-pet companion system with automatic loot fetching, unique passive traits, combat assist, and hospital revive (`mapEntities.ts`, `GameMap.tsx`, `CombatArena.tsx`, `App.tsx`, `types/game.ts`):**
  - **Adopción ilimitada y comitiva en el mapa:** Spawneo de 4 a 6 mascotas silvestres en el mapa (`dog`, `drone`, `electric_mouse`, `rabbit`, `cat`, `med_bot`) con marcadores animados y círculos radiantes. Adopción automática a menos de 12 metros sin límite de cantidad; las mascotas se incorporan a la comitiva del jugador (`player.pets: Pet[]`).
  - **Perfiles y habilidades pasivas únicas:**
    - Perro Guardián (`dog` 🐕): 60 HP, 6 DMG (cada 2s), radio de rastreo extendido recogiendo loot a 25 metros.
    - Dron Táctico (`drone` 🛸): 45 HP, 10 DMG (cada 2.5s), fuego continuo y visión táctica ampliada (+15m niebla de guerra).
    - Roedor Eléctrico (`electric_mouse` ⚡): 50 HP, 8 DMG (cada 1.8s), descargas eléctricas rápidas.
    - Conejo Veloz (`rabbit` 🐇): 40 HP, 4 DMG (cada 1.5s), alta cadencia y alcance de suministros lejanos.
    - Gato Callejero (`cat` 🐈): 45 HP, 7 DMG (cada 2s), sigilo felino que otorga al jugador +10% de evasión frente a los ataques del monstruo.
    - Mini Robot Médico (`med_bot` 🤖): 50 HP, 3 DMG (cada 3s), nanobots curativos que regeneran pasivamente +2 HP cada 5s fuera de combate.
  - **Seguimiento visual e interpolación suave en el mapa:** Renderizado cosmético de las mascotas orbitando a 2.5m de cada jugador en `GameMap.tsx`. Si una mascota se desmaya (`isWounded: true`), flota detrás en escala de grises con animación de mareo (`💫`). Sincronización ligera en red mediante el payload de presencia y movimiento de Supabase Realtime (`pets: Pet[]`) y evento `pet_adopted`.
  - **Recogida pasiva automática de suministros (Fetch Loot):** Las mascotas activas escanean y consumen cajas de suministros dentro de su `fetchRadiusMeters`. Si el jugador tiene vida incompleta, la curación se aplica inmediatamente a él; si está al 100%, se aplica a la mascota con menor porcentaje de vida. Las armas y munición se transfieren directamente a la mochila del jugador.
  - **Asistencia en la Arena de Combate (`CombatArena.tsx`):** Tarjetas secundarias con barras de vida de cada mascota activa; ataque automático periódico restando HP al monstruo con números flotantes dedicados; recepción de un 20% de daño de área residual cuando el monstruo ataca, entrando en estado `isWounded: true` al llegar a 0 HP.
  - **Revitalización en el Hospital de Campaña (`App.tsx`):** Al permanecer en el Hospital, todas las mascotas heridas o desmayadas de la comitiva se reactivan, reviven al 100% de salud (`hp = maxHp`) y eliminan el estado `isWounded`.
- **Sistema integral de mochila/inventario, jerarquía y desgaste de armamento (`BackpackModal.tsx`, `combatEngine.ts`, `types/game.ts`):**
  - **Jerarquía de armamento de 7 niveles (Tiers):** Lanzacohetes RPG (Tier 7), Granadas Tácticas (Tier 6), Fusil Táctico M4 (Tier 5), Escopeta de Postas (Tier 4), Pistola 9mm (Tier 3), Hacha Táctica (Tier 2 con 15 usos de durabilidad) y Cuchillo de Supervivencia básico (Tier 1 infinito e indestructible).
  - **Desgaste dinámico y fallback automático:** Al agotarse la munición o durabilidad de cualquier arma de Tier 2-7 durante el combate en movimiento o en la arena táctica, el arma se rompe/elimina y el sistema auto-equipa automáticamente el siguiente mejor armamento disponible en la mochila hasta llegar al cuchillo básico.
  - **Mochila táctica con gestión de slots (`MAX_INVENTORY_SLOTS = 4`):** Modal interactivo con botón en el HUD que muestra slots ocupados, estadísticas de daño/cadencia/munición de cada arma, insignias de Tier, botón para equipar manualmente y botón para soltar/descartar en el terreno.
  - **Descarte y recolección de objetos en el mapa (`DroppedItem` y `GameMap.tsx`):** Los objetos descartados de la mochila o intercambiados al estar lleno el inventario caen al terreno en las coordenadas del jugador, renderizándose como marcadores interactivos en MapLibre GL con colores distintivos por Tier y sincronización en tiempo real vía Supabase Realtime (`item_dropped`, `item_picked`). Recogida interactiva a menos de 20 metros o desde la sección "Objetos en el suelo" de la mochila.
  - **Recolección instantánea de salud:** Los botiquines recogidos de cajas de suministros o airdrops se consumen al instante restaurando la salud del jugador de inmediato hasta su vida máxima sin ocupar slots en la mochila.
- **Rediseño completo de combate táctico modo arena en tiempo real (`CombatArena.tsx`):** Vista inmersiva estilo carta de combate táctico/Pokémon que se superpone automáticamente al entrar a menos de 20m del monstruo. Muestra carta central interactiva del monstruo con nivel de amenaza y barra de vida global compartida sincronizada por Supabase Realtime, barra de vida y arma del jugador, botón "ATACAR" y soporte para infligir daño por pulsación directa sobre la carta del monstruo. Incorpora bucle de contraataque periódico del monstruo cada 2.5s con sacudida y viñeta roja de impacto, transición inmediata a "Herido de Muerte" si los HP caen a 0, y botón "HUIR" que activa sprint e inmunidad de combate durante 5s (+30% velocidad en `useGeolocation.ts`) con reenganche automático si permanece a menos de 25m al expirar el temporizador.
- **Apertura cooperativa del cofre por fases (`ChestLockModal.tsx` y `ChestCountdown.tsx`):** Sustituida la cuenta regresiva estática por un sistema cooperativo de 3 fases de minijuegos con 2 cerrojos cada una (total 6 cerraduras superadas para la victoria): Fase 1 QTE de tiempo con barra oscilante continua y zona verde, Fase 2 código lumínico táctico (Simón Dice) de 3 a 4 colores, y Fase 3 dial rotatorio de frecuencia magnética con sintonizador háptico. Progreso compartido y persistido en tiempo real en toda la escuadra. Bloqueo de apertura si el monstruo está a menos de 20m del tesoro e interrupción inmediata del minijuego con transición directa a combate táctico si el monstruo llega a la posición del jugador.
- **Sprint de furia defensiva del monstruo e IA de patrulla lenta (`monsterAI.ts`):** Reducida la velocidad de patrulla circular normal del monstruo a 1.1 m/s (paseo lento, permitiendo que los jugadores a 1.4 m/s sean notablemente más veloces); en cuanto cualquier miembro de la escuadra abre el minijuego del cofre, el monstruo entra en estado `'defend_chest'` y activa un sprint defensivo drástico a 3.8 m/s directamente hacia las coordenadas del cofre para involucrar en combate a los defensores.
- **Sistema de estructuras tácticas en el mapa (`mapStructures.ts` y `GameMap.tsx`):**
  - Generador determinista de 1 Hospital de Campaña (`🏥`, radio 18m) y 4 Casas / Refugios Tácticos (`🏠`, radio 14m) distribuidos estratégicamente dentro del área operativa y a distancia segura del tesoro.
  - Capas GeoJSON de área táctica (`structures-zones`) con visualización diferenciada de interacción (verde esmeralda para el hospital, cian para los refugios).
  - Mecánica de estar a cubierto / interior: ocultamiento visual del avatar del jugador local al ingresar a cualquier estructura (`style.display = 'none'`) y visualización de aliados con transparencia y etiquetas contextuales (`[HOSPITAL]` o `[A CUBIERTO]`).
  - Banner HUD contextual (`IndoorStatusBanner.tsx`) indicando entrada y cobertura táctica.
  - Curación progresiva en el Hospital (+10 HP/s) hasta el máximo de vida.
  - Evasión de monstruo en Casas / Refugios: el monstruo pierde inmediatamente el aggro y desvía su atención hacia el cofre o hacia objetivos exteriores.
- **Rediseño del ciclo de vida del jugador — Estado "Herido de Muerte" (`critically_wounded`):**
  - Sustituida la muerte definitiva y el modo fantasma automático cuando la salud llega a 0: el HP se ancla en 1 y el estado pasa a `status: 'critically_wounded'` con `isAlive: true`.
  - Bloqueo táctico de acciones: armamento bloqueado visualmente en rojo `[BLOQUEADO: HERIDO DE MUERTE]` (`WeaponWheel.tsx`), habilidades de rol inhabilitadas con candado (`RoleSkillButton.tsx`), e impedimento para abrir cajas de suministros o revivir compañeros. La única acción permitida es desplazarse hacia el Hospital de Campaña.
  - Viñeta roja pulsante en pantalla y alerta crítica con brújula direccional interactiva orientada hacia el Hospital (`CriticallyWoundedOverlay.tsx`).
  - Recuperación médica: permanecer en el Hospital cura el estado `critically_wounded` al alcanzar >= 20 HP, estabilizando al combatiente y devolviéndolo a la batalla activa.
  - Condición de derrota revisada: el equipo solo es derrotado si TODOS los miembros están en estado `critically_wounded` o caídos simultáneamente.
- **Combate táctico continuo en movimiento (`useCombatLoop.ts` y `WeaponWheel.tsx`):** Desacoplado el bucle de disparo/ataque respecto al bucle de desplazamiento (tanto en Tap-to-Move como en modo GPS), eliminando la cancelación de cadencia provocada por los re-renders continuos de posición a 60 FPS; soporte para ataques automáticos ininterrumpidos dentro del rango del arma equipada e incorporación de un gatillo táctico manual e interactivo (`DISPARAR` / `FUEGO!`) en la tarjeta de arma (`WeaponWheel`).
- **Selector de velocidad de movimiento y diferenciación visual de suministros:** Añadido selector táctico de velocidad de desplazamiento en `CreateRoomModal.tsx` (Lento: 0.8 m/s ~3 km/h, Normal: 1.4 m/s ~5 km/h, Rápido: 2.8 m/s ~10 km/h, Muy Rápido: 4.5 m/s ~16 km/h) con integración en `useGeolocation.ts` y aviso dinámico en HUD del mapa; implementada diferenciación visual de airdrops en `GameMap.tsx` con iconos distintivos y etiquetas por categoría (Botiquín, Munición, Rifle Táctico, Escopeta, Cuchillo/Bate) junto a capas GeoJSON translúcidas del radio de interacción de 40m en el terreno; y añadida migración SQL para la columna `player_speed` en `public.games`.
- **Sistema de notificaciones HUD tácticas (`CombatLog.tsx`):** Auto-descarte configurable tras 4 segundos, botón de cierre manual (`X`), descarte de avisos spam/duplicados consecutivos con badge contador acumulativo `(x2, x3...)` y límite visual de renderizado a un máximo de 3 mensajes simultáneos.
- **Explorador de Operaciones Unificado (Públicas y Privadas):** Listado completo de salas activas en `GameExplorer.tsx` eliminando la restricción exclusiva de públicas.
- **Diferenciación visual y seguridad en tarjetas de sala:** Indicador `Globe` para partidas públicas e indicador ámbar de "Acceso Restringido" con `Lock` para privadas, con enmascaramiento de código (`••••••`) y botón dedicado "Acceso Privado".
- **Control de Acceso por Código para Partidas Privadas:** Validación obligatoria del código de 6 letras en `JoinRoomModal.tsx` al intentar ingresar a una operación privada, impidiendo el acceso y disparando alarma sonora y alerta visual en caso de discrepancia.
- Cleanup system for stale/abandoned games (migración SQL con `updated_at`, trigger `tr_games_updated_at`, procedimiento `cleanup_stale_games()`, keep-alive del anfitrión cada 2 min en `useGameRealtime.ts` y filtro anti-salas fantasma >45 min en `GameExplorer.tsx`).
- Protocolo de trabajo multi-agente en paralelo en `AGENTS.md`.
- Sistema para listar partidas públicas/privadas y unirse a partidas empezadas (en curso).
- Mecanismo para cancelar/abandonar partidas desde el HUD (en curso).
- Persistencia de sesión de sala activa en `localStorage` (`utopia_active_room`) con botón de acceso rápido para "Reanudar Misión en Curso".
- Detección reactiva de membresía previa en `JoinRoomModal.tsx` con modo de reconexión directa.

### Fixed
- **Chest lock progress isolated per game instance and reset on new room creation (`App.tsx`, `games` table):**
  - Añadidas las columnas `chest_unlocked_steps` (default 0), `chest_current_phase` (default 1) y `chest_progress_pct` (default 0) a `public.games` para asegurar inicialización limpia e independiente en base de datos.
  - Implementado aislamiento estricto por partida mediante `localStorage` con clave indexada por ID (`utopia_chest_progress_${gameId}`) y eliminación de cualquier caché residual al terminar, abandonar o cancelar una sala.
  - Añadido reseteo de fase y paso en `App.tsx` al cambiar de `game.id` o montar una nueva sala, garantizando que el cofre comience con 0/6 candados desbloqueados y la Fase 1 intacta.
- **Desbloqueo del cofre con monstruo derrotado y eliminación de apertura pasiva por tiempo:**
  - Habilitada la interacción inmediata con el cofre del tesoro cuando el monstruo está muerto o en período de reaparición (`hp <= 0`, `state === 'dead'`, `isRespawning` o `respawnTimeRemaining > 0`), comprobando la condición de vida activa en `handleOpenChestModal`, `ChestCountdown.tsx` y `ChestLockModal.tsx`.
  - Ocultada la advertencia roja de defensa (`¡MONSTRUO DEFENDIENDO EL COFRE!`) siempre que el monstruo no esté vivo, permitiendo abrir el minijuego táctico sin bloqueos cuando el monstruo muere cerca del cofre.
  - Eliminado por completo el temporizador/intervalo residual de apertura pasiva por proximidad: permanecer en el área del cofre ya no avanza porcentaje ni otorga victoria de forma automática.
  - El cofre progresa y se abre exclusivamente al superar los 6 cerrojos interactivos cooperativos (2 de QTE, 2 de código/memoria y 2 de dial magnético), declarando la victoria tras el 6.º reto.
- Fixed: Mobile HUD bottom clipping with safe-area padding and role skill button positioning (Elevado el panel de armas con `bottom-6` y `pb-[env(safe-area-inset-bottom,1rem)]`; habilitado el botón táctil de habilidad de clase visible y activo para todos los roles —Explorador, Médico, Tanque y Tirador— con anillo SVG de progreso de cooldown en `fixed bottom-6 right-4`).
- Fixed: HUD alerts overlap, CombatLog manual dismiss & auto-expiry, WeaponWheel mobile overflow (Contenedor flex vertical para `RespawnTimer`, `ChestCountdown` y aviso de área; auto-descarte de `CombatLog` a los 3.5s con fade-out, aspa `X` de cierre manual y límite de 2 avisos; y blindaje responsivo con `max-w`, padding flexible y safe-area en `WeaponWheel` y `RoleSkillButton`).
- **Corrección definitiva de la IA del monstruo y anclaje en el mapa:** Solucionado el bloqueo de la IA del monstruo en `App.tsx` desacoplando las dependencias volátiles de re-render (`realtime`, `chestHoldersCount`, `addLog`) mediante referencias estables (`useRef`), evitando que el temporizador de 1000ms se cancelara continuamente en cada frame de movimiento; corregida la fórmula de patrulla en `monsterAI.ts` para realizar un desplazamiento circular continuo y suave a lo largo de la circunferencia en vez de saltar 20 grados bruscamente; añadido sistema de contraataque inmediato (`setAggroTarget`) cuando el monstruo recibe daño; y adoptado el anclaje nativo estricto de `maplibregl.Marker` con `anchor: 'center'`, clase `monster-map-marker` y visibilidad reactiva por niebla de guerra en `GameMap.tsx`.
- **Optimización y fluidez del mapa a 60 FPS en PC (`GameMap.tsx`):** Desacoplado por completo el arrastre de cámara (`dragpan`) del clic de movimiento (`tap-to-move`) mediante detección de desplazamiento físico (>6px) y buffer temporal post-drag; separada la actualización de capas GeoJSON estáticas de la niebla de guerra dinámica; optimizado el seguimiento de cámara para evitar interferencias con el ratón; y encapsulado el componente en `React.memo` con `useMemo`/`useCallback` en `App.tsx` para eliminar re-renders innecesarios.
- **Sincronización en tiempo real del movimiento multijugador (`player_move`):** Estandarizado el canal Realtime a `game_room:${game.id}` (UUID), verificación estricta del estado `'SUBSCRIBED'` antes de emitir broadcasts, payload ampliado con `{ userId, playerId, lat, lng, hp, isAlive }`, throttling de 250ms durante animaciones de desplazamiento en Tap-to-Move con envío inmediato de llegada/GPS para evitar saturación de websocket, actualización suave sin desmontar instancias de `maplibregl.Marker` y preservación de coordenadas activas en el listener de cambios de base de datos (`postgres_changes`).
- **Anclaje visual y renderizado del monstruo en el mapa (`GameMap.tsx`):** Eliminada la clase `transition-transform duration-300` del elemento raíz del marcador que provocaba retraso, deslizamiento y flotación respecto al terreno al arrastrar o hacer zoom. Se fijó `anchor: 'center'` nativo, mantenimiento de referencia única en `monsterMarkerRef` y alternancia de niebla de guerra con `style.display = 'none'` sin destruir/recrear el nodo DOM en cada frame.
- Fixed: Removed unsupported .catch() on PostgrestBuilder RPC call (sustituido por invocaciones asíncronas seguras con try/catch en App.tsx, GameExplorer.tsx y useGameRealtime.ts).
- Corrección del punto de spawn de jugadores para evitar apariciones por defecto fuera del área de juego.
- **Reconexión transparente de jugadores:** Se comprueba la existencia previa del usuario en la tabla `players` antes de realizar un `insert`, evitando el error de clave duplicada `unique(game_id, user_id)` y permitiendo restaurar la sesión sin volver a pedir rol ni apodo.
- **Manejo de apodos duplicados:** Asignación automática de sufijo numérico (`_2`, `_3`, etc.) cuando un usuario distinto intenta unirse con el mismo apodo en una misma sala activa.

## [0.2.0] - 2026-10-26
### Fixed
- **Pantalla en negro en despliegue:** Blindaje del cliente de Supabase (`src/lib/supabase.ts`) con credenciales por defecto de respaldo (fallback).
- Retirado el banner de "Configuración pendiente" y habilitada la conexión directa con Supabase por defecto.
- Añadido `src/components/ErrorBoundary.tsx` para captura visual de errores en tiempo de ejecución.
- Inclusión obligatoria de hojas de estilo CSS de MapLibre GL (`maplibre-gl/dist/maplibre-gl.css`).
- Instanciación perezosa (lazy) de Web Audio API para cumplir directivas de autoplay en navegadores móviles.
- Añadida regla de reescritura SPA en `vercel.json`.

## [0.1.0] - 2026-10-26
### Added
- Estructura base de PWA con Vite, React, TypeScript y Tailwind CSS.
- Motor de mapa interactivo MapLibre GL con estilo oscuro vectorial de OpenFreeMap.
- Lógica de juego: clases (Médico, Tanque, Explorador, Tirador), combate por proximidad, airdrops periódicos y niebla de guerra.
- IA del monstruo conducida por el host (patrulla, persecución, fase de furia a <30% HP y reaparición).
- Sistema de reanimación y modo espectador/fantasma con pings tácticos.
- Efectos de sonido sintetizados proceduralmente vía Web Audio API y vibración táctil por proximidad.
- Esquema DDL en Supabase con tablas `games`, `players`, `match_stats` y canales Realtime.
