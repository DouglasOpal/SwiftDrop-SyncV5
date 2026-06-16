// src/routes/deliveryRoutes.js
const express = require('express');
const router  = express.Router();
const {
  quoteDelivery,
  requestDelivery,
  assignRider,
  getAvailableDeliveries,
  acceptDelivery,
  updateDeliveryLocation,
  getDeliveryRiderLocation,
  generatePickupOTP,
  verifyPickupOTP,
  updateDeliveryStatus,
  getDelivery,
  trackDelivery,
  getMyDeliveries,
  rateDelivery,
} = require('../controllers/deliveryController');
const { protect } = require('../middleware/auth');
const { body }    = require('express-validator');
const { runValidation } = require('../middleware/validators');

// ── Public tracking ───────────────────────────────────────────────────────────
router.get('/track/:trackingCode', trackDelivery);

// ── Everything below requires a JWT ──────────────────────────────────────────
router.use(protect);

// Fee quote (no delivery created)
router.post('/quote', quoteDelivery);

// Rider job feed + accept (proper sync)
router.get('/available',            getAvailableDeliveries);
router.post('/:deliveryId/accept',  acceptDelivery);

// Request a delivery
router.post('/',
  [
    body('pickup.address').notEmpty().withMessage('pickup.address is required'),
    body('pickup.lat').notEmpty().custom((v) => !isNaN(parseFloat(v))).withMessage('pickup.lat must be a number'),
    body('pickup.lng').notEmpty().custom((v) => !isNaN(parseFloat(v))).withMessage('pickup.lng must be a number'),
    body('dropoff.address').notEmpty().withMessage('dropoff.address is required'),
    body('dropoff.lat').notEmpty().custom((v) => !isNaN(parseFloat(v))).withMessage('dropoff.lat must be a number'),
    body('dropoff.lng').notEmpty().custom((v) => !isNaN(parseFloat(v))).withMessage('dropoff.lng must be a number'),
    runValidation,
  ],
  requestDelivery
);

// History (sender or rider)
router.get('/my', getMyDeliveries);

// Live tracking
router.patch('/:deliveryId/location',  updateDeliveryLocation);
router.get('/:deliveryId/track-rider', getDeliveryRiderLocation);

// Single delivery
router.get('/:deliveryId', getDelivery);

// Lifecycle
router.post('/:deliveryId/assign-rider',        assignRider);
router.post('/:deliveryId/pickup-otp/generate', generatePickupOTP);
router.post('/:deliveryId/pickup-otp/verify',
  [
    body('code').notEmpty().isLength({ min: 4, max: 4 }).isNumeric().withMessage('code must be 4 digits'),
    runValidation,
  ],
  verifyPickupOTP
);
router.patch('/:deliveryId/status',
  [ body('status').notEmpty().withMessage('status is required'), runValidation ],
  updateDeliveryStatus
);
router.post('/:deliveryId/rate',
  [ body('score').notEmpty().isInt({ min: 1, max: 5 }).withMessage('score must be between 1 and 5'), runValidation ],
  rateDelivery
);

module.exports = router;
