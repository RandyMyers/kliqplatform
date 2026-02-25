const { authMiddleware } = require('./auth');

function requireAdmin(req, res, next) {
  authMiddleware(req, res, (err) => {
    if (err) return next(err);
    if (req.user && req.user.role === 'admin') return next();
    return res.status(403).json({ message: 'Admin access required' });
  });
}

module.exports = { requireAdmin };
