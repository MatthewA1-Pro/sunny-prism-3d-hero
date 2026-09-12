# Sunny Prism — 3D Hero

A full-screen, scroll-driven 3D prism hero. One chrome/iridescent square pyramid is
cut along the buyer's diagonal slicing system, opens into a notched composition,
shows its internal cross-sections, and settles — scrubbing smoothly forward and
backward with the page scroll.

Scope is the prism hero only. There are deliberately no features, pricing, contact
or other landing-page sections.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run start      # serve the production build
npm run lint
```

Stack (unchanged from the buyer's source): Next.js 16.1.6, React 19.2.3,
three 0.182, @react-three/fiber 9.5, @react-three/drei 10.7, Tailwind CSS 4.

## Structure

```text
app/
  layout.js            metadata, viewport, theme colour
  page.js              scroll-container > PrismExperience + scroll-space
  globals.css          background, fixed scene, scroll hint, fallback, reduced motion
  icon.svg             favicon
components/
  PrismExperience.jsx  Canvas, scroll/pointer controller, responsive camera, fallback
  PrismObject.jsx      the sliced prism, edge lines, cross-section planes, cut sweep
lib/
  prismGeometry.js     half-space solid construction, slicing, cross-sections
  timeline.js          stage map, slice transforms, composition, orientation
public/
  matcap.png           the chrome/dispersion material (the only runtime asset)
  prism3.glb           buyer's original model, kept for reference; not loaded
references/            buyer material: demo.mp4, 12467.mp4, shapes.pptx,
                       screenshots, and the original Feb-12 source (not shipped)
qa/                    headless-Chrome verification harness (not shipped)
```

## How it works

**One progress value.** Scroll position is normalised to `0..1` and written into a
ref by a passive listener. The frame loop damps toward it with
`THREE.MathUtils.damp`, so the feel is frame-rate independent, and every
structural transform is a pure function of that value. Reverse scrolling
therefore retraces the timeline exactly, and reloading mid-page resolves straight
to the correct state. Scrolling and pointer movement never trigger a React render.

**One object, genuinely cut.** The prism is built procedurally as an intersection
of half-spaces, then partitioned by three planes `2x + y = 0, -1, -2`. Those planes
run parallel to the triangle's right edge — the slicing direction in the buyer's
`shapes.pptx` (`image10.gif`) — and reproduce the ratios of the April source. The
four slice volumes sum exactly to the pyramid's `8/3`, so the closed prism has no
gaps or overlaps. Slices only move along directions that lie inside the cut
planes, which makes intersection between pieces geometrically impossible.

**Stages overlap** (`lib/timeline.js`): hero → turn → cut reveal → notch/explode →
cross-section scan → settle. There are no hard quarter-boundaries and no
cross-fade between separate models.

**Material.** `meshMatcapMaterial` with the buyer's `matcap.png`. A matcap is
indexed by view-space normal, and this texture is mostly black, with its bright
content in a star, a rainbow band and a lower swoosh. The prism's orientation
therefore decides whether it reads as brilliant chrome or as black card.
`qa/matcap-solver.mjs` sweeps orientations against the real texture, and the yaw
band used throughout the timeline comes from it.

**Cross-sections** follow `shapes.pptx` (`image2.gif`): a base plate plus a
horizontal section whose half-extent is exactly `(1 - y) / 2` at height `y`, so
it always matches the pyramid's true cross-section.

**Responsive.** Separate camera distance, scale and explode damping for phones,
tablets and desktop; phones keep the desktop FOV so the matcap reads the same.

**Accessibility and failure modes.** `prefers-reduced-motion` removes idle motion,
parallax and the hint pulse while keeping the prism and its scroll choreography.
Without WebGL a static prism fallback renders on the dark background.

## Verification (`qa/`)

With `npm run start` running:

```bash
node qa/capture.mjs http://localhost:3000 <label> 1440 900   # timeline screenshots + metrics
node qa/scrub-test.mjs http://localhost:3000                  # forward/reverse, flick, resize, reload
node qa/a11y-fallback-test.mjs http://localhost:3000          # reduced motion + no-WebGL fallback
node qa/measure-reference.mjs qa/reference                    # same metrics on demo.mp4 frames
node qa/matcap-solver.mjs 1.0                                 # matcap orientation sweep
```

The harness needs Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`
(edit `CHROME` in the scripts elsewhere). Screenshots are written to `qa/shots/`,
which is git-ignored.

## Notes on the source material

- The deployed site (`3-d-prism.vercel.app`) is a newer revision than the buyer's
  `prism-main` ZIP: it adds the scroll hint, `300vh` scroll space, a GLB prism that
  cross-fades into a procedural one, and removes OrbitControls. This build keeps
  the scroll hint and scroll length, and replaces the cross-fade with a single
  continuous object.
- `Untitled design (9) (1) (1).mp4` (local Downloads) is an unrelated fintech
  landing-page promo, not a prism reference.
- The April `prism-final-v2` experiments (transmission glass, cyan core, extreme
  FOV "orthographic" push, `Width/2` / `Height/2` labels) are not supported by the
  buyer's deck or `demo.mp4`, so they are not included.
