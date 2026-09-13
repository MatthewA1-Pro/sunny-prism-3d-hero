/**
 * Builds `public/matcap-soft.png` from the buyer's `public/matcap.png`.
 *
 * The soft matcap is a heavily blurred copy of the original: at any normal it
 * holds the local average colour of the chrome texture. The prism shader uses it
 * as a silver base under the sharp matcap (see components/PrismObject.jsx), so
 * the base tint always comes from the buyer's own texture.
 *
 * The blur is mask-normalised — only pixels inside the matcap disc contribute —
 * so the black corners outside the disc do not bleed in and darken the rim.
 *
 * Usage: node scripts/build-matcap-soft.mjs
 */

import fs from 'fs'
import { PNG } from 'pngjs'

const SRC = 'public/matcap.png'
const DST = 'public/matcap-soft.png'
const WORK = 128 // blur resolution
const OUT = 64 // output resolution (sampled with linear filtering)
const SIGMA = 7 // in WORK pixels (~28 px at the source's 512)

const src = PNG.sync.read(fs.readFileSync(SRC))

// ── Downsample to WORK x WORK, tracking the disc mask ───────────────────────
const f = src.width / WORK
const col = new Float64Array(WORK * WORK * 3)
const mask = new Float64Array(WORK * WORK)

for (let y = 0; y < WORK; y++) {
  for (let x = 0; x < WORK; x++) {
    let r = 0
    let g = 0
    let b = 0
    let m = 0
    for (let sy = 0; sy < f; sy++) {
      for (let sx = 0; sx < f; sx++) {
        const px = x * f + sx
        const py = y * f + sy
        const dx = ((px + 0.5) / src.width) * 2 - 1
        const dy = ((py + 0.5) / src.height) * 2 - 1
        if (dx * dx + dy * dy > 0.98) continue
        const i = (py * src.width + px) * 4
        r += src.data[i]
        g += src.data[i + 1]
        b += src.data[i + 2]
        m++
      }
    }
    const k = y * WORK + x
    col[k * 3] = r
    col[k * 3 + 1] = g
    col[k * 3 + 2] = b
    mask[k] = m
  }
}

// ── Separable Gaussian over colour*mask and mask ────────────────────────────
const radius = Math.ceil(SIGMA * 3)
const kernel = []
for (let i = -radius; i <= radius; i++) kernel.push(Math.exp(-(i * i) / (2 * SIGMA * SIGMA)))

function blur(data, channels) {
  const tmp = new Float64Array(data.length)
  const out = new Float64Array(data.length)
  const clamp = (v) => Math.min(WORK - 1, Math.max(0, v))
  for (let y = 0; y < WORK; y++)
    for (let x = 0; x < WORK; x++)
      for (let c = 0; c < channels; c++) {
        let s = 0
        for (let i = -radius; i <= radius; i++)
          s += data[(y * WORK + clamp(x + i)) * channels + c] * kernel[i + radius]
        tmp[(y * WORK + x) * channels + c] = s
      }
  for (let y = 0; y < WORK; y++)
    for (let x = 0; x < WORK; x++)
      for (let c = 0; c < channels; c++) {
        let s = 0
        for (let i = -radius; i <= radius; i++)
          s += tmp[(clamp(y + i) * WORK + x) * channels + c] * kernel[i + radius]
        out[(y * WORK + x) * channels + c] = s
      }
  return out
}

const colB = blur(col, 3)
const maskB = blur(mask, 1)

// ── Normalise and downsample to OUT x OUT ───────────────────────────────────
const dst = new PNG({ width: OUT, height: OUT })
const g = WORK / OUT
for (let y = 0; y < OUT; y++) {
  for (let x = 0; x < OUT; x++) {
    const acc = [0, 0, 0]
    let n = 0
    for (let sy = 0; sy < g; sy++)
      for (let sx = 0; sx < g; sx++) {
        const k = (y * g + sy) * WORK + (x * g + sx)
        if (maskB[k] <= 1e-6) continue
        for (let c = 0; c < 3; c++) acc[c] += colB[k * 3 + c] / maskB[k]
        n++
      }
    const i = (y * OUT + x) * 4
    for (let c = 0; c < 3; c++) dst.data[i + c] = n ? Math.round(Math.min(255, acc[c] / n)) : 0
    dst.data[i + 3] = 255
  }
}

fs.writeFileSync(DST, PNG.sync.write(dst))
console.log(`wrote ${DST} (${OUT}x${OUT}, sigma ${SIGMA}/${WORK})`)
