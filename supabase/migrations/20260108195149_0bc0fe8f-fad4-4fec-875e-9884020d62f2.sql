-- Add competition_mode to matchdays table
ALTER TABLE public.matchdays 
ADD COLUMN competition_mode competition_type NOT NULL DEFAULT 'both';

-- Update get_leaderboard to filter by matchday competition_mode
CREATE OR REPLACE FUNCTION public.get_leaderboard()
 RETURNS TABLE(user_id uuid, display_name text, total_points bigint, exact_results bigint, total_predictions bigint, competition_type competition_type)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT 
        pr.user_id,
        COALESCE(pr.display_name, 'Usuario') as display_name,
        COALESCE(SUM(p.points_awarded), 0) as total_points,
        COALESCE(COUNT(CASE WHEN p.points_awarded = 2 THEN 1 END), 0) as exact_results,
        COALESCE(COUNT(p.id), 0) as total_predictions,
        pr.competition_type
    FROM public.profiles pr
    LEFT JOIN public.predictions p ON pr.user_id = p.user_id
    LEFT JOIN public.matches m ON p.match_id = m.id
    LEFT JOIN public.matchdays md ON m.matchday_id = md.id
    WHERE pr.competition_type IN ('season', 'both')
    AND (md.id IS NULL OR md.competition_mode IN ('season', 'both'))
    GROUP BY pr.user_id, pr.display_name, pr.competition_type
    ORDER BY total_points DESC, exact_results DESC, display_name ASC;
$function$;

-- Update get_matchday_leaderboard to include all users (weekly view)
CREATE OR REPLACE FUNCTION public.get_matchday_leaderboard(p_matchday_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, total_points bigint, exact_results bigint, total_predictions bigint, competition_type competition_type)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT 
        pr.user_id,
        COALESCE(pr.display_name, 'Usuario') as display_name,
        COALESCE(SUM(p.points_awarded), 0) as total_points,
        COALESCE(COUNT(CASE WHEN p.points_awarded = 2 THEN 1 END), 0) as exact_results,
        COALESCE(COUNT(p.id), 0) as total_predictions,
        pr.competition_type
    FROM public.profiles pr
    LEFT JOIN public.predictions p ON pr.user_id = p.user_id
    LEFT JOIN public.matches m ON p.match_id = m.id
    WHERE m.matchday_id = p_matchday_id
    GROUP BY pr.user_id, pr.display_name, pr.competition_type
    ORDER BY total_points DESC, exact_results DESC, display_name ASC;
$function$;