const UNITS = ["B", "KB", "MB", "GB", "TB"]

export function formatBytes(bytes: number, digits = 1) {
  if (!bytes) return "0 B"
  const i = Math.min(UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const v = bytes / 1024 ** i
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : digits)} ${UNITS[i]}`
}

export const GB = 1024 ** 3
