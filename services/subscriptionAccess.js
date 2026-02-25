const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Store = require('../models/Store');
const { getPlanById } = require('../config/plans');

/**
 * Check if user has active access (trial valid or paid subscription active).
 * @param {Object} user - User doc with subscriptionStatus, trialEndsAt
 * @param {Object} [subscription] - Optional Subscription doc (currentPeriodEnd)
 * @returns {boolean}
 */
function hasActiveAccess(user, subscription = null) {
  if (!user) return false;
  const status = user.subscriptionStatus;
  const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
  const now = new Date();

  if (status === 'active') {
    if (subscription && subscription.currentPeriodEnd) {
      return new Date(subscription.currentPeriodEnd) > now;
    }
    return true;
  }
  if (status === 'trialing' && trialEndsAt && trialEndsAt > now) return true;
  if (status === 'past_due') return true;
  return false;
}

/**
 * Async: resolve user's access (loads Subscription if needed).
 * @param {Object} user - User doc
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
async function checkAccess(user) {
  if (!user) return { allowed: false, reason: 'User not found' };
  const subscription = await Subscription.findOne({ userId: user._id }).lean();
  const allowed = hasActiveAccess(user, subscription);
  if (allowed) return { allowed: true };
  const status = user.subscriptionStatus;
  const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
  const now = new Date();
  if (status === 'trialing' && trialEndsAt && trialEndsAt <= now) {
    await User.updateOne({ _id: user._id }, { $set: { subscriptionStatus: 'expired' } }).catch(() => {});
    return { allowed: false, reason: 'Trial ended. Please upgrade to continue.' };
  }
  if (status === 'cancelled' || status === 'expired')
    return { allowed: false, reason: 'Subscription expired. Please renew.' };
  return { allowed: false, reason: 'Active subscription required.' };
}

/**
 * Check if user can create one more store (under plan limit).
 * @param {ObjectId} userId
 * @param {string} planId - User's plan id (e.g. from User.plan)
 * @returns {Promise<{ allowed: boolean, current: number, limit: number, reason?: string }>}
 */
async function checkStoreLimit(userId, planId) {
  const plan = getPlanById(planId);
  const limit = plan?.limits?.stores;
  const current = await Store.countDocuments({ userId });
  if (limit === -1 || limit === undefined) return { allowed: true, current, limit: -1 };
  if (current >= limit) return { allowed: false, current, limit, reason: `Store limit (${limit}) reached. Upgrade your plan to add more stores.` };
  return { allowed: true, current, limit };
}

module.exports = { hasActiveAccess, checkAccess, checkStoreLimit };
