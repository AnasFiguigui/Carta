import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/roomManager';
import { setupSocketHandlers } from './socket/handlers';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    methods: ['GET', 'POST'],
  },
  pingInterval: 25000,
  pingTimeout: 20000,
});

// Per-IP connection limiting
const connectionsPerIp = new Map<string, number>();
const MAX_CONNECTIONS_PER_IP = 10;

io.use((socket, next) => {
  const ip = socket.handshake.address;
  const count = connectionsPerIp.get(ip) || 0;
  if (count >= MAX_CONNECTIONS_PER_IP) {
    return next(new Error('Too many connections'));
  }
  connectionsPerIp.set(ip, count + 1);
  socket.on('disconnect', () => {
    const c = connectionsPerIp.get(ip) || 1;
    if (c <= 1) connectionsPerIp.delete(ip);
    else connectionsPerIp.set(ip, c - 1);
  });
  next();
});

const roomManager = new RoomManager();
setupSocketHandlers(io, roomManager);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

server.listen(PORT, () => {
  console.log(`🃏 Carta server running on port ${PORT}`);
});
