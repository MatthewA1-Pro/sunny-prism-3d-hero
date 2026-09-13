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
  baseYaw,
  basePitch,
  PRISM_SHAPE,
  INITIAL_YAW,
  INITIAL_PITCH,
  easeInOutCubic,
  easeOutCubic,
  easeInOutSine,
  lerp,
  clamp01,
  range,
  damp,
} from '@/lib/timeline'

/* Cross-section colours, carried over from the deployed revision so the
 * palette stays continuous with what the buyer has already approved.
 * They map onto the planes in shapes.pptx `image2.gif`:
 *   rising plane -> the purple horizontal section
 *   cut sweep    -> the vertical/diagonal section
 */
const COLOR_SECTION = new THREE.Color('#40D0FF')
const COLOR_CUT = new THREE.Color('#FF40B0')

/*
 * Section outlines trace where a plane meets the prism's surface. Inside an
 * opaque solid the plane itself is hidden, so the outline is what the viewer
 * sees. Pushed a hair outside the surface and depth-tested, only its visible
 * half draws: a scan line crossing the faces, instead of an x-ray wire loop
 * showing through the chrome.
 */
const RING_INFLATE = 1.012

/* Seam line opacity: a faint hint on the closed hero, fully lit once the
 * cutting plane has passed through that slice. */
const EDGE_IDLE = 0.1
const EDGE_LIT = 0.5

const MATCAP_URL = '/matcap.png'
const MATCAP_SOFT_URL = '/matcap-soft.png'

/*
 * Silver matcap.
 *
 * `matcap.png` is 58% near-black inside its disc, so a plain matcap lookup on
 * flat faces renders much of the prism as black card whatever its orientation
 * (55-69% of the silhouette in the previous build). The approved `demo.mp4`
 * hero is under 1% black: soft mid-grey faces (luminance ~86-114, low
 * saturation) carrying saturated rainbow streaks.
 *
 * So the buyer's matcap is layered over a blurred copy of itself
 * (`matcap-soft.png`, built by scripts/build-matcap-soft.mjs). The blurred copy
 * gives each normal the local average colour of the chrome — partly
 * desaturated, so it reads as silver with a warm or cool tint rather than as
 * the texture's green band — and the sharp matcap is screened on top for the
 * streaks and highlights. `qa/matcap-preview.mjs` reproduces this shader
 * offline, including ACES tone mapping: across the timeline's yaw band it
 * measures 0% black at luminance ~90-120.
 */
const SOFT_GAIN = 2.4
const SOFT_SATURATION = 0.4
const MATCAP_DETAIL = 0.9

/*
 * Matcap textures are colour maps: they must be sampled in sRGB or the chrome
 * goes flat. Applied through useTexture's onLoad callback rather than by
 * mutating the returned texture, and hoisted to module scope so its identity
 * is stable and the texture is not re-uploaded on every render.
 */
function toSRGB(texture) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
}

/** The 64px soft matcap is sampled smoothly and needs no mip chain. */
function toSoftSRGB(texture) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
}

