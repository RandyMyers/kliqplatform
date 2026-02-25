const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    status: { type: String, default: 'todo', enum: ['todo', 'in-progress', 'completed'] },
    priority: { type: String, default: 'medium', enum: ['low', 'medium', 'high'] },
    dueDate: { type: Date },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tags: [{ type: String }],
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);
