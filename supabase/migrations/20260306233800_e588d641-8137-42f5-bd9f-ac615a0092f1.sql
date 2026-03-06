
-- Remove user INSERT policy (service role via edge function handles inserts)
DROP POLICY IF EXISTS "Users can insert own payments" ON public.matchday_payments;

-- Also prevent users from updating payment status directly
-- (only service role in edge functions should update status)
CREATE POLICY "Users can insert own payments pending only"
ON public.matchday_payments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'pending' AND stripe_session_id IS NULL);
