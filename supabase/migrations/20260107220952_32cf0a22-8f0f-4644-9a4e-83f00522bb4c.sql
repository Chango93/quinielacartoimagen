-- FIX 1: Protect email addresses in profiles table
-- Create a public view without sensitive data
CREATE VIEW public.profiles_public AS
SELECT user_id, display_name, competition_type, created_at, updated_at
FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;

-- Update RLS policy to restrict direct profile access to own record + admins
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Users can only see their own profile (for email access)
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- FIX 2: Add access control to get_matchday_predictions function
-- Only allow access if matchday is closed OR user is admin
CREATE OR REPLACE FUNCTION public.get_matchday_predictions(p_matchday_id uuid)
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

-- FIX 3: Add CHECK constraints for score validation
ALTER TABLE predictions 
ADD CONSTRAINT predictions_home_score_check CHECK (predicted_home_score >= 0 AND predicted_home_score <= 99),
ADD CONSTRAINT predictions_away_score_check CHECK (predicted_away_score >= 0 AND predicted_away_score <= 99);

ALTER TABLE matches
ADD CONSTRAINT matches_home_score_check CHECK (home_score IS NULL OR (home_score >= 0 AND home_score <= 99)),
ADD CONSTRAINT matches_away_score_check CHECK (away_score IS NULL OR (away_score >= 0 AND away_score <= 99));