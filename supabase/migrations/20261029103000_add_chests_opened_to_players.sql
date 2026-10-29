-- Migración: Añadir columna chests_opened a players y match_stats
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS chests_opened INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.match_stats ADD COLUMN IF NOT EXISTS chests_opened INTEGER NOT NULL DEFAULT 0;
