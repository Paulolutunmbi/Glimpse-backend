const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Post = require('./models/Post');

dotenv.config();

const SEED_POSTS = [
  {
    user: {
      username: 'sarah_travels',
      avatar:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBCk17Z0pT2WGXcGhRwDNQ2EObR9-133199aA9oynIFKfxjroaY6QhRxJo50ML-qu70ovspja29ShdHuzVo3E-oF8tc45mjp2PyOu3DrQsaF1wg4k67N7D9FVmjD4OWTUnhN6bV8HoRFw8lvrOzQiOOUb_7-ANI9aExhw8CGQ6YNqAJGkL7SdDLQTnAD7A2UwXX53uuUfs6GG9jxyAmWRYZMBBO4A6pxquLDyJ6xmnXJ8PtLxtoVTIdSeILOVgWMg2eNwpO79aiFw',
      location: 'Tokyo, Japan',
    },
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuD2QJcN9iZ-a74O8gCYrP-hVuWCV6Xs_CboWNFTCIFN7EaU-2vpwb_3spL4Io9uqMUJOT5nEcYp6xTE6zyrDDKG07JaW_s21yTwWFCT1L0D5GkxTCssTEktRbTjfNktJR0Nxk9M0UtAcduiV-UrUtZyjRL9fUNgZmAcF0i_zuJxTDxfYQkPsPm1VZgAy-pMFw-L8WuaF70yc6jnoIxRCFAmkHJY5NppRfeOeEzCgTNsuhDmtA4YWR9HvI6JVo9Wo3A7zIZp-8EmuA',
    caption:
      'Quiet moments in the middle of the neon chaos. Finding balance in the city that never sleeps. 🌧️✨',
    likes: ['user_demo_1', 'user_demo_2'],
    comments: 48,
  },
  {
    user: {
      username: 'mike.creative',
      avatar:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuDJbK7FEkaxLPBGI1Li5YbyRZZx2wu45l4Fv9fEQU3YNuORAC6tUegFwwVdRDy3ln9LnNA2kxW3XHh20RXaQLppbAGHxn9KDLe5Mife-GNsep6zbLl9LzHhMs-Yo94grFlmCKoPPYAJBNhqob3GhuT1ltkHqc0eNhnmairnmdrdXHSouW_QqLwMMb6jGxSxgW5s-8IPwpng0rCJNKvl-U1YepPNyx7a8ARIo0-EOfwSMb6E-JCa4sCGSJ8E_9zVApwPvGHKWUgLyA',
      location: '',
    },
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDRdeWwL81zx3iMv7AZFkTOg2dvF0YLGOKKc6bdRMIAqV-_Hp0fiRBXItEsk8ix54XYPTmcnZorl8-QtuJJHC9xfNuFmVKf5oiu_FveH15njmxmn_xrESfNvSGmtAESx-xOaYWMAXv4Rd97bwU8j0lxDSI-rvtA-99Pev0Zwh-yvevWo6KZmk1S3JwIGsK_T6xS48T1WVSL4zgcGMN1siNzj5n2kQwYDZFOVLFtgUr-T0mV9IOt9TJuZmu1_fBCM1-WyClo10tdOg',
    caption:
      'Morning rituals. Setting intentions for the week ahead before opening the inbox. How do you start your Mondays? ☕️📝',
    likes: [],
    comments: 12,
  },
  {
    user: {
      username: 'luna.shots',
      avatar: 'https://i.pravatar.cc/150?img=47',
      location: 'Barcelona, Spain',
    },
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&auto=format&fit=crop',
    caption: 'Golden hour at the edge of the world 🌄 Some views just stop time.',
    likes: ['user_demo_3'],
    comments: 31,
  },
  {
    user: {
      username: 'dev.journal',
      avatar: 'https://i.pravatar.cc/150?img=12',
      location: '',
    },
    image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600&auto=format&fit=crop',
    caption: 'Late night shipping. The diff is clean, the coffee is gone, and the feature is LIVE. 🚀',
    likes: ['user_demo_1', 'user_demo_4', 'user_demo_5'],
    comments: 67,
  },
  {
    user: {
      username: 'chloe.studio',
      avatar: 'https://i.pravatar.cc/150?img=25',
      location: 'New York, USA',
    },
    image: 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=600&auto=format&fit=crop',
    caption: 'New collection drop. Every piece tells a story — which one is yours? 🎨',
    likes: [],
    comments: 22,
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const existingCount = await Post.countDocuments();
    if (existingCount > 0) {
      console.log(`ℹ️  Database already has ${existingCount} posts. Skipping seed.`);
      console.log('   Run with --force to wipe and re-seed.');
      if (!process.argv.includes('--force')) {
        process.exit(0);
      }
      await Post.deleteMany({});
      console.log('🗑️  Cleared existing posts');
    }

    const inserted = await Post.insertMany(SEED_POSTS);
    console.log(`🌱 Seeded ${inserted.length} posts successfully`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
