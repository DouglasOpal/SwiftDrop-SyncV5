// src/config/database.js — fixed for Node.js v24
'use strict';

const mongoose = require('mongoose');
const logger   = require('../utils/logger');

let isConnected = false;

const connectDB = async (uri, attempt = 1) => {
  const dbUri    = uri || process.env.MONGO_URI;
  const MAX      = 5;
  const DELAY    = Math.min(1000 * 2 ** attempt, 30000);

  if (!dbUri) {
    throw new Error(
      'MONGO_URI is not set. Check your .env file in the backend folder.'
    );
  }

  try {
    await mongoose.connect(dbUri, {
      maxPoolSize:              10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS:          45000,
    });

    isConnected = true;
    logger.info(`MongoDB connected → ${mongoose.connection.host} (${mongoose.connection.name})`);

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('MongoDB disconnected');
    });
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB error: ' + err.message);
    });

  } catch (err) {
    logger.error(`MongoDB failed (attempt ${attempt}/${MAX}): ${err.message}`);

    if (attempt >= MAX) {
      logger.error('Could not connect to MongoDB after 5 attempts.');
      logger.error('Make sure MongoDB is running: net start MongoDB');
      process.exit(1);
    }

    logger.info(`Retrying in ${DELAY / 1000}s...`);
    await new Promise((res) => setTimeout(res, DELAY));
    return connectDB(dbUri, attempt + 1);
  }
};

const disconnectDB = async () => {
  if (isConnected) {
    await mongoose.connection.close();
    isConnected = false;
    logger.info('MongoDB connection closed');
  }
};

const getConnectionStatus = () => ({
  isConnected,
  readyState: mongoose.connection.readyState,
  host:       mongoose.connection.host,
  name:       mongoose.connection.name,
});

module.exports = { connectDB, disconnectDB, getConnectionStatus };