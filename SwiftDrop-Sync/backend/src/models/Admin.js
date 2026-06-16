// src/models/Admin.js
// Platform administrator account — manages KYC approvals, users, and riders.

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const AdminSchema = new mongoose.Schema(
  {
    fullName: {
      type:     String,
      required: [true, 'Full name is required'],
      trim:     true,
      maxlength: 80,
    },
    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
      match:     [/^\S+@\S+\.\S+$/, 'Enter a valid email'],
      index:     true,
    },
    passwordHash: {
      type:     String,
      required: true,
      select:   false,
    },
    role: {
      type:    String,
      enum:    ['super_admin', 'kyc_reviewer', 'support'],
      default: 'support',
    },
    isActive:     { type: Boolean, default: true },
    lastLoginAt:  { type: Date },
    lastLoginIp:  { type: String },
    refreshTokenHash: { type: String, select: false },

    // Audit trail of KYC decisions
    kycDecisionCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ── Hash password before save ─────────────────────────────────────────────────
AdminSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12);
  next();
});

// ── Compare submitted password ────────────────────────────────────────────────
AdminSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

AdminSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokenHash;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Admin', AdminSchema);
