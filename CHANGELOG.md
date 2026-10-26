# Changelog — Utopia (Las Meriendas: Monster Hunt)

Todos los cambios notables en este proyecto serán documentados en este archivo.
El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

## [Unreleased]
### Added
- Cleanup system for stale/abandoned games (migración SQL con `updated_at`, trigger `tr_games_updated_at`, procedimiento `cleanup_stale_games()`, keep-alive del anfitrión cada 2 min en `useGameRealtime.ts` y filtro anti-salas fantasma >45 min en `GameExplorer.tsx`).
- Protocolo de trabajo multi-agente en paralelo en `AGENTS.md`.
- Sistema para listar partidas públicas/privadas y unirse a partidas empezadas (en curso).
- Mecanismo para cancelar/abandonar partidas desde el HUD (en curso).
- Persistencia de sesión de sala activa en `localStorage` (`utopia_active_room`) con botón de acceso rápido para "Reanudar Misión en Curso".
- Detección reactiva de membresía previa en `JoinRoomModal.tsx` con modo de reconexión directa.

### Fixed
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
