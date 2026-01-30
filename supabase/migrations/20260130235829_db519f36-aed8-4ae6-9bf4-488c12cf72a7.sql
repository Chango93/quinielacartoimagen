-- Add UPDATE and DELETE policies to world_cup_interest table for user control over their data
CREATE POLICY "Users can update their own response" 
ON public.world_cup_interest 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own response" 
ON public.world_cup_interest 
FOR DELETE 
USING (auth.uid() = user_id);