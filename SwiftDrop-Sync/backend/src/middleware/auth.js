// src/middleware/auth.js
// JWT authentication guard, role-based access control, and rate limiters.

const rateLimit = require('express-rate-limit');
const User      = require('../models/User');
const Rider     = require('../models/Rider');
const { verifyAccessToken } = require('../services/tokenService');
const { asyncHandler }      = require('./errorHandler');
const logger                = require('../utils/logger');

// ── Extract token from request ────────────────────────────────────────────────
function extractToken(req) {
  // 1. Authorization: Bearer <token>
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return req.headers.authorization.split(' ')[1];
  }
  // 2. HTTP-only cookie
  if (req.cookies?.access_token) {
    return req.cookies.access_token;
  }
  return null;
}

// ── protect — verifies JWT and attaches user/rider to req ────────────────────
const protect = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: err.name === 'TokenExpiredError' ? 'Session expired.' : 'Invalid token.',
    });
  }

  let account;

  try {
    if (decoded.userType === 'admin') {
      const Admin = require('../models/Admin');
      account = await Admin.findById(decoded.id).select('-passwordHash -refreshTokenHash');
    } else if (decoded.userType === 'rider') {
      const Rider = require('../models/Rider');
      account = await Rider.findById(decoded.id).select('-refreshTokenHash');
    } else {
      const User = require('../models/User');
      account = await User.findById(decoded.id).select('-refreshTokenHash');
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Database error.' });
  }

  if (!account) {
    return res.status(401).json({ success: false, message: 'Account not found.' });
  }

  req.user     = account;
  req.userType = decoded.userType;
  req.userId   = decoded.id;
  next();
});

// ── authorise — restrict to specific roles ────────────────────────────────────
const authorise = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    const hasRole = roles.includes(req.user.role) || roles.includes(req.userType);
    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }

    next();
  };
};

// ── riderOnly — convenience: checks rider approval status ─────────────────────
const riderOnly = asyncHandler(async (req, res, next) => {
  if (req.userType !== 'rider') {
    return res.status(403).json({ success: false, message: 'Rider account required.' });
  }

  if (req.user.status !== 'approved') {
    return res.status(403).json({
      success:  false,
      message:  'Rider account not yet approved.',
      status:   req.user.status,
    });
  }

  next();
});

// ── Rate limiters ─────────────────────────────────────────────────────────────

// General API rate limit.
// The mobile apps poll a handful of live-sync endpoints every few seconds
// (rider location heartbeat, active job, earnings, delivery tracking, job feed).
// Those are all behind `protect`, so abuse is already bounded by auth — we skip
// them here so normal polling doesn't exhaust the quota and trigger 429s.
const POLLING_PATHS = [
  /\/rider\/location$/,
  /\/rider\/status$/,
  /\/rider\/active$/,
  /\/rider\/earnings$/,
  /\/deliveries\/available$/,
  /\/deliveries\/[^/]+\/track-rider$/,
  /\/deliveries\/[^/]+\/location$/,
  /\/deliveries\/[^/]+$/,   // GET a single delivery (polled while finding/​tracking)
];

const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX, 10) || 1000,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
  skip: (req) => {
    if (process.env.NODE_ENV === 'test') return true;
    const p = (req.originalUrl || req.url || '').split('?')[0];
    return POLLING_PATHS.some((re) => re.test(p));
  },
});

// Strict OTP send limit — max 5 requests per 15 minutes per IP
const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.OTP_RATE_LIMIT_MAX, 10) || 5,
  keyGenerator: (req) => req.body?.phone || req.ip,
  message: {
    success: false,
    message: 'Too many OTP requests for this number. Please wait 15 minutes.',
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

// OTP verification limit — max 10 verify attempts per 15 minutes
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  keyGenerator: (req) => req.body?.phone || req.ip,
  message: {
    success: false,
    message: 'Too many verification attempts. Please request a new code.',
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

module.exports = {
  protect,
  authorise,
  riderOnly,
  apiLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
};
