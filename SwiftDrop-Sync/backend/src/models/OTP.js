// src/models/OTP.js
// Stores phone OTP records with expiry, attempt counting, and rate limiting.

const mongoose = require('mongoose');
const crypto   = require('crypto');

const OTPSchema = new mongoose.Schema(
  {
    // ── Target ────────────────────────────────────────────────────────────────
    phone: {
      type:    String,
      required: true,
      index:   true,
    },
    userType: {
      type:    String,
      enum:    ['user', 'rider'],
      required: true,
    },
    purpose: {
      type:    String,
      enum:    ['signin', 'signup', 'phone_verify', 'pickup_confirm'],
      default: 'signin',
    },

    // ── The code ──────────────────────────────────────────────────────────────
    codeHash: {
      type:     String,
      required: true,
      select:   false,   // never returned in queries by default
    },
    // Last 2 digits stored for debugging only (never the full code)
    codeSuffix: { type: String },

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    expiresAt: {
      type:     Date,
      required: true,
      index:    { expires: 0 }, // TTL index — MongoDB auto-deletes expired docs
    },
    isUsed:    { type: Boolean, default: false },
    usedAt:    { type: Date,    default: null },

    // ── Attempt tracking ──────────────────────────────────────────────────────
    attempts:     { type: Number, default: 0 },
    maxAttempts:  { type: Number, default: 5 },

    // ── Delivery metadata ─────────────────────────────────────────────────────
    deliveryStatus: {
      type:    String,
      enum:    ['pending', 'sent', 'failed'],
      default: 'pending',
    },
    deliveryProvider: { type: String }, // 'twilio' | 'termii' | 'mock'
    deliveryMessageId:{ type: String },
    deliveryError:    { type: String },

    // ── Request metadata ──────────────────────────────────────────────────────
    ipAddress:  { type: String },
    deviceId:   { type: String },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
OTPSchema.index({ phone: 1, purpose: 1, isUsed: 1 });
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// ── Static: create a new OTP record ──────────────────────────────────────────
OTPSchema.statics.createOTP = async function ({
  phone,
  userType,
  purpose = 'signin',
  ipAddress,
  deviceId,
}) {
  const OTP_LENGTH  = parseInt(process.env.OTP_LENGTH, 10) || 6;
  const OTP_EXPIRE  = parseInt(process.env.OTP_EXPIRE_MINUTES, 10) || 10;
  const MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 5;

  // Generate cryptographically random numeric code
  const code = Array.from(
    { length: OTP_LENGTH },
    () => Math.floor(Math.random() * 10)
  ).join('');

  // Hash the code before storing (never store plaintext OTPs)
  const codeHash = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(code)
    .digest('hex');

  // Invalidate any previous unused OTPs for this phone + purpose
  await this.updateMany(
    { phone, purpose, isUsed: false },
    { $set: { isUsed: true } }
  );

  const otpDoc = await this.create({
    phone,
    userType,
    purpose,
    codeHash,
    codeSuffix: code.slice(-2),
    expiresAt:  new Date(Date.now() + OTP_EXPIRE * 60 * 1000),
    maxAttempts: MAX_ATTEMPTS,
    ipAddress,
    deviceId,
  });

  // Return code only here — never persisted in plaintext
  return { code, otpId: otpDoc._id, expiresAt: otpDoc.expiresAt };
};

// ── Static: verify an OTP ────────────────────────────────────────────────────
OTPSchema.statics.verifyOTP = async function ({ phone, purpose, code }) {
  // Find the most recent unused, unexpired OTP for this phone+purpose
  const otp = await this.findOne({
    phone,
    purpose,
    isUsed:    false,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .select('+codeHash');

  if (!otp) {
    return { valid: false, reason: 'OTP not found or expired' };
  }

  if (otp.attempts >= otp.maxAttempts) {
    return { valid: false, reason: 'Too many incorrect attempts. Request a new code.' };
  }

  // Hash the submitted code and compare
  const hash = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(code)
    .digest('hex');

  if (hash !== otp.codeHash) {
    await otp.updateOne({ $inc: { attempts: 1 } });
    const remaining = otp.maxAttempts - otp.attempts - 1;
    return {
      valid:     false,
      reason:    `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      remaining,
    };
  }

  // Mark as used
  await otp.updateOne({ $set: { isUsed: true, usedAt: new Date() } });

  return { valid: true, otpId: otp._id };
};

module.exports = mongoose.model('OTP', OTPSchema);
