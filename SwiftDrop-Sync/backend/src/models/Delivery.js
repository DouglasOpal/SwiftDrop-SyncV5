// src/models/Delivery.js
// Full lifecycle of a single parcel delivery — from request to rating.

const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema({
  address:     { type: String, required: true, trim: true },
  area:        { type: String, trim: true, default: '' },
  lat:         { type: Number, required: true },
  lng:         { type: Number, required: true },
  landmark:    { type: String, trim: true, default: '' },
  contactName: { type: String, trim: true, default: '' },
  contactPhone:{ type: String, trim: true, default: '' },
  note:        { type: String, trim: true, default: '' },
}, { _id: false });

const DeliverySchema = new mongoose.Schema(
  {
    // ── Parties ───────────────────────────────────────────────────────────────
    sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true, index: true },
    rider:     { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', index: true },

    // ── Locations ─────────────────────────────────────────────────────────────
    pickup:   { type: LocationSchema, required: true },
    dropoff:  { type: LocationSchema, required: true },

    // ── Parcel ────────────────────────────────────────────────────────────────
    parcel: {
      size:          { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
      itemType:      { type: String, enum: ['clothing','food','medicine','device','documents','other'], default: 'other' },
      declaredValue: { type: Number, default: 0 },   // in kobo
      insured:       { type: Boolean, default: true },
      description:   { type: String, trim: true, maxlength: 200 },
    },

    // ── Pricing ───────────────────────────────────────────────────────────────
    // All monetary values are stored in kobo (1 Naira = 100 kobo).
    //   subtotal   = baseFee + distanceFee + insuranceFee   (the rider's earning)
    //   adminFee   = 30% markup on the subtotal               (platform revenue)
    //   totalFee   = subtotal + adminFee                      (what the customer pays)
    pricing: {
      baseFee:       { type: Number, default: 0 },
      distanceFee:   { type: Number, default: 0 },
      insuranceFee:  { type: Number, default: 0 },
      subtotal:      { type: Number, default: 0 },   // rider earning before markup
      adminFeeRate:  { type: Number, default: 0.30 },// 30% platform markup
      adminFee:      { type: Number, default: 0 },   // platform revenue
      riderEarning:  { type: Number, default: 0 },   // amount paid out to the rider
      totalFee:      { type: Number, default: 0 },   // customer-facing total
      currency:      { type: String, default: 'NGN' },
    },

    // ── Payment ───────────────────────────────────────────────────────────────
    payment: {
      method:     { type: String, enum: ['cash','transfer','card'], default: 'cash' },
      status:     { type: String, enum: ['pending','paid','failed','refunded'], default: 'pending' },
      reference:  { type: String },
      paidAt:     { type: Date },
    },

    // ── Status lifecycle ──────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ['pending','finding_rider','rider_assigned','rider_arrived','picked_up','in_transit','delivered','cancelled','failed'],
      default: 'pending',
      index:   true,
    },

    // ── Live rider location (for map tracking while the job is active) ─────────
    riderLocation: {
      lat:       { type: Number },
      lng:       { type: Number },
      heading:   { type: Number },   // optional compass bearing
      updatedAt: { type: Date },
    },

    // ── Pickup confirmation (OTP) ─────────────────────────────────────────────
    pickupOTP: {
      codeHash:  { type: String, select: false },
      expiresAt: { type: Date },
      verified:  { type: Boolean, default: false },
      verifiedAt:{ type: Date },
    },

    // ── Timestamps ────────────────────────────────────────────────────────────
    requestedAt:      { type: Date, default: Date.now },
    acceptedAt:       { type: Date },
    riderAssignedAt:  { type: Date },
    riderArrivedAt:   { type: Date },
    pickedUpAt:       { type: Date },
    deliveredAt:      { type: Date },
    cancelledAt:      { type: Date },
    cancelReason:     { type: String },

    // ── Ratings ───────────────────────────────────────────────────────────────
    senderRating: {
      score:    { type: Number, min: 1, max: 5 },
      tags:     [{ type: String }],
      comment:  { type: String, trim: true },
      ratedAt:  { type: Date },
    },
    riderRating: {
      score:    { type: Number, min: 1, max: 5 },
      comment:  { type: String, trim: true },
      ratedAt:  { type: Date },
    },

    // ── Distance & ETA ────────────────────────────────────────────────────────
    distanceKm:    { type: Number },
    estimatedMins: { type: Number },
    actualMins:    { type: Number },

    // ── Tracking reference ────────────────────────────────────────────────────
    trackingCode: { type: String, unique: true, sparse: true },
  },
  {
    timestamps: true,
    toJSON:  { virtuals: true },
    toObject:{ virtuals: true },
  }
);

DeliverySchema.index({ sender: 1, createdAt: -1 });
DeliverySchema.index({ rider:  1, createdAt: -1 });
DeliverySchema.index({ status: 1, createdAt: -1 });
DeliverySchema.index({ trackingCode: 1 }, { sparse: true });

// ── Virtual: duration in minutes ─────────────────────────────────────────────
DeliverySchema.virtual('durationMins').get(function () {
  if (!this.pickedUpAt || !this.deliveredAt) return null;
  return Math.round((this.deliveredAt - this.pickedUpAt) / 60000);
});

module.exports = mongoose.model('Delivery', DeliverySchema);
