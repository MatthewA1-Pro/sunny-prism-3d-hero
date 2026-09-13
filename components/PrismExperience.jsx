'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'

import PrismObject from './PrismObject'
import { getComposition, damp, clamp01 } from '@/lib/timeline'

const BACKGROUND = '#0F021F'

/**
 * The single mutable animation state for the whole experience.
 *
 * It lives in a ref and is only ever touched from event handlers and the frame
 * loop, so scrolling and pointer movement never cause a React render.
 */
function createController() {
  return {
    progress: 0,
    target: 0,
    pointer: { x: 0, y: 0 },
    pointerTarget: { x: 0, y: 0 },
    initialized: false,
  }
}

// ─── Browser capabilities, read with useSyncExternalStore ───────────────────
//
// Reading these in an effect and calling setState forces an extra render and
// is flagged by React's set-state-in-effect rule. useSyncExternalStore is the
// sanctioned way to read a browser value: the server snapshot keeps hydration
// consistent, and the client value is picked up without a cascading update.

let webglSupport = null

/** One-off WebGL probe, cached. The probe context is released immediately so
 *  it does not count against the browser's live-context limit. */
function getWebGLSupport() {
  if (webglSupport !== null) return webglSupport
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    webglSupport = Boolean(gl)
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webglSupport = false
  }
  return webglSupport
}

const subscribeNever = () => () => {}

// Unknown on the server. Rendering the Canvas optimistically would, on a client
// without WebGL, commit it once during hydration and let three.js throw while
// creating a context; rendering the fallback optimistically would flash it on
// every capable client. So neither renders until the client has answered — the
// CSS background already paints the scene colour, so the gap is invisible.
const webglUnknownOnServer = () => null

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
let reducedMotionQuery = null
const getReducedMotionQuery = () =>
  (reducedMotionQuery ??= window.matchMedia(REDUCED_MOTION))

function subscribeReducedMotion(onChange) {
  const mq = getReducedMotionQuery()
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
const getReducedMotion = () => getReducedMotionQuery().matches
const assumeFullMotion = () => false

// ─── Scene pieces ────────────────────────────────────────────────────────────

/**
 * Applies the responsive camera framing.
 *
 * Done in the frame loop, where the camera arrives as a callback argument,
 * rather than by mutating the camera returned from useThree(). It re-applies
 * only when the breakpoint composition actually changes, so a drag resize does
 * not rebuild the projection matrix every frame.
 */
function ResponsiveRig({ composition }) {
  const appliedRef = useRef(null)

  useFrame(({ camera }) => {
    if (appliedRef.current === composition) return
    appliedRef.current = composition

    camera.position.set(0, composition.cameraY, composition.cameraZ)
    camera.fov = composition.fov
    camera.near = 0.1
    camera.far = 100
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  })

  return null
}

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

function SceneContents({ controllerRef, reducedMotion }) {
  const { size } = useThree()

  const composition = useMemo(
    () => getComposition(size.width, size.height),
    [size.width, size.height]
  )

  return (
    <>
      <ResponsiveRig composition={composition} />
      <ProgressDriver controllerRef={controllerRef} reducedMotion={reducedMotion} />

      {/* Matcap supplies the chrome and dispersion, so the rig stays minimal
          and there is no runtime HDR/environment dependency to fail on deploy. */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 5]} intensity={0.9} />

      <PrismObject
        controllerRef={controllerRef}
        composition={composition}
        reducedMotion={reducedMotion}
      />
    </>
  )
}

export default function PrismExperience() {
  const webgl = useSyncExternalStore(
    subscribeNever,
    getWebGLSupport,
    webglUnknownOnServer
  )
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    assumeFullMotion
  )

  const hintRef = useRef(null)
  const docHeightRef = useRef(1)
  const controllerRef = useRef(createController())

  const measure = useCallback(() => {
    docHeightRef.current = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight
    )
  }, [])

  const readScroll = useCallback(() => {
    const y = window.scrollY || window.pageYOffset || 0
    controllerRef.current.target = clamp01(y / docHeightRef.current)

    // Scroll hint fades across the first half viewport and restores at the top.
    if (hintRef.current) {
      const fade = 1 - clamp01(y / (window.innerHeight * 0.5))
      hintRef.current.style.opacity = String(fade)
    }
  }, [])

  // ── Scroll / resize / pointer, all passive, all writing to the controller ─
  useEffect(() => {
    measure()
    readScroll()

    const onScroll = () => readScroll()
    const onResize = () => {
      measure()
      readScroll()
    }
    const onPointerMove = (e) => {
      // Touch and pen drags are scroll gestures, not parallax input.
      if (e.pointerType !== 'mouse') return
      const target = controllerRef.current.pointerTarget
      target.x = (e.clientX / window.innerWidth) * 2 - 1
      target.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    const onPointerLeave = () => {
      const target = controllerRef.current.pointerTarget
      target.x = 0
      target.y = 0
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
  }, [measure, readScroll])

  return (
    <>
      <div className="scene-wrapper">
        {webgl === null ? null : webgl ? (
          <Canvas
            camera={{ position: [0, 0.1, 6], fov: 40, near: 0.1, far: 100 }}
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
              controllerRef={controllerRef}
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
