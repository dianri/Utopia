-- Migración: Añadir player_speed a la tabla public.games
-- Permite configurar la velocidad de movimiento en modo Tap-to-Move (slow, normal, fast, very_fast)

alter table public.games 
add column if not exists player_speed text not null default 'normal' 
check (player_speed in ('slow', 'normal', 'fast', 'very_fast'));

comment on column public.games.player_speed is 'Velocidad de desplazamiento en modo manual (slow: 0.8 m/s, normal: 1.4 m/s, fast: 2.8 m/s, very_fast: 4.5 m/s)';
