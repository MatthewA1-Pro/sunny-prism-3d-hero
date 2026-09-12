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
 *
 * Magnitudes come from the buyer's own `image10.gif`, which is the clearest
 * statement of intent in any reference: the triangle is cut by two thin
 * diagonal lines, the pieces slide a short distance ALONG those cuts to leave a
 * notched silhouette, and then close again. The shift there is roughly a tenth
 * of the triangle's width — a deliberate notch, not a burst.
 *
 * Keeping it small also keeps the material right: a big separation turns the
 * interior cut faces toward the camera, and a face pointing at the camera
 * samples the black centre of the matcap. Modest offsets leave those faces as
 * slivers and preserve the prism silhouette.
 */
export const SLICE_TRANSFORMS = [
  { slide: 0.22, depth: 0.05, tilt: -0.03, yaw: 0.02, lift: 0.04 },
  { slide: -0.18, depth: -0.08, tilt: 0.035, yaw: -0.03, lift: -0.015 },
  { slide: 0.26, depth: 0.09, tilt: -0.045, yaw: 0.035, lift: 0.015 },
  { slide: -0.3, depth: -0.06, tilt: 0.05, yaw: -0.025, lift: -0.04 },
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
 * Desktop framing is checked against the reference rather than guessed. At
 * z = 6 with a 40 degree vertical FOV the prism fills 56% of viewport height;
 * normalised by viewport height squared (the FOV is vertical, so that is the
 * size-invariant comparison) its area is within about 10% of the hero frame of
 * `demo.mp4`.
 *
 * Phones keep the same 40 degree FOV. A wider FOV only exaggerates perspective,
 * and because a matcap is sampled per fragment by view direction it also pushes
 * the chrome toward the texture's dark regions. The first mobile pass used 52
 * degrees with a conservative scale and measured the prism at just 23% of a
 * 390x844 viewport — a shrunken desktop scene rather than a composed mobile one.
 * The prism is now sized so its silhouette spans roughly 78% of the screen
 * width, leaving margin for the (damped) explode.
 */
export function getComposition(width, height) {
  const portrait = height > width

  if (width < 480) {
    return {
      cameraZ: 8.6,
      fov: 40,
      scale: 0.9,
      groupY: 0.05,
      explodeScale: 0.6,
      pointerStrength: 0,
      isSmall: true,
    }
  }
  if (width < 768) {
    return {
      cameraZ: 8.0,
      fov: 40,
      scale: 0.92,
      groupY: 0.06,
      explodeScale: 0.72,
      pointerStrength: 0,
      isSmall: true,
    }
  }
  if (width < 1100) {
    return {
      cameraZ: 6.6,
      fov: 42,
      scale: portrait ? 0.92 : 0.97,
      groupY: 0.06,
      explodeScale: 0.88,
      pointerStrength: 0.7,
      isSmall: false,
    }
  }
  return {
    cameraZ: 6.0,
    fov: 40,
    scale: 1.0,
    groupY: 0.06,
    explodeScale: 1.0,
    pointerStrength: 1,
    isSmall: false,
  }
}

// ─── Rotation choreography ───────────────────────────────────────────────────

/**
 * Proportion of the prism, as a multiplier on the 2x2x2 solid.
 *
 * `Prism2.jsx` displayed the GLB at scale [0.6, 0.9, 0.6] (height/base = 3.0),
 * which suggested the prism should be stretched vertically. Measuring the
 * reference settles it the other way: the unstretched pyramid reproduces the
 * silhouette of the `demo.mp4` hero frame, while a 1.5x stretch cannot —
 * matching its area makes the prism far too tall, and matching its height
 * makes it far too narrow (coverage fell from 5.1% to 2.6%).
 *
 * So that old scale was a test-scene value, not the intended proportion, and
 * the prism stays uniform.
 */
export const PRISM_SHAPE = [1, 1, 1]

/**
 * Base yaw of the whole prism as a function of the stages.
 *
 * This angle is a material decision, not just a compositional one.
 *
 * A matcap is indexed by the view-space normal, so for flat faces the
 * orientation alone decides which part of the texture each face samples — and
 * `matcap.png` is mostly black, with its bright content in a star (upper left),
 * a rainbow band (right) and a swoosh (lower left).
 *
 * `qa/matcap-solver.mjs` sweeps orientations against the real texture and
 * area-weights the result. At these proportions the optimum is yaw 56 deg,
 * scoring 125.8 against 105 at 45 deg. Luminance holds across roughly 53-62
 * deg and falls away sharply outside it.
 *
 * So the yaw stays inside that narrow band for the entire timeline. The
 * choreography comes from the slicing, never from spinning the object.
 *
 * The hero sits at 45 deg rather than the solver's 56 deg peak: corner-on is
 * where the silhouette is widest and closest to the reference framing, at a
 * measured luminance of 136-142 against the reference's 147. Holding 56 deg
 * instead narrows the silhouette (coverage 5.2% down to 3.5%).
 *
 * The yaw then drifts up into the solver's bright band as the prism opens,
 * where the extra luminance is needed for the newly exposed cut faces. There is
 * no dark valley in between — the solver scores 105 / 106 / 119 at 45 / 50 / 55
 * deg — so the drift stays lit the whole way.
 */
const YAW_HERO = 0.7854 // 45 deg — widest silhouette, matches reference framing
const YAW_REVEAL = 0.9774 // 56 deg — solver optimum, lights the cut faces
const YAW_SETTLE = 1.0123 // 58 deg

export function baseYaw(s) {
  let yaw = lerp(YAW_HERO, YAW_REVEAL, easeInOutCubic(s.turn))
  yaw = lerp(yaw, YAW_SETTLE, easeInOutCubic(s.settle))
  return yaw
}

/**
 * Pitch. 2.5 deg at the hero measured best (luminance 142, saturation 0.20 —
 * closest to the reference hero), tilting to 6 deg for the section scan, which
 * drops the interior cut faces further into the matcap swoosh once the prism
 * has opened. The solver rates pitch 4-8 deg best overall; going further dims
 * the two main faces more than it brightens the cut faces.
 */
export function basePitch(s) {
  return lerp(0.0436, 0.1047, easeInOutSine(s.section))
}

/** Initial orientation, so the first frame is already the hero angle. */
export const INITIAL_YAW = YAW_HERO
export const INITIAL_PITCH = 0.0436
