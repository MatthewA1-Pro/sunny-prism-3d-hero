import * as THREE from 'three'

/**
 * Sunny Prism — geometry engine.
 *
 * The hero object is a square-based pyramid matching `public/prism3.glb`
 * (apex (0,1,0), 2x2 base at y=-1). We rebuild it procedurally rather than
 * using the GLB directly so that the SAME solid can be cut into structural
 * slices. That keeps the closed hero and the exploded state one continuous
 * object instead of two component trees cross-fading.
 *
 * Slicing direction comes from the buyer references (shapes.pptx `image10.gif`
 * and the annotated `prism.png`): cuts run PARALLEL TO THE RIGHT EDGE of the
 * triangular silhouette.
 *
 * The right edge runs apex (0,1) -> right base (1,-1), direction (1,-2).
 * A plane containing that direction and the Z axis has normal (2,1,0).
 * So every cut is a level set of:
 *
 *      k(x, y) = 2x + y
 *
 * k = +1 is the right face itself, k = -3 is the left base corner, so the
 * solid spans k in [-3, 1]. Cutting at k = 0, -1, -2 reproduces exactly the
 * ratios used by the April source (leftEdge(0.25/0.50/0.75) and the matching
 * bottomEdge points) and divides the prism into four equal structural bands.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Normal of every cut plane (also the normal of the pyramid's +X face). */
export const CUT_NORMAL = new THREE.Vector3(2, 1, 0).normalize()

/** In-plane slide direction: parallel to the right edge, pointing down-right. */
export const SLIDE_DIR = new THREE.Vector3(1, -2, 0).normalize()

/** k = 2x + y at the right face and at the far left base corner. */
export const K_MAX = 1
export const K_MIN = -3

/** Interior cut positions, evenly subdividing [K_MIN, K_MAX] into 4 bands. */
export const CUT_LEVELS = [0, -1, -2]

/** Band boundaries, from the right edge round to the left base corner. */
export const BAND_EDGES = [K_MAX, ...CUT_LEVELS, K_MIN]

export const SLICE_COUNT = BAND_EDGES.length - 1

const EPS = 1e-6

// ─── Half-space helpers ──────────────────────────────────────────────────────

/**
 * A half-space is `{ n, d }` meaning the solid lies where `n · x <= d`.
 * `n` need not be unit length.
 */
function halfSpace(nx, ny, nz, d) {
  return { n: new THREE.Vector3(nx, ny, nz), d }
}

/** The closed square pyramid, as five half-spaces. */
function pyramidHalfSpaces() {
  return [
    halfSpace(2, 1, 0, 1), // +X face
    halfSpace(-2, 1, 0, 1), // -X face
    halfSpace(0, 1, 2, 1), // +Z face
    halfSpace(0, 1, -2, 1), // -Z face
    halfSpace(0, -1, 0, 1), // base at y = -1
  ]
}

/** k(x, y) = 2x + y, the cut parameter. */
export function cutLevelAt(x, y) {
  return 2 * x + y
}

/**
 * Remove duplicate half-spaces.
 *
 * The outermost bands are bounded by a cut level that coincides with a face of
 * the pyramid itself (k = +1 *is* the +X face). Without this, that face would
 * be emitted twice and the solid would be non-manifold — which showed up as
 * slice 0 reporting a volume of 1.3125 instead of the correct 0.979167.
 */
function dedupePlanes(planes) {
  const out = []
  for (const p of planes) {
    const len = p.n.length()
    if (len < EPS) continue
    const n = p.n.clone().divideScalar(len)
    const d = p.d / len

    const dup = out.some(
      (q) => q.un.dot(n) > 1 - 1e-7 && Math.abs(q.ud - d) < 1e-7
    )
    if (!dup) out.push({ n: p.n, d: p.d, un: n, ud: d })
  }
  return out
}

/**
 * Intersect three planes. Returns null when they are near-parallel / degenerate.
 */
function intersectThreePlanes(a, b, c) {
  const bc = new THREE.Vector3().crossVectors(b.n, c.n)
  const det = a.n.dot(bc)
  if (Math.abs(det) < 1e-9) return null

  const ca = new THREE.Vector3().crossVectors(c.n, a.n)
  const ab = new THREE.Vector3().crossVectors(a.n, b.n)

  return new THREE.Vector3()
    .addScaledVector(bc, a.d)
    .addScaledVector(ca, b.d)
    .addScaledVector(ab, c.d)
    .divideScalar(det)
}

/** Every vertex of the convex solid defined by `planes`. */
function solveVertices(planes) {
  const pts = []
  const n = planes.length

  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const p = intersectThreePlanes(planes[i], planes[j], planes[k])
        if (!p) continue

        // Keep only points inside every half-space.
        let inside = true
        for (let m = 0; m < n; m++) {
          if (planes[m].n.dot(p) - planes[m].d > 1e-5) {
            inside = false
            break
          }
        }
        if (!inside) continue

        // Deduplicate — three planes often meet at an existing corner.
        let dup = false
        for (const q of pts) {
          if (q.distanceToSquared(p) < 1e-8) {
            dup = true
            break
          }
        }
        if (!dup) pts.push(p)
      }
    }
  }

  return pts
}