function createPrismMaterial(matcap, matcapSoft) {
  const material = new THREE.MeshMatcapMaterial({
    matcap,
    side: THREE.FrontSide,
  })

  material.onBeforeCompile = (shader) => {
    const sample = 'vec4 matcapColor = texture2D( matcap, uv );'
    // If a three.js upgrade changes the chunk, keep the plain matcap rather
    // than failing to compile.
    if (!shader.fragmentShader.includes(sample)) return

    shader.uniforms.matcapSoft = { value: matcapSoft }
    shader.uniforms.softGain = { value: SOFT_GAIN }
    shader.uniforms.softSaturation = { value: SOFT_SATURATION }
    shader.uniforms.matcapDetail = { value: MATCAP_DETAIL }

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D matcapSoft;
uniform float softGain;
uniform float softSaturation;
uniform float matcapDetail;`
      )
      .replace(
        sample,
        `${sample}
		vec3 softColor = texture2D( matcapSoft, uv ).rgb;
		float softLuma = dot( softColor, vec3( 0.2126, 0.7152, 0.0722 ) );
		vec3 silver = min( mix( vec3( softLuma ), softColor, softSaturation ) * softGain, vec3( 1.0 ) );
		matcapColor.rgb = 1.0 - ( 1.0 - silver ) * ( 1.0 - matcapColor.rgb * matcapDetail );`
      )
  }
  material.customProgramCacheKey = () => 'prism-silver-matcap'

  return material
}

export default function PrismObject({ controllerRef, composition, reducedMotion }) {
  const matcap = useTexture(MATCAP_URL, toSRGB)
  const matcapSoft = useTexture(MATCAP_SOFT_URL, toSoftSRGB)

  // One material shared by every slice: one program, one set of uniforms.
  const prismMaterial = useMemo(
    () => createPrismMaterial(matcap, matcapSoft),
    [matcap, matcapSoft]
  )
  useEffect(() => () => prismMaterial.dispose(), [prismMaterial])

  const groupRef = useRef(null)
  const sliceRefs = useRef([])
  const edgeMaterialRefs = useRef([])

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

  /*
   * Edge lines for each slice.
   *
   * The buyer's `shapes.pptx` draws the pyramid as a solid with its edges
   * picked out, and that line work is what makes the cuts readable. Each
   * slice's edges ignite as the cutting plane passes through it.
   */
  const sliceEdges = useMemo(
    () => slices.map((s) => new THREE.EdgesGeometry(s.geometry, 15)),
    [slices]
  )

  // Dispose everything this component generated on the GPU.
  useEffect(() => {
    return () => {
      slices.forEach((s) => s.geometry.dispose())
      sliceEdges.forEach((e) => e.dispose())
      sectionQuad.dispose()
      sectionOutline.dispose()
      cutGeo.dispose()
      cutEdgeGeo.dispose()
    }
  }, [slices, sliceEdges, sectionQuad, sectionOutline, cutGeo, cutEdgeGeo])

  // ── Preallocated scratch — nothing is constructed inside useFrame ─────────
  const scratch = useMemo(() => ({ offset: new THREE.Vector3() }), [])

  const smoothed = useRef({ yaw: INITIAL_YAW, pitch: INITIAL_PITCH })

  useFrame((state, delta) => {
    // Guard against long frames (tab restore) producing a visible jump.
    const dt = Math.min(delta, 0.05)
    const controller = controllerRef.current
    const p = controller.progress
    const s = getStages(p)
    const time = state.clock.elapsedTime

    const idle = reducedMotion ? 0 : 1
    const settleAmount = easeInOutCubic(s.settle)

    // Pieces slide out along the cuts, hold, then glide back until the solid
    // is whole again — the same loop as the buyer's `image10.gif`.
    const spread =
      easeInOutCubic(s.explode) *
      (1 - easeInOutCubic(s.reassemble)) *
      composition.explodeScale

    // ── Whole-prism orientation ─────────────────────────────────────────────
    if (groupRef.current) {
      const pointerYaw =
        controller.pointer.x * 0.04 * composition.pointerStrength * idle
      const pointerPitch =
        controller.pointer.y * 0.025 * composition.pointerStrength * idle

      // Pointer influence tapers off once the technical section scan begins,
      // so the diagram-like states stay square to camera.
      const pointerFade = 1 - easeInOutSine(s.section) * 0.75

      const targetYaw =
        baseYaw(s) +
        pointerYaw * pointerFade +
        Math.sin(time * 0.18) * 0.04 * idle * pointerFade

      const targetPitch =
        basePitch(s) +
        pointerPitch * pointerFade +
        Math.sin(time * 0.24) * 0.012 * idle * pointerFade

      smoothed.current.yaw = damp(smoothed.current.yaw, targetYaw, 4.5, dt)
      smoothed.current.pitch = damp(smoothed.current.pitch, targetPitch, 4.5, dt)

      groupRef.current.rotation.y = smoothed.current.yaw
      groupRef.current.rotation.x = smoothed.current.pitch

      // Already full size on load — the hero never starts from nothing.
      const breathe = 1 + Math.sin(time * 0.55) * 0.008 * idle
      const scale = composition.scale * breathe
      groupRef.current.scale.set(
        PRISM_SHAPE[0] * scale,
        PRISM_SHAPE[1] * scale,
        PRISM_SHAPE[2] * scale
      )
      groupRef.current.position.y = composition.groupY
    }

    // ── Diagonal cutting plane ──────────────────────────────────────────────
    // Travels through the closed solid from the right face to the far left
    // corner, parallel to the right edge. Purely scroll-driven, so scrubbing
    // back retraces it exactly. Its section degenerates to a point at both
    // ends, and the fade follows that.
    const sweepT = easeInOutCubic(s.reveal)
    const sweepK = lerp(K_MAX - 0.02, K_MIN + 0.02, sweepT)
    const sweepFade =
      easeOutCubic(range(sweepT, 0, 0.12)) *
      (1 - easeInOutSine(range(sweepT, 0.82, 1)))

    // ── Structural slices ───────────────────────────────────────────────────
    const edgeDim = 1 - settleAmount * 0.4

    for (let i = 0; i < slices.length; i++) {
      const mesh = sliceRefs.current[i]
      if (mesh) {
        const t = SLICE_TRANSFORMS[i]
        sliceOffset(i, spread, scratch.offset)

        mesh.position.copy(scratch.offset)
        mesh.rotation.z = t.tilt * spread
        mesh.rotation.y = t.yaw * spread
      }

      // A slice's seams are fully lit once the plane has reached its lower cut.
      const edgeMaterial = edgeMaterialRefs.current[i]
      if (edgeMaterial) {
        const lit = clamp01((K_MAX - sweepK) / (K_MAX - slices[i].kLow))
        edgeMaterial.opacity =
          lerp(EDGE_IDLE, EDGE_LIT, easeOutCubic(lit)) * edgeDim
      }
    }

    if (cutRef.current && cutEdgeRef.current) {
      const visible = sweepFade > 0.004
      cutRef.current.visible = visible
      cutEdgeRef.current.visible = visible

      if (visible) {
        const fIndex = sweepT * (cutSweep.count - 1)
        const i0 = Math.floor(fIndex)
        const i1 = Math.min(i0 + 1, cutSweep.count - 1)
        const mix = fIndex - i0

        const a = cutSweep.steps[i0]
        const b = cutSweep.steps[i1]

        // Written through the mesh refs. The geometries are created in
        // useMemo, and mutating a memoized value directly is what React's
        // immutability rule forbids; the refs are the sanctioned mutable handle.
        const posAttr = cutRef.current.geometry.attributes.position
        const edgeAttr = cutEdgeRef.current.geometry.attributes.position
        const pos = posAttr.array
        const edge = edgeAttr.array

        let cx = 0
        let cy = 0
        let cz = 0
        for (let v = 0; v < CUT_SWEEP_SAMPLES; v++) {
          const x = lerp(a[v * 3], b[v * 3], mix)
          const y = lerp(a[v * 3 + 1], b[v * 3 + 1], mix)
          const z = lerp(a[v * 3 + 2], b[v * 3 + 2], mix)
          pos[v * 3] = x
          pos[v * 3 + 1] = y
          pos[v * 3 + 2] = z
          cx += x
          cy += y
          cz += z
        }
        cx /= CUT_SWEEP_SAMPLES
        cy /= CUT_SWEEP_SAMPLES
        cz /= CUT_SWEEP_SAMPLES

        // The section is convex, so pushing away from its centroid within
        // the cut plane moves every outline point just outside the surface.
        for (let v = 0; v < CUT_SWEEP_SAMPLES; v++) {
          edge[v * 3] = cx + (pos[v * 3] - cx) * RING_INFLATE
          edge[v * 3 + 1] = cy + (pos[v * 3 + 1] - cy) * RING_INFLATE
          edge[v * 3 + 2] = cz + (pos[v * 3 + 2] - cz) * RING_INFLATE
        }
        // Close the outline loop.
        edge[CUT_SWEEP_SAMPLES * 3] = edge[0]
        edge[CUT_SWEEP_SAMPLES * 3 + 1] = edge[1]
        edge[CUT_SWEEP_SAMPLES * 3 + 2] = edge[2]

        posAttr.needsUpdate = true
        edgeAttr.needsUpdate = true

        cutRef.current.material.opacity = 0.22 * sweepFade
        cutEdgeRef.current.material.opacity = 0.9 * sweepFade
      }
    }

    // ── Cross sections (shapes.pptx `image2.gif`) ───────────────────────────
    // Run over the reassembled solid, so the section always is the pyramid's
    // true cross-section. The horizontal plane rises from the base to the apex
    // with scroll; its half-extent is an exact function of elevation, so it
    // shrinks to nothing as it reaches the apex.
    const sectionIn = easeOutCubic(range(s.section, 0, 0.18))
    const scanT = easeInOutSine(s.section)
    const scanY = lerp(-0.98, 0.98, scanT)
    const halfExtent = sectionHalfExtent(scanY)
    const planeFade = sectionIn * (1 - easeInOutSine(range(scanT, 0.86, 1)))

    if (sectionRef.current && sectionEdgeRef.current) {
      const visible = planeFade > 0.004
      sectionRef.current.visible = visible
      sectionEdgeRef.current.visible = visible
      if (visible) {
        sectionRef.current.position.y = scanY
        sectionRef.current.scale.set(halfExtent, 1, halfExtent)
        sectionRef.current.material.opacity = 0.3 * planeFade

        sectionEdgeRef.current.position.y = scanY
        sectionEdgeRef.current.scale.set(
          halfExtent * RING_INFLATE,
          1,
          halfExtent * RING_INFLATE
        )
        sectionEdgeRef.current.material.opacity = 0.9 * planeFade
      }
    }
  })

  return (
    <group ref={groupRef}>
      {/* ── Structural slices: one solid object, cut, never cross-faded ── */}
      {slices.map((slice, i) => (
        <group
          key={i}
          ref={(el) => {
            sliceRefs.current[i] = el
          }}
        >
          <mesh
            geometry={slice.geometry}
            material={prismMaterial}
            renderOrder={0}
          />
          <lineSegments geometry={sliceEdges[i]} renderOrder={1}>
            <lineBasicMaterial
              ref={(el) => {
                edgeMaterialRefs.current[i] = el
              }}
              color="#CFC8FF"
              transparent
              opacity={EDGE_IDLE}
              depthWrite={false}
              toneMapped={false}
            />
          </lineSegments>
        </group>
      ))}

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
          depthTest={true}
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
          depthTest={true}
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
          depthTest={true}
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
          depthTest={true}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineLoop>
    </group>
  )
}

// Fetch both matcaps in parallel before the component first suspends on them.
useTexture.preload(MATCAP_URL)
useTexture.preload(MATCAP_SOFT_URL)
