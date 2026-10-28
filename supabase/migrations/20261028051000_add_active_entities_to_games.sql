-- Migration: Add active entities columns to games table
-- Authoritative persistence of active supply crates, wild pets, and dropped items

ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS active_crates JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS active_wild_pets JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS active_dropped_items JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS active_loot JSONB DEFAULT '[]'::jsonb;
