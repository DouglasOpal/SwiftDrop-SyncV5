// src/utils/logger.js — fixed for Windows
'use strict';

const path = require('path');
const { createLogger, format, transports } = require('winston');

const logsDir = path.resolve(__dirname, '../../logs');

const logFormat = format.printf(({ level, message, timestamp, stack }) => {
  return stack
    ? `${timestamp} [${level}]: ${message}\n${stack}`
    : `${timestamp} [${level}]: ${message}`;
});

const logger = createLogger({
  level:  process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.errors({ stack: true }),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize({ all: true }),
        format.errors({ stack: true }),
        format.timestamp({ format: 'HH:mm:ss' }),
        logFormat
      ),
      silent: process.env.NODE_ENV === 'test',
    }),
    new transports.File({
      filename: path.join(logsDir, 'error.log'),
      level:    'error',
      maxsize:  5242880,
      maxFiles: 5,
    }),
    new transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize:  10485760,
      maxFiles: 5,
    }),
  ],
});

module.exports = logger;