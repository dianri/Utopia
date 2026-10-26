# AGENTS.md

> **Directrices de Desarrollo para Agentes de IA**

Este documento establece las normas obligatorias que el agente de desarrollo debe seguir estrictamente en todas las tareas, correcciones e implementaciones de este proyecto.

## 🌿 1. Flujo de Control de Versiones y Ramas

- **Creación de Rama:** Antes de iniciar cualquier tarea, refactorización o implementación de una nueva característica (*feature*), es obligatorio crear y situarse en una rama específica con el formato:
  `features/nombre-descriptivo-de-la-tarea` o `fix/nombre-del-error`.
- **Fusión:** Una vez completada y verificada la tarea, los cambios deben fusionarse a la rama principal (`main`) de forma limpia.

## 🛠️ 2. Quality Gate (Compilación y Verificación)

- **Cero Errores:** Antes de dar por finalizada cualquier tarea, es obligatorio ejecutar el comando de compilación del proyecto (ej. `npm run build`) y verificar que finaliza con **0 errores y 0 advertencias**.
- **Validación Estricta:** No se permite realizar commits ni merges si la compilación falla o si quedan dependencias rotas.

## 📚 3. Actualización Post-Feature (Documentación Obligatoria)

- **Sincronización de Documentación:** Después de completar, verificar y fusionar cada nueva *feature* o cambio arquitectónico relevante, es **obligatorio** revisar y actualizar:
  - El archivo **`AGENTS.md`** (si se han introducido nuevas pautas, flujos o directrices técnicas).
  - El archivo **`README.md`** (para reflejar cambios funcionales, de dependencias, nuevas características o instrucciones de configuración actualizadas).

## 📐 4. Principios de Arquitectura y Código Limpio

- **Arquitectura Limpia:** Prioriza el desacoplamiento de responsabilidades (separación entre lógica de cliente y base de datos/servidor cuando aplique).
- **Consistencia Visual y UX:** Mantén la coherencia en el diseño responsivo (mobile-first), componentes reutilizables y clases de estilos establecidas en el proyecto.

## 🧭 Contexto del Proyecto

Datos objetivos del repositorio que el agente debe tener presentes:

- **Repositorio:** <https://github.com/dianri/Utopia> (público).
- **Backend:** Supabase, proyecto `iadiswktxduqetzjujli` (`https://iadiswktxduqetzjujli.supabase.co`).
- **Acceso a datos:** servidor MCP `supabase` (remoto, scopeado a ese proyecto). Para cambios de esquema usar `apply_migration`; `execute_sql` solo para consultas.
- **Stack de aplicación:** por definir (aún no hay `package.json`).
- **Comando de build:** pendiente de definir. Cuando exista, el Quality Gate de la sección 2 se ejecuta con `npm run build` (o el equivalente del stack elegido) antes de cada commit y merge.

### Secretos

- **Nunca** commitear: tokens `sbp_…`, claves `service_role`, `.env` / `.env.*` ni credenciales de base de datos.
- **Seguro para el repo (público):** la URL del proyecto y la clave publicable (`sb_publishable_…`) únicamente si el código la consume desde el cliente.
- La configuración del MCP y su token viven fuera del repositorio, en la configuración global de OpenCode.
