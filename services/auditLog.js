const AuditLog = require('../models/AuditLog');

/**
 * Log an admin action for audit. Call from admin controller with req.user._id.
 * @param {string} adminId - Admin user _id
 * @param {string} action - e.g. 'user.create', 'plan.update'
 * @param {string} resource - e.g. 'user', 'plan'
 * @param {string} [resourceId]
 * @param {object} [details]
 */
async function logAudit(adminId, action, resource, resourceId, details) {
  if (!adminId || !action || !resource) return;
  try {
    await AuditLog.create({
      adminId,
      action,
      resource,
      resourceId: resourceId || undefined,
      details: details || undefined,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { logAudit };
