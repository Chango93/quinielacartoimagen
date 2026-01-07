
-- Primero eliminar la función existente para poder cambiar su firma
DROP FUNCTION IF EXISTS public.get_leaderboard();

-- Crear enum para tipo de competencia
CREATE TYPE public.competition_type AS ENUM ('weekly', 'season', 'both');

-- Añadir columna competition_type a profiles
ALTER TABLE public.profiles 
ADD COLUMN competition_type public.competition_type NOT NULL DEFAULT 'weekly';

-- Recrear función get_leaderboard con competition_type
CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE(user_id uuid, display_name text, total_points bigint, exact_results bigint, total_predictions bigint, competition_type public.competition_type)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT 
        pr.user_id,
        COALESCE(pr.display_name, 'Usuario') as display_name,
        COALESCE(SUM(p.points_awarded), 0) as total_points,
        COALESCE(COUNT(CASE WHEN p.points_awarded = 2 THEN 1 END), 0) as exact_results,
        COALESCE(COUNT(p.id), 0) as total_predictions,
        pr.competition_type
    FROM public.profiles pr
    LEFT JOIN public.predictions p ON pr.user_id = p.user_id
    GROUP BY pr.user_id, pr.display_name, pr.competition_type
    ORDER BY total_points DESC, exact_results DESC, display_name ASC;
$$;

-- Crear función para leaderboard por jornada
CREATE OR REPLACE FUNCTION public.get_matchday_leaderboard(p_matchday_id uuid)
RETURNS TABLE(user_id uuid, display_name text, total_points bigint, exact_results bigint, total_predictions bigint, competition_type public.competition_type)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT 
        pr.user_id,
        COALESCE(pr.display_name, 'Usuario') as display_name,
        COALESCE(SUM(p.points_awarded), 0) as total_points,
        COALESCE(COUNT(CASE WHEN p.points_awarded = 2 THEN 1 END), 0) as exact_results,
        COALESCE(COUNT(p.id), 0) as total_predictions,
        pr.competition_type
    FROM public.profiles pr
    LEFT JOIN public.predictions p ON pr.user_id = p.user_id
    LEFT JOIN public.matches m ON p.match_id = m.id
    WHERE m.matchday_id = p_matchday_id
    GROUP BY pr.user_id, pr.display_name, pr.competition_type
    ORDER BY total_points DESC, exact_results DESC, display_name ASC;
$$;

-- Función para obtener todas las predicciones de una jornada (solo admins)
CREATE OR REPLACE FUNCTION public.get_matchday_predictions(p_matchday_id uuid)
RETURNS TABLE(
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
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

-- Política para que admins puedan actualizar profiles (competition_type)
CREATE POLICY "Admins can update all profiles" 
ON public.profiles 
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));
