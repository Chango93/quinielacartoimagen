-- Agregar campo para rastrear si el usuario ha respondido la encuesta
ALTER TABLE public.profiles ADD COLUMN has_answered_survey boolean NOT NULL DEFAULT false;

-- Los usuarios que ya tienen 'both' lo seleccionaron, así que marcamos como contestados
UPDATE public.profiles SET has_answered_survey = true WHERE competition_type = 'both';

-- Los demás (weekly) podrían ser el default, así que los dejamos como no contestados para que contesten