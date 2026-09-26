'use client'

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import PrismCanvas from '@/components/three/PrismCanvas'
import HeroContent from './HeroContent'
import ChapterText from './ChapterText'
import ScrollHint from './ScrollHint'
import { chapters } from '@/lib/chapters'
import { clamp01 } from '@/lib/timeline'

// The page always opens on the hero, as the buyer's original source did with
// window.scrollTo(0, 0). Restoring a mid-page scroll would open on a
// half-finished state.
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

/** Must match the desktop media query in app/globals.css. */
const DESKTOP_LAYOUT = '(min-width: 1024px) and (min-aspect-ratio: 6/5)'

/** Anchor used until the chapters have been measured (hero, desktop). */
const DEFAULT_ANCHOR = { cx: 0.72, cy: 0.6, fraction: 0.58 }

/**
 * The single mutable animation state for the whole story.
 *
 * It lives in a ref and is only touched from event handlers and the frame
 * loop, so scrolling, resizing and pointer movement never cause a React render.
 *
 * `layout.anchors` is where the prism sits in each chapter, read from that
 * chapter's CSS custom properties; `stage` is written by the frame loop for the
 * prism, grid and ambient field to read.
 */
function createController() {
  return {
    progress: 0,
    target: 0,
    pointer: { x: 0, y: 0 },
    pointerTarget: { x: 0, y: 0 },
    initialized: false,
    layout: {
      anchors: chapters.map(() => ({ ...DEFAULT_ANCHOR })),
      aspect: 1.6,
      stacked: false,
    },
    stage: { scale: 0.66, units: 0 },
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

// Unknown on the server: neither the canvas nor the fallback renders until the
// client has answered. The chapters are already painted either way.
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
 * that fails to download — unmounts the entire page. With it, the chapters
 * stay and the static prism shows instead.
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

// ─── Story ───────────────────────────────────────────────────────────────────

export default function PrismStory() {
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
  const trackRef = useRef(1)

  const stageRef = useRef(null)
  const chaptersRef = useRef(null)
  const hintRef = useRef(null)
  const glowRef = useRef(null)
  const poolRef = useRef(null)
  const auraRef = useRef(null)

  /**
   * Scroll length and the per-chapter anchors.
   *
   * Anchors are CSS custom properties on each chapter (percentages of the
   * stage), so breakpoints can re-place the prism without touching JS, and
   * nothing here reads layout during scroll.
   */
  const measure = useCallback(() => {
    const stage = stageRef.current
    const list = chaptersRef.current
    if (!stage || !list) return

    trackRef.current = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight
    )

    const layout = controllerRef.current.layout
    const rect = stage.getBoundingClientRect()
    layout.aspect = rect.width / rect.height
    layout.stacked = !window.matchMedia(DESKTOP_LAYOUT).matches

    const sections = list.querySelectorAll('.chapter')
    sections.forEach((section, i) => {
      if (i >= layout.anchors.length) return
      const style = getComputedStyle(section)
      const read = (name, fallback) => {
        const value = parseFloat(style.getPropertyValue(name))
        return Number.isFinite(value) ? value / 100 : fallback
      }
      const anchor = layout.anchors[i]
      anchor.cx = read('--px', DEFAULT_ANCHOR.cx)
      anchor.cy = read('--py', DEFAULT_ANCHOR.cy)
      anchor.fraction = read('--ph', DEFAULT_ANCHOR.fraction)
    })
  }, [])

  const readScroll = useCallback(() => {
    const y = window.scrollY
    controllerRef.current.target = clamp01(y / trackRef.current)

    // The hint fades over the first third of a viewport.
    if (hintRef.current) {
      hintRef.current.style.opacity = String(
        1 - clamp01(y / (window.innerHeight * 0.35))
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

    // Chapter heights depend on their copy, so re-measure whenever the
    // chapters or the stage change size (viewport, font swap, rotation).
    const resizeObserver = new ResizeObserver(update)
    if (stageRef.current) resizeObserver.observe(stageRef.current)
    if (chaptersRef.current) resizeObserver.observe(chaptersRef.current)

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

  return (
    <>
      {/* Fixed stage: the prism and its light sit behind every chapter. */}
      <div className="prism-stage" ref={stageRef} aria-hidden="true">
        <div className="hero-bg">
          <div className="hero-aura" ref={auraRef} />
          <div className="hero-glow" ref={glowRef} />
          <div className="hero-pool" ref={poolRef} />
        </div>

        <div className="hero-webgl">
          {webgl === true && !canvasFailed ? (
            <CanvasErrorBoundary onError={onCanvasError}>
              <PrismCanvas
                controllerRef={controllerRef}
                glowRef={glowRef}
                poolRef={poolRef}
                auraRef={auraRef}
                reducedMotion={reducedMotion}
              />
            </CanvasErrorBoundary>
          ) : null}
        </div>

        {showFallback ? (
          <div className="webgl-fallback" role="img" aria-label="Prism" />
        ) : null}
      </div>

      <div className="chapters" ref={chaptersRef}>
        <section className="chapter chapter-hero" data-chapter="0">
          <HeroContent scrollHint={<ScrollHint ref={hintRef} />} />
        </section>

        {chapters.slice(1).map((chapter, i) => (
          <ChapterText key={chapter.id} chapter={chapter} index={i + 1} />
        ))}
      </div>
    </>
  )
}
