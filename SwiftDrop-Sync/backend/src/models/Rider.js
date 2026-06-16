// src/models/Rider.js
// Rider account model — includes full KYC, vehicle info, and earnings tracking.

const mongoose = require('mongoose');

// ── Sub-schema: KYC Document ──────────────────────────────────────────────────
const DocumentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['drivers_licence', 'bike_registration', 'selfie_with_id', 'nin', 'other'],
      required: true,
    },
    status: {
      type:    String,
      enum:    ['pending', 'uploaded', 'approved', 'rejected'],
      default: 'pending',
    },
    s3Key:      { type: String },      // S3 object key
    s3Url:      { type: String },      // Pre-signed or public URL
    uploadedAt: { type: Date },
    reviewedAt: { type: Date },
    reviewNote: { type: String },      // Rejection reason if any
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { _id: true, timestamps: false }
);

// ── Sub-schema: Vehicle ───────────────────────────────────────────────────────
const VehicleSchema = new mongoose.Schema(
  {
    plateNumber: { type: String, required: true, uppercase: true, trim: true },
    make:        { type: String, required: true, trim: true },    // e.g. Honda
    model:       { type: String, required: true, trim: true },    // e.g. CB125F
    year:        { type: Number, min: 2000, max: new Date().getFullYear() + 1 },
    color:       { type: String, trim: true },
    type:        { type: String, enum: ['motorcycle', 'bicycle', 'car', 'van'], default: 'motorcycle' },
  },
  { _id: false }
);

// ── Sub-schema: Bank Account (for payouts) ────────────────────────────────────
const BankAccountSchema = new mongoose.Schema(
  {
    bankName:      { type: String, trim: true },
    accountName:   { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    bankCode:      { type: String, trim: true }, // CBN bank code
    isVerified:    { type: Boolean, default: false },
  },
  { _id: false }
);

// ── Main Rider Schema ─────────────────────────────────────────────────────────
const RiderSchema = new mongoose.Schema(
  {
    // ── Core identity ─────────────────────────────────────────────────────────
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

    // ── Profile ───────────────────────────────────────────────────────────────
    fullName: {
      type:     String,
      required: [true, 'Full name is required'],
      trim:     true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type:      String,
      trim:      true,
      lowercase: true,
      sparse:    true,
      match:     [/^\S+@\S+\.\S+$/, 'Enter a valid email address'],
    },
    avatarUrl:    { type: String, default: null },
    homeArea:     { type: String, trim: true },
    currentLocation: {
      type:        { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [3.3792, 6.5244] }, // Lagos default [lng, lat]
    },
    locationUpdatedAt: { type: Date },   // freshness for rider discovery
    lastSeenAt:        { type: Date },   // last heartbeat / app activity

    // ── Account status ────────────────────────────────────────────────────────
    role:    { type: String, enum: ['rider', 'admin'], default: 'rider' },
    status: {
      type:    String,
      enum:    ['pending_documents', 'under_review', 'approved', 'suspended', 'rejected'],
      default: 'pending_documents',
      index:   true,
    },
    isActive:    { type: Boolean, default: false },  // true only after approval
    isOnline:    { type: Boolean, default: false },  // live availability toggle
    isAvailable: { type: Boolean, default: false },  // not on a delivery

    // ── KYC documents ─────────────────────────────────────────────────────────
    documents: {
      type:    [DocumentSchema],
      default: [],
    },
    kycSubmittedAt: { type: Date },
    kycApprovedAt:  { type: Date },
    kycRejectedAt:  { type: Date },
    kycRejectedReason: { type: String },
    kycReviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },

    // ── Vehicle ───────────────────────────────────────────────────────────────
    vehicle: VehicleSchema,

    // ── Bank account ──────────────────────────────────────────────────────────
    bankAccount: BankAccountSchema,

    // ── Performance stats ─────────────────────────────────────────────────────
    stats: {
      totalDeliveries:    { type: Number, default: 0 },
      completedDeliveries:{ type: Number, default: 0 },
      cancelledDeliveries:{ type: Number, default: 0 },
      totalEarnings:      { type: Number, default: 0 },   // in kobo
      thisWeekEarnings:   { type: Number, default: 0 },
      todayEarnings:      { type: Number, default: 0 },
      averageRating:      { type: Number, default: 0, min: 0, max: 5 },
      totalRatings:       { type: Number, default: 0 },
      completionRate:     { type: Number, default: 0 },   // percentage
    },

    // ── Auth & Security ───────────────────────────────────────────────────────
    refreshTokenHash: { type: String, select: false },
    lastLoginAt:      { type: Date },
    lastLoginIp:      { type: String },

    // ── Push notifications ────────────────────────────────────────────────────
    fcmToken:      { type: String, default: null },
    expoPushToken: { type: String, default: null },

    // ── Approval metadata ─────────────────────────────────────────────────────
    approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    rejectedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    suspendedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    suspendReason:{ type: String },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Geo index for proximity queries ──────────────────────────────────────────
RiderSchema.index({ currentLocation: '2dsphere' });
RiderSchema.index({ phone: 1 });
RiderSchema.index({ status: 1 });
RiderSchema.index({ isOnline: 1, isAvailable: 1 });

// ── Virtual: kycComplete ─────────────────────────────────────────────────────
RiderSchema.virtual('kycComplete').get(function () {
  const required = ['drivers_licence', 'bike_registration', 'selfie_with_id'];
  const uploaded = (this.documents || [])
    .filter((d) => ['uploaded', 'approved'].includes(d.status))
    .map((d) => d.type);
  return required.every((r) => uploaded.includes(r));
});

// ── Virtual: kycApproved ─────────────────────────────────────────────────────
RiderSchema.virtual('kycApproved').get(function () {
  const required = ['drivers_licence', 'bike_registration', 'selfie_with_id'];
  const approved = (this.documents || [])
    .filter((d) => d.status === 'approved')
    .map((d) => d.type);
  return required.every((r) => approved.includes(r));
});

// ── Method: getDocumentByType ─────────────────────────────────────────────────
RiderSchema.methods.getDocumentByType = function (type) {
  return (this.documents || []).find((d) => d.type === type) || null;
};

// ── Method: toSafeObject ─────────────────────────────────────────────────────
RiderSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.refreshTokenHash;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Rider', RiderSchema);