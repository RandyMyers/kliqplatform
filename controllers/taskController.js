const Task = require('../models/Task');

async function list(req, res) {
  try {
    const { status, priority, assigneeId, dueFilter, tags, search, limit = 50, page = 1, sortBy = 'dueDate', sortOrder = 'asc' } = req.query;
    const filter = { userId: req.user._id };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assigneeId) filter.assigneeId = assigneeId === 'unassigned' ? null : assigneeId;
    if (tags) {
      const tagList = typeof tags === 'string' ? tags.split(',').map((t) => t.trim()).filter(Boolean) : tags;
      if (tagList.length) filter.tags = { $in: tagList };
    }
    const andConditions = [];
    if (search) {
      andConditions.push({
        $or: [
          { title: new RegExp(search, 'i') },
          { description: new RegExp(search, 'i') },
        ],
      });
    }
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    if (dueFilter === 'overdue') {
      filter.status = { $ne: 'completed' };
      filter.dueDate = { $lt: now };
    } else if (dueFilter === 'today') {
      filter.dueDate = { $gte: todayStart, $lt: todayEnd };
    } else if (dueFilter === 'week') {
      filter.dueDate = { $gte: todayStart, $lte: weekEnd };
    } else if (dueFilter === 'nodate') {
      andConditions.push({ $or: [{ dueDate: null }, { dueDate: { $exists: false } }] });
    }
    if (andConditions.length) filter.$and = andConditions;
    const sortField = { dueDate: 1, priority: 1, createdAt: -1, title: 1 }[sortBy] ? sortBy : 'dueDate';
    const sortDir = sortOrder === 'desc' ? -1 : 1;
    const skip = Math.max(0, (parseInt(page, 10) - 1) * parseInt(limit, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .populate('assigneeId', 'fullName email')
        .sort({ [sortField]: sortDir, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Task.countDocuments(filter),
    ]);
    res.json({ tasks, total, page: parseInt(page, 10), limit: limitNum });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function stats(req, res) {
  try {
    const userId = req.user._id;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekAgo = new Date(todayStart);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const [total, todo, inProgress, completed, overdue, dueSoon, completedThisWeek, pendingTasks, upcomingDeadlines, recentlyCompleted] = await Promise.all([
      Task.countDocuments({ userId }),
      Task.countDocuments({ userId, status: 'todo' }),
      Task.countDocuments({ userId, status: 'in-progress' }),
      Task.countDocuments({ userId, status: 'completed' }),
      Task.countDocuments({ userId, status: { $ne: 'completed' }, dueDate: { $lt: now } }),
      Task.countDocuments({ userId, status: { $ne: 'completed' }, dueDate: { $gte: todayStart, $lte: weekEnd } }),
      Task.countDocuments({ userId, status: 'completed', updatedAt: { $gte: weekAgo } }),
      Task.find({ userId, status: { $in: ['todo', 'in-progress'] } }).sort({ dueDate: 1, createdAt: -1 }).limit(8).populate('assigneeId', 'fullName').lean(),
      Task.find({ userId, status: { $ne: 'completed' }, dueDate: { $gte: todayStart } }).sort({ dueDate: 1 }).limit(8).populate('assigneeId', 'fullName').lean(),
      Task.find({ userId, status: 'completed' }).sort({ updatedAt: -1 }).limit(8).populate('assigneeId', 'fullName').lean(),
    ]);
    res.json({
      totalTasks: total,
      todo,
      inProgress,
      completed,
      overdue,
      dueSoon,
      completedThisWeek,
      pendingTasks: pendingTasks || [],
      upcomingDeadlines: upcomingDeadlines || [],
      recentlyCompleted: recentlyCompleted || [],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getById(req, res) {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('assigneeId', 'fullName email');
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function create(req, res) {
  try {
    const { title, description, status, priority, dueDate, assigneeId, tags } = req.body;
    if (!title) return res.status(400).json({ message: 'Title required' });
    const task = await Task.create({
      title,
      description: description || '',
      status: status || 'todo',
      priority: priority || 'medium',
      dueDate: dueDate ? new Date(dueDate) : undefined,
      assigneeId: assigneeId || undefined,
      tags: tags || [],
      userId: req.user._id,
    });
    const populated = await Task.findById(task._id).populate('assigneeId', 'fullName email');
    res.status(201).json(populated || task);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function update(req, res) {
  try {
    const allowed = ['title', 'description', 'status', 'priority', 'dueDate', 'assigneeId', 'tags'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        if (k === 'dueDate') updates[k] = req.body[k] ? new Date(req.body[k]) : null;
        else if (k === 'tags') updates[k] = Array.isArray(req.body[k]) ? req.body[k] : [];
        else updates[k] = req.body[k];
      }
    }
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: updates },
      { new: true }
    ).populate('assigneeId', 'fullName email');
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function remove(req, res) {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { list, stats, getById, create, update, remove };
