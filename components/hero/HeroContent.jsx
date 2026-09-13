import React from 'react'

import { heroContent } from '@/lib/heroContent'

/*
 * The hero is three stacked layers inside one sticky stage:
 *
 *   HeroFrame    (z 0)  grid lines and hatched cells of the design
 *   WebGL canvas (z 1)  the prism — in front of the grid, as in the design,
 *                       where the prism's base crosses the panel and rail lines
 *   HeroContent  (z 2)  copy, stats, rail icons, scroll hint
 *
 * On desktop both HeroFrame and HeroContent use the design's 11-column grid,
 * so every line and every piece of content lands on the same columns.
 */

/* Bottom rail cells, left to right. Spans and hatching follow the design. */
const RAIL_CELLS = [
  {},
  { hatch: true },
  {},
  { span: 3 },
  {},
  {},
  {},
  { hatch: true },
  { hatch: true },
]

export function HeroFrame() {
  return (
    <div className="hero-frame" aria-hidden="true">
      <div className="frame-mobile" />
      <div className="frame-gutter hatch" />
      <div className="frame-panel">
        <div className="frame-panel-icons">
          <div />
          <div />
        </div>
      </div>
      <div className="frame-rail">
        {RAIL_CELLS.map((cell, i) => (
          <div
            key={i}
            className={[
              'frame-rail-cell',
              cell.hatch ? 'hatch' : '',
              cell.span ? 'frame-rail-span-3' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Line icons ──────────────────────────────────────────────────────────────

const ARROW_ROTATION = { ne: 0, n: -45, nw: -90 }

function Arrow({ dir }) {
  return (
    <svg
      className="rail-arrow"
      viewBox="0 0 32 32"
      style={{ transform: `rotate(${ARROW_ROTATION[dir]}deg)` }}
    >
      <path d="M7 25 L25 7 M11 7 H25 V21" />
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12 H19 M13 6 L19 12 L13 18" />
    </svg>
  )
}

function PhoneCodeIcon() {
  return (
    <svg viewBox="0 0 32 32">
      <rect x="9" y="2.5" width="14" height="27" rx="2.5" />
      <path d="M9 6.5 H23 M9 25.5 H23" />
      <path d="M13.8 13 L11.6 16 L13.8 19 M18.2 13 L20.4 16 L18.2 19 M16.9 12.2 L15.1 19.8" />
    </svg>
  )
}

/* Neutral stand-ins for the design's third-party logos (see unresolvedContent). */
function StackIcon() {
  return (
    <svg viewBox="0 0 32 32">
      <path d="M16 5 L28 11 L16 17 L4 11 Z" />
      <path d="M4 16 L16 22 L28 16" />
      <path d="M4 21 L16 27 L28 21" />
    </svg>
  )
}

function CubeIcon() {
  return (
    <svg viewBox="0 0 32 32">
      <path d="M16 4 L27 10 V22 L16 28 L5 22 V10 Z" />
      <path d="M5 10 L16 16 L27 10 M16 16 V28" />
    </svg>
  )
}

// ─── Content layer ───────────────────────────────────────────────────────────

/**
 * `slot` marks where the prism sits in the layout; PrismHero measures it and
 * frames the WebGL prism onto it. `copyRef` and `statsRef` are faded by the
 * animation loop so the copy and the prism stay in step.
 */
export default function HeroContent({ copyRef, statsRef, slot, scrollHint }) {
  const { eyebrow, title, body, cta, stats, rail } = heroContent

  const ctaInner = (
    <>
      <span>{cta.label}</span>
      <ArrowRight />
    </>
  )

  return (
    <div className="hero-ui">
      <div className="hero-copy" ref={copyRef}>
        <p className="hero-eyebrow">{eyebrow}</p>
        <h1 id="hero-title" className="hero-title">
          {title.map((line, i) => (
            <React.Fragment key={line}>
              {i > 0 ? ' ' : null}
              <span className="hero-title-line">{line}</span>
            </React.Fragment>
          ))}
        </h1>
        <div className="hero-body">
          {body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <div className="hero-cta-row">
          {cta.href ? (
            <a className="hero-cta" href={cta.href}>
              {ctaInner}
            </a>
          ) : (
            <button type="button" className="hero-cta">
              {ctaInner}
            </button>
          )}
        </div>
      </div>

      {slot}

      <ul className="hero-stats" ref={statsRef}>
        {stats.map((stat) => (
          <li key={stat.value} className="hero-stat">
            <span className="hero-stat-value">{stat.value}</span>
            <span className="hero-stat-label">
              {stat.label.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>

      <div className="hero-panel-icon" aria-hidden="true">
        <PhoneCodeIcon />
      </div>

      <div className="hero-rail" aria-hidden="true">
        <div className="rail-logo rail-logo-start">
          <StackIcon />
        </div>
        <div className="rail-arrows">
          {rail.arrows.map((dir, i) => (
            <Arrow key={i} dir={dir} />
          ))}
          <span className="rail-counter">{rail.counter}</span>
        </div>
        <div className="rail-logo rail-logo-end">
          <CubeIcon />
        </div>
      </div>

      {scrollHint}
    </div>
  )
}
