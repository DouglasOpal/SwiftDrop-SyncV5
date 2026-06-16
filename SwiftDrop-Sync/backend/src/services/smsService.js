// src/services/smsService.js
// Pluggable SMS provider — Twilio (international), Termii (Nigeria), or mock.

const logger = require('../utils/logger');

// ── Twilio provider ───────────────────────────────────────────────────────────
async function sendViaTwilio(phone, message) {
  const twilio = require('twilio')(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const result = await twilio.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to:   phone.startsWith('+') ? phone : `+234${phone.replace(/^0/, '')}`,
  });

  return { provider: 'twilio', messageId: result.sid, status: result.status };
}

// ── Termii provider (Nigerian SMS gateway) ────────────────────────────────────
async function sendViaTermii(phone, message) {
  const axios = require('axios');

  const normalised = phone.startsWith('+')
    ? phone.replace('+', '')
    : `234${phone.replace(/^0/, '')}`;

  const { data } = await axios.post('https://api.ng.termii.com/api/sms/send', {
    to:       normalised,
    from:     process.env.TERMII_SENDER_ID || 'SwiftDrop',
    sms:      message,
    type:     'plain',
    channel:  'generic',
    api_key:  process.env.TERMII_API_KEY,
  });

  if (data.code !== 'ok') {
    throw new Error(`Termii error: ${data.message}`);
  }

  return { provider: 'termii', messageId: data.message_id, status: 'sent' };
}

// ── Mock provider (development / test) ───────────────────────────────────────
async function sendViaMock(phone, message, code) {
  logger.info(`[MOCK SMS] To: ${phone} | Message: ${message}`);
  logger.info(`[MOCK SMS] OTP Code: ${code}`);  // logged to console in dev only
  return { provider: 'mock', messageId: `mock_${Date.now()}`, status: 'sent' };
}

// ── OTP message template ──────────────────────────────────────────────────────
function buildOTPMessage(code, expiresMinutes = 10) {
  return (
    `Your SwiftDrop verification code is: ${code}. ` +
    `It expires in ${expiresMinutes} minutes. ` +
    `Never share this code with anyone.`
  );
}

// ── Main send function ────────────────────────────────────────────────────────
/**
 * Send an OTP SMS to the given phone number.
 *
 * @param {string} phone       - E.164 or local format
 * @param {string} code        - Plaintext OTP (only used by mock; others get the message)
 * @param {number} expiresMins - Expiry window for message copy
 * @returns {{ provider, messageId, status }}
 */
async function sendOTP(phone, code, expiresMins = 10) {
  const message  = buildOTPMessage(code, expiresMins);
  const provider = process.env.SMS_PROVIDER || 'mock';

  try {
    let result;
    if (provider === 'twilio') {
      result = await sendViaTwilio(phone, message);
    } else if (provider === 'termii') {
      result = await sendViaTermii(phone, message);
    } else {
      result = await sendViaMock(phone, message, code);
    }

    logger.info(`OTP sent to ${phone.slice(0, -4)}**** via ${result.provider}`);
    return { ...result, deliveryStatus: 'sent' };

  } catch (err) {
    logger.error(`SMS delivery failed for ${phone.slice(0, -4)}****: ${err.message}`);
    return {
      provider,
      messageId:     null,
      status:        'failed',
      deliveryStatus:'failed',
      error:          err.message,
    };
  }
}

/**
 * Send a generic transactional SMS (not OTP).
 * Used for delivery status updates, etc.
 */
async function sendSMS(phone, message) {
  const provider = process.env.SMS_PROVIDER || 'mock';
  try {
    if (provider === 'twilio') return await sendViaTwilio(phone, message);
    if (provider === 'termii') return await sendViaTermii(phone, message);
    return await sendViaMock(phone, message, null);
  } catch (err) {
    logger.error(`SMS failed: ${err.message}`);
    throw err;
  }
}

module.exports = { sendOTP, sendSMS };
