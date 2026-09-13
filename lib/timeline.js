import * as THREE from 'three'
import { CUT_NORMAL, SLIDE_DIR } from './prismGeometry'

/**
 * Sunny Prism — animation timeline and hero framing.
 *
 * There is exactly one authoritative value in this experience: a normalized
 * scroll progress in [0, 1]. Every transform in the scene — and the fade of the
 * hero copy — is a pure function of it, which is what makes reverse scrubbing
 * exact rather than approximate.
 *
 * The sequence only ever moves FORWARD. Scrolling down never undoes an earlier
 * state: no pieces closing back up, no prism returning to its slot, no copy
 * coming back. An earlier revision ended by reassembling the prism in the hero
 * layout, and scrolling down read as the animation playing in reverse.
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
 * The requirement's states, as overlapping progress ranges. Each stage builds
 * on the previous one and none is ever undone, following demo.mp4: the hero
 * prism turns, the cuts appear, the pieces open progressively into a diagonal
 * staircase, and the video ends on that exploded composition.
 *
 * STATE 0  hero        (0 - 0.04) the designed hero at rest
 * STATE 1  motion      getFocus / getContentVisibility: copy clears and the
 *                      prism glides to centre stage; `turn` rotates it
 * STATE 2  reveal      the diagonal cutting line crosses the prism and each
 *                      seam lights up as it passes
 * STATE 3  explode     pieces separate steadily across the rest of the scroll
 * STATE 4  section     a horizontal cross-section rises base -> apex through
 *                      every piece (shapes.pptx `image2.gif`)
 * STATE 5  settle      final angle; the exploded composition holds
 */
export function getStages(p) {
  return {
    turn: range(p, 0.06, 0.4),
    reveal: range(p, 0.18, 0.4),
    explode: range(p, 0.34, 0.9),
    section: range(p, 0.6, 0.92),
    settle: range(p, 0.86, 1.0),
  }
}

/** 0 = prism in its hero layout slot, 1 = prism at centre stage. */
export function getFocus(p) {
  return easeInOutCubic(range(p, 0.06, 0.28))
}

/** Opacity of the hero copy and stats: readable at rest, cleared early. */
export function getContentVisibility(p) {
  return 1 - easeInOutSine(range(p, 0.04, 0.18))
}

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
/** Centre-stage size of the closed prism, as a share of stage height... */
const FOCUS_FILL = 0.62
/** ...capped so the fully exploded pieces (up to ~1.4x wider) still fit. */
const FOCUS_MAX_WIDTH = 0.58

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
    // Grow to FOCUS_FILL where there is room, but the width cap always wins:
    // on a narrow phone the exploded staircase must stay inside the screen,
    // even if that makes centre stage slightly smaller than the hero slot.
    focusF: Math.min(Math.max(slotF, FOCUS_FILL), widthCap(FOCUS_MAX_WIDTH)),
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

// ─── Orientation ─────────────────────────────────────────────────────────────

/**
 * Yaw. This angle is a material decision, not just a compositional one: a
 * matcap is indexed by the view-space normal, so orientation decides which
 * part of the texture each flat face samples. `qa/matcap-preview.mjs` measures
 * the silver shader at 0% black across yaw 25-45 deg, so every angle here stays
 * inside that band.
 *
 * The hero sits at 40 deg, the near corner-on angle of the demo.mp4 hero. As
 * the prism takes centre stage it turns toward face-on (the demo's hero also
 * turns before it opens), bringing the right face — the face every cut runs
 * parallel to — toward the camera, then eases back a little as it settles.
 */
const YAW_HERO = 0.6981 // 40 deg
const YAW_OPEN = 0.576 // 33 deg
const YAW_SETTLE = 0.6283 // 36 deg

export function baseYaw(s) {
  const yaw = lerp(YAW_HERO, YAW_OPEN, easeInOutSine(s.turn))
  return lerp(yaw, YAW_SETTLE, easeInOutCubic(s.settle))
}

/**
 * Pitch. 2.5 deg at the hero; as the pieces open the view drops below them,
 * as in demo.mp4's exploded frames, which shows the stepped undersides of the
 * staircase.
 */
const PITCH_HERO = 0.0436
const PITCH_OPEN = -0.105

export function basePitch(s) {
  return lerp(PITCH_HERO, PITCH_OPEN, easeInOutSine(s.explode))
}
