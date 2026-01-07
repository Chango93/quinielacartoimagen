-- Arreglar funciones sin search_path
CREATE OR REPLACE FUNCTION public.calculate_prediction_points(
    pred_home INTEGER,
    pred_away INTEGER,
    real_home INTEGER,
    real_away INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Resultado exacto: 2 puntos
    IF pred_home = real_home AND pred_away = real_away THEN
        RETURN 2;
    END IF;
    
    -- Ganador/empate correcto: 1 punto
    IF (pred_home > pred_away AND real_home > real_away) OR
       (pred_home < pred_away AND real_home < real_away) OR
       (pred_home = pred_away AND real_home = real_away) THEN
        RETURN 1;
    END IF;
    
    -- Incorrecto: 0 puntos
    RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;