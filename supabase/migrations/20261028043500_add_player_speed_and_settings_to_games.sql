-- Migración: Añadir player_speed y settings a la tabla public.games
-- Permite configurar y persistir la velocidad de movimiento (slow, normal, fast, very_fast) y parámetros avanzados

alter table public.games 
add column if not exists player_speed text not null default 'normal' 
check (player_speed in ('slow', 'normal', 'fast', 'very_fast'));

alter table public.games
add column if not exists settings jsonb default '{}'::jsonb;

comment on column public.games.player_speed is 'Velocidad de desplazamiento en modo manual (slow: 0.8 m/s, normal: 1.4 m/s, fast: 2.8 m/s, very_fast: 27.8 m/s)';
comment on column public.games.settings is 'Parámetros y configuración avanzada de la partida';
