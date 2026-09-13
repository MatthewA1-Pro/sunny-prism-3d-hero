'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import PrismCanvas from '@/components/three/PrismCanvas'
import HeroContent, { HeroFrame } from './HeroContent'
import ScrollHint from './ScrollHint'
import { clamp01, layoutFromRects } from '@/lib/timeline'

// The page always opens on the hero, as the buyer's original source did with
// window.scrollTo(0, 0). Restoring a mid-page scroll on reload would open on a
// half-exploded prism with the copy already gone.
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

/**
 * The single mutable animation state for the whole hero.
 *
 * It lives in a ref and is only touched from event handlers and the frame
 * loop, so scrolling, resizing and pointer movement never cause a React render.
 *
 * `layout` is where the prism sits in the hero design, measured from the DOM
 * slot; `stage` is written by the frame loop for the prism to read.
 */
function createController() {
  return {
    progress: 0,
    target: 0,
    pointer: { x: 0, y: 0 },
    pointerTarget: { x: 0, y: 0 },
    initialized: false,
    layout: { slotX: 0.72, slotY: 0.6, slotF: 0.5, focusF: 0.6 },
    stage: { scale: 0.66 },
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

// Unknown on the server. Neither the canvas nor the fallback renders until the
// client has answered; the hero copy and grid are already painted, so the
// prism simply appears in its slot.
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

/**
 * Keeps a WebGL failure inside the canvas layer.
 *
 * Without it, anything thrown by the 3D scene — most likely a matcap texture
 * that fails to download — unmounts the entire page. With it, the hero copy
 * and layout stay, and PrismHero shows the static prism in the slot instead.
 */
class CanvasErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

// ─── Hero ────────────────────────────────────────────────────────────────────

export default function PrismHero() {
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

  const [canvasFailed, setCanvasFailed] = useState(false)
  const onCanvasError = useCallback(() => setCanvasFailed(true), [])
  const showFallback = webgl === false || canvasFailed

  const controllerRef = useRef(createController())
  const trackRef = useRef({ top: 0, length: 1 })

  const heroRef = useRef(null)
  const stageRef = useRef(null)
  const slotRef = useRef(null)
  const copyRef = useRef(null)
  const statsRef = useRef(null)
  const hintRef = useRef(null)

  const contentRefs = useMemo(() => [copyRef, statsRef], [])

  /** Scroll track extent and the prism slot, both read from layout. */
  const measure = useCallback(() => {
    const hero = heroRef.current
    const stage = stageRef.current
    const slot = slotRef.current
    if (!hero || !stage || !slot) return

    trackRef.current = {
      top: hero.getBoundingClientRect().top + window.scrollY,
      length: Math.max(1, hero.offsetHeight - stage.offsetHeight),
    }

    Object.assign(
      controllerRef.current.layout,
      layoutFromRects(stage.getBoundingClientRect(), slot.getBoundingClientRect())
    )
  }, [])

  const readScroll = useCallback(() => {
    const { top, length } = trackRef.current
    const travelled = window.scrollY - top
    controllerRef.current.target = clamp01(travelled / length)

    // The hint fades over the first third of a viewport and returns at the top.
    if (hintRef.current) {
      hintRef.current.style.opacity = String(
        1 - clamp01(travelled / (window.innerHeight * 0.35))
      )
    }
  }, [])

  useEffect(() => {
    const update = () => {
      measure()
      readScroll()
    }
    window.scrollTo(0, 0)
    update()

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

    // The slot's size depends on the copy above it on phones, so re-measure
    // whenever the stage or slot changes size (viewport, font swap, rotation).
    const resizeObserver = new ResizeObserver(update)
    if (stageRef.current) resizeObserver.observe(stageRef.current)
    if (slotRef.current) resizeObserver.observe(slotRef.current)

    let cancelled = false
    document.fonts?.ready.then(() => {
      if (!cancelled) update()
    })

    window.addEventListener('scroll', readScroll, { passive: true })
    window.addEventListener('resize', update)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('pointerleave', onPointerLeave)

    return () => {
      cancelled = true
      resizeObserver.disconnect()
      window.removeEventListener('scroll', readScroll)
      window.removeEventListener('resize', update)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [measure, readScroll])

  const slot = (
    <div className="prism-slot" ref={slotRef}>
      {showFallback ? (
        <div className="webgl-fallback" role="img" aria-label="Prism" />
      ) : null}
    </div>
  )

  return (
    <section className="prism-hero" ref={heroRef} aria-labelledby="hero-title">
      <div className="prism-stage" ref={stageRef}>
        <HeroFrame />

        <div className="hero-webgl" aria-hidden="true">
          {webgl === true && !canvasFailed ? (
            <CanvasErrorBoundary onError={onCanvasError}>
              <PrismCanvas
                controllerRef={controllerRef}
                contentRefs={contentRefs}
                reducedMotion={reducedMotion}
              />
            </CanvasErrorBoundary>
          ) : null}
        </div>

        <HeroContent
          copyRef={copyRef}
          statsRef={statsRef}
          slot={slot}
          scrollHint={<ScrollHint ref={hintRef} />}
        />
      </div>
    </section>
  )
}
