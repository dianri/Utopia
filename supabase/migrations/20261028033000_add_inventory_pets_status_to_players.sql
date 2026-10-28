-- Migración: Añadir columnas de inventario, mascotas y estado a public.players
-- Permite persistir de forma continua el estado completo del jugador en Supabase para reconexiones sin pérdida de datos
alter table public.players
add column if not exists inventory jsonb default '[]'::jsonb,
add column if not exists pets jsonb default '[]'::jsonb,
add column if not exists status text default 'active';

comment on column public.players.inventory is 'Lista serializada de armas y suministros en la mochila del jugador';
comment on column public.players.pets is 'Lista serializada de mascotas adoptadas que acompañan al jugador';
comment on column public.players.status is 'Estado táctico del jugador (active, critically_wounded, dead)';
