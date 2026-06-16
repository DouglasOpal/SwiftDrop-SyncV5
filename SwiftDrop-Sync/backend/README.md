# SwiftDrop — Authentication Backend
> Node.js · Express · MongoDB · JWT · Twilio OTP · AWS S3

---

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI, Twilio keys, AWS keys, etc.

# 3. Start development server (hot reload)
npm run dev

# 4. Seed initial admin account
npm run seed

# 5. Run tests
npm test
```

### Using Docker (recommended)
```bash
# Start MongoDB + Redis + API server
docker compose up -d

# Start with Mongo Express GUI
docker compose --profile dev up -d

# View logs
docker compose logs -f api

# Seed inside container
docker compose exec api node src/utils/seed.js
```

### Seeded credentials
| Role        | Email                    | Password          |
|-------------|--------------------------|-------------------|
| Super Admin | admin@swiftdrop.ng       | SwiftDrop@2024!   |

> **Change this password immediately after first login.**

---

## Architecture

```
src/
├── server.js               Entry point + graceful shutdown
├── app.js                  Express factory (middleware, routes, error handlers)
├── config/
│   └── database.js         MongoDB connection + retry logic
├── models/
│   ├── User.js             Customer schema
│   ├── Rider.js            Rider schema + KYC subdocs + geo index
│   ├── OTP.js              OTP records (HMAC-hashed, TTL auto-delete)
│   ├── Admin.js            Admin accounts (bcrypt password)
│   └── Delivery.js         Full delivery lifecycle model
├── controllers/
│   ├── userAuthController.js
│   ├── riderAuthController.js
│   ├── adminController.js
│   └── deliveryController.js
├── routes/
│   ├── authRoutes.js       /api/v1/auth/user/* and /api/v1/auth/rider/*
│   ├── adminRoutes.js      /api/v1/admin/*
│   └── deliveryRoutes.js   /api/v1/deliveries/*
├── middleware/
│   ├── auth.js             JWT protect, role guard, rate limiters
│   ├── validators.js       express-validator rule sets
│   └── errorHandler.js     Global error handler + AppError class
├── services/
│   ├── smsService.js       Twilio / Termii / mock (swap via SMS_PROVIDER env)
│   ├── tokenService.js     JWT issue/verify + refresh token rotation + cookies
│   └── uploadService.js    AWS S3 private upload + pre-signed URL generation
└── utils/
    ├── logger.js           Winston (console + files)
    └── seed.js             DB seeder
```

---

## API Reference

**Base URL:** `http://localhost:5000/api/v1`

All authenticated routes require:
```
Authorization: Bearer <accessToken>
```
or the `access_token` HTTP-only cookie.

---

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | — | Service health check |

---

### User Authentication

| Method | Endpoint | Auth | Rate limit | Description |
|--------|----------|------|------------|-------------|
| POST | `/auth/user/send-otp` | — | 5/15min | Send OTP to phone |
| POST | `/auth/user/verify-otp` | — | 10/15min | Verify OTP → tokens |
| PUT | `/auth/user/profile` | ✓ user | — | Save profile after sign-up |
| GET | `/auth/user/me` | ✓ user | — | Get authenticated user |
| POST | `/auth/user/refresh` | — | — | Rotate access + refresh tokens |
| POST | `/auth/user/logout` | ✓ user | — | Revoke tokens |

#### POST `/auth/user/send-otp`
```json
{ "phone": "08012345678", "userType": "user", "purpose": "signup" }
```
`purpose`: `signup` | `signin`

#### POST `/auth/user/verify-otp`
```json
{ "phone": "08012345678", "code": "482910", "userType": "user", "purpose": "signup" }
```
Response:
```json
{
  "success": true,
  "isNewUser": true,
  "isProfileComplete": false,
  "accessToken": "eyJ...",
  "refreshToken": "a1b2c3...",
  "user": { "id": "...", "phone": "+2348012345678", ... }
}
```

#### PUT `/auth/user/profile`
```json
{ "fullName": "Sunmisola Usman", "email": "s@example.com", "homeArea": "Ikeja" }
```

---

### Rider Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/rider/register` | — | Step 1: Personal + vehicle form |
| POST | `/auth/rider/documents/:docType` | ✓ rider | Step 2: Upload KYC doc |
| POST | `/auth/rider/send-otp` | — | Step 3a: Send OTP |
| POST | `/auth/rider/verify-otp` | — | Step 3b: Verify OTP → tokens |
| GET | `/auth/rider/kyc-status` | ✓ rider | KYC checklist |
| GET | `/auth/rider/document-url/:docType` | ✓ rider | 60-min signed URL |
| GET | `/auth/rider/me` | ✓ rider | Get rider profile |
| POST | `/auth/rider/refresh` | — | Rotate tokens |
| POST | `/auth/rider/logout` | ✓ rider | Revoke tokens |

#### POST `/auth/rider/register`
```json
{
  "fullName":    "Adewale Kolawole",
  "phone":       "08034567890",
  "plateNumber": "LAG473KA",
  "bikeMake":    "Honda",
  "bikeModel":   "CB125F",
  "bikeYear":    2022
}
```

#### POST `/auth/rider/documents/:docType`
`docType`: `drivers_licence` | `bike_registration` | `selfie_with_id`

```
Content-Type: multipart/form-data
Field name: "document"
Max size: 10 MB
Formats: JPEG, PNG, WebP, PDF
```

#### Rider KYC flow
```
register → upload 3 docs → send-otp → verify-otp
                                        ↓
                               status: under_review
                                        ↓
                              admin approves each doc
                                        ↓
                              admin calls /approve
                                        ↓
                               status: approved
                               SMS sent to rider
```

#### Rider statuses
| Status | Meaning |
|--------|---------|
| `pending_documents` | Registered, docs not yet uploaded |
| `under_review` | All docs uploaded + phone verified |
| `approved` | KYC passed, can accept deliveries |
| `suspended` | Temporarily blocked by admin |
| `rejected` | Application rejected |

---

### Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/admin/login` | — | Email + password login |
| POST | `/admin/logout` | ✓ admin | Revoke admin tokens |
| GET | `/admin/dashboard` | ✓ admin | Platform metrics |
| GET | `/admin/riders` | ✓ admin | List riders (paginated, filterable) |
| GET | `/admin/riders/:id` | ✓ admin | Full rider detail + signed doc URLs |
| PATCH | `/admin/riders/:id/review-document` | ✓ admin | Approve/reject one KYC doc |
| PATCH | `/admin/riders/:id/approve` | ✓ admin | Approve rider account |
| PATCH | `/admin/riders/:id/reject` | ✓ admin | Reject application |
| PATCH | `/admin/riders/:id/suspend` | ✓ admin | Suspend rider |
| PATCH | `/admin/riders/:id/reinstate` | ✓ admin | Lift suspension |
| GET | `/admin/users` | ✓ admin | List users |
| PATCH | `/admin/users/:id/deactivate` | ✓ admin | Deactivate user |

#### PATCH `/admin/riders/:id/review-document`
```json
{ "docType": "drivers_licence", "decision": "approved", "note": "Clear and valid" }
```

---

### Deliveries

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/deliveries` | ✓ user | Request a delivery |
| GET | `/deliveries/my` | ✓ user | My delivery history |
| GET | `/deliveries/track/:code` | — | Public tracking by code |
| GET | `/deliveries/:id` | ✓ any | Get delivery details |
| POST | `/deliveries/:id/assign-rider` | ✓ | Find nearest rider |
| POST | `/deliveries/:id/pickup-otp/generate` | ✓ sender | Generate 4-digit pickup PIN |
| POST | `/deliveries/:id/pickup-otp/verify` | ✓ rider | Submit pickup PIN |
| PATCH | `/deliveries/:id/status` | ✓ rider | Update status |
| POST | `/deliveries/:id/rate` | ✓ sender | Rate rider (1-5 stars) |

#### Delivery status flow
```
pending → finding_rider → rider_assigned → rider_arrived
       → picked_up (after OTP) → in_transit → delivered
                                             ↘ failed
                              → cancelled (any stage)
```

---

## Security Model

| Feature | Implementation |
|---------|----------------|
| OTP storage | HMAC-SHA256 hashed, plaintext never stored |
| Refresh tokens | bcrypt-hashed, rotated on every use |
| Access tokens | JWT HS256, 30-day expiry |
| KYC documents | Private S3, AES-256 server-side encryption |
| Rate limiting | Per-phone for OTP (5 sends / 15 min) |
| HTTP security | Helmet, CORS, HPP, Mongo sanitize |
| Admin passwords | bcrypt, 12 rounds |
| Input validation | express-validator on every endpoint |
| Brute force | Login attempt counter + 2hr auto-lock |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | ✓ | MongoDB connection string |
| `JWT_SECRET` | ✓ | HS256 signing secret (min 32 chars) |
| `JWT_EXPIRE` | — | Access token TTL (default: `30d`) |
| `JWT_REFRESH_SECRET` | ✓ | Refresh token secret |
| `SMS_PROVIDER` | — | `twilio` \| `termii` \| `mock` |
| `TWILIO_ACCOUNT_SID` | if Twilio | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | if Twilio | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | if Twilio | Twilio sender number |
| `TERMII_API_KEY` | if Termii | Termii API key |
| `AWS_ACCESS_KEY_ID` | if S3 | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | if S3 | AWS secret key |
| `AWS_S3_BUCKET` | if S3 | S3 bucket name |
| `OTP_EXPIRE_MINUTES` | — | OTP TTL in minutes (default: 10) |
| `BCRYPT_SALT_ROUNDS` | — | bcrypt rounds (default: 12) |

---

## Running Tests

Tests use `mongodb-memory-server` — no real MongoDB connection needed.

```bash
npm test                 # run all tests
npm run test:watch       # watch mode
npx jest --coverage      # with coverage report
```

Test suite covers:
- Health check
- User OTP send (404 for unknown, 409 for duplicate, 400 for bad phone)
- User OTP verify (create account, wrong code, expired OTP, sign-in)
- Profile update (success, invalid email, no-auth 401)
- Refresh token rotation
- Logout + token revocation
- Rider registration (create, duplicate, validation)
- Rider OTP + KYC status
- 404 handler

---

*SwiftDrop Backend v1.0 · April 2026*
