// src/app.js — fixed for Node.js v24 + Windows
'use strict';

const express        = require('express');
const helmet         = require('helmet');
const cors           = require('cors');
const morgan         = require('morgan');
const compression    = require('compression');
const mongoSanitize  = require('express-mongo-sanitize');
const cookieParser   = require('cookie-parser');
const hpp            = require('hpp');

const authRoutes     = require('./routes/authRoutes');
const adminRoutes    = require('./routes/adminRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const riderRoutes    = require('./routes/riderRoutes');
const { apiLimiter } = require('./middleware/auth');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const logger         = require('./utils/logger');

const app = express();

// Security headers
// Security headers — relaxed CSP for admin panel
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
// CORS
// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
// CORS — allow all origins in development
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Allow everything in development
  if (process.env.NODE_ENV !== 'production') {
    res.setHeader('Access-Control-Allow-Origin',  origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Device-ID,X-Rider-ID');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  }
  // Production — restrict to configured origins
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
  const ok = !origin || origin === 'null' || allowed.includes(origin) ||
             origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
  if (ok) {
    res.setHeader('Access-Control-Allow-Origin',  origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Device-ID,X-Rider-ID');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(ok ? 204 : 403);
  next();
});

// Parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Sanitise
app.use(mongoSanitize());
app.use(hpp());
app.use(compression());

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Rate limit
app.use('/api/', apiLimiter);

// Health check — test this first
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'SwiftDrop Auth API',
    version: '1.0.0',
    env:     process.env.NODE_ENV,
    time:    new Date().toISOString(),
  });
});
// Serve admin web app
// Serve admin panel
const path = require('path');
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin.html'));
});

// Root landing — the bare URL is not an API route, so point people to the
// admin panel and health check instead of returning a confusing 404.
app.get('/', (req, res) => {
  res.status(200).send(
    `<!doctype html><meta charset="utf-8"><title>SwiftDrop API</title>` +
    `<body style="font-family:system-ui,sans-serif;background:#0E1116;color:#F3F6FB;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">` +
    `<div style="text-align:center"><h1 style="color:#18C96C;margin:0 0 8px">SwiftDrop API</h1>` +
    `<p style="color:#9AA6B2;margin:0 0 20px">The server is running.</p>` +
    `<p><a href="/admin" style="color:#18C96C;font-weight:600;text-decoration:none">→ Open the admin panel</a></p>` +
    `<p><a href="/api/v1/health" style="color:#9AA6B2;text-decoration:none">Health check</a></p></div></body>`
  );
});

// Browsers auto-request /favicon.ico on every page load — answer quietly so it
// doesn't fall through to the JSON 404 handler and clutter the logs.
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Routes
app.use('/api/v1/auth',        authRoutes);
app.use('/api/v1/admin',       adminRoutes);
app.use('/api/v1/deliveries',  deliveryRoutes);
app.use('/api/v1/rider',       riderRoutes);

// 404
app.use(notFoundHandler);

// Global error handler
app.use(globalErrorHandler);

module.exports = app;