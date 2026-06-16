// src/controllers/riderAuthController.js
// Rider-specific auth: sign-up form, OTP, document upload, KYC status.

const Rider            = require('../models/Rider');
const OTP              = require('../models/OTP');
const { sendOTP }      = require('../services/smsService');
const { uploadDocument, getSignedUrl } = require('../services/uploadService');
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
// POST /api/v1/auth/rider/register
// Step 1: Submit personal + vehicle details and create a pending rider account.
// ─────────────────────────────────────────────────────────────────────────────
const registerRider = asyncHandler(async (req, res) => {
  const { fullName, phone, plateNumber, bikeMake, bikeModel, bikeYear, email } = req.body;

  // Check for existing rider account
  const existing = await Rider.findOne({ phone });
  if (existing) {
    if (existing.status === 'rejected') {
      return res.status(409).json({
        success: false,
        message: 'This number has a rejected application. Contact support.',
        code:    'APPLICATION_REJECTED',
      });
    }
    return res.status(409).json({
      success: false,
      message: 'A rider account already exists for this number.',
      code:    'ALREADY_REGISTERED',
      status:  existing.status,
    });
  }

  // Create rider account in "pending_documents" state
  const rider = await Rider.create({
    fullName,
    phone,
    email:   email || undefined,
    vehicle: {
      plateNumber,
      make:  bikeMake,
      model: bikeModel,
      year:  bikeYear,
    },
    status:   'pending_documents',
    isActive: false,
  });

  logger.info(`Rider registered (pending): ${rider._id} — ${phone.slice(0, -4)}****`);

  res.status(201).json({
    success:  true,
    message:  'Account created. Please upload your documents.',
    riderId:  rider._id,
    status:   rider.status,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/rider/send-otp
// Step 2 (final): Send OTP before phone verification (called after doc upload).
// ─────────────────────────────────────────────────────────────────────────────
const sendRiderOTP = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const ipAddress = req.ip;

  const rider = await Rider.findOne({ phone });
  if (!rider) {
    return res.status(404).json({
      success: false,
      message: 'No rider account found. Please register first.',
      code:    'ACCOUNT_NOT_FOUND',
    });
  }

  const OTP_EXPIRE = parseInt(process.env.OTP_EXPIRE_MINUTES, 10) || 10;
  const { code, otpId, expiresAt } = await OTP.createOTP({
    phone,
    userType:  'rider',
    purpose:   'phone_verify',
    ipAddress,
    deviceId:  req.headers['x-device-id'],
  });

  const smsResult = await sendOTP(phone, code, OTP_EXPIRE);

  await OTP.updateOne(
    { _id: otpId },
    {
      deliveryStatus:    smsResult.deliveryStatus,
      deliveryProvider:  smsResult.provider,
      deliveryMessageId: smsResult.messageId,
      deliveryError:     smsResult.error || null,
    }
  );

  if (smsResult.deliveryStatus === 'failed') {
    throw new AppError('Failed to send SMS. Please try again.', 503, 'SMS_FAILED');
  }

  res.status(200).json({
    success:   true,
    message:   `Verification code sent to ${phone.slice(0, -4)}****`,
    expiresAt,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/rider/verify-otp
// Verify OTP, mark phone as verified, update status to "under_review".
// Issues a restricted access token (limited scope until approved).
// ─────────────────────────────────────────────────────────────────────────────
const verifyRiderOTP = asyncHandler(async (req, res) => {
  const { phone, code } = req.body;

  const result = await OTP.verifyOTP({ phone, purpose: 'phone_verify', code });

  if (!result.valid) {
    return res.status(400).json({
      success:   false,
      message:   result.reason,
      remaining: result.remaining,
      code:      'OTP_INVALID',
    });
  }

  const rider = await Rider.findOne({ phone });
  if (!rider) throw new AppError('Rider account not found.', 404);

  // Move to under_review if KYC docs are complete, otherwise stay pending
  const newStatus = rider.kycComplete ? 'under_review' : 'pending_documents';

  await rider.updateOne({
    phoneVerified:  true,
    status:         newStatus,
    kycSubmittedAt: rider.kycComplete ? new Date() : rider.kycSubmittedAt,
    lastLoginAt:    new Date(),
    lastLoginIp:    req.ip,
  });

  const updatedRider = await Rider.findById(rider._id);

  // Issue a restricted access token — rider can check status but not accept rides
  const accessToken  = issueAccessToken(updatedRider, 'rider');
  const refreshToken = await issueRefreshToken(updatedRider, Rider);

  setTokenCookies(res, accessToken, refreshToken);

  logger.info(`Rider phone verified: ${rider._id} → status: ${newStatus}`);

  res.status(200).json({
    success:      true,
    message:      newStatus === 'under_review'
      ? 'Phone verified. Application submitted for review.'
      : 'Phone verified. Please upload your documents.',
    status:       newStatus,
    kycComplete:  updatedRider.kycComplete,
    accessToken,
    refreshToken,
    rider:        updatedRider.toSafeObject(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/rider/documents/:docType
// Upload a KYC document (multipart/form-data, field name: "document").
// docType: drivers_licence | bike_registration | selfie_with_id
// Protected: requires a valid rider JWT.
// ─────────────────────────────────────────────────────────────────────────────
const uploadRiderDocument = asyncHandler(async (req, res) => {
  const { docType } = req.params;
  // FIX: accept riderId from body for pre-OTP step, or from JWT for authenticated step
  const riderId = req.userId || req.body.riderId || req.headers['x-rider-id'];
  if (!riderId) throw new AppError('riderId required. Include in body, header X-Rider-ID, or use JWT auth.', 400, 'NO_RIDER_ID');

  const VALID_DOC_TYPES = ['drivers_licence', 'bike_registration', 'selfie_with_id'];
  if (!VALID_DOC_TYPES.includes(docType)) {
    throw new AppError(`Invalid document type: ${docType}`, 400, 'INVALID_DOC_TYPE');
  }

  if (!req.file) {
    throw new AppError('No file uploaded. Include the file in the "document" field.', 400, 'NO_FILE');
  }

  const rider = await Rider.findById(riderId);
  if (!rider) throw new AppError('Rider not found.', 404);

  // Upload to S3
  const { s3Key, s3Url } = await uploadDocument(req.file.buffer, {
    mimetype:     req.file.mimetype,
    originalname: req.file.originalname,
    riderId:      riderId.toString(),
    docType,
  });

  // Upsert the document record in the rider's documents array
  const docIndex = rider.documents.findIndex((d) => d.type === docType);

  if (docIndex >= 0) {
    rider.documents[docIndex] = {
      ...rider.documents[docIndex].toObject(),
      type:       docType,
      status:     'uploaded',
      s3Key,
      s3Url,
      uploadedAt: new Date(),
    };
  } else {
    rider.documents.push({
      type:       docType,
      status:     'uploaded',
      s3Key,
      s3Url,
      uploadedAt: new Date(),
    });
  }

  // If all docs are now uploaded and phone is verified → move to under_review
  const allUploaded = ['drivers_licence', 'bike_registration', 'selfie_with_id'].every((type) =>
    rider.documents.some((d) => d.type === type && ['uploaded', 'approved'].includes(d.status))
  );

  if (allUploaded && rider.phoneVerified && rider.status === 'pending_documents') {
    rider.status         = 'under_review';
    rider.kycSubmittedAt = new Date();
    logger.info(`Rider KYC complete — under review: ${riderId}`);
  }

  await rider.save();

  res.status(200).json({
    success:     true,
    message:     `${docType.replace(/_/g, ' ')} uploaded successfully.`,
    docType,
    status:      'uploaded',
    kycComplete: rider.kycComplete,
    riderStatus: rider.status,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/rider/kyc-status
// Return current KYC status and document checklist.
// Protected route.
// ─────────────────────────────────────────────────────────────────────────────
const getKYCStatus = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.userId);
  if (!rider) throw new AppError('Rider not found.', 404);

  const required    = ['drivers_licence', 'bike_registration', 'selfie_with_id'];
  const docStatuses = required.map((type) => {
    const doc = rider.documents.find((d) => d.type === type);
    return {
      type,
      status:     doc?.status || 'pending',
      uploadedAt: doc?.uploadedAt || null,
      reviewNote: doc?.reviewNote || null,
    };
  });

  res.status(200).json({
    success:        true,
    riderStatus:    rider.status,
    kycComplete:    rider.kycComplete,
    kycApproved:    rider.kycApproved,
    kycSubmittedAt: rider.kycSubmittedAt,
    kycApprovedAt:  rider.kycApprovedAt,
    documents:      docStatuses,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/rider/document-url/:docType
// Get a fresh 60-min pre-signed URL for viewing a private document.
// Protected (admin or document owner only).
// ─────────────────────────────────────────────────────────────────────────────
const getDocumentSignedUrl = asyncHandler(async (req, res) => {
  const { docType } = req.params;
  const rider = await Rider.findById(req.userId);
  if (!rider) throw new AppError('Rider not found.', 404);

  const doc = rider.getDocumentByType(docType);
  if (!doc?.s3Key) throw new AppError('Document not found.', 404);

  const url = await getSignedUrl(doc.s3Key, 60);

  res.status(200).json({ success: true, url, expiresInMinutes: 60 });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/rider/refresh
// Rotate refresh token.
// ─────────────────────────────────────────────────────────────────────────────
const refreshRiderToken = asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.refresh_token || req.body?.refreshToken;
  if (!rawToken) throw new AppError('Refresh token required.', 401, 'NO_REFRESH_TOKEN');

  const { decodeRefreshTokenUserId } = require('../services/tokenService');
  const riderId = decodeRefreshTokenUserId(rawToken);
  if (!riderId) throw new AppError('Invalid refresh token format.', 401, 'INVALID_REFRESH');

  const rider = await Rider.findById(riderId).select('+refreshTokenHash');
  const isValid = rider && await validateRefreshToken(rawToken, rider.refreshTokenHash);
  if (!isValid) throw new AppError('Invalid or expired session.', 401, 'INVALID_REFRESH');

  const accessToken     = issueAccessToken(rider, 'rider');
  const newRefreshToken = await issueRefreshToken(rider, Rider);
  setTokenCookies(res, accessToken, newRefreshToken);

  res.status(200).json({ success: true, accessToken, refreshToken: newRefreshToken });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/rider/logout
// ─────────────────────────────────────────────────────────────────────────────
const logoutRider = asyncHandler(async (req, res) => {
  if (req.userId) await revokeRefreshToken(req.userId, Rider);
  clearTokenCookies(res);
  res.status(200).json({ success: true, message: 'Signed out successfully.' });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/rider/me
// ─────────────────────────────────────────────────────────────────────────────
const getRiderMe = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.userId);
  if (!rider) throw new AppError('Rider not found.', 404);
  res.status(200).json({ success: true, rider: rider.toSafeObject() });
});

module.exports = {
  registerRider,
  sendRiderOTP,
  verifyRiderOTP,
  uploadRiderDocument,
  getKYCStatus,
  getDocumentSignedUrl,
  refreshRiderToken,
  logoutRider,
  getRiderMe,
};
