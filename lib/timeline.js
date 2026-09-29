import * as THREE from 'three'
import { CUT_NORMAL, SLIDE_DIR } from './prismGeometry'
import { CHAPTER_COUNT } from './chapters'

/**
 * Scroll timeline — chapter units, stages, framing, orientation, camera lift.
 *
 * Progress is expressed in CHAPTER UNITS: s = p * CHAPTER_COUNT.
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
    section: range(s, 0.95, 1.95),
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

export const ribbonZoom = (s) => lerp(1, 1.42, easeInOutSine(range(s, 6.4, 7)))
export const prismRecede = (s) => easeInOutSine(range(s, 6.0, 6.7))
export const explodeAmount = (s) => easeInOutSine(range(s, 2.3, 3.1))

export function gridLevels(s) {
  const grid = range(s, 3.05, 4.0)
  return {
    coarse: easeOutCubic(range(grid, 0, 0.45)),
    fine: easeInOutSine(range(grid, 0.35, 1)),
  }
}

/*
 * Chapters 1 and 2 are drawn in the deck, and the deck draws them corner-on:
 * `image2.gif` shows a vertical edge running down the middle to a front base
 * corner, the base as a rhombus, and a silhouette that measures symmetric about
 * its apex (qa/measure-reference-prism.mjs). That is 45 degrees of yaw, not the
 * frontal view — frontal would show one face and a horizontal base edge.
 */
const YAW_KEYS = [
  { t: 0, v: deg(28) },
  { t: 1.2, v: deg(45) },
  { t: 1.5, v: deg(45) },
  { t: 2.4, v: deg(45) },
  { t: 3, v: deg(28) },
  { t: 4, v: deg(38) },
  { t: 5, v: deg(32) },
  { t: 7, v: deg(30) },
]

/* Flat through the diagram chapters: the angle the prism is seen at should be
 * the camera's 22.7 degrees exactly, with nothing added on top of it. */
const PITCH_KEYS = [
  { t: 0, v: deg(4) },
  { t: 1.2, v: 0 },
  { t: 1.5, v: 0 },
  { t: 2.4, v: 0 },
  { t: 3, v: deg(-4) },
  { t: 4, v: deg(-8) },
  { t: 5, v: deg(-8) },
  { t: 7, v: deg(-8) },
]

const CAMERA_PITCH_KEYS = [
  // The hero is the design's own head-on view.
  { t: 0, v: 0 },
  // Chapters 1 and 2 are the diagram views: measured off `image2.gif`, which
  // looks down on the solid from 22.7 degrees. That elevation is what turns the
  // travelling section from a line into a face you can actually read.
  { t: 1.2, v: deg(22.7) },
  { t: 2.6, v: deg(22.7) },
  { t: 3.8, v: deg(15) },
  { t: 5, v: deg(16) },
  { t: 7, v: deg(16) },
]

export const cameraPitch = (s) => sampleKeys(CAMERA_PITCH_KEYS, s)

/*
 * Lens, chapter by chapter — a dolly-zoom, not a zoom.
 *
 * The deck's diagrams are drawn isometric. Rendering the same solid through a
 * 40 degree lens six units away puts enough perspective in the silhouette that
 * it measures 34 degrees of elevation where the diagram measures 23. Pulling
 * the camera back as the field of view narrows flattens that out, and because
 * the two move together the prism keeps exactly the size it had on screen —
 * which is also what keeps the framing maths in frameAt valid.
 */
const CAMERA_DOLLY_KEYS = [
  { t: 0, v: 0 },
  { t: 1.2, v: 1 },
  { t: 2.6, v: 1 },
  { t: 3.6, v: 0.55 },
  { t: 7, v: 0.55 },
]

/** How far back the diagram chapters pull the camera. */
const CAMERA_Z_LONG = 13

/** The height the camera sees at the subject, held constant across the dolly.
 *  Read lazily: CAMERA is declared further down this module. */
export const visibleHeight = () =>
  2 * CAMERA.z * Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2))

/** Camera distance, and the field of view that keeps the subject its size. */
export function cameraLens(s) {
  const z = lerp(CAMERA.z, CAMERA_Z_LONG, clamp01(sampleKeys(CAMERA_DOLLY_KEYS, s)))
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(visibleHeight() / 2 / z))
  return { z, fov }
}

/*
 * How solid the prism's shell is, chapter by chapter.
 *
 * The buyer asks for crystal rather than a matte block, and `image2.gif` draws
 * the pyramid transparent precisely so the travelling section can be seen
 * inside it. The hero keeps its near-solid chrome; the shell opens up for the
 * section and the cut, then firms up again once the pieces are apart and it is
 * the solid itself being read.
 */
const SHELL_KEYS = [
  { t: 0, v: 0.97 },
  { t: 1, v: 0.6 },
  { t: 1.5, v: 0.34 },
  { t: 2, v: 0.34 },
  { t: 2.6, v: 0.62 },
  { t: 3.4, v: 0.9 },
  { t: 7, v: 0.9 },
]

export const shellOpacity = (s) => sampleKeys(SHELL_KEYS, s)

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

export const CAMERA = { z: 6, y: 0.1, fov: 40 }
export const PRISM_SHAPE = [1, 1.406, 1]
export const SILHOUETTE_K = 1.105
export const SILHOUETTE_DROP = 0.056
export const PRISM_ASPECT = 0.83

export function scaleForFraction(fraction) {
  const visibleHeight =
    2 * CAMERA.z * Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2))
  return (fraction * visibleHeight) / (2 * PRISM_SHAPE[1] * SILHOUETTE_K)
}

const MAX_WIDTH_SHARE = 0.62
const MAX_WIDTH_SHARE_STACKED = 0.84

export function frameAt(s, layout, explodeScale, out) {
  const anchors = layout.anchors
  const last = anchors.length - 1
  const i = Math.min(last, Math.max(0, Math.floor(s)))
  const move = easeInOutSine(clamp01((s - i - 0.3) / 0.7))

  const a = anchors[i]
  const b = anchors[Math.min(last, i + 1)]

  out.cx = lerp(a.cx, b.cx, move)
  out.cy = lerp(a.cy, b.cy, move)
  let fraction = lerp(a.fraction, b.fraction, move)

  const explode = easeInOutSine(range(s, 2.3, 3.1)) * explodeScale
  fraction *= 1 + explode * EXPLODE_WIDTH_GROWTH * 0.35

  out.fraction = fraction
  return out
}

export function getComposition(width) {
  if (width < 480) return { explodeScale: 0.6, pointerStrength: 0 }
  if (width < 768) return { explodeScale: 0.72, pointerStrength: 0 }
  if (width < 1100) return { explodeScale: 0.88, pointerStrength: 0.7 }
  return { explodeScale: 1.0, pointerStrength: 1 }
}
