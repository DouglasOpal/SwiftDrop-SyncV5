// src/controllers/userAuthController.js — SYNCHRONIZED v2
// Fixes: removed user.reload(), refresh token scan, proper error codes

const User           = require('../models/User');
const OTP            = require('../models/OTP');
const bcrypt         = require('bcryptjs');
const { sendOTP }    = require('../services/smsService');
const {
  issueAccessToken,
  issueRefreshToken,
  revokeRefreshToken,
  setTokenCookies,
  clearTokenCookies,
} = require('../services/tokenService');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// POST /api/v1/auth/user/send-otp
const sendUserOTP = asyncHandler(async (req, res) => {
  const { phone, purpose = 'signin' } = req.body;
  const existingUser = await User.findOne({ phone });

  if (purpose === 'signin' && !existingUser) {
    return res.status(404).json({ success: false, message: 'No account found. Please sign up.', code: 'ACCOUNT_NOT_FOUND' });
  }
  if (purpose === 'signup' && existingUser?.phoneVerified) {
    return res.status(409).json({ success: false, message: 'Number already registered. Please sign in.', code: 'ALREADY_REGISTERED' });
  }

  const OTP_EXPIRE = parseInt(process.env.OTP_EXPIRE_MINUTES, 10) || 10;
  const { code, otpId, expiresAt } = await OTP.createOTP({ phone, userType: 'user', purpose, ipAddress: req.ip, deviceId: req.headers['x-device-id'] });

  const smsResult = await sendOTP(phone, code, OTP_EXPIRE);
  await OTP.updateOne({ _id: otpId }, { deliveryStatus: smsResult.deliveryStatus, deliveryProvider: smsResult.provider, deliveryMessageId: smsResult.messageId, deliveryError: smsResult.error || null });

  if (smsResult.deliveryStatus === 'failed') throw new AppError('Failed to send SMS.', 503, 'SMS_FAILED');

  res.status(200).json({ success: true, message: `Code sent to ${phone.slice(0, -4)}****`, expiresAt, isNewUser: !existingUser });
});

// POST /api/v1/auth/user/verify-otp
const verifyUserOTP = asyncHandler(async (req, res) => {
  const { phone, code, purpose = 'signin' } = req.body;
  const result = await OTP.verifyOTP({ phone, purpose, code });

  if (!result.valid) {
    return res.status(400).json({ success: false, message: result.reason, remaining: result.remaining, code: 'OTP_INVALID' });
  }

  let user = await User.findOne({ phone });
  let isNew = false;

  if (!user) {
    user  = await User.create({ phone, phoneVerified: true, authProvider: 'phone' });
    isNew = true;
  } else {
    await User.updateOne({ _id: user._id }, { phoneVerified: true, lastLoginAt: new Date(), lastLoginIp: req.ip, loginAttempts: 0, $unset: { lockUntil: 1 } });
    user = await User.findById(user._id); // FIX: re-query instead of nonexistent reload()
  }

  const accessToken  = issueAccessToken(user, 'user');
  const refreshToken = await issueRefreshToken(user, User);
  setTokenCookies(res, accessToken, refreshToken);

  res.status(200).json({ success: true, message: isNew ? 'Account created.' : 'Signed in.', isNewUser: isNew, isProfileComplete: user.isProfileComplete, accessToken, refreshToken, user: user.toSafeObject() });
});

// PUT /api/v1/auth/user/profile
const updateUserProfile = asyncHandler(async (req, res) => {
  const { fullName, email, homeArea, expoPushToken } = req.body;
  const updates = { isProfileComplete: true };
  if (fullName)       updates.fullName       = fullName.trim();
  if (email)          updates.email          = email.toLowerCase().trim();
  if (homeArea)       updates.homeArea       = homeArea.trim();
  if (expoPushToken)  updates.expoPushToken  = expoPushToken;

  if (email) {
    const taken = await User.findOne({ email, _id: { $ne: req.userId } });
    if (taken) throw new AppError('Email already in use.', 409, 'EMAIL_TAKEN');
  }

  const user = await User.findByIdAndUpdate(req.userId, updates, { new: true, runValidators: true });
  if (!user) throw new AppError('User not found.', 404);

  res.status(200).json({ success: true, message: 'Profile updated.', user: user.toSafeObject() });
});

// POST /api/v1/auth/user/refresh — O(1) lookup via userId embedded in token
const refreshUserToken = asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.refresh_token || req.body?.refreshToken;
  if (!rawToken) throw new AppError('Refresh token required.', 401, 'NO_REFRESH_TOKEN');

  const { decodeRefreshTokenUserId, validateRefreshToken } = require('../services/tokenService');

  // Decode userId from the wrapped JWT — no full table scan needed
  const userId = decodeRefreshTokenUserId(rawToken);
  if (!userId) throw new AppError('Invalid refresh token format.', 401, 'INVALID_REFRESH');

  const user = await User.findById(userId).select('+refreshTokenHash');
  const isValid = user && await validateRefreshToken(rawToken, user.refreshTokenHash);

  if (!isValid) throw new AppError('Invalid or expired session. Please sign in again.', 401, 'INVALID_REFRESH');

  const accessToken     = issueAccessToken(user, 'user');
  const newRefreshToken = await issueRefreshToken(user, User);
  setTokenCookies(res, accessToken, newRefreshToken);

  res.status(200).json({ success: true, accessToken, refreshToken: newRefreshToken });
});

// POST /api/v1/auth/user/logout
const logoutUser = asyncHandler(async (req, res) => {
  if (req.userId) await revokeRefreshToken(req.userId, User);
  clearTokenCookies(res);
  res.status(200).json({ success: true, message: 'Signed out.' });
});

// GET /api/v1/auth/user/me
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new AppError('User not found.', 404);
  res.status(200).json({ success: true, user: user.toSafeObject() });
});

module.exports = { sendUserOTP, verifyUserOTP, updateUserProfile, refreshUserToken, logoutUser, getMe };
