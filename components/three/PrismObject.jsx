'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

import {
  buildSlices,
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
  PRISM_SHAPE,
  easeInOutCubic,
  easeOutCubic,
  easeInOutSine,
  lerp,
  clamp01,
  range,
} from '@/lib/timeline'

/* Section outline colour matches the filled purple plane (gif2 reference). */
const COLOR_SECTION = new THREE.Color('#B48CFF')
const COLOR_CUT = new THREE.Color('#9B5CFF')

const RING_INFLATE = 1.012
const SECTION_PAD = 0.012

const EDGE_IDLE = 0
const EDGE_LIT = 0.5
const EDGE_SETTLED = 0.65

const MATCAP_URL = '/matcap.png'
const MATCAP_SOFT_URL = '/matcap-soft.png'

const SOFT_GAIN = 2.65
const SOFT_SATURATION = 0.5
const MATCAP_DETAIL = 1.55

const DEPTH_OFFSET_OUTER = 2
const DEPTH_OFFSET_INTERIOR = 6

function toSRGB(texture) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
}

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
    polygonOffset: true,
    polygonOffsetFactor: depthOffset,
    polygonOffsetUnits: depthOffset,
  })

  material.onBeforeCompile = (shader) => {
    const sample = 'vec4 matcapColor = texture2D( matcap, uv );'
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
\t\tvec3 softColor = texture2D( matcapSoft, uv ).rgb;
\t\tfloat softLuma = dot( softColor, vec3( 0.2126, 0.7152, 0.0722 ) );
\t\tvec3 silver = min( mix( vec3( softLuma ), softColor, softSaturation ) * softGain, vec3( 1.0 ) );
\t\tmatcapColor.rgb = 1.0 - ( 1.0 - silver ) * ( 1.0 - min( matcapColor.rgb * matcapDetail, vec3( 1.0 ) ) );`
      )
  }
  material.customProgramCacheKey = () => 'prism-silver-matcap'

  return material
}

export default function PrismObject({ controllerRef, composition, reducedMotion }) {
  const matcap = useTexture(MATCAP_URL, toSRGB)
  const matcapSoft = useTexture(MATCAP_SOFT_URL, toSoftSRGB)

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

  const cutRef = useRef(null)
  const cutEdgeRef = useRef(null)

  const slices = useMemo(() => buildSlices(), [])
  const sectionOutline = useMemo(() => buildSectionOutline(), [])
  const cutSweep = useMemo(() => buildCutSweep(), [])
  const cutGeo = useMemo(() => buildCutSweepGeometry(), [])
  const cutEdgeGeo = useMemo(() => buildCutSweepOutline(), [])

  const sliceEdges = useMemo(
    () => slices.map((s) => new THREE.EdgesGeometry(s.geometry, 15)),
    [slices]
  )

  useEffect(() => {
    return () => {
      slices.forEach((s) => s.geometry.dispose())
      sliceEdges.forEach((e) => e.dispose())
      sectionOutline.dispose()
      cutGeo.dispose()
      cutEdgeGeo.dispose()
    }
  }, [slices, sliceEdges, sectionOutline, cutGeo, cutEdgeGeo])

  const scratch = useMemo(() => ({ offset: new THREE.Vector3() }), [])

  useFrame((state) => {
    const controller = controllerRef.current
    const units = controller.stage.units
    const s = getStages(units)
    const time = state.clock.elapsedTime

    const idle = reducedMotion ? 0 : 1
    const settleAmount = easeInOutCubic(s.settle)
    const spread = easeInOutSine(s.explode) * composition.explodeScale

    if (groupRef.current) {
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

      const recede = prismRecede(units)
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

    const sweepT = easeInOutCubic(s.reveal)
    const sweepK = lerp(K_MAX - 0.02, K_MIN + 0.02, sweepT)
    const sweepFade =
      easeOutCubic(range(sweepT, 0, 0.12)) *
      (1 - easeInOutSine(range(sweepT, 0.82, 1)))

    const sectionIn = easeOutCubic(range(s.section, 0, 0.12))
    const scanT = easeInOutSine(s.section)
    const scanY = lerp(0.96, -0.96, scanT)
    const half = sectionHalfExtent(scanY)
    const planeFade = sectionIn * (1 - easeInOutSine(range(units, 1.92, 2.12)))

    const edgeDim = lerp(1, EDGE_SETTLED, settleAmount)

    // Soften the solid while the cross-section is active so the filled
    // purple plane (SectionFill) reads through the matcap.
    const sectionSeeThrough = easeInOutSine(s.section) * 0.35
    const solidFade = lerp(1, 0.1, prismRecede(units)) * (1 - sectionSeeThrough)
    const firstMesh = sliceMeshRefs.current[0]
    if (firstMesh) {
      const materials = firstMesh.material
      for (let m = 0; m < materials.length; m++) {
        materials[m].transparent = solidFade < 0.995
        materials[m].opacity = solidFade
        materials[m].depthWrite = solidFade > 0.995
      }
    }

    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i]

      const group = sliceRefs.current[i]
      if (group) {
        sliceOffset(i, spread, scratch.offset)
        group.position.copy(scratch.offset)
        group.rotation.z = sliceTilt(i, spread)
      }

      const edgeMaterial = edgeMaterialRefs.current[i]
      if (edgeMaterial) {
        const lit = clamp01((K_MAX - sweepK) / (K_MAX - slice.kLow))
        edgeMaterial.opacity =
          lerp(EDGE_IDLE, EDGE_LIT, easeOutCubic(lit)) * edgeDim * solidFade
      }

      const section = sectionRefs.current[i]
      if (section) {
        const x0 = Math.max(-half, (slice.kLow - scanY) / 2)
        const x1 = Math.min(half, (slice.kHigh - scanY) / 2)
        const visible = planeFade > 0.004 && x1 - x0 > 0.002
        section.visible = visible
        if (visible) {
          section.position.set((x0 + x1) / 2, scanY, 0)
          section.scale.set((x1 - x0) / 2 + SECTION_PAD, 1, half + SECTION_PAD)
          section.material.opacity = 1.0 * planeFade
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

        for (let v = 0; v < CUT_SWEEP_SAMPLES; v++) {
          edge[v * 3] = cx + (pos[v * 3] - cx) * RING_INFLATE
          edge[v * 3 + 1] = cy + (pos[v * 3 + 1] - cy) * RING_INFLATE
          edge[v * 3 + 2] = cz + (pos[v * 3 + 2] - cz) * RING_INFLATE
        }
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

useTexture.preload(MATCAP_URL)
useTexture.preload(MATCAP_SOFT_URL)
