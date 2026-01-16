-- Fix: Predictions should only be visible when match is finished, not just when matchday closes
-- This prevents users from seeing competitors' predictions for unfinished matches

DROP POLICY IF EXISTS "Users can view predictions when matchday is closed" ON public.predictions;

CREATE POLICY "Users can view predictions when match is finished"
ON public.predictions FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.matches m
        WHERE m.id = match_id 
        AND m.is_finished = true
    )
);