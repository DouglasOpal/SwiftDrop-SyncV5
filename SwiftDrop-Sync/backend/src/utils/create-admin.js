// src/utils/create-admin.js
// Create (or reset the password of) a single SwiftDrop admin account.
//
// Interactive:      node src/utils/create-admin.js
// Non-interactive:  ADMIN_EMAIL=you@swiftdrop.ng ADMIN_PASSWORD='Str0ng!pass' \
//                   ADMIN_NAME='Jane Doe' ADMIN_ROLE=super_admin node src/utils/create-admin.js
//
// The password is hashed by the Admin model's pre-save hook — never stored in plaintext.

const path     = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const readline = require('readline');
const mongoose = require('mongoose');
const Admin    = require('../models/Admin');

const ROLES = ['super_admin', 'kyc_reviewer', 'support'];
const EMAIL_RE = /^\S+@\S+\.\S+$/;

// ── Prompt helpers ────────────────────────────────────────────────────────────
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      process.stdout.write(question);
      rl._writeToOutput = () => {}; // suppress echo while typing the password
      rl.question('', (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
    } else {
      rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
    }
  });
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.MONGO_URI) {
    fail('MONGO_URI is not set. Add it to backend/.env (use the same value as Render/Atlas).');
  }

  const nonInteractive = !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);

  // 1. Gather inputs
  let email, password, fullName, role;

  if (nonInteractive) {
    email    = process.env.ADMIN_EMAIL.toLowerCase().trim();
    password = process.env.ADMIN_PASSWORD;
    fullName = (process.env.ADMIN_NAME || 'Admin').trim();
    role     = (process.env.ADMIN_ROLE || 'super_admin').trim();
  } else {
    email = (await ask('Admin email: ')).toLowerCase().trim();
    if (!EMAIL_RE.test(email)) fail('That does not look like a valid email address.');

    fullName = (await ask('Full name [Admin]: ')) || 'Admin';
    if (fullName.length > 80) fail('Full name must be 80 characters or fewer.');

    role = (await ask(`Role ${ROLES.join(' / ')} [super_admin]: `)) || 'super_admin';

    password = await ask('Password: ', { hidden: true });
    const confirm = await ask('Confirm password: ', { hidden: true });
    if (password !== confirm) fail('Passwords do not match. Nothing was changed.');
  }

  // 2. Validate
  if (!ROLES.includes(role)) fail(`Role must be one of: ${ROLES.join(', ')}`);
  if (!password || password.length < 8) fail('Password must be at least 8 characters.');
  if (password.length < 12 || !/[^A-Za-z0-9]/.test(password)) {
    console.warn('⚠ Weak password — 12+ characters with a symbol is strongly recommended for a public admin panel.');
  }

  // 3. Connect
  await mongoose.connect(process.env.MONGO_URI);
  console.log('• Connected to MongoDB');

  // 4. Create or update — setting passwordHash triggers the model's hashing hook
  const existing = await Admin.findOne({ email });

  if (existing) {
    if (!nonInteractive) {
      const yn = (await ask(`An admin with ${email} already exists. Reset its password? (y/N): `)).toLowerCase();
      if (yn !== 'y' && yn !== 'yes') { console.log('Cancelled — no changes made.'); return mongoose.disconnect(); }
    }
    existing.passwordHash = password; // pre-save hook hashes this
    existing.isActive = true;
    if (process.env.ADMIN_ROLE) existing.role = role;
    await existing.save();
    console.log(`\n✓ Password reset for existing admin: ${email} [${existing.role}]`);
  } else {
    const admin = await Admin.create({ fullName, email, passwordHash: password, role, isActive: true });
    console.log(`\n✓ Admin created: ${admin.email} [${admin.role}]`);
  }

  console.log('  You can now sign in at /admin with this email and password.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  // Surface Mongoose validation/duplicate errors clearly
  if (err && err.code === 11000) fail('An admin with that email already exists (duplicate key).');
  fail(err.message || String(err));
});
