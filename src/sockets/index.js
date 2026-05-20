const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { isAdminEmail } = require('../../utils/admin');

let io;

const initSocket = (httpServer, options = {}) => {
  io = new Server(httpServer, options);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake?.auth?.token;
      if (!token) return next(new Error('Unauthorized'));
      if (!process.env.JWT_SECRET) return next(new Error('JWT secret not configured'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (!user) return next(new Error('Unauthorized'));
      if (user.isBanned) return next(new Error('Banned'));

      socket.data.userId = String(user._id);
      socket.data.isAdmin = isAdminEmail(user.email);
      return next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    if (socket.data?.userId) {
      socket.join(String(socket.data.userId));
    }

    if (socket.data?.isAdmin) {
      socket.join('admin');
    }

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
      if (userId) {
        socket.join(String(userId));
      }
    });

    socket.on('leaveUser', (userId) => {
      if (userId) {
        socket.leave(String(userId));
      }
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

    socket.on('joinGroupChat', (groupId) => {
      if (groupId) {
        socket.join(`group:${groupId}`);
      }
    });

    socket.on('leaveGroupChat', (groupId) => {
      if (groupId) {
        socket.leave(`group:${groupId}`);
      }
    });

    socket.on('user:typing', (data) => {
      const { groupId } = data || {};
      if (groupId) {
        socket.to(`group:${groupId}`).emit('user:typing', {
          userId: socket.data.userId,
          groupId,
        });
      }
    });

    socket.on('disconnecting', () => {
      socket.leave(String(socket.data?.userId || ''));
      socket.leave('admin');
      socket.removeAllListeners();
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
