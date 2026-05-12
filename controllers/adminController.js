const mongoose = require('mongoose');
const User = require('../models/User');
const Report = require('../models/Report');
const AdminActivity = require('../models/AdminActivity');
const { isAdminUser } = require('../utils/admin');
const { getIO } = require('../socket');

const MAX_LIMIT = 50;

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildUserPayload = (user) => ({
  id: user._id,
  name: user.name,
  fullName: user.fullName || user.name,
  username: user.username || user.name,
  email: user.email,
  createdAt: user.createdAt,
  isBanned: Boolean(user.isBanned),
  bannedAt: user.bannedAt || null,
  bannedReason: user.bannedReason || '',
  profile: user.profile || {},
  stats: user.stats || {},
  adminAccess: user.settings?.security?.adminAccess || {},
});

const emitAdminBroadcast = (event, payload) => {
  try {
    const io = getIO();
    io.to('admins').emit(event, payload);
  } catch (err) {
    console.error('Socket emit failed:', err.message);
  }
};

const listUsers = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), MAX_LIMIT);
    const search = String(req.query.search || '').trim().slice(0, 80);
    const status = String(req.query.status || '').trim();

    const query = {};
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ name: regex }, { fullName: regex }, { username: regex }, { email: regex }];
    }

    if (status === 'banned') query.isBanned = true;
    if (status === 'active') query.isBanned = false;

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      data: users.map(buildUserPayload),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load users' });
  }
};

const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const user = await User.findById(id).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, data: buildUserPayload(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load user' });
  }
};

const banUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (isAdminUser(target)) {
      return res.status(403).json({ success: false, message: 'Admin cannot be banned' });
    }

    target.isBanned = true;
    target.bannedAt = new Date();
    target.bannedReason = String(reason || 'Banned by admin').trim().slice(0, 240);
    target.bannedBy = req.userId;
    target.banMeta = {
      reason: target.bannedReason,
      action: 'ban',
      adminId: req.userId,
    };
    if (target.settings?.security?.activeSessions) {
      target.settings.security.activeSessions = [];
    }

    await target.save({ validateBeforeSave: false });

    await Report.create({
      targetUser: target._id,
      reason: target.bannedReason,
      status: 'open',
      metadata: target.banMeta,
    });

    const activity = await AdminActivity.create({
      action: 'ban',
      actor: req.userId,
      targetUser: target._id,
      details: { reason: target.bannedReason },
    });

    emitAdminBroadcast('admin:userUpdated', { action: 'ban', user: buildUserPayload(target) });
    emitAdminBroadcast('admin:activity', { activity });

    return res.status(200).json({ success: true, data: buildUserPayload(target) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to ban user' });
  }
};

const unbanUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    target.isBanned = false;
    target.bannedAt = null;
    target.bannedReason = '';
    target.bannedBy = null;
    target.banMeta = {};
    if (target.settings?.security?.adminAccess) {
      target.settings.security.adminAccess.attempts = 0;
      target.settings.security.adminAccess.remainingAttempts = 5;
    }

    await target.save({ validateBeforeSave: false });

    const activity = await AdminActivity.create({
      action: 'unban',
      actor: req.userId,
      targetUser: target._id,
      details: { reason: 'Unbanned by admin' },
    });

    emitAdminBroadcast('admin:userUpdated', { action: 'unban', user: buildUserPayload(target) });
    emitAdminBroadcast('admin:activity', { activity });

    return res.status(200).json({ success: true, data: buildUserPayload(target) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to unban user' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (isAdminUser(target)) {
      return res.status(403).json({ success: false, message: 'Admin cannot be deleted' });
    }

    await User.deleteOne({ _id: target._id });

    const activity = await AdminActivity.create({
      action: 'delete',
      actor: req.userId,
      targetUser: target._id,
      details: { email: target.email, username: target.username },
    });

    emitAdminBroadcast('admin:userUpdated', { action: 'delete', user: buildUserPayload(target) });
    emitAdminBroadcast('admin:activity', { activity });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
};

const listReports = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), MAX_LIMIT);
    const status = String(req.query.status || '').trim();

    const query = {};
    if (status) query.status = status;

    const total = await Report.countDocuments(query);
    const reports = await Report.find(query)
      .populate('targetUser', 'name username email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      data: reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load reports' });
  }
};

const listActivity = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), MAX_LIMIT);
    const activity = await AdminActivity.find()
      .populate('actor', 'name username email')
      .populate('targetUser', 'name username email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({ success: true, data: activity });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load activity' });
  }
};

const verifyAdmin = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  return res.status(200).json({
    success: true,
    data: {
      isAdmin: isAdminUser(req.user),
    },
  });
};

module.exports = {
  listUsers,
  getUserDetails,
  banUser,
  unbanUser,
  deleteUser,
  listReports,
  listActivity,
  verifyAdmin,
};
