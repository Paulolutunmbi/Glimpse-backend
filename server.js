const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const http = require('http');
const { initSocket } = require('./socket');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const postRoutes = require('./routes/postRoutes');
const commentRoutes = require('./routes/commentRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const discoveryRoutes = require('./routes/discoveryRoutes');
const searchRoutes = require('./routes/searchRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const emailPreviewRoutes = require('./routes/emailPreviewRoutes');
const { verifyEmailTransport } = require('./utils/sendEmail');

dotenv.config();

const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const basePort = Number(process.env.CLIENT_ORIGIN_BASE_PORT);

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  const match = /^http:\/\/localhost:(\d+)$/.exec(origin);
  if (match && Number.isFinite(basePort) && Number(match[1]) >= basePort) {
    return true;
  }

  return false;
};

app.use(
  cors({
    origin: (origin, cb) => {
      if (isOriginAllowed(origin)) return cb(null, true);
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
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/dev/email-preview', emailPreviewRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
initSocket(server, {
  cors: {
    origin: (origin, cb) => {
      if (isOriginAllowed(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
  },
});

const port = process.env.PORT || 5000;
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

if (process.env.VERIFY_SMTP_ON_STARTUP === 'true') {
  verifyEmailTransport()
    .then(() => console.log('SMTP transport verified'))
    .catch((err) => console.error('SMTP transport verification failed:', err.message));
}
