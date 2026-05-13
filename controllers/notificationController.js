const Notification = require('../models/Notification');

const parseCursor = (cursor) => {
  if (!cursor) return null;
  const parts = String(cursor).split('|');
  if (parts.length < 2) return null;
  return { createdAt: new Date(parts[0]), id: parts[1] };
};

const buildCursorQuery = (cursorData) => {
  if (!cursorData?.createdAt) return {};
  return {
    $or: [
      { createdAt: { $lt: cursorData.createdAt } },
      { createdAt: cursorData.createdAt, _id: { $lt: cursorData.id } },
    ],
  };
};

const getNotifications = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const cursorData = parseCursor(req.query.cursor);
    const cursorQuery = buildCursorQuery(cursorData);

    const notifications = await Notification.find({ user: req.userId, ...cursorQuery })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);

    const hasMore = notifications.length > limit;
    const sliced = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore
      ? `${sliced[sliced.length - 1].createdAt.toISOString()}|${sliced[sliced.length - 1]._id}`
      : null;

    const unreadCount = await Notification.countDocuments({ user: req.userId, isRead: false });

    return res.status(200).json({ data: sliced, nextCursor, hasMore, unreadCount });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
};

const markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: req.userId },
      { $set: { isRead: true } },
      { returnDocument: 'after' }
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.status(200).json({ success: true, data: notification });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update notification' });
  }
};

const markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ user: req.userId, isRead: false }, { $set: { isRead: true } });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update notifications' });
  }
};

module.exports = {
  getNotifications,
  markRead,
  markAllRead,
};
