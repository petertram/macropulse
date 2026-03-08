// Structured logger for MacroPulse server
// Supports LOG_LEVEL env var: 'debug' | 'info' | 'warn' | 'error' (default: 'info')

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[LOG_LEVEL];
}

function format(level: LogLevel, prefix: string, message: string, extra?: unknown): string {
  const ts = new Date().toISOString();
  const tag = prefix ? `[${prefix}] ` : '';
  const base = `${ts} [${level.toUpperCase()}] ${tag}${message}`;
  return extra !== undefined ? `${base} ${JSON.stringify(extra)}` : base;
}

export const logger = {
  debug(prefix: string, message: string, extra?: unknown): void {
    if (shouldLog('debug')) console.debug(format('debug', prefix, message, extra));
  },
  info(prefix: string, message: string, extra?: unknown): void {
    if (shouldLog('info')) console.info(format('info', prefix, message, extra));
  },
  warn(prefix: string, message: string, extra?: unknown): void {
    if (shouldLog('warn')) console.warn(format('warn', prefix, message, extra));
  },
  error(prefix: string, message: string, extra?: unknown): void {
    if (shouldLog('error')) console.error(format('error', prefix, message, extra));
  },
};
