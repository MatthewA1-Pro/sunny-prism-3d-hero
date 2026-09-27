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
  page.js                <main> > PrismStory
  globals.css            design tokens, stage, chapters and their prism anchors, labels, fallback
components/
  hero/
    PrismStory.jsx       fixed stage + scrolling chapters, controller, anchor measurement, fallback
    ChapterText.jsx      one chapter's eyebrow, title and body
    HeroContent.jsx      hero copy, CTA, stats and scroll hint layout
    ScrollHint.jsx
  three/
    PrismCanvas.jsx      transparent Canvas, progress damping, camera lift, lens-shift framing
    PrismObject.jsx      sliced prism, silver matcap shader, seams, cut sweep, section scan
    GroundGrid.jsx       the ground field, coarse over fine (10x10 into 50x50)
    ShadowBands.jsx      cast shadow, its labelled bands, and the sliver that becomes the ribbons
    AmbientField.jsx     orbit lines and particles around the prism
lib/
  chapters.js            the chapter list, band labels and everything still unresolved
  heroContent.js         ALL hero copy + list of unresolved content
  prismGeometry.js       half-space solid construction, slicing, cross-sections
  timeline.js            chapter units, stage ranges, framing maths, orientation, camera lift
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

**Prism placement follows the DOM.** Every chapter declares where the prism
belongs in CSS custom properties — `--px`, `--py` (its centre, as percentages of
the stage) and `--ph` (its height) — so a media query can re-place it per
breakpoint without touching JS. `PrismStory` reads them (ResizeObserver, fonts
ready, resize) and `PrismCanvas` frames the prism onto them with a lens shift
(`camera.setViewOffset`): the camera still looks straight at the prism, so its
shading and perspective are identical wherever the layout places it.

## Scroll choreography

One normalised progress value (`0..1`) drives everything — prism transforms, the
grid, the shadow, the bands, the ribbons and the background glow — so reverse
scrolling retraces the timeline exactly and DOM and WebGL cannot drift apart. It
is damped once, with `THREE.MathUtils.damp` (frame-rate independent); nothing
downstream smooths it a second time, so the prism never trails the scroll.
Scrolling never triggers a React render, and the page always opens at the top, on
the hero.

Progress is expressed in **chapter units**: `s = p * CHAPTER_COUNT`, so chapter
`i` is on screen while `s` is in `[i, i+1]` and every stage range in
`lib/timeline.js` reads directly against the walkthrough. The seven chapters are
followed by one viewport of tail (`.chapter-tail`), which is why the multiplier
is `CHAPTER_COUNT` and not `CHAPTER_COUNT - 1`: without it the last chapter would
only be reached at the very bottom of the page and would have no room to play.

The story follows the buyer's walkthrough of `shapes.pptx`, in his order. It only
moves forward — no state is undone by scrolling further:

| chapter      | copy            | what happens |
|--------------|-----------------|--------------|
| 0 `hero`     | the design      | the designed hero: copy, CTA, stats, scroll hint; prism closed |
| 1 `section`  | cross-section   | a horizontal section travels apex → base, smallest to largest (`image2.gif`, top row) |
| 2 `cut`      | the cut         | the diagonal plane crosses the solid, seams light as it passes, the pieces open and stay open |
| 3 `grid`     | granularity     | the view pulls back, the camera lifts, and the ground field resolves 10×10 into 50×50 (`image4.png`) |
| 4 `shadow`   | the shadow      | a low light behind and to the left throws the prism's flat triangular shadow forward across the floor |
| 5 `ribbons`  | the bands       | the shadow stands up, splits along the same cuts into four labelled bands, and the second shadow arrives from the other side to meet it (`image8.png`) |
| 6 `sliver`   | the sliver      | the bands move into the prism's centre plane — apex to base mid-line — then spread into the labelled ribbon stack as the view zooms in |

Position, scale and rotation run on a smooth spline through those beats, so the
prism flows through them without stopping. A glow, a light pool and a background
aura behind the canvas follow the prism more slowly (background parallax). On
phones and portrait tablets the prism's size is capped so the open pieces fit the
screen, and the band diagram sits closer in so its labels stay on screen.

**The camera lift.** From the zoom-out on, the camera rises and looks down 16°,
swinging on an arc about the subject so the prism keeps its size and framing.
Without it the camera sits almost in the ground plane: the grid renders as
horizontal stripes and the cast shadow collapses to a line. Looking down tips the
prism toward the viewer by the same angle, so its own pitch keys take that back
out — what matters is the angle the prism is *seen* at, which stays inside the
−6°..8° band the matcap was validated over (`qa/matcap-preview.mjs`).

**The shadow and the sliver** (`ShadowBands.jsx`) are one set of four quads that
morphs between three states, so the page reads as one thing changing rather than
three props swapped in and out: flat on the floor, upright and labelled, then the
ribbon stack. The bands are the prism's own silhouette triangle cut by the same
diagonal system as the solid, so the shadow comes apart exactly where the prism
does, and each ribbon's width is its band's share of the triangle's area. Flat on
the floor the triangle is too shallow at the camera's angle to carry four labels,
so it stands up as it splits — the readable version of the labelled triangles in
`image8.png`. Labels are page DOM positioned by projection, so they stay crisp.

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
node qa/bands-test.mjs http://localhost:3000 1440 900                   # chapters 4-6: track length, labels, ribbon column
node qa/scrub-test.mjs http://localhost:3000                            # forward/reverse, flick, resize, reload
node qa/a11y-fallback-test.mjs http://localhost:3000                    # reduced motion + no-WebGL fallback
node qa/texture-failure-test.mjs http://localhost:3000                  # matcap blocked: copy stays, fallback shows
bash qa/run-p23.sh                                                      # all of the above, every viewport, one run
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
