// src/routes/adminRoutes.js
const express = require('express');
const router  = express.Router();
const {
  adminLogin, adminLogout, getDashboard,
  listRiders, getRiderDetail, reviewDocument,
  approveRider, rejectRider, suspendRider, reinstateRider,
  listUsers, deactivateUser,
} = require('../controllers/adminController');
const { protect, authorise } = require('../middleware/auth');
const { body } = require('express-validator');
const { runValidation } = require('../middleware/validators');
const {  getAnalytics, getAllDeliveries, getRiderDeliveryHistory } = require('../controllers/adminController');
// ── Admin login (public) ──────────────────────────────────────────────────────
router.post('/login', adminLogin);
router.post('/logout', protect, adminLogout);

// ── All routes below require admin JWT ───────────────────────────────────────
router.use(protect);
router.use((req, res, next) => {
  if (req.userType !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
});

router.get('/dashboard', getDashboard);

// Riders
router.get('/riders',          listRiders);
router.get('/riders/:riderId', getRiderDetail);
router.get('/riders/:riderId/deliveries', getRiderDeliveryHistory);

router.patch('/riders/:riderId/review-document',
  [
    body('docType').notEmpty().withMessage('docType required'),
    body('decision').isIn(['approved','rejected']).withMessage('decision must be approved or rejected'),
    runValidation,
  ],
  reviewDocument
);

router.patch('/riders/:riderId/approve',   approveRider);
router.patch('/riders/:riderId/reject',
  [ body('reason').notEmpty().withMessage('Rejection reason required'), runValidation ],
  rejectRider
);
router.patch('/riders/:riderId/suspend',
  [ body('reason').notEmpty().withMessage('Suspension reason required'), runValidation ],
  suspendRider
);
router.patch('/riders/:riderId/reinstate', reinstateRider);

// Users
router.get('/users',               listUsers);
router.patch('/users/:userId/deactivate', deactivateUser);

router.get('/analytics',  getAnalytics);
router.get('/deliveries', getAllDeliveries);


module.exports = router;
