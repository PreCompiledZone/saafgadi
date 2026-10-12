import { getConfig } from '../config';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

function write(level: Level, message: string, extra?: unknown) {
  let threshold: Level = 'info';
  try {
    threshold = getConfig().logLevel;
  } catch {
    // Config not loaded yet (e.g. while reporting a config error).
  }
  if (LEVELS[level] < LEVELS[threshold]) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (extra === undefined) out(line);
  else out(line, extra instanceof Error ? (extra.stack ?? extra.message) : extra);
}

export const logger = {
  debug: (msg: string, extra?: unknown) => write('debug', msg, extra),
  info: (msg: string, extra?: unknown) => write('info', msg, extra),
  warn: (msg: string, extra?: unknown) => write('warn', msg, extra),
  error: (msg: string, extra?: unknown) => write('error', msg, extra),
};
