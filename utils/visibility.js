const User = require('../models/User');

const getViewerRelations = async (userId) => {
  if (!userId) return { following: [], followers: [], mutual: [] };
  const user = await User.findById(userId).select('relations.following relations.followers following followers');
  if (!user) return { following: [], followers: [], mutual: [] };

  const following = (user.relations?.following?.length ? user.relations.following : user.following || []).map(String);
  const followers = (user.relations?.followers?.length ? user.relations.followers : user.followers || []).map(String);
  const followersSet = new Set(followers);
  const mutual = following.filter((id) => followersSet.has(String(id)));

  return { following, followers, mutual };
};

const buildVisibilityQuery = async (userId) => {
  if (!userId) return { visibility: 'public' };

  const { following, mutual } = await getViewerRelations(userId);
  const viewerId = String(userId);

  return {
    $or: [
      { visibility: 'public' },
      { visibility: 'followers', author: { $in: following } },
      { visibility: 'friends', author: { $in: mutual } },
      { visibility: 'private', author: viewerId },
      { author: viewerId },
    ],
  };
};

module.exports = {
  getViewerRelations,
  buildVisibilityQuery,
};
