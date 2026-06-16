// src/utils/seed.js
// Seed an initial super-admin, sample users/riders, and demo deliveries.
// Run:           node src/utils/seed.js
// Reset + seed:  node src/utils/seed.js --reset

require('dotenv').config();
const mongoose = require('mongoose');
const Admin    = require('../models/Admin');
const User     = require('../models/User');
const Rider    = require('../models/Rider');
const Delivery = require('../models/Delivery');
const logger   = require('./logger');

// Mirror the production pricing (base + distance + insurance, +30% admin markup)
function calcPricing(distanceKm, size = 'medium') {
  const BASE = { small: 50000, medium: 80000, large: 150000 }[size] || 80000;
  const distanceFee = Math.round(distanceKm * 20000);
  const insuranceFee = 15000;
  let subtotal = BASE + distanceFee + insuranceFee;
  if (subtotal < 60000) subtotal = 60000;
  const adminFee = Math.round(subtotal * 0.30);
  return { baseFee: BASE, distanceFee, insuranceFee, subtotal, adminFeeRate: 0.30, adminFee, riderEarning: subtotal, totalFee: subtotal + adminFee, currency: 'NGN' };
}

const SEED_ADMIN = {
  fullName: 'Super Admin', email: 'admin@swiftdrop.ng',
  passwordHash: 'SwiftDrop@2024!', role: 'super_admin', isActive: true,
};

const SEED_USERS = [
  { phone: '+2348012345678', phoneVerified: true, fullName: 'Sunmisola Usman', homeArea: 'Ikeja, Lagos' },
  { phone: '+2348023456789', phoneVerified: true, fullName: 'Chidi Okonkwo',   homeArea: 'Lekki, Lagos' },
];

const SEED_RIDERS = [
  {
    fullName: 'Adewale Kolawole', phone: '+2348034567890', phoneVerified: true,
    status: 'approved', isActive: true, isOnline: true, isAvailable: true,
    vehicle: { plateNumber: 'LAG473KA', make: 'Honda', model: 'CB125F', year: 2022, type: 'motorcycle' },
    currentLocation: { type: 'Point', coordinates: [3.3792, 6.5244] }, locationUpdatedAt: new Date(),
    bankAccount: { bankName: 'GTBank', accountName: 'Adewale Kolawole', accountNumber: '0123456789', bankCode: '058', isVerified: true },
    stats: { totalDeliveries: 1204, completedDeliveries: 1180, averageRating: 4.9, totalRatings: 950, totalEarnings: 0 },
    documents: [
      { type: 'drivers_licence',   status: 'approved', s3Key: 'kyc/seed/licence.jpg', uploadedAt: new Date() },
      { type: 'bike_registration', status: 'approved', s3Key: 'kyc/seed/reg.jpg',     uploadedAt: new Date() },
      { type: 'selfie_with_id',    status: 'approved', s3Key: 'kyc/seed/selfie.jpg',  uploadedAt: new Date() },
    ],
  },
  {
    fullName: 'Ngozi Bello', phone: '+2348056789012', phoneVerified: true,
    status: 'approved', isActive: true, isOnline: true, isAvailable: true,
    vehicle: { plateNumber: 'IKD884XY', make: 'Bajaj', model: 'Boxer', year: 2023, type: 'motorcycle' },
    currentLocation: { type: 'Point', coordinates: [3.4220, 6.4280] }, locationUpdatedAt: new Date(),
    stats: { totalDeliveries: 340, completedDeliveries: 332, averageRating: 4.8, totalRatings: 300, totalEarnings: 0 },
    documents: [
      { type: 'drivers_licence',   status: 'approved', s3Key: 'kyc/seed/n_licence.jpg', uploadedAt: new Date() },
      { type: 'bike_registration', status: 'approved', s3Key: 'kyc/seed/n_reg.jpg',     uploadedAt: new Date() },
      { type: 'selfie_with_id',    status: 'approved', s3Key: 'kyc/seed/n_selfie.jpg',  uploadedAt: new Date() },
    ],
  },
  {
    fullName: 'Emeka Eze', phone: '+2348045678901', phoneVerified: true,
    status: 'under_review', isActive: false,
    vehicle: { plateNumber: 'LAG512MK', make: 'Bajaj', model: 'Boxer', year: 2021, type: 'motorcycle' },
    currentLocation: { type: 'Point', coordinates: [3.4001, 6.4550] },
    documents: [
      { type: 'drivers_licence',   status: 'approved', s3Key: 'kyc/seed/emeka_licence.jpg', uploadedAt: new Date() },
      { type: 'bike_registration', status: 'uploaded', s3Key: 'kyc/seed/emeka_reg.jpg',     uploadedAt: new Date() },
      { type: 'selfie_with_id',    status: 'uploaded', s3Key: 'kyc/seed/emeka_selfie.jpg',  uploadedAt: new Date() },
    ],
  },
];

