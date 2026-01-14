-- Fix: allow automated backend runs (service role) to recalculate points
-- NOTE: current_user inside SECURITY DEFINER is the definer, so we must use auth.role() instead.
CREATE OR REPLACE FUNCTION public.recalculate_matchday_points(p_matchday_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  req_role text;
BEGIN
  req_role := auth.role();

  -- Allow automations running with service role
  IF req_role IS DISTINCT FROM 'service_role' THEN
    -- Otherwise, require an admin user
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only admins can recalculate points';
    END IF;
  END IF;

  -- Reset points for matches without scores
  UPDATE public.predictions p
  SET points_awarded = NULL,
      updated_at = now()
  FROM public.matches m
  WHERE p.match_id = m.id
    AND m.matchday_id = p_matchday_id
    AND (m.home_score IS NULL OR m.away_score IS NULL);

  -- Calculate points for matches WITH scores (live or finished)
  UPDATE public.predictions p
  SET points_awarded = public.calculate_prediction_points(
      p.predicted_home_score,
      p.predicted_away_score,
      m.home_score,
      m.away_score
    ),
    updated_at = now()
  FROM public.matches m
  WHERE p.match_id = m.id
    AND m.matchday_id = p_matchday_id
    AND m.home_score IS NOT NULL
    AND m.away_score IS NOT NULL;
END;
$$;