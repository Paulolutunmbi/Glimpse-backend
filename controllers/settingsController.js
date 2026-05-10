const User = require('../models/User');

const pickBoolean = (value) => (typeof value === 'boolean' ? value : undefined);

const applyEnum = (value, allowed) => (allowed.includes(value) ? value : undefined);

const buildSettingsUpdate = (payload = {}) => {
  const updates = {};
  const privacy = payload.privacy || {};
  const notifications = payload.notifications || {};
  const appearance = payload.appearance || {};
  const security = payload.security || {};
  const control = payload.control || {};

  const profileVisibility = applyEnum(privacy.profileVisibility, ['public', 'private']);
  if (profileVisibility) updates['settings.privacy.profileVisibility'] = profileVisibility;

  const allowMessages = applyEnum(privacy.allowMessages, ['everyone', 'followers', 'none']);
  if (allowMessages) updates['settings.privacy.allowMessages'] = allowMessages;

  const allowTagging = applyEnum(privacy.allowTagging, ['everyone', 'followers', 'none']);
  if (allowTagging) updates['settings.privacy.allowTagging'] = allowTagging;

  const activityVisibility = applyEnum(privacy.activityVisibility, ['everyone', 'followers', 'private']);
  if (activityVisibility) updates['settings.privacy.activityVisibility'] = activityVisibility;

  const showEmail = pickBoolean(privacy.showEmail);
  if (showEmail !== undefined) updates['settings.privacy.showEmail'] = showEmail;

  const emailNotifications = pickBoolean(notifications.emailNotifications);
  if (emailNotifications !== undefined) updates['settings.notifications.emailNotifications'] = emailNotifications;

  const pushNotifications = pickBoolean(notifications.pushNotifications);
  if (pushNotifications !== undefined) updates['settings.notifications.pushNotifications'] = pushNotifications;

  const commentNotifications = pickBoolean(notifications.commentNotifications);
  if (commentNotifications !== undefined)
    updates['settings.notifications.commentNotifications'] = commentNotifications;

  const likeNotifications = pickBoolean(notifications.likeNotifications);
  if (likeNotifications !== undefined) updates['settings.notifications.likeNotifications'] = likeNotifications;

  const followNotifications = pickBoolean(notifications.followNotifications);
  if (followNotifications !== undefined) updates['settings.notifications.followNotifications'] = followNotifications;

  const marketingEmails = pickBoolean(notifications.marketingEmails);
  if (marketingEmails !== undefined) updates['settings.notifications.marketingEmails'] = marketingEmails;

  const theme = applyEnum(appearance.theme, ['system', 'light', 'dark']);
  if (theme) updates['settings.appearance.theme'] = theme;

  const reducedMotion = pickBoolean(appearance.reducedMotion);
  if (reducedMotion !== undefined) updates['settings.appearance.reducedMotion'] = reducedMotion;

  const compactMode = pickBoolean(appearance.compactMode);
  if (compactMode !== undefined) updates['settings.appearance.compactMode'] = compactMode;

  const twoFactorEnabled = pickBoolean(security.twoFactorEnabled);
  if (twoFactorEnabled !== undefined) updates['settings.security.twoFactorEnabled'] = twoFactorEnabled;

  if (Array.isArray(control.blockedUsers)) {
    updates['settings.control.blockedUsers'] = control.blockedUsers;
  }

  if (Array.isArray(control.mutedUsers)) {
    updates['settings.control.mutedUsers'] = control.mutedUsers;
  }

  return updates;
};

const getSettings = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('settings email username');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        settings: user.settings,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
};

const updateSettings = async (req, res) => {
  try {
    const updates = buildSettingsUpdate(req.body);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid settings updates provided' });
    }

    const user = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true })
      .select('settings');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, data: { settings: user.settings } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};

const updatePrivacy = async (req, res) => {
  return updateSettings({ ...req, body: { privacy: req.body } }, res);
};

const updateNotifications = async (req, res) => {
  return updateSettings({ ...req, body: { notifications: req.body } }, res);
};

const updateAppearance = async (req, res) => {
  return updateSettings({ ...req, body: { appearance: req.body } }, res);
};

const logoutOtherSessions = async (req, res) => {
  try {
    if (!req.user || !req.userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const currentSessionId = req.sessionId;
    if (!currentSessionId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = await User.findById(req.userId).select('settings.security.activeSessions');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const sessions = user.settings?.security?.activeSessions || [];
    const currentSession =
      sessions.find((session) => session?.sessionId === currentSessionId) || {
        sessionId: currentSessionId,
        userAgent: String(req.headers?.['user-agent'] || '').slice(0, 300),
        ip: String(req.headers?.['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '')
          .split(',')[0]
          .trim(),
        createdAt: new Date(),
      };

    currentSession.lastActiveAt = new Date();

    const removedCount = Math.max(0, sessions.length - 1);

    if (!user.settings) user.settings = {};
    if (!user.settings.security) user.settings.security = {};
    const nextSessions = [currentSession];

    user.settings.security.activeSessions = nextSessions;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      success: true,
      message:
        removedCount > 0
          ? 'Logged out of all other devices.'
          : 'No other active sessions were found.',
      data: { activeSessions: nextSessions, removedCount },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to logout other sessions' });
  }
};

const updateControlList = async (req, res, key) => {
  try {
    const userId = req.body?.userId;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const action = req.body?.action || 'add';
    const update = action === 'remove' ? { $pull: { [key]: userId } } : { $addToSet: { [key]: userId } };

    const user = await User.findByIdAndUpdate(req.userId, update, { new: true })
      .select(`settings.control`);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, data: { control: user.settings.control } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update control list' });
  }
};

const blockUser = (req, res) => updateControlList(req, res, 'settings.control.blockedUsers');
const unblockUser = (req, res) => updateControlList({ ...req, body: { ...req.body, action: 'remove' } }, res, 'settings.control.blockedUsers');
const muteUser = (req, res) => updateControlList(req, res, 'settings.control.mutedUsers');
const unmuteUser = (req, res) => updateControlList({ ...req, body: { ...req.body, action: 'remove' } }, res, 'settings.control.mutedUsers');

module.exports = {
  getSettings,
  updateSettings,
  updatePrivacy,
  updateNotifications,
  updateAppearance,
  logoutOtherSessions,
  blockUser,
  unblockUser,
  muteUser,
  unmuteUser,
};
