// src/routes/riderRoutes.js — authenticated rider operations
const express = require('express');
const router  = express.Router();
const {
  updateLocation, setOnlineStatus, updateBankDetails, getBankDetails,
  updateProfile, getActiveDelivery, getEarnings,
} = require('../controllers/riderController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.use((req, res, next) => {
  if (req.userType !== 'rider') {
    return res.status(403).json({ success: false, message: 'Rider account required.' });
  }
  next();
});

router.patch('/location', updateLocation);
router.patch('/status',   setOnlineStatus);
router.put('/bank',       updateBankDetails);
router.get('/bank',       getBankDetails);
router.put('/profile',    updateProfile);
router.get('/active',     getActiveDelivery);
router.get('/earnings',   getEarnings);

module.exports = router;
