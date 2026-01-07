import Leaderboard from '@/components/Leaderboard';

export default function Tabla() {
  return (
    <div className="container py-8 max-w-3xl">
      <div className="card-sports p-6">
        <Leaderboard showTitle={true} />
      </div>
    </div>
  );
}
