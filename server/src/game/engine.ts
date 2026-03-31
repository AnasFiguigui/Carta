import {
  Card,
  Player,
  GameState,
  GamePhase,
  Direction,
  Suit,
  CardEffect,
  ActionType,
  GameAction,
  ClientGameState,
  PublicPlayer,
  Spectator,
} from 'shared';
import {
  createDeck,
  shuffleDeck,
  dealCards,
  findStartingCard,
  getCardEffect,
  isValidPlay,
} from './deck';

const CARDS_PER_PLAYER = 4;
const TURN_TIMEOUT_MS = 30_000;
const TURN_COOLDOWN_MS = 2_000;

export class GameEngine {
  private state: GameState;

  constructor(roomId: string, players: Player[]) {
    this.state = {
      roomId,
      phase: GamePhase.Lobby,
      players: players.map((p, i) => ({ ...p, hand: [], cardCount: 0, seatIndex: i })),
      currentPlayerIndex: 0,
      direction: Direction.Clockwise,
      deck: [],
      discardPile: [],
      topCard: null,
      pendingDrawAmount: 0,
      forcedSuit: null,
      winnerId: null,
      loserId: null,
      finishedPlayerIds: [],
      lastAction: null,
      turnTimeoutMs: TURN_TIMEOUT_MS,
      turnStartedAt: 0,
      hasDrawnThisTurn: false,
    };
  }

  /** Initialize and start the game */
  startGame(): void {
    const deck = shuffleDeck(createDeck());
    this.state.deck = deck;

    // Deal cards
    const hands = dealCards(this.state.deck, this.state.players.length, CARDS_PER_PLAYER);
    this.state.players.forEach((player, i) => {
      player.hand = hands[i];
      player.cardCount = hands[i].length;
    });

    // Find a non-special starting card
    const startResult = findStartingCard(this.state.deck);
    if (startResult) {
      this.state.deck.splice(startResult.index, 1);
      this.state.discardPile.push(startResult.card);
      this.state.topCard = startResult.card;
    } else {
      // Extremely unlikely: all remaining cards are special; just use the first one
      const card = this.state.deck.shift()!;
      this.state.discardPile.push(card);
      this.state.topCard = card;
    }

    this.state.phase = GamePhase.Playing;
    this.state.currentPlayerIndex = 0;
    this.state.direction = Direction.Clockwise;
    this.state.pendingDrawAmount = 0;
    this.state.forcedSuit = null;
    this.state.winnerId = null;
    this.state.loserId = null;
    this.state.finishedPlayerIds = [];
    this.state.turnStartedAt = Date.now();
  }

  /** Get the full authoritative state */
  getState(): GameState {
    return this.state;
  }

