
-- Update Toluca vs Juárez to 2-1 (still in progress)
UPDATE public.matches 
SET home_score = 2, away_score = 1, match_status = '2H', updated_at = now()
WHERE id = 'f7832146-c407-4d76-b90e-63a9702ce0f8';

-- Close old stale match QRO vs JUA from Feb 23 (never got scores from API)
UPDATE public.matches 
SET is_finished = true, home_score = 0, away_score = 0, match_status = 'FT', updated_at = now()
WHERE id = '0439115d-805c-4f21-90fe-168b822927b2';