async function seedDeliveries(users, riders) {
  const approved = riders.filter((r) => r.status === 'approved');
  if (!approved.length || !users.length) return;
  if (await Delivery.countDocuments() > 0) { logger.info('Deliveries already exist — skipping'); return; }

  const ROUTES = [
    { pickup: { address: '12 Allen Avenue, Ikeja', area: 'Ikeja', lat: 6.5966, lng: 3.3515 }, dropoff: { address: '3 Admiralty Way, Lekki Phase 1', area: 'Lekki', lat: 6.4474, lng: 3.4699 }, km: 18.2 },
    { pickup: { address: 'Computer Village, Ikeja', area: 'Ikeja', lat: 6.5921, lng: 3.3420 }, dropoff: { address: 'Surulere Mall, Surulere', area: 'Surulere', lat: 6.4969, lng: 3.3540 }, km: 11.0 },
    { pickup: { address: 'Yaba Market, Yaba', area: 'Yaba', lat: 6.5095, lng: 3.3711 }, dropoff: { address: 'Victoria Island, Lagos', area: 'VI', lat: 6.4281, lng: 3.4219 }, km: 9.5 },
    { pickup: { address: 'Oshodi Interchange', area: 'Oshodi', lat: 6.5550, lng: 3.3410 }, dropoff: { address: 'Festac Town', area: 'Festac', lat: 6.4660, lng: 3.2840 }, km: 14.3 },
  ];
  const SIZES = ['small', 'medium', 'large'];

  const docs = [];
  for (let i = 0; i < 28; i++) {
    const route = ROUTES[i % ROUTES.length];
    const size  = SIZES[i % SIZES.length];
    const pricing = calcPricing(route.km, size);
    const daysAgo = i % 25;
    const created = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - (i * 37 * 60 * 1000));
    const delivered = i % 6 === 0 && i > 0;   // a few still active/cancelled
    const cancelled = i % 11 === 0 && i > 0;
    const rider = approved[i % approved.length];
    const status = cancelled ? 'cancelled' : (delivered ? 'in_transit' : 'delivered');

    docs.push({
      sender: users[i % users.length]._id,
      rider:  rider._id,
      pickup:  { ...route.pickup, contactName: 'Sender', contactPhone: '+2348010000000' },
      dropoff: { ...route.dropoff, contactName: 'Receiver', contactPhone: '+2348020000000' },
      parcel:  { size, itemType: 'other', insured: true, declaredValue: 500000 },
      payment: { method: 'cash', status: status === 'delivered' ? 'paid' : 'pending' },
      pricing, distanceKm: route.km, estimatedMins: Math.round(route.km / 25 * 60) + 5,
      trackingCode: 'SD' + (100000 + i).toString(16).toUpperCase(),
      status,
      createdAt: created,
      deliveredAt: status === 'delivered' ? new Date(created.getTime() + 45 * 60 * 1000) : undefined,
      cancelledAt: status === 'cancelled' ? new Date(created.getTime() + 10 * 60 * 1000) : undefined,
    });
  }

  const inserted = await Delivery.insertMany(docs);
  logger.info(`Seeded ${inserted.length} deliveries`);

  // Roll up rider earnings from delivered jobs
  for (const r of approved) {
    const agg = await Delivery.aggregate([
      { $match: { rider: r._id, status: 'delivered' } },
      { $group: { _id: null, earned: { $sum: '$pricing.riderEarning' }, count: { $sum: 1 } } },
    ]);
    await Rider.updateOne({ _id: r._id }, {
      'stats.totalEarnings':    agg[0]?.earned || 0,
      'stats.thisWeekEarnings': agg[0]?.earned || 0,
    });
  }
}

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('Connected to MongoDB');

    if (process.argv.includes('--reset')) {
      await Promise.all([Admin.deleteMany({}), User.deleteMany({}), Rider.deleteMany({}), Delivery.deleteMany({})]);
      logger.info('Collections cleared');
    }

    if (!(await Admin.findOne({ email: SEED_ADMIN.email }))) {
      await Admin.create(SEED_ADMIN);
      logger.info(`Admin created: ${SEED_ADMIN.email}`);
    }

    const users = [];
    for (const u of SEED_USERS) {
      let doc = await User.findOne({ phone: u.phone });
      if (!doc) doc = await User.create({ ...u, isProfileComplete: true });
      users.push(doc);
    }

    const riders = [];
    for (const r of SEED_RIDERS) {
      let doc = await Rider.findOne({ phone: r.phone });
      if (!doc) doc = await Rider.create(r);
      riders.push(doc);
    }

    await seedDeliveries(users, riders);

    logger.info('Seeding complete ✓');
    process.exit(0);
  } catch (err) {
    logger.error(`Seeding failed: ${err.message}`);
    process.exit(1);
  }
}

seed();
