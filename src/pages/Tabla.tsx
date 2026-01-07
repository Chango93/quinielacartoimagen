import Leaderboard from '@/components/Leaderboard';
import PublicPredictions from '@/components/PublicPredictions';

export default function Tabla() {
  return (
    <div className="container py-8 max-w-3xl space-y-6">
      <div className="card-sports p-6">
        <Leaderboard showTitle={true} />
      </div>
      
      <div className="card-sports p-6">
        <PublicPredictions />
      </div>
    </div>
  );
}
