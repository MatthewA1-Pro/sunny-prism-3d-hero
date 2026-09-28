'use client'

import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'

import PrismObject from './PrismObject'
import AmbientField from './AmbientField'
import GroundGrid from './GroundGrid'
import ShadowBands from './ShadowBands'
import FrustumGuide from './FrustumGuide'
import CentreLine from './CentreLine'
import {
  CAMERA,
  SILHOUETTE_DROP,
  cameraPitch,
  chapterUnits,
  damp,
  frameAt,
  getComposition,
  glowIntensity,
  scaleForFraction,
} from '@/lib/timeline'

function ProgressDriver({ controllerRef, reducedMotion }) {
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const c = controllerRef.current

    if (!c.initialized) {
      c.progress = c.target
      c.pointer.x = c.pointerTarget.x
      c.pointer.y = c.pointerTarget.y
      c.initialized = true
      return
    }

    if (reducedMotion) {
      c.progress = c.target
      c.pointer.x = 0
      c.pointer.y = 0
      return
    }

    c.progress = damp(c.progress, c.target, 10, dt)
    c.pointer.x = damp(c.pointer.x, c.pointerTarget.x, 3.5, dt)
    c.pointer.y = damp(c.pointer.y, c.pointerTarget.y, 3.5, dt)
  })

  return null
}

function StageRig({ controllerRef, glowRef, poolRef, auraRef, composition, reducedMotion }) {
  const frame = useRef({ cx: 0.5, cy: 0.5, fraction: 0.5 })
  const applied = useRef({
    ready: false,
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0,
    pitch: -1,
    glow: '',
    pool: '',
    aura: '',
  })

  useFrame(({ camera, size, clock }) => {
    const c = controllerRef.current
    const a = applied.current

    const s = chapterUnits(c.progress)
    c.stage.units = s

    if (!a.ready) {
      camera.position.set(0, CAMERA.y, CAMERA.z)
      camera.fov = CAMERA.fov
      camera.near = 0.1
      camera.far = 100
      camera.lookAt(0, 0, 0)
      a.ready = true
    }

    const pitch = cameraPitch(s)
    if (Math.abs(pitch - a.pitch) > 0.0004) {
      const cos = Math.cos(pitch)
      const sin = Math.sin(pitch)
      camera.position.set(
        0,
        CAMERA.y * cos + CAMERA.z * sin,
        CAMERA.z * cos - CAMERA.y * sin
      )
      camera.lookAt(0, 0, 0)
      a.pitch = pitch
    }

    const f = frameAt(s, c.layout, composition.explodeScale, frame.current)
    const cy = f.cy + (reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.9) * 0.006)

    c.stage.scale = scaleForFraction(f.fraction)

    const pivotY = cy - SILHOUETTE_DROP * f.fraction
    const offsetX = -(f.cx - 0.5) * size.width
    const offsetY = -(pivotY - 0.5) * size.height

    if (
      size.width !== a.width ||
      size.height !== a.height ||
      Math.abs(offsetX - a.offsetX) > 0.05 ||
      Math.abs(offsetY - a.offsetY) > 0.05
    ) {
      camera.setViewOffset(
        size.width,
        size.height,
        offsetX,
        offsetY,
        size.width,
        size.height
      )
      camera.updateProjectionMatrix()
      a.width = size.width
      a.height = size.height
      a.offsetX = offsetX
      a.offsetY = offsetY
    }

    const px = f.cx * size.width
    const py = cy * size.height
    const ph = f.fraction * size.height
    const intensity = glowIntensity(s)

    const glow = glowRef.current
    if (glow) {
      const next = `translate3d(${(px - 50).toFixed(1)}px, ${(py - 50).toFixed(1)}px, 0) scale(${((ph * 1.35) / 100).toFixed(3)})|${(intensity * 0.9).toFixed(3)}`
      if (next !== a.glow) {
        const [transform, opacity] = next.split('|')
        glow.style.transform = transform
        glow.style.opacity = opacity
        a.glow = next
      }
    }

    const pool = poolRef.current
    if (pool) {
      const next = `translate3d(${(px - 50).toFixed(1)}px, ${(py + ph * 0.46 - 50).toFixed(1)}px, 0) scale(${((ph * 1.1) / 100).toFixed(3)}, ${((ph * 0.28) / 100).toFixed(3)})|${(intensity * 0.8).toFixed(3)}`
      if (next !== a.pool) {
        const [transform, opacity] = next.split('|')
        pool.style.transform = transform
        pool.style.opacity = opacity
        a.pool = next
      }
    }

    const aura = auraRef.current
    if (aura) {
      const ax = (f.cx - 0.5) * size.width * 0.35
      const ay = (f.cy - 0.5) * size.height * 0.35
      const next = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0)|${(0.6 + intensity * 0.4).toFixed(3)}`
      if (next !== a.aura) {
        const [transform, opacity] = next.split('|')
        aura.style.transform = transform
        aura.style.opacity = opacity
        a.aura = next
      }
    }
  })

  return null
}

function SceneContents({ controllerRef, reducedMotion, ...layerRefs }) {
  const width = useThree((state) => state.size.width)
  const composition = useMemo(() => getComposition(width), [width])

  return (
    <>
      <ProgressDriver controllerRef={controllerRef} reducedMotion={reducedMotion} />
      <StageRig
        controllerRef={controllerRef}
        {...layerRefs}
        composition={composition}
        reducedMotion={reducedMotion}
      />
      <GroundGrid controllerRef={controllerRef} />
      <ShadowBands controllerRef={controllerRef} />
      <PrismObject
        controllerRef={controllerRef}
        composition={composition}
        reducedMotion={reducedMotion}
      />
      <FrustumGuide controllerRef={controllerRef} />
      <CentreLine controllerRef={controllerRef} />
      <AmbientField controllerRef={controllerRef} reducedMotion={reducedMotion} />
    </>
  )
}

export default function PrismCanvas({ controllerRef, reducedMotion, ...layerRefs }) {
  return (
    <Canvas
      camera={{
        position: [0, CAMERA.y, CAMERA.z],
        fov: CAMERA.fov,
        near: 0.1,
        far: 100,
      }}
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0)
      }}
    >
      <SceneContents
        controllerRef={controllerRef}
        reducedMotion={reducedMotion}
        {...layerRefs}
      />
    </Canvas>
  )
}
