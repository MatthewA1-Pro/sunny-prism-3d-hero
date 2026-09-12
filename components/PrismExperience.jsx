'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import PrismObject from './PrismObject'
import { getComposition, damp, clamp01 } from '@/lib/timeline'

const BACKGROUND = '#0F021F'

/** Cheap one-off WebGL capability probe. */
function detectWebGL() {
  if (typeof window === 'undefined') return true
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')
    )
  } catch {
    return false
  }
}

/**
 * Drives the camera from viewport size.
 *
 * Framing is recomputed only when the breakpoint actually changes, so a drag
 * resize does not churn the projection matrix every pixel.
 */
function ResponsiveRig({ composition }) {
  const { camera } = useThree()

  useEffect(() => {
    camera.position.set(0, 0.45, composition.cameraZ)
    camera.fov = composition.fov
    camera.near = 0.1
    camera.far = 100
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, composition])

  return null
}

/**
 * Advances the single authoritative progress value.
 *
 * The scroll listener only ever writes a target into a ref; this component
 * damps toward it inside the frame loop. No React state is touched by
 * scrolling or pointer movement, so the tree never re-renders while animating.
 */
function ProgressDriver({ controller, reducedMotion }) {
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const c = controller

    if (!c.initialized.current) {
      // Refreshing mid-page must resolve straight to the right state rather
      // than animating up from zero.
      c.progress.current = c.target.current
      c.pointer.current.x = c.pointerTarget.current.x
      c.pointer.current.y = c.pointerTarget.current.y
      c.initialized.current = true
      return
    }

    if (reducedMotion) {
      c.progress.current = c.target.current
      c.pointer.current.x = 0
      c.pointer.current.y = 0
      return
    }

    // Lambda 9 keeps fast flicks feeling responsive while still absorbing
    // wheel-step jitter; damp() makes it frame-rate independent.
    c.progress.current = damp(c.progress.current, c.target.current, 9, dt)
    c.pointer.current.x = damp(c.pointer.current.x, c.pointerTarget.current.x, 3.5, dt)
    c.pointer.current.y = damp(c.pointer.current.y, c.pointerTarget.current.y, 3.5, dt)
  })

  return null
}

function SceneContents({ controller, reducedMotion }) {
  const { size } = useThree()

  const composition = useMemo(
    () => getComposition(size.width, size.height),
    [size.width, size.height]
  )

  return (
    <>
      <ResponsiveRig composition={composition} />
      <ProgressDriver controller={controller} reducedMotion={reducedMotion} />

      {/* Matcap supplies the chrome and dispersion, so the rig stays minimal
          and there is no runtime HDR/environment dependency to fail on deploy. */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 5]} intensity={0.9} />

      <PrismObject
        controller={controller}
        composition={composition}
        reducedMotion={reducedMotion}
      />
    </>
  )
}

export default function PrismExperience() {
  const [webgl, setWebgl] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)

  const hintRef = useRef(null)
  const docHeight = useRef(1)

  const controller = useRef({
    progress: { current: 0 },
    target: { current: 0 },
    pointer: { current: { x: 0, y: 0 } },
    pointerTarget: { current: { x: 0, y: 0 } },
    initialized: { current: false },
  }).current

  // ── Capability + preference probes ────────────────────────────────────────
  useEffect(() => {
    setWebgl(detectWebGL())

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const measure = useCallback(() => {
    docHeight.current = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight
    )
  }, [])

  const readScroll = useCallback(() => {
    const y = window.scrollY || window.pageYOffset || 0
    controller.target.current = clamp01(y / docHeight.current)

    // Scroll hint fades across the first half viewport and restores at the top.
    if (hintRef.current) {
      const fade = 1 - clamp01(y / (window.innerHeight * 0.5))
      hintRef.current.style.opacity = String(fade)
    }
  }, [controller])

  // ── Scroll / resize / pointer, all passive, all writing to refs ───────────
  useEffect(() => {
    measure()
    readScroll()

    const onScroll = () => readScroll()
    const onResize = () => {
      measure()
      readScroll()
    }
    const onPointerMove = (e) => {
      controller.pointerTarget.current.x =
        (e.clientX / window.innerWidth) * 2 - 1
      controller.pointerTarget.current.y =
        -((e.clientY / window.innerHeight) * 2 - 1)
    }
    const onPointerLeave = () => {
      controller.pointerTarget.current.x = 0
      controller.pointerTarget.current.y = 0
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    // Pointer parallax is mouse-only; touch drives the scroll instead.
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('pointerleave', onPointerLeave)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [controller, measure, readScroll])

  return (
    <>
      <div className="scene-wrapper">
        {webgl ? (
          <Canvas
            camera={{ position: [0, 0.45, 6], fov: 40, near: 0.1, far: 100 }}
            dpr={[1, 1.75]}
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: 'high-performance',
            }}
            onCreated={({ gl }) => {
              gl.setClearColor(BACKGROUND, 1)
            }}
          >
            <color attach="background" args={[BACKGROUND]} />
            <SceneContents
              controller={controller}
              reducedMotion={reducedMotion}
            />
          </Canvas>
        ) : (
          <div className="webgl-fallback" role="img" aria-label="Prism">
            <div className="webgl-fallback-shape" />
          </div>
        )}
      </div>

      <div className="scroll-hint" ref={hintRef}>
        <span>scroll</span>
        <div className="scroll-hint-arrow" />
      </div>
    </>
  )
}
