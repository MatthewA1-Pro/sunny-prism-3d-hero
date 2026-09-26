import * as THREE from 'three'
import { CUT_NORMAL, SLIDE_DIR } from './prismGeometry'
import { CHAPTER_COUNT } from './chapters'

/**
 * Sunny Prism — animation timeline and framing.
 *
 * There is exactly one authoritative value: a normalized scroll progress in
 * [0, 1]. Everything else — the prism, its place on screen, the cross-section,
 * the grid, the background glow — is a pure function of it, which is what makes
 * reverse scrubbing exact.
 *
 * Progress is expressed in CHAPTER UNITS: `s = p * CHAPTER_COUNT`, so chapter i
 * is on screen while s is in [i, i + 1] and every stage range below reads
 * directly against Sunny's walkthrough (see lib/chapters.js). The multiplier is
 * CHAPTER_COUNT, not CHAPTER_COUNT - 1, because the chapters are followed by one
 * viewport of tail (`.chapter-tail`): without it the last chapter would only be
 * reached at the very bottom of the page and its stage would have no room to
 * play.
 *
 * The sequence only ever moves FORWARD: no stage is undone by scrolling on.
 */

// ─── Scalar helpers ──────────────────────────────────────────────────────────

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Normalized position of `x` inside [a, b], clamped. */
export const range = (x, a, b) => clamp01((x - a) / (b - a))

export const lerp = (a, b, t) => a + (b - a) * t

export const easeInOutCubic = (x) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2

export const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3)

export const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2

const deg = (d) => (d * Math.PI) / 180

/**
 * Frame-rate independent exponential damping.
 * Wraps THREE.MathUtils.damp so the feel is identical at 60/90/120/144 Hz.
 */
export const damp = (current, target, lambda, delta) =>
  THREE.MathUtils.damp(current, target, lambda, delta)

/** Scroll progress in chapter units: 0 at the hero, CHAPTER_COUNT at the end. */
export const chapterUnits = (p) => clamp01(p) * CHAPTER_COUNT

/**
 * Cubic Hermite interpolation through keyframes [{ t, v }, ...] with ascending
 * t (in chapter units). Velocity is continuous through every key, so the prism
 * flows through the beats instead of stopping at each one. Allocation-free.
 */
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

// ─── Stages, in chapter units ────────────────────────────────────────────────

/**
 * section   chapter 1: the horizontal cross-section travels APEX -> BASE, so
 *           it grows from the smallest section to the largest, the direction
 *           Sunny describes ("this point is the smallest one, this big one is
 *           the largest").
 * reveal    chapter 2: the diagonal cutting line crosses the solid and each
 *           seam lights up as it passes.
 * explode   chapter 2: the pieces open into the staircase and stay open.
 * grid      chapter 3: the ground grid fades in and subdivides while the view
 *           pulls back (10x10 -> 50x50).
 * shadow    chapter 4: the prism's flat, isometric triangular shadow appears on
 *           the grid, thrown by a light on the left.
 * bands     chapter 5: that shadow triangle opens along the same diagonal cuts
 *           into four labelled bands.
 * converge  chapter 5: the second triangle slides in and meets the first.
 * sliver    chapter 6: the bands lift off the ground and stand up in the prism's
 *           centre plane — the slice from the apex to the base mid-line.
 * ribbons   chapter 6: that sliver spreads into the labelled ribbon stack while
 *           the view zooms into it.
 * settle    the closing state holds.
 */
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
    ribbons: range(s, 6.45, 6.95),
    settle: range(s, 6.6, 7.0),
  }
}

/**
 * How far the view pushes into the ribbon stack at the end — Sunny's "we zoom
 * into that". It multiplies the shared stage scale, so the ribbons grow out of
 * the same space the shadow occupied instead of jumping to a new one.
 */
export const ribbonZoom = (s) => lerp(1, 1.42, easeInOutSine(range(s, 6.4, 7)))

/**
 * The solid steps back once its sliver has left it: smaller, further away and
 * aside, so the labelled ribbons own the frame instead of being drawn over it.
 * 0 while the prism is the subject, 1 once the ribbons are.
 */
export const prismRecede = (s) => easeInOutSine(range(s, 6.0, 6.7))

/** Eased explode amount, 0 closed -> 1 fully open. */
export const explodeAmount = (s) => easeInOutSine(range(s, 2.3, 3.1))

