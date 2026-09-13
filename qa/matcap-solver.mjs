/**
 * Matcap orientation solver.
 *
 * A matcap is indexed by the view-space normal, so for flat faces the object's
 * orientation alone decides which part of the texture each face samples.
 * `matcap.png` is mostly black with the bright content concentrated in a star
 * (upper left), a rainbow band (right) and a swoosh (lower left) — so the
 * difference between a brilliant chrome prism and a black one is a few degrees
 * of yaw.
 *
 * This sweeps yaw/pitch for a given pyramid proportion, samples the real
 * texture for every face, and reports the orientations that maximise
 * area-weighted luminance. Used to pick the hero angle from evidence instead of
 * by eye.
 *
 * Usage: node qa/matcap-solver.mjs [yScale] [inward]
 *   inward: sample with flipped normals (an experiment; the production shader
 *   uses outward normals — see qa/matcap-preview.mjs for the full shader)
 */

import fs from 'fs'
import { PNG } from 'pngjs'

const Y_SCALE = Number(process.argv[2] || 1.5) // height stretch vs base
const INWARD = process.argv[3] === 'inward'

const png = PNG.sync.read(fs.readFileSync('public/matcap.png'))
const { width: MW, height: MH, data: MD } = png

/** Sample matcap.png at a view-space normal, mirroring three.js's shader. */
function sampleMatcap(n) {
  // three.js: uv = vec2(dot(x, normal), dot(y, normal)) * 0.495 + 0.5
  // with viewDir ~ (0,0,1) this reduces to the normal's x/y.
  const u = n[0] * 0.495 + 0.5
  const v = n[1] * 0.495 + 0.5

  const px = Math.min(MW - 1, Math.max(0, Math.round(u * (MW - 1))))
  // Texture v runs bottom-up; image rows run top-down.
  const py = Math.min(MH - 1, Math.max(0, Math.round((1 - v) * (MH - 1))))

  const i = (py * MW + px) * 4
  const r = MD[i]
  const g = MD[i + 1]
  const b = MD[i + 2]
  return {
    lum: 0.2126 * r + 0.7152 * g + 0.0722 * b,
    sat: Math.max(r, g, b) === 0 ? 0 : (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b),
  }
}

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * Faces of the pyramid after a non-uniform Y stretch.
 * A plane normal transforms by the inverse-transpose, so stretching Y by `s`
 * divides the normal's y component by `s`.
 */
function faces(yScale) {
  const f = (n, area) => ({ n: norm([n[0], n[1] / yScale, n[2]]), area })

  return [
    // Four side faces of the square pyramid (normals (±2,1,0) and (0,1,±2)).
    f([2, 1, 0], 1),
    f([-2, 1, 0], 1),
    f([0, 1, 2], 1),
    f([0, 1, -2], 1),
    // Base.
    f([0, -1, 0], 1),
    // Interior cut faces, exposed once the slices separate. Same normal as the
    // +X face because every cut runs parallel to the right edge.
    f([2, 1, 0], 0.8),
    f([-2, -1, 0], 0.8),
  ]
}

function rotY(v, a) {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]
}

function rotX(v, a) {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]
}

function score(yaw, pitch, yScale) {
  const fs_ = faces(yScale)
  let lumSum = 0
  let satSum = 0
  let darkSum = 0
  let wSum = 0

  for (const face of fs_) {
    const n = rotX(rotY(face.n, yaw), pitch)
    // Only faces turned toward the camera contribute; weight by how much of
    // their area is presented (Lambert-style projected area). Visibility always
    // follows the true outward normal; only the matcap lookup is flipped.
    if (n[2] <= 0.02) continue
    const w = n[2] * face.area
    const s = sampleMatcap(INWARD ? [-n[0], -n[1], -n[2]] : n)
    lumSum += s.lum * w
    satSum += s.sat * w
    if (s.lum <= 35) darkSum += w
    wSum += w
  }

  return wSum > 0
    ? { lum: lumSum / wSum, sat: satSum / wSum, dark: darkSum / wSum, w: wSum }
    : { lum: 0, sat: 0, dark: 1, w: 0 }
}

console.log(`matcap ${MW}x${MH}   yScale=${Y_SCALE}   normals=${INWARD ? 'inward' : 'outward'}\n`)

const results = []
for (let yawDeg = 0; yawDeg <= 90; yawDeg += 1) {
  for (let pitchDeg = -14; pitchDeg <= 14; pitchDeg += 2) {
    const r = score((yawDeg * Math.PI) / 180, (pitchDeg * Math.PI) / 180, Y_SCALE)
    results.push({ yawDeg, pitchDeg, ...r })
  }
}

results.sort((a, b) => b.lum - a.lum)

console.log('TOP 12 ORIENTATIONS BY AREA-WEIGHTED LUMINANCE')
console.log('yaw°  pitch°     lum    sat')
results.slice(0, 12).forEach((r) =>
  console.log(
    String(r.yawDeg).padStart(4),
    String(r.pitchDeg).padStart(6),
    r.lum.toFixed(1).padStart(8),
    r.sat.toFixed(3).padStart(7)
  )
)

console.log('\nLUMINANCE vs YAW (at best pitch for each yaw)')
const byYaw = new Map()
for (const r of results) {
  const cur = byYaw.get(r.yawDeg)
  if (!cur || r.lum > cur.lum) byYaw.set(r.yawDeg, r)
}
for (let y = 0; y <= 90; y += 5) {
  const r = byYaw.get(y)
  const bar = '#'.repeat(Math.round(r.lum / 4))
  console.log(
    String(y).padStart(3) + '°',
    r.lum.toFixed(1).padStart(7),
    ' pitch ' + String(r.pitchDeg).padStart(3),
    ' dark ' + String(Math.round(r.dark * 100)).padStart(3) + '%',
    ' ' + bar
  )
}
