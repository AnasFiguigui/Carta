import React, { useState, useEffect } from 'react';
import { useGameStore } from '../lib/store';
import { connectSocket } from '../lib/socket';
import AvatarPicker from './AvatarPicker';
import DarkVeil from './DarkVeil';
import type { AvatarId } from 'shared';

export default function HomeScreen() {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [avatarId, setAvatarId] = useState<AvatarId>('default');
  const [avatarColor, setAvatarColor] = useState('#3498db');
  const isMenuMode = mode === 'menu';
  const isJoinMode = mode === 'join';

  // Auto-fill room code from URL query param (?room=XXXXX)
  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const room = params.get('room');
    if (room) {
      setRoomCode(room.toUpperCase());
      setMode('join');
    }
  }, []);

  const store = useGameStore();
  let panelContent: JSX.Element;

  const handleCreate = () => {
    const name = playerName.trim();
    if (!name) {
      setError('Please enter your name');
      return;
    }
    if (name.length > 20) {
      setError('Name too long (max 20 characters)');
      return;
    }

    const socket = connectSocket();

    const doCreate = () => {
      socket.emit('create-room', { playerName: name, avatarId, avatarColor }, (res) => {
        if (res.roomId && res.playerId) {
          store.setPlayerName(name);
          store.setPlayerId(res.playerId);
          store.setAvatarId(avatarId);
          store.setAvatarColor(avatarColor);
          store.setView('lobby');
        } else {
          setError('Failed to create room');
        }
      });
    };

    if (socket.connected) {
      doCreate();
    } else {
      socket.once('connect', doCreate);
      socket.once('connect_error', () => setError('Cannot reach server'));
    }
  };

  const handleJoin = () => {
    const name = playerName.trim();
    const code = roomCode.trim().toUpperCase();

    if (!name) {
      setError('Please enter your name');
      return;
    }
    if (!code) {
      setError('Please enter a room code');
      return;
    }

    const socket = connectSocket();

    const doJoin = () => {
      socket.emit('join-room', { roomId: code, playerName: name, avatarId, avatarColor }, (res) => {
        if (res.success && res.playerId) {
          store.setPlayerName(name);
          store.setPlayerId(res.playerId);
          store.setAvatarId(avatarId);
          store.setAvatarColor(avatarColor);
          if ((res as any).asSpectator) {
            store.setIsSpectator(true);
          }
          store.setView('lobby');
        } else {
          setError(res.error || 'Failed to join room');
        }
      });
    };

    if (socket.connected) {
      doJoin();
    } else {
      socket.once('connect', doJoin);
      socket.once('connect_error', () => setError('Cannot reach server'));
    }
  };

  if (isMenuMode) {
    panelContent = (
      <div className="space-y-4">
        <AvatarPicker
          name={playerName || '?'}
          selectedAvatarId={avatarId}
          selectedColor={avatarColor}
          onSelectAvatar={setAvatarId}
          onSelectColor={setAvatarColor}
        />

        <div>
          <label htmlFor="create-player-name" className="block text-xs text-white/50 mb-1">Your Name</label>
          <input
            id="create-player-name"
            className="w-full bg-white/10 text-white rounded-lg px-4 py-3 outline-none
                       border border-white/10 focus:border-[#6E13E7]/50 transition-colors
                       placeholder-white/30"
            placeholder="Enter your name..."
            value={playerName}
            onChange={(e) => { setPlayerName(e.target.value); setError(''); }}
            maxLength={20}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => {
              if (!playerName.trim()) { setError('Enter your name first'); return; }
              setMode('create');
              handleCreate();
            }}
            className="py-3 bg-[#6E13E7] hover:bg-[#7E2BF7] text-white font-bold rounded-lg
                       transition-all hover:scale-105 active:scale-95 shadow-lg"
          >
            Create Room
          </button>
          <button
            onClick={() => {
              if (!playerName.trim()) { setError('Enter your name first'); return; }
              setMode('join');
            }}
            className="py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg
                       border border-white/20 transition-all hover:scale-105 active:scale-95"
          >
            Join Room
          </button>
        </div>
      </div>
    );
  } else if (isJoinMode) {
    panelContent = (
      <div className="space-y-4">
        <button
          onClick={() => setMode('menu')}
          className="text-xs text-white/50 hover:text-white/80 transition-colors"
        >
          ← Back
        </button>

        <AvatarPicker
          name={playerName || '?'}
          selectedAvatarId={avatarId}
          selectedColor={avatarColor}
          onSelectAvatar={setAvatarId}
          onSelectColor={setAvatarColor}
        />

        <div>
          <label htmlFor="join-player-name" className="block text-xs text-white/50 mb-1">Your Name</label>
          <input
            id="join-player-name"
            className="w-full bg-white/10 text-white rounded-lg px-4 py-3 outline-none
                       border border-white/10 focus:border-[#6E13E7]/50 transition-colors
                       placeholder-white/30"
            placeholder="Enter your name..."
            value={playerName}
            onChange={(e) => { setPlayerName(e.target.value); setError(''); }}
            maxLength={20}
          />
        </div>

        <div>
          <label htmlFor="join-room-code" className="block text-xs text-white/50 mb-1">Room Code</label>
          <input
            id="join-room-code"
            className="w-full bg-white/10 text-white rounded-lg px-4 py-3 outline-none
                       border border-white/10 focus:border-[#6E13E7]/50 transition-colors
                       placeholder-white/30 text-center text-2xl tracking-widest uppercase"
            placeholder="XXXXX"
            value={roomCode}
            onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setError(''); }}
            maxLength={5}
          />
        </div>

        <button
          onClick={handleJoin}
          className="w-full py-3 bg-[#6E13E7] hover:bg-[#7E2BF7] text-white font-bold rounded-lg
                     transition-all hover:scale-105 active:scale-95 shadow-lg"
        >
          Join Game
        </button>
      </div>
    );
  } else {
    panelContent = (
      <div className="text-center py-6">
        <div className="animate-spin text-3xl mb-3">🃏</div>
        <p className="text-white/60">Creating room...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex items-center justify-center relative" style={{ background: '#060010' }}>
      <div className="absolute inset-0">
        <DarkVeil
          hueShift={0}
          noiseIntensity={0}
          scanlineIntensity={0}
          speed={0.5}
          scanlineFrequency={0}
          warpAmount={0}
        />
      </div>
      <div className="max-w-md w-full mx-4 relative z-10">
        {/* Title */}
        <div className="text-center mb-10 animate-slide-up">
          <h1 className="text-6xl font-bold text-white mb-2 flex items-center justify-center gap-3 font-heading" style={{
            textShadow: '0 0 30px rgba(110,19,231,0.3), 0 4px 8px rgba(0,0,0,0.5)',
          }}>
            <img src="/favicon.svg" alt="" className="w-14 h-14" />
            Carta
          </h1>
          <p className="text-white/60 text-sm">Moroccan Card Game • UNO-Style</p>
          <p className="text-white/40 text-xs mt-1" dir="rtl">لعبة الورق المغربية</p>
        </div>

        <div className="bg-black/40 backdrop-blur-sm rounded-2xl border border-white/10 p-6 shadow-2xl animate-fade-in">
          {panelContent}

          {error && (
            <div className="mt-3 px-3 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm text-center">
              {error}
            </div>
          )}
        </div>

        {/* Rules hint */}
        <div className="mt-6 text-center text-white/30 text-xs space-y-1">
          <p>2-6 Players • 40 Spanish-Suited Cards</p>
          <p>10s Skip • 7s Wild • 2s +2 • Ace of Coins +5</p>
        </div>
      </div>
    </div>
  );
}
