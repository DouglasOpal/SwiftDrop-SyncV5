# SwiftDrop — Full-Stack Delivery Platform (v3.0)
> React Native (Expo) · Node.js · Express · MongoDB · JWT · OTP · live user↔rider sync

---

## v3.0 — Rebuild & feature upgrade

This release regenerates the frontend from the ground up and upgrades the backend for
proper, real-time synchronization between senders, riders, and operations. The ten
requested upgrades and where each is implemented:

| # | Feature | Implementation |
|---|---------|----------------|
| 1 | Proper user ↔ rider sync | Delivery created as `finding_rider` → appears in the rider job feed (`GET /deliveries/available`); rider accepts atomically. `AvailableJobsScreen.js`, `deliveryController.js` |
| 2 | Rider location always updating (discovery) | Heartbeat pushes location while online (`PATCH /rider/location`); mirrored to `Rider.currentLocation` + `locationUpdatedAt`/`lastSeenAt`. `RiderHomeScreen.js`, `ActiveDeliveryScreen.js` |
| 3 | Functional assign screen for users | `FindingRiderScreen.js` polls + triggers `POST /deliveries/:id/assign-rider` (nearest-rider `$nearSphere` match), shows matched rider + pickup PIN |
| 4 | User & rider delivery tracking on map | `TrackingScreen.js` (user) + `ActiveDeliveryScreen.js` (rider) render `react-native-maps` with live rider marker via `GET /deliveries/:id/track-rider` |
| 5 | Admin access to a rider's delivery history | `GET /admin/riders/:riderId/deliveries` (paginated + earnings summary). Shown in the web panel rider drawer and `AdminHomeScreen.js` |
| 6 | Admin statistics dashboard | `GET /admin/analytics` returns revenue, **platform-fee vs rider-payout split**, and status breakdown. Web panel "Revenue Split" card + `AdminHomeScreen.js` |
| 7 | Rider navigation across all screens | Bottom-tab + nested stacks: Dashboard / Jobs / Earnings / Account. `AppNavigator.js` |
| 8 | Rider bank details | `PUT /rider/bank` with 10-digit validation. `BankDetailsScreen.js` |
| 9 | Optimized location picker w/ radius priority | `searchPlaces()` ranks in-radius matches first, then text relevance, then distance. `LocationPickerScreen.js`, `utils/places.js` |
| 10 | Delivery fee w/ 30% admin markup | `subtotal` (rider earning) + `adminFee = round(subtotal × 0.30)` = `totalFee` (customer pays). Rider is credited only the subtotal on delivery. `deliveryController.js`, breakdown shown in `CreateDeliveryScreen.js` |

### Pricing model (all amounts in kobo; ₦1 = 100 kobo)
```
base (small 500 / medium 800 / large 1500) + distance (₦200/km) + insurance (₦150)
  → subtotal  (floored at ₦600)               = rider earning
  → adminFee  = round(subtotal × 0.30)         = platform revenue (30% markup)
  → totalFee  = subtotal + adminFee            = what the customer pays
```

### Backend bug fixes (carried from v2.0)
| # | File | Bug | Fix |
|---|------|-----|-----|
| 1 | `userAuthController.js` | `user.reload()` — doesn't exist in Mongoose | Re-query with `User.findById()` after `updateOne` |
| 2 | `tokenService.js` + refresh controllers | Refresh scanned entire collection — O(n) security flaw | Embed `userId` in refresh JWT; lookup by ID — O(1) |
| 3 | `authRoutes.js` + `riderAuthController.js` | Document upload required JWT but riders have no token yet | Accept `riderId` from body/`X-Rider-ID` header as fallback |

### Rebuilt frontend (`frontend/src/`)
| Layer | Files |
|-------|-------|
| Config / theme | `config.js`, `theme/index.js` |
| Storage / API | `utils/storage.js`, `services/api.js` (token inject + auto-refresh) |
| Services | `authService.js`, `deliveryService.js`, `riderService.js`, `adminService.js` |
| Context | `context/AuthContext.js` (session restore, login, logout) |
| UI kit | `components/ui.js`, `components/MapPanel.js` (maps w/ web fallback) |
| Utilities | `utils/places.js` (radius-priority search, geocode, haversine) |
| Navigation | `navigation/AppNavigator.js` (auth-aware: User tabs / Rider tabs / Admin) |
| Auth screens | `screens/auth/` — RoleSelect, UserAuth, RiderAuth, AdminLogin |
| User screens | `screens/user/` — UserHome, LocationPicker, CreateDelivery, FindingRider, Tracking, History, UserProfile |
| Rider screens | `screens/rider/` — RiderHome, AvailableJobs, ActiveDelivery, Earnings, BankDetails, RiderProfile |
| Admin screen | `screens/admin/AdminHomeScreen.js` (full control panel served at `/admin`) |

---

## Quick Start

