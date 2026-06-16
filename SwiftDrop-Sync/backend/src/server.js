// src/server.js — fixed for Node.js v24 + Windows
'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const http = require('http');
const fs   = require('fs');
const app  = require('./app');
const { connectDB, disconnectDB } = require('./config/database');
const logger = require('./utils/logger');

// Ensure logs directory exists
const logsDir = path.resolve(__dirname, '../logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const PORT   = parseInt(process.env.PORT, 10) || 5000;
const server = http.createServer(app);

async function start() {
  try {
    await connectDB();
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`SwiftDrop Auth API running on port ${PORT} [${process.env.NODE_ENV}]`);
      logger.info(`Health: http://localhost:${PORT}/api/v1/health`);
    });
  } catch (err) {
    logger.error(`Startup failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down...`);
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection: ' + reason);
  console.error(reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception: ' + err.message);
  console.error(err);
  process.exit(1);
});

start();