import { Spectator } from 'shared';
import Avatar from './Avatar';
import { useGameStore } from '../lib/store';
import { getSocket } from '../lib/socket';

interface SpectatorPanelProps {
  spectators: Spectator[];
  canJoin: boolean; // true if room has space & game not active
}

export default function SpectatorPanel({ spectators, canJoin }: Readonly<SpectatorPanelProps>) {
  const myPlayerId = useGameStore(s => s.playerId);

  if (spectators.length === 0) return null;

  const handleJoinAsPlayer = () => {
    getSocket().emit('join-as-player', (res: any) => {
      if (!res.success) {
        console.warn('Could not join as player:', res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 bg-black/30 backdrop-blur-sm rounded-xl p-3 max-h-[300px]">
      <div className="flex items-center gap-1.5 text-white/60 text-xs font-medium uppercase tracking-wider">
        <span>👁</span>
        <span>Spectators ({spectators.length})</span>
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto scrollbar-thin">
        {spectators.map(spec => (
          <div key={spec.id} className="flex items-center gap-2">
            <Avatar
              name={spec.name}
              avatarId={spec.avatarId}
              avatarColor={spec.avatarColor}
              size="sm"
            />
            <span className="text-white/70 text-xs truncate">{spec.name}</span>
          </div>
        ))}
      </div>
      {canJoin && spectators.some(s => s.id === myPlayerId) && (
        <button
          onClick={handleJoinAsPlayer}
          className="mt-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Join Game
        </button>
      )}
    </div>
  );
}
