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
    const user = await User.findById(req.params.id).select('+profilePicturePublicId +coverImagePublicId');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (isAdminEmail(user.email)) {
      return res.status(403).json({ success: false, message: 'Cannot delete admin account' });
    }

    // gather media public ids from user's posts and profile
    const posts = await Post.find({ author: user._id }).select('media.publicId media');
    const postPublicIds = [];
    for (const p of posts) {
      if (Array.isArray(p.media)) {
        for (const m of p.media) {
          if (m?.publicId) postPublicIds.push(m.publicId);
        }
      }
    }

    const profileMediaIds = [];
    if (user.profilePicturePublicId) profileMediaIds.push(user.profilePicturePublicId);
    if (user.coverImagePublicId) profileMediaIds.push(user.coverImagePublicId);

    // Delete posts and related media
    try {
      await Post.deleteMany({ author: user._id });
    } catch (err) {
      console.error('Failed to remove posts for deleted user:', err.message);
    }

    // Remove user from other users' follower / following lists and saved posts
    try {
      await User.updateMany({ followers: user._id }, { $pull: { followers: user._id }, $inc: { 'stats.followersCount': -1 } }).exec();
      await User.updateMany({ following: user._id }, { $pull: { following: user._id }, $inc: { 'stats.followingCount': -1 } }).exec();
      await User.updateMany({ savedPosts: { $in: user.posts || [] } }, { $pull: { savedPosts: { $in: user.posts || [] } } }).exec();
    } catch (err) {
      console.error('Failed to cleanup relations for deleted user:', err.message);
    }

    // Remove notifications, messages and conversations
    const Notification = require('../models/Notification');
    const Message = require('../models/Message');
    const Conversation = require('../models/Conversation');

    try {
      await Notification.deleteMany({ $or: [{ user: user._id }, { actor: user._id }] });
      await Message.deleteMany({ sender: user._id });

      // For conversations that include the user, either remove them or delete conversation if no participants left
      const convs = await Conversation.find({ participants: user._id }).select('participants');
      for (const conv of convs) {
        const remaining = conv.participants.filter((p) => String(p) !== String(user._id));
        if (!remaining.length) {
          await Message.deleteMany({ conversation: conv._id });
          await Conversation.findByIdAndDelete(conv._id);
        } else {
          await Conversation.findByIdAndUpdate(conv._id, { $pull: { participants: user._id } });
        }
      }
    } catch (err) {
      console.error('Failed to cleanup messaging/notifications for deleted user:', err.message);
    }

    // finally delete user document
    await User.findByIdAndDelete(user._id);

    // cleanup cloudinary assets (profile + post media)
    try {
      const { deleteMediaAssets } = require('../services/mediaService');
      const toDelete = [...new Set([...(postPublicIds || []), ...(profileMediaIds || [])])].filter(Boolean);
      if (toDelete.length) {
        await deleteMediaAssets(toDelete);
      }
    } catch (err) {
      console.error('Failed to cleanup media assets for deleted user:', err.message);
    }

    try {
      const io = getIO();
      io.to('admin').emit('admin:userDeleted', { userId: String(user._id) });
      io.to('admin').emit('admin:analyticsUpdated', { at: new Date().toISOString() });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('deleteUser error:', err.message);
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
