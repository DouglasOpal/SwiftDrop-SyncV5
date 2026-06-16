// src/services/uploadService.js
const path   = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

const BUCKET = process.env.AWS_S3_BUCKET || 'swiftdrop-kyc-documents';

// Only initialise S3 if real credentials are present
const hasCredentials =
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_ACCESS_KEY_ID !== 'placeholder_not_used_in_dev' &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_SECRET_ACCESS_KEY !== 'placeholder_not_used_in_dev';

let s3 = null;

if (hasCredentials) {
  const AWS = require('aws-sdk');
  s3 = new AWS.S3({
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region:          process.env.AWS_REGION || 'eu-west-1',
  });
  logger.info('AWS S3 initialised');
} else {
  logger.warn('AWS credentials not set — document uploads will be saved locally in dev mode');
}

// Allowed file types
const ALLOWED = new Set(['image/jpeg','image/jpg','image/png','image/webp','application/pdf']);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function validateFile(file) {
  if (!ALLOWED.has(file.mimetype)) throw new Error('File type not allowed. Use JPEG, PNG, WebP or PDF.');
  if (file.size > MAX_SIZE) throw new Error('File too large. Maximum size is 10 MB.');
}

/**
 * Upload document — uses S3 in production, saves mock key in development.
 */
async function uploadDocument(buffer, { mimetype, originalname, riderId, docType }) {
  validateFile({ mimetype, size: buffer.length });

  const ext       = path.extname(originalname).toLowerCase() || '.jpg';
  const randomHex = crypto.randomBytes(16).toString('hex');
  const s3Key     = `kyc/${riderId}/${docType}/${randomHex}${ext}`;

  // Dev mode — skip real upload, return a mock key
  if (!s3) {
    logger.info(`[DEV] Mock document upload: ${s3Key}`);
    return {
      s3Key,
      s3Url:    `https://mock-s3.local/${s3Key}`,
      location: `https://mock-s3.local/${s3Key}`,
    };
  }

  // Production — upload to real S3
  const params = {
    Bucket:               BUCKET,
    Key:                  s3Key,
    Body:                 buffer,
    ContentType:          mimetype,
    ACL:                  'private',
    ServerSideEncryption: 'AES256',
    Metadata: {
      riderId,
      docType,
      uploadedAt: new Date().toISOString(),
    },
  };

  const result = await s3.upload(params).promise();
  logger.info(`Document uploaded to S3: ${s3Key}`);

  const signedUrl = await getSignedUrl(s3Key, 15);
  return { s3Key, s3Url: signedUrl, location: result.Location };
}

/**
 * Get a temporary pre-signed URL for viewing a private document.
 */
async function getSignedUrl(s3Key, expiresMinutes = 60) {
  if (!s3) return `https://mock-s3.local/${s3Key}`;
  return s3.getSignedUrlPromise('getObject', {
    Bucket:  BUCKET,
    Key:     s3Key,
    Expires: expiresMinutes * 60,
  });
}

/**
 * Delete a document from S3.
 */
async function deleteDocument(s3Key) {
  if (!s3) { logger.info(`[DEV] Mock delete: ${s3Key}`); return; }
  await s3.deleteObject({ Bucket: BUCKET, Key: s3Key }).promise();
  logger.info(`Document deleted from S3: ${s3Key}`);
}

module.exports = { uploadDocument, getSignedUrl, deleteDocument };