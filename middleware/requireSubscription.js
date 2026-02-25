const { checkAccess } = require('../services/subscriptionAccess');

/**
 * Requires user to have active access (valid trial or active subscription).
 * Use after authMiddleware (req.user must be set). On failure returns 403.
 */
async function requireSubscription(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  const result = await checkAccess(req.user);
  if (!result.allowed) {
    return res.status(403).json({
      message: result.reason || 'Active subscription required',
      code: 'SUBSCRIPTION_REQUIRED',
    });
  }
  next();
}

module.exports = { requireSubscription };