### 1. Backend
```bash
cd backend
cp .env.example .env         # fill in values
npm install
npm run seed                 # creates admin account + test data
npm run dev                  # starts on port 5000
```

**Seeded admin credentials:**
```
Email:    admin@swiftdrop.ng
Password: SwiftDrop@2024!
```

### 2. Frontend
```bash
cd frontend/SwiftDrop
npm install
```

**Set your API URL** in `src/services/api.js`:
```js
// Android emulator:
export const API_BASE_URL = 'http://10.0.2.2:5000/api/v1';

// iOS simulator:
export const API_BASE_URL = 'http://localhost:5000/api/v1';

// Physical device (use your computer's LAN IP):
export const API_BASE_URL = 'http://192.168.x.x:5000/api/v1';
```

```bash
npx expo start
# Press 'a' for Android, 'i' for iOS, scan QR for Expo Go
```

### 3. Docker (full stack)
```bash
cd backend
docker compose up -d                          # MongoDB + Redis + API
docker compose --profile dev up -d            # + Mongo Express GUI at :8081
docker compose exec api node src/utils/seed.js
```

---

## Project Structure

```
SwiftDrop-Sync/
│
├── backend/                        Node.js + Express + MongoDB
│   ├── src/
│   │   ├── config/database.js      MongoDB connection + retry
│   │   ├── models/
│   │   │   ├── User.js             Customer schema
│   │   │   ├── Rider.js            Rider + KYC + geo index
│   │   │   ├── OTP.js              HMAC-hashed OTPs with TTL
│   │   │   ├── Admin.js            Admin accounts (bcrypt)
│   │   │   └── Delivery.js         Full delivery lifecycle
│   │   ├── controllers/
│   │   │   ├── userAuthController.js   ← FIXED reload() bug
│   │   │   ├── riderAuthController.js  ← FIXED doc upload auth
│   │   │   ├── adminController.js
│   │   │   └── deliveryController.js
│   │   ├── routes/
│   │   │   ├── authRoutes.js       /api/v1/auth/user + /rider
│   │   │   ├── adminRoutes.js      /api/v1/admin
│   │   │   └── deliveryRoutes.js   /api/v1/deliveries
│   │   ├── middleware/
│   │   │   ├── auth.js             JWT guard + rate limiters
│   │   │   ├── validators.js       express-validator rules
│   │   │   └── errorHandler.js     Global error handler
│   │   └── services/
│   │       ├── smsService.js       Twilio / Termii / mock
│   │       ├── tokenService.js     ← FIXED refresh token logic
│   │       └── uploadService.js    AWS S3 private upload
│   └── tests/auth.test.js          20 integration tests
│
└── frontend/                       React Native (Expo ~54)
    ├── App.js                      Font loading + SplashScreen + AuthProvider
    └── src/
        ├── config.js               API base URL + poll cadences + default map region
        ├── context/AuthContext.js  Global auth state (user / rider / admin)
        ├── services/
        │   ├── api.js              Axios + auto-refresh interceptor
        │   ├── authService.js      Auth API calls
        │   ├── deliveryService.js  Delivery lifecycle API calls
        │   ├── riderService.js     Rider location / bank / earnings calls
        │   └── adminService.js     Dashboard / analytics / rider-history calls
        ├── utils/
        │   ├── storage.js          SecureStore wrapper
        │   └── places.js           Radius-priority search, geocode, haversine
        ├── navigation/AppNavigator.js  Auth-aware root navigator
        ├── screens/
        │   ├── auth/               RoleSelect, UserAuth, RiderAuth, AdminLogin
        │   ├── user/               UserHome, LocationPicker, CreateDelivery,
        │   │                       FindingRider, Tracking, History, UserProfile
        │   ├── rider/              RiderHome, AvailableJobs, ActiveDelivery,
        │   │                       Earnings, BankDetails, RiderProfile
        │   └── admin/AdminHomeScreen.js
        ├── components/
        │   ├── ui.js               Shared UI kit (Screen, Button, Field, Card…)
        │   └── MapPanel.js         react-native-maps wrapper (web-safe fallback)
        └── theme/index.js          Colors, typography, spacing, status meta
```

---

## Navigation Flow

```
App starts
  ├─ booting → Loader (restoring SecureStore session)
  │
  ├─ Not authenticated → AuthStack
  │    RoleSelect → { UserAuth | RiderAuth | AdminLogin }
  │      UserAuth:  phone → OTP → (profile if new) → User tabs
  │      RiderAuth: register → upload KYC docs → OTP → Rider tabs
  │      AdminLogin: email + password → Admin
  │
  ├─ type='user' → User tabs (Send / Orders / Profile)
  │    Send → UserHome → CreateDelivery (quote w/ 30% fee) → FindingRider
  │         → Tracking (live map, polls track-rider)
  │
  ├─ type='rider' → Rider tabs (Dashboard / Jobs / Earnings / Account)
  │    Dashboard: online toggle + location heartbeat (discovery)
  │    Jobs → accept → ActiveDelivery (arrive → verify PIN → in-transit → delivered)
  │    Account → RiderProfile → BankDetails
  │
  └─ type='admin' → AdminHome
       Revenue split + status breakdown + per-rider delivery history
       (full control panel served at backend /admin)
```

