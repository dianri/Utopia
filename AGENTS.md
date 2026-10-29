# Directrices de Desarrollo Multi-Agente en Paralelo — Utopia

Este documento define el protocolo operativo para que dos o más agentes de IA trabajen de forma concurrente sobre el repositorio sin generar colisiones de Git, desincronización de dependencias ni conflictos en la base de datos de Supabase.

---

## 1. Principio Fundamental: División de Dominios y "File Ownership"

Para evitar solapamientos, las tareas en paralelo deben asignarse a dominios aislados. Dos agentes **nunca** deben editar el mismo archivo simultáneamente.

### Dominios Arquitectónicos Desacoplados:
- **Dominio UI / HUD / Map Engine:**
  - Directorios exclusivos: `src/components/`, `src/hooks/useGeolocation.ts`.
  - Responsabilidad: Renderizado de MapLibre, estilos Tailwind, modales, vistas del lobby y componentes visuales.
- **Dominio Lógica de Juego / Red / Audio / IA:**
  - Directorios exclusivos: `src/services/`, `src/hooks/useGameRealtime.ts`, `src/hooks/usePvPCombat.ts`.
  - Responsabilidad: Máquina de estados del monstruo, bucle de combate PvE y PvP en tiempo real, síntesis Web Audio y broadcast de Supabase.
- **Zona Compartida / Contratos de Interfaz (Bloqueo previo):**
  - Archivos: `src/types/game.ts`, `src/types/supabase.ts`, `src/lib/supabase.ts`, `package.json`.
  - **Regla estricta:** Si una tarea requiere modificar tipos o el cliente de Supabase, un único agente debe definir y fusionar el contrato de interfaz en `main` **antes** de que el resto comience a implementar sobre él.

---

## 2. Flujo de Trabajo Git Flow Concurrente

### A. Ramas Exclusivas por Agente
- Todo trabajo en paralelo debe realizarse en ramas independientes con prefijo identificativo:
  - Formato: `feature/agent-<id>-<descripcion-corta>` (ejemplo: `feature/agent-1-cancel-game`, `feature/agent-2-public-rooms`).
- **Prohibido trabajar o subir commits directos a `main`**.

### B. Ciclo de Trabajo Obligatorio por Turno:
1. **Sincronización inicial:**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/agent-<id>-<tarea>
   ```
2. **Desarrollo delimitado:** Modificar únicamente los archivos asignados al alcance de la tarea.
3. **Rebase antes de fusionar:** Antes de cerrar la tarea, actualizar la rama con respecto a los últimos cambios que otro agente haya integrado en `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
4. **Verificación local (Quality Gate):**
   ```bash
   npm run build
   ```
   Si `npm run build` falla por errores de TypeScript o dependencias, el agente DEBE resolverlos antes de proceder (**0 errores y 0 advertencias**).
5. **Fusión limpia y Push:**
   ```bash
   git checkout main
   git pull origin main
   git merge --no-ff feature/agent-<id>-<tarea>
   git push origin main
   git branch -d feature/agent-<id>-<tarea>
   ```

---

## 3. Protocolo de Resolución de Conflictos y Archivos Críticos

### A. Gestión de package.json y Dependencias
- Si un agente necesita instalar una librería (`npm i <paquete>`), debe notificarlo en su resumen de tarea.
- Si dos ramas añaden dependencias distintas, resolver los conflictos en `package.json` y regenerar `package-lock.json` mediante `npm install` antes de completar la integración.

### B. Modificaciones en Base de Datos (Supabase / DDL)
- Ningún agente debe modificar migraciones previas ya aplicadas.
- Cada cambio en base de datos debe añadirse como una nueva migración incremental en `supabase/migrations/` con timestamp secuencial o documentarse explícitamente en el commit para su ejecución en el SQL Editor de Supabase.

### C. Sincronización Continua de Documentación (`README.md` y `AGENTS.md`)
- **Regla estricta:** Con cada nueva feature, refactor o corrección de comportamiento, el agente **DEBE revisar y sincronizar obligatoriamente tanto `README.md` como `AGENTS.md`**:
  - `README.md`: Debe reflejar inmediatamente cualquier nueva mecánica de juego, controles, cambios en la UI/HUD, reglas de combate o arquitectura técnica visible para usuarios y desarrolladores.
  - `AGENTS.md`: Debe actualizarse si la tarea introduce nuevos dominios de código, nuevos archivos compartidos, cambios en el flujo de trabajo concurrente o directrices operativas.

---

## 4. Checklist de Validación para el Agente antes de Finalizar

Cada agente debe cumplir y reportar el siguiente checklist al culminar su intervención:

- [ ] ¿He editado únicamente los archivos relacionados con mi tarea asignada?
- [ ] ¿He verificado que `main` no tenga cambios pendientes antes de fusionar?
- [ ] ¿He ejecutado `npm run build` sin errores de compilación ni advertencias de tipos TypeScript?
- [ ] ¿He probado que la aplicación compila con `vite-plugin-pwa` y no rompe los chunks de build?
- [ ] ¿Se ha documentado en el mensaje de commit qué módulos fueron modificados y qué endpoints o eventos de Supabase se vieron afectados?
- [ ] ¿He registrado mis cambios (Added, Changed, Fixed, Database, Documentation) en la sección [Unreleased] de CHANGELOG.md?
- [ ] ¿He revisado y actualizado `README.md` reflejando las nuevas mecánicas, controles o cambios arquitectónicos introducidos?
- [ ] ¿He revisado y actualizado `AGENTS.md` si la intervención modifica dominios, contratos de interfaz o directrices operativas?

---

## 🧭 Contexto del Proyecto

Datos objetivos del repositorio que el agente debe tener presentes:

- **Repositorio:** <https://github.com/dianri/Utopia> (público).
- **Backend:** Supabase, proyecto `iadiswktxduqetzjujli` (`https://iadiswktxduqetzjujli.supabase.co`).
- **Acceso a datos:** Servidor MCP `supabase` (remoto, scopeado a ese proyecto). Para cambios de esquema usar `apply_migration`; `execute_sql` solo para consultas.
- **Stack de aplicación:** React 18+, Vite, TypeScript, Tailwind CSS, MapLibre GL, Supabase JS, Web Audio API, `vite-plugin-pwa`.
- **Comando de build:** `npm run build` (`tsc && vite build`). El Quality Gate se ejecuta obligatoriamente antes de cada commit y merge asegurando 0 errores y 0 advertencias.

### Secretos
- **Nunca** commitear: tokens `sbp_…`, claves `service_role`, `.env` / `.env.*` ni credenciales de base de datos.
- **Seguro para el repo (público):** la URL del proyecto y la clave publicable (`sb_publishable_…`) únicamente si el código la consume desde el cliente.
- La configuración del MCP y su token viven fuera del repositorio, en la configuración global de OpenCode.
