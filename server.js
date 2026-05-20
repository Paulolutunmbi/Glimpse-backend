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
const adminRoutes = require('./routes/adminRoutes');
const { verifyEmailTransport } = require('./utils/sendEmail');

dotenv.config();

// 🔒 Fail fast
if (!process.env.MONGO_URI) {
  console.error('ERROR: MONGO_URI must be configured');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET must be configured');
  process.exit(1);
}

const app = express();

// 🌍 Allowed origins
const allowedOrigins = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const vercelOrigin = 'https://glimpse-theta-swart.vercel.app';
if (!allowedOrigins.includes(vercelOrigin)) {
  allowedOrigins.push(vercelOrigin);
}

const isLocalhostOrigin = (origin) => /^http:\/\/localhost:\d+$/.test(origin);

// ✅ CORS (safe + production ready)
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin) || isLocalhostOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Blocked by CORS: ' + origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ❌ REMOVED: app.options('/*', cors());
// Express now handles preflight automatically

app.use(express.json());

// DB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/dev/email-preview', emailPreviewRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 404 + error handlers (IMPORTANT: must stay last)
app.use(notFound);
app.use(errorHandler);

// Server + Socket
const server = http.createServer(app);

initSocket(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin) || isLocalhostOrigin(origin)) return cb(null, true);
      return cb(new Error('Blocked by CORS: ' + origin));
    },
    methods: ['GET', 'POST'],
  },
});

// Start server
const port = process.env.PORT || 5000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// SMTP check
if (process.env.VERIFY_SMTP_ON_STARTUP === 'true') {
  verifyEmailTransport()
    .then(() => console.log('SMTP verified'))
    .catch((err) => console.error('SMTP error:', err.message));
}