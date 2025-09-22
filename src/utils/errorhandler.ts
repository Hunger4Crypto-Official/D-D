import { logger } from './logger.js';

export class BotError extends Error {
  public readonly code: string;
  public readonly userMessage: string;
  public readonly context?: Record<string, any>;
  public readonly isRetryable: boolean;

  constructor(
    message: string, 
    code: string = 'UNKNOWN_ERROR', 
    userMessage?: string,
    context?: Record<string, any>,
    isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'BotError';
    this.code = code;
    this.userMessage = userMessage || 'Something went wrong. Please try again.';
    this.context = context;
    this.isRetryable = isRetryable;
  }
}

export class ValidationError extends BotError {
  constructor(message: string, field?: string, value?: any) {
    super(
      message,
      'VALIDATION_ERROR',
      `Invalid input: ${message}`,
      { field, value },
      false
    );
  }
}

export class DatabaseError extends BotError {
  constructor(message: string, operation?: string, context?: Record<string, any>) {
    super(
      message,
      'DATABASE_ERROR',
      'Database operation failed. Please try again.',
      { operation, ...context },
      true
    );
  }
}

export class DiscordAPIError extends BotError {
  constructor(message: string, statusCode?: number, context?: Record<string, any>) {
    super(
      message,
      'DISCORD_API_ERROR',
      'Discord API error. Please try again.',
      { statusCode, ...context },
      statusCode ? statusCode >= 500 : true
    );
  }
}

export class GameStateError extends BotError {
  constructor(message: string, runId?: string, userId?: string) {
    super(
      message,
      'GAME_STATE_ERROR',
      'Game state error. Please try again or restart your game.',
      { runId, userId },
      false
    );
  }
}

export class PermissionError extends BotError {
  constructor(message: string, requiredPermission?: string, userId?: string) {
    super(
      message,
      'PERMISSION_ERROR',
      'You do not have permission to perform this action.',
      { requiredPermission, userId },
      false
    );
  }
}

export class RateLimitError extends BotError {
  constructor(message: string, retryAfter?: number, userId?: string) {
    super(
      message,
      'RATE_LIMIT_ERROR',
      `Rate limit exceeded. Please try again${retryAfter ? ` in ${retryAfter} seconds` : ' later'}.`,
      { retryAfter, userId },
      true
    );
  }
}

// Error handler wrapper for async functions
export function handleAsyncError<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: string
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      logger.error('Async operation failed', { 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        context,
        args: args.length > 0 ? args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg) : undefined
      });
      throw error;
    }
  }) as T;
}

// Safe JSON parsing
export function safeJsonParse<T = any>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch (error) {
    logger.warn('JSON parse failed', {
      json: json.slice(0, 100),
      error: error instanceof Error ? error.message : error
    });
    return fallback;
  }
}

// Promise timeout wrapper
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage?: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

// Retry wrapper with exponential backoff
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  shouldRetry?: (error: any) => boolean
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry this error
      if (shouldRetry && !shouldRetry(error)) {
        throw error;
      }
      
      // If this was our last attempt, throw the error
      if (attempt === maxRetries) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
        error: error instanceof Error ? error.message : error,
        attempt: attempt + 1,
        maxRetries
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Default retry condition for common retryable errors
export function isRetryableError(error: any): boolean {
  if (error instanceof BotError) {
    return error.isRetryable;
  }
  
  // Network errors are usually retryable
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }
  
  // HTTP 5xx errors are retryable
  if (error.status >= 500 && error.status < 600) {
    return true;
  }
  
  // Rate limit errors (429) are retryable
  if (error.status === 429) {
    return true;
  }
  
  return false;
}

// Circuit breaker for external services
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private maxFailures: number = 5,
    private resetTimeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker transitioning to HALF_OPEN state');
      } else {
        throw new BotError('Circuit breaker is OPEN', 'CIRCUIT_BREAKER_OPEN', 'Service temporarily unavailable');
      }
    }

    try {
      const result = await fn();
      
      if (this.state === 'HALF_OPEN') {
        this.reset();
        logger.info('Circuit breaker reset to CLOSED state');
      }
      
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.maxFailures) {
      this.state = 'OPEN';
      logger.error(`Circuit breaker opened after ${this.failures} failures`);
    }
  }

  private reset() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// Global error handlers
export function setupGlobalErrorHandlers() {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
      pid: process.pid
    });
    
    // Give some time for logs to flush
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString()
    });
  });

  // Handle warning events
  process.on('warning', (warning) => {
    logger.warn('Process warning', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack
    });
  });

  // Graceful shutdown handlers
  const gracefulShutdown = (signal: string) => {
    logger.info(`Received ${signal}, initiating graceful shutdown...`);
    
    // Perform cleanup here
    // - Close database connections
    // - Finish pending operations
    // - etc.
    
    setTimeout(() => {
      logger.info('Graceful shutdown completed');
      process.exit(0);
    }, 5000); // Give 5 seconds for cleanup
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Error reporting helpers
export function formatErrorForUser(error: any): string {
  if (error instanceof BotError) {
    return error.userMessage;
  }
  
  // Don't expose internal errors to users
  return 'An unexpected error occurred. Please try again.';
}

export function formatErrorForLogging(error: any, context?: Record<string, any>) {
  const baseInfo = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    name: error instanceof Error ? error.name : 'Unknown',
    ...context
  };

  if (error instanceof BotError) {
    return {
      ...baseInfo,
      code: error.code,
      userMessage: error.userMessage,
      context: error.context,
      isRetryable: error.isRetryable
    };
  }

  return baseInfo;
}

// Health check for error rates
export class ErrorRateMonitor {
  private errors: number[] = [];
  private windowMs: number;
  private maxErrors: number;

  constructor(windowMs: number = 60000, maxErrors: number = 50) {
    this.windowMs = windowMs;
    this.maxErrors = maxErrors;
  }

  recordError() {
    const now = Date.now();
    this.errors.push(now);
    
    // Clean old errors outside the window
    this.errors = this.errors.filter(time => now - time < this.windowMs);
  }

  getErrorRate(): number {
    const now = Date.now();
    const recentErrors = this.errors.filter(time => now - time < this.windowMs);
    return recentErrors.length;
  }

  isHealthy(): boolean {
    return this.getErrorRate() < this.maxErrors;
  }

  getStats() {
    return {
      errorCount: this.getErrorRate(),
      maxErrors: this.maxErrors,
      windowMs: this.windowMs,
      isHealthy: this.isHealthy()
    };
  }
}

// Create global error rate monitor
export const globalErrorMonitor = new ErrorRateMonitor();

// Middleware for tracking errors
export function trackError(error: any, context?: Record<string, any>) {
  globalErrorMonitor.recordError();
  logger.error('Error tracked', formatErrorForLogging(error, context));
}
