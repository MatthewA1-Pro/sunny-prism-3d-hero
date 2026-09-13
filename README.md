# Sunny Prism — Hero

The hero section of Sunny's site: the designed hero from Sunny's reference (copy,
stats panel, grid frame and icon rail) with a scroll-driven 3D prism as its main
visual. On scroll the copy clears, the prism moves to centre stage, is cut along the
buyer's diagonal slicing system, opens into an exploded view and is scanned by a
horizontal cross-section. The sequence only moves forward and ends exploded, as in
`demo.mp4`.

Scope is the hero only. There are deliberately no features, pricing, contact or
other landing-page sections.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm run start        # serve the production build
npm run lint
npm run matcap:soft  # regenerate public/matcap-soft.png from public/matcap.png
```

Stack: Next.js 16.1.6, React 19.2.3, three 0.182, @react-three/fiber 9.5,
@react-three/drei 10.7, Tailwind CSS 4, Manrope (self-hosted via
`@fontsource-variable/manrope`, so builds never depend on Google Fonts).

## Structure

```text
app/
  layout.js              font, metadata, viewport
  page.js                <main> > PrismHero
  globals.css            design tokens, hero layout (stacked + 11-column grid), hint, fallback
components/
  hero/
    PrismHero.jsx        sticky stage + scroll track, controller, slot measurement, fallback
    HeroContent.jsx      copy, CTA, stats and scroll hint layout
    ScrollHint.jsx
  three/
    PrismCanvas.jsx      transparent Canvas, progress damping, lens-shift framing, copy fade
    PrismObject.jsx      sliced prism, silver matcap shader, seams, cut sweep, section scan
lib/
  heroContent.js         ALL hero copy + list of unresolved content
  prismGeometry.js       half-space solid construction, slicing, cross-sections
  timeline.js            stage map, focus/copy timing, hero framing maths, orientation
public/
  matcap.png             the buyer's chrome/dispersion matcap
  matcap-soft.png        blurred copy of it (generated), the silver base layer
  prism3.glb             buyer's original model, kept for reference; not loaded
scripts/
  build-matcap-soft.mjs
