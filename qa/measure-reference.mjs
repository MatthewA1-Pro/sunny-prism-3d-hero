/**
 * Measure buyer reference frames with the SAME metric used on our renders,
 * so material/scale comparisons are numeric rather than impressionistic.
 */
import fs from 'fs'
import path from 'path'
import { measurePng } from './capture.mjs'

const dir = process.argv[2]
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort()

console.log('file'.padEnd(22), 'cov%'.padStart(7), 'h%'.padStart(7), 'cy%'.padStart(7), 'lum'.padStart(7), 'max'.padStart(5), 'sat'.padStart(6))
for (const f of files) {
  const m = measurePng(path.join(dir, f))
  console.log(
    f.padEnd(22),
    String(m.coverage).padStart(7),
    String(m.heightPct).padStart(7),
    String(m.centerYPct).padStart(7),
    String(m.meanLum).padStart(7),
    String(m.maxLum).padStart(5),
    String(m.meanSat).padStart(6)
  )
}
