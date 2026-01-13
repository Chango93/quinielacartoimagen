
-- Drop the restrictive admin policy and recreate as permissive
DROP POLICY IF EXISTS "Admins can manage all predictions" ON public.predictions;

-- Create a permissive policy that allows admins to do everything
CREATE POLICY "Admins can manage all predictions"
ON public.predictions
AS PERMISSIVE
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
