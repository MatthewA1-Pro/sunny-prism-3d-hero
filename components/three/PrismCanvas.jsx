'use client'

import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'

import PrismObject from './PrismObject'
import {
  CAMERA,
  SILHOUETTE_DROP,
  damp,
  framePrism,
  getComposition,
  getContentVisibility,
  getFocus,
  scaleForFraction,
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
      // Refreshing mid-page must resolve straight to the right state rather
      // than animating up from zero.
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

    // Lambda 9 keeps fast flicks feeling responsive while still absorbing
    // wheel-step jitter; damp() makes it frame-rate independent.
    c.progress = damp(c.progress, c.target, 9, dt)
    c.pointer.x = damp(c.pointer.x, c.pointerTarget.x, 3.5, dt)
    c.pointer.y = damp(c.pointer.y, c.pointerTarget.y, 3.5, dt)
  })

  return null
}

/**
 * Places the prism in the hero composition and keeps the DOM copy in step.
 *
 * Framing uses a lens shift (camera.setViewOffset) rather than moving the
 * prism sideways. The camera keeps looking straight at the prism, so it is
 * shaded and foreshortened exactly as it was tuned against demo.mp4 wherever
 * the layout puts it; an off-axis prism would sample a different part of the
 * matcap and read darker.
 *
 * Copy opacity is written here, from the same damped progress the prism uses,
 * so text and prism can never drift apart.
 */
function StageRig({ controllerRef, contentRefs, reducedMotion }) {
  const frame = useRef({ cx: 0.5, cy: 0.5, fraction: 0.5 })
  const applied = useRef({
    ready: false,
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0,
    visibility: -1,
  })

  useFrame(({ camera, size }) => {
    const c = controllerRef.current
    const a = applied.current

    if (!a.ready) {
      camera.position.set(0, CAMERA.y, CAMERA.z)
      camera.fov = CAMERA.fov
      camera.near = 0.1
      camera.far = 100
      camera.lookAt(0, 0, 0)
      a.ready = true
    }

    const f = framePrism(getFocus(c.progress), c.layout, frame.current)
    c.stage.scale = scaleForFraction(f.fraction)

    // The silhouette's visual centre sits a little below the pivot, because
    // the front base corner dips toward the camera.
    const pivotY = f.cy - SILHOUETTE_DROP * f.fraction
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

    const visibility = getContentVisibility(c.progress)
    if (Math.abs(visibility - a.visibility) > 0.002) {
      a.visibility = visibility
      const lift = reducedMotion ? 0 : (1 - visibility) * -20

      for (const ref of contentRefs) {
        const el = ref.current
        if (!el) continue
        el.style.opacity = visibility.toFixed(3)
        el.style.transform = lift ? `translate3d(0, ${lift.toFixed(1)}px, 0)` : ''
        // Faded-out copy leaves the tab order and cannot be clicked.
        el.style.visibility = visibility < 0.01 ? 'hidden' : ''
      }
    }
  })

  return null
}

function SceneContents({ controllerRef, contentRefs, reducedMotion }) {
  const width = useThree((state) => state.size.width)
  const composition = useMemo(() => getComposition(width), [width])

  return (
    <>
      <ProgressDriver controllerRef={controllerRef} reducedMotion={reducedMotion} />
      <StageRig
        controllerRef={controllerRef}
        contentRefs={contentRefs}
        reducedMotion={reducedMotion}
      />
      <PrismObject
        controllerRef={controllerRef}
        composition={composition}
        reducedMotion={reducedMotion}
      />
    </>
  )
}

/**
 * Transparent canvas: the hero's background and grid are DOM, so the prism
 * sits on the design's own ground and crosses its grid lines as in the design.
 * The matcap needs no lights.
 */
export default function PrismCanvas({ controllerRef, contentRefs, reducedMotion }) {
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
        contentRefs={contentRefs}
        reducedMotion={reducedMotion}
      />
    </Canvas>
  )
}
