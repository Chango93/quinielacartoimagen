
CREATE OR REPLACE FUNCTION public.update_league_standings_on_finish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only fire when match transitions to finished with valid scores
  IF NEW.is_finished = true AND (OLD.is_finished = false OR OLD.is_finished IS NULL)
     AND NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL THEN

    -- Update home team
    UPDATE public.league_standings
    SET
      played = played + 1,
      won = won + CASE WHEN NEW.home_score > NEW.away_score THEN 1 ELSE 0 END,
      drawn = drawn + CASE WHEN NEW.home_score = NEW.away_score THEN 1 ELSE 0 END,
      lost = lost + CASE WHEN NEW.home_score < NEW.away_score THEN 1 ELSE 0 END,
      goals_for = goals_for + NEW.home_score,
      goals_against = goals_against + NEW.away_score,
      points = points + CASE
        WHEN NEW.home_score > NEW.away_score THEN 3
        WHEN NEW.home_score = NEW.away_score THEN 1
        ELSE 0
      END,
      updated_at = now()
    WHERE team_id = NEW.home_team_id;

    -- Update away team
    UPDATE public.league_standings
    SET
      played = played + 1,
      won = won + CASE WHEN NEW.away_score > NEW.home_score THEN 1 ELSE 0 END,
      drawn = drawn + CASE WHEN NEW.home_score = NEW.away_score THEN 1 ELSE 0 END,
      lost = lost + CASE WHEN NEW.away_score < NEW.home_score THEN 1 ELSE 0 END,
      goals_for = goals_for + NEW.away_score,
      goals_against = goals_against + NEW.home_score,
      points = points + CASE
        WHEN NEW.away_score > NEW.home_score THEN 3
        WHEN NEW.home_score = NEW.away_score THEN 1
        ELSE 0
      END,
      updated_at = now()
    WHERE team_id = NEW.away_team_id;

  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_standings_on_finish
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_league_standings_on_finish();
