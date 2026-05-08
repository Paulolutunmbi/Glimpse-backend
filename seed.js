const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const Post = require('./models/Post');
const User = require('./models/User');

dotenv.config();

const creators = [
  {
    name: 'Sarah Jenkins',
    fullName: 'Sarah Jenkins',
    username: 'sarah_designs',
    email: 'sarah@glimpse.local',
    password: 'Password123!',
    bio: 'Photography',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDrxWS4bLLqnfdWoSi2F3KEJZmnFO3RX8VmhtwJnu_er9WLaw7uv8zcii9HEvJMH5AUWR6MTQHkr6fsX03FuDHv8JSxEMLWuXqS8gY44v7VvlBjkjilDDXLEtSgdGVmJMJdqk0gmDfskiJ570U1pgqcnyVByzwADv_PMhUJV1xm7NUxDWwQQhYtgiPNugbkmPCMXdhFGUdH4M3428kztXAOj8w1VSQkoB898c7bAfYNPX3BeLPuC9f-TT2kjbgS82_qvRcKTQ7Q8g',
  },
  {
    name: 'Marcus Reed',
    fullName: 'Marcus Reed',
    username: 'marcus_writes',
    email: 'marcus@glimpse.local',
    password: 'Password123!',
    bio: 'Design Thoughts',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC_0SgXfA-QoSMtvLJwE-W9UjsMehekiAos2pXRKSAl3ytEnW-RrF9JVosL80XQlZqBkhozVPfOkfqFTugQ0TZPmGvCSkMn0MTeiCzsveJSJCfKwKndQ5t7Qj-6uruQ_ehJ2P3vIiohmSE-Ik_AN0wXX_xcf-44T41fOb__v2nhaj_12Aq9jgxacjI1nmR3z7B1c_Z5BkFWkSBAYVDH1PhHOhwTWra8hj8fKQg1vEFZPnCnkvHKSSrsIuN8ksMWa6aQuXZ1NIXydg',
  },
  {
    name: 'Elena Rust',
    fullName: 'Elena Rust',
    username: 'elena_rust',
    email: 'elena@glimpse.local',
    password: 'Password123!',
    bio: 'Photography',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBWWsyT5bkYGiwlqZDOqPG9BKF_AJ57M9E9YNqvWMmLoykjwuqqP-xYrX-8elfkPRTrX83bfJwCQP0gKiabi2N6iz-nnA31hEwiP18dNXmZs7sl0HzYwThUPsd_WS8ELC2hCrft2Kinz94GxnnKdWuprJsPyy2Fg4UkMNswqyutkQPABhP5bgNF9945LW4UxUBEQlmDJc9lyqcPMEujtcNJtUVl5BEoOctlErVmYkjg-FxdbyjAMM1cGH9_SMQW9XjJWDTnUCTgPQ',
  },
  {
    name: 'David Chen',
    fullName: 'David Chen',
    username: 'david_chen',
    email: 'david@glimpse.local',
    password: 'Password123!',
    bio: 'Digital Art',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCGQSABktzu7QHFhdaSBn7GYHJZghYCbpibYg3MsXwF15MLJZa65-VSAAfhiVi5KbtN_ev09WxYqdN8UVmJfW_d_fSrwWlVAINBcvjIrRGZjlWJvN--s9L9AqSNIYEhrj9y1GG_uhSDh5BfC7A6uqSBRKLSUKYAGy0THdaiOh2VeUcYtgRDvhXAV3Y_hQCzSljS6PO3a6Q9RrSsiJHFuU4in6bcPdbi81nEj6ZtjnnyJo5-TWhCHbufyktpaWtREqJDmvELZJJoAw',
  },
  {
    name: 'Studio Nord',
    fullName: 'Studio Nord',
    username: 'studio_nord',
    email: 'studio@glimpse.local',
    password: 'Password123!',
    bio: 'Architecture',
    avatar: '',
  },
  {
    name: 'Oceanic Calm',
    fullName: 'Oceanic Calm',
    username: 'oceanic_calm',
    email: 'ocean@glimpse.local',
    password: 'Password123!',
    bio: 'Video',
    avatar: '',
  },
  {
    name: 'Arch Daily',
    fullName: 'Arch Daily',
    username: 'arch_daily',
    email: 'arch@glimpse.local',
    password: 'Password123!',
    bio: 'Architecture',
    avatar: '',
  },
];

