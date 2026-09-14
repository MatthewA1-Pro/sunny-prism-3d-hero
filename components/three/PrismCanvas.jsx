'use client'

import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'

import PrismObject from './PrismObject'
import AmbientField from './AmbientField'
import {
  CAMERA,
  SILHOUETTE_DROP,
  copyDrift,
  damp,
  framePrism,
  getComposition,
  glowIntensity,
  scaleForFraction,
  statsVisibility,
} from '@/lib/timeline'

/**
 * Advances the single authoritative progress value.
 *
 * The scroll listener only ever writes a target into the controller; this
 * damps toward it inside the frame loop.
 */
function ProgressDriver({ controllerRef, reducedMotion }) {
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const c = controllerRef.current

    if (!c.initialized) {
      // The first frame resolves straight to the current state rather than
      // animating up from zero.
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

    // The only smoothing stage for scroll: lambda 10 closes 63% of the gap in
    // 0.1 s, enough to absorb wheel steps without the prism trailing the
    // scroll. Nothing downstream smooths progress again. damp() makes it
    // frame-rate independent.
    c.progress = damp(c.progress, c.target, 10, dt)
    c.pointer.x = damp(c.pointer.x, c.pointerTarget.x, 3.5, dt)
    c.pointer.y = damp(c.pointer.y, c.pointerTarget.y, 3.5, dt)
  })

  return null
}

/**
 * Moves the prism through the hero along the storyboard path and keeps every
 * DOM layer in step with it: copy drift, stats, and the background glow.
 *
 * Framing uses a lens shift (camera.setViewOffset) rather than moving the
 * prism sideways. The camera keeps looking straight at the prism, so it is
 * shaded and foreshortened the same wherever the path takes it; an off-axis
 * prism would sample a different part of the matcap and read darker.
 *
 * All DOM writes happen here, from the same damped progress the prism uses,
 * so the page layers can never drift apart from the 3D scene.
 */
function StageRig({
  controllerRef,
  copyRef,
  statsRef,
  glowRef,
  poolRef,
  auraRef,
  composition,
  reducedMotion,
}) {
  const frame = useRef({ cx: 0.5, cy: 0.5, fraction: 0.5 })
  const applied = useRef({
    ready: false,
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0,
    drift: NaN,
    stats: -1,
    glow: '',
    pool: '',
    aura: '',
  })

  useFrame(({ camera, size, clock }) => {
    const c = controllerRef.current
    const a = applied.current
    const p = c.progress

    if (!a.ready) {
      camera.position.set(0, CAMERA.y, CAMERA.z)
      camera.fov = CAMERA.fov
      camera.near = 0.1
      camera.far = 100
      camera.lookAt(0, 0, 0)
      a.ready = true
    }

    const f = framePrism(p, c.layout, composition.explodeScale, frame.current)

    // Storyboard: "subtle floating motion".
    const cy = f.cy + (reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.9) * 0.006)

    c.stage.scale = scaleForFraction(f.fraction)

    // The silhouette's visual centre sits a little below the pivot, because
    // the front base corner dips toward the camera.
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

    // ── Copy: always readable, drifting up slightly (text parallax) ────────
    const copy = copyRef.current
    const drift = reducedMotion ? 0 : copyDrift(p)
    if (copy && Math.abs(drift - a.drift) > 0.1) {
      copy.style.transform = drift ? `translate3d(0, ${drift.toFixed(1)}px, 0)` : ''
      a.drift = drift
    }

    // ── Stats: clear on wide layouts, where the prism's path crosses them ──
    const stats = statsRef.current
    const statsOpacity = c.layout.stacked ? 1 : statsVisibility(p)
    if (stats && Math.abs(statsOpacity - a.stats) > 0.002) {
      stats.style.opacity = statsOpacity.toFixed(3)
      // Cleared stats leave the tab order and the accessibility tree.
      stats.style.visibility = statsOpacity < 0.01 ? 'hidden' : ''
      a.stats = statsOpacity
    }

    // ── Background glow, light pool and aura follow the prism ─────────────
    // The glow sits behind the prism's centre and the pool under its base;
    // the aura moves at a third of the prism's travel (background parallax).
    const px = f.cx * size.width
    const py = cy * size.height
    const ph = f.fraction * size.height
    const intensity = glowIntensity(p)

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
      const ax = (f.cx - c.layout.slotX) * size.width * 0.35
      const ay = (f.cy - c.layout.slotY) * size.height * 0.35 - p * size.height * 0.04
      const next = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0)|${(0.65 + intensity * 0.35).toFixed(3)}`
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

/*
 * The page-layer refs travel as individual `*Ref` props rather than one object:
 * React's compiler only treats a value as a mutable ref when it is passed as a
 * ref, and the frame loop has to write their styles.
 */
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
      <PrismObject
        controllerRef={controllerRef}
        composition={composition}
        reducedMotion={reducedMotion}
      />
      <AmbientField controllerRef={controllerRef} reducedMotion={reducedMotion} />
    </>
  )
}

/**
 * Transparent canvas: the hero's background, glow and copy are DOM, so the
 * prism sits on the page's own ground between them. The matcap needs no lights.
 */
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
