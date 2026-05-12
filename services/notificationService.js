const Notification = require('../models/Notification');
const User = require('../models/User');
const { getIO } = require('../socket');

const buildActorSnapshot = (actor) => ({
  name: actor?.name || actor?.fullName || '',
  username: actor?.username || '',
  avatar: actor?.profile?.avatar || actor?.profilePicture || actor?.avatar || '',
});

const buildSystemSnapshot = () => ({
  name: 'System',
  username: 'system',
  avatar: '',
});

const createNotification = async ({
  userId,
  actorId,
  type,
  postId,
  commentId,
  messageId,
  preview,
}) => {
  if (!userId || !type) return null;
  if (actorId && String(userId) === String(actorId)) return null;

  const actor = actorId ? await User.findById(actorId).select('name fullName username avatar profile profilePicture') : null;

  const notification = await Notification.create({
    user: userId,
    actor: actorId || undefined,
    type,
    post: postId || undefined,
    comment: commentId || undefined,
    message: messageId || undefined,
    actorSnapshot: buildActorSnapshot(actor),
    preview: preview || '',
  });

  try {
    const io = getIO();
    io.to(String(userId)).emit('notification:created', { notification });
  } catch (err) {
    console.error('Socket emit failed:', err.message);
  }

  return notification;
};

const createAdminNotification = async ({ type = 'admin', preview, meta }) => {
  const adminEmail = String(process.env.ADMIN_EMAIL || 'oluwatunmbipaul@gmail.com')
    .trim()
    .toLowerCase();
  const adminUser = await User.findOne({ email: adminEmail });
  if (!adminUser) return null;

  const notification = await Notification.create({
    user: adminUser._id,
    type,
    actorSnapshot: buildSystemSnapshot(),
    preview: preview || 'Admin alert',
  });

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
};

module.exports = {
  createNotification,
  createAdminNotification,
};
