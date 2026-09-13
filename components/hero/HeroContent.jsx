import React from 'react'

import { heroContent } from '@/lib/heroContent'

/*
 * Content layer of the hero, above the WebGL canvas.
 *
 * On desktop it sits on an invisible 11-column grid taken from Sunny's design,
 * so the copy and stats keep the design's positions. The design's visible grid
 * lines, hatched cells and bottom icon rail were removed at the client's
 * request; only the content remains.
 */

function ArrowRight() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12 H19 M13 6 L19 12 L13 18" />
    </svg>
  )
}

/**
 * `slot` marks where the prism sits in the layout; PrismHero measures it and
 * frames the WebGL prism onto it. `copyRef` and `statsRef` are faded by the
 * animation loop so the copy and the prism stay in step.
 */
export default function HeroContent({ copyRef, statsRef, slot, scrollHint }) {
  const { eyebrow, title, body, cta, stats } = heroContent

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

      {scrollHint}
    </div>
  )
}
