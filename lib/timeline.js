import * as THREE from 'three'
import { CUT_NORMAL, SLIDE_DIR } from './prismGeometry'

/**
 * Sunny Prism — animation timeline and hero framing.
 *
 * There is exactly one authoritative value in this experience: a normalized
 * scroll progress in [0, 1]. Every transform in the scene — the prism, its
 * path through the hero, the copy drift and the background glow — is a pure
 * function of it, which is what makes reverse scrubbing exact.
 *
 * Two references shape it:
 *   - the hero animation storyboard: the copy stays readable while the prism
 *     floats, moves toward the centre, comes closer while rotating, moves back
 *     to the right and settles, with glow and ambient orbit lines;
 *   - Sunny's requirement: the prism is cut along the diagonal slicing
 *     system, opens into an exploded view and shows its cross-section.
 *
 * The sequence only ever moves FORWARD: nothing closes back up and the copy is
 * never hidden and re-shown, so scrolling down never reads as a rewind.
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

/**
 * Cubic Hermite (Catmull-Rom style) interpolation through keyframes
 * [{ t, v }, ...] with ascending t. Velocity is continuous through every key,
 * so the prism flows through the storyboard beats instead of stopping at each
 * one. Keys may be unevenly spaced. Allocation-free.
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

// ─── Storyboard beats ────────────────────────────────────────────────────────
//
//   0.00  1 initial hero     prism in its slot, tilted, floating
//   0.30  2 scroll begins    turns, drifts toward the centre, slight push-in
//   0.60  3 main transition  closer and slightly left, other faces turn in
//   0.85  4 new state        back toward the right, scale eases down
//   1.00  5 final state      settles; rotation stabilises
//
// Offsets are shares of the stage, applied on top of the prism's layout slot,
// and scaled by `layout.travel` (full on wide screens, none on phones, where
// the prism stays under the copy). Every yaw stays in the 25-45 deg band where
// the silver matcap renders 0% black (qa/matcap-preview.mjs), and every pitch
// in the -6..8 deg range checked there too.

const PATH_X = [
  { t: 0, v: 0 },
  { t: 0.3, v: -0.02 },
  { t: 0.6, v: -0.03 },
  { t: 0.85, v: 0.04 },
  { t: 1, v: 0.04 },
]

const PATH_Y = [
  { t: 0, v: 0 },
  { t: 0.3, v: -0.03 },
  { t: 0.6, v: -0.01 },
  { t: 0.85, v: 0.01 },
  { t: 1, v: 0.01 },
]

const PATH_SCALE = [
  { t: 0, v: 1 },
  { t: 0.3, v: 1.08 },
  { t: 0.6, v: 1.15 },
  { t: 0.85, v: 0.9 },
  { t: 1, v: 0.9 },
]

const YAW_KEYS = [
  { t: 0, v: deg(40) },
  { t: 0.3, v: deg(30) },
  { t: 0.6, v: deg(44) },
  { t: 0.85, v: deg(34) },
  { t: 1, v: deg(36) },
]

const PITCH_KEYS = [
  { t: 0, v: deg(2.5) },
  { t: 0.3, v: deg(-4) },
  { t: 0.6, v: deg(5) },
  { t: 0.85, v: deg(-3) },
  { t: 1, v: deg(1) },
]

/** Background glow strength behind the prism: rises into the main transition. */
const GLOW_KEYS = [
  { t: 0, v: 0.55 },
  { t: 0.3, v: 0.72 },
  { t: 0.6, v: 1 },
  { t: 0.85, v: 0.82 },
  { t: 1, v: 0.8 },
]

/** Orbit lines and particles: faint at rest, fullest in the final state. */
const AMBIENT_KEYS = [
  { t: 0, v: 0.25 },
  { t: 0.3, v: 0.3 },
  { t: 0.6, v: 0.45 },
  { t: 0.85, v: 0.62 },
  { t: 1, v: 0.66 },
]

export const prismYaw = (p) => sampleKeys(YAW_KEYS, p)
export const prismPitch = (p) => sampleKeys(PITCH_KEYS, p)
export const glowIntensity = (p) => sampleKeys(GLOW_KEYS, p)
export const ambientLevel = (p) => sampleKeys(AMBIENT_KEYS, p)

// ─── Geometry stages (Sunny's slicing requirement) ───────────────────────────

const EXPLODE_START = 0.3
const EXPLODE_END = 0.8

/**
 * reveal   the diagonal cutting line crosses the closed prism; each seam
 *          lights up as it passes
 * explode  the pieces open steadily into the diagonal staircase and stay open
 * section  a horizontal cross-section rises base -> apex through every piece
 *          (shapes.pptx `image2.gif`)
 * settle   seams soften in the final composition
 */
export function getStages(p) {
  return {
    reveal: range(p, 0.12, 0.34),
    explode: range(p, EXPLODE_START, EXPLODE_END),
    section: range(p, 0.5, 0.82),
    settle: range(p, 0.8, 1.0),
  }
}

/** Eased explode amount, 0 closed -> 1 fully open. */
export const explodeAmount = (p) =>
  easeInOutSine(range(p, EXPLODE_START, EXPLODE_END))

// ─── Hero content ────────────────────────────────────────────────────────────

