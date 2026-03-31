import { create } from 'zustand';
import type {
  ClientGameState,
  PublicPlayer,
  Card,
  Suit,
  CardEffect,
  Spectator,
  AvatarId,
} from 'shared';

export type AppView = 'home' | 'lobby' | 'game';

interface ChatMessage {
  playerId: string;
  playerName: string;
  message: string;
  timestamp: number;
  isSystem?: boolean;
}

interface GameStore {
  // Navigation
  view: AppView;
  setView: (view: AppView) => void;

  // Player identity
  playerId: string | null;
  playerName: string;
  isSpectator: boolean;
  avatarId: AvatarId;
  avatarColor: string;
  setPlayerId: (id: string) => void;
  setPlayerName: (name: string) => void;
  setIsSpectator: (v: boolean) => void;
  setAvatarId: (id: AvatarId) => void;
  setAvatarColor: (c: string) => void;

  // Room state
  roomId: string | null;
  hostId: string | null;
  players: PublicPlayer[];
  spectators: Spectator[];
  maxPlayers: number;
  setRoomData: (roomId: string, hostId: string, players: PublicPlayer[], maxPlayers: number, spectators?: Spectator[]) => void;

  // Game state
  gameState: ClientGameState | null;
  setGameState: (state: ClientGameState) => void;

  // Animations / effects
  lastPlayedCard: Card | null;
  setLastPlayedCard: (card: Card | null) => void;
  activeEffect: { effect: CardEffect; targetId: string; amount?: number } | null;
  setActiveEffect: (e: GameStore['activeEffect']) => void;
  chosenSuit: Suit | null;
  setChosenSuit: (s: Suit | null) => void;

  // Timer
  timerExpiredPlayerId: string | null;
  setTimerExpiredPlayerId: (id: string | null) => void;
  autoDrawPlayerId: string | null;
  setAutoDrawPlayerId: (id: string | null) => void;

  // Card animations (local player only)
  cardAnimationType: 'draw' | 'play' | null;
  animatingCard: Card | null;
  setCardAnimation: (type: 'draw' | 'play' | null, card?: Card | null) => void;

  // Chat
  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;

  // Connection
  isConnected: boolean;
  setConnected: (c: boolean) => void;

  // Sound
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;

  // Reset
  reset: () => void;
}

const AVATAR_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#F97316', '#14B8A6', '#6366F1', '#D946EF',
];

export const useGameStore = create<GameStore>((set) => ({
  view: 'home',
  setView: (view) => set({ view }),

  playerId: null,
  playerName: '',
  isSpectator: false,
  avatarId: 'default',
  avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
  setPlayerId: (id) => set({ playerId: id }),
  setPlayerName: (name) => set({ playerName: name }),
  setIsSpectator: (v) => set({ isSpectator: v }),
  setAvatarId: (id) => set({ avatarId: id }),
  setAvatarColor: (c) => set({ avatarColor: c }),

  roomId: null,
  hostId: null,
  players: [],
  spectators: [],
  maxPlayers: 6,
  setRoomData: (roomId, hostId, players, maxPlayers, spectators) =>
    set({ roomId, hostId, players, maxPlayers, spectators: spectators || [] }),

  gameState: null,
  setGameState: (state) => set({ gameState: state }),

  lastPlayedCard: null,
  setLastPlayedCard: (card) => set({ lastPlayedCard: card }),
  activeEffect: null,
  setActiveEffect: (e) => set({ activeEffect: e }),
  chosenSuit: null,
  setChosenSuit: (s) => set({ chosenSuit: s }),

  timerExpiredPlayerId: null,
  setTimerExpiredPlayerId: (id) => set({ timerExpiredPlayerId: id }),
  autoDrawPlayerId: null,
  setAutoDrawPlayerId: (id) => set({ autoDrawPlayerId: id }),

  cardAnimationType: null,
  animatingCard: null,
  setCardAnimation: (type, card) => set({ cardAnimationType: type, animatingCard: card || null }),

  chatMessages: [],
  addChatMessage: (msg) => set((state) => ({
    chatMessages: [...state.chatMessages.slice(-100), msg],
  })),

  isConnected: false,
  setConnected: (c) => set({ isConnected: c }),

  soundEnabled: true,
  setSoundEnabled: (v) => set({ soundEnabled: v }),

  reset: () => set({
    view: 'home',
    playerId: null,
    isSpectator: false,
    roomId: null,
    hostId: null,
    players: [],
    spectators: [],
    gameState: null,
    lastPlayedCard: null,
    activeEffect: null,
    chosenSuit: null,
    timerExpiredPlayerId: null,
    autoDrawPlayerId: null,
    cardAnimationType: null,
    animatingCard: null,
    chatMessages: [],
  }),
}));