---

## API Reference (40 endpoints)

### Auth — User
| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/auth/user/send-otp` | Public (5/15min) |
| POST | `/auth/user/verify-otp` | Public |
| PUT  | `/auth/user/profile` | JWT user |
| GET  | `/auth/user/me` | JWT user |
| POST | `/auth/user/refresh` | Refresh token |
| POST | `/auth/user/logout` | JWT user |

### Auth — Rider
| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/auth/rider/register` | Public |
| POST | `/auth/rider/documents/:type` | riderId in body or JWT |
| POST | `/auth/rider/send-otp` | Public |
| POST | `/auth/rider/verify-otp` | Public |
| GET  | `/auth/rider/kyc-status` | JWT rider |
| GET  | `/auth/rider/document-url/:type` | JWT rider |
| GET  | `/auth/rider/me` | JWT rider |
| POST | `/auth/rider/refresh` | Refresh token |
| POST | `/auth/rider/logout` | JWT rider |

### Admin
| Method | Endpoint | Auth |
|--------|----------|------|
| POST  | `/admin/login` | Public |
| GET   | `/admin/dashboard` | JWT admin |
| GET   | `/admin/riders` | JWT admin |
| GET   | `/admin/riders/:id` | JWT admin |
| GET   | `/admin/riders/:riderId/deliveries` | JWT admin — **rider delivery history + earnings summary (feature 5)** |
| PATCH | `/admin/riders/:id/review-document` | JWT admin |
| PATCH | `/admin/riders/:id/approve` | JWT admin |
| PATCH | `/admin/riders/:id/reject` | JWT admin |
| PATCH | `/admin/riders/:id/suspend` | JWT admin |
| PATCH | `/admin/riders/:id/reinstate` | JWT admin |
| GET   | `/admin/users` | JWT admin |
| PATCH | `/admin/users/:id/deactivate` | JWT admin |
| GET   | `/admin/analytics` | JWT admin — **revenue, platform-fee/payout split, status breakdown (feature 6)** |
| GET   | `/admin/deliveries` | JWT admin |

### Rider (operations)
| Method | Endpoint | Auth |
|--------|----------|------|
| PATCH | `/rider/location` | JWT rider — location heartbeat (feature 2) |
| PATCH | `/rider/status` | JWT rider — online/offline |
| PUT   | `/rider/bank` | JWT rider — set bank details (feature 8) |
| GET   | `/rider/bank` | JWT rider |
| PUT   | `/rider/profile` | JWT rider |
| GET   | `/rider/active` | JWT rider — current in-progress delivery |
| GET   | `/rider/earnings` | JWT rider — today/week/lifetime + payouts |

### Deliveries
| Method | Endpoint | Auth |
|--------|----------|------|
| POST  | `/deliveries/quote` | JWT user — fee estimate w/ 30% breakdown (feature 10) |
| POST  | `/deliveries` | JWT user |
| GET   | `/deliveries/my` | JWT user or rider |
| GET   | `/deliveries/available` | JWT rider — open job feed (feature 1) |
| POST  | `/deliveries/:id/accept` | JWT rider — atomic claim |
| GET   | `/deliveries/track/:code` | Public |
| GET   | `/deliveries/:id` | JWT any |
| GET   | `/deliveries/:id/track-rider` | JWT — live rider location (feature 4) |
| PATCH | `/deliveries/:id/location` | JWT rider — push live location |
| POST  | `/deliveries/:id/assign-rider` | JWT — nearest-rider match (feature 3) |
| POST  | `/deliveries/:id/pickup-otp/generate` | JWT sender |
| POST  | `/deliveries/:id/pickup-otp/verify` | JWT rider |
| PATCH | `/deliveries/:id/status` | JWT rider |
| POST  | `/deliveries/:id/rate` | JWT sender |

---

## Security

| Feature | Implementation |
|---------|---------------|
| OTP storage | HMAC-SHA256 — plaintext never stored |
| Refresh tokens | bcrypt hashed + userId embedded in JWT for O(1) lookup |
| Access tokens | JWT HS256, 30-day expiry |
| KYC documents | Private S3, AES-256 server-side encryption |
| Rate limiting | Per-phone (5 OTP sends / 15 min) |
| HTTP hardening | Helmet, CORS, HPP, mongo-sanitize |
| Admin auth | bcrypt password, 12 rounds |
| Input validation | express-validator on every endpoint |
| Brute force | Login attempt counter + 2hr auto-lock |
| Client storage | expo-secure-store (AES encrypted on device) |

---

*SwiftDrop v2.0 — Synchronized build · April 2026*
