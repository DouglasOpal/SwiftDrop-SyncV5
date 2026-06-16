// src/controllers/riderController.js
// Authenticated rider operations: location heartbeat, online status,
// bank details, profile, earnings, and active-delivery lookup.

const Rider    = require('../models/Rider');
const Delivery = require('../models/Delivery');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const naira = (k) => `₦${((k || 0) / 100).toLocaleString('en-NG')}`;

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/rider/location   (heartbeat — keeps rider discoverable)
// Body: { lat, lng, heading? }
// ─────────────────────────────────────────────────────────────────────────────
const updateLocation = asyncHandler(async (req, res) => {
  const lat = parseFloat(req.body.lat), lng = parseFloat(req.body.lng);
  if (isNaN(lat) || isNaN(lng)) throw new AppError('Valid lat/lng required.', 400, 'INVALID_COORDS');

  await Rider.updateOne(
    { _id: req.userId },
    {
      currentLocation:   { type: 'Point', coordinates: [lng, lat] },
      locationUpdatedAt: new Date(),
      lastSeenAt:        new Date(),
    }
  );

  // If the rider has an active delivery, mirror the position onto it for live tracking
  await Delivery.updateOne(
    { rider: req.userId, status: { $in: ['rider_assigned','rider_arrived','picked_up','in_transit'] } },
    { riderLocation: { lat, lng, heading: parseFloat(req.body.heading) || 0, updatedAt: new Date() } }
  );

  res.status(200).json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/rider/status   (go online / offline)
// Body: { isOnline: bool }
// ─────────────────────────────────────────────────────────────────────────────
const setOnlineStatus = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.userId);
  if (!rider) throw new AppError('Rider not found.', 404);
  if (rider.status !== 'approved') {
    throw new AppError('Your account must be approved before going online.', 403, 'NOT_APPROVED');
  }

  const isOnline = req.body.isOnline === true || req.body.isOnline === 'true';

  // Don't flip to available if mid-delivery
  const onJob = await Delivery.exists({
    rider: req.userId,
    status: { $in: ['rider_assigned','rider_arrived','picked_up','in_transit'] },
  });

  await rider.updateOne({
    isOnline,
    isAvailable: isOnline && !onJob,
    lastSeenAt:  new Date(),
  });

  res.status(200).json({ success: true, isOnline, isAvailable: isOnline && !onJob });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/rider/bank   (set / update payout bank details)
// Body: { bankName, accountName, accountNumber, bankCode? }
// ─────────────────────────────────────────────────────────────────────────────
const updateBankDetails = asyncHandler(async (req, res) => {
  const { bankName, accountName, accountNumber, bankCode } = req.body;

  if (!bankName?.trim())    throw new AppError('Bank name is required.', 400);
  if (!accountName?.trim()) throw new AppError('Account name is required.', 400);
  if (!/^\d{10}$/.test(String(accountNumber || '').trim())) {
    throw new AppError('Account number must be exactly 10 digits.', 400, 'INVALID_ACCOUNT_NUMBER');
  }

  const rider = await Rider.findById(req.userId);
  if (!rider) throw new AppError('Rider not found.', 404);

  rider.bankAccount = {
    bankName:      bankName.trim(),
    accountName:   accountName.trim(),
    accountNumber: String(accountNumber).trim(),
    bankCode:      bankCode?.trim() || '',
    isVerified:    false,   // would be verified via a bank-resolve API in production
  };
  await rider.save();

  logger.info(`Rider ${req.userId} updated bank details (${bankName})`);
  res.status(200).json({ success: true, message: 'Bank details saved.', bankAccount: rider.bankAccount });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/rider/bank
// ─────────────────────────────────────────────────────────────────────────────
const getBankDetails = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.userId).select('bankAccount');
  if (!rider) throw new AppError('Rider not found.', 404);
  res.status(200).json({ success: true, bankAccount: rider.bankAccount || null });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/rider/profile
// ─────────────────────────────────────────────────────────────────────────────
const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, email, homeArea, expoPushToken, avatarUrl } = req.body;
  const updates = {};
  if (fullName)      updates.fullName      = fullName.trim();
  if (email)         updates.email         = email.toLowerCase().trim();
  if (homeArea)      updates.homeArea      = homeArea.trim();
  if (expoPushToken) updates.expoPushToken = expoPushToken;
  if (avatarUrl)     updates.avatarUrl     = avatarUrl;

  const rider = await Rider.findByIdAndUpdate(req.userId, updates, { new: true, runValidators: true });
  if (!rider) throw new AppError('Rider not found.', 404);
  res.status(200).json({ success: true, message: 'Profile updated.', rider: rider.toSafeObject() });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/rider/active   (the rider's current in-progress delivery, if any)
// ─────────────────────────────────────────────────────────────────────────────
const getActiveDelivery = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findOne({
    rider: req.userId,
    status: { $in: ['rider_assigned','rider_arrived','picked_up','in_transit'] },
  }).sort({ createdAt: -1 }).populate('sender', 'fullName phone');

  res.status(200).json({ success: true, data: delivery || null });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/rider/earnings   (summary + recent payouts)
// ─────────────────────────────────────────────────────────────────────────────
const getEarnings = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.userId).select('stats bankAccount');
  if (!rider) throw new AppError('Rider not found.', 404);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStart  = new Date(); weekStart.setDate(weekStart.getDate() - 7);

  const [today, week, recent] = await Promise.all([
    Delivery.aggregate([
      { $match: { rider: rider._id, status: 'delivered', deliveredAt: { $gte: todayStart } } },
      { $group: { _id: null, earned: { $sum: '$pricing.riderEarning' }, count: { $sum: 1 } } },
    ]),
    Delivery.aggregate([
      { $match: { rider: rider._id, status: 'delivered', deliveredAt: { $gte: weekStart } } },
      { $group: { _id: null, earned: { $sum: '$pricing.riderEarning' }, count: { $sum: 1 } } },
    ]),
    Delivery.find({ rider: rider._id, status: 'delivered' })
      .sort({ deliveredAt: -1 }).limit(20)
      .select('trackingCode pricing dropoff deliveredAt'),
  ]);

  res.status(200).json({
    success: true,
    data: {
      lifetime:   { earned: rider.stats.totalEarnings, text: naira(rider.stats.totalEarnings) },
      today:      { earned: today[0]?.earned || 0, count: today[0]?.count || 0, text: naira(today[0]?.earned || 0) },
      thisWeek:   { earned: week[0]?.earned  || 0, count: week[0]?.count  || 0, text: naira(week[0]?.earned  || 0) },
      completed:  rider.stats.completedDeliveries,
      rating:     rider.stats.averageRating,
      bankSet:    !!(rider.bankAccount && rider.bankAccount.accountNumber),
      recent:     recent.map((d) => ({
        id: d._id, code: d.trackingCode, to: d.dropoff?.address,
        earned: d.pricing.riderEarning, text: naira(d.pricing.riderEarning), at: d.deliveredAt,
      })),
    },
  });
});

module.exports = {
  updateLocation,
  setOnlineStatus,
  updateBankDetails,
  getBankDetails,
  updateProfile,
  getActiveDelivery,
  getEarnings,
};
