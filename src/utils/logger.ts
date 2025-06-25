/**
 * Simple logging utility for free tier
 * Uses console.log for development and production
 * View logs with: wrangler tail
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private context: string;
  private level: LogLevel;

  constructor(context: string, level: LogLevel = LogLevel.INFO) {
    this.context = context;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const baseMessage = `[${timestamp}] [${level}] [${this.context}] ${message}`;
    
    if (data) {
      return `${baseMessage} ${JSON.stringify(data)}`;
    }
    
    return baseMessage;
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, data));
    }
  }

  error(message: string, error?: Error | any, data?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorData = {
        ...data,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        } : error,
      };
      console.error(this.formatMessage('ERROR', message, errorData));
    }
  }

  // Create a child logger with additional context
  child(childContext: string): Logger {
    return new Logger(`${this.context}:${childContext}`, this.level);
  }
}

// Factory function to create loggers based on environment
export function createLogger(context: string, env?: { LOG_LEVEL?: string }): Logger {
  const logLevel = env?.LOG_LEVEL?.toUpperCase();
  let level: LogLevel;
  
  switch (logLevel) {
    case 'DEBUG':
      level = LogLevel.DEBUG;
      break;
    case 'WARN':
      level = LogLevel.WARN;
      break;
    case 'ERROR':
      level = LogLevel.ERROR;
      break;
    default:
      level = LogLevel.INFO;
  }
  
  return new Logger(context, level);
}