// src/routes/authRoutes.js
// Mounts user and rider auth sub-routers at /api/v1/auth

const express     = require('express');
const multer      = require('multer');
const router      = express.Router();

const {
  sendUserOTP, verifyUserOTP, updateUserProfile,
  refreshUserToken, logoutUser, getMe,
} = require('../controllers/userAuthController');

const {
  registerRider, sendRiderOTP, verifyRiderOTP,
  uploadRiderDocument, getKYCStatus, getDocumentSignedUrl,
  refreshRiderToken, logoutRider, getRiderMe,
} = require('../controllers/riderAuthController');

const { protect, otpSendLimiter, otpVerifyLimiter } = require('../middleware/auth');

const {
  validateSendOTP,
  validateVerifyOTP,
  validateUpdateUserProfile,
  validateRiderSignUp,
  validateRefreshToken,
} = require('../middleware/validators');

// Multer: in-memory storage (we forward buffers directly to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|pdf/;
    const ok = allowed.test(file.mimetype) && allowed.test(file.originalname.split('.').pop());
    ok ? cb(null, true) : cb(new Error('Only JPEG, PNG, WebP, and PDF files are allowed'));
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// USER AUTH ROUTES          Base: /api/v1/auth/user
// ──────────────────────────────────────────────────────────────────────────────
const userRouter = express.Router();

/**
 * @route   POST /api/v1/auth/user/send-otp
 * @desc    Send OTP to phone number
 * @access  Public
 * @rateLimit 5 requests / 15 min per phone
 */
userRouter.post('/send-otp',
  otpSendLimiter,
  validateSendOTP,
  sendUserOTP
);

/**
 * @route   POST /api/v1/auth/user/verify-otp
 * @desc    Verify OTP and issue tokens (sign in or sign up)
 * @access  Public
 * @rateLimit 10 attempts / 15 min per phone
 */
userRouter.post('/verify-otp',
  otpVerifyLimiter,
  validateVerifyOTP,
  verifyUserOTP
);

/**
 * @route   PUT /api/v1/auth/user/profile
 * @desc    Save profile details after OTP sign-up
 * @access  Private (user)
 */
userRouter.put('/profile',
  protect,
  validateUpdateUserProfile,
  updateUserProfile
);

/**
 * @route   GET /api/v1/auth/user/me
 * @desc    Get the authenticated user's profile
 * @access  Private (user)
 */
userRouter.get('/me', protect, getMe);

/**
 * @route   POST /api/v1/auth/user/refresh
 * @desc    Rotate access + refresh tokens
 * @access  Semi-public (requires valid refresh token)
 */
userRouter.post('/refresh', validateRefreshToken, refreshUserToken);

/**
 * @route   POST /api/v1/auth/user/logout
 * @desc    Revoke refresh token and clear cookies
 * @access  Private (user)
 */
userRouter.post('/logout', protect, logoutUser);

// ──────────────────────────────────────────────────────────────────────────────
// RIDER AUTH ROUTES         Base: /api/v1/auth/rider
// ──────────────────────────────────────────────────────────────────────────────
const riderRouter = express.Router();

/**
 * @route   POST /api/v1/auth/rider/register
 * @desc    Step 1 — Submit personal + vehicle details
 * @access  Public
 */
riderRouter.post('/register',
  validateRiderSignUp,
  registerRider
);

/**
 * @route   POST /api/v1/auth/rider/send-otp
 * @desc    Step 3 — Send phone verification OTP (after doc upload)
 * @access  Public
 */
riderRouter.post('/send-otp',
  otpSendLimiter,
  validateSendOTP,
  sendRiderOTP
);

/**
 * @route   POST /api/v1/auth/rider/verify-otp
 * @desc    Step 3b — Verify OTP and issue tokens
 * @access  Public
 */
riderRouter.post('/verify-otp',
  otpVerifyLimiter,
  validateVerifyOTP,
  verifyRiderOTP
);

/**
 * @route   POST /api/v1/auth/rider/documents/:docType
 * @desc    Step 2 — Upload a KYC document (multipart/form-data)
 * @access  Public (account exists but not yet verified)
 * @param   docType: drivers_licence | bike_registration | selfie_with_id
 */
/**
 * @route   POST /api/v1/auth/rider/documents/:docType
 * @desc    Step 2 — Upload a KYC document using riderId (pre-token) or JWT
 * @access  Semi-public — accepts riderId in body if no JWT present
 * @param   docType: drivers_licence | bike_registration | selfie_with_id
 */
riderRouter.post('/documents/:docType',
  upload.single('document'),
  uploadRiderDocument   // controller handles auth: JWT or riderId-in-body
);

/**
 * @route   GET /api/v1/auth/rider/kyc-status
 * @desc    Get current KYC / approval status
 * @access  Private (rider)
 */
riderRouter.get('/kyc-status', protect, getKYCStatus);

/**
 * @route   GET /api/v1/auth/rider/document-url/:docType
 * @desc    Get a temporary signed URL for viewing a private KYC document
 * @access  Private (rider)
 */
riderRouter.get('/document-url/:docType', protect, getDocumentSignedUrl);

/**
 * @route   GET /api/v1/auth/rider/me
 * @desc    Get the authenticated rider's profile
 * @access  Private (rider)
 */
riderRouter.get('/me', protect, getRiderMe);

/**
 * @route   POST /api/v1/auth/rider/refresh
 * @desc    Rotate tokens
 * @access  Semi-public
 */
riderRouter.post('/refresh', validateRefreshToken, refreshRiderToken);

/**
 * @route   POST /api/v1/auth/rider/logout
 * @desc    Revoke refresh token and clear cookies
 * @access  Private (rider)
 */
riderRouter.post('/logout', protect, logoutRider);

// Mount sub-routers
router.use('/user',  userRouter);
router.use('/rider', riderRouter);

module.exports = router;