references/              buyer material (not shipped)
qa/                      headless-Chrome and offline verification tools (not shipped)
```

## Hero composition

The design reference is `shapes.pptx` slide 1 (`references/screenshots/pptx/image1.png`).
All copy is transcribed from it into `lib/heroContent.js`; nothing was written for
this build. Items the design does not settle are listed in `unresolvedContent`
there (final copy, CTA destination).

The hero is two layers in one sticky, full-viewport stage: the WebGL canvas (the
prism, on a transparent canvas) and `HeroContent` above it (copy, CTA, stats,
scroll hint). The design's visible grid lines, hatched cells and bottom icon rail
were removed at the client's request; the layout still sits on the design's
invisible 11-column grid.

- **Desktop / landscape tablet** (≥1024px wide, landscape): copy from column 2,
  stats in columns 10–11, the scroll hint centred along the bottom. Colours, type
  sizes and spacing are sampled from the design and scale with the stage width
  (`cqw`), capped by the viewport height (`svh`) so short browser windows shrink
  the text instead of overlapping it.
- **Phones / portrait tablets**: recomposed as a stack — copy, prism, stats row,
  scroll hint. The prism takes whatever height the copy and stats leave, so they
  cannot collide.

**Prism placement follows the DOM.** An invisible `.prism-slot` marks where the
prism belongs in each layout. `PrismHero` measures it (ResizeObserver, fonts ready,
resize) and `PrismCanvas` frames the prism onto it with a lens shift
(`camera.setViewOffset`): the camera still looks straight at the prism, so its
shading and perspective are identical wherever the layout places it.

## Scroll choreography

One normalised progress value (`0..1`) over a `300vh` track drives everything —
prism transforms, framing and the copy fade — so reverse scrolling retraces the
timeline exactly and DOM and WebGL cannot drift apart. It is damped once, with
`THREE.MathUtils.damp` (frame-rate independent); nothing downstream smooths it a
second time, so the prism never trails the scroll. Scrolling never triggers a React
render, and the page always opens at the top, on the hero.

The sequence only moves forward — no state is undone by scrolling further — and
follows the requirement's states and `demo.mp4`:

| progress   | state                 | what happens                                                         |
|------------|-----------------------|----------------------------------------------------------------------|
| 0.00–0.04  | 0 hero                | the designed hero at rest; prism breathes in its slot                |
| 0.04–0.40  | 1 prism enters motion | copy and stats clear; prism glides to centre stage and turns         |
| 0.18–0.40  | 2 slicing visible     | a diagonal cutting line crosses the prism; each seam lights up       |
| 0.34–0.90  | 3 exploded view       | pieces separate steadily into a diagonal staircase, as in the demo   |
| 0.60–0.92  | 4 cross-section       | a horizontal section rises base → apex through every piece           |
| 0.86–1.00  | 5 settle              | final angle; the exploded composition holds                          |

**Geometry.** The prism is built procedurally as an intersection of half-spaces and
partitioned by three planes `2x + y = 0, -1, -2`, parallel to the triangle's right
edge — the slicing direction in `shapes.pptx` and the annotated `prism.png`. Slice
volumes sum exactly to the pyramid. When the prism opens, each slice moves out along
the cut normal in slice order (plus an in-plane slide and depth), so neighbours only
ever move apart and cannot intersect. Each piece's cross-section is exact: slice `i`
at height `y` keeps the rectangle `max(-h, (kLow - y)/2) ≤ x ≤ min(h, (kHigh - y)/2)`,
`|z| ≤ h`, with `h = (1 - y)/2`. Proportion (height 1.5x base) and hero angle (40°) follow
`demo.mp4`.

**Material.** `matcap.png` is 58% near-black inside its disc, so a plain matcap
renders flat faces as black card. `PrismObject.jsx` layers the buyer's matcap over
a blurred, partly desaturated copy of itself: a silver base carrying the texture's
own tint, with the sharp matcap screened on top for highlights and rainbow edges.

**Accessibility and failure modes.** `prefers-reduced-motion` removes idle motion,
parallax, the copy lift and the hint pulse; scroll still drives the scene. Faded
copy is `visibility: hidden`, so it leaves the tab order. Without WebGL a static
prism renders in the same slot. Touch and pen input never drive parallax, and the
canvas passes vertical swipes through to the page.

## Verification (`qa/`)

With `npm run start` running:

```bash
node qa/hero.mjs http://localhost:3000 <label> 1440 900 "0,0.25,0.5,1"  # what a visitor sees, hint included
node qa/scrub-test.mjs http://localhost:3000                            # forward/reverse, flick, resize, reload
node qa/a11y-fallback-test.mjs http://localhost:3000                    # reduced motion + no-WebGL fallback
node qa/quick.mjs http://localhost:3000 <label> 1440 900 "0,0.5,1"      # prism-focused captures + dark-pixel share
node qa/diag-scroll.mjs http://localhost:3000 390 844                   # per-step scroll timing, fps, ResizeObserver count
```

Headless Chrome renders software WebGL with no vsync, so it redraws flat out and
DevTools calls can take seconds to return — especially on small viewports.
`diag-scroll.mjs` separates that harness effect from a real page stall (the page
itself reports its frame rate and ResizeObserver activity).

Offline:

```bash
node qa/matcap-preview.mjs    # exact matcap shader + ACES, contact sheet across material variants
node qa/geotest.mjs           # slice volumes and partition checks
```

Browser scripts need Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`
(edit `CHROME` in the scripts elsewhere). Screenshots go to `qa/shots/` (git-ignored).

## Notes on the source material

- `demo.mp4` and `12467.mp4` show the prism only; the hero layout comes from the
  `shapes.pptx` slide 1 design.
- `demo.mp4` recorded the buyer's `Prism2.jsx`: `prism3.glb` is a double-walled shell
  rendered double-sided, which is where its soft silver look comes from. This build
  reproduces that look on a clean procedural solid.
- The April `prism-final-v2` experiments (transmission glass, cyan core, extreme FOV
  push, `Width/2` / `Height/2` labels) come from a camera-frustum diagram in the deck
  rather than from the prism, and are not included.
