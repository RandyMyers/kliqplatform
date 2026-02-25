const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Invite = require('../models/Invite');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// POST /api/invites
router.post('/', async (req, res) => {
  try {
    const { email, role, message } = req.body || {};

    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const allowedRoles = ['admin', 'manager', 'user'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const inviteLifetimeHours = Number(process.env.INVITE_TOKEN_HOURS || 168); // default 7 days
    const expiresAt = new Date(Date.now() + inviteLifetimeHours * 60 * 60 * 1000);

    const rawToken = crypto.randomBytes(32).toString('hex');

    const jwtSecret = process.env.JWT_SECRET || process.env.JWT_KEY;
    if (!jwtSecret) {
      return res.status(500).json({ message: 'JWT secret not configured' });
    }

    const signedToken = jwt.sign(
      {
        t: rawToken,
        r: role,
        e: expiresAt.toISOString(),
      },
      jwtSecret,
      { expiresIn: `${inviteLifetimeHours}h` }
    );

    await Invite.create({
      email: email || null,
      role,
      message: message || null,
      token: rawToken,
      createdBy: req.user._id,
      expiresAt,
    });

    const appBaseUrl =
      process.env.APP_BASE_URL ||
      process.env.CLIENT_URL ||
      'http://localhost:3000';

    const inviteUrl = `${appBaseUrl.replace(/\/+$/, '')}/signup?invite=${encodeURIComponent(
      signedToken
    )}`;

    return res.status(201).json({ inviteUrl });
  } catch (err) {
    console.error('Failed to create invite:', err);
    return res.status(500).json({ message: 'Failed to create invite' });
  }
});

module.exports = router;

