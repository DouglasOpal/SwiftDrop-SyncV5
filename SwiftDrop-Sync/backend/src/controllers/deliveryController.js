// src/controllers/deliveryController.js
// Full delivery lifecycle with proper user↔rider sync:
//   quote → request (finding_rider) → rider feed → accept → pickup OTP →
//   live location tracking → status updates → delivered (earning split) → rating.

const crypto   = require('crypto');
const Delivery = require('../models/Delivery');
const Rider    = require('../models/Rider');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// ── Pricing constants (kobo) ──────────────────────────────────────────────────
const BASE_FEES    = { small: 50000, medium: 80000, large: 150000 };
const PER_KM_RATE  = 20000;            // kobo per km
const INSURANCE    = 15000;            // flat insurance fee (kobo)
const ADMIN_MARKUP = 0.30;             // 30% platform markup on each delivery
const MIN_SUBTOTAL = 60000;            // floor so very short trips stay viable

// ── Pricing calculator — applies the 30% admin markup ─────────────────────────
// subtotal     = base + distance + insurance  → the rider's earning
// adminFee     = 30% of subtotal              → the platform's revenue
// totalFee     = subtotal + adminFee          → what the customer pays
function calculateFee({ distanceKm, size = 'medium', insured = true }) {
  const base        = BASE_FEES[size] || BASE_FEES.medium;
  const distanceFee = Math.round((Number(distanceKm) || 0) * PER_KM_RATE);
  const insuranceFee= insured ? INSURANCE : 0;

  let subtotal = base + distanceFee + insuranceFee;
  if (subtotal < MIN_SUBTOTAL) subtotal = MIN_SUBTOTAL;

  const adminFee     = Math.round(subtotal * ADMIN_MARKUP);
  const riderEarning = subtotal;                 // rider keeps the full subtotal
  const totalFee     = subtotal + adminFee;       // customer pays subtotal + markup

  return {
    baseFee:      base,
    distanceFee,
    insuranceFee,
    subtotal,
    adminFeeRate: ADMIN_MARKUP,
    adminFee,
    riderEarning,
    totalFee,
    currency:     'NGN',
  };
}

const naira = (kobo) => `₦${((kobo || 0) / 100).toLocaleString('en-NG')}`;

// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R  = 6371;
  const dL = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a  =
    Math.sin(dL / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateTrackingCode() {
  return 'SD' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Build a client-friendly pricing payload
function pricingPayload(p) {
  return {
    subtotal:     p.subtotal,
    adminFee:     p.adminFee,
    adminFeeRate: p.adminFeeRate,
    riderEarning: p.riderEarning,
    totalFee:     p.totalFee,
    breakdown:    p,
    display: {
      base:      naira(p.baseFee),
      distance:  naira(p.distanceFee),
      insurance: naira(p.insuranceFee),
      subtotal:  naira(p.subtotal),
      adminFee:  naira(p.adminFee),
      total:     naira(p.totalFee),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/deliveries/quote
// Returns a fee estimate WITHOUT creating a delivery (used by the request screen).
// ─────────────────────────────────────────────────────────────────────────────
const quoteDelivery = asyncHandler(async (req, res) => {
  const { pickup = {}, dropoff = {}, parcel = {} } = req.body;

  const pLat = parseFloat(pickup.lat), pLng = parseFloat(pickup.lng);
  const dLat = parseFloat(dropoff.lat), dLng = parseFloat(dropoff.lng);

  if ([pLat, pLng, dLat, dLng].some((n) => isNaN(n))) {
    throw new AppError('Valid pickup and dropoff coordinates are required.', 400, 'INVALID_COORDS');
  }

  const distanceKm    = haversine(pLat, pLng, dLat, dLng);
  const estimatedMins = Math.max(5, Math.round((distanceKm / 25) * 60) + 5);
  const pricing       = calculateFee({
    distanceKm,
    size:    parcel.size || 'medium',
    insured: parcel.insured !== false,
  });

  res.status(200).json({
    success:       true,
    distanceKm:    parseFloat(distanceKm.toFixed(2)),
    estimatedMins,
    pricing:       pricingPayload(pricing),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/deliveries
// User requests a new delivery → status becomes "finding_rider" so it appears
// in the rider job feed (proper user↔rider sync).
// ─────────────────────────────────────────────────────────────────────────────
const requestDelivery = asyncHandler(async (req, res) => {
  const { pickup, dropoff, parcel = {}, payment = {} } = req.body;

  const pLat = parseFloat(pickup?.lat), pLng = parseFloat(pickup?.lng);
  const dLat = parseFloat(dropoff?.lat), dLng = parseFloat(dropoff?.lng);

  if (isNaN(pLat) || isNaN(pLng)) {
    throw new AppError('Valid pickup coordinates are required.', 400, 'INVALID_PICKUP_COORDS');
  }
  if (isNaN(dLat) || isNaN(dLng)) {
    throw new AppError('Valid dropoff coordinates are required.', 400, 'INVALID_DROPOFF_COORDS');
  }
  if (!pickup?.address?.trim())  throw new AppError('Pickup address is required.', 400);
  if (!dropoff?.address?.trim()) throw new AppError('Dropoff address is required.', 400);

  const size      = parcel.size     || 'medium';
  const itemType  = parcel.itemType || 'other';
  const isInsured = parcel.insured  !== false;
  const method    = payment.method  || 'cash';

  const distanceKm    = haversine(pLat, pLng, dLat, dLng);
  const estimatedMins = Math.max(5, Math.round((distanceKm / 25) * 60) + 5);
  const pricing       = calculateFee({ distanceKm, size, insured: isInsured });

  const delivery = await Delivery.create({
    sender: req.userId,
    pickup: {
      address:      pickup.address.trim(),
      lat:          pLat, lng: pLng,
      contactName:  pickup.contactName  || '',
      contactPhone: pickup.contactPhone || '',
      note:         pickup.note         || '',
      area:         pickup.area         || '',
      landmark:     pickup.landmark     || '',
    },
    dropoff: {
      address:      dropoff.address.trim(),
      lat:          dLat, lng: dLng,
      contactName:  dropoff.contactName  || '',
      contactPhone: dropoff.contactPhone || '',
      note:         dropoff.note         || '',
      area:         dropoff.area         || '',
      landmark:     dropoff.landmark     || '',
    },
    parcel: {
      size, itemType,
      declaredValue: parseInt(parcel.declaredValue, 10) || 0,
      insured:       isInsured,
      description:   parcel.description || '',
    },
    payment:      { method },
    pricing,
    distanceKm:   parseFloat(distanceKm.toFixed(2)),
    estimatedMins,
    trackingCode: generateTrackingCode(),
    status:       'finding_rider',   // immediately visible to riders
  });

  logger.info(`Delivery created: ${delivery._id} by user ${req.userId} → finding_rider`);

  res.status(201).json({
    success:  true,
    message:  'Delivery request created. Finding you a rider…',
    delivery: {
      id:           delivery._id,
      trackingCode: delivery.trackingCode,
      status:       delivery.status,
      distanceKm:   delivery.distanceKm,
      estimatedMins,
      pricing:      pricingPayload(pricing),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/deliveries/:deliveryId/assign-rider
// Auto-match the nearest ONLINE + AVAILABLE approved rider.
// ─────────────────────────────────────────────────────────────────────────────
const assignRider = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.deliveryId);
  if (!delivery) throw new AppError('Delivery not found.', 404);

  if (!['pending', 'finding_rider'].includes(delivery.status)) {
    return res.status(400).json({
      success: false,
      message: `Delivery is already "${delivery.status}" — cannot re-assign.`,
    });
  }

  const lat = parseFloat(delivery.pickup.lat);
  const lng = parseFloat(delivery.pickup.lng);
  let rider = null;

  // 1. Nearest online + available approved rider (within 50km)
  try {
    if (!isNaN(lat) && !isNaN(lng)) {
      rider = await Rider.findOne({
        status: 'approved', isOnline: true, isAvailable: true,
        currentLocation: {
          $nearSphere: {
            $geometry:    { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: 50000,
          },
        },
      });
    }
  } catch (geoErr) {
    logger.warn('Geo query failed, falling back: ' + geoErr.message);
  }

  // 2. Any online + available approved rider
  if (!rider) rider = await Rider.findOne({ status: 'approved', isOnline: true, isAvailable: true });
  // 3. Any approved rider (last resort)
  if (!rider) rider = await Rider.findOne({ status: 'approved' });

  if (!rider) {
    return res.status(200).json({
      success: false,
      message: 'No riders available right now. Please try again shortly.',
      code:    'NO_RIDERS_AVAILABLE',
    });
  }

  await rider.updateOne({ isAvailable: false });
  await delivery.updateOne({
    rider:           rider._id,
    status:          'rider_assigned',
    riderAssignedAt: new Date(),
    acceptedAt:      new Date(),
  });

  logger.info(`Rider auto-assigned: ${rider._id} → delivery ${delivery._id}`);

  res.status(200).json({
    success: true,
    message: 'Rider assigned successfully.',
    rider: {
      id:       rider._id,
      fullName: rider.fullName,
      phone:    rider.phone,
      vehicle:  rider.vehicle,
      stats:    rider.stats,
      location: { lat: rider.currentLocation?.coordinates?.[1], lng: rider.currentLocation?.coordinates?.[0] },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/deliveries/available   (rider job feed — proper sync)
// Returns open jobs near the requesting rider, ordered by distance.
// ─────────────────────────────────────────────────────────────────────────────
const getAvailableDeliveries = asyncHandler(async (req, res) => {
  if (req.userType !== 'rider') throw new AppError('Rider account required.', 403);

  const rider = await Rider.findById(req.userId);
  if (!rider) throw new AppError('Rider not found.', 404);
  if (rider.status !== 'approved') {
    return res.status(200).json({ success: true, data: [], message: 'Account not yet approved.' });
  }

  const rLng = rider.currentLocation?.coordinates?.[0];
  const rLat = rider.currentLocation?.coordinates?.[1];

  const open = await Delivery.find({ status: 'finding_rider', rider: { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(40)
    .populate('sender', 'fullName phone');

  const jobs = open
    .map((d) => {
      const distanceToPickup = (rLat != null && rLng != null)
        ? parseFloat(haversine(rLat, rLng, d.pickup.lat, d.pickup.lng).toFixed(2))
        : null;
      return {
        id:            d._id,
        trackingCode:  d.trackingCode,
        createdAt:     d.createdAt,
        pickup:        { address: d.pickup.address, area: d.pickup.area, lat: d.pickup.lat, lng: d.pickup.lng },
        dropoff:       { address: d.dropoff.address, area: d.dropoff.area, lat: d.dropoff.lat, lng: d.dropoff.lng },
        parcel:        { size: d.parcel.size, itemType: d.parcel.itemType },
        distanceKm:    d.distanceKm,
        estimatedMins: d.estimatedMins,
        earning:       d.pricing.riderEarning,
        earningText:   naira(d.pricing.riderEarning),
        distanceToPickup,
        sender:        d.sender ? { name: d.sender.fullName } : null,
      };
    })
    .sort((a, b) => {
      if (a.distanceToPickup == null) return 1;
      if (b.distanceToPickup == null) return -1;
      return a.distanceToPickup - b.distanceToPickup;
    });

  res.status(200).json({ success: true, data: jobs, count: jobs.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/deliveries/:deliveryId/accept   (rider accepts a job)
// Atomic claim — only succeeds if the job is still unassigned.
// ─────────────────────────────────────────────────────────────────────────────
const acceptDelivery = asyncHandler(async (req, res) => {
  if (req.userType !== 'rider') throw new AppError('Rider account required.', 403);

  const rider = await Rider.findById(req.userId);
  if (!rider)                       throw new AppError('Rider not found.', 404);
  if (rider.status !== 'approved')  throw new AppError('Your account is not approved yet.', 403, 'NOT_APPROVED');

  // Atomically claim the delivery to prevent two riders grabbing the same job
  const delivery = await Delivery.findOneAndUpdate(
    { _id: req.params.deliveryId, status: 'finding_rider', rider: { $exists: false } },
    {
      rider:           rider._id,
      status:          'rider_assigned',
      riderAssignedAt: new Date(),
      acceptedAt:      new Date(),
      riderLocation: {
        lat: rider.currentLocation?.coordinates?.[1],
        lng: rider.currentLocation?.coordinates?.[0],
        updatedAt: new Date(),
      },
    },
    { new: true }
  ).populate('sender', 'fullName phone');

  if (!delivery) {
    return res.status(409).json({
      success: false,
      message: 'This job was just taken by another rider.',
      code:    'JOB_TAKEN',
    });
  }

  await rider.updateOne({ isAvailable: false });
  logger.info(`Rider ${rider._id} accepted delivery ${delivery._id}`);

  res.status(200).json({
    success:  true,
    message:  'Delivery accepted. Head to the pickup point.',
    delivery: {
      id:       delivery._id,
      status:   delivery.status,
      pickup:   delivery.pickup,
      dropoff:  delivery.dropoff,
      parcel:   delivery.parcel,
      earning:  naira(delivery.pricing.riderEarning),
      sender:   delivery.sender ? { name: delivery.sender.fullName, phone: delivery.sender.phone } : null,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/deliveries/:deliveryId/location   (rider pushes live location)
// Keeps the customer's map in sync during an active delivery.
// ─────────────────────────────────────────────────────────────────────────────
const updateDeliveryLocation = asyncHandler(async (req, res) => {
  const { lat, lng, heading } = req.body;
  const nLat = parseFloat(lat), nLng = parseFloat(lng);
  if (isNaN(nLat) || isNaN(nLng)) throw new AppError('Valid lat/lng required.', 400);

  const delivery = await Delivery.findById(req.params.deliveryId);
  if (!delivery) throw new AppError('Delivery not found.', 404);
  if (String(delivery.rider) !== String(req.userId)) throw new AppError('Not your delivery.', 403);

  await delivery.updateOne({
    riderLocation: { lat: nLat, lng: nLng, heading: parseFloat(heading) || 0, updatedAt: new Date() },
  });
  // Mirror onto the rider's global location so discovery stays fresh
  await Rider.updateOne(
    { _id: req.userId },
    { currentLocation: { type: 'Point', coordinates: [nLng, nLat] }, locationUpdatedAt: new Date(), lastSeenAt: new Date() }
  );

  res.status(200).json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/deliveries/:deliveryId/track-rider   (customer polls rider position)
// ─────────────────────────────────────────────────────────────────────────────
const getDeliveryRiderLocation = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.deliveryId)
    .select('sender rider status riderLocation pickup dropoff estimatedMins')
    .populate('rider', 'fullName phone vehicle currentLocation stats');
  if (!delivery) throw new AppError('Delivery not found.', 404);

  const isSender = String(delivery.sender) === String(req.userId);
  const isRider  = String(delivery.rider?._id) === String(req.userId);
  if (!isSender && !isRider && req.user?.role !== 'admin') throw new AppError('Access denied.', 403);

  const loc = delivery.riderLocation?.lat != null
    ? delivery.riderLocation
    : (delivery.rider?.currentLocation
        ? { lat: delivery.rider.currentLocation.coordinates[1], lng: delivery.rider.currentLocation.coordinates[0] }
        : null);

  res.status(200).json({
    success: true,
    status:  delivery.status,
    rider:   delivery.rider ? {
      name:    delivery.rider.fullName,
      phone:   delivery.rider.phone,
      vehicle: delivery.rider.vehicle,
      rating:  delivery.rider.stats?.averageRating,
    } : null,
    riderLocation: loc,
    pickup:  { lat: delivery.pickup.lat,  lng: delivery.pickup.lng,  address: delivery.pickup.address },
    dropoff: { lat: delivery.dropoff.lat, lng: delivery.dropoff.lng, address: delivery.dropoff.address },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/deliveries/:deliveryId/pickup-otp/generate  (sender generates PIN)
// ─────────────────────────────────────────────────────────────────────────────
const generatePickupOTP = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.deliveryId);
  if (!delivery) throw new AppError('Delivery not found.', 404);
  if (String(delivery.sender) !== String(req.userId)) throw new AppError('Access denied.', 403);
  if (!['rider_assigned', 'rider_arrived'].includes(delivery.status)) {
    throw new AppError('Pickup OTP can only be generated when a rider is assigned.', 400);
  }

  const code     = String(Math.floor(1000 + Math.random() * 9000));
  const codeHash = crypto.createHmac('sha256', process.env.JWT_SECRET).update(code).digest('hex');
  const expiresAt= new Date(Date.now() + 30 * 60 * 1000);

  await delivery.updateOne({
    'pickupOTP.codeHash': codeHash, 'pickupOTP.expiresAt': expiresAt, 'pickupOTP.verified': false,
  });

  const payload = { success: true, message: 'Pickup code generated. Share it with your rider only.', expiresAt };
  // The sender always sees their own pickup code in-app
  payload.code = code;
  res.status(200).json(payload);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/deliveries/:deliveryId/pickup-otp/verify  (rider confirms pickup)
// ─────────────────────────────────────────────────────────────────────────────
const verifyPickupOTP = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code || code.length !== 4) throw new AppError('Enter the 4-digit pickup code.', 400);

  const delivery = await Delivery.findById(req.params.deliveryId).select('+pickupOTP.codeHash');
  if (!delivery) throw new AppError('Delivery not found.', 404);
  if (String(delivery.rider) !== String(req.userId)) throw new AppError('This delivery is not assigned to you.', 403);
  if (delivery.pickupOTP?.verified) throw new AppError('Pickup has already been confirmed.', 400);
  if (!delivery.pickupOTP?.codeHash || delivery.pickupOTP.expiresAt < new Date()) {
    throw new AppError('Pickup code has expired. Ask the sender to generate a new one.', 400);
  }

  const hash = crypto.createHmac('sha256', process.env.JWT_SECRET).update(code).digest('hex');
  if (hash !== delivery.pickupOTP.codeHash) throw new AppError('Incorrect pickup code.', 400, 'WRONG_PICKUP_CODE');

  await delivery.updateOne({
    'pickupOTP.verified': true, 'pickupOTP.verifiedAt': new Date(),
    status: 'picked_up', pickedUpAt: new Date(),
  });

  logger.info(`Pickup confirmed: delivery=${delivery._id} rider=${req.userId}`);
  res.status(200).json({ success: true, message: 'Pickup confirmed. Head to the drop-off point.', status: 'picked_up' });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/deliveries/:deliveryId/status   (rider advances status)
// ─────────────────────────────────────────────────────────────────────────────
const updateDeliveryStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const delivery   = await Delivery.findById(req.params.deliveryId);
  if (!delivery) throw new AppError('Delivery not found.', 404);
  if (String(delivery.rider) !== String(req.userId)) throw new AppError('Access denied.', 403);

  const TRANSITIONS = {
    rider_assigned: ['rider_arrived', 'cancelled'],
    rider_arrived:  ['picked_up', 'cancelled'],
    picked_up:      ['in_transit'],
    in_transit:     ['delivered', 'failed'],
  };
  const allowed = TRANSITIONS[delivery.status];
  if (!allowed || !allowed.includes(status)) {
    throw new AppError(`Cannot transition from "${delivery.status}" to "${status}".`, 400, 'INVALID_TRANSITION');
  }

  const updates = { status };
  if (status === 'rider_arrived') updates.riderArrivedAt = new Date();
  if (status === 'in_transit')    updates.pickedUpAt     = delivery.pickedUpAt || new Date();

  if (status === 'delivered') {
    updates.deliveredAt = new Date();
    updates.actualMins  = delivery.pickedUpAt
      ? Math.round((Date.now() - delivery.pickedUpAt.getTime()) / 60000) : null;

    // Release the rider and credit ONLY their earning (subtotal, not the marked-up total)
    const earning = delivery.pricing.riderEarning || delivery.pricing.subtotal || 0;
    await Rider.updateOne(
      { _id: delivery.rider },
      {
        isAvailable: true,
        $inc: {
          'stats.completedDeliveries': 1,
          'stats.totalDeliveries':     1,
          'stats.totalEarnings':       earning,
          'stats.todayEarnings':       earning,
          'stats.thisWeekEarnings':    earning,
        },
      }
    );
  }

  if (status === 'cancelled' || status === 'failed') {
    updates.cancelledAt = new Date();
    if (req.body.reason) updates.cancelReason = req.body.reason;
    await Rider.updateOne(
      { _id: delivery.rider },
      { isAvailable: true, $inc: { 'stats.cancelledDeliveries': 1, 'stats.totalDeliveries': 1 } }
    );
  }

  await delivery.updateOne(updates);
  logger.info(`Delivery ${delivery._id} → ${status} (rider=${req.userId})`);
  res.status(200).json({ success: true, status, deliveryId: delivery._id });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/deliveries/:deliveryId
// ─────────────────────────────────────────────────────────────────────────────
const getDelivery = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.deliveryId)
    .populate('sender', 'fullName phone')
    .populate('rider',  'fullName phone vehicle stats currentLocation');
  if (!delivery) throw new AppError('Delivery not found.', 404);

  const isSender = String(delivery.sender._id) === String(req.userId);
  const isRider  = String(delivery.rider?._id) === String(req.userId);
  if (!isSender && !isRider && req.user?.role !== 'admin') throw new AppError('Access denied.', 403);

  res.status(200).json({ success: true, data: delivery });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/deliveries/track/:trackingCode   (public)
// ─────────────────────────────────────────────────────────────────────────────
const trackDelivery = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findOne({ trackingCode: req.params.trackingCode.toUpperCase() })
    .select('status trackingCode pickup dropoff parcel estimatedMins pickedUpAt deliveredAt rider riderLocation')
    .populate('rider', 'fullName vehicle');
  if (!delivery) throw new AppError('Tracking code not found.', 404);

  res.status(200).json({
    success: true,
    tracking: {
      code:    delivery.trackingCode,
      status:  delivery.status,
      pickup:  { address: delivery.pickup.address, lat: delivery.pickup.lat, lng: delivery.pickup.lng },
      dropoff: { address: delivery.dropoff.address, lat: delivery.dropoff.lat, lng: delivery.dropoff.lng },
      parcel:  { size: delivery.parcel.size, itemType: delivery.parcel.itemType },
      rider:   delivery.rider ? { name: delivery.rider.fullName, vehicle: delivery.rider.vehicle } : null,
      riderLocation: delivery.riderLocation?.lat != null ? delivery.riderLocation : null,
      timeline: { pickedUp: delivery.pickedUpAt, delivered: delivery.deliveredAt },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/deliveries/my   (works for both user senders and riders)
// ─────────────────────────────────────────────────────────────────────────────
const getMyDeliveries = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const filter = req.userType === 'rider' ? { rider: req.userId } : { sender: req.userId };
  if (status) filter.status = status;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [deliveries, total] = await Promise.all([
    Delivery.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10))
      .populate('rider',  'fullName phone vehicle stats')
      .populate('sender', 'fullName phone'),
    Delivery.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true, data: deliveries,
    pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/deliveries/:deliveryId/rate
// ─────────────────────────────────────────────────────────────────────────────
const rateDelivery = asyncHandler(async (req, res) => {
  const { score, tags = [], comment } = req.body;
  if (!score || score < 1 || score > 5) throw new AppError('Score must be between 1 and 5.', 400);

  const delivery = await Delivery.findById(req.params.deliveryId);
  if (!delivery) throw new AppError('Delivery not found.', 404);
  if (String(delivery.sender) !== String(req.userId)) throw new AppError('Only the sender can rate this delivery.', 403);
  if (delivery.status !== 'delivered') throw new AppError('Can only rate a completed delivery.', 400);
  if (delivery.senderRating?.score) throw new AppError('You have already rated this delivery.', 400);

  await delivery.updateOne({ senderRating: { score, tags, comment: comment?.trim(), ratedAt: new Date() } });

  if (delivery.rider) {
    const rider = await Rider.findById(delivery.rider);
    if (rider) {
      const newTotal = rider.stats.totalRatings + 1;
      const newAvg   = ((rider.stats.averageRating * rider.stats.totalRatings + score) / newTotal).toFixed(2);
      await rider.updateOne({ 'stats.averageRating': parseFloat(newAvg), 'stats.totalRatings': newTotal });
    }
  }

  res.status(200).json({ success: true, message: 'Rating submitted. Thank you!' });
});

module.exports = {
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
};
