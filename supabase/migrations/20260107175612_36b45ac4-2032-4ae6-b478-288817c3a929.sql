-- Crear enum para roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Tabla de roles de usuario (separada por seguridad)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Función para verificar rol (SECURITY DEFINER para evitar recursión)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Políticas RLS para user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Tabla de perfiles de usuario
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    email TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Tabla de equipos
CREATE TABLE public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view teams"
ON public.teams FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage teams"
ON public.teams FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Tabla de jornadas
CREATE TABLE public.matchdays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    is_open BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.matchdays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view matchdays"
ON public.matchdays FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage matchdays"
ON public.matchdays FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Tabla de partidos
CREATE TABLE public.matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matchday_id UUID REFERENCES public.matchdays(id) ON DELETE CASCADE NOT NULL,
    home_team_id UUID REFERENCES public.teams(id) NOT NULL,
    away_team_id UUID REFERENCES public.teams(id) NOT NULL,
    match_date TIMESTAMP WITH TIME ZONE NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    is_finished BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view matches"
ON public.matches FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage matches"
ON public.matches FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Tabla de predicciones
CREATE TABLE public.predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
    predicted_home_score INTEGER NOT NULL,
    predicted_away_score INTEGER NOT NULL,
    points_awarded INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, match_id)
);

ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own predictions"
ON public.predictions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view predictions when matchday is closed"
ON public.predictions FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.matches m
        JOIN public.matchdays md ON m.matchday_id = md.id
        WHERE m.id = match_id AND md.is_open = false
    )
);

CREATE POLICY "Users can insert their own predictions"
ON public.predictions FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
        SELECT 1 FROM public.matches m
        JOIN public.matchdays md ON m.matchday_id = md.id
        WHERE m.id = match_id AND md.is_open = true
    )
);

CREATE POLICY "Users can update their own predictions when matchday is open"
ON public.predictions FOR UPDATE
TO authenticated
USING (
    auth.uid() = user_id AND
    EXISTS (
        SELECT 1 FROM public.matches m
        JOIN public.matchdays md ON m.matchday_id = md.id
        WHERE m.id = match_id AND md.is_open = true
    )
);

CREATE POLICY "Admins can view all predictions"
ON public.predictions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all predictions"
ON public.predictions FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger para crear perfil y rol automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email, display_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Función para calcular puntos
CREATE OR REPLACE FUNCTION public.calculate_prediction_points(
    pred_home INTEGER,
    pred_away INTEGER,
    real_home INTEGER,
    real_away INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
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

-- Función para recalcular todos los puntos de una jornada
CREATE OR REPLACE FUNCTION public.recalculate_matchday_points(p_matchday_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.predictions p
    SET points_awarded = public.calculate_prediction_points(
        p.predicted_home_score,
        p.predicted_away_score,
        m.home_score,
        m.away_score
    ),
    updated_at = now()
    FROM public.matches m
    WHERE p.match_id = m.id
    AND m.matchday_id = p_matchday_id
    AND m.is_finished = true
    AND m.home_score IS NOT NULL
    AND m.away_score IS NOT NULL;
END;
$$;

-- Función para obtener la tabla general de puntos
CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (
    user_id UUID,
    display_name TEXT,
    email TEXT,
    total_points BIGINT,
    exact_results BIGINT,
    total_predictions BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        pr.user_id,
        pr.display_name,
        pr.email,
        COALESCE(SUM(p.points_awarded), 0) as total_points,
        COALESCE(COUNT(CASE WHEN p.points_awarded = 2 THEN 1 END), 0) as exact_results,
        COALESCE(COUNT(p.id), 0) as total_predictions
    FROM public.profiles pr
    LEFT JOIN public.predictions p ON pr.user_id = p.user_id
    GROUP BY pr.user_id, pr.display_name, pr.email
    ORDER BY total_points DESC, exact_results DESC, display_name ASC;
$$;

-- Trigger para actualizar timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_matchdays_updated_at
    BEFORE UPDATE ON public.matchdays
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_matches_updated_at
    BEFORE UPDATE ON public.matches
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_predictions_updated_at
    BEFORE UPDATE ON public.predictions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();