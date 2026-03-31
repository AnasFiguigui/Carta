import React, { useMemo, useState } from 'react';
import { useGameStore } from '../lib/store';
import { getSocket } from '../lib/socket';
import type { PublicPlayer } from 'shared';
import { isValidPlay } from '../lib/gameLogic';
import PlayerHand from './PlayerHand';
import OpponentHand from './OpponentHand';
import CenterArea from './CenterArea';
import SuitSelector from './SuitSelector';
import ChatPanel from './ChatPanel';
import SpectatorPanel from './SpectatorPanel';
import TurnTimer from './TurnTimer';
import Avatar from './Avatar';
import { playSound } from '../lib/sounds';

/** Detect mobile via viewport width */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

/** Calculate opponent positions around the table based on player count */
function getOpponentPositions(
  totalPlayers: number
): { x: number; y: number; rotation: number }[] {
  const others = totalPlayers - 1;
  if (others === 0) return [];

  const layouts: Record<number, { x: number; y: number; rotation: number }[]> = {
    1: [{ x: 50, y: 8, rotation: 0 }],
    2: [
      { x: 18, y: 30, rotation: 0 },
      { x: 82, y: 30, rotation: 0 },
    ],
    3: [
      { x: 15, y: 40, rotation: 0 },
      { x: 50, y: 8, rotation: 0 },
      { x: 85, y: 40, rotation: 0 },
    ],
    4: [
      { x: 10, y: 45, rotation: 0 },
      { x: 30, y: 8, rotation: 0 },
      { x: 70, y: 8, rotation: 0 },
      { x: 90, y: 45, rotation: 0 },
    ],
    5: [
      { x: 8, y: 50, rotation: 0 },
      { x: 20, y: 12, rotation: 0 },
      { x: 50, y: 5, rotation: 0 },
      { x: 80, y: 12, rotation: 0 },
      { x: 92, y: 50, rotation: 0 },
    ],
  };

  return layouts[others] || layouts[5];
}

