-- Add current_chest_index column to games table for sequential chest tracking
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS current_chest_index INTEGER NOT NULL DEFAULT 1;
