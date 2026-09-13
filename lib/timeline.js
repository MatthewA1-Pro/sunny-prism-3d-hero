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
 * (0 - 0.04)  hero at rest: closed prism, full size on load, idle breathing
 *             only — no stage key, since nothing structural animates yet
 * turn       prism eases toward the angle where the cuts read clearly
 * reveal      the diagonal cutting plane sweeps through the closed solid and
 *             each seam lights up as the plane passes it
 * explode     slices slide apart along the cut planes
 * reassemble  after a short hold, slices glide back into one solid — the
 *             close of the buyer's own `image10.gif` loop
 * section     horizontal cross-section rising base -> apex over the whole
 *             solid (shapes.pptx `image2.gif`)
 * settle      final angle; seams dim to a quiet resting state
 *
 * The horizontal section runs only once the solid is (nearly) whole again.
 * Scanning scattered pieces would draw a square that is not the cross-section
 * of anything on screen.
 */
export function getStages(p) {
  return {
    turn: range(p, 0.04, 0.3),
    reveal: range(p, 0.08, 0.34),
    explode: range(p, 0.24, 0.46),
    reassemble: range(p, 0.54, 0.76),
    section: range(p, 0.62, 0.92),
    settle: range(p, 0.86, 1.0),
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
 * Measured with qa/quick.mjs (apex to front base corner, and silhouette width):
 *
 *   desktop  1920x1080 / 1440x900 / 1366x768   ~50% of viewport height
 *   tablet   1024x768 49% tall; 768x1024 47% tall, 52% wide
 *   phones   430x932 / 390x844 / 375x812       37-38% tall, 69% wide,
 *                                              71-72% wide at full explode
 *
 * Phones are width-limited: the tall prism is sized so the exploded pieces keep
 * ~14% of the screen free on each side, with explode travel damped to 0.6.
 *
 * Phones keep the same 40 degree FOV. A wider FOV only exaggerates perspective,
 * and because a matcap is sampled per fragment by view direction it also shifts
 * which part of the texture each face picks up, away from the tuned yaw band.
 */
export function getComposition(width, height) {
  const portrait = height > width

  // The camera sits almost level with the prism's centre: in the demo hero the
  // front base corner dips only ~5% of the prism height below the side corners,
  // so the object is seen nearly side-on rather than looked down upon.
  if (width < 480) {
    return {
      cameraZ: 8.6,
      cameraY: 0.1,
      fov: 40,
      scale: 0.72,
      groupY: 0,
      explodeScale: 0.6,
      pointerStrength: 0,
      isSmall: true,
    }
  }
  if (width < 768) {
    return {
      cameraZ: 8.0,
      cameraY: 0.1,
      fov: 40,
      scale: 0.74,
      groupY: 0,
      explodeScale: 0.72,
      pointerStrength: 0,
      isSmall: true,
    }
  }
  if (width < 1100) {
    return {
      cameraZ: 6.6,
      cameraY: 0.1,
      fov: 42,
      scale: portrait ? 0.72 : 0.74,
      groupY: 0,
      explodeScale: 0.88,
      pointerStrength: 0.7,
      isSmall: false,
    }
  }
  // Desktop: apex to front base corner spans ~50% of viewport height — the
  // demo.mp4 hero measures 52% — leaving headroom for the explode.
  return {
    cameraZ: 6.0,
    cameraY: 0.1,
    fov: 40,
    scale: 0.66,
    groupY: 0,
    explodeScale: 1.0,
    pointerStrength: 1,
    isSmall: false,
  }
}

// ─── Rotation choreography ───────────────────────────────────────────────────

/**
 * Proportion of the prism, as a multiplier on the 2x2x2 solid.
 *
 * `demo.mp4` recorded `Prism2.jsx`, which displays the GLB at scale
 * [0.6, 0.9, 0.6] — height 1.5x the base. The hero frame agrees: apex to base
 * spans ~415 px against a ~380 px silhouette width (w/h 0.92) at a near
 * corner-on yaw, where an unstretched pyramid measures w/h ~1.13.
 *
 * An earlier pass kept the prism uniform on the strength of a coverage metric
 * that counted only pixels brighter than luminance 35 — it ignored black
 * matcap regions entirely, so it could not compare silhouettes reliably.
 */
export const PRISM_SHAPE = [1, 1.5, 1]

/**
 * Base yaw of the whole prism as a function of the stages.
 *
 * This angle is a material decision, not just a compositional one. A matcap is
 * indexed by the view-space normal, so for flat faces the orientation decides
 * which part of the texture each face samples.
 *
 * `qa/matcap-preview.mjs` renders the prism offline with the exact shader
 * (silver matcap layer + ACES tone mapping). At the tall proportion it measures
 * 0% black across yaw 25-45 deg, 13% at 55 and 47% at 65, and 72% at 15. So the
 * yaw stays inside 30-42 deg for the whole timeline; the choreography comes
 * from the slicing, never from spinning the object.
 *
 * The hero sits at 40 deg, the near corner-on angle of the `demo.mp4` hero
 * (front base corner just right of centre), and eases a few degrees toward face-on
 * as the cuts open, which turns the right face — the face every cut runs
 * parallel to — further toward the camera. Once whole again it returns close
 * to the hero angle: nearer face-on, the right face picks up the matcap's green
 * band and loses the warm silver of the hero.
 */
const YAW_HERO = 0.6981 // 40 deg — demo.mp4 hero angle
const YAW_REVEAL = 0.5934 // 34 deg — cut faces turn toward camera
const YAW_SETTLE = 0.6632 // 38 deg — warm silver again on the closed solid

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
