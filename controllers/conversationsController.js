const Conversation = require('../models/Conversation');

async function list(req, res) {
  try {
    const { status } = req.query;
    const filter = { userId: req.user._id };
    if (status) filter.status = status;
    const conversations = await Conversation.find(filter).sort({ updatedAt: -1 }).limit(50).lean();
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getById(req, res) {
  try {
    const conv = await Conversation.findOne({ _id: req.params.id, userId: req.user._id });
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    res.json(conv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function create(req, res) {
  try {
    const { subject, contactName, contactEmail, message } = req.body;
    const conv = await Conversation.create({
      userId: req.user._id,
      subject: subject || 'New conversation',
      contactName: contactName || '',
      contactEmail: contactEmail || '',
      messages: message ? [{ body: message, sender: 'user' }] : [],
    });
    res.status(201).json(conv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function addMessage(req, res) {
  try {
    const { body, sender } = req.body;
    if (!body) return res.status(400).json({ message: 'Message body required' });
    const conv = await Conversation.findOne({ _id: req.params.id, userId: req.user._id });
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    conv.messages.push({
      body,
      sender: sender === 'contact' ? 'contact' : 'user',
    });
    await conv.save();
    res.json(conv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateStatus(req, res) {
  try {
    const { status } = req.body;
    if (!['open', 'closed'].includes(status)) return res.status(400).json({ message: 'Status must be open or closed' });
    const conv = await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { status } },
      { new: true }
    );
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    res.json(conv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { list, getById, create, addMessage, updateStatus };