/** Order coplanar points counter-clockwise as seen from outside (along +n). */
function orderFaceLoop(points, normal) {
  const centroid = new THREE.Vector3()
  points.forEach((p) => centroid.add(p))
  centroid.divideScalar(points.length)

  const u = new THREE.Vector3()
  // Pick any axis not parallel to the normal to seed the basis.
  const seed =
    Math.abs(normal.x) < 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0)
  u.crossVectors(seed, normal).normalize()
  const v = new THREE.Vector3().crossVectors(normal, u).normalize()

  return points
    .map((p) => {
      const rel = new THREE.Vector3().subVectors(p, centroid)
      return { p, a: Math.atan2(rel.dot(v), rel.dot(u)) }
    })
    .sort((m, n) => m.a - n.a)
    .map((m) => m.p)
}

/**
 * Group the solid's vertices onto each plane and return ordered face loops.
 * Faces with fewer than three vertices (planes that only graze a corner) are
 * dropped.
 */
function buildFaces(planes, vertices) {
  const faces = []

  for (const plane of planes) {
    const unit = plane.n.clone().normalize()
    const dUnit = plane.d / plane.n.length()

    const onPlane = vertices.filter(
      (p) => Math.abs(unit.dot(p) - dUnit) < 1e-4
    )
    if (onPlane.length < 3) continue

    faces.push({
      normal: unit,
      loop: orderFaceLoop(onPlane, unit),
    })
  }

  return faces
}

/**
 * Triangulate face loops into a non-indexed BufferGeometry with flat per-face
 * normals — matcap shading reads normals directly, and flat normals give the
 * crisp faceted chrome look seen in `demo.mp4`.
 */
function geometryFromFaces(faces) {
  const positions = []
  const normals = []

  for (const { normal, loop } of faces) {
    for (let i = 1; i < loop.length - 1; i++) {
      const tri = [loop[0], loop[i], loop[i + 1]]

      // Ensure the winding matches the outward normal.
      const ab = new THREE.Vector3().subVectors(tri[1], tri[0])
      const ac = new THREE.Vector3().subVectors(tri[2], tri[0])
      const faceN = new THREE.Vector3().crossVectors(ab, ac)
      if (faceN.dot(normal) < 0) tri.reverse()

      for (const p of tri) {
        positions.push(p.x, p.y, p.z)
        normals.push(normal.x, normal.y, normal.z)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(positions), 3)
  )
  geo.setAttribute(
    'normal',
    new THREE.BufferAttribute(new Float32Array(normals), 3)
  )
  geo.computeBoundingSphere()
  return geo
}

// ─── Public builders ─────────────────────────────────────────────────────────

/** The undivided hero pyramid. */
export function buildPyramid() {
  const planes = dedupePlanes(pyramidHalfSpaces())
  const verts = solveVertices(planes)
  return geometryFromFaces(buildFaces(planes, verts))
}

/**
 * The four structural slices, ordered from the right edge (index 0, the piece
 * holding the apex and the right face) round to the left base corner (index 3).
 *
 * Each entry carries the geometry plus the centroid of the band, which the
 * animation uses as a stable pivot so a slice rotates about itself rather than
 * about the world origin.
 */
export function buildSlices() {
  const base = pyramidHalfSpaces()
  const slices = []

  for (let i = 0; i < SLICE_COUNT; i++) {
    const kHigh = BAND_EDGES[i]
    const kLow = BAND_EDGES[i + 1]

    const planes = dedupePlanes([
      ...base,
      halfSpace(2, 1, 0, kHigh), //  2x + y <= kHigh
      halfSpace(-2, -1, 0, -kLow), // 2x + y >= kLow
    ])

    const verts = solveVertices(planes)
    if (verts.length < 4) continue

    const centroid = new THREE.Vector3()
    verts.forEach((v) => centroid.add(v))
    centroid.divideScalar(verts.length)

    slices.push({
      geometry: geometryFromFaces(buildFaces(planes, verts)),
      centroid,
      kHigh,
      kLow,
    })
  }

  return slices
}

// ─── Cross sections (shapes.pptx `image2.gif`) ───────────────────────────────

/**
 * Horizontal cross-section of the pyramid at height `y`.
 *
 * The pyramid tapers linearly, so the section is a square whose half-extent is
 * an exact function of elevation — this is the relationship the buyer's deck
 * illustrates, not an arbitrary rectangle.
 *
 *   y = -1 (base) -> halfExtent 1
 *   y = +1 (apex) -> halfExtent 0
 */
export function sectionHalfExtent(y) {
  return Math.max(0, (1 - y) * 0.5)
}

/**
 * A unit quad in the XZ plane, used for the base plate and the sweeping
 * horizontal section. Scaling it by `sectionHalfExtent(y)` reproduces the
 * pyramid's true cross-section at any elevation.
 */
export function buildSectionQuad() {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([
        -1, 0, -1, 1, 0, -1, 1, 0, 1,
        -1, 0, -1, 1, 0, 1, -1, 0, 1,
      ]),
      3
    )
  )
  geo.setAttribute(
    'normal',
    new THREE.BufferAttribute(
      new Float32Array([
        0, 1, 0, 0, 1, 0, 0, 1, 0,
        0, 1, 0, 0, 1, 0, 0, 1, 0,
      ]),
      3
    )
  )
  return geo
}

