const User = require('../models/User');
const { isAdminEmail } = require('../utils/admin');
const { getIO } = require('../socket');

const buildUserSummary = (user) => {
  const lastLogin = user.settings?.security?.loginHistory?.[0];
  const lastActiveSession = user.settings?.security?.activeSessions?.[0];
  const lastActiveAt = lastActiveSession?.lastActiveAt || lastActiveSession?.createdAt || lastLogin?.createdAt;

  const attemptsRemaining = Math.max(0, 5 - (user.adminAccess?.attempts || 0));

  return {
    id: user._id,
    name: user.name,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    isBanned: Boolean(user.isBanned),
    banReason: user.banReason || '',
    bannedAt: user.bannedAt || null,
    isAdmin: isAdminEmail(user.email),
    attemptsRemaining,
    lastActiveAt: lastActiveAt || null,
    stats: user.stats || {},
    violations: user.violations || [],
  };
};

const verifyAdmin = async (req, res) => {
  return res.status(200).json({ success: true, admin: true });
};

const listUsers = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const search = String(req.query.search || '').trim();

    const query = {};
    if (search) {
      const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ name: pattern }, { fullName: pattern }, { username: pattern }, { email: pattern }];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('name fullName username email createdAt isBanned banReason bannedAt stats adminAccess settings violations');

    const data = users.map(buildUserSummary);

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load users' });
  }
};

const getUserDetails = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name fullName username email createdAt isBanned banReason bannedAt stats adminAccess settings violations profile');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, data: buildUserSummary(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load user details' });
  }
};

const banUser = async (req, res) => {
  try {
    const { reason } = req.body || {};
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (isAdminEmail(user.email)) {
      return res.status(403).json({ success: false, message: 'Cannot ban admin account' });
    }

    user.isBanned = true;
    user.bannedAt = new Date();
    user.banReason = String(reason || 'Manual admin action');
    user.banSource = 'admin';
    if (user.settings?.security?.activeSessions) {
      user.settings.security.activeSessions = [];
    }

    await user.save({ validateBeforeSave: false });

    try {
      const io = getIO();
      io.to('admin').emit('admin:userUpdated', { user: buildUserSummary(user) });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(200).json({ success: true, data: buildUserSummary(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to ban user' });
  }
};

const unbanUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isBanned = false;
    user.bannedAt = undefined;
    user.banReason = '';
    user.banSource = '';
    user.adminAccess = { attempts: 0 };
    await user.save({ validateBeforeSave: false });

    try {
      const io = getIO();
      io.to('admin').emit('admin:userUpdated', { user: buildUserSummary(user) });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(200).json({ success: true, data: buildUserSummary(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to unban user' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (isAdminEmail(user.email)) {
      return res.status(403).json({ success: false, message: 'Cannot delete admin account' });
    }

    await User.findByIdAndDelete(user._id);

    try {
      const io = getIO();
      io.to('admin').emit('admin:userDeleted', { userId: String(user._id) });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
};

module.exports = {
  verifyAdmin,
  listUsers,
  getUserDetails,
  banUser,
  unbanUser,
  deleteUser,
};
