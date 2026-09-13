/**
 * Offline matcap preview.
 *
 * Ray-casts the stretched square pyramid and shades it with the exact
 * meshMatcapMaterial lookup from three.js (including its view-direction basis),
 * plus the prism's soft-silver layer and R3F's default ACES filmic tone
 * mapping. Validated against real renders: the plain inward/outward tiles
 * reproduce qa/shots/m1-inward and v10 hero frames.
 *
 * Renders a contact sheet so material decisions take seconds instead of
 * minutes of software-WebGL capture.
 *
 * Rows: material variant. Columns: yaw.
 *
 * Usage: node qa/matcap-preview.mjs [out.png]
 */

import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'

const OUT = process.argv[2] || path.join('qa', 'shots', 'matcap-preview.png')
fs.mkdirSync(path.dirname(OUT), { recursive: true })

const mat = PNG.sync.read(fs.readFileSync('public/matcap.png'))
const soft = fs.existsSync('public/matcap-soft.png')
  ? PNG.sync.read(fs.readFileSync('public/matcap-soft.png'))
  : null

// Scene constants mirrored from lib/timeline.js (desktop composition).
const SCALE = 0.66
const Y_STRETCH = 1.5
const CAM = [0, 0.1, 6]
const FOV = (40 * Math.PI) / 180
const PITCH = 0.0436
const BG = [15, 2, 31]

const TILE = 200
const YAWS = [15, 25, 35, 45, 55, 65]

/**
 * sign   +1 outward normals, -1 inward
 * bend   blend exterior normals toward the radial direction (face gradients)
 * soft   0 = plain matcap; otherwise gain on the blurred silver base
 * detail weight of the sharp matcap screened over the base
 * sat    saturation kept in the soft base (1 = as blurred, 0 = neutral grey)
 */
const VARIANTS = [
  { sign: 1, bend: 0, soft: 0, detail: 1, sat: 1 },
  { sign: 1, bend: 0, soft: 2.2, detail: 0.9, sat: 1 },
  { sign: 1, bend: 0, soft: 2.2, detail: 0.9, sat: 0.6 },
  { sign: 1, bend: 0, soft: 2.2, detail: 0.9, sat: 0.35 },
  { sign: 1, bend: 0, soft: 2.6, detail: 0.9, sat: 0.5 },
  { sign: 1, bend: 0, soft: 2.0, detail: 1.0, sat: 0.5 },
]

// ─── vector helpers ──────────────────────────────────────────────────────────
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const nrm = (a) => scl(a, 1 / Math.hypot(a[0], a[1], a[2]))
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const rotX = (v, a) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)]
const rotY = (v, a) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)]

// Object rotation is Euler XYZ: world = Rx(pitch) * Ry(yaw) * local.
const toWorld = (v, yaw) => rotX(rotY(v, yaw), PITCH)
const toLocal = (v, yaw) => rotY(rotX(v, -PITCH), -yaw)

// ─── colour pipeline (three.js) ──────────────────────────────────────────────
const toLin = (c) => {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
const toSrgb = (c) => {
  c = Math.min(1, Math.max(0, c))
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055))
}

// tonemapping_pars_fragment: GLSL mat3(c0, c1, c2) takes columns.
function mulCols(c0, c1, c2, v) {
  return [
    c0[0] * v[0] + c1[0] * v[1] + c2[0] * v[2],
    c0[1] * v[0] + c1[1] * v[1] + c2[1] * v[2],
    c0[2] * v[0] + c1[2] * v[1] + c2[2] * v[2],
  ]
}
function aces(color) {
  let c = scl(color, 1 / 0.6)
  c = mulCols([0.59719, 0.076, 0.0284], [0.35458, 0.90834, 0.13383], [0.04823, 0.01566, 0.83777], c)
  c = c.map((v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081))
  c = mulCols([1.60475, -0.10208, -0.00327], [-0.53108, 1.10813, -0.07276], [-0.07367, -0.00605, 1.07602], c)
  return c.map((v) => Math.min(1, Math.max(0, v)))
}

// ─── the stretched pyramid as half-spaces (n · x <= d), in local space ───────
function planes() {
  const raw = [
    [[2, 1, 0], 1],
    [[-2, 1, 0], 1],
    [[0, 1, 2], 1],
    [[0, 1, -2], 1],
    [[0, -1, 0], 1],
  ]
  return raw.map(([n, d]) => {
    const m = [n[0], n[1] / Y_STRETCH, n[2]]
    const len = Math.hypot(...m)
    return { n: scl(m, 1 / len), d: (d * SCALE) / len }
  })
}
const PLANES = planes()
// Centroid of a pyramid sits a quarter of the way up from the base.
const CENTER = [0, -0.5 * SCALE * Y_STRETCH, 0]

function intersect(o, d) {
  let tIn = -Infinity
  let tOut = Infinity
  let face = -1
  for (let i = 0; i < PLANES.length; i++) {
    const { n, d: pd } = PLANES[i]
    const denom = dot(n, d)
    const num = pd - dot(n, o)
    if (Math.abs(denom) < 1e-9) {
      if (num < 0) return null
      continue
    }
    const t = num / denom
    if (denom < 0) {
      if (t > tIn) {
        tIn = t
        face = i
      }
    } else if (t < tOut) tOut = t
  }
  if (tIn > tOut || tIn <= 0 || face < 0) return null
  return { t: tIn, face }
}

