// src/services/tokenService.js
// JWT access + refresh token management.

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

// ── Token generation ──────────────────────────────────────────────────────────

/**
 * Issue a short-lived access token.
 * Payload: { id, role, userType }
 */
function issueAccessToken(user, userType = 'user') {
  return jwt.sign(
    {
      id:       user._id.toString(),
      sub:      user._id.toString(), // FIX: add sub claim for refresh token lookup
      role:     user.role,
      userType,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '30d',
      issuer:    'swiftdrop-api',
      audience:  'swiftdrop-app',
    }
  );
}

/**
 * Issue a long-lived refresh token (opaque random string).
 * We store only its bcrypt hash in the database.
 */
async function issueRefreshToken(user, Model) {
  // Embed userId in refresh token so we can do O(1) lookup instead of full scan
  const jwt = require('jsonwebtoken');
  const rawPayload = `${user._id.toString()}.${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash  = await bcrypt.hash(rawPayload, 10);

  await Model.updateOne(
    { _id: user._id },
    { refreshTokenHash: tokenHash, lastLoginAt: new Date() }
  );

  // Wrap in a JWT so the client gets a single opaque string AND we can decode userId
  const wrapped = jwt.sign(
    { sub: user._id.toString(), raw: rawPayload },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '90d' }
  );

  return wrapped;
}

/**
 * Verify an access token.
 * Returns decoded payload or throws.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, {
    issuer:   'swiftdrop-api',
    audience: 'swiftdrop-app',
  });
}

/**
 * Validate a raw refresh token against the stored hash.
 * Returns true/false — does NOT throw.
 */
async function validateRefreshToken(wrappedToken, storedHash) {
  try {
    const jwt = require('jsonwebtoken');
    // Decode to extract raw payload without verifying expiry (bcrypt is the truth)
    const decoded = jwt.decode(wrappedToken);
    if (!decoded?.raw) {
      // Legacy format: treat wrappedToken as raw hex directly
      return await bcrypt.compare(wrappedToken, storedHash);
    }
    return await bcrypt.compare(decoded.raw, storedHash);
  } catch {
    return false;
  }
}

/**
 * Decode the userId embedded in a refresh token (no DB scan needed).
 */
function decodeRefreshTokenUserId(wrappedToken) {
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(wrappedToken);
    return decoded?.sub || null;
  } catch {
    return null;
  }
}

/**
 * Revoke a user/rider's refresh token (logout or security revocation).
 */
async function revokeRefreshToken(userId, Model) {
  await Model.updateOne(
    { _id: userId },
    { $unset: { refreshTokenHash: 1 } }
  );
}

/**
 * Set access token + refresh token as HTTP-only cookies.
 */
function setTokenCookies(res, accessToken, refreshToken) {
  const isProd = process.env.NODE_ENV === 'production';

  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure:   isProd,
    sameSite: 'strict',
    maxAge:   30 * 24 * 60 * 60 * 1000,  // 30 days in ms
  });

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure:   isProd,
    sameSite: 'strict',
    maxAge:   90 * 24 * 60 * 60 * 1000,  // 90 days in ms
    path:     '/api/v1/auth/refresh',      // only sent to refresh endpoint
  });
}

/**
 * Clear auth cookies (used on logout).
 */
function clearTokenCookies(res) {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
}

module.exports = {
  issueAccessToken,
  issueRefreshToken,
  verifyAccessToken,
  validateRefreshToken,
  decodeRefreshTokenUserId,
  revokeRefreshToken,
  setTokenCookies,
  clearTokenCookies,
};
