const GroupChat = require('../models/GroupChat');
const GroupMessage = require('../models/GroupMessage');
const User = require('../models/User');

exports.createGroupChat = async (req, res) => {
  try {
    const { name, memberIds = [], description, image } = req.body;
    const userId = req.userId;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Ensure creator is in members
    const allMemberIds = [userId, ...memberIds].filter(
      (id, index, arr) => arr.indexOf(id) === index
    );

    const group = new GroupChat({
      name: name.trim(),
      description: description?.trim(),
      image,
      admin: userId,
      admins: [userId],
      members: allMemberIds,
    });

    await group.save();
    await group.populate('admin members admins', 'username profile avatar verified');

    res.status(201).json({ message: 'Group created', data: group });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
};

exports.getGroupChats = async (req, res) => {
  try {
    const userId = req.userId;

    const groups = await GroupChat.find({ members: userId })
      .populate('admin members admins lastMessage', 'username profile avatar verified text')
      .sort({ lastMessageAt: -1 })
      .lean();

    res.json({ data: groups });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
};

exports.getGroupChat = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    const group = await GroupChat.findById(groupId)
      .populate('admin members admins', 'username profile avatar verified');

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is member
    if (!group.members.includes(userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ data: group });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
};

exports.updateGroupChat = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, description, image } = req.body;
    const userId = req.userId;

    const group = await GroupChat.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Only admin can update
    if (String(group.admin) !== String(userId) && !group.admins.includes(userId)) {
      return res.status(403).json({ error: 'Only admins can update group' });
    }

    if (name) group.name = name.trim();
    if (description !== undefined) group.description = description.trim();
    if (image !== undefined) group.image = image;

    await group.save();
    await group.populate('admin members admins', 'username profile avatar verified');

    res.json({ message: 'Group updated', data: group });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
};

exports.getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { limit = 30, cursor } = req.query;
    const userId = req.userId;

    const group = await GroupChat.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (!group.members.includes(userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let query = GroupMessage.find({
      group: groupId,
      deletedAt: null,
    }).populate('sender', 'username profile avatar verified');

    if (cursor) {
      query = query.where('_id').lt(cursor);
    }

    const messages = await query
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) + 1)
      .lean();

    const hasMore = messages.length > parseInt(limit);
    const result = messages.slice(0, parseInt(limit));

    res.json({
      data: result.reverse(),
      nextCursor: hasMore ? result[result.length - 1]?._id : null,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

exports.sendGroupMessage = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { text } = req.body;
    const userId = req.userId;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const group = await GroupChat.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (!group.members.includes(userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const message = new GroupMessage({
      group: groupId,
      sender: userId,
      text: text.trim(),
      readBy: [userId],
    });

    await message.save();
    await message.populate('sender', 'username profile avatar verified');

    // Update group last message
    group.lastMessage = message._id;
    group.lastMessageAt = new Date();
    await group.save();

    // Broadcast to socket
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('message:created', {
        message,
        groupId,
      });
    }

    res.status(201).json({ message: 'Message sent', data: message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

exports.deleteGroupMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    const userId = req.userId;

    const message = await GroupMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Only sender or admin can delete
    if (String(message.sender) !== String(userId)) {
      const group = await GroupChat.findById(groupId);
      if (!group || (String(group.admin) !== String(userId) && !group.admins.includes(userId))) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    message.deletedAt = new Date();
    await message.save();

    // Broadcast to socket
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('message:deleted', {
        messageId,
        groupId,
      });
    }

    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

exports.addGroupMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId: memberId } = req.body;
    const userId = req.userId;

    const group = await GroupChat.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Only admin can add members
    if (String(group.admin) !== String(userId) && !group.admins.includes(userId)) {
      return res.status(403).json({ error: 'Only admins can add members' });
    }

    if (group.members.includes(memberId)) {
      return res.status(400).json({ error: 'User already in group' });
    }

    group.members.push(memberId);
    await group.save();
    await group.populate('admin members admins', 'username profile avatar verified');

    // Broadcast to socket
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('group:memberAdded', {
        groupId,
        memberId,
        group,
      });
    }

    res.json({ message: 'Member added', data: group });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
};

exports.removeGroupMember = async (req, res) => {
  try {
    const { groupId, userId: memberId } = req.params;
    const userId = req.userId;

    const group = await GroupChat.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Only admin can remove members
    if (String(group.admin) !== String(userId) && !group.admins.includes(userId)) {
      return res.status(403).json({ error: 'Only admins can remove members' });
    }

    group.members = group.members.filter(id => String(id) !== String(memberId));
    group.admins = group.admins.filter(id => String(id) !== String(memberId));
    await group.save();
    await group.populate('admin members admins', 'username profile avatar verified');

    // Broadcast to socket
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('group:memberRemoved', {
        groupId,
        memberId,
        group,
      });
    }

    res.json({ message: 'Member removed', data: group });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

exports.leaveGroupChat = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    const group = await GroupChat.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    group.members = group.members.filter(id => String(id) !== String(userId));
    group.admins = group.admins.filter(id => String(id) !== String(userId));

    // If user was admin and there are other members, make first member admin
    if (String(group.admin) === String(userId) && group.members.length > 0) {
      group.admin = group.members[0];
      group.admins = [group.members[0]];
    }

    await group.save();
    await group.populate('admin members admins', 'username profile avatar');

    // Broadcast to socket
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('group:memberLeft', {
        groupId,
        userId,
      });
    }

    res.json({ message: 'Left group' });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Failed to leave group' });
  }
};

exports.promoteToAdmin = async (req, res) => {
  try {
    const { groupId, userId: memberId } = req.params;
    const userId = req.userId;

    const group = await GroupChat.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Only admin can promote
    if (String(group.admin) !== String(userId)) {
      return res.status(403).json({ error: 'Only group owner can promote members' });
    }

    if (!group.admins.includes(memberId)) {
      group.admins.push(memberId);
      await group.save();
    }

    await group.populate('admin members admins', 'username profile avatar');

    // Broadcast to socket
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('group:memberPromoted', {
        groupId,
        memberId,
      });
    }

    res.json({ message: 'Member promoted', data: group });
  } catch (error) {
    console.error('Promote member error:', error);
    res.status(500).json({ error: 'Failed to promote member' });
  }
};

exports.demoteFromAdmin = async (req, res) => {
  try {
    const { groupId, userId: memberId } = req.params;
    const userId = req.userId;

    const group = await GroupChat.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Only admin can demote
    if (String(group.admin) !== String(userId)) {
      return res.status(403).json({ error: 'Only group owner can demote members' });
    }

    group.admins = group.admins.filter(id => String(id) !== String(memberId));
    await group.save();
    await group.populate('admin members admins', 'username profile avatar');

    // Broadcast to socket
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('group:memberDemoted', {
        groupId,
        memberId,
      });
    }

    res.json({ message: 'Member demoted', data: group });
  } catch (error) {
    console.error('Demote member error:', error);
    res.status(500).json({ error: 'Failed to demote member' });
  }
};
