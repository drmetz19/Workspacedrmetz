import fs from 'node:fs'

/** Loader .env.local sederhana untuk script CLI (Next memuatnya sendiri saat runtime). */
export function loadEnv(file = '.env.local') {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}
