// src/middleware/validators.js
// express-validator rule sets for every auth endpoint.

const { body, validationResult } = require('express-validator');

// ── Shared runner ─────────────────────────────────────────────────────────────
const runValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors:  errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ── Phone normaliser (strips spaces, leading zeros etc.) ─────────────────────
const normalisePhone = (value) => {
  if (!value) return value;
  const digits = value.replace(/\D/g, '');
  // Convert 0XXXXXXXXXX to +234XXXXXXXXX
  if (digits.startsWith('0') && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }
  if (digits.startsWith('234') && digits.length === 13) {
    return `+${digits}`;
  }
  return `+${digits}`;
};

// ── Rule sets ─────────────────────────────────────────────────────────────────

const validateSendOTP = [
  body('phone')
    .notEmpty().withMessage('Phone number is required')
    .customSanitizer(normalisePhone)
    .matches(/^\+234[789]\d{9}$/)
    .withMessage('Enter a valid Nigerian phone number (e.g. 08012345678)'),

  body('userType')
    .isIn(['user', 'rider'])
    .withMessage('userType must be "user" or "rider"'),

  body('purpose')
    .optional()
    .isIn(['signin', 'signup', 'phone_verify'])
    .withMessage('Invalid purpose'),

  runValidation,
];

const validateVerifyOTP = [
  body('phone')
    .notEmpty().withMessage('Phone number is required')
    .customSanitizer(normalisePhone),

  body('code')
    .notEmpty().withMessage('Verification code is required')
    .isLength({ min: 6, max: 6 }).withMessage('Code must be exactly 6 digits')
    .isNumeric().withMessage('Code must contain only digits'),

  body('userType')
    .isIn(['user', 'rider'])
    .withMessage('userType must be "user" or "rider"'),

  body('purpose')
    .optional()
    .isIn(['signin', 'signup', 'phone_verify'])
    .withMessage('Invalid purpose'),

  runValidation,
];

const validateUpdateUserProfile = [
  body('fullName')
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 80 }).withMessage('Name must be 2–80 characters')
    .trim(),

  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage('Enter a valid email address')
    .normalizeEmail(),

  body('homeArea')
    .optional()
    .isLength({ max: 100 }).withMessage('Home area too long')
    .trim(),

  runValidation,
];

const validateRiderSignUp = [
  body('fullName')
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 80 }).withMessage('Name must be 2–80 characters')
    .trim(),

  body('phone')
    .notEmpty().withMessage('Phone number is required')
    .customSanitizer((value) => {
      if (!value) return value;
      const digits = value.replace(/\D/g, '');
      if (digits.startsWith('0') && digits.length === 11) return `+234${digits.slice(1)}`;
      if (digits.startsWith('234') && digits.length === 13) return `+${digits}`;
      if (!value.startsWith('+')) return `+${digits}`;
      return value;
    })
    .custom((value) => {
      if (!/^\+234[789]\d{9}$/.test(value)) {
        throw new Error('Enter a valid Nigerian phone number');
      }
      return true;
    }),

  body('plateNumber')
    .notEmpty().withMessage('Plate number is required')
    .trim(),

  body('bikeMake')
    .notEmpty().withMessage('Bike make is required')
    .trim(),

  body('bikeModel')
    .notEmpty().withMessage('Bike model is required')
    .trim(),

  body('bikeYear')
    .optional()
    .isInt({ min: 1990, max: new Date().getFullYear() + 1 })
    .withMessage('Enter a valid year')
    .toInt(),

  runValidation,
];

const validateRefreshToken = [
  body('refreshToken')
    .notEmpty().withMessage('Refresh token is required'),
  runValidation,
];

module.exports = {
  validateSendOTP,
  validateVerifyOTP,
  validateUpdateUserProfile,
  validateRiderSignUp,
  validateRefreshToken,
  runValidation,
  normalisePhone,
};
