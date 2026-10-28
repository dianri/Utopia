-- Migración: Añadir columna chest_opened a public.games
-- Registra si el cofre del tesoro ha sido completamente abierto tras los 6 cerrojos
alter table public.games 
add column if not exists chest_opened boolean not null default false;

comment on column public.games.chest_opened is 'Indica si el cofre del tesoro ha sido completamente abierto y asegurado';
