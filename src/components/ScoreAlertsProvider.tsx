import { useScoreAlerts } from '@/hooks/useScoreAlerts';

export function ScoreAlertsProvider({ children }: { children: React.ReactNode }) {
  useScoreAlerts();
  return <>{children}</>;
}
