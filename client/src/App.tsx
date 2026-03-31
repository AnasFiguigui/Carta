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
    </div>
  );
}
