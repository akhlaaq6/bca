const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const ip = require('ip');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Get network info endpoint
app.get('/network', (req, res) => {
  res.json({
    localIp: ip.address(),
    publicUrl: `https://${process.env.CODESPACE_NAME}-3000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
  });
});

// WebSocket signaling with enhanced discovery
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Broadcast peer list periodically
  const broadcastPeers = () => {
    const peers = Array.from(io.sockets.sockets.keys())
      .filter(id => id !== socket.id);
    socket.emit('peers', peers);
  };
  
  const interval = setInterval(broadcastPeers, 3000);
  
  socket.on('disconnect', () => {
    clearInterval(interval);
    console.log('Client disconnected:', socket.id);
  });

  socket.on('offer', (offer, targetId) => {
    socket.to(targetId).emit('offer', offer, socket.id);
  });

  socket.on('answer', (answer, targetId) => {
    socket.to(targetId).emit('answer', answer);
  });

  socket.on('ice-candidate', (candidate, targetId) => {
    socket.to(targetId).emit('ice-candidate', candidate);
  });
});

const PORT = 3002;
server.listen(PORT, () => {
  console.log(`Server running on:`);
  console.log(`- Local: http://localhost:${PORT}`);
  console.log(`- Network: http://${ip.address()}:${PORT}`);
  console.log(`- Public: https://${process.env.CODESPACE_NAME}-3000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`);
});
