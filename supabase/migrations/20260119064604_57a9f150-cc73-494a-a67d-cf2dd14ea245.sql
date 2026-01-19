-- Add CHECK constraints for score validation on predictions table
ALTER TABLE public.predictions 
ADD CONSTRAINT predictions_home_score_range 
CHECK (predicted_home_score >= 0 AND predicted_home_score <= 99);

ALTER TABLE public.predictions 
ADD CONSTRAINT predictions_away_score_range 
CHECK (predicted_away_score >= 0 AND predicted_away_score <= 99);

-- Add CHECK constraints for score validation on matches table
ALTER TABLE public.matches
ADD CONSTRAINT matches_home_score_range
CHECK (home_score IS NULL OR (home_score >= 0 AND home_score <= 99));

ALTER TABLE public.matches
ADD CONSTRAINT matches_away_score_range
CHECK (away_score IS NULL OR (away_score >= 0 AND away_score <= 99));