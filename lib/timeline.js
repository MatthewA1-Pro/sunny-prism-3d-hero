import * as THREE from 'three'
import { CUT_NORMAL, SLIDE_DIR } from './prismGeometry'
import { CHAPTER_COUNT } from './chapters'

/**
 * Scroll timeline — chapter units, stages, framing, orientation, camera lift.
 */

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const range = (x, a, b) => clamp01((x - a) / (b - a))
export const lerp = (a, b, t) => a + (b - a) * t
export const easeInOutCubic = (x) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
export const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3)
export const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2
const deg = (d) => (d * Math.PI) / 180
export const damp = (current, target, lambda, delta) =>
  THREE.MathUtils.damp(current, target, lambda, delta)
export const chapterUnits = (p) => clamp01(p) * CHAPTER_COUNT

export function sampleKeys(keys, t) {
  const last = keys.length - 1
  if (t <= keys[0].t) return keys[0].v
  if (t >= keys[last].t) return keys[last].v
  let i = 0
  while (i < last - 1 && t > keys[i + 1].t) i++
  const k1 = keys[i]
  const k2 = keys[i + 1]
  const k0 = keys[i > 0 ? i - 1 : i]
  const k3 = keys[i + 2 <= last ? i + 2 : i + 1]
  const span = k2.t - k1.t
  const u = (t - k1.t) / span
  const m1 = ((k2.v - k0.v) / (k2.t - k0.t)) * span
  const m2 = ((k3.v - k1.v) / (k3.t - k1.t)) * span
  const u2 = u * u
  const u3 = u2 * u
  return (
    (2 * u3 - 3 * u2 + 1) * k1.v +
    (u3 - 2 * u2 + u) * m1 +
    (-2 * u3 + 3 * u2) * k2.v +
    (u3 - u2) * m2
  )
}

export function getStages(s) {
  return {
    section: range(s, 1.05, 1.95),
    reveal: range(s, 2.05, 2.5),
    explode: range(s, 2.3, 3.1),
    grid: range(s, 3.05, 4.0),
    shadow: range(s, 4.1, 4.85),
    bands: range(s, 5.0, 5.55),
    converge: range(s, 5.15, 5.9),
    sliver: range(s, 6.05, 6.5),
    ribbons: range(s, 6.2, 6.95),
    settle: range(s, 6.4, 7.0),
  }
}

/** Ribbon zoom amount in the final chapters. */
export const ribbonZoom = (s) => easeInOutSine(range(s, 6.0, 6.7))

/** How far the prism recedes as the story advances. */
const RECEDE_KEYS = [
  { t: 0, v: 0 },
  { t: 3.5, v: 0 },
  { t: 4.5, v: 0.15 },
  { t: 5.5, v: 0.35 },
  { t: 6.5, v: 0.55 },
  { t: 7, v: 0.65 },
]
export const prismRecede = (s) => sampleKeys(RECEDE_KEYS, s)

/** Eased explode amount, 0 closed -> 1 fully open. */
export const explodeAmount = (s) => easeInOutSine(range(s, 2.3, 3.1))

/**
 * Ground grid: fades in through chapter 3 and subdivides as the view pulls
 * back (10x10 -> 50x50).
 */
export function gridLevels(s) {
  const fade = easeInOutSine(range(s, 3.05, 3.6))
  const subdivide = easeInOutSine(range(s, 3.4, 4.0))
  return { fade, subdivide }
}

const YAW_KEYS = [
  { t: 0, v: deg(40) },
  { t: 1, v: deg(18) },
  { t: 2, v: deg(-5) },
  { t: 3, v: deg(25) },
  { t: 4, v: deg(45) },
  { t: 5, v: deg(35) },
  { t: 7, v: deg(30) },
]

const PITCH_KEYS = [
  { t: 0, v: deg(2.5) },
  { t: 1, v: deg(6) },
  { t: 2, v: deg(-4) },
  { t: 3, v: deg(-4) },
  { t: 4, v: deg(-8) },
  { t: 5, v: deg(-8) },
  { t: 7, v: deg(-8) },
]

const CAMERA_PITCH_KEYS = [
  { t: 0, v: 0 },
  { t: 2.5, v: 0 },
  { t: 3.8, v: deg(15) },
  { t: 5, v: deg(16) },
  { t: 7, v: deg(16) },
]

export const cameraPitch = (s) => sampleKeys(CAMERA_PITCH_KEYS, s)

const GLOW_KEYS = [
  { t: 0, v: 0.55 },
  { t: 1, v: 0.75 },
  { t: 2, v: 1 },
  { t: 3, v: 0.75 },
  { t: 4, v: 0.7 },
  { t: 5, v: 0.6 },
  { t: 7, v: 0.45 },
]

const AMBIENT_KEYS = [
  { t: 0, v: 0.6 },
  { t: 2, v: 0.85 },
  { t: 4, v: 0.7 },
  { t: 5, v: 0.5 },
  { t: 7, v: 0.3 },
]

export const prismYaw = (s) => sampleKeys(YAW_KEYS, s)
export const prismPitch = (s) => sampleKeys(PITCH_KEYS, s)
export const glowIntensity = (s) => sampleKeys(GLOW_KEYS, s)
export const ambientLevel = (s) => sampleKeys(AMBIENT_KEYS, s)

const EXPLODE = { gap: 0.38, slide: 0.42, depth: 0.22, tilt: 0.06 }
const EXPLODE_WIDTH_GROWTH = 0.43
const _offset = new THREE.Vector3()

export function sliceOffset(i, amount, out = _offset) {
  const rank = 1.5 - i
  out.copy(CUT_NORMAL).multiplyScalar(EXPLODE.gap * rank * amount)
  out.addScaledVector(SLIDE_DIR, EXPLODE.slide * rank * amount)
  out.z += EXPLODE.depth * rank * amount
  return out
}

export function sliceTilt(i, amount) {
  return EXPLODE.tilt * (1.5 - i) * amount
}

export const CAMERA = { y: 0.15, z: 4.2, fov: 32 }
export const PRISM_SHAPE = [1, 1.5, 1]
export const SILHOUETTE_DROP = 0.06
const SILHOUETTE_K = 0.92

export function scaleForFraction(fraction) {
  const visibleHeight = 2
  return (fraction * visibleHeight) / (2 * PRISM_SHAPE[1] * SILHOUETTE_K)
}

export function frameAt(s, layout, explodeScale, out) {
  const cx = layout.px / 100
  const cy = layout.py / 100
  let fraction = layout.ph / 100
  const explode = easeInOutSine(range(s, 2.3, 3.1)) * explodeScale
  fraction *= 1 + explode * EXPLODE_WIDTH_GROWTH * 0.35
  out.cx = cx
  out.cy = cy
  out.fraction = fraction
  return out
}

export function getComposition(width) {
  if (width < 480) return { explodeScale: 0.6, pointerStrength: 0 }
  if (width < 768) return { explodeScale: 0.72, pointerStrength: 0 }
  if (width < 1100) return { explodeScale: 0.88, pointerStrength: 0.7 }
  return { explodeScale: 1.0, pointerStrength: 1 }
}
