// src/models/User.js
// Customer (sender/receiver) account model.

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    // ── Core identity ────────────────────────────────────────────────────────
    phone: {
      type:     String,
      required: [true, 'Phone number is required'],
      unique:   true,
      trim:     true,
      match:    [/^(\+234|0)[789]\d{9}$/, 'Enter a valid Nigerian phone number'],
      index:    true,
    },
    phoneVerified: { type: Boolean, default: false },
    countryCode:   { type: String, default: '+234' },

    // ── Profile ──────────────────────────────────────────────────────────────
    fullName: {
      type:    String,
      trim:    true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type:      String,
      trim:      true,
      lowercase: true,
      sparse:    true,   // allow null but enforce unique when present
      match:     [/^\S+@\S+\.\S+$/, 'Enter a valid email address'],
    },
    homeArea:  { type: String, trim: true },
    avatarUrl: { type: String, default: null },

    // ── Auth metadata ────────────────────────────────────────────────────────
    role: {
      type:    String,
      enum:    ['user', 'admin'],
      default: 'user',
    },
    isActive:     { type: Boolean, default: true },
    isProfileComplete: { type: Boolean, default: false },

    // ── Social auth ──────────────────────────────────────────────────────────
    googleId:   { type: String, sparse: true },
    facebookId: { type: String, sparse: true },
    authProvider: {
      type:    String,
      enum:    ['phone', 'google', 'facebook'],
      default: 'phone',
    },

    // ── Security ─────────────────────────────────────────────────────────────
    refreshTokenHash: { type: String, select: false },
    lastLoginAt:      { type: Date },
    lastLoginIp:      { type: String },
    loginAttempts:    { type: Number, default: 0 },
    lockUntil:        { type: Date },

    // ── Delivery preferences ─────────────────────────────────────────────────
    savedAddresses: [
      {
        label:   { type: String, enum: ['home', 'office', 'other'], default: 'other' },
        name:    String,
        address: String,
        lat:     Number,
        lng:     Number,
      },
    ],

    // ── Push notifications ───────────────────────────────────────────────────
    fcmToken:  { type: String, default: null },
    expoPushToken: { type: String, default: null },
    notificationsEnabled: { type: Boolean, default: true },
  },
  {
    timestamps: true,        // adds createdAt, updatedAt
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
UserSchema.index({ phone: 1 });
UserSchema.index({ email: 1 }, { sparse: true });
UserSchema.index({ createdAt: -1 });

// ── Virtual: isLocked ─────────────────────────────────────────────────────
UserSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ── Method: incLoginAttempts ──────────────────────────────────────────────
UserSchema.methods.incLoginAttempts = async function () {
  // Unlock if previous lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set:   { loginAttempts: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  const MAX_ATTEMPTS = 10;
  const LOCK_TIME    = 2 * 60 * 60 * 1000; // 2 hours

  if (this.loginAttempts + 1 >= MAX_ATTEMPTS && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + LOCK_TIME };
  }
  return this.updateOne(updates);
};

// ── Method: sanitize — strips sensitive fields before sending to client ────
UserSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.refreshTokenHash;
  delete obj.lockUntil;
  delete obj.loginAttempts;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
