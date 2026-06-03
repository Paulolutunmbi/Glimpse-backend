const Notification = require('../models/Notification');
const User = require('../models/User');
const { getIO } = require('../socket');

const buildActorSnapshot = (actor) => ({
  name: actor?.name || actor?.fullName || '',
  username: actor?.username || '',
  avatar: actor?.profile?.avatar || actor?.profilePicture || actor?.avatar || '',
  verified: Boolean(actor?.verified),
});

const buildSystemSnapshot = () => ({
  name: 'System',
  username: 'system',
  avatar: '',
});

const buildNotificationKey = ({ userId, actorId, type, postId, commentId, messageId }) => {
  const key = { user: userId, type };
  if (actorId) key.actor = actorId;
  if (postId) key.post = postId;
  if (commentId) key.comment = commentId;
  if (messageId) key.message = messageId;
  return key;
};

const createNotification = async ({
  userId,
  actorId,
  type,
  postId,
  commentId,
  messageId,
  preview,
}) => {
  try {
    if (!userId || !type) return null;
    if (actorId && String(userId) === String(actorId)) return null;

    const actor = actorId
      ? await User.findById(actorId)
          .select('name fullName username avatar profile profilePicture verified')
          .lean()
      : null;

    const update = {
      $set: {
        actorSnapshot: buildActorSnapshot(actor),
        preview: preview || '',
      },
      $setOnInsert: buildNotificationKey({ userId, actorId, type, postId, commentId, messageId }),
    };

    const notification = await Notification.findOneAndUpdate(
      buildNotificationKey({ userId, actorId, type, postId, commentId, messageId }),
      update,
      { upsert: true, returnDocument: 'after' }
    );

    try {
      const io = getIO();
      io.to(String(userId)).emit('notification:created', { notification });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return notification;
  } catch (err) {
    console.error('createNotification error:', err.message);
    return null;
  }
};

const createAdminNotification = async ({ type = 'admin', preview, meta }) => {
  try {
    const adminEmail = String(process.env.ADMIN_EMAIL || 'oluwatunmbipaul@gmail.com')
      .trim()
      .toLowerCase();
    const adminUser = await User.findOne({ email: adminEmail });
    if (!adminUser) return null;

    const notification = await Notification.findOneAndUpdate(
      { user: adminUser._id, type },
      {
        $set: {
          actorSnapshot: buildSystemSnapshot(),
          preview: preview || 'Admin alert',
        },
        $setOnInsert: {
          user: adminUser._id,
          type,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    try {
      const io = getIO();
      io.to('admin').emit('admin:alert', {
        notification,
        meta: meta || {},
      });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return notification;
  } catch (err) {
    console.error('createAdminNotification error:', err.message);
    return null;
  }
};

module.exports = {
  createNotification,
  createAdminNotification,
};
