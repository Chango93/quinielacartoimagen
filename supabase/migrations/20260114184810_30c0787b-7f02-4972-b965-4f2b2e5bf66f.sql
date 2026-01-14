-- Cambiar de booleano a guardar el ID de la última jornada contestada
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_survey_matchday_id uuid REFERENCES public.matchdays(id);

-- Limpiar el campo para que todos tengan que contestar
UPDATE public.profiles SET last_survey_matchday_id = NULL;