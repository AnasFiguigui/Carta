# 🃏 Carta - Moroccan Card Games

A real-time multiplayer card games, played with the traditional 40-card Spanish-suited deck.

## The Cards

<p align="center">
  <img src="client/public/cards/1coins.webp" width="80" alt="Ace of Coins" />
  <img src="client/public/cards/2cups.webp" width="80" alt="2 of Cups" />
  <img src="client/public/cards/7swords.webp" width="80" alt="7 of Swords" />
  <img src="client/public/cards/10clubs.webp" width="80" alt="10 of Clubs" />
  <img src="client/public/cards/11coins.webp" width="80" alt="11 of Coins" />
  <img src="client/public/cards/12cups.webp" width="80" alt="12 of Cups" />
  <img src="client/public/cards/5swords.webp" width="80" alt="5 of Swords" />
  <img src="client/public/cards/back.webp" width="80" alt="Card Back" />
</p>

## Special Cards

| Card | Effect | Description |
|------|--------|-------------|
| **2s** | +2 | Next player draws 2 cards (stackable) |
| **1 of Coins** | +5 | Next player draws 5 cards (stackable with 2s) |
| **10s** | Skip | Skip the next player's turn |
| **7s** | Wild | Choose any suit for the next player |

## Quick Start

```bash
# Install all dependencies
npm install

# Run both client and server in dev mode
npm run dev
```

- **Client**: http://localhost:3000
- **Server**: http://localhost:3001

## Project Structure

```
carta/
├── .github/workflows/
│   └── ci.yml                # GitHub Actions CI pipeline
├── shared/                   # Shared TypeScript types & interfaces
│   └── src/
│       ├── index.ts
│       └── __tests__/
│           └── index.test.ts
├── server/                   # Express + Socket.IO backend
│   └── src/
│       ├── index.ts              # Server entry point
│       ├── game/
│       │   ├── deck.ts           # Deck creation, shuffle, card effects
│       │   └── engine.ts         # Authoritative game engine
│       ├── rooms/
│       │   └── roomManager.ts    # Room lifecycle management
│       ├── socket/
│       │   └── handlers.ts       # Socket.IO event handlers
│       └── __tests__/
│           ├── deck.test.ts
│           ├── engine.test.ts
│           └── roomManager.test.ts
├── client/                   # Vite + React frontend
│   ├── public/
│   │   ├── cards/                # Card face images (webp)
│   │   ├── symbols/              # Suit symbol images
│   │   └── favicon.svg
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── index.css
│       ├── components/
│       │   ├── Avatar.tsx            # Player avatar display
│       │   ├── AvatarPicker.tsx      # Avatar selection UI
│       │   ├── Card.tsx              # Card with real images
│       │   ├── CenterArea.tsx        # Draw & discard piles
│       │   ├── ChatPanel.tsx         # In-game chat
│       │   ├── DarkVeil.tsx          # WebGL background shader
│       │   ├── DealingOverlay.tsx    # Card dealing animation
│       │   ├── GameBoard.tsx         # Main game table layout
│       │   ├── HomeScreen.tsx        # Create / join room
│       │   ├── Lobby.tsx             # Pre-game lobby
│       │   ├── OpponentHand.tsx      # Other players' cards
│       │   ├── PlayerHand.tsx        # Your hand (fan layout)
│       │   ├── SpectatorPanel.tsx    # Spectator view
│       │   ├── SuitSelector.tsx      # Wild suit picker
│       │   └── TurnTimer.tsx         # Turn countdown timer
│       ├── lib/
│       │   ├── cardUtils.ts          # Suit symbols, colors, effect labels
│       │   ├── gameLogic.ts          # Client-side play validation
│       │   ├── socket.ts            # Socket.IO singleton
│       │   ├── sounds.ts            # Sound effect helpers
│       │   ├── store.ts             # Zustand state management
│       │   └── useSocketEvents.ts   # Socket event listeners
│       └── test/
│           ├── setup.ts
│           ├── cardUtils.test.ts
│           └── store.test.ts
├── DEPLOYMENT.md             # Deployment guide
├── package.json              # Monorepo root (npm workspaces)
└── README.md
```

## How to Play

1. **Create or Join** a room (share the invite link with friends)
2. **Match** the top card by suit or value
3. **Draw** from the deck if you can't play
4. **Use special cards** strategically - stack +2s and +5s!
5. **First to empty** their hand wins

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand
- **Backend**: Node.js, Express, Socket.IO
- **Monorepo**: npm workspaces
- **Real-time**: Socket.IO with server-authoritative game state