  /** Build client-safe state for a specific player */
  getClientState(playerId: string, spectators: Spectator[] = []): ClientGameState {
    const player = this.state.players.find(p => p.id === playerId);
    const publicPlayers: PublicPlayer[] = this.state.players.map(p => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length,
      isConnected: p.isConnected,
      isReady: p.isReady,
      seatIndex: p.seatIndex,
      avatarId: p.avatarId,
      avatarColor: p.avatarColor,
    }));

    // Top 3 cards of discard pile for visual spread
    const discardPileTop3 = this.state.discardPile.slice(-3);

    return {
      roomId: this.state.roomId,
      phase: this.state.phase,
      players: publicPlayers,
      myHand: player ? [...player.hand] : [],
      myPlayerId: playerId,
      currentPlayerIndex: this.state.currentPlayerIndex,
      direction: this.state.direction,
      topCard: this.state.topCard,
      deckCount: this.state.deck.length,
      discardPileTop3,
      pendingDrawAmount: this.state.pendingDrawAmount,
      forcedSuit: this.state.forcedSuit,
      winnerId: this.state.winnerId,
      lastAction: this.state.lastAction,
      turnStartedAt: this.state.turnStartedAt,
      turnTimeoutMs: this.state.turnTimeoutMs,
      spectators,
      hasDrawnThisTurn: this.state.hasDrawnThisTurn,
      loserId: this.state.loserId,
      finishedPlayerIds: [...this.state.finishedPlayerIds],
    };
  }

  /** Get the current player */
  getCurrentPlayer(): Player {
    return this.state.players[this.state.currentPlayerIndex];
  }

  /** Advance to next player (respecting direction) */
  private advanceTurn(skip: boolean = false): void {
    const count = this.state.players.length;

    // Move to next active (non-finished) player
    let next = this.state.currentPlayerIndex;
    do {
      next = (next + this.state.direction + count) % count;
    } while (this.state.finishedPlayerIds.includes(this.state.players[next].id));

    // If skip effect, move one more time past finished players
    if (skip) {
      do {
        next = (next + this.state.direction + count) % count;
      } while (this.state.finishedPlayerIds.includes(this.state.players[next].id));
    }

    this.state.currentPlayerIndex = next;
    // Offset by 2s so the client timer shows a brief cooldown before counting down
    this.state.turnStartedAt = Date.now() + TURN_COOLDOWN_MS;
    this.state.hasDrawnThisTurn = false;
  }

  /** Recycle discard pile into deck when deck is empty */
  private recycleDiscard(): void {
    if (this.state.deck.length === 0 && this.state.discardPile.length > 1) {
      const topCard = this.state.discardPile.pop()!;
      this.state.deck = shuffleDeck(this.state.discardPile);
      this.state.discardPile = [topCard];
    }
  }

  /** Draw N cards from deck for a player */
  private drawCards(player: Player, count: number): Card[] {
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
      this.recycleDiscard();
      if (this.state.deck.length === 0) break;
      const card = this.state.deck.pop()!;
      player.hand.push(card);
      player.cardCount = player.hand.length;
      drawn.push(card);
    }
    return drawn;
  }

  /** Try to play a card for the current player */
  playCard(playerId: string, cardId: string): {
    success: boolean;
    error?: string;
    effect?: CardEffect;
    card?: Card;
    nextPlayerIndex?: number;
    playerFinished?: boolean;
  } {
    if (this.state.phase !== GamePhase.Playing && this.state.phase !== GamePhase.ChoosingWildSuit) {
      return { success: false, error: 'Game is not in playing phase' };
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return { success: false, error: 'Card not in your hand' };
    }

    const card = currentPlayer.hand[cardIndex];

    if (!this.state.topCard) {
      return { success: false, error: 'No top card (invalid state)' };
    }

    if (!isValidPlay(card, this.state.topCard, this.state.forcedSuit, this.state.pendingDrawAmount)) {
      return { success: false, error: 'Invalid play' };
    }

    // Remove card from hand
    currentPlayer.hand.splice(cardIndex, 1);
    currentPlayer.cardCount = currentPlayer.hand.length;

    // Add to discard pile
    this.state.discardPile.push(card);
    this.state.topCard = card;
    this.state.forcedSuit = null;

    const effect = getCardEffect(card);

    // Record action
    this.state.lastAction = {
      type: ActionType.PlayCard,
      playerId,
      card,
      timestamp: Date.now(),
    };

    // Check if player emptied their hand
    let playerFinished = false;
    if (currentPlayer.hand.length === 0) {
      if (!this.state.winnerId) {
        this.state.winnerId = playerId;
      }
      this.state.finishedPlayerIds.push(playerId);
      playerFinished = true;

      // Count remaining active players
      const activePlayers = this.state.players.filter(
        p => !this.state.finishedPlayerIds.includes(p.id)
      );

      if (activePlayers.length <= 1) {
        // Game over — last player standing is the loser
        this.state.loserId = activePlayers.length === 1 ? activePlayers[0].id : null;
        this.state.phase = GamePhase.GameOver;
        return { success: true, effect, card, nextPlayerIndex: this.state.currentPlayerIndex, playerFinished };
      }
    }

    // Apply effect (even if player finished — effects still hit the next player)
    switch (effect) {
      case CardEffect.Skip: {
        this.advanceTurn(true);
        break;
      }
      case CardEffect.WildSuit: {
        if (playerFinished) {
          // Finished player can't choose a suit — just advance
          this.advanceTurn();
        } else {
          this.state.phase = GamePhase.ChoosingWildSuit;
          return { success: true, effect, card, nextPlayerIndex: this.state.currentPlayerIndex, playerFinished };
        }
        break;
      }
      case CardEffect.DrawTwo: {
        this.state.pendingDrawAmount += 2;
        this.advanceTurn();
        break;
      }
      case CardEffect.DrawFive: {
        this.state.pendingDrawAmount += 5;
        this.advanceTurn();
        break;
      }
      default: {
        this.advanceTurn();
        break;
      }
    }

    return { success: true, effect, card, nextPlayerIndex: this.state.currentPlayerIndex, playerFinished };
  }

  /** Choose a suit after playing a 7 */
  chooseSuit(playerId: string, suit: Suit): { success: boolean; error?: string; nextPlayerIndex?: number } {
    if (this.state.phase !== GamePhase.ChoosingWildSuit) {
      return { success: false, error: 'Not in suit choosing phase' };
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Validate suit value
    if (!Object.values(Suit).includes(suit)) {
      return { success: false, error: 'Invalid suit' };
    }

    this.state.forcedSuit = suit;
    this.state.phase = GamePhase.Playing;

    this.state.lastAction = {
      type: ActionType.ChooseSuit,
      playerId,
      chosenSuit: suit,
      timestamp: Date.now(),
    };

    this.advanceTurn();
    return { success: true, nextPlayerIndex: this.state.currentPlayerIndex };
  }

  /** Draw a card for the current player */
  drawCard(playerId: string): {
    success: boolean;
    error?: string;
    drawnCards?: Card[];
    nextPlayerIndex?: number;
    mustPlay?: boolean;
  } {
    if (this.state.phase !== GamePhase.Playing) {
      return { success: false, error: 'Game is not in playing phase' };
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // If there's a pending draw stack, player must draw that amount
    if (this.state.pendingDrawAmount > 0) {
      const amount = this.state.pendingDrawAmount;
      const drawn = this.drawCards(currentPlayer, amount);
      this.state.pendingDrawAmount = 0;

      this.state.lastAction = {
        type: ActionType.DrawCard,
        playerId,
        timestamp: Date.now(),
      };

      this.advanceTurn();
      return { success: true, drawnCards: drawn, nextPlayerIndex: this.state.currentPlayerIndex, mustPlay: false };
    }

    // Normal draw: draw 1 card
    const drawn = this.drawCards(currentPlayer, 1);
    if (drawn.length === 0) {
      return { success: false, error: 'Deck is empty' };
    }

    this.state.hasDrawnThisTurn = true;

    this.state.lastAction = {
      type: ActionType.DrawCard,
      playerId,
      timestamp: Date.now(),
    };

    // Check if drawn card is playable
    const drawnCard = drawn[0];
    if (this.state.topCard && isValidPlay(drawnCard, this.state.topCard, this.state.forcedSuit, 0)) {
      // Player can choose to play it (we let them decide on client)
      return { success: true, drawnCards: drawn, nextPlayerIndex: this.state.currentPlayerIndex, mustPlay: false };
    }

    // Can't play drawn card, advance turn
    this.advanceTurn();
    return { success: true, drawnCards: drawn, nextPlayerIndex: this.state.currentPlayerIndex, mustPlay: false };
  }

  /** Pass turn (only if player has drawn and can't/won't play) */
  passTurn(playerId: string): { success: boolean; error?: string; nextPlayerIndex?: number; drawnCards?: Card[] } {
    if (this.state.phase !== GamePhase.Playing) {
      return { success: false, error: 'Game is not in playing phase' };
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // If player hasn't drawn this turn, force them to draw a card first
    let drawnCards: Card[] | undefined;
    if (!this.state.hasDrawnThisTurn) {
      this.recycleDiscard();
      drawnCards = this.drawCards(currentPlayer, 1);
    }

    this.state.lastAction = {
      type: ActionType.Pass,
      playerId,
      timestamp: Date.now(),
    };

    this.advanceTurn();
    return { success: true, nextPlayerIndex: this.state.currentPlayerIndex, drawnCards };
  }

  /** Handle player disconnect */
  disconnectPlayer(playerId: string): void {
    const player = this.state.players.find(p => p.id === playerId);
    if (player) {
      player.isConnected = false;
    }

    // If it was their turn, advance
    if (this.state.phase === GamePhase.Playing || this.state.phase === GamePhase.ChoosingWildSuit) {
      const current = this.getCurrentPlayer();
      if (current.id === playerId) {
        if (this.state.phase === GamePhase.ChoosingWildSuit) {
          // Auto-choose a random suit
          const suits = Object.values(Suit);
          this.state.forcedSuit = suits[Math.floor(Math.random() * suits.length)];
          this.state.phase = GamePhase.Playing;
        }
        this.advanceTurn();
      }
    }
  }

  /** Handle player reconnect */
  reconnectPlayer(playerId: string): void {
    const player = this.state.players.find(p => p.id === playerId);
    if (player) {
      player.isConnected = true;
    }
  }

  /** Auto-draw penalty when timer expires */
  autoDrawCard(): {
    success: boolean;
    playerId: string;
    drawnCount: number;
    nextPlayerIndex: number;
  } {
    if (this.state.phase !== GamePhase.Playing && this.state.phase !== GamePhase.ChoosingWildSuit) {
      return { success: false, playerId: '', drawnCount: 0, nextPlayerIndex: this.state.currentPlayerIndex };
    }

    const currentPlayer = this.getCurrentPlayer();

    // If in suit choosing phase, auto-choose a random suit first
    if (this.state.phase === GamePhase.ChoosingWildSuit) {
      const suits = Object.values(Suit);
      this.state.forcedSuit = suits[Math.floor(Math.random() * suits.length)];
      this.state.phase = GamePhase.Playing;
      this.advanceTurn();
      return { success: true, playerId: currentPlayer.id, drawnCount: 0, nextPlayerIndex: this.state.currentPlayerIndex };
    }

    // Draw pending amount or 1 card as penalty
    const amount = this.state.pendingDrawAmount > 0 ? this.state.pendingDrawAmount : 1;
    const drawn = this.drawCards(currentPlayer, amount);
    this.state.pendingDrawAmount = 0;

    this.state.lastAction = {
      type: ActionType.AutoDraw,
      playerId: currentPlayer.id,
      timestamp: Date.now(),
    };

    this.advanceTurn();
    return {
      success: true,
      playerId: currentPlayer.id,
      drawnCount: drawn.length,
      nextPlayerIndex: this.state.currentPlayerIndex,
    };
  }

}