/** Closed outline of the horizontal section, for a crisp lit edge. */
export function buildSectionOutline() {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([
        -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, -1, 0, -1,
      ]),
      3
    )
  )
  return geo
}

// ─── Diagonal cut-plane sweep ────────────────────────────────────────────────

/** How many perimeter samples each swept cut polygon is resampled to. */
export const CUT_SWEEP_SAMPLES = 8

/** How many steps of `k` are precomputed across the solid. */
const CUT_SWEEP_STEPS = 96

/**
 * Cross-section of the pyramid by the plane 2x + y = k, resampled to a fixed
 * vertex count so the sweep can be animated by interpolating between
 * precomputed steps instead of re-clipping every frame.
 */
function cutPolygonAt(k) {
  const planes = dedupePlanes([
    ...pyramidHalfSpaces(),
    halfSpace(2, 1, 0, k),
    halfSpace(-2, -1, 0, -k),
  ])

  const verts = solveVertices(planes)
  if (verts.length < 3) return null

  return orderFaceLoop(verts, CUT_NORMAL)
}

/** Resample a closed loop to exactly `count` points, evenly by arc length. */
function resampleLoop(loop, count) {
  const segLen = []
  let total = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    const l = a.distanceTo(b)
    segLen.push(l)
    total += l
  }
  if (total < EPS) return new Array(count).fill(0).map(() => loop[0].clone())

  const out = []
  for (let i = 0; i < count; i++) {
    let target = (i / count) * total
    let idx = 0
    while (idx < segLen.length && target > segLen[idx]) {
      target -= segLen[idx]
      idx++
    }
    if (idx >= loop.length) idx = loop.length - 1
    const a = loop[idx]
    const b = loop[(idx + 1) % loop.length]
    const t = segLen[idx] > EPS ? target / segLen[idx] : 0
    out.push(new THREE.Vector3().lerpVectors(a, b, t))
  }
  return out
}

/**
 * Precompute the swept cut polygon across the whole solid.
 * Returns `{ steps, samples }` where `steps[i]` is a Float32Array of
 * `CUT_SWEEP_SAMPLES * 3` coordinates.
 */
export function buildCutSweep() {
  const steps = []

  for (let s = 0; s < CUT_SWEEP_STEPS; s++) {
    // Inset slightly from the extremes, where the section degenerates to a point.
    const t = s / (CUT_SWEEP_STEPS - 1)
    const k = THREE.MathUtils.lerp(K_MAX - 0.02, K_MIN + 0.02, t)

    const loop = cutPolygonAt(k)
    const pts = loop
      ? resampleLoop(loop, CUT_SWEEP_SAMPLES)
      : new Array(CUT_SWEEP_SAMPLES).fill(0).map(() => new THREE.Vector3())

    const arr = new Float32Array(CUT_SWEEP_SAMPLES * 3)
    pts.forEach((p, i) => {
      arr[i * 3] = p.x
      arr[i * 3 + 1] = p.y
      arr[i * 3 + 2] = p.z
    })
    steps.push(arr)
  }

  return { steps, count: CUT_SWEEP_STEPS }
}

/**
 * A fan-triangulated mutable geometry matching `CUT_SWEEP_SAMPLES`, whose
 * positions are rewritten each frame from the precomputed sweep.
 */
export function buildCutSweepGeometry() {
  const n = CUT_SWEEP_SAMPLES
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(n * 3), 3)
  )

  const indices = []
  for (let i = 1; i < n - 1; i++) indices.push(0, i, i + 1)
  geo.setIndex(indices)

  const normals = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    normals[i * 3] = CUT_NORMAL.x
    normals[i * 3 + 1] = CUT_NORMAL.y
    normals[i * 3 + 2] = CUT_NORMAL.z
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
  return geo
}

/** Matching closed outline for the swept cut polygon. */
export function buildCutSweepOutline() {
  const n = CUT_SWEEP_SAMPLES
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array((n + 1) * 3), 3)
  )
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
  return geo
}
