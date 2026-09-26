'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import {
  clamp01,
  easeInOutSine,
  easeOutCubic,
  getStages,
  lerp,
  ribbonZoom,
} from '@/lib/timeline'

/*
 * The shadow, the bands and the sliver — chapters 4 to 6 of Sunny's
 * walkthrough, carried by ONE set of four quads that morphs between three
 * states, so the page reads as one thing changing rather than three props
 * swapped in and out:
 *
 *   A  shadow    the prism's silhouette triangle laid flat on the grid and
 *                sheared away from a light on the left: "it casts a triangular
 *                2D shadow... it's isometric, but the shape of it is just a 2D
 *                triangle". A mirrored second triangle slides in to meet it —
 *                the pair in `image8.png`.
 *   B  sliver    the same bands stood upright in the prism's centre plane, the
 *                slice from the apex down to the base mid-line that `image2.gif`
 *                lifts out: "the center of this prism, middle line to the top".
 *   C  ribbons   the bands spread into a labelled stack — the "text ribbons"
 *                the sliver morphs into, which the view then zooms into.
 *
 * The bands are the prism's own silhouette triangle cut by the same diagonal
 * system as the solid (k = 2x + y at 0, -1, -2), so the shadow comes apart
 * exactly where the prism does.
 */

/**
 * Band corners inside the silhouette triangle — apex (0,1), base (-1,-1) to
 * (1,-1) — in perimeter order. Four corners each; the last band is a triangle,
 * padded to four so every band morphs through the same code.
 */
const BANDS = [
  [
    [0, 1],
    [1, -1],
    [0.5, -1],
    [-0.25, 0.5],
  ],
  [
    [-0.25, 0.5],
    [0.5, -1],
    [0, -1],
    [-0.5, 0],
  ],
  [
    [-0.5, 0],
    [0, -1],
    [-0.5, -1],
    [-0.75, -0.5],
  ],
  [
    [-0.75, -0.5],
    [-0.5, -1],
    [-1, -1],
    [-1, -1],
  ],
]

/** The grid's plane, so the shadow lies on the same surface (GroundGrid.GRID_Y). */
const GROUND = -1.62
/** How far the light on the left pushes the shadow across the ground. */
const LEAN = 0.58
/** How far the shadow recedes from the camera — what makes it read isometric. */
const DEPTH = 0.78
/** Pulls the shadow's near edge clear of the prism's base. */
const SHADOW_Z = 0.28
/*
 * How the bands come apart, mirroring EXPLODE for the solid: `gap` across the
 * cuts (so each cut opens into a visible gap) and `slide` along them (which
 * staggers the strips, and with them their labels).
 */
const BAND_GAP = 0.22
const BAND_SLIDE = 0.3
/** Where the second triangle waits, and where it comes to rest. */
const MIRROR_X_FAR = 5.4
const MIRROR_X_MET = 2.15

/*
 * Ribbon stack. Each ribbon's width is its band's share of the triangle's area
 * (0.875, 0.625, 0.375, 0.125 of 2), with a floor so the narrowest band still
 * has a ribbon to label.
 */
const RIBBON_W = [2.5, 1.82, 1.15, 0.52]
const RIBBON_X = -1.25
const RIBBON_H = 0.32
const RIBBON_STEP = 0.48
const RIBBON_TOP = 0.86
const RIBBON_Z = 0.55
/** Labels line up in a column to the right of the stack. */
const LABEL_X = RIBBON_X + 2.95

const SHADOW_COLOR = new THREE.Color('#2a1e68')
const RIBBON_COLORS = [
  new THREE.Color('#a45cff'),
  new THREE.Color('#7b6bff'),
  new THREE.Color('#3fa6ff'),
  new THREE.Color('#01f4b1'),
]

/* The cut system in the silhouette plane: cuts are level sets of k = 2x + y, so
 * NORMAL crosses them and SLIDE runs along them (CUT_NORMAL / SLIDE_DIR in 3D). */
const NORMAL_X = 2 / Math.sqrt(5)
const NORMAL_Y = 1 / Math.sqrt(5)
const SLIDE_X = 1 / Math.sqrt(5)
const SLIDE_Y = -2 / Math.sqrt(5)

function quadGeometry(indexed) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(4 * 3), 3)
  )
  if (indexed) geometry.setIndex([0, 1, 2, 0, 2, 3])
  // The corners move every frame, so the automatic bounds would be stale.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10)
  return geometry
}