/** Copy stays readable the whole way and drifts up slightly (text parallax). */
export const copyDrift = (p) => -28 * easeInOutSine(p)

/**
 * Stats clear early on wide layouts, where the prism's path crosses their
 * column. On phones they sit below the prism and stay.
 */
export const statsVisibility = (p) => 1 - easeInOutSine(range(p, 0.08, 0.24))

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
 *          direction in the buyer's `image10.gif`). Right pieces step down,
 *          left pieces step up — the diagonal staircase of demo.mp4's
 *          exploded frames.
 *   depth  along Z, fanning the staircase toward the camera.
 *   tilt   a slight roll per rank. Its largest relative swing between
 *          neighbours (0.025 rad over at most 1.7 units) stays well inside the
 *          gap, so it cannot close a cut.
 */
export const EXPLODE = { gap: 0.2, slide: 0.24, depth: 0.14, tilt: 0.025 }

/**
 * How much wider the fully open staircase is than the closed prism, measured
 * from renders (647 px against 463 px closed at 1440x900).
 */
const EXPLODE_WIDTH_GROWTH = 0.43

/** Reusable scratch vector — never allocate inside the frame loop. */
const _offset = new THREE.Vector3()

/**
 * Local offset for slice `i` at a given explode amount.
 * Writes into `out` and returns it.
 */
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

// ─── Hero framing ────────────────────────────────────────────────────────────

/**
 * One camera for every viewport. The prism's on-screen size comes from the
 * hero layout instead of per-breakpoint camera distances, so its perspective
 * and matcap shading are the same on a phone as on a desktop.
 */
export const CAMERA = { z: 6, y: 0.1, fov: 40 }

/**
 * Proportion of the prism, as a multiplier on the 2x2x2 solid.
 *
 * `demo.mp4` recorded `Prism2.jsx`, which displays the GLB at scale
 * [0.6, 0.9, 0.6] — height 1.5x the base. The hero frame agrees: apex to base
 * spans ~415 px against a ~380 px silhouette width (w/h 0.92) at a near
 * corner-on yaw, where an unstretched pyramid measures w/h ~1.13.
 */
export const PRISM_SHAPE = [1, 1.5, 1]

/*
 * Silhouette measurements at the hero angle, taken from renders with
 * qa/quick.mjs (1440x900, scale 0.66):
 *
 *   SILHOUETTE_K     on-screen height / (model height / visible height).
 *                    Above 1 because the front base corner dips toward the
 *                    camera below the base plane.
 *   SILHOUETTE_DROP  the silhouette's centre sits this share of its own height
 *                    below the pivot, for the same reason.
 *   PRISM_ASPECT     silhouette width / height (closed prism).
 */
export const SILHOUETTE_K = 1.105
export const SILHOUETTE_DROP = 0.056
export const PRISM_ASPECT = 0.83

/** Prism height inside its slot; the rest is breathing room. */
const SLOT_FILL = 0.9
/** The hero prism never spans more than this share of the stage width. */
const SLOT_MAX_WIDTH = 0.8

/**
 * Group scale that renders the prism at `fraction` of the stage height.
 * Scale-invariant with the lens shift, so it holds at any slot position.
 */
export function scaleForFraction(fraction) {
  const visibleHeight =
    2 * CAMERA.z * Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2))
  return (fraction * visibleHeight) / (2 * PRISM_SHAPE[1] * SILHOUETTE_K)
}

/**
 * Prism framing inputs from the DOM: the stage rect and the `.prism-slot`
 * rect (getBoundingClientRect), plus whether the stacked phone layout is in
 * use. Returns stage-relative fractions.
 */
export function layoutFromRects(stage, slot, stacked) {
  const aspect = stage.width / stage.height
  const slotF = Math.min(
    (slot.height * SLOT_FILL) / stage.height,
    (SLOT_MAX_WIDTH * aspect) / PRISM_ASPECT
  )

  return {
    slotX: (slot.left + slot.width / 2 - stage.left) / stage.width,
    slotY: (slot.top + slot.height / 2 - stage.top) / stage.height,
    slotF,
    aspect,
    stacked,
    // Sideways travel needs room beside the copy: none on stacked layouts,
    // growing from 4:3 screens to full at 16:9 and wider.
    travel: stacked ? 0 : clamp01((aspect - 1.2) / 0.6),
    // Widest the open staircase may get, as a share of the stage width.
    maxWidthShare: stacked ? 0.84 : 0.62,
  }
}

/**
 * The prism's screen framing at progress `p`: its slot, moved along the
 * storyboard path, sized by the push-in / pull-back keys, and always narrow
 * enough for the open staircase to fit. Writes into `out`.
 */
export function framePrism(p, layout, explodeScale, out) {
  out.cx = layout.slotX + sampleKeys(PATH_X, p) * layout.travel
  out.cy = layout.slotY + sampleKeys(PATH_Y, p) * layout.travel

  const growth = 1 + EXPLODE_WIDTH_GROWTH * explodeAmount(p) * explodeScale
  const widthCap =
    (layout.maxWidthShare * layout.aspect) / (PRISM_ASPECT * growth)
  out.fraction = Math.min(layout.slotF * sampleKeys(PATH_SCALE, p), widthCap)
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