export default function GameBoard() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = useGameStore((s) => s.playerId);
  const timerExpiredPlayerId = useGameStore((s) => s.timerExpiredPlayerId);
  const autoDrawPlayerId = useGameStore((s) => s.autoDrawPlayerId);
  const soundEnabled = useGameStore((s) => s.soundEnabled);
  const setSoundEnabled = useGameStore((s) => s.setSoundEnabled);
  const [showRules, setShowRules] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const isMobile = useIsMobile();
  const chatMessages = useGameStore((s) => s.chatMessages);

  const myPlayerIndex = gameState?.players.findIndex((p) => p.id === playerId) ?? -1;
  const isMyTurn = gameState ? gameState.currentPlayerIndex === myPlayerIndex : false;
  const isChoosingWild = gameState?.phase === 'choosing_wild_suit' && isMyTurn;
  const isGameOver = gameState?.phase === 'game_over';

  const myPlayer = gameState?.players[myPlayerIndex];

  const opponents = useMemo(() => {
    if (!gameState) return [];
    // Spectator (not in players list) sees ALL players as opponents
    if (myPlayerIndex === -1) return gameState.players;
    const result: PublicPlayer[] = [];
    for (let i = 1; i < gameState.players.length; i++) {
      const idx = (myPlayerIndex + i) % gameState.players.length;
      result.push(gameState.players[idx]);
    }
    return result;
  }, [gameState?.players, myPlayerIndex]);

  const isSpectator = myPlayerIndex === -1;
  const opponentPositions = getOpponentPositions(
    isSpectator ? (gameState?.players.length ?? 0) + 1 : (gameState?.players.length ?? 0)
  );

  const playableCardIds = useMemo(() => {
    const ids = new Set<string>();
    if (!gameState || !isMyTurn || !gameState.topCard) return ids;
    for (const card of gameState.myHand) {
      if (
        isValidPlay(
          card,
          gameState.topCard,
          gameState.forcedSuit,
          gameState.pendingDrawAmount
        )
      ) {
        ids.add(card.id);
      }
    }
    return ids;
  }, [gameState?.myHand, gameState?.topCard, gameState?.forcedSuit, gameState?.pendingDrawAmount, isMyTurn]);

  if (!gameState || !playerId) {
    return (
      <div className="w-full h-full felt-bg flex items-center justify-center">
        <div className="text-white/50 text-lg">Loading game...</div>
      </div>
    );
  }

  const handlePassTurn = () => {
    getSocket().emit('pass-turn');
  };

  const currentTurnPlayer = gameState.players[gameState.currentPlayerIndex];

  return (
    <div className="w-full h-screen felt-bg perspective-container relative overflow-hidden">
      {/* Left side: Rules + Sound + Spectators */}
      <div className="absolute top-3 left-3 z-30 flex flex-col gap-2">
        <button
          onClick={() => setShowRules(true)}
          className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 hover:text-white
                     rounded-lg border border-white/20 transition-colors backdrop-blur-sm"
          title="Game Rules"
        >
          📖
        </button>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 hover:text-white
                     rounded-lg border border-white/20 transition-colors backdrop-blur-sm"
          title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
        >
          {soundEnabled ? '🔊' : '🔇'}
        </button>
        {/* Chat toggle (mobile) */}
        {isMobile && (
          <button
            onClick={() => setShowChat(!showChat)}
            className="relative px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 hover:text-white
                       rounded-lg border border-white/20 transition-colors backdrop-blur-sm"
            title="Chat"
          >
            💬
            {chatMessages.length > 0 && !showChat && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full" />
            )}
          </button>
        )}
        <SpectatorPanel
          spectators={gameState.spectators || []}
          canJoin={gameState.players.length < 6 && (gameState.phase === 'lobby' || gameState.phase === 'game_over')}
        />
      </div>

      {/* Right side: Room code + Leave */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        <div className="px-2 py-1 bg-black/30 backdrop-blur-sm rounded-lg border border-white/10 text-xs text-white/60">
          <span className="font-bold text-yellow-300">{gameState.roomId}</span>
        </div>
        <button
          onClick={() => {
            getSocket().emit('leave-room');
            useGameStore.getState().reset();
          }}
          className="px-2 py-1 text-xs text-red-400 hover:text-red-300 bg-white/5 hover:bg-white/10
                     rounded-lg border border-red-500/20 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Direction indicator (small, top center) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
        <span className="text-white/30 text-lg">{gameState.direction === 1 ? '↻' : '↺'}</span>
      </div>

      {/* Opponent hands */}
      {opponents.map((opponent, i) => (
        <OpponentHand
          key={opponent.id}
          player={opponent}
          position={opponentPositions[i]}
          isCurrentTurn={
            gameState.players[gameState.currentPlayerIndex]?.id === opponent.id
          }
          turnStartedAt={gameState.turnStartedAt}
          turnTimeoutMs={gameState.turnTimeoutMs}
          gamePhase={gameState.phase}
          pendingDrawAmount={gameState.pendingDrawAmount}
          currentPlayerId={currentTurnPlayer?.id}
        />
      ))}

      {/* Center area (deck + discard) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <CenterArea
          topCard={gameState.topCard}
          deckCount={gameState.deckCount}
          discardPileTop3={gameState.discardPileTop3}
          isMyTurn={isMyTurn}
          pendingDrawAmount={gameState.pendingDrawAmount}
          currentPlayerId={currentTurnPlayer?.id}
          myPlayerId={playerId}
        />
      </div>

      {/* My avatar + hand (bottom center) — only for players */}
      {myPlayer ? (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1">
          {/* Avatar row: pass button (left) + avatar + timer (right) */}
          <div className="flex items-center gap-2 mb-1">
            {/* Pass turn button — only after drawing, when player has playable cards but chooses not to play */}
            {isMyTurn && !isChoosingWild && gameState.hasDrawnThisTurn && playableCardIds.size > 0 && (
              <button
                onClick={handlePassTurn}
                className="px-3 py-1.5 bg-gray-700/80 hover:bg-gray-600 rounded-lg text-xs text-white
                           border border-white/20 transition-colors shadow-lg whitespace-nowrap"
              >
                Pass
              </button>
            )}

            <Avatar
              name={myPlayer.name}
              avatarId={myPlayer.avatarId}
              avatarColor={myPlayer.avatarColor}
              size="lg"
              isCurrentTurn={isMyTurn}
            />

            {/* Timer — right of avatar when my turn */}
            {isMyTurn && gameState.phase === 'playing' && gameState.turnStartedAt > 0 && (
              <TurnTimer
                turnStartedAt={gameState.turnStartedAt}
                turnTimeoutMs={gameState.turnTimeoutMs}
                isMyTurn={true}
                size={40}
                onWarning={() => playSound('timer-tick')}
              />
            )}
          </div>
          <span className="text-white/70 text-xs font-medium">{myPlayer.name} <span className="text-white/40">({gameState.myHand.length})</span></span>
          <PlayerHand
            cards={gameState.myHand}
            playableCardIds={playableCardIds}
            isMyTurn={isMyTurn}
          />
        </div>
      ) : (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
          <div className="px-4 py-2 bg-black/40 backdrop-blur-sm rounded-full border border-white/10 text-white/60 text-sm">
            👁 Spectating
          </div>
        </div>
      )}

      {/* Suit selector modal */}
      {isChoosingWild && <SuitSelector />}

      {/* Game Over overlay */}
      {isGameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-fade-in">
          <div className="bg-gray-900/95 border-2 border-yellow-500 rounded-2xl p-10 shadow-2xl text-center animate-bounce-in">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-yellow-300 mb-2">Game Over!</h2>
            <p className="text-xl text-white mb-6">
              {gameState.winnerId === playerId
                ? 'You Win!'
                : `${gameState.players.find((p) => p.id === gameState.winnerId)?.name || 'Someone'} Wins!`}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  getSocket().emit('leave-room');
                  useGameStore.getState().reset();
                }}
                className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg
                           transition-colors shadow-lg"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat panel — desktop: always shown bottom-right; mobile: overlay */}
      {isMobile ? (
        showChat && (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 animate-fade-in"
               onClick={() => setShowChat(false)}>
            <div className="w-full max-w-md h-[50vh] pb-4 px-2"
                 onClick={(e) => e.stopPropagation()}>
              <ChatPanel />
            </div>
          </div>
        )
      ) : (
        <div className="absolute bottom-4 right-4 z-20 w-56" style={{ height: 220 }}>
          <ChatPanel />
        </div>
      )}

      {/* Rules Modal */}
      {showRules && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-fade-in"
          onClick={() => setShowRules(false)}
        >
          <div
            className="bg-gray-900/95 border border-yellow-500/50 rounded-2xl p-6 shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-yellow-300">📖 Carta Rules</h2>
              <button
                onClick={() => setShowRules(false)}
                className="text-white/50 hover:text-white text-xl transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm text-white/80">
              <div>
                <h3 className="text-yellow-300 font-bold mb-1">🎯 Objective</h3>
                <p>Be the first player to get rid of all your cards!</p>
              </div>

              <div>
                <h3 className="text-yellow-300 font-bold mb-1">🃏 The Deck</h3>
                <p>40 Spanish-suited cards across 4 suits: <strong>Coins</strong>, <strong>Cups</strong>, <strong>Swords</strong>, and <strong>Clubs</strong>. Values: 1-7, 10-12.</p>
              </div>

              <div>
                <h3 className="text-yellow-300 font-bold mb-1">▶️ How to Play</h3>
                <p>Each player starts with <strong>4 cards</strong>. Play a card matching the top card by <strong>suit</strong> or <strong>value</strong>. If you can't play, draw a card. You have <strong>30 seconds</strong> per turn.</p>
              </div>

              <div>
                <h3 className="text-yellow-300 font-bold mb-1">⚡ Special Cards</h3>
                <div className="space-y-2 ml-2">
                  <p><span className="text-red-400 font-bold">2s → +2</span> — Next player draws 2 cards (stackable with another 2)</p>
                  <p><span className="text-red-400 font-bold">1 of Coins → +5</span> — Next player draws 5 cards (stackable with 2s)</p>
                  <p><span className="text-orange-400 font-bold">10s → Skip</span> — Skip the next player's turn</p>
                  <p><span className="text-purple-400 font-bold">7s → Wild</span> — Choose any suit for the next player to follow</p>
                </div>
              </div>

              <div>
                <h3 className="text-yellow-300 font-bold mb-1">⏰ Timer</h3>
                <p>30 seconds per turn. If time runs out, you automatically draw a card as penalty.</p>
              </div>

              <div>
                <h3 className="text-yellow-300 font-bold mb-1">📌 Key Rules</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Draw penalties stack — a +2 can be answered with another +2 or +5</li>
                  <li>If you can't play or stack, you must draw the full penalty</li>
                  <li>After drawing, if you have playable cards you may pass your turn</li>
                  <li>Passing without drawing first will automatically draw a card for you</li>
                  <li>The first player to empty their hand wins!</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
