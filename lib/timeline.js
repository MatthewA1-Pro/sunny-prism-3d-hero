import * as THREE from 'three'
import { SLIDE_DIR } from './prismGeometry'

/**
 * Sunny Prism — animation timeline.
 *
 * There is exactly one authoritative value in this experience: a normalized
 * scroll progress in [0, 1]. Every transform in the scene is a pure function of
 * it, which is what makes reverse scrubbing exact rather than approximate.
 *
 * Stages deliberately OVERLAP. The deployed revision ran four hard quarters and
 * a separate component tree for the finale, which is why it reads as two
 * unrelated scenes cutting to each other. Overlapping ranges keep one object
 * continuously transforming.
 */

// ─── Scalar helpers ──────────────────────────────────────────────────────────

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Normalized position of `x` inside [a, b], clamped. */
export const range = (x, a, b) => clamp01((x - a) / (b - a))

export const lerp = (a, b, t) => a + (b - a) * t

export const easeInOutCubic = (x) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2

export const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3)

export const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x))

export const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2

/**
 * Frame-rate independent exponential damping.
 * Wraps THREE.MathUtils.damp so the feel is identical at 60/90/120/144 Hz.
 */
export const damp = (current, target, lambda, delta) =>
  THREE.MathUtils.damp(current, target, lambda, delta)

// ─── Stage map ───────────────────────────────────────────────────────────────

/**
 * Overlapping stage progresses derived from one scroll value.
 *
 * hero    closed prism, already full size, idle breathing
 * turn    prism rotates toward the face-on angle where the cuts read clearly
 * reveal  cut seams ignite and the diagonal plane sweeps through the solid
 * explode slices slide apart along the cut direction
 * section base plate + horizontal cross-section rise (shapes.pptx image2.gif)
 * settle  pieces ease into the final art-directed composition
 */
export function getStages(p) {
  return {
    hero: range(p, 0.0, 0.1),
    turn: range(p, 0.05, 0.3),
    reveal: range(p, 0.16, 0.44),
    explode: range(p, 0.32, 0.64),
    section: range(p, 0.5, 0.86),
    settle: range(p, 0.78, 1.0),
  }
}

// ─── Exploded transforms (art-directed, never random) ────────────────────────

/**
 * Explicit closed -> exploded transform for each of the four structural slices,
 * ordered from the right edge (0) round to the left base corner (3).
 *
 * `slide` is measured along SLIDE_DIR, which runs parallel to the right edge —
 * the direction the buyer's `image10.gif` shows the pieces travelling.
 * `depth` is along Z.
 *
 * Both SLIDE_DIR and Z lie *inside* every cut plane (their dot product with the
 * cut normal is exactly zero), so however far a slice travels it stays on its
 * own side of every cut. Intersection between slices is geometrically
 * impossible rather than merely avoided by eye.
 */
export const SLICE_TRANSFORMS = [
  { slide: 0.30, depth: 0.10, tilt: -0.05, yaw: 0.04, lift: 0.05 },
  { slide: -0.24, depth: -0.16, tilt: 0.06, yaw: -0.05, lift: -0.02 },
  { slide: 0.34, depth: 0.18, tilt: -0.07, yaw: 0.06, lift: 0.02 },
  { slide: -0.42, depth: -0.12, tilt: 0.08, yaw: -0.04, lift: -0.05 },
]

/**
 * The composition the pieces settle into. Slightly tighter than the full
 * explode so the silhouette reads as the deliberate notched form from
 * `image10.gif` rather than as scattered debris.
 */
export const SETTLE_SCALE = 0.62

/** Reusable scratch vector — never allocate inside the frame loop. */
const _offset = new THREE.Vector3()

/**
 * World-space offset for slice `i` at a given explode/settle amount.
 * Writes into `out` and returns it.
 */
export function sliceOffset(i, amount, out = _offset) {
  const t = SLICE_TRANSFORMS[i]
  out.copy(SLIDE_DIR).multiplyScalar(t.slide * amount)
  out.z += t.depth * amount
  out.y += t.lift * amount
  return out
}

// ─── Responsive composition ──────────────────────────────────────────────────

/**
 * Camera and scale per breakpoint.
 *
 * Desktop framing is derived from the reference rather than guessed: the prism
 * is 2 units tall, so at z = 6 with a 40 degree vertical FOV the visible height
 * is 2 * 6 * tan(20 deg) = 4.368 units and the prism occupies 2 / 4.368 = 46%
 * of the viewport — inside the 40-50% band the brief specifies, and a match for
 * `demo.mp4`.
 *
 * Narrow viewports pull the camera back and widen the FOV so the exploded
 * silhouette still fits, and damp the explode offsets so pieces do not leave
 * the frame.
 */
export function getComposition(width, height) {
  const portrait = height > width

  if (width < 480) {
    return {
      cameraZ: 8.2,
      fov: 52,
      scale: 0.78,
      groupY: 0.08,
      explodeScale: 0.68,
      pointerStrength: 0,
      isSmall: true,
    }
  }
  if (width < 768) {
    return {
      cameraZ: 7.4,
      fov: 46,
      scale: 0.88,
      groupY: 0.1,
      explodeScale: 0.8,
      pointerStrength: 0,
      isSmall: true,
    }
  }
  if (width < 1100) {
    return {
      cameraZ: 6.6,
      fov: 42,
      scale: portrait ? 0.92 : 1.0,
      groupY: 0.1,
      explodeScale: 0.9,
      pointerStrength: 0.7,
      isSmall: false,
    }
  }
  return {
    cameraZ: 6.0,
    fov: 40,
    scale: 1.0,
    groupY: 0.1,
    explodeScale: 1.0,
    pointerStrength: 1,
    isSmall: false,
  }
}

// ─── Rotation choreography ───────────────────────────────────────────────────

/**
 * Base yaw of the whole prism as a function of the stages.
 *
 * Starts at a three-quarter angle so the hero reads as a solid 3D object with
 * two lit faces (matching `demo.mp4`), then eases toward face-on while the
 * cuts are revealing, because the diagonal slicing is most legible when the
 * silhouette is closest to the reference triangle. It drifts back slightly on
 * settle so the final composition keeps depth.
 */
export function baseYaw(s) {
  const heroYaw = 0.38
  const revealYaw = 0.12
  const settleYaw = 0.26

  let yaw = lerp(heroYaw, revealYaw, easeInOutCubic(s.turn))
  yaw = lerp(yaw, settleYaw, easeInOutCubic(s.settle))
  return yaw
}

/** Slight downward pitch so a sliver of the base plane stays visible. */
export function basePitch(s) {
  return lerp(0.06, 0.16, easeInOutSine(s.section))
}
