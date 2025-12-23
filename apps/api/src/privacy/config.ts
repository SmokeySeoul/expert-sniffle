import path from 'path';

const DEFAULT_EXPORT_DIR = path.resolve(process.cwd(), 'exports');
const DEFAULT_EXPORT_TTL_HOURS = 24;

export function getExportDir(): string {
  const configured = process.env.EXPORT_DIR;
  if (!configured) {
    return DEFAULT_EXPORT_DIR;
  }

  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

export function getExportTtlHours(): number {
  const raw = process.env.EXPORT_TTL_HOURS;
  if (!raw) {
    return DEFAULT_EXPORT_TTL_HOURS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_EXPORT_TTL_HOURS;
  }

  return parsed;
}