/**
 * Ground grid: fades in through chapter 3 and subdivides as the view pulls
 * back. `coarse` is the 10x10 field, `fine` the 50x50 one drawn over it.
 */
export function gridLevels(s) {
  const grid = range(s, 3.05, 4.0)
  return {
    coarse: easeOutCubic(range(grid, 0, 0.45)),
    fine: easeInOutSine(range(grid, 0.35, 1)),
  }
}

// ─── Orientation ─────────────────────────────────────────────────────────────

/*
 * Yaw and pitch, keyed per chapter. Every yaw stays inside the 25-45 deg band
 * where the silver matcap renders 0% black (qa/matcap-preview.mjs), and pitch
 * inside -6..8 deg, also checked there.
 */
const YAW_KEYS = [
  { t: 0, v: deg(40) },
  { t: 1, v: deg(34) },
  { t: 2, v: deg(30) },
  { t: 3, v: deg(38) },
  // Chapters 4-6 hold a steady angle: the shadow and the sliver are read
  // against the solid, so the solid should stop turning under them.
  { t: 4, v: deg(34) },
  { t: 5, v: deg(33) },
  { t: 7, v: deg(33) },
]

/*
 * From chapter 3 the camera lifts and looks down (CAMERA_PITCH_KEYS), so the
 * ground reads as a floor instead of a set of horizontal lines. That tips the
 * prism toward the viewer by the same angle, so its own pitch is taken back
 * down to keep the angle it is SEEN at inside the -6..8 deg band the matcap was
 * validated over: seen pitch = key + camera pitch.
 */
const PITCH_KEYS = [
  { t: 0, v: deg(2.5) },
  { t: 1, v: deg(6) },
  { t: 2, v: deg(-4) },
  { t: 3, v: deg(-4) },
  { t: 4, v: deg(-8) },
  { t: 5, v: deg(-8) },
  { t: 7, v: deg(-8) },
]

/**
 * How far the camera rises and looks down, in chapter units. Flat on for the
 * hero and the cut — the prism is the subject and the design frames it head-on
 * — then lifting with the zoom-out, because everything after it (the grid, the
 * cast shadow, the bands) lies on the ground and is invisible edge-on.
 */
const CAMERA_PITCH_KEYS = [
  { t: 0, v: 0 },
  { t: 2.5, v: 0 },
  { t: 3.8, v: deg(15) },
  { t: 5, v: deg(16) },
  { t: 7, v: deg(16) },
]

export const cameraPitch = (s) => sampleKeys(CAMERA_PITCH_KEYS, s)

/** Background glow strength behind the prism. */
const GLOW_KEYS = [
  { t: 0, v: 0.55 },
  { t: 1, v: 0.75 },
  { t: 2, v: 1 },
  { t: 3, v: 0.75 },
  { t: 4, v: 0.7 },
  { t: 5, v: 0.72 },
  { t: 7, v: 0.85 },
]

/** Orbit lines and particles: faint at rest, fullest once the view opens out,
 *  then pulled back down so the labelled ribbons are not competed with. */
const AMBIENT_KEYS = [
  { t: 0, v: 0.25 },
  { t: 1, v: 0.32 },
  { t: 2, v: 0.45 },
  { t: 3, v: 0.62 },
  { t: 4, v: 0.62 },
  { t: 5, v: 0.5 },
  { t: 7, v: 0.3 },
]

export const prismYaw = (s) => sampleKeys(YAW_KEYS, s)
export const prismPitch = (s) => sampleKeys(PITCH_KEYS, s)
export const glowIntensity = (s) => sampleKeys(GLOW_KEYS, s)
export const ambientLevel = (s) => sampleKeys(AMBIENT_KEYS, s)

// ─── Exploded composition (art-directed, never random) ───────────────────────

/**
 * How the four slices open, ordered from the right piece (0, with the apex and
 * right face) to the left base corner (3). Each moves by its rank
 * r = 1.5 - i, so the pieces fan out symmetrically about the solid:
 *
 *   gap    along CUT_NORMAL. Rank decreases with slice index, so neighbours
 *          only ever move apart along the cut between them: pieces cannot
 *          intersect, and every cut opens into a visible gap.
 *   slide  along SLIDE_DIR (down-right, parallel to the right edge, the
 *          direction in the buyer's `image10.gif`).
 *   depth  along Z, fanning the staircase toward the camera.
 *   tilt   a slight roll per rank, far too small to close a cut.
 */
