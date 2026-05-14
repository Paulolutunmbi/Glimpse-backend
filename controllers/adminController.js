const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { deleteMediaAssets } = require('../services/mediaService');
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
    actionPermissions: {
      canBan: !isAdminEmail(user.email) && !user.isBanned,
      canUnban: !isAdminEmail(user.email) && Boolean(user.isBanned),
      canDelete: !isAdminEmail(user.email),
    },
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

const emitAdminStateChange = (eventName, payload = {}) => {
  try {
    const io = getIO();
    io.to('admin').emit(eventName, payload);
    io.to('admin').emit('admin:analyticsUpdated', { at: new Date().toISOString() });
  } catch (err) {
    console.error('Socket emit failed:', err.message);
  }
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
      .select('name fullName username email createdAt isBanned banReason bannedAt stats adminAccess settings violations profile avatar profilePicture followers following relations')
      .lean();

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
      .select('name fullName username email createdAt isBanned banReason bannedAt stats adminAccess settings violations profile avatar profilePicture followers following relations')
      .lean();

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

    const [userTotals, postTotals, joinedRaw, activePostersRaw, dailyActiveUsers] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            bannedUsers: {
              $sum: { $cond: [{ $eq: ['$isBanned', true] }, 1, 0] },
            },
          },
        },
      ]),
      Post.aggregate([
        {
          $group: {
            _id: null,
            totalPosts: { $sum: 1 },
            totalReels: { $sum: { $cond: [{ $eq: ['$type', 'video'] }, 1, 0] } },
          },
        },
      ]),
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

    const totalUsers = userTotals?.[0]?.totalUsers || 0;
    const bannedUsers = userTotals?.[0]?.bannedUsers || 0;
    const totalPosts = postTotals?.[0]?.totalPosts || 0;
    const totalReels = postTotals?.[0]?.totalReels || 0;

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

    emitAdminStateChange('admin:userUpdated', { user: buildUserSummary(user) });

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

    emitAdminStateChange('admin:userUpdated', { user: buildUserSummary(user) });

    return res.status(200).json({ success: true, data: buildUserSummary(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to unban user' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('email username name fullName profilePicturePublicId coverImagePublicId avatar profile settings stats followers following savedPosts posts')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (isAdminEmail(user.email)) {
      return res.status(403).json({ success: false, message: 'Cannot delete admin account' });
    }

    const posts = await Post.find({ author: user._id }).select('media.publicId media').lean();
    const postIds = posts.map((post) => post._id);
    const relatedComments = await Comment.find({
      $or: [{ postId: { $in: postIds } }, { userId: String(user._id) }],
    })
      .select('_id')
      .lean();
    const commentIds = relatedComments.map((comment) => comment._id);
    const mediaPublicIds = new Set([user.profilePicturePublicId, user.coverImagePublicId]);

    posts.forEach((post) => {
      (post.media || []).forEach((media) => {
        if (media?.publicId) {
          mediaPublicIds.add(media.publicId);
        }
      });
    });

    await Promise.all([
      Post.deleteMany({ author: user._id }),
      Comment.deleteMany({ postId: { $in: postIds } }),
      Comment.deleteMany({ userId: String(user._id) }),
      Notification.deleteMany({
        $or: [
          { user: user._id },
          { actor: user._id },
          { post: { $in: postIds } },
          { comment: { $in: commentIds } },
        ],
      }),
      Message.deleteMany({ sender: user._id }),
      User.updateMany(
        { followers: user._id },
        { $pull: { followers: user._id }, $inc: { 'stats.followersCount': -1 } }
      ),
      User.updateMany(
        { following: user._id },
        { $pull: { following: user._id }, $inc: { 'stats.followingCount': -1 } }
      ),
      User.updateMany(
        { savedPosts: { $in: postIds } },
        { $pull: { savedPosts: { $in: postIds } } }
      ),
    ]);

    const conversations = await Conversation.find({ participants: user._id }).select('participants').lean();
    await Promise.all(
      conversations.map(async (conversation) => {
        const remainingParticipants = (conversation.participants || []).filter(
          (participant) => String(participant) !== String(user._id)
        );

        if (remainingParticipants.length === 0) {
          await Message.deleteMany({ conversation: conversation._id });
          await Conversation.findByIdAndDelete(conversation._id);
          return;
        }

        await Conversation.findByIdAndUpdate(conversation._id, {
          $pull: { participants: user._id },
        });
      })
    );

    await User.findByIdAndDelete(user._id);

    const toDelete = [...mediaPublicIds].filter(Boolean);
    if (toDelete.length) {
      try {
        await deleteMediaAssets(toDelete);
      } catch (err) {
        console.error('Failed to cleanup media assets for deleted user:', err.message);
      }
    }

    emitAdminStateChange('admin:userDeleted', { userId: String(user._id) });

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
