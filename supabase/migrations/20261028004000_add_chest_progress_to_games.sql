-- Migración: Añadir columnas de progreso del cofre a public.games
-- Permite persistir y aislar de forma estricta las fases y cerrojos del cofre por partida
alter table public.games 
add column if not exists chest_unlocked_steps integer not null default 0,
add column if not exists chest_current_phase integer not null default 1,
add column if not exists chest_progress_pct integer not null default 0;

comment on column public.games.chest_unlocked_steps is 'Número de cerrojos desbloqueados en el cofre (0 a 6)';
comment on column public.games.chest_current_phase is 'Fase actual de desencriptación del cofre (1, 2 o 3)';
comment on column public.games.chest_progress_pct is 'Porcentaje de progreso de apertura del cofre (0 a 100)';
