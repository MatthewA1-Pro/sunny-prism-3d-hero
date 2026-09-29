'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

import {
  buildPyramid,
  buildSlices,
  buildSectionFill,
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
  sliceTilt,
  prismYaw,
  prismPitch,
  prismRecede,
  shellOpacity,
  PRISM_SHAPE,
  easeInOutCubic,
  easeOutCubic,
  easeInOutSine,
  lerp,
  clamp01,
  range,
} from '@/lib/timeline'

/* Cross-section colours, taken from the diagram language in `shapes.pptx`:
 * purple for a cut through the volume, green for the base face. `image2.gif`
 * fills the travelling section purple and lights the base green while it runs,
 * and the deck uses the same two colours throughout.
 */
const COLOR_SECTION = new THREE.Color('#9B7BFF')
const COLOR_BASE = new THREE.Color('#3FD69A')
const COLOR_CUT = new THREE.Color('#FF40B0')

/*
 * Section outlines trace where a plane meets a surface. Inside an opaque solid
 * the plane itself is hidden, so the outline is what the viewer sees. Pushed a
 * hair outside the surface and depth-tested, only its visible part draws: a
 * scan line crossing the faces, not an x-ray loop showing through the chrome.
 *   RING_INFLATE  relative push for the diagonal cut sweep
 *   SECTION_PAD   absolute push (local units) for the per-piece sections,
 *                 which can be very thin rectangles
 */
const RING_INFLATE = 1.012
const SECTION_PAD = 0.012

/* Seam line opacity: hidden on the closed hero, lit once the cutting plane has
 * passed through that slice, softened a little in the settled composition. */
const EDGE_IDLE = 0
/* How brightly the shell's own edges are drawn while it is glass. */
const EDGE_GLASS = 0.55
const EDGE_LIT = 0.5
const EDGE_SETTLED = 0.65

const MATCAP_URL = '/matcap.png'
const MATCAP_SOFT_URL = '/matcap-soft.png'

/*
 * Silver matcap.
 *
 * `matcap.png` is 58% near-black inside its disc, so a plain matcap lookup on
 * flat faces renders much of the prism as black card whatever its orientation
 * (55-69% of the silhouette in an earlier build). The approved `demo.mp4` hero
 * is under 1% black: soft mid-grey faces (luminance ~86-114, low saturation)
 * carrying saturated rainbow streaks.
 *
 * So the buyer's matcap is layered over a blurred copy of itself
 * (`matcap-soft.png`, built by scripts/build-matcap-soft.mjs). The blurred copy
 * gives each normal the local average colour of the chrome — partly
 * desaturated, so it reads as silver with a warm or cool tint rather than as
 * the texture's green band — and the sharp matcap is screened on top for the
 * streaks and highlights. `qa/matcap-preview.mjs` reproduces this shader
 * offline, including ACES tone mapping: across the timeline's yaw band it
 * measures 0% black at luminance ~95-130.
 *
 * The sharp layer is weighted above 1 (clamped) so the chrome's highlights and
 * rainbow edge bands read clearly on the silver, next to the bright glass of
 * the hero design; at 0.9 the prism read as matte grey.
 */
const SOFT_GAIN = 2.4
const SOFT_SATURATION = 0.5
const MATCAP_DETAIL = 1.4

/* Depth offsets (polygonOffset factor and units) for the outer surface and
 * for interior cut faces. See createPrismMaterial. */
const DEPTH_OFFSET_OUTER = 2
const DEPTH_OFFSET_INTERIOR = 6

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

