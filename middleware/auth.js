const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { isAdminEmail } = require('../utils/admin');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers?.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, message: 'JWT secret not configured' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.sessionId = decoded.sessionId || hashToken(token);
    req.user = await User.findById(decoded.userId);

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (req.user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Account banned',
        code: 'BANNED',
      });
    }

    req.isAdmin = isAdminEmail(req.user.email);

    const activeSessions = req.user.settings?.security?.activeSessions || [];
    if (activeSessions.length > 0) {
      const isActiveSession = activeSessions.some(
        (session) => session?.sessionId && session.sessionId === req.sessionId
      );

      if (!isActiveSession) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
    }

    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
};

module.exports = auth;
