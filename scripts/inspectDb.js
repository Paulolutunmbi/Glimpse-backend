require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const GroupChat = require('../models/GroupChat');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  const countTotal = await User.countDocuments({});
  const countWithUsername = await User.countDocuments({ username: { $exists: true, $ne: "" } });
  console.log(`Total users: ${countTotal}`);
  console.log(`Users with username: ${countWithUsername}`);

  const users = await User.find({ username: { $exists: true, $ne: "" } });
  users.forEach(u => {
    console.log(`User: ${u.username}`);
    console.log(`  avatar: ${u.avatar}`);
    console.log(`  profilePicture: ${u.profilePicture}`);
    console.log(`  profile.avatar: ${u.profile?.avatar}`);
    console.log(`  coverImage: ${u.coverImage}`);
  });

  const posts = await Post.find({}).limit(3);
  console.log('--- POSTS ---');
  posts.forEach(p => {
    console.log(`Post ID: ${p._id}`);
    console.log(`  author: ${p.author}`);
    console.log(`  user snapshot:`, p.user);
    console.log(`  image: ${p.image}`);
    console.log(`  media:`, JSON.stringify(p.media));
  });

  await mongoose.disconnect();
}

main().catch(console.error);
