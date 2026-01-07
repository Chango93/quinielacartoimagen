-- Fix the view to use SECURITY INVOKER (safer default)
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public 
WITH (security_invoker = true)
AS
SELECT user_id, display_name, competition_type, created_at, updated_at
FROM public.profiles;

-- Re-grant access to the view
GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;

-- Re-create the get_matchday_predictions function with proper access controls
-- The previous migration may have failed to replace the SQL function with plpgsql version
DROP FUNCTION IF EXISTS public.get_matchday_predictions(uuid);

CREATE FUNCTION public.get_matchday_predictions(p_matchday_id uuid)
RETURNS TABLE (
  prediction_id uuid,
  user_id uuid,
  display_name text,
  match_id uuid,
  home_team_name text,
  away_team_name text,
  predicted_home_score integer,
  predicted_away_score integer,
  home_score integer,
  away_score integer,
  points_awarded integer,
  is_finished boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_matchday_open boolean;
BEGIN
  -- Check matchday status
  SELECT md.is_open INTO is_matchday_open 
  FROM matchdays md
  WHERE md.id = p_matchday_id;
  
  -- Only allow if matchday is closed OR user is admin
  IF is_matchday_open = true AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Predictions only visible after matchday closes';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id as prediction_id,
    p.user_id,
    COALESCE(pr.display_name, 'Usuario') as display_name,
    m.id as match_id,
    ht.name as home_team_name,
    at.name as away_team_name,
    p.predicted_home_score,
    p.predicted_away_score,
    m.home_score,
    m.away_score,
    p.points_awarded,
    m.is_finished
  FROM public.predictions p
  JOIN public.profiles pr ON p.user_id = pr.user_id
  JOIN public.matches m ON p.match_id = m.id
  JOIN public.teams ht ON m.home_team_id = ht.id
  JOIN public.teams at ON m.away_team_id = at.id
  WHERE m.matchday_id = p_matchday_id
  ORDER BY pr.display_name, ht.name;
END;
$$;