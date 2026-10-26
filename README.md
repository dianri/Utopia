# Utopia

Repositorio del proyecto **Utopia**.

## Estado

Proyecto recién inicializado. Aún no hay código ni estructura de carpetas.

## Primeros pasos

```bash
git clone https://github.com/dianri/Utopia.git
cd Utopia
```

## Estructura

Por definir según la tecnología que se use.

## Flujo de trabajo

Las normas de trabajo del proyecto están en [`AGENTS.md`](./AGENTS.md) y son de obligado cumplimiento:

1. Cada tarea se desarrolla en una rama `features/nombre-descriptivo` o `fix/nombre-del-error`.
2. Antes de commitear, la compilación debe terminar con 0 errores y 0 advertencias.
3. Tras fusionar en `main`, se actualizan `AGENTS.md` y este `README.md` si aplica.

```bash
git checkout -b features/mi-tarea
# ... trabajo ...
git add -A && git commit -m "feat: mi tarea"
git checkout main && git merge features/mi-tarea && git push
```

## Backend

Base de datos y autenticación con [Supabase](https://supabase.com/dashboard/project/iadiswktxduqetzjujli) (proyecto `iadiswktxduqetzjujli`). El esquema se gestiona mediante migraciones versionadas.

> Los tokens de acceso (`sbp_…`), las claves `service_role` y los archivos `.env*` **nunca** se suben al repositorio.

## Licencia

Por definir.
