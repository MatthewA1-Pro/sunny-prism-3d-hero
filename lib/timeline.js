import * as THREE from 'three'
import { SLIDE_DIR } from './prismGeometry'

/**
 * Sunny Prism — animation timeline and hero framing.
 *
 * There is exactly one authoritative value in this experience: a normalized
 * scroll progress in [0, 1]. Every transform in the scene — and the fade of the
 * hero copy — is a pure function of it, which is what makes reverse scrubbing
 * exact rather than approximate.
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
 * (0 - 0.04)  hero at rest: the designed hero — copy, stats and the closed
 *             prism in its place in the layout, idle breathing only
 * turn        prism eases toward the angle where the cuts read clearly
 * reveal      the diagonal cutting plane sweeps through the closed solid and
 *             each seam lights up as the plane passes it
 * explode     slices slide apart along the cut planes
 * reassemble  after a short hold, slices glide back into one solid — the
 *             close of the buyer's own `image10.gif` loop
 * section     horizontal cross-section rising base -> apex over the whole
 *             solid (shapes.pptx `image2.gif`)
 * settle      final angle; seams dim to a quiet resting state
 *
 * Alongside these, `getFocus` moves the prism from its layout slot to centre
 * stage while the copy fades (0.06-0.30), and back again at the end
 * (0.84-1.0), so the page both opens and closes on the complete hero.
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

/** 0 = prism in its hero layout slot, 1 = prism at centre stage. */
export function getFocus(p) {
  return (
    easeInOutCubic(range(p, 0.1, 0.3)) *
    (1 - easeInOutCubic(range(p, 0.84, 0.98)))
  )
}

/**
 * Opacity of the hero copy and stats. Fully readable at rest, gone before the
 * prism reaches centre stage, back for the closing hero.
 */
export function getContentVisibility(p) {
  const out = easeInOutSine(range(p, 0.06, 0.22))
  const back = easeInOutSine(range(p, 0.88, 1.0))
  return 1 - out * (1 - back)
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
 * Magnitudes come from the buyer's own `image10.gif`: the triangle is cut by
 * thin diagonal lines, the pieces slide a short distance ALONG those cuts to
 * leave a notched silhouette, and then close again — a deliberate notch, not a
 * burst.
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
 * World-space offset for slice `i` at a given explode amount.
 * Writes into `out` and returns it.
 */
export function sliceOffset(i, amount, out = _offset) {
  const t = SLICE_TRANSFORMS[i]
  out.copy(SLIDE_DIR).multiplyScalar(t.slide * amount)
  out.z += t.depth * amount
  out.y += t.lift * amount
  return out
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
 *   PRISM_ASPECT     silhouette width / height.
 */
export const SILHOUETTE_K = 1.105
export const SILHOUETTE_DROP = 0.056
export const PRISM_ASPECT = 0.83

/** Prism height inside its slot; the rest is breathing room. */
const SLOT_FILL = 0.9
/** The hero prism never spans more than this share of the stage width. */
const SLOT_MAX_WIDTH = 0.8
/** Centre-stage size while the slices open, as a share of stage height... */
const FOCUS_FILL = 0.62
/** ...capped so the explode still fits across a narrow screen. */
const FOCUS_MAX_WIDTH = 0.66

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
 * Prism framing from the DOM: the stage rect and the `.prism-slot` rect, both
 * from getBoundingClientRect. Returns stage-relative fractions.
 */
export function layoutFromRects(stage, slot) {
  const aspect = stage.width / stage.height
  const widthCap = (share) => (share * aspect) / PRISM_ASPECT

  const slotF = Math.min(
    (slot.height * SLOT_FILL) / stage.height,
    widthCap(SLOT_MAX_WIDTH)
  )

  return {
    slotX: (slot.left + slot.width / 2 - stage.left) / stage.width,
    slotY: (slot.top + slot.height / 2 - stage.top) / stage.height,
    slotF,
    focusF: Math.max(slotF, Math.min(FOCUS_FILL, widthCap(FOCUS_MAX_WIDTH))),
  }
}

/** Screen framing between the layout slot and centre stage. Writes into `out`. */
export function framePrism(focus, layout, out) {
  out.cx = lerp(layout.slotX, 0.5, focus)
  out.cy = lerp(layout.slotY, 0.5, focus)
  out.fraction = lerp(layout.slotF, layout.focusF, focus)
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

// ─── Rotation choreography ───────────────────────────────────────────────────

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
 * (front base corner just right of centre), and eases a few degrees toward
 * face-on as the cuts open, which turns the right face — the face every cut
 * runs parallel to — further toward the camera. Once whole again it returns
 * close to the hero angle: nearer face-on, the right face picks up the matcap's
 * green band and loses the warm silver of the hero.
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
 * Pitch. 2.5 deg at the hero, tilting to 6 deg for the section scan, which
 * shows the rising section from slightly above.
 */
export function basePitch(s) {
  return lerp(0.0436, 0.1047, easeInOutSine(s.section))
}

/** Initial orientation, so the first frame is already the hero angle. */
export const INITIAL_YAW = YAW_HERO
export const INITIAL_PITCH = 0.0436
