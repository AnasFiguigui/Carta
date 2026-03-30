import { create } from 'zustand';
import type {
  ClientGameState,
  PublicPlayer,
  Card,
  Suit,
  CardEffect,
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
  setPlayerId: (id: string) => void;
  setPlayerName: (name: string) => void;

  // Room state
  roomId: string | null;
  hostId: string | null;
  players: PublicPlayer[];
  maxPlayers: number;
  setRoomData: (roomId: string, hostId: string, players: PublicPlayer[], maxPlayers: number) => void;

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

  // Chat
  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;

  // Connection
  isConnected: boolean;
  setConnected: (c: boolean) => void;

  // Reset
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  view: 'home',
  setView: (view) => set({ view }),

  playerId: null,
  playerName: '',
  setPlayerId: (id) => set({ playerId: id }),
  setPlayerName: (name) => set({ playerName: name }),

  roomId: null,
  hostId: null,
  players: [],
  maxPlayers: 6,
  setRoomData: (roomId, hostId, players, maxPlayers) => set({ roomId, hostId, players, maxPlayers }),

  gameState: null,
  setGameState: (state) => set({ gameState: state }),

  lastPlayedCard: null,
  setLastPlayedCard: (card) => set({ lastPlayedCard: card }),
  activeEffect: null,
  setActiveEffect: (e) => set({ activeEffect: e }),
  chosenSuit: null,
  setChosenSuit: (s) => set({ chosenSuit: s }),

  chatMessages: [],
  addChatMessage: (msg) => set((state) => ({
    chatMessages: [...state.chatMessages.slice(-100), msg],
  })),

  isConnected: false,
  setConnected: (c) => set({ isConnected: c }),

  reset: () => set({
    view: 'home',
    playerId: null,
    roomId: null,
    hostId: null,
    players: [],
    gameState: null,
    lastPlayedCard: null,
    activeEffect: null,
    chosenSuit: null,
    chatMessages: [],
  }),
}));
