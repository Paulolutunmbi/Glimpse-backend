const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const postRoutes = require('./routes/postRoutes');
const commentRoutes = require('./routes/commentRoutes');

dotenv.config();

const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const basePort = Number(process.env.CLIENT_ORIGIN_BASE_PORT);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow non-browser tools
      if (allowedOrigins.includes(origin)) return cb(null, true);

      const match = /^http:\/\/localhost:(\d+)$/.exec(origin);
      if (match && Number.isFinite(basePort) && Number(match[1]) >= basePort) {
        return cb(null, true);
      }

      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json());

const URI = process.env.MONGO_URI;
mongoose
  .connect(URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinPost', (postId) => {
    socket.join(postId);
  });

  socket.on('sendComment', (comment) => {
    io.to(comment.postId).emit('newComment', comment);
  });
});

const port = process.env.PORT || 5000;
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
