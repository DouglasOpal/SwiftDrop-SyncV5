// tests/auth.test.js
// Integration tests for all user + rider auth endpoints.
// Uses mongodb-memory-server so no real MongoDB connection is needed.

const request  = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Set test env before loading app
process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_swiftdrop_2024';
process.env.SMS_PROVIDER = 'mock';

const app   = require('../src/app');
const User  = require('../src/models/User');
const Rider = require('../src/models/Rider');
const OTP   = require('../src/models/OTP');

let mongoServer;

// ── Setup / Teardown ──────────────────────────────────────────────────────────
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await User.deleteMany({});
  await Rider.deleteMany({});
  await OTP.deleteMany({});
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get a real OTP code for a phone number from the test DB.
 * In production the code is never returned from the server.
 */
async function getRealOTPCode(phone, purpose = 'signin') {
  // The code is hashed, but we can call createOTP which returns the raw code
  const { code } = await OTP.createOTP({ phone, userType: 'user', purpose });
  return code;
}

async function getRealRiderOTPCode(phone, purpose = 'phone_verify') {
  const { code } = await OTP.createOTP({ phone, userType: 'rider', purpose });
  return code;
}

// ──────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// ──────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/health', () => {
  it('returns 200 with service info', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.service).toBe('SwiftDrop Auth API');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// USER — SEND OTP