/** Nearest sample, as the full-resolution matcap effectively is on flat faces. */
function sampleNearest(img, u, v) {
  const px = Math.min(img.width - 1, Math.max(0, Math.round(u * (img.width - 1))))
  const py = Math.min(img.height - 1, Math.max(0, Math.round((1 - v) * (img.height - 1))))
  const i = (py * img.width + px) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}

/** Bilinear sample (LinearFilter), used for the 64px soft matcap. */
function sampleBilinear(img, u, v) {
  const fx = Math.min(img.width - 1, Math.max(0, u * img.width - 0.5))
  const fy = Math.min(img.height - 1, Math.max(0, (1 - v) * img.height - 0.5))
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(img.width - 1, x0 + 1)
  const y1 = Math.min(img.height - 1, y0 + 1)
  const tx = fx - x0
  const ty = fy - y0
  const at = (x, y, c) => img.data[(y * img.width + x) * 4 + c]
  return [0, 1, 2].map((c) => {
    const top = at(x0, y0, c) * (1 - tx) + at(x1, y0, c) * tx
    const bot = at(x0, y1, c) * (1 - tx) + at(x1, y1, c) * tx
    return top * (1 - ty) + bot * ty
  })
}

function renderTile(yawDeg, variant) {
  const { sign, bend, soft: softGain, detail, sat: softSat = 1 } = variant
  const yaw = (yawDeg * Math.PI) / 180
  const pix = new Uint8Array(TILE * TILE * 3)
  const tanH = Math.tan(FOV / 2)
  let prism = 0
  let dark = 0
  let lum = 0
  let sat = 0

  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const k = (py * TILE + px) * 3
      const dirWorld = nrm([
        ((px + 0.5) / TILE * 2 - 1) * tanH,
        -((py + 0.5) / TILE * 2 - 1) * tanH,
        -1,
      ])
      const oL = toLocal(CAM, yaw)
      const dL = toLocal(dirWorld, yaw)
      const hit = intersect(oL, dL)
      if (!hit) {
        pix[k] = BG[0]
        pix[k + 1] = BG[1]
        pix[k + 2] = BG[2]
        continue
      }

      const pL = add(oL, scl(dL, hit.t))
      let nL = PLANES[hit.face].n
      if (bend > 0) {
        const radial = nrm(sub(pL, CENTER))
        nL = nrm(add(scl(nL, 1 - bend), scl(radial, bend)))
      }
      const normal = scl(toWorld(nL, yaw), sign)

      // three.js meshmatcap_frag
      const pW = toWorld(pL, yaw)
      const viewDir = nrm(sub(CAM, pW))
      const x = nrm([viewDir[2], 0, -viewDir[0]])
      const y = cross(viewDir, x)
      const u = dot(x, normal) * 0.495 + 0.5
      const v = dot(y, normal) * 0.495 + 0.5

      let lin = sampleNearest(mat, u, v).map(toLin)
      if (softGain > 0 && soft) {
        const raw = sampleBilinear(soft, u, v).map(toLin)
        // Partial desaturation toward the base's own luminance (linear space).
        const grey = 0.2126 * raw[0] + 0.7152 * raw[1] + 0.0722 * raw[2]
        const base = raw.map((c) => Math.min(1, (grey + (c - grey) * softSat) * softGain))
        // Screen: sharp matcap detail over the soft silver base.
        lin = lin.map((c, i) => 1 - (1 - base[i]) * (1 - c * detail))
      }
      const out = aces(lin).map(toSrgb)

      pix[k] = out[0]
      pix[k + 1] = out[1]
      pix[k + 2] = out[2]

      const l = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2]
      const mx = Math.max(...out)
      prism++
      lum += l
      sat += mx ? (mx - Math.min(...out)) / mx : 0
      if (l <= 35) dark++
    }
  }

  return {
    pix,
    dark: prism ? dark / prism : 1,
    lum: prism ? lum / prism : 0,
    sat: prism ? sat / prism : 0,
  }
}

const sheet = new PNG({ width: TILE * YAWS.length, height: TILE * VARIANTS.length })
console.log('rows = variant, cols = yaw ' + YAWS.join('/') + ' deg  (dark% / lum / sat)')
console.log('demo hero target: dark ~1%, face lum 86-114, grey sat ~0.1 with saturated streaks')

VARIANTS.forEach((variant, row) => {
  const cells = []
  YAWS.forEach((yawDeg, col) => {
    const { pix, dark, lum, sat } = renderTile(yawDeg, variant)
    cells.push(
      `${String(Math.round(dark * 100)).padStart(3)}%/${String(Math.round(lum)).padStart(3)}/${sat.toFixed(2)}`
    )
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < TILE; px++) {
        const s = (py * TILE + px) * 3
        const d = ((row * TILE + py) * sheet.width + col * TILE + px) * 4
        sheet.data[d] = pix[s]
        sheet.data[d + 1] = pix[s + 1]
        sheet.data[d + 2] = pix[s + 2]
        sheet.data[d + 3] = 255
      }
    }
  })
  const v = variant
  console.log(
    `row ${row} sign ${v.sign > 0 ? '+' : '-'} bend ${v.bend} soft ${v.soft} detail ${v.detail} sat ${v.sat}  ` +
      cells.join('  ')
  )
})

fs.writeFileSync(OUT, PNG.sync.write(sheet))
console.log('wrote', OUT)
