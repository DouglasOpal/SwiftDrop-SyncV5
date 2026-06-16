// src/middleware/errorHandler.js
// Centralised error handling — maps error types to HTTP status codes.

const logger = require('../utils/logger');

// ── asyncHandler — wraps async route handlers to catch unhandled rejections ──
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ── AppError — custom error class with status code ───────────────────────────
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode  = statusCode;
    this.code        = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── Error type handlers ───────────────────────────────────────────────────────

function handleCastError(err) {
  return new AppError(`Invalid ${err.path}: ${err.value}`, 400, 'INVALID_ID');
}

function handleDuplicateKeyError(err) {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const messages = {
    phone: `The phone number ${value} is already registered.`,
    email: `The email address ${value} is already in use.`,
  };
  return new AppError(messages[field] || `Duplicate value for ${field}.`, 409, 'DUPLICATE_FIELD');
}

function handleValidationError(err) {
  const messages = Object.values(err.errors).map((e) => e.message);
  return new AppError(messages.join('. '), 400, 'VALIDATION_ERROR');
}

function handleJWTExpiredError() {
  return new AppError('Session expired. Please sign in again.', 401, 'TOKEN_EXPIRED');
}

function handleJWTError() {
  return new AppError('Invalid authentication token.', 401, 'INVALID_TOKEN');
}

function handleMulterError(err) {
  const messages = {
    LIMIT_FILE_SIZE: 'File too large. Maximum size is 10 MB.',
    LIMIT_FILE_COUNT:'Too many files. Upload one at a time.',
    LIMIT_UNEXPECTED_FILE: 'Unexpected file field.',
  };
  return new AppError(messages[err.code] || err.message, 400, err.code);
}

// ── Global error middleware ───────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
const globalErrorHandler = (err, req, res, next) => {
  let error = { ...err, message: err.message };

  // Map known error types
  if (err.name === 'CastError')               error = handleCastError(err);
  if (err.code === 11000)                      error = handleDuplicateKeyError(err);
  if (err.name === 'ValidationError')          error = handleValidationError(err);
  if (err.name === 'TokenExpiredError')        error = handleJWTExpiredError();
  if (err.name === 'JsonWebTokenError')        error = handleJWTError();
  if (err.name === 'MulterError')              error = handleMulterError(err);

  const statusCode = error.statusCode || 500;

  console.log('❌ ERROR:', statusCode, error.message, JSON.stringify(err.errors || {}));
  const isDev      = process.env.NODE_ENV === 'development';


  // Log server errors
  if (statusCode >= 500) {
    logger.error(`${statusCode} — ${error.message}`, {
      url:    req.originalUrl,
      method: req.method,
      stack:  err.stack,
    });
  }

  // Response payload
  res.status(statusCode).json({
    success: false,
    message: error.message || 'An unexpected error occurred.',
    code:    error.code    || null,
    // Include stack trace in development only
    ...(isDev && { stack: err.stack }),
  });
};

// ── 404 handler — mount before globalErrorHandler ────────────────────────────
const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found.`, 404, 'NOT_FOUND'));
};

module.exports = { asyncHandler, AppError, globalErrorHandler, notFoundHandler };
