-- Migration: Cleanup system for stale and abandoned games
-- Description: Adds updated_at tracking, automatic update trigger, and stale game cleanup procedure.

-- 1. Add updated_at column to public.games
alter table public.games add column if not exists updated_at timestamptz default now();

-- 2. Trigger function to update updated_at on row changes
create or replace function public.update_games_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tr_games_updated_at on public.games;

create trigger tr_games_updated_at
before update on public.games
for each row execute function public.update_games_updated_at();

-- 3. Procedure to cleanup stale games
create or replace function public.cleanup_stale_games()
returns void as $$
begin
  -- Eliminar partidas en lobby inactivas por más de 1 hora
  delete from public.games
  where status = 'lobby'
    and coalesce(updated_at, created_at) < now() - interval '1 hour';

  -- Eliminar partidas terminadas o canceladas de más de 30 minutos
  delete from public.games
  where status in ('cancelled', 'victory', 'defeat')
    and coalesce(updated_at, created_at) < now() - interval '30 minutes';

  -- Eliminar partidas en curso que lleven más de 3 horas sin actividad
  delete from public.games
  where status = 'playing'
    and coalesce(updated_at, created_at) < now() - interval '3 hours';
end;
$$ language plpgsql security definer;

-- 4. Permissions for opportunistic execution from frontend
grant execute on function public.cleanup_stale_games() to anon, authenticated, service_role;

-- 5. Performance index on status and updated_at
create index if not exists idx_games_updated_at_status on public.games (status, updated_at);
