/**
 * Measure the pyramid's proportion and viewing angle from the buyer's own
 * diagrams, so the build's geometry is taken from the references rather than
 * guessed.
 *
 * The diagrams draw a square pyramid corner-on. For base side `s`, height `h`
 * and elevation `e`, the silhouette gives three numbers we can read straight
 * off the pixels:
 *
 *   halfWidth W          = (s*sqrt(2)/2)              — the base diagonal, unforeshortened
 *   apex -> side corners = h*cos(e)                    — vertical drop to the widest points
 *   side -> front corner = (s*sqrt(2)/2)*sin(e)        — how far the near corner hangs below them
 *
 * so tan(e) = (side->front) / W, h = (apex->side) / cos(e), and s = W*sqrt(2).
 *
 * Usage: node qa/measure-reference-prism.mjs <sheet.png> [tiles-across] [tiles-down] [tileIndex]
 */

import fs from 'fs'
import { PNG } from 'pngjs'

const FILE = process.argv[2] || 'references/screenshots/pptx/gif2_sheet.png'
const COLS = Number(process.argv[3] || 5)
const ROWS = Number(process.argv[4] || 3)
const ONLY = process.argv[5] !== undefined ? Number(process.argv[5]) : null

const png = PNG.sync.read(fs.readFileSync(FILE))
const { width, height, data } = png

const lum = (x, y) => {
  const i = (y * width + x) * 4
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
}

// The diagrams are dark outlines on a pale background; anything this dark is
// the drawing, not the paper or the tinted fills.
const INK = 110

const tileW = Math.floor(width / COLS)
const tileH = Math.floor(height / ROWS)

const results = []

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const index = r * COLS + c
    if (ONLY !== null && index !== ONLY) continue

    const x0 = c * tileW
    const y0 = r * tileH

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    let apexX = 0
    let frontX = 0
    // y of the leftmost and rightmost ink, i.e. the base's side corners
    let leftY = 0
    let rightY = 0

    for (let y = y0 + 2; y < y0 + tileH - 2; y++) {
      for (let x = x0 + 2; x < x0 + tileW - 2; x++) {
        if (lum(x, y) > INK) continue
        if (y < minY) {
          minY = y
          apexX = x
        }
        if (y > maxY) {
          maxY = y
          frontX = x
        }
        if (x < minX) {
          minX = x
          leftY = y
        }
        if (x > maxX) {
          maxX = x
          rightY = y
        }
      }
    }

    if (!isFinite(minX)) continue

    const halfWidth = (maxX - minX) / 2
    const sideY = (leftY + rightY) / 2
    const apexToSide = sideY - minY
    const sideToFront = maxY - sideY

    const elevation = Math.atan2(sideToFront, halfWidth)
    const h = apexToSide / Math.cos(elevation)
    const s = halfWidth * Math.SQRT2

    results.push({
      tile: index,
      elevationDeg: (elevation * 180) / Math.PI,
      // height as a multiple of the base side, and of the base half-width
      hOverS: h / s,
      hOverHalfS: h / (s / 2),
      silhouetteWH: (maxX - minX) / (maxY - minY),
      apexOffset: (apexX - (minX + maxX) / 2) / halfWidth,
      frontOffset: (frontX - (minX + maxX) / 2) / halfWidth,
      px: { w: maxX - minX, h: maxY - minY },
    })
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

console.log(`${FILE}  (${results.length} tiles)`)
for (const r of results) {
  console.log(
    `  tile ${String(r.tile).padStart(2)}  elevation=${r.elevationDeg.toFixed(1)}deg  h/side=${r.hOverS.toFixed(3)}  h/halfSide=${r.hOverHalfS.toFixed(3)}  silhouette w/h=${r.silhouetteWH.toFixed(3)}  apexOff=${r.apexOffset.toFixed(2)}  px=${r.px.w}x${r.px.h}`
  )
}
console.log('\nmedians across tiles:')
console.log(`  elevation   ${median(results.map((r) => r.elevationDeg)).toFixed(1)} deg`)
console.log(`  h / side    ${median(results.map((r) => r.hOverS)).toFixed(3)}`)
console.log(`  h / halfSide${median(results.map((r) => r.hOverHalfS)).toFixed(3)}`)
console.log(`  silhouette  ${median(results.map((r) => r.silhouetteWH)).toFixed(3)} (w/h)`)
