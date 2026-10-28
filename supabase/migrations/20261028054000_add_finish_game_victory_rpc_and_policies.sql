-- Añadir columna winner a games si no existe
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS winner TEXT;

-- RPC autoritativa para registrar victoria y sellar la sala de forma atómica (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.finish_game_victory(
  p_game_id uuid,
  p_winner_nickname text DEFAULT 'Escuadra'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.games
  SET 
    status = 'victory',
    ended_at = coalesce(ended_at, now()),
    winner = coalesce(p_winner_nickname, 'Escuadra'),
    chest_opened = true,
    chest_unlocked_steps = 6,
    chest_current_phase = 3,
    chest_progress_pct = 100
  WHERE id = p_game_id AND status IN ('playing', 'lobby');
END;
$$;

-- Permisos de ejecución para anon, authenticated y service_role
GRANT EXECUTE ON FUNCTION public.finish_game_victory(uuid, text) TO anon, authenticated, service_role;

-- RPC autoritativa para persistir progreso de cerrojos del cofre por cualquier participante
CREATE OR REPLACE FUNCTION public.update_chest_progress(
  p_game_id uuid,
  p_unlocked_steps integer,
  p_current_phase integer,
  p_progress_pct integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.games
  SET 
    chest_unlocked_steps = p_unlocked_steps,
    chest_current_phase = p_current_phase,
    chest_progress_pct = p_progress_pct
  WHERE id = p_game_id AND status = 'playing';
END;
$$;

-- Permisos de ejecución para anon, authenticated y service_role
GRANT EXECUTE ON FUNCTION public.update_chest_progress(uuid, integer, integer, integer) TO anon, authenticated, service_role;

-- Permitir que cualquier participante registrado en la partida pueda actualizar games
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'games' AND policyname = 'games_update_participants'
  ) THEN
    CREATE POLICY "games_update_participants" ON "public"."games"
    FOR UPDATE TO public
    USING (
      auth.uid() = host_id OR
      EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.game_id = games.id AND p.user_id = auth.uid()
      )
    )
    WITH CHECK (
      auth.uid() = host_id OR
      EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.game_id = games.id AND p.user_id = auth.uid()
      )
    );
  END IF;
END $$;
