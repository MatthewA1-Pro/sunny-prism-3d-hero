'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

import {
  buildSlices,
  buildSectionQuad,
  buildSectionOutline,
  buildCutSweep,
  buildCutSweepGeometry,
  buildCutSweepOutline,
  sectionHalfExtent,
  CUT_SWEEP_SAMPLES,
  K_MAX,
  K_MIN,
} from '@/lib/prismGeometry'

import {
  getStages,
  sliceOffset,
  SLICE_TRANSFORMS,
  SETTLE_SCALE,
  baseYaw,
  basePitch,
  easeInOutCubic,
  easeOutCubic,
  easeInOutSine,
  easeOutExpo,
  lerp,
  clamp01,
  range,
  damp,
} from '@/lib/timeline'

/* Cross-section colours, carried over from the deployed revision so the
 * palette stays continuous with what the buyer has already approved.
 * They map onto the planes in shapes.pptx `image2.gif`:
 *   base plate   -> the green ground square
 *   rising plane -> the purple horizontal section
 *   cut sweep    -> the vertical/diagonal section
 */
const COLOR_BASE = new THREE.Color('#66AAFF')
const COLOR_SECTION = new THREE.Color('#40D0FF')
const COLOR_CUT = new THREE.Color('#FF40B0')

export default function PrismObject({ controller, composition, reducedMotion }) {
  const matcap = useTexture('/matcap.png')

  const groupRef = useRef(null)
  const sliceRefs = useRef([])

  const basePlateRef = useRef(null)
  const sectionRef = useRef(null)
  const sectionEdgeRef = useRef(null)
  const cutRef = useRef(null)
  const cutEdgeRef = useRef(null)

  // ── Geometry (built once) ─────────────────────────────────────────────────
  const slices = useMemo(() => buildSlices(), [])
  const sectionQuad = useMemo(() => buildSectionQuad(), [])
  const sectionOutline = useMemo(() => buildSectionOutline(), [])
  const cutSweep = useMemo(() => buildCutSweep(), [])
  const cutGeo = useMemo(() => buildCutSweepGeometry(), [])
  const cutEdgeGeo = useMemo(() => buildCutSweepOutline(), [])

  // Matcap textures are colour maps: keep them in sRGB or the chrome goes flat.
  useEffect(() => {
    matcap.colorSpace = THREE.SRGBColorSpace
    matcap.needsUpdate = true
  }, [matcap])

  // Dispose everything this component generated on the GPU.
  useEffect(() => {
    return () => {
      slices.forEach((s) => s.geometry.dispose())
      sectionQuad.dispose()
      sectionOutline.dispose()
      cutGeo.dispose()
      cutEdgeGeo.dispose()
    }
  }, [slices, sectionQuad, sectionOutline, cutGeo, cutEdgeGeo])

  // ── Preallocated scratch — nothing is constructed inside useFrame ─────────
  const scratch = useMemo(
    () => ({
      offset: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
    }),
    []
  )

  const smoothed = useRef({ yaw: 0.38, pitch: 0.06 })

  useFrame((state, delta) => {
    // Guard against long frames (tab restore) producing a visible jump.
    const dt = Math.min(delta, 0.05)
    const p = controller.progress.current
    const s = getStages(p)
    const time = state.clock.elapsedTime

    const idle = reducedMotion ? 0 : 1
    const explodeAmount =
      easeInOutCubic(s.explode) * composition.explodeScale
    const settleAmount = easeInOutCubic(s.settle)

    // Pieces travel out, then draw back to the settled composition.
    const spread = lerp(
      explodeAmount,
      explodeAmount * SETTLE_SCALE,
      settleAmount
    )

    // ── Whole-prism orientation ─────────────────────────────────────────────
    if (groupRef.current) {
      const pointerYaw =
        controller.pointer.current.x * 0.1 * composition.pointerStrength * idle
      const pointerPitch =
        controller.pointer.current.y * 0.06 * composition.pointerStrength * idle

      // Pointer influence tapers off once the technical section scan begins,
      // so the diagram-like states stay square to camera.
      const pointerFade = 1 - easeInOutSine(s.section) * 0.75

      const targetYaw =
        baseYaw(s) +
        pointerYaw * pointerFade +
        Math.sin(time * 0.18) * 0.035 * idle * pointerFade

      const targetPitch =
        basePitch(s) +
        pointerPitch * pointerFade +
        Math.sin(time * 0.24) * 0.02 * idle * pointerFade

      smoothed.current.yaw = damp(smoothed.current.yaw, targetYaw, 4.5, dt)
      smoothed.current.pitch = damp(smoothed.current.pitch, targetPitch, 4.5, dt)

      groupRef.current.rotation.y = smoothed.current.yaw
      groupRef.current.rotation.x = smoothed.current.pitch

      // Already full size on load — the hero never starts from nothing.
      const breathe = 1 + Math.sin(time * 0.55) * 0.008 * idle
      const scale = composition.scale * breathe
      groupRef.current.scale.setScalar(scale)
      groupRef.current.position.y = composition.groupY
    }

    // ── Structural slices ───────────────────────────────────────────────────
    for (let i = 0; i < slices.length; i++) {
      const mesh = sliceRefs.current[i]
      if (!mesh) continue

      const t = SLICE_TRANSFORMS[i]
      sliceOffset(i, spread, scratch.offset)

      mesh.position.copy(scratch.offset)
      mesh.rotation.z = t.tilt * spread
      mesh.rotation.y = t.yaw * spread
    }

    // ── Cross sections ──────────────────────────────────────────────────────
    // Base plate: the ground square of the pyramid, fades in with the scan.
    const sectionFade = easeOutCubic(s.section) * (1 - settleAmount * 0.45)

    if (basePlateRef.current) {
      const visible = sectionFade > 0.004
      basePlateRef.current.visible = visible
      if (visible) {
        basePlateRef.current.material.opacity = 0.3 * sectionFade
      }
    }

    // Rising horizontal section. Its half-extent is an exact function of
    // elevation, so the plane always matches the pyramid's true cross-section.
    const scanCycle = reducedMotion
      ? 0.45
      : (Math.sin(time * 0.42 - Math.PI / 2) + 1) / 2
    const scanY = lerp(-0.98, 0.94, easeInOutSine(scanCycle))
    const halfExtent = sectionHalfExtent(scanY)

    if (sectionRef.current) {
      const visible = sectionFade > 0.004
      sectionRef.current.visible = visible
      if (visible) {
        sectionRef.current.position.y = scanY
        sectionRef.current.scale.set(halfExtent, 1, halfExtent)
        sectionRef.current.material.opacity = 0.34 * sectionFade
      }
    }
    if (sectionEdgeRef.current) {
      const visible = sectionFade > 0.004
      sectionEdgeRef.current.visible = visible
      if (visible) {
        sectionEdgeRef.current.position.y = scanY
        sectionEdgeRef.current.scale.set(halfExtent, 1, halfExtent)
        sectionEdgeRef.current.material.opacity = 0.8 * sectionFade
      }
    }

    // ── Diagonal cut sweep ──────────────────────────────────────────────────
    // Travels through the solid while the cuts are being revealed, then holds
    // a low presence so the seam stays legible during the explode.
    const revealFade =
      easeOutExpo(s.reveal) *
      (1 - easeInOutCubic(s.settle) * 0.7) *
      (1 - easeInOutSine(s.section) * 0.35)

    if (cutRef.current && cutEdgeRef.current) {
      const visible = revealFade > 0.004
      cutRef.current.visible = visible
      cutEdgeRef.current.visible = visible

      if (visible) {
        // Sweep position: driven by scroll during reveal, then a slow idle
        // drift so the seam never freezes dead still.
        const sweepT = clamp01(
          easeInOutCubic(range(p, 0.16, 0.5)) * 0.85 +
            (reducedMotion ? 0.1 : (Math.sin(time * 0.3) + 1) / 2) * 0.15
        )

        const fIndex = sweepT * (cutSweep.count - 1)
        const i0 = Math.floor(fIndex)
        const i1 = Math.min(i0 + 1, cutSweep.count - 1)
        const mix = fIndex - i0

        const a = cutSweep.steps[i0]
        const b = cutSweep.steps[i1]

        const pos = cutGeo.attributes.position.array
        const edge = cutEdgeGeo.attributes.position.array

        for (let v = 0; v < CUT_SWEEP_SAMPLES; v++) {
          const x = lerp(a[v * 3], b[v * 3], mix)
          const y = lerp(a[v * 3 + 1], b[v * 3 + 1], mix)
          const z = lerp(a[v * 3 + 2], b[v * 3 + 2], mix)
          pos[v * 3] = x
          pos[v * 3 + 1] = y
          pos[v * 3 + 2] = z
          edge[v * 3] = x
          edge[v * 3 + 1] = y
          edge[v * 3 + 2] = z
        }
        // Close the outline loop.
        edge[CUT_SWEEP_SAMPLES * 3] = edge[0]
        edge[CUT_SWEEP_SAMPLES * 3 + 1] = edge[1]
        edge[CUT_SWEEP_SAMPLES * 3 + 2] = edge[2]

        cutGeo.attributes.position.needsUpdate = true
        cutEdgeGeo.attributes.position.needsUpdate = true

        cutRef.current.material.opacity = 0.22 * revealFade
        cutEdgeRef.current.material.opacity = 0.85 * revealFade
      }
    }
  })

  return (
    <group ref={groupRef}>
      {/* ── Structural slices: one solid object, cut, never cross-faded ── */}
      {slices.map((slice, i) => (
        <mesh
          key={i}
          ref={(el) => {
            sliceRefs.current[i] = el
          }}
          geometry={slice.geometry}
          renderOrder={0}
        >
          <meshMatcapMaterial
            matcap={matcap}
            side={THREE.FrontSide}
            transparent={false}
            opacity={1}
          />
        </mesh>
      ))}

      {/* ── Base plate: the pyramid's ground square ── */}
      <mesh
        ref={basePlateRef}
        geometry={sectionQuad}
        position={[0, -1, 0]}
        renderOrder={10}
        visible={false}
        frustumCulled={false}
      >
        <meshBasicMaterial
          color={COLOR_BASE}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* ── Rising horizontal cross-section ── */}
      <mesh
        ref={sectionRef}
        geometry={sectionQuad}
        renderOrder={11}
        visible={false}
        frustumCulled={false}
      >
        <meshBasicMaterial
          color={COLOR_SECTION}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <lineLoop
        ref={sectionEdgeRef}
        geometry={sectionOutline}
        renderOrder={12}
        visible={false}
        frustumCulled={false}
      >
        <lineBasicMaterial
          color={COLOR_SECTION}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineLoop>

      {/* ── Diagonal cut plane sweeping along the slice direction ── */}
      <mesh
        ref={cutRef}
        geometry={cutGeo}
        renderOrder={13}
        visible={false}
        frustumCulled={false}
      >
        <meshBasicMaterial
          color={COLOR_CUT}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <lineLoop
        ref={cutEdgeRef}
        geometry={cutEdgeGeo}
        renderOrder={14}
        visible={false}
        frustumCulled={false}
      >
        <lineBasicMaterial
          color={COLOR_CUT}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineLoop>
    </group>
  )
}
