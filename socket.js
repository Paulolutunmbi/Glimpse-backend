const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const { isAdminUser } = require('./utils/admin');

let io;

const initSocket = (httpServer, options = {}) => {
  io = new Server(httpServer, options);

  io.use(async (socket, next) => {
    const token = socket.handshake?.auth?.token;

    if (!token) {
      socket.user = null;
      return next();
    }

    try {
      if (!process.env.JWT_SECRET) {
        return next(new Error('JWT secret not configured'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);

      if (!user || user.isBanned) {
        return next(new Error('Unauthorized'));
      }

      const activeSessions = user.settings?.security?.activeSessions || [];
      const isActiveSession = activeSessions.some(
        (session) => session?.sessionId && session.sessionId === decoded.sessionId
      );

      if (!isActiveSession) {
        return next(new Error('Unauthorized'));
      }

      socket.user = user;
      socket.userId = String(user._id);
      socket.isAdmin = isAdminUser(user);
      return next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinPost', (postId) => {
      if (postId) {
        socket.join(String(postId));
      }
    });

    socket.on('leavePost', (postId) => {
      if (postId) {
        socket.leave(String(postId));
      }
    });

    socket.on('joinUser', (userId) => {
      if (!userId) return;
      if (!socket.userId || String(userId) !== socket.userId) return;
      socket.join(String(userId));
    });

    socket.on('leaveUser', (userId) => {
      if (!userId) return;
      if (!socket.userId || String(userId) !== socket.userId) return;
      socket.leave(String(userId));
    });

    socket.on('joinAdmin', () => {
      if (!socket.isAdmin) return;
      socket.join('admins');
    });

    socket.on('leaveAdmin', () => {
      if (!socket.isAdmin) return;
      socket.leave('admins');
    });

    socket.on('joinConversation', (conversationId) => {
      if (conversationId) {
        socket.join(`conversation:${conversationId}`);
      }
    });

    socket.on('leaveConversation', (conversationId) => {
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
      }
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = {
  initSocket,
  getIO,
};
