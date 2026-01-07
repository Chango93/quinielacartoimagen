-- Fix 1: Drop and recreate get_leaderboard without email field
DROP FUNCTION IF EXISTS public.get_leaderboard();

CREATE FUNCTION public.get_leaderboard()
RETURNS TABLE (
    user_id UUID,
    display_name TEXT,
    total_points BIGINT,
    exact_results BIGINT,
    total_predictions BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        pr.user_id,
        COALESCE(pr.display_name, 'Usuario') as display_name,
        COALESCE(SUM(p.points_awarded), 0) as total_points,
        COALESCE(COUNT(CASE WHEN p.points_awarded = 2 THEN 1 END), 0) as exact_results,
        COALESCE(COUNT(p.id), 0) as total_predictions
    FROM public.profiles pr
    LEFT JOIN public.predictions p ON pr.user_id = p.user_id
    GROUP BY pr.user_id, pr.display_name
    ORDER BY total_points DESC, exact_results DESC, display_name ASC;
$$;

-- Fix 2: Add admin check to recalculate_matchday_points
CREATE OR REPLACE FUNCTION public.recalculate_matchday_points(p_matchday_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
    -- Check if caller is admin
    IF NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Only admins can recalculate points';
    END IF;

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
    AND m.is_finished = true
    AND m.home_score IS NOT NULL
    AND m.away_score IS NOT NULL;
END;
$function$;