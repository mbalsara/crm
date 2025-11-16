import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  serializers: {
    error: pino.stdSerializers.err,
  },
  base: {
    service: 'gmail-sync',
    env: process.env.NODE_ENV || 'development',
  },
});
