const Post = require('../models/Post');
const User = require('../models/User');
const { buildVisibilityQuery } = require('../utils/visibility');

const search = async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.status(200).json({ users: [], posts: [] });
    }

    const limit = Math.min(Number(req.query.limit) || 10, 25);
    const userRegex = new RegExp(query, 'i');

    const users = await User.find({
      $or: [{ username: userRegex }, { name: userRegex }, { fullName: userRegex }],
    })
      .select('username name fullName avatar profile profilePicture followers following stats verified')
      .limit(limit);

    const visibilityQuery = await buildVisibilityQuery(req.userId);
    const posts = await Post.find({
      ...visibilityQuery,
      $text: { $search: query },
    })
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.status(200).json({ users, posts });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to search' });
  }
};

module.exports = {
  search,
};
