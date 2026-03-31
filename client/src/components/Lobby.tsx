import React, { useState } from 'react';
import { useGameStore } from '../lib/store';
import { getSocket } from '../lib/socket';
import ChatPanel from './ChatPanel';
import Avatar from './Avatar';

export default function Lobby() {
  const store = useGameStore();
  const { roomId, hostId, players, playerId, spectators } = store;
  const isHost = playerId === hostId;

  const canStart = players.length >= 2 && players.every((p) => p.isReady || p.id === hostId);

  const handleToggleReady = () => {
    getSocket().emit('toggle-ready');
  };

  const handleStartGame = () => {
    getSocket().emit('start-game');
  };

  const handleLeave = () => {
    getSocket().emit('leave-room');
    store.reset();
  };

  const [copied, setCopied] = useState(false);

  const inviteLink = roomId
    ? `${window.location.origin}?room=${roomId}`
    : '';

  const copyRoomCode = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId).catch(() => {});
    }
  };

  const copyInviteLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
  };

  return (
    <div className="w-full h-screen felt-bg flex items-center justify-center">
      <div className="max-w-lg w-full mx-4">
        <div className="bg-black/40 backdrop-blur-sm rounded-2xl border border-white/10 p-6 shadow-2xl animate-fade-in">
          {/* Room header */}
          <div className="text-center mb-6">
            <p className="text-xs text-white/50 mb-1">Room Code</p>
            <div className="flex items-center justify-center gap-2">
              <span
                className="text-4xl font-bold text-yellow-300 tracking-widest cursor-pointer hover:text-yellow-200 transition-colors"
                onClick={copyRoomCode}
                title="Click to copy"
              >
                {roomId}
              </span>
              <button
                onClick={copyRoomCode}
                className="text-white/40 hover:text-white/80 text-sm transition-colors"
                title="Copy room code"
              >
                📋
              </button>
            </div>
            <p className="text-xs text-white/40 mt-1">Share this code with friends!</p>

            {/* Invite link */}
            <button
              onClick={copyInviteLink}
              className={`mt-3 w-full py-2 rounded-lg text-sm font-medium transition-all border
                ${copied
                  ? 'bg-green-500/20 border-green-500/30 text-green-300'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80'}`}
            >
              {copied ? '✓ Link Copied!' : '🔗 Copy Invite Link'}
            </button>
          </div>

          {/* Players list */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white/60">Players ({players.length}/6)</span>
              <div className="flex gap-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${i < players.length ? 'bg-yellow-400' : 'bg-white/10'}`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/5 border border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={player.name}
                      avatarId={player.avatarId}
                      avatarColor={player.avatarColor}
                      size="sm"
                    />
                    <div>
                      <span className="text-white text-sm font-medium">{player.name}</span>
                      {player.id === hostId && (
                        <span className="ml-2 text-xs text-yellow-400">👑 Host</span>
                      )}
                      {player.id === playerId && (
                        <span className="ml-2 text-xs text-white/40">(You)</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {player.id === hostId ? (
                      <span className="text-xs text-yellow-300">Host</span>
                    ) : player.isReady ? (
                      <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs border border-green-500/30">
                        Ready ✓
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-xs border border-white/10">
                        Not Ready
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Empty slots */}
              {Array.from({ length: 6 - players.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center px-4 py-3 rounded-lg border border-dashed border-white/10 text-white/20 text-sm"
                >
                  Waiting for player...
                </div>
              ))}
            </div>
          </div>

          {/* Spectators */}
          {spectators.length > 0 && (
            <div className="mb-4">
              <span className="text-xs text-white/40 mb-1 block">👁 Spectators ({spectators.length})</span>
              <div className="flex flex-wrap gap-2">
                {spectators.map((s) => (
                  <div key={s.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/5">
                    <Avatar name={s.name} avatarId={s.avatarId} avatarColor={s.avatarColor} size="sm" />
                    <span className="text-xs text-white/50">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {isHost ? (
              <button
                onClick={handleStartGame}
                disabled={!canStart}
                className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all shadow-lg
                  ${canStart
                    ? 'bg-yellow-500 hover:bg-yellow-400 text-black hover:scale-105'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'}`}
              >
                {canStart ? '🚀 Start Game' : 'Waiting for players to ready up...'}
              </button>
            ) : (
              <button
                onClick={handleToggleReady}
                className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all shadow-lg
                  ${players.find((p) => p.id === playerId)?.isReady
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-yellow-500 hover:bg-yellow-400 text-black hover:scale-105'}`}
              >
                {players.find((p) => p.id === playerId)?.isReady ? '✓ Ready!' : 'Ready Up'}
              </button>
            )}

            <button
              onClick={handleLeave}
              className="px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg
                         text-sm border border-red-500/20 transition-colors"
            >
              Leave
            </button>
          </div>

          {/* Chat */}
          <div className="mt-4" style={{ height: 200 }}>
            <ChatPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
