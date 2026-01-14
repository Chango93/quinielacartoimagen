-- Allow backend (service_role) to recalculate points during automated sync
CREATE OR REPLACE FUNCTION public.recalculate_matchday_points(p_matchday_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Allow if caller is service_role (automations), otherwise require admin user
    IF current_user <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Only admins can recalculate points';
    END IF;

    -- Reset points for matches without scores
    UPDATE public.predictions p
    SET points_awarded = NULL,
        updated_at = now()
    FROM public.matches m
    WHERE p.match_id = m.id
      AND m.matchday_id = p_matchday_id
      AND (m.home_score IS NULL OR m.away_score IS NULL);

    -- Calculate points for matches WITH scores (regardless of is_finished status)
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

-- Enable realtime broadcasts for live score + points updates (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'matches'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.matches';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'predictions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.predictions';
  END IF;
END
$$;