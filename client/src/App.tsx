import React from 'react';
import { useGameStore } from './lib/store';
import { useSocketEvents } from './lib/useSocketEvents';
import HomeScreen from './components/HomeScreen';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';

export default function App() {
  useSocketEvents();

  const view = useGameStore((s) => s.view);
  const isConnected = useGameStore((s) => s.isConnected);

  return (
    <div className="w-full h-screen relative">
      {view === 'home' && <HomeScreen />}
      {view === 'lobby' && <Lobby />}
      {view === 'game' && <GameBoard />}

      {/* Connection indicator */}
      {view !== 'home' && (
        <div className="fixed top-2 right-2 z-50">
          <div
            className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`}
            title={isConnected ? 'Connected' : 'Disconnected'}
          />
        </div>
      )}
    </div>
  );
}