const posts = [
  {
    author: 'sarah_designs',
    type: 'image',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuASGqJY79dPNbO83rUSWKKk_iDqjYFmj63yzXnNINDY84CJVgByUbYFDSz9-hErp1a9H2VnYA0fblzda_GfGq5QBvLYgF5M1zR_DYK80IHkMAoPk-CVQo76zZW6DlOUuPzyAeLOJgVXVZ1B1C0jTFGLi1AJE7dPhGD3AVAIylbb540qylKwnCPsmHoGizYC97xqHFbNTWkJhqGuhNFvFJaR0jrxL0pobWtvav9pYMROv23b9oIz1rWkNhtCzbgWrgslGXtbT_6NSA',
    caption: 'Morning light hitting the new studio setup perfectly. #MinimalistDesign #Interior',
    category: 'Interior',
    tags: ['MinimalistDesign', 'Interior', 'SlowLiving'],
    likes: Array.from({ length: 24 }, (_, i) => `seed_like_${i}`),
    comments: 42,
  },
  {
    author: 'marcus_writes',
    type: 'text',
    title: 'The Art of Slowing Down',
    caption:
      'In a world obsessed with speed, taking a moment to simply exist is a radical act. Today I sat with my coffee for 20 minutes before checking my phone. The clarity it brought was unexpected.',
    category: 'Design Thoughts',
    tags: ['SlowLiving', 'MinimalistDesign'],
    likes: Array.from({ length: 8 }, (_, i) => `text_like_${i}`),
    comments: 56,
  },
  {
    author: 'oceanic_calm',
    type: 'video',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAw8wk_cr9kYN5FenX4TMrNiyagnNA4cqFogKOl-sMzphA7CumExWzHMXjBaNfK4tbfSbU5eo8v6HYHnD-ja_K7u5nSE7UDkd2tyH8l8JtaSiw5uxTRlGv9ddiPvdDmEQIquxVjcSHNpiZrjcJYK3S14wFMmmoVrioW0eToyb8zWpFRKs4KWyXnzC149nYUcthPENuKKL4AtAPblK68YDF3RfFKNL1ujxMXZ9pgwlgpPHzCtdYRPy32CUPvHnFEq9mgoletTj72HA',
    caption: 'The rhythm of the tide.',
    duration: '0:45',
    category: 'Serenity',
    tags: ['Serenity', 'Analog'],
    likes: Array.from({ length: 81 }, (_, i) => `video_like_${i}`),
    comments: 12,
  },
  {
    author: 'marcus_writes',
    type: 'quote',
    quote: 'Simplicity is not about doing less, but doing what matters most with absolute focus.',
    category: 'Design Philosophy',
    tags: ['MinimalistDesign', 'DesignPhilosophy'],
    likes: Array.from({ length: 12 }, (_, i) => `quote_like_${i}`),
    comments: 8,
  },
  {
    author: 'sarah_designs',
    type: 'image',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDbmTeOmrJvqIVQcxtCPQq0pmuNXejevj-e5FOjw9BSFu7WSdloQ3ZLLlNFZwIBMZHBZYzq8T_6N8ItFBgngkGbS-JFqKkY_hK711_ljUaaGkVDLcHC-GwHAJkl4ure_tfdOAyXFpGKASCsVBWbBhaMmW5oOTjKz1-dt9KZGxrvkTog0Iq4VGoGGZAvwy7o4tE2Pgt8WbQf44_IKEjsoEiCzfcOrxV6TcRqajD2Bhqhb1Q4Yrx1Bt8URYjvwHbT_6qeeVYdJPSPGg',
    caption: 'Morning rituals.',
    category: 'Coffee Culture',
    tags: ['CoffeeCulture', 'SlowLiving'],
    likes: Array.from({ length: 18 }, (_, i) => `coffee_like_${i}`),
    comments: 18,
  },
  {
    author: 'arch_daily',
    type: 'gallery',
    media: [
      {
        url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBQOva9CjrMflZ7TJWBxJ2TFwLS9luvOObO2h-Tcx3Z2gV_2CO0bnu6D8Nq5O8VyLCSgi36zUEdrZdZwrzf-f65s5I0a9Bldz_7Fx-WLrygVPIt2ksTy1wVxNHyAvVqTTa9SkkGX5lEtuJf3uAfDj31LW2iUydVJvPm-jLFL82lpFXOgPHfghgps9oLdK4Lvg7n5j8Wv506-layUSE4E_-I8XToF61iMVUpJjm4iLEjYfWmiv_KN0VtI7wXe2zptE-JsmUp7-qStA',
        alt: 'Architecture detail',
      },
      {
        url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBAjM8G1RC8JqN-sDr7yrOq4xvt3krxl_uk7wm_9wYMbCn9d0OuclQuIHOdL63X7uaFYxcrR-aZTWgtIK0mNB6mW2MR53K3eYtcFTL0XFnYyeuzvWR2Rbo81IxKyiVbLN0LagbyCPSe_bpf0CSCP6D7dUEZmMZjiCj767HUO7X-H-6y1Jw0OInwEloUZSlxXNzV7nib6zFyxoO696ETnVTB4Du99cpqw-XpmRIMZZVC4VLSSK_5f7Av2sjlZ_g020vUPOwKQgFVxA',
        alt: 'Architecture interior detail',
      },
    ],
    caption:
      'Exploring lines and shadows downtown today. The new arts center is a masterpiece of restraint.',
    category: 'Architecture',
    tags: ['Architecture', 'CityWalks'],
    likes: Array.from({ length: 19 }, (_, i) => `gallery_like_${i}`),
    comments: 9,
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const force = process.argv.includes('--force');
    const existingCount = await Post.countDocuments();
    if (existingCount > 0 && !force) {
      console.log(`Database already has ${existingCount} posts. Run npm run seed -- --force to reseed.`);
      process.exit(0);
    }

    if (force) {
      await Post.deleteMany({});
      await User.deleteMany({ email: /@glimpse\.local$/ });
      console.log('Cleared previous Glimpse seed data');
    }

    const insertedUsers = {};
    const hashedPassword = await bcrypt.hash('Password123!', 10);
    for (const creator of creators) {
      const user = await User.findOneAndUpdate(
        { email: creator.email },
        {
          ...creator,
          password: hashedPassword,
          avatar: creator.avatar,
          profilePicture: creator.avatar,
          profileCompleted: true,
          isVerified: true,
          isFirstLogin: false,
          profile: {
            avatar: creator.avatar,
            bio: creator.bio,
            extraInfo: creator.bio,
            preferences: ['Minimalism', 'Photography'],
            joinedAt: new Date(),
          },
          stats: {
            postsCount: 0,
            followersCount: Math.floor(Math.random() * 5000) + 120,
            followingCount: Math.floor(Math.random() * 300) + 25,
          },
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      insertedUsers[creator.username] = user;
    }

    const documents = posts.map((post) => {
      const author = insertedUsers[post.author];
      return {
        ...post,
        author: author._id,
        user: {
          username: author.username,
          name: author.fullName || author.name,
          avatar: author.profile?.avatar || author.profilePicture || author.avatar || '',
          location: author.profile?.extraInfo || '',
        },
      };
    });

    const insertedPosts = await Post.insertMany(documents);

    for (const [username, user] of Object.entries(insertedUsers)) {
      const userPosts = insertedPosts.filter((post) => String(post.author) === String(user._id));
      user.posts = userPosts.map((post) => post._id);
      user.stats.postsCount = userPosts.length;
      await user.save({ validateBeforeSave: false });
    }

    console.log(`Seeded ${insertedPosts.length} moments and ${Object.keys(insertedUsers).length} creators`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
