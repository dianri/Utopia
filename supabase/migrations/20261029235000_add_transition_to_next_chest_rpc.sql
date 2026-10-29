-- RPC autoritativa para reubicar el cofre y avanzar la fase secuencial (SECURITY DEFINER)
-- Garantiza que cualquier participante pueda persistir las nuevas coordenadas y fase sin bloqueos de RLS
CREATE OR REPLACE FUNCTION public.transition_to_next_chest(
  p_game_id uuid,
  p_chest_index integer,
  p_treasure_lat double precision,
  p_treasure_lng double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.games
  SET
    current_chest_index = p_chest_index,
    treasure_lat = p_treasure_lat,
    treasure_lng = p_treasure_lng,
    chest_unlocked_steps = 0,
    chest_current_phase = 1,
    chest_progress_pct = 0,
    settings = jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(settings, '{}'::jsonb),
          '{current_chest_index}',
          to_jsonb(p_chest_index)
        ),
        '{treasure_lat}',
        to_jsonb(p_treasure_lat)
      ),
      '{treasure_lng}',
      to_jsonb(p_treasure_lng)
    )
  WHERE id = p_game_id AND status = 'playing';
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_to_next_chest(uuid, integer, double precision, double precision) TO anon, authenticated, service_role;
