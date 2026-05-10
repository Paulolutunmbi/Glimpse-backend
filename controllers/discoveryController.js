const Post = require('../models/Post');
const User = require('../models/User');

const getDiscovery = async (req, res) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [trendingHashtags, exploreCategories, recommendedMoments, suggestedCreators] =
      await Promise.all([
        Post.aggregate([
          { $match: { visibility: 'public', createdAt: { $gte: since } } },
          { $unwind: '$hashtags' },
          {
            $group: {
              _id: '$hashtags',
              count: { $sum: 1 },
              engagement: {
                $sum: {
                  $add: ['$saveCount', '$shareCount', { $size: '$likes' }],
                },
              },
            },
          },
          { $sort: { engagement: -1, count: -1 } },
          { $limit: 10 },
          {
            $project: {
              _id: 0,
              tag: '$_id',
              count: 1,
            },
          },
        ]),
        Post.aggregate([
          { $match: { visibility: 'public', tags: { $exists: true, $ne: [] } } },
          { $unwind: '$tags' },
          { $group: { _id: '$tags', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 8 },
          { $project: { _id: 0, tag: '$_id', count: 1 } },
        ]),
        Post.find({ visibility: 'public' })
          .sort({ trendingScore: -1, createdAt: -1 })
          .limit(6),
        User.find({ 'stats.postsCount': { $gt: 0 } })
          .sort({ 'stats.followersCount': -1 })
          .limit(6)
          .select('username name profile avatar profilePicture stats'),
      ]);

    const filteredCreators = suggestedCreators
      .filter((creator) => String(creator._id) !== String(req.userId))
      .map((creator) => ({
        id: creator._id,
        username: creator.username,
        name: creator.name,
        avatar: creator.profile?.avatar || creator.profilePicture || creator.avatar || '',
        followersCount: creator.stats?.followersCount ?? 0,
      }));

    return res.status(200).json({
      trendingHashtags,
      exploreCategories,
      recommendedMoments,
      suggestedCreators: filteredCreators,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load discovery', details: err.message });
  }
};

module.exports = { getDiscovery };