export const EXPLODE = { gap: 0.2, slide: 0.24, depth: 0.14, tilt: 0.025 }

/** How much wider the open staircase is than the closed prism (measured). */
const EXPLODE_WIDTH_GROWTH = 0.43

/** Reusable scratch vector — never allocate inside the frame loop. */
const _offset = new THREE.Vector3()

/** Local offset for slice `i` at a given explode amount. */
export function sliceOffset(i, amount, out = _offset) {
  const rank = 1.5 - i
  out.copy(CUT_NORMAL).multiplyScalar(EXPLODE.gap * rank * amount)
  out.addScaledVector(SLIDE_DIR, EXPLODE.slide * rank * amount)
  out.z += EXPLODE.depth * rank * amount
  return out
}

/** Roll (rotation about Z) for slice `i` at a given explode amount. */
export function sliceTilt(i, amount) {
  return EXPLODE.tilt * (1.5 - i) * amount
}

// ─── Framing ─────────────────────────────────────────────────────────────────

/**
 * One camera for every viewport. The prism's on-screen size comes from the
 * chapter anchors instead of per-breakpoint camera distances, so its
 * perspective and matcap shading are the same on a phone as on a desktop.
 */
export const CAMERA = { z: 6, y: 0.1, fov: 40 }

/**
 * Proportion of the prism, as a multiplier on the 2x2x2 solid: height 1.5x the
 * base, the scale `Prism2.jsx` displayed the GLB at in `demo.mp4`.
 */
export const PRISM_SHAPE = [1, 1.5, 1]

/*
 * Silhouette measurements at the hero angle (qa/quick.mjs, 1440x900):
 *   SILHOUETTE_K     on-screen height / (model height / visible height)
 *   SILHOUETTE_DROP  how far below the pivot the silhouette's centre sits
 *   PRISM_ASPECT     silhouette width / height (closed prism)
 */
export const SILHOUETTE_K = 1.105
export const SILHOUETTE_DROP = 0.056
export const PRISM_ASPECT = 0.83

/** Group scale that renders the prism at `fraction` of the stage height. */
export function scaleForFraction(fraction) {
  const visibleHeight =
    2 * CAMERA.z * Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2))
  return (fraction * visibleHeight) / (2 * PRISM_SHAPE[1] * SILHOUETTE_K)
}

/** Widest the prism may be drawn, as a share of the stage width. */
const MAX_WIDTH_SHARE = 0.62
const MAX_WIDTH_SHARE_STACKED = 0.84

/**
 * The prism's framing at chapter-units `s`: it holds at the current chapter's
 * anchor for the first third of that chapter, then eases to the next one, so
 * the beats read as moves rather than constant drift. Writes into `out`.
 *
 * `anchors` are read from each chapter's CSS custom properties, so a media
 * query can re-place the prism per breakpoint without touching this code.
 */
export function frameAt(s, layout, explodeScale, out) {
  const anchors = layout.anchors
  const last = anchors.length - 1
  const i = Math.min(last, Math.max(0, Math.floor(s)))
  const move = easeInOutSine(clamp01((s - i - 0.3) / 0.7))

  const a = anchors[i]
  const b = anchors[Math.min(last, i + 1)]

  out.cx = lerp(a.cx, b.cx, move)
  out.cy = lerp(a.cy, b.cy, move)

  const growth = 1 + EXPLODE_WIDTH_GROWTH * explodeAmount(s) * explodeScale
  const share = layout.stacked ? MAX_WIDTH_SHARE_STACKED : MAX_WIDTH_SHARE
  const widthCap = (share * layout.aspect) / (PRISM_ASPECT * growth)

  out.fraction = Math.min(lerp(a.fraction, b.fraction, move), widthCap)
  return out
}

/**
 * Per-width motion tuning. On phones the explode travel is damped so the open
 * slices stay inside the screen, and pointer parallax is off (no mouse).
 */
export function getComposition(width) {
  if (width < 480) return { explodeScale: 0.6, pointerStrength: 0 }
  if (width < 768) return { explodeScale: 0.72, pointerStrength: 0 }
  if (width < 1100) return { explodeScale: 0.88, pointerStrength: 0.7 }
  return { explodeScale: 1.0, pointerStrength: 1 }
}