// ──────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/user/send-otp', () => {
  const phone = '+2348012345678';

  it('returns 404 for signin when no account exists', async () => {
    const res = await request(app)
      .post('/api/v1/auth/user/send-otp')
      .send({ phone, userType: 'user', purpose: 'signin' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('sends OTP successfully for signup', async () => {
    const res = await request(app)
      .post('/api/v1/auth/user/send-otp')
      .send({ phone, userType: 'user', purpose: 'signup' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isNewUser).toBe(true);
  });

  it('returns 400 for invalid phone number', async () => {
    const res = await request(app)
      .post('/api/v1/auth/user/send-otp')
      .send({ phone: '12345', userType: 'user', purpose: 'signup' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('returns 409 for signup when account already exists and is verified', async () => {
    await User.create({ phone, phoneVerified: true });
    const res = await request(app)
      .post('/api/v1/auth/user/send-otp')
      .send({ phone, userType: 'user', purpose: 'signup' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_REGISTERED');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// USER — VERIFY OTP
// ──────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/user/verify-otp', () => {
  const phone = '+2348012345678';

  it('creates a new user and returns tokens on valid signup OTP', async () => {
    const code = await getRealOTPCode(phone, 'signup');

    const res = await request(app)
      .post('/api/v1/auth/user/verify-otp')
      .send({ phone, code, userType: 'user', purpose: 'signup' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.phone).toBe(phone);

    // Verify user was created in DB
    const user = await User.findOne({ phone });
    expect(user).not.toBeNull();
    expect(user.phoneVerified).toBe(true);
  });

  it('returns 400 for wrong OTP code', async () => {
    await getRealOTPCode(phone, 'signup'); // create a valid OTP

    const res = await request(app)
      .post('/api/v1/auth/user/verify-otp')
      .send({ phone, code: '999999', userType: 'user', purpose: 'signup' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_INVALID');
  });

  it('signs in an existing user with valid OTP', async () => {
    await User.create({ phone, phoneVerified: true });
    const code = await getRealOTPCode(phone, 'signin');

    const res = await request(app)
      .post('/api/v1/auth/user/verify-otp')
      .send({ phone, code, userType: 'user', purpose: 'signin' });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(false);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects an expired OTP', async () => {
    // Create an already-expired OTP by patching expiresAt
    const otpRecord = await OTP.createOTP({ phone, userType: 'user', purpose: 'signup' });
    await OTP.updateOne({ _id: otpRecord.otpId }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app)
      .post('/api/v1/auth/user/verify-otp')
      .send({ phone, code: '000000', userType: 'user', purpose: 'signup' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_INVALID');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// USER — PROFILE UPDATE
// ──────────────────────────────────────────────────────────────────────────────
describe('PUT /api/v1/auth/user/profile', () => {
  const phone = '+2348012345678';
  let accessToken;

  beforeEach(async () => {
    const code = await getRealOTPCode(phone, 'signup');
    const res  = await request(app)
      .post('/api/v1/auth/user/verify-otp')
      .send({ phone, code, userType: 'user', purpose: 'signup' });
    accessToken = res.body.accessToken;
  });

  it('updates profile successfully', async () => {
    const res = await request(app)
      .put('/api/v1/auth/user/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Sunmisola Usman', homeArea: 'Ikeja, Lagos' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.fullName).toBe('Sunmisola Usman');
    expect(res.body.user.isProfileComplete).toBe(true);
  });

  it('rejects an invalid email format', async () => {
    const res = await request(app)
      .put('/api/v1/auth/user/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Sunmisola', email: 'not-an-email' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .put('/api/v1/auth/user/profile')
      .send({ fullName: 'Test User' });

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// USER — GET ME
// ──────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/auth/user/me', () => {
  const phone = '+2348012345678';

  it('returns user profile when authenticated', async () => {
    const code   = await getRealOTPCode(phone, 'signup');
    const verify = await request(app)
      .post('/api/v1/auth/user/verify-otp')
      .send({ phone, code, userType: 'user', purpose: 'signup' });

    const res = await request(app)
      .get('/api/v1/auth/user/me')
      .set('Authorization', `Bearer ${verify.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe(phone);
    expect(res.body.user.refreshTokenHash).toBeUndefined(); // must be stripped
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// USER — REFRESH TOKEN
// ──────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/user/refresh', () => {
  const phone = '+2348012345678';

  it('returns new tokens with a valid refresh token', async () => {
    const code   = await getRealOTPCode(phone, 'signup');
    const verify = await request(app)
      .post('/api/v1/auth/user/verify-otp')
      .send({ phone, code, userType: 'user', purpose: 'signup' });

    const refresh = await request(app)
      .post('/api/v1/auth/user/refresh')
      .send({ refreshToken: verify.body.refreshToken });

    expect(refresh.status).toBe(200);
    expect(refresh.body.accessToken).toBeDefined();
    expect(refresh.body.refreshToken).toBeDefined();
    // Should be a NEW token (rotation)
    expect(refresh.body.refreshToken).not.toBe(verify.body.refreshToken);
  });

  it('returns 401 with an invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/user/refresh')
      .send({ refreshToken: 'invalidtoken' });

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// USER — LOGOUT
// ──────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/user/logout', () => {
  const phone = '+2348012345678';

  it('logs out and revokes refresh token', async () => {
    const code   = await getRealOTPCode(phone, 'signup');
    const verify = await request(app)
      .post('/api/v1/auth/user/verify-otp')
      .send({ phone, code, userType: 'user', purpose: 'signup' });

    const logout = await request(app)
      .post('/api/v1/auth/user/logout')
      .set('Authorization', `Bearer ${verify.body.accessToken}`);

    expect(logout.status).toBe(200);
    expect(logout.body.success).toBe(true);

    // Refresh should now fail
    const refresh = await request(app)
      .post('/api/v1/auth/user/refresh')
      .send({ refreshToken: verify.body.refreshToken });

    expect(refresh.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// RIDER — REGISTER
// ──────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/rider/register', () => {
  const riderPayload = {
    fullName:    'Adewale Kolawole',
    phone:       '+2348034567890',
    plateNumber: 'LAG473KA',
    bikeMake:    'Honda',
    bikeModel:   'CB125F',
    bikeYear:    2022,
  };

  it('creates a rider in pending_documents status', async () => {
    const res = await request(app)
      .post('/api/v1/auth/rider/register')
      .send(riderPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('pending_documents');
    expect(res.body.riderId).toBeDefined();

    const rider = await Rider.findById(res.body.riderId);
    expect(rider).not.toBeNull();
    expect(rider.vehicle.plateNumber).toBe('LAG473KA');
  });

  it('prevents duplicate registration for same phone', async () => {
    await request(app).post('/api/v1/auth/rider/register').send(riderPayload);
    const res = await request(app).post('/api/v1/auth/rider/register').send(riderPayload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_REGISTERED');
  });

  it('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/auth/rider/register')
      .send({ phone: '+2348034567890' });

    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// RIDER — VERIFY OTP & KYC STATUS
// ──────────────────────────────────────────────────────────────────────────────
describe('Rider OTP + KYC flow', () => {
  const phone = '+2348034567890';

  beforeEach(async () => {
    await Rider.create({
      fullName: 'Adewale Kolawole',
      phone,
      vehicle:  { plateNumber: 'LAG473KA', make: 'Honda', model: 'CB125F' },
      status:   'pending_documents',
    });
  });

  it('verifies OTP and returns tokens', async () => {
    const code = await getRealRiderOTPCode(phone, 'phone_verify');
    const res  = await request(app)
      .post('/api/v1/auth/rider/verify-otp')
      .send({ phone, code, userType: 'rider', purpose: 'phone_verify' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();

    const rider = await Rider.findOne({ phone });
    expect(rider.phoneVerified).toBe(true);
  });

  it('returns KYC status for authenticated rider', async () => {
    const code   = await getRealRiderOTPCode(phone, 'phone_verify');
    const verify = await request(app)
      .post('/api/v1/auth/rider/verify-otp')
      .send({ phone, code, userType: 'rider', purpose: 'phone_verify' });

    const status = await request(app)
      .get('/api/v1/auth/rider/kyc-status')
      .set('Authorization', `Bearer ${verify.body.accessToken}`);

    expect(status.status).toBe(200);
    expect(status.body.documents).toHaveLength(3);
    expect(status.body.kycComplete).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 404 NOT FOUND
// ──────────────────────────────────────────────────────────────────────────────
describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
