import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useGameStore } from '../lib/store';
import { getSocket } from '../lib/socket';
import type { PublicPlayer } from 'shared';
import { isValidPlay } from '../lib/gameLogic';
import PlayerHand from './PlayerHand';
import OpponentHand from './OpponentHand';
import CenterArea from './CenterArea';
import SuitSelector from './SuitSelector';
import ChatPanel from './ChatPanel';
import Avatar from './Avatar';
import Card from './Card';
import DealingOverlay from './DealingOverlay';
import { playSound } from '../lib/sounds';

/** Detect mobile via viewport width */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(globalThis.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(globalThis.innerWidth < 768);
    globalThis.addEventListener('resize', handler);
    return () => globalThis.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

/** Calculate opponent positions around the table based on player count */
function getOpponentPositions(
  totalPlayers: number,
  isMobile: boolean
): { x: number; y: number; rotation: number }[] {
  const others = totalPlayers - 1;
  if (others === 0) return [];

  if (isMobile) {
    // Layout: symmetric around deck center (50%)
    // Top row ~8%, bottom row ~72%, sides at deck level
    // Symmetric layout: top sides at y:28 mirror bottom at y:72 around deck at y:50
    const mobileLayouts: Record<number, { x: number; y: number; rotation: number }[]> = {
      1: [{ x: 50, y: 8, rotation: 0 }],
      2: [
        { x: 20, y: 28, rotation: 0 },
        { x: 80, y: 28, rotation: 0 },
      ],
      3: [
        { x: 20, y: 28, rotation: 0 },
        { x: 50, y: 8, rotation: 0 },
        { x: 80, y: 28, rotation: 0 },
      ],
      4: [
        { x: 20, y: 28, rotation: 0 },
        { x: 50, y: 8, rotation: 0 },
        { x: 80, y: 28, rotation: 0 },
        { x: 50, y: 72, rotation: 180 },
      ],
      5: [
        { x: 20, y: 28, rotation: 0 },
        { x: 50, y: 8, rotation: 0 },
        { x: 80, y: 28, rotation: 0 },
        { x: 20, y: 72, rotation: 180 },
        { x: 80, y: 72, rotation: 180 },
      ],
    };
    return mobileLayouts[others] || mobileLayouts[5];
  }

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
      { x: 20, y: 15, rotation: 0 },
      { x: 50, y: 10, rotation: 0 },
      { x: 80, y: 15, rotation: 0 },
      { x: 92, y: 50, rotation: 0 },
    ],
  };

  return layouts[others] || layouts[5];
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export default function GameBoard() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = useGameStore((s) => s.playerId);
  const soundEnabled = useGameStore((s) => s.soundEnabled);
  const setSoundEnabled = useGameStore((s) => s.setSoundEnabled);
  const cardAnimationType = useGameStore((s) => s.cardAnimationType);
  const animatingCard = useGameStore((s) => s.animatingCard);
  const [showRules, setShowRules] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSpectators, setShowSpectators] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDealing, setIsDealing] = useState(false);
  const prevPhaseRef = useRef<string | null>(null);
  const isMobile = useIsMobile();
  const chatMessages = useGameStore((s) => s.chatMessages);
  const hostId = useGameStore((s) => s.hostId);
  const roomPlayers = useGameStore((s) => s.players);
  const storeIsSpectator = useGameStore((s) => s.isSpectator);

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

  // Detect game start (phase transitions to 'playing') and trigger dealing animation
  useEffect(() => {
    const currentPhase = gameState?.phase ?? null;
    if (prevPhaseRef.current !== 'playing' && currentPhase === 'playing') {
      setIsDealing(true);
    }
    prevPhaseRef.current = currentPhase;
  }, [gameState?.phase]);

  const handleDealingComplete = useCallback(() => {
    setIsDealing(false);
  }, []);

  // For game-over overlay, use the store flag which updates in real-time
  const isSpectatorForOverlay = isGameOver ? storeIsSpectator : isSpectator;
  const opponentPositions = useMemo(
    () => getOpponentPositions(
      isSpectator ? (gameState?.players.length ?? 0) + 1 : (gameState?.players.length ?? 0),
      isMobile
    ),
    [isSpectator, gameState?.players.length, isMobile]
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

  const handleRestartGame = () => {
    getSocket().emit('restart-game');
  };

  const handleJoinAsPlayer = () => {
    getSocket().emit('join-as-player', (res) => {
      if (res.success && res.playerId) {
        useGameStore.getState().setPlayerId(res.playerId);
        useGameStore.getState().setIsSpectator(false);
      }
    });
  };

  const handleBecomeSpectator = () => {
    getSocket().emit('become-spectator');
    useGameStore.getState().setIsSpectator(true);
  };

  const currentTurnPlayer = gameState.players[gameState.currentPlayerIndex];
  const isHost = playerId === hostId;
  const isHostForOverlay = isGameOver ? (roomPlayers.some(p => p.id === playerId) && playerId === hostId) : isHost;
  const myIsFinished = gameState.finishedPlayerIds?.includes(playerId) ?? false;
  const myIsKicked = gameState.kickedPlayerIds?.includes(playerId) ?? false;

  return (
    <div className="w-full h-screen felt-bg perspective-container relative overflow-hidden">
      {/* Left side: Rules + Sound + Spectators */}
      <div className="absolute top-3 left-3 z-30 flex flex-col gap-2">
        <button
          onClick={() => setShowRules(true)}
          className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 hover:text-white
                     rounded-lg border border-white/20 transition-all backdrop-blur-sm active:scale-90"
          title="Game Rules"
        >
          📖
        </button>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 hover:text-white
                     rounded-lg border border-white/20 transition-all backdrop-blur-sm active:scale-90"
          title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
        >
          {soundEnabled ? '🔊' : '🔇'}
        </button>
        {/* Chat toggle (mobile) */}
        {isMobile && (
          <button
            onClick={() => setShowChat(!showChat)}
            className="relative px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 hover:text-white
                       rounded-lg border border-white/20 transition-all backdrop-blur-sm active:scale-90"
            title="Chat"
          >
            💬
            {chatMessages.length > 0 && !showChat && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#6E13E7] rounded-full" />
            )}
          </button>
        )}
        {/* Spectator toggle (mobile) */}
        {isMobile && (gameState.spectators?.length ?? 0) > 0 && (
          <button
            onClick={() => setShowSpectators(!showSpectators)}
            className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 hover:text-white
                       rounded-lg border border-white/20 transition-colors backdrop-blur-sm"
            title="Spectators"
          >
            👁 {gameState.spectators.length}
          </button>
        )}
        {/* Spectator avatars (desktop) */}
        {!isMobile && (gameState.spectators?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-1.5 mt-1">
            <span className="text-white/30 text-[10px] text-center">👁 {gameState.spectators.length}</span>
            {gameState.spectators.map(spec => (
              <div key={spec.id} title={spec.name}>
                <Avatar name={spec.name} avatarId={spec.avatarId} avatarColor={spec.avatarColor} size="sm" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mobile spectator popover */}
      {isMobile && showSpectators && (gameState.spectators?.length ?? 0) > 0 && (
        <div className="absolute top-14 left-3 z-40 bg-gray-900/95 border border-white/20 rounded-xl p-3 shadow-2xl backdrop-blur-sm animate-fade-in">
          <div className="text-white/40 text-[10px] uppercase tracking-wider mb-2">Spectators</div>
          <div className="flex flex-col gap-2">
            {gameState.spectators.map(spec => (
              <div key={spec.id} className="flex items-center gap-2">
                <Avatar name={spec.name} avatarId={spec.avatarId} avatarColor={spec.avatarColor} size="sm" />
                <span className="text-white/70 text-xs">{spec.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Right side: Room code + Leave */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        <button
          onClick={() => {
            const link = `${globalThis.location.origin}?room=${gameState.roomId}`;
            navigator.clipboard.writeText(link).catch(() => {});
            setCopiedLink(true);
            setTimeout(() => setCopiedLink(false), 1500);
          }}
          className={`px-2 py-1 backdrop-blur-sm rounded-lg border text-xs transition-all cursor-pointer active:scale-95 ${
            copiedLink
              ? 'bg-green-600/30 border-green-400/40 text-green-300'
              : 'bg-black/30 border-white/10 text-white/60 hover:bg-white/10'
          }`}
          title="Click to copy room link"
        >
          <span className="font-bold text-white">{gameState.roomId}</span>
          <span className="ml-1">{copiedLink ? '✅' : '📋'}</span>
        </button>
        <button
          onClick={() => {
            getSocket().emit('leave-room');
            useGameStore.getState().reset();
          }}
          className="px-2 py-1 text-xs text-red-400 hover:text-red-300 bg-white/5 hover:bg-white/10
                     rounded-lg border border-red-500/20 transition-all active:scale-90"
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
          isFinished={gameState.finishedPlayerIds?.includes(opponent.id) ?? false}
          isKicked={gameState.kickedPlayerIds?.includes(opponent.id) ?? false}
          isHost={isHost}
          isDealing={isDealing}
          isMobile={isMobile}
        />
      ))}

      {/* Center area (deck + discard) */}
      <div className={`absolute left-1/2 -translate-x-1/2 z-10 top-1/2 -translate-y-1/2`}>
        <CenterArea
          topCard={gameState.topCard}
          deckCount={gameState.deckCount}
          discardPileTop3={gameState.discardPileTop3}
          isMyTurn={isMyTurn}
          pendingDrawAmount={gameState.pendingDrawAmount}
          currentPlayerId={currentTurnPlayer?.id}
          myPlayerId={playerId}
          isMobile={isMobile}
        />
      </div>

      {/* Card animation overlay (local player only) */}
      {cardAnimationType && animatingCard && (
        <div
          className="fixed inset-0 z-40 pointer-events-none"
          key={`${cardAnimationType}-${animatingCard.id}`}
        >
          <div
            className={`absolute ${
              cardAnimationType === 'draw' ? 'card-anim-draw' : 'card-anim-play'
            }`}
            style={{
              left: cardAnimationType === 'play' ? `calc(50% + ${isMobile ? 40 : 80}px)` : '50%',
              top: cardAnimationType === 'draw' ? (isMobile ? '42%' : '50%') : `calc(100% - ${isMobile ? 120 : 180}px)`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {cardAnimationType === 'draw' ? (
              <div className="w-[70px] h-[105px] rounded-lg overflow-hidden shadow-lg">
                <img src="/cards/back.webp" alt="Card back" className="w-full h-full object-cover" draggable={false} />
              </div>
            ) : (
              <Card card={animatingCard} size="sm" />
            )}
          </div>
        </div>
      )}

      {/* My avatar + hand (bottom center) — only for players */}
      {myPlayer ? (
        <div className={`absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 ${isMobile ? 'bottom-1' : 'bottom-4'}`}>
          {/* Avatar row: pass button (left) + avatar with timer ring */}
          <div className={`flex items-center gap-2 ${isMobile ? 'mb-0' : 'mb-1'} relative`}>
            {/* Crown for finished player */}
            {myIsFinished && !myIsKicked && (
              <div className={`absolute left-1/2 -translate-x-1/2 -top-6 z-20 ${isMobile ? 'text-lg' : 'text-2xl'}`} style={{ filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.8))' }}>👑</div>
            )}

            <Avatar
              name={myPlayer.name}
              avatarId={myPlayer.avatarId}
              avatarColor={myPlayer.avatarColor}
              size={isMobile ? 'md' : 'lg'}
              isCurrentTurn={isMyTurn && !myIsFinished}
              isDisconnected={!myPlayer.isConnected}
              showConnectionDot={true}
              turnStartedAt={isMyTurn && !myIsFinished && gameState.phase === 'playing' && gameState.turnStartedAt > 0 ? gameState.turnStartedAt : undefined}
              turnTimeoutMs={isMyTurn && !myIsFinished && gameState.phase === 'playing' ? gameState.turnTimeoutMs : undefined}
              onTimerWarning={() => playSound('timer-tick')}
            />
          </div>
          <span className={`text-white/70 font-medium ${isMobile ? 'text-[10px]' : 'text-xs'}`}>{myPlayer.name} <span className="text-white/40">({gameState.myHand.length})</span></span>
          {myIsFinished ? (
            <div className="text-green-400 text-sm font-bold mt-1">✅ Finished!</div>
          ) : (
            <PlayerHand
              cards={gameState.myHand}
              playableCardIds={playableCardIds}
              isMyTurn={isMyTurn}
              isDealing={isDealing}              isMobile={isMobile}            />
          )}
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

      {/* Dealing animation overlay */}
      {isDealing && (
        <DealingOverlay
          players={[
            // Opponents
            ...opponents.map((opp, i) => ({
              x: opponentPositions[i]?.x ?? 50,
              y: opponentPositions[i]?.y ?? 10,
              name: opp.name,
            })),
            // Local player (bottom center)
            ...(myPlayer ? [{ x: 50, y: 90, name: myPlayer.name }] : []),
          ]}
          onComplete={handleDealingComplete}
          cardsPerPlayer={4}
        />
      )}

      {/* Game Over overlay */}
      {isGameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-fade-in">
          <div className="bg-gray-900/95 border-2 border-[#6E13E7] rounded-2xl p-10 shadow-2xl text-center animate-bounce-in max-w-sm w-full mx-4">
            <div className="text-5xl mb-4">🏆</div>
            <h2 className="text-3xl font-bold text-white mb-2 font-heading">Game Over!</h2>

            {/* Winner */}
            {gameState.winnerId && (
              <p className="text-lg text-green-400 mb-1">
                🏆 {gameState.winnerId === playerId ? 'You' : gameState.players.find((p) => p.id === gameState.winnerId)?.name || 'Someone'} won!
              </p>
            )}

            {/* Loser */}
            {gameState.loserId && (
              <p className="text-lg text-red-400 mb-4">
                💀 {gameState.loserId === playerId ? 'You' : gameState.players.find((p) => p.id === gameState.loserId)?.name || 'Someone'} lost!
              </p>
            )}

            {/* Host controls */}
            {isHostForOverlay && !isSpectatorForOverlay && (
              <div className="flex flex-col gap-2 mt-4">
                <p className="text-white/50 text-xs mb-1">{roomPlayers.length} player{roomPlayers.length === 1 ? '' : 's'} in room</p>
                {roomPlayers.filter(p => p.isConnected).length >= 2 ? (
                  <button
                    onClick={handleRestartGame}
                    className="px-6 py-3 bg-[#6E13E7] hover:bg-[#7E2BF7] text-white font-bold rounded-lg
                               transition-all shadow-lg active:scale-95"
                  >
                    🚀 Play Again
                  </button>
                ) : (
                  <button
                    disabled
                    className="px-6 py-3 bg-gray-700 text-gray-400 font-bold rounded-lg cursor-not-allowed
                               border border-white/10"
                  >
                    ⏳ Waiting for players ({roomPlayers.filter(p => p.isConnected).length}/2)
                  </button>
                )}
              </div>
            )}

            {/* Non-host player */}
            {!isHostForOverlay && !isSpectatorForOverlay && (
              <p className="text-white/60 mt-4 text-sm">Waiting for host to restart...</p>
            )}

            {/* Toggle: Join as Player / Leave & Spectate */}
            {isSpectatorForOverlay ? (
              <button
                onClick={handleJoinAsPlayer}
                className="mt-3 px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg
                           transition-all shadow-lg active:scale-95"
              >
                🎮 Join as Player
              </button>
            ) : (
              <button
                onClick={handleBecomeSpectator}
                className="mt-3 px-4 py-2 text-sm text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10
                           rounded-lg border border-white/10 transition-all active:scale-95"
              >
                👁 Leave & Spectate
              </button>
            )}
          </div>
        </div>
      )}

      {/* Chat panel — desktop: always shown bottom-right; mobile: overlay */}
      {isMobile ? (
        showChat && (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 animate-fade-in">
            <button
              type="button"
              className="absolute inset-0"
              onClick={() => setShowChat(false)}
              aria-label="Close chat"
            />
            <div className="relative w-full max-w-md h-[50vh] pb-4 px-2">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-fade-in">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setShowRules(false)}
            aria-label="Close rules"
          />
          <div
            className="relative bg-gray-900/95 border border-[#6E13E7]/50 rounded-2xl p-6 shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white font-heading">📖 Carta Rules</h2>
              <button
                onClick={() => setShowRules(false)}
                className="text-white/50 hover:text-white text-xl transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm text-white/80">
              <div>
                <h3 className="text-white font-bold mb-1">🎯 Objective</h3>
                <p>Be the first player to get rid of all your cards!</p>
              </div>

              <div>
                <h3 className="text-white font-bold mb-1">🃏 The Deck</h3>
                <p>40 Spanish-suited cards across 4 suits: <strong>Coins</strong>, <strong>Cups</strong>, <strong>Swords</strong>, and <strong>Clubs</strong>. Values: 1-7, 10-12.</p>
              </div>

              <div>
                <h3 className="text-white font-bold mb-1">▶️ How to Play</h3>
                <p>Each player starts with <strong>4 cards</strong>. Play a card matching the top card by <strong>suit</strong> or <strong>value</strong>. If you can't play, draw a card. You have <strong>30 seconds</strong> per turn.</p>
              </div>

              <div>
                <h3 className="text-white font-bold mb-1">⚡ Special Cards</h3>
                <div className="space-y-2 ml-2">
                  <p><span className="text-red-400 font-bold">2s → +2</span> — Next player draws 2 cards (stackable with another 2)</p>
                  <p><span className="text-red-400 font-bold">1 of Coins → +5</span> — Next player draws 5 cards (stackable with 2 of Coins only)</p>
                  <p><span className="text-orange-400 font-bold">10s → Skip</span> — Skip the next player's turn</p>
                  <p><span className="text-purple-400 font-bold">7s → Wild</span> — Choose any suit for the next player to follow</p>
                </div>
              </div>

              <div>
                <h3 className="text-white font-bold mb-1">⏰ Timer</h3>
                <p>30 seconds per turn. If time runs out, you automatically draw a card as penalty.</p>
              </div>

              <div>
                <h3 className="text-white font-bold mb-1">📌 Key Rules</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Draw penalties stack — a +2 can be answered with another +2, and +5 only with 2 of Coins</li>
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
