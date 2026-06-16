// src/controllers/adminController.js
// Admin operations: login, KYC review, rider management, dashboard metrics.

const Admin    = require('../models/Admin');
const Rider    = require('../models/Rider');
const User     = require('../models/User');
const Delivery = require('../models/Delivery');
const { getSignedUrl } = require('../services/uploadService');
const { sendSMS }      = require('../services/smsService');
const {
  issueAccessToken,
  issueRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  setTokenCookies,
  clearTokenCookies,
} = require('../services/tokenService');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/admin/login
// Admin email + password login (admins don't use OTP).
// ─────────────────────────────────────────────────────────────────────────────
const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('Email and password are required.', 400);
  }

  // Stored emails are lowercased by the schema, so normalise the input to match
  const admin = await Admin.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');

  if (!admin || !(await admin.comparePassword(password))) {
    // Generic message — don't reveal whether email exists
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  if (!admin.isActive) {
    throw new AppError('Admin account has been deactivated.', 403);
  }

  await admin.updateOne({ lastLoginAt: new Date(), lastLoginIp: req.ip });

  const accessToken  = issueAccessToken(admin, 'admin');
  const refreshToken = await issueRefreshToken(admin, Admin);

  setTokenCookies(res, accessToken, refreshToken);
  logger.info(`Admin login: ${admin.email} [${admin.role}]`);

  res.status(200).json({
    success: true,
    message: 'Signed in successfully.',
    accessToken,
    refreshToken,
    admin: admin.toSafeObject(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/admin/logout
// ─────────────────────────────────────────────────────────────────────────────
const adminLogout = asyncHandler(async (req, res) => {
  if (req.userId) await revokeRefreshToken(req.userId, Admin);
  clearTokenCookies(res);
  res.status(200).json({ success: true, message: 'Signed out.' });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/admin/dashboard
// High-level platform metrics.
// ─────────────────────────────────────────────────────────────────────────────
const getDashboard = asyncHandler(async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    newUsersToday,
    totalRiders,
    pendingKYC,
    approvedRiders,
    totalDeliveries,
    deliveriesToday,
    activeDeliveries,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: todayStart } }),
    Rider.countDocuments(),
    Rider.countDocuments({ status: 'under_review' }),
    Rider.countDocuments({ status: 'approved' }),
    Delivery.countDocuments(),
    Delivery.countDocuments({ createdAt: { $gte: todayStart } }),
    Delivery.countDocuments({ status: { $in: ['finding_rider','rider_assigned','picked_up','in_transit'] } }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      users:     { total: totalUsers, newToday: newUsersToday },
      riders:    { total: totalRiders, pendingKYC, approved: approvedRiders },
      deliveries:{ total: totalDeliveries, today: deliveriesToday, active: activeDeliveries },
      timestamp: new Date(),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/admin/riders
// List all riders with filtering and pagination.
// ─────────────────────────────────────────────────────────────────────────────
const listRiders = asyncHandler(async (req, res) => {
  const {
    status,
    page  = 1,
    limit = 20,
    search,
    sortBy = 'createdAt',
    order  = 'desc',
  } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { phone:    { $regex: search, $options: 'i' } },
      { 'vehicle.plateNumber': { $regex: search, $options: 'i' } },
    ];
  }

  const skip  = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const sort  = { [sortBy]: order === 'asc' ? 1 : -1 };

  const [riders, total] = await Promise.all([
    Rider.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit, 10))
      .select('-refreshTokenHash'),
    Rider.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data:    riders,
    pagination: {
      total,
      page:    parseInt(page, 10),
      limit:   parseInt(limit, 10),
      pages:   Math.ceil(total / parseInt(limit, 10)),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/admin/riders/:riderId
// Full rider profile with signed document URLs.
// ─────────────────────────────────────────────────────────────────────────────
const getRiderDetail = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.params.riderId)
    .select('-refreshTokenHash')
    .populate('kycReviewedBy', 'fullName email');

  if (!rider) throw new AppError('Rider not found.', 404);

  // Attach fresh signed URLs for all uploaded documents
  const documentsWithUrls = await Promise.all(
    rider.documents.map(async (doc) => {
      const d = doc.toObject();
      if (d.s3Key && ['uploaded', 'approved'].includes(d.status)) {
        d.signedUrl = await getSignedUrl(d.s3Key, 60);
      }
      return d;
    })
  );

  res.status(200).json({
    success: true,
    data:    { ...rider.toSafeObject(), documents: documentsWithUrls },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/admin/riders/:riderId/review-document
// Approve or reject a single KYC document.
// Body: { docType, decision: 'approved'|'rejected', note? }
// ─────────────────────────────────────────────────────────────────────────────
const reviewDocument = asyncHandler(async (req, res) => {
  const { riderId }  = req.params;
  const { docType, decision, note } = req.body;

  const VALID_TYPES     = ['drivers_licence', 'bike_registration', 'selfie_with_id'];
  const VALID_DECISIONS = ['approved', 'rejected'];

  if (!VALID_TYPES.includes(docType)) {
    throw new AppError(`Invalid document type: ${docType}`, 400);
  }
  if (!VALID_DECISIONS.includes(decision)) {
    throw new AppError('Decision must be "approved" or "rejected".', 400);
  }

  const rider = await Rider.findById(riderId);
  if (!rider) throw new AppError('Rider not found.', 404);

  const docIndex = rider.documents.findIndex((d) => d.type === docType);
  if (docIndex < 0) throw new AppError(`Document of type "${docType}" not found.`, 404);

  rider.documents[docIndex].status     = decision;
  rider.documents[docIndex].reviewedAt = new Date();
  rider.documents[docIndex].reviewNote = note || null;
  rider.documents[docIndex].reviewedBy = req.userId;

  await rider.save();
  await Admin.updateOne({ _id: req.userId }, { $inc: { kycDecisionCount: 1 } });

  logger.info(`Doc review: rider=${riderId} doc=${docType} decision=${decision} admin=${req.userId}`);

  res.status(200).json({
    success:  true,
    message:  `Document ${decision}.`,
    docType,
    decision,
    kycComplete:  rider.kycComplete,
    kycApproved:  rider.kycApproved,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/admin/riders/:riderId/approve
// Approve the rider account after all KYC docs pass.
// ─────────────────────────────────────────────────────────────────────────────
const approveRider = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.params.riderId);
  if (!rider) throw new AppError('Rider not found.', 404);

  if (!rider.kycApproved) {
    throw new AppError(
      'Cannot approve rider — one or more KYC documents are not yet approved.',
      400,
      'KYC_INCOMPLETE'
    );
  }

  await rider.updateOne({
    status:       'approved',
    isActive:     true,
    kycApprovedAt:new Date(),
    approvedBy:   req.userId,
    $unset: { kycRejectedAt: 1, kycRejectedReason: 1 },
  });

  // Notify rider by SMS
  await sendSMS(
    rider.phone,
    `Congratulations ${rider.fullName.split(' ')[0]}! Your SwiftDrop rider account has been approved. You can now start accepting deliveries. Open the app to go online.`
  ).catch((err) => logger.warn(`SMS failed for approved rider ${rider._id}: ${err.message}`));

  logger.info(`Rider approved: ${rider._id} by admin ${req.userId}`);

  res.status(200).json({
    success: true,
    message: `Rider ${rider.fullName} has been approved.`,
    riderId: rider._id,
    status:  'approved',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/admin/riders/:riderId/reject
// Reject the application with a reason.
// Body: { reason }
// ─────────────────────────────────────────────────────────────────────────────
const rejectRider = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) throw new AppError('Rejection reason is required.', 400);

  const rider = await Rider.findById(req.params.riderId);
  if (!rider) throw new AppError('Rider not found.', 404);

  await rider.updateOne({
    status:             'rejected',
    isActive:           false,
    kycRejectedAt:      new Date(),
    kycRejectedReason:  reason.trim(),
    kycReviewedBy:      req.userId,
  });

  await sendSMS(
    rider.phone,
    `Hi ${rider.fullName.split(' ')[0]}, unfortunately your SwiftDrop rider application was not approved. Reason: ${reason}. Contact support for assistance.`
  ).catch((err) => logger.warn(`SMS failed for rejected rider ${rider._id}: ${err.message}`));

  logger.info(`Rider rejected: ${rider._id} reason="${reason}" admin=${req.userId}`);

  res.status(200).json({
    success: true,
    message: `Rider ${rider.fullName} application rejected.`,
    riderId: rider._id,
    status:  'rejected',
    reason,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/admin/riders/:riderId/suspend
// Temporarily suspend an approved rider.
// Body: { reason }
// ─────────────────────────────────────────────────────────────────────────────
const suspendRider = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) throw new AppError('Suspension reason is required.', 400);

  const rider = await Rider.findById(req.params.riderId);
  if (!rider) throw new AppError('Rider not found.', 404);
  if (rider.status === 'suspended') throw new AppError('Rider is already suspended.', 400);

  await rider.updateOne({
    status:        'suspended',
    isActive:      false,
    isOnline:      false,
    isAvailable:   false,
    suspendedBy:   req.userId,
    suspendReason: reason.trim(),
  });

  logger.warn(`Rider suspended: ${rider._id} reason="${reason}" admin=${req.userId}`);

  res.status(200).json({
    success: true,
    message: `Rider ${rider.fullName} has been suspended.`,
    reason,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/admin/riders/:riderId/reinstate
// Lift suspension and restore rider to approved status.
// ─────────────────────────────────────────────────────────────────────────────
const reinstateRider = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.params.riderId);
  if (!rider) throw new AppError('Rider not found.', 404);
  if (rider.status !== 'suspended') throw new AppError('Rider is not currently suspended.', 400);

  await rider.updateOne({
    status:    'approved',
    isActive:  true,
    $unset:    { suspendReason: 1, suspendedBy: 1 },
  });

  logger.info(`Rider reinstated: ${rider._id} by admin ${req.userId}`);

  res.status(200).json({ success: true, message: `Rider ${rider.fullName} reinstated.` });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/admin/users
// List all users with optional search + pagination.
// ─────────────────────────────────────────────────────────────────────────────
const listUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, isActive } = req.query;
  const filter = {};

  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { phone:    { $regex: search, $options: 'i' } },
      { email:    { $regex: search, $options: 'i' } },
    ];
  }
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .select('-refreshTokenHash'),
    User.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data:    users,
    pagination: {
      total,
      page:  parseInt(page, 10),
      limit: parseInt(limit, 10),
      pages: Math.ceil(total / parseInt(limit, 10)),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/admin/users/:userId/deactivate
// ─────────────────────────────────────────────────────────────────────────────
const deactivateUser = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const user = await User.findById(req.params.userId);
  if (!user) throw new AppError('User not found.', 404);

  await user.updateOne({ isActive: false });
  logger.warn(`User deactivated: ${user._id} admin=${req.userId} reason="${reason}"`);

  res.status(200).json({ success: true, message: `User ${user.phone} deactivated.` });
});

const getAnalytics = asyncHandler(async (req, res) => {
  const Delivery = require('../models/Delivery');
  const { period = '30' } = req.query;
  const days  = parseInt(period, 10) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const [revenueData, statusBreakdown, topRiders, recentDeliveries, allTime] = await Promise.all([
      Delivery.aggregate([
        { $match: { status: 'delivered', createdAt: { $gte: since } } },
        { $group: {
          _id:          { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue:      { $sum: '$pricing.totalFee' },
          platformFee:  { $sum: '$pricing.adminFee' },
          riderPayout:  { $sum: '$pricing.riderEarning' },
          count:        { $sum: 1 },
          avgFee:       { $avg: '$pricing.totalFee' },
        }},
        { $sort: { _id: 1 } },
      ]),
      Delivery.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Delivery.aggregate([
        { $match: { status: 'delivered', createdAt: { $gte: since } } },
        { $group: { _id: '$rider', totalEarned: { $sum: '$pricing.totalFee' }, trips: { $sum: 1 } } },
        { $sort: { totalEarned: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'riders', localField: '_id', foreignField: '_id', as: 'riderInfo' } },
      ]),
      Delivery.find({ createdAt: { $gte: since } })
        .sort({ createdAt: -1 }).limit(15)
        .populate('sender', 'fullName phone')
        .populate('rider',  'fullName phone vehicle'),
      Delivery.aggregate([
        { $match: { status: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$pricing.totalFee' }, platformFee: { $sum: '$pricing.adminFee' }, riderPayout: { $sum: '$pricing.riderEarning' }, count: { $sum: 1 } } },
      ]),
    ]);

    const periodRevenue    = revenueData.reduce((s, d) => s + d.revenue, 0);
    const periodPlatformFee = revenueData.reduce((s, d) => s + (d.platformFee || 0), 0);
    const periodRiderPayout = revenueData.reduce((s, d) => s + (d.riderPayout || 0), 0);
    const periodDeliveries = revenueData.reduce((s, d) => s + d.count, 0);

    res.status(200).json({
      success: true,
      data: {
        period: days,
        periodRevenue,
        periodPlatformFee,                 // platform's 30% markup income for the period
        periodRiderPayout,                 // total paid out to riders for the period
        periodDeliveries,
        avgFee:              periodDeliveries > 0 ? Math.round(periodRevenue / periodDeliveries) : 0,
        allTimeRevenue:      allTime[0]?.total || 0,
        allTimePlatformFee:  allTime[0]?.platformFee || 0,
        allTimeRiderPayout:  allTime[0]?.riderPayout || 0,
        allTimeDeliveries:   allTime[0]?.count || 0,
        dailyRevenue:        revenueData,
        statusBreakdown,
        topRiders,
        recentDeliveries,
      },
    });
  } catch (err) {
    logger.error('Analytics error: ' + err.message);
    res.status(500).json({ success: false, message: 'Analytics error: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/admin/riders/:riderId/deliveries
// Full delivery history for a single rider, with an earnings summary.
// ─────────────────────────────────────────────────────────────────────────────
const getRiderDeliveryHistory = asyncHandler(async (req, res) => {
  const Delivery = require('../models/Delivery');
  const mongoose = require('mongoose');
  const { riderId } = req.params;
  const { page = 1, limit = 30, status } = req.query;

  const rider = await Rider.findById(riderId).select('fullName phone vehicle stats bankAccount status');
  if (!rider) throw new AppError('Rider not found.', 404);

  const filter = { rider: riderId };
  if (status) filter.status = status;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [deliveries, total, summary] = await Promise.all([
    Delivery.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10))
      .populate('sender', 'fullName phone'),
    Delivery.countDocuments(filter),
    Delivery.aggregate([
      { $match: { rider: new mongoose.Types.ObjectId(riderId), status: 'delivered' } },
      { $group: {
        _id: null,
        completed:     { $sum: 1 },
        riderEarnings: { $sum: '$pricing.riderEarning' },
        platformFees:  { $sum: '$pricing.adminFee' },
        grossRevenue:  { $sum: '$pricing.totalFee' },
      } },
    ]),
  ]);

  res.status(200).json({
    success: true,
    rider:   rider.toSafeObject ? rider.toSafeObject() : rider,
    summary: summary[0] || { completed: 0, riderEarnings: 0, platformFees: 0, grossRevenue: 0 },
    data:    deliveries,
    pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), pages: Math.ceil(total / parseInt(limit, 10)) },
  });
});

const getAllDeliveries = asyncHandler(async (req, res) => {
  const Delivery = require('../models/Delivery');
  const { page = 1, limit = 30, status } = req.query;
  const filter = {};
  if (status) filter.status = status;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [deliveries, total] = await Promise.all([
    Delivery.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('sender', 'fullName phone')
      .populate('rider',  'fullName phone vehicle'),
    Delivery.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data:    deliveries,
    pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
  });
});


module.exports = {
  adminLogin,
  adminLogout,
  getDashboard,
  getAnalytics,
  getAllDeliveries,
  getRiderDeliveryHistory,
  listRiders,
  getRiderDetail,
  reviewDocument,
  approveRider,
  rejectRider,
  suspendRider,
  reinstateRider,
  listUsers,
  deactivateUser,
};
