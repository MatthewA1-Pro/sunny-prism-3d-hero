# Sunny Prism — 3D Hero

A full-screen, scroll-driven 3D prism hero. One silver/iridescent square pyramid is
cut along the buyer's diagonal slicing system, slides apart along its cuts, closes
back into one solid, and is scanned by a horizontal cross-section — scrubbing
smoothly forward and backward with the page scroll.

Scope is the prism hero only. There are deliberately no features, pricing, contact
or other landing-page sections.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm run start        # serve the production build
npm run lint
npm run matcap:soft  # regenerate public/matcap-soft.png from public/matcap.png
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
  PrismObject.jsx      sliced prism, silver matcap shader, seams, cut sweep, section scan
lib/
  prismGeometry.js     half-space solid construction, slicing, cross-sections
  timeline.js          stage map, slice transforms, composition, orientation
public/
  matcap.png           the buyer's chrome/dispersion matcap
  matcap-soft.png      blurred copy of it (generated), the silver base layer
  prism3.glb           buyer's original model, kept for reference; not loaded
scripts/
  build-matcap-soft.mjs  generates matcap-soft.png
references/            buyer material: demo.mp4, 12467.mp4, shapes.pptx,
                       screenshots, and the original Feb-12 source (not shipped)
qa/                    headless-Chrome and offline verification tools (not shipped)
```

## How it works

**One progress value.** Scroll position is normalised to `0..1` and written into a
ref by a passive listener. The frame loop damps toward it with
`THREE.MathUtils.damp`, so the feel is frame-rate independent, and every
structural transform — slices, cutting plane, section scan — is a pure function of
that value. Reverse scrolling retraces the timeline exactly, and reloading
mid-page resolves straight to the correct state. Scrolling and pointer movement
never trigger a React render.

**One object, genuinely cut.** The prism is built procedurally as an intersection
of half-spaces, then partitioned by three planes `2x + y = 0, -1, -2`. Those planes
run parallel to the triangle's right edge — the slicing direction in the buyer's
`shapes.pptx` (`image10.gif`) and annotated `prism.png` — and reproduce the ratios
of the April source. The four slice volumes sum exactly to the pyramid's volume,
so the closed prism has no gaps or overlaps. Slices only move along directions
that lie inside the cut planes, so pieces cannot intersect.

**Proportion and framing** follow the `demo.mp4` hero: height 1.5x the base (the
scale `Prism2.jsx` displayed the GLB at), seen near corner-on (40 deg) from almost
level, filling roughly half the viewport height on desktop.

**Stages overlap** (`lib/timeline.js`):

| progress   | stage      | what happens                                                  |
|------------|------------|---------------------------------------------------------------|
| 0.00–0.04  | hero       | closed prism at rest, full size on load, idle breathing        |
| 0.04–0.30  | turn       | eases toward the angle where the cuts read                     |
| 0.08–0.34  | reveal     | diagonal cutting plane sweeps through; each seam lights up     |
| 0.24–0.46  | explode    | slices slide apart along the cut planes                        |
| 0.54–0.76  | reassemble | after a hold, slices glide back into one solid (`image10.gif`) |
| 0.62–0.92  | section    | horizontal section rises base → apex (`image2.gif`)            |
| 0.86–1.00  | settle     | final angle, seams dim                                          |

The section scan runs over the reassembled solid so it is always the pyramid's
true cross-section; its half-extent is exactly `(1 - y) / 2` at height `y`, so it
shrinks to nothing at the apex. Plane outlines are drawn just outside the surface
and depth-tested, so they read as scan lines crossing the faces.

**Material.** The buyer's `matcap.png` is 58% near-black inside its disc, so a
plain matcap on flat faces renders much of the prism as black card (55–69% of the
silhouette in earlier builds), while the approved `demo.mp4` hero is under 1%
black. `PrismObject.jsx` therefore patches `meshMatcapMaterial`: a blurred,
partly desaturated copy of the same matcap (`matcap-soft.png`) provides a silver
base with the texture's own warm/cool tint, and the sharp matcap is screened on
top for streaks and highlights. Opaque, single-sided, one shared material, no
environment map or HDR dependency.

**Responsive.** Separate camera distance, scale and explode damping for phones,
tablets and desktop; phones keep the desktop FOV so the matcap reads the same.
Pointer parallax is mouse-only.

**Accessibility and failure modes.** `prefers-reduced-motion` removes idle motion,
parallax and the hint pulse while keeping the prism and its scroll choreography.
Without WebGL a static prism fallback renders on the dark background.

## Verification (`qa/`)

With `npm run start` running:

```bash
node qa/quick.mjs http://localhost:3000 <label> 1440 900 "0,0.5,1"  # fast captures + dark-pixel share
node qa/capture.mjs http://localhost:3000 <label> 1440 900          # 11-stop timeline screenshots + metrics
node qa/scrub-test.mjs http://localhost:3000                        # forward/reverse, flick, resize, reload
node qa/a11y-fallback-test.mjs http://localhost:3000                # reduced motion + no-WebGL fallback
```

Offline (no browser):

```bash
node qa/matcap-preview.mjs    # exact matcap shader + ACES, contact sheet across yaw/material variants
node qa/matcap-solver.mjs 1.5 # coarse per-face orientation sweep
node qa/geotest.mjs           # slice volumes and partition checks
```

The browser scripts need Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`
(edit `CHROME` in the scripts elsewhere). Screenshots are written to `qa/shots/`,
which is git-ignored.

## Notes on the source material

- `demo.mp4` recorded the buyer's `Prism2.jsx`: `prism3.glb` is a double-walled
  shell rendered double-sided and transparent, which is where its soft silver look
  comes from. This build reproduces that look on a clean procedural solid instead.
- The deployed site (`3-d-prism.vercel.app`) is a newer revision than the buyer's
  `prism-main` ZIP: it adds the scroll hint, `300vh` scroll space, a GLB prism that
  cross-fades into a procedural one, and removes OrbitControls. This build keeps
  the scroll hint and scroll length, and replaces the cross-fade with a single
  continuous object.
- The April `prism-final-v2` experiments (transmission glass, cyan core, extreme
  FOV "orthographic" push, `Width/2` / `Height/2` labels) come from a camera-frustum
  diagram in the deck rather than from the prism itself, and are not included.