function createPrismMaterial(matcap, matcapSoft, depthOffset) {
  const material = new THREE.MeshMatcapMaterial({
    matcap,
    side: THREE.FrontSide,
    // Faces sit a hair back in depth, so seam lines draw cleanly on top of
    // them. Interior cut faces sit further back, so wherever one meets the
    // outer surface along a seam the silver surface wins instead of the dark
    // cut face z-fighting through as a dashed line.
    polygonOffset: true,
    polygonOffsetFactor: depthOffset,
    polygonOffsetUnits: depthOffset,
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
		matcapColor.rgb = 1.0 - ( 1.0 - silver ) * ( 1.0 - min( matcapColor.rgb * matcapDetail, vec3( 1.0 ) ) );`
      )
  }
  material.customProgramCacheKey = () => 'prism-silver-matcap'

  return material
}

export default function PrismObject({ controllerRef, composition, reducedMotion }) {
  const matcap = useTexture(MATCAP_URL, toSRGB)
  const matcapSoft = useTexture(MATCAP_SOFT_URL, toSoftSRGB)

  // Shared by every slice, indexed by geometry group: [outer surface,
  // interior cut faces]. Both compile to the same shader program; only the
  // depth offset render state differs.
  const prismMaterials = useMemo(
    () => [
      createPrismMaterial(matcap, matcapSoft, DEPTH_OFFSET_OUTER),
      createPrismMaterial(matcap, matcapSoft, DEPTH_OFFSET_INTERIOR),
    ],
    [matcap, matcapSoft]
  )
  useEffect(
    () => () => prismMaterials.forEach((material) => material.dispose()),
    [prismMaterials]
  )

  const groupRef = useRef(null)
  const sliceRefs = useRef([])
  const sliceMeshRefs = useRef([])
  const edgeMaterialRefs = useRef([])
  const sectionRefs = useRef([])
  const sectionFillRefs = useRef([])
  const baseFaceRef = useRef(null)
  const shellEdgeRef = useRef(null)

  const cutRef = useRef(null)
  const cutEdgeRef = useRef(null)

  // ── Geometry (built once) ─────────────────────────────────────────────────
  const slices = useMemo(() => buildSlices(), [])
  const sectionOutline = useMemo(() => buildSectionOutline(), [])
  const sectionFill = useMemo(() => buildSectionFill(), [])
  // Edges of the WHOLE solid: while the shell is glass only its silhouette and
  // the edges of the uncut pyramid are drawn, as the diagrams do. The per-slice
  // seams stay dark until the cutting plane actually passes through them.
  const shellEdges = useMemo(() => {
    const pyramid = buildPyramid()
    const edges = new THREE.EdgesGeometry(pyramid, 15)
    pyramid.dispose()
    return edges
  }, [])
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
      sectionOutline.dispose()
      sectionFill.dispose()
      shellEdges.dispose()
      cutGeo.dispose()
      cutEdgeGeo.dispose()
    }
  }, [slices, sliceEdges, sectionOutline, sectionFill, shellEdges, cutGeo, cutEdgeGeo])

  // ── Preallocated scratch — nothing is constructed inside useFrame ─────────
  const scratch = useMemo(() => ({ offset: new THREE.Vector3() }), [])

  useFrame((state) => {
    const controller = controllerRef.current
    // Chapter units (see lib/timeline.js): the rig writes them each frame.
    const units = controller.stage.units
    const s = getStages(units)
    const time = state.clock.elapsedTime

    const idle = reducedMotion ? 0 : 1
    const settleAmount = easeInOutCubic(s.settle)

    // Pieces open steadily through the main transition and stay open: the
    // final state is the exploded composition, as in demo.mp4.
    const spread = easeInOutSine(s.explode) * composition.explodeScale

    // ── Whole-prism orientation ─────────────────────────────────────────────
    if (groupRef.current) {
      // Scroll-driven rotation is applied directly. It already follows the
      // damped scroll progress; smoothing it a second time made the prism turn
      // late and roll behind the rest of the choreography. Pointer input is
      // damped once, in ProgressDriver.
      const sway = (1 - easeInOutSine(s.section) * 0.75) * idle

      groupRef.current.rotation.y =
        prismYaw(units) +
        (controller.pointer.x * 0.04 * composition.pointerStrength +
          Math.sin(time * 0.18) * 0.03) *
          sway

      groupRef.current.rotation.x =
        prismPitch(units) +
        (controller.pointer.y * 0.025 * composition.pointerStrength +
          Math.sin(time * 0.24) * 0.01) *
          sway

      // Once the sliver has left the solid and become the labelled ribbons,
      // the solid steps back and aside rather than sitting behind them.
      const recede = prismRecede(units)

      // Size comes from the hero layout (StageRig); full size on first frame.
      const breathe = 1 + Math.sin(time * 0.55) * 0.008 * idle
      const scale = controller.stage.scale * breathe * lerp(1, 0.58, recede)
      groupRef.current.scale.set(
        PRISM_SHAPE[0] * scale,
        PRISM_SHAPE[1] * scale,
        PRISM_SHAPE[2] * scale
      )
      groupRef.current.position.set(
        lerp(0, -1.9, recede) * controller.stage.scale,
        lerp(0, 0.25, recede) * controller.stage.scale,
        lerp(0, -1.1, recede) * controller.stage.scale
      )
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

    // ── Cross-section through every piece (shapes.pptx `image2.gif`) ────────
    // A horizontal plane travels from the APEX DOWN TO THE BASE, so the
    // section grows from the smallest to the largest — the direction Sunny
    // describes ("this point is the smallest one, this big one is the
    // largest"). At height y the pyramid's section is the square |x|, |z| <= h
    // with h = (1 - y) / 2, and slice i keeps the part where
    // kLow <= 2x + y <= kHigh: an exact rectangle per piece, drawn in the
    // piece's own frame so it travels with it.
    const sectionIn = easeOutCubic(range(s.section, 0, 0.12))
    const scanT = easeInOutSine(s.section)
    const scanY = lerp(0.96, -0.96, scanT)
    const half = sectionHalfExtent(scanY)
    // Held through the sweep, then cleared as the cutting chapter starts.
    const planeFade = sectionIn * (1 - easeInOutSine(range(units, 1.92, 2.12)))

    // ── Structural slices ───────────────────────────────────────────────────
    const edgeDim = lerp(1, EDGE_SETTLED, settleAmount)

    // The solid fades back as its sliver becomes the labelled ribbons, so the
    // ribbons are read against the background rather than against the prism.
    // Every slice draws with the same two materials, so slice 0's mesh reaches
    // them; they are touched through the mesh rather than through the memoized
    // array, which the React compiler holds immutable.
    // The shell also thins out for the diagram chapters, so the travelling
    // section can be seen inside it (the buyer's crystal, not a matte block).
    const shell = shellOpacity(units)
    // Fully lit edges where the shell is at its most transparent.
    const glassEdge = clamp01((0.97 - shell) / 0.5)
    const solidFade = lerp(1, 0.1, prismRecede(units)) * shell
    const firstMesh = sliceMeshRefs.current[0]
    if (firstMesh) {
      const materials = firstMesh.material
      for (let m = 0; m < materials.length; m++) {
        materials[m].transparent = solidFade < 0.995
        materials[m].opacity = solidFade
        // Once the shell is glass it must stop writing depth, or it hides the
        // section, the far edges and the dashed-looking back seams behind it.
        materials[m].depthWrite = solidFade > 0.88
      }
    }

    // The uncut solid's own edges, drawn while the shell is glass. They stop
    // as the pieces start to move, when each slice's own seams take over.
    const shellEdge = shellEdgeRef.current
    if (shellEdge) {
      const drawn = glassEdge * (1 - easeInOutSine(range(units, 2.2, 2.6)))
      shellEdge.visible = drawn > 0.004
      if (shellEdge.visible) shellEdge.material.opacity = EDGE_GLASS * drawn
    }

    // Green base face, lit while the section runs — the deck's colour language
    // (`image2.gif` lights the base as the purple section travels).
    const baseFace = baseFaceRef.current
    if (baseFace) {
      const lit = planeFade * (1 - easeInOutSine(s.explode))
      baseFace.visible = lit > 0.004
      if (baseFace.visible) baseFace.material.opacity = 0.5 * lit
    }

    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i]

      const group = sliceRefs.current[i]
      if (group) {
        sliceOffset(i, spread, scratch.offset)
        group.position.copy(scratch.offset)
        group.rotation.z = sliceTilt(i, spread)
      }

      // A slice's seams are fully lit once the plane has reached its lower cut.
      const edgeMaterial = edgeMaterialRefs.current[i]
      if (edgeMaterial) {
        const lit = clamp01((K_MAX - sweepK) / (K_MAX - slice.kLow))
        // While the shell is glass, its edges are drawn — that line work is
        // what makes the diagrams read as a crystal rather than a smoky block,
        // and it does not depend on the shell's own opacity.
        edgeMaterial.opacity =
          lerp(EDGE_IDLE, EDGE_LIT, easeOutCubic(lit)) * edgeDim * solidFade
      }

      const section = sectionRefs.current[i]
      const sectionFillMesh = sectionFillRefs.current[i]
      if (section || sectionFillMesh) {
        const x0 = Math.max(-half, (slice.kLow - scanY) / 2)
        const x1 = Math.min(half, (slice.kHigh - scanY) / 2)
        const visible = planeFade > 0.004 && x1 - x0 > 0.002

        if (section) {
          section.visible = visible
          if (visible) {
            section.position.set((x0 + x1) / 2, scanY, 0)
            section.scale.set((x1 - x0) / 2 + SECTION_PAD, 1, half + SECTION_PAD)
            section.material.opacity = 0.9 * planeFade
          }
        }

        // The filled face is what actually reads as a cross-section travelling
        // down the solid: an outline alone disappears against the shell.
        if (sectionFillMesh) {
          sectionFillMesh.visible = visible
          if (visible) {
            sectionFillMesh.position.set((x0 + x1) / 2, scanY, 0)
            sectionFillMesh.scale.set((x1 - x0) / 2, 1, half)
            sectionFillMesh.material.opacity = 0.62 * planeFade
          }
        }
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
  })

  return (
    <group ref={groupRef}>
      {/* The uncut solid's edges, drawn while the shell is glass. */}
      <lineSegments
        ref={shellEdgeRef}
        geometry={shellEdges}
        renderOrder={10}
        visible={false}
        frustumCulled={false}
      >
        <lineBasicMaterial
          color="#E4DEFF"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>

      {/* Green base face, as the deck draws it while the section travels. */}
      <mesh
        ref={baseFaceRef}
        geometry={sectionFill}
        position={[0, -1.004, 0]}
        renderOrder={3}
        visible={false}
        frustumCulled={false}
      >
        <meshBasicMaterial
          color={COLOR_BASE}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* ── Structural slices: one solid object, cut, never cross-faded ── */}
      {slices.map((slice, i) => (
        <group
          key={i}
          ref={(el) => {
            sliceRefs.current[i] = el
          }}
        >
          <mesh
            ref={(el) => {
              sliceMeshRefs.current[i] = el
            }}
            geometry={slice.geometry}
            material={prismMaterials}
            renderOrder={8}
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

          {/* This piece's slice of the travelling section, filled. Drawn
              before the shell so the glass blends over it. */}
          <mesh
            ref={(el) => {
              sectionFillRefs.current[i] = el
            }}
            geometry={sectionFill}
            renderOrder={4}
            visible={false}
            frustumCulled={false}
          >
            <meshBasicMaterial
              color={COLOR_SECTION}
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>

          {/* ...and its outline. */}
          <lineLoop
            ref={(el) => {
              sectionRefs.current[i] = el
            }}
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
        </group>
      ))}

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
