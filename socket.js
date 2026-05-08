const { Server } = require('socket.io');

let io;

const initSocket = (httpServer, options = {}) => {
  io = new Server(httpServer, options);

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
