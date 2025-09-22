// src/utils/logger.ts
interface LogLevel {
  ERROR: 0;
  WARN: 1;
  INFO: 2;
  DEBUG: 3;
}

const LOG_LEVELS: LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  private level: number;

  constructor(level: keyof LogLevel = 'INFO') {
    this.level = LOG_LEVELS[level];
  }

  private log(level: keyof LogLevel, message: string, meta?: Record<string, any>) {
    if (LOG_LEVELS[level] <= this.level) {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level,
        message,
        ...meta
      };
      
      if (level === 'ERROR') {
        console.error(`[${timestamp}] ${level}: ${message}`, meta || '');
      } else if (level === 'WARN') {
        console.warn(`[${timestamp}] ${level}: ${message}`, meta || '');
      } else {
        console.log(`[${timestamp}] ${level}: ${message}`, meta || '');
      }
    }
  }

  error(message: string, meta?: Record<string, any>) {
    this.log('ERROR', message, meta);
  }

  warn(message: string, meta?: Record<string, any>) {
    this.log('WARN', message, meta);
  }

  info(message: string, meta?: Record<string, any>) {
    this.log('INFO', message, meta);
  }

  debug(message: string, meta?: Record<string, any>) {
    this.log('DEBUG', message, meta);
  }
}

export const logger = new Logger(process.env.LOG_LEVEL as keyof LogLevel || 'INFO');
