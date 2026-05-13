const User = require('../models/User');
const Post = require('../models/Post');
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
    avatar:
      user.profile?.avatar ||
      user.profilePicture ||
      user.avatar ||
      '',
    followersCount:
      user.stats?.followersCount ||
      user.relations?.followers?.length ||
      user.followers?.length ||
      0,
    followingCount:
      user.stats?.followingCount ||
      user.relations?.following?.length ||
      user.following?.length ||
      0,
    recentActivity: {
      lastLoginAt: lastLogin?.createdAt || null,
      lastActiveAt: lastActiveAt || null,
      lastAdminAttemptAt: user.adminAccess?.lastAttemptAt || null,
      lastAdminAttemptRoute: user.adminAccess?.lastAttemptRoute || '',
    },
    attemptsRemaining,
    lastActiveAt: lastActiveAt || null,
    stats: user.stats || {},
    violations: user.violations || [],
  };
};

const getDateNDaysAgo = (days) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days + 1);
  return date;
};

const fillSeries = (seriesMap, days) => {
  const result = [];
  const cursor = getDateNDaysAgo(days);
  for (let index = 0; index < days; index += 1) {
    const label = cursor.toISOString().slice(0, 10);
    result.push({ date: label, count: Number(seriesMap.get(label) || 0) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
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
      .select('name fullName username email createdAt isBanned banReason bannedAt stats adminAccess settings violations profile avatar profilePicture followers following relations');

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
      .select('name fullName username email createdAt isBanned banReason bannedAt stats adminAccess settings violations profile avatar profilePicture followers following relations');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, data: buildUserSummary(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load user details' });
  }
};

const getAnalytics = async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 14, 7), 90);
    const since = getDateNDaysAgo(days);

    const [
      totalUsers,
      totalPosts,
      totalReels,
      bannedUsers,
      joinedRaw,
      activePostersRaw,
      dailyActiveUsers,
    ] = await Promise.all([
      User.countDocuments({}),
      Post.countDocuments({}),
      Post.countDocuments({ type: 'video' }),
      User.countDocuments({ isBanned: true }),
      User.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Post.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              day: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                },
              },
              author: '$author',
            },
          },
        },
        {
          $group: {
            _id: '$_id.day',
            count: { $sum: 1 },
          },
        },
      ]),
      User.countDocuments({
        'settings.security.activeSessions': {
          $elemMatch: {
            lastActiveAt: { $gte: getDateNDaysAgo(1) },
          },
        },
      }),
    ]);

    const usersJoinedMap = new Map(joinedRaw.map((item) => [item._id, item.count]));
    const activePostersMap = new Map(activePostersRaw.map((item) => [item._id, item.count]));

    return res.status(200).json({
      success: true,
      data: {
        totals: {
          totalUsers,
          totalPosts,
          totalReels,
          bannedUsers,
          dailyActiveUsers,
        },
        series: {
          usersJoined: fillSeries(usersJoinedMap, days),
          activePosters: fillSeries(activePostersMap, days),
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load analytics' });
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
      io.to('admin').emit('admin:analyticsUpdated', { at: new Date().toISOString() });
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
      io.to('admin').emit('admin:analyticsUpdated', { at: new Date().toISOString() });
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
      io.to('admin').emit('admin:analyticsUpdated', { at: new Date().toISOString() });
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
  getAnalytics,
  banUser,
  unbanUser,
  deleteUser,
};
