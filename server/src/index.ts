import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/roomManager';
import { setupSocketHandlers } from './socket/handlers';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: /localhost:\d+$/,
    methods: ['GET', 'POST'],
  },
});

const roomManager = new RoomManager();
setupSocketHandlers(io, roomManager);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

server.listen(PORT, () => {
  console.log(`🃏 Ronda server running on port ${PORT}`);
});
