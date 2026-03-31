// ===== SUITS =====
export enum Suit {
  Cups = 'cups',
  Swords = 'swords',
  Clubs = 'clubs',
  Coins = 'coins',
}

// ===== CARD VALUES =====
// 1(Ace), 2, 3, 4, 5, 6, 7, 10(Sota/Jack), 11(Caballo/Knight), 12(Rey/King)
export const CARD_VALUES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] as const;
export type CardValue = (typeof CARD_VALUES)[number];

// ===== CARD =====
export interface Card {
  suit: Suit;
  value: CardValue;
  id: string; // e.g. "cups-7"
}

// ===== SPECIAL CARD EFFECTS =====
export enum CardEffect {
  None = 'none',
  Skip = 'skip',           // All 10s (Sota)
  WildSuit = 'wild_suit',  // All 7s
  DrawTwo = 'draw_two',    // All 2s
  DrawFive = 'draw_five',  // 1 of Coins only
}

// ===== AVATARS =====
export const AVATAR_IDS = [
  'default', 'knight', 'wizard', 'pirate', 'ninja', 'viking',
  'jester', 'dragon', 'phoenix', 'wolf',
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

// ===== PLAYER =====
export interface Player {
  id: string;
  name: string;
  hand: Card[];       // Only sent to owning client
  cardCount: number;  // Sent to all clients
  isConnected: boolean;
  isReady: boolean;
  seatIndex: number;
  avatarId: AvatarId;
  avatarColor: string; // hex color for default avatar
}

// Public player info (no hand)
export interface PublicPlayer {
  id: string;
  name: string;
  cardCount: number;
  isConnected: boolean;
  isReady: boolean;
  seatIndex: number;
  avatarId: AvatarId;
  avatarColor: string;
}

// ===== SPECTATOR =====
export interface Spectator {
  id: string;
  name: string;
  avatarId: AvatarId;
  avatarColor: string;
}

// ===== GAME STATE =====
export enum GamePhase {
  Lobby = 'lobby',
  Playing = 'playing',
  ChoosingWildSuit = 'choosing_wild_suit',
  RoundEnd = 'round_end',
  GameOver = 'game_over',
}

export enum Direction {
  Clockwise = 1,
  CounterClockwise = -1,
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  players: Player[];
  currentPlayerIndex: number;
  direction: Direction;
  deck: Card[];
  discardPile: Card[];
  topCard: Card | null;
  pendingDrawAmount: number;   // Stacked +2/+5 accumulation
  forcedSuit: Suit | null;     // After a 7 is played
  winnerId: string | null;
  loserId: string | null;
  finishedPlayerIds: string[];
  lastAction: GameAction | null;
  turnTimeoutMs: number;
  turnStartedAt: number;       // timestamp when current turn started
  hasDrawnThisTurn: boolean;   // whether current player has drawn a card this turn
}

// Client-safe view (no deck, no other hands)
export interface ClientGameState {
  roomId: string;
  phase: GamePhase;
  players: PublicPlayer[];
  myHand: Card[];
  myPlayerId: string;
  currentPlayerIndex: number;
  direction: Direction;
  topCard: Card | null;
  deckCount: number;
  discardPileTop3: Card[];
  pendingDrawAmount: number;
  forcedSuit: Suit | null;
  winnerId: string | null;
  loserId: string | null;
  finishedPlayerIds: string[];
  lastAction: GameAction | null;
  turnStartedAt: number;
  turnTimeoutMs: number;
  spectators: Spectator[];
  hasDrawnThisTurn: boolean;
}

// ===== GAME ACTIONS =====
export enum ActionType {
  PlayCard = 'play_card',
  DrawCard = 'draw_card',
  ChooseSuit = 'choose_suit',
  Pass = 'pass',
  AutoDraw = 'auto_draw',
}

export interface GameAction {
  type: ActionType;
  playerId: string;
  card?: Card;
  chosenSuit?: Suit;
  timestamp: number;
}

// ===== ROOM / LOBBY =====
export interface Room {
  id: string;
  hostId: string;
  players: Player[];
  spectators: Spectator[];
  maxPlayers: number;
  gameState: GameState | null;
  createdAt: number;
}

export interface RoomInfo {
  id: string;
  hostId: string;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
  spectators: Spectator[];
}

// ===== SOCKET EVENTS =====
export interface ServerToClientEvents {
  'room-updated': (room: RoomInfo & { players: PublicPlayer[] }) => void;
  'game-state': (state: ClientGameState) => void;
  'card-played': (data: { playerId: string; card: Card; nextPlayerIndex: number }) => void;
  'card-drawn': (data: { playerId: string; cardCount: number; drawnCards?: Card[] }) => void;
  'turn-changed': (data: { currentPlayerIndex: number; turnStartedAt: number }) => void;
  'effect-applied': (data: { effect: CardEffect; targetPlayerId: string; amount?: number }) => void;
  'suit-chosen': (data: { suit: Suit; playerId: string }) => void;
  'game-over': (data: { winnerId: string; winnerName: string }) => void;
  'player-joined': (player: PublicPlayer) => void;
  'player-left': (data: { playerId: string; newHostId?: string }) => void;
  'spectator-joined': (spectator: Spectator) => void;
  'spectator-left': (data: { spectatorId: string }) => void;
  'timer-expired': (data: { playerId: string }) => void;
  'auto-draw': (data: { playerId: string; cardCount: number }) => void;
  'error': (data: { message: string }) => void;
  'chat-message': (data: { playerId: string; playerName: string; message: string }) => void;
  'sound': (data: { sound: SoundType }) => void;
}

export interface ClientToServerEvents {
  'create-room': (data: { playerName: string; avatarId?: AvatarId; avatarColor?: string }, cb: (res: { roomId: string; playerId: string }) => void) => void;
  'join-room': (data: { roomId: string; playerName: string; avatarId?: AvatarId; avatarColor?: string }, cb: (res: { success: boolean; error?: string; playerId?: string; asSpectator?: boolean }) => void) => void;
  'leave-room': () => void;
  'toggle-ready': () => void;
  'start-game': () => void;
  'play-card': (data: { cardId: string }) => void;
  'draw-card': () => void;
  'choose-suit': (data: { suit: Suit }) => void;
  'pass-turn': () => void;
  'restart-game': () => void;
  'request-state': () => void;
  'chat-message': (data: { message: string }) => void;
  'join-as-player': (cb: (res: { success: boolean; error?: string; playerId?: string }) => void) => void;
  'become-spectator': () => void;
  'kick-player': (data: { targetPlayerId: string }) => void;
}

// ===== SOUND TYPES =====
export type SoundType =
  | 'card-play'
  | 'card-draw'
  | 'card-stack'
  | 'timer-tick'
  | 'timer-end'
  | 'turn-start'
  | 'game-win'
  | 'game-lose'
  | 'player-join'
  | 'skip'
  | 'wild';