export default function ShadowBands({ controllerRef }) {
  const groupRef = useRef(null)
  const mirrorRef = useRef(null)
  const bandRefs = useRef([])
  const outlineRefs = useRef([])
  const mirrorRefs = useRef([])
  const labelsRef = useRef([])

  const bandGeometries = useMemo(() => BANDS.map(() => quadGeometry(true)), [])
  const outlineGeometries = useMemo(() => BANDS.map(() => quadGeometry(false)), [])
  const mirrorGeometries = useMemo(() => BANDS.map(() => quadGeometry(true)), [])

  /*
   * The labels are page DOM, not sprites, so they stay crisp and selectable.
   * They are collected from the document rather than handed in as refs: the
   * frame loop writes their styles, and a ref passed through props would be a
   * value the React compiler treats as frozen.
   */
  useEffect(() => {
    labelsRef.current = Array.from(document.querySelectorAll('[data-band-label]'))
    return () => {
      labelsRef.current.forEach((el) => {
        el.style.opacity = '0'
      })
      labelsRef.current = []
    }
  }, [])

  useEffect(
    () => () => {
      bandGeometries.forEach((g) => g.dispose())
      outlineGeometries.forEach((g) => g.dispose())
      mirrorGeometries.forEach((g) => g.dispose())
    },
    [bandGeometries, outlineGeometries, mirrorGeometries]
  )

  // Scratch values — nothing is allocated inside the frame loop.
  const scratch = useMemo(
    () => ({
      flat: new THREE.Vector3(),
      upright: new THREE.Vector3(),
      ribbon: new THREE.Vector3(),
      point: new THREE.Vector3(),
      anchor: new THREE.Vector3(),
      labelTarget: new THREE.Vector3(),
      colour: new THREE.Color(),
    }),
    []
  )

  useFrame(({ camera, size }) => {
    const controller = controllerRef.current
    const units = controller.stage.units
    const stage = getStages(units)

    const shadowIn = easeOutCubic(stage.shadow)
    const gap = easeInOutSine(stage.bands)
    const toSliver = easeInOutSine(stage.sliver)
    const toRibbons = easeInOutSine(stage.ribbons)

    const group = groupRef.current
    const visible = shadowIn > 0.004
    if (group) {
      group.visible = visible
      // Shares the prism's scale, then pushes in as the ribbons take over.
      group.scale.setScalar(controller.stage.scale * ribbonZoom(units))
    }

    if (!visible) {
      for (let i = 0; i < labelsRef.current.length; i++) {
        labelsRef.current[i].style.opacity = '0'
      }
      return
    }

    const mirror = mirrorRef.current
    if (mirror) {
      // The second triangle slides in from the right and meets the first. It
      // goes once the bands leave the ground to become the sliver.
      mirror.position.x = lerp(MIRROR_X_FAR, MIRROR_X_MET, easeInOutSine(stage.converge))
      mirror.visible = toSliver < 0.5
    }

    for (let i = 0; i < BANDS.length; i++) {
      const corners = BANDS[i]
      const rank = 1.5 - i
      const band = bandRefs.current[i]
      const outline = outlineRefs.current[i]
      const mirrorBand = mirrorRefs.current[i]

      const bandPos = band?.geometry.attributes.position
      const outlinePos = outline?.geometry.attributes.position
      const mirrorPos = mirrorBand?.geometry.attributes.position

      const rowY = RIBBON_TOP - i * RIBBON_STEP
      scratch.anchor.set(0, 0, 0)

      for (let c = 0; c < 4; c++) {
        // The bands open across the cuts and stagger along them, as the
        // solid's pieces do.
        const x =
          corners[c][0] +
          (NORMAL_X * BAND_GAP + SLIDE_X * BAND_SLIDE) * rank * gap
        const y =
          corners[c][1] +
          (NORMAL_Y * BAND_GAP + SLIDE_Y * BAND_SLIDE) * rank * gap

        // A — flat on the grid, sheared away from the light on the left.
        scratch.flat.set(
          x + (y + 1) * LEAN,
          GROUND + 0.005,
          SHADOW_Z - (y + 1) * DEPTH
        )
        // B — upright in the prism's centre plane.
        scratch.upright.set(x, y, 0.06)
        // C — one row of the stack. Perimeter order maps corner-for-corner:
        // top-right, bottom-right, bottom-left, top-left.
        const right = c === 0 || c === 1
        const bottom = c === 1 || c === 2
        scratch.ribbon.set(
          RIBBON_X + (right ? RIBBON_W[i] : 0),
          rowY - (bottom ? RIBBON_H : 0),
          RIBBON_Z
        )

        scratch.point.lerpVectors(scratch.flat, scratch.upright, toSliver)
        scratch.point.lerp(scratch.ribbon, toRibbons)
        scratch.anchor.add(scratch.point)

        const o = c * 3
        if (bandPos) {
          bandPos.array[o] = scratch.point.x
          bandPos.array[o + 1] = scratch.point.y
          bandPos.array[o + 2] = scratch.point.z
        }
        if (outlinePos) {
          outlinePos.array[o] = scratch.point.x
          outlinePos.array[o + 1] = scratch.point.y
          outlinePos.array[o + 2] = scratch.point.z
        }
        if (mirrorPos) {
          // The mirrored triangle only ever shows the flat shadow state.
          mirrorPos.array[o] = -scratch.flat.x
          mirrorPos.array[o + 1] = scratch.flat.y
          mirrorPos.array[o + 2] = scratch.flat.z
        }
      }

      if (bandPos) bandPos.needsUpdate = true
      if (outlinePos) outlinePos.needsUpdate = true
      if (mirrorPos) mirrorPos.needsUpdate = true

      if (band) {
        // A dim violet on the ground, the accent once it is a ribbon.
        scratch.colour.copy(SHADOW_COLOR).lerp(RIBBON_COLORS[i], toRibbons)
        band.material.color.copy(scratch.colour)
        band.material.opacity = shadowIn * (0.5 + 0.42 * toRibbons)
      }
      if (outline) {
        outline.material.opacity = shadowIn * (0.28 + 0.34 * Math.max(gap, toRibbons))
      }
      if (mirrorBand) {
        mirrorBand.material.opacity = shadowIn * 0.42 * (1 - toSliver)
      }

      // ── Label, projected from the band's own centre ────────────────────────
      const label = labelsRef.current[i]
      if (!label || !group) continue

      // Visible once the bands separate; it rides the band through the morph
      // and only drops out while the band is standing up into the sliver.
      const show = clamp01(gap * 1.4) * (1 - clamp01(toSliver * 1.6) * (1 - clamp01(toRibbons * 1.6)))
      if (show <= 0.01) {
        label.style.opacity = '0'
        continue
      }

      scratch.anchor.multiplyScalar(0.25)
      if (toRibbons > 0) {
        // Ribbon labels line up in a column beside the stack.
        scratch.labelTarget.set(LABEL_X, rowY - RIBBON_H * 0.5, RIBBON_Z)
        scratch.anchor.lerp(scratch.labelTarget, toRibbons)
      }
      group.localToWorld(scratch.anchor)
      scratch.anchor.project(camera)

      const sx = (scratch.anchor.x * 0.5 + 0.5) * size.width
      const sy = (-scratch.anchor.y * 0.5 + 0.5) * size.height
      label.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`
      label.style.opacity = show.toFixed(3)
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      {BANDS.map((_, i) => (
        <group key={i}>
          <mesh
            ref={(el) => {
              bandRefs.current[i] = el
            }}
            geometry={bandGeometries[i]}
            renderOrder={5}
            frustumCulled={false}
          >
            <meshBasicMaterial
              color={SHADOW_COLOR}
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <lineLoop
            ref={(el) => {
              outlineRefs.current[i] = el
            }}
            geometry={outlineGeometries[i]}
            renderOrder={6}
            frustumCulled={false}
          >
            <lineBasicMaterial
              color="#a396ff"
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
            />
          </lineLoop>
        </group>
      ))}

      {/* The second triangle: the same bands mirrored, meeting the first. */}
      <group ref={mirrorRef} position={[MIRROR_X_FAR, 0, 0]}>
        {BANDS.map((_, i) => (
          <mesh
            key={i}
            ref={(el) => {
              mirrorRefs.current[i] = el
            }}
            geometry={mirrorGeometries[i]}
            renderOrder={5}
            frustumCulled={false}
          >
            <meshBasicMaterial
              color={SHADOW_COLOR}
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}
