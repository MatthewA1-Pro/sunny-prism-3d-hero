/**
 * The scroll story, chapter by chapter.
 *
 * SOURCE: Sunny's walkthrough of shapes.pptx. Each chapter is one stage he
 * described, in his order:
 *
 *   0 hero      the designed hero (shapes.pptx slide 1)
 *   1 section   the purple horizontal cross-section travelling from the
 *               smallest section at the apex down to the largest at the base
 *               (`image2.gif`, top row)
 *   2 cut       the diagonal cutting plane and the pieces opening
 *               (`image10.gif`, the annotated `prism.png`)
 *   3 grid      the view zooms out and the ground grid subdivides, 10x10 into
 *               50x50, showing more granularity (`image4.png`)
 *   4 shadow    a light to the left casts the prism's flat, isometric
 *               triangular shadow; then the second one [PHASE 2]
 *   5 ribbons   the shadow triangle is cut into labelled bands, and the two
 *               triangles come together (`image8.png`) [PHASE 2]
 *   6 sliver    the centre slice — apex down to the base mid-line — lifts out
 *               as a 2D shape and morphs into labelled ribbons, then the view
 *               zooms into it (`image2.gif` bottom row, `image8.png`) [PHASE 2]
 *
 * Deferred by Sunny in the same walkthrough: the red centre line that
 * straightens into a ledge ("we can do later, another problem").
 *
 * COPY: Sunny said only "some text" for chapters 1-6, so every `eyebrow`,
 * `title` and `body` below is PLACEHOLDER, written from his own vocabulary and
 * marked here so it is easy to find and replace. Nothing in this file is
 * approved marketing copy.
 */
export const PLACEHOLDER_COPY = true

export const chapters = [
  {
    id: 'hero',
    // The hero's copy lives in lib/heroContent.js (transcribed from the design).
    kind: 'hero',
    anchor: 'hero',
  },
  {
    id: 'section',
    kind: 'text',
    side: 'left',
    eyebrow: 'Cross-section',
    title: 'Every height is a different section',
    body: 'PLACEHOLDER — the horizontal plane travels from the smallest section at the apex to the largest at the base.',
  },
  {
    id: 'cut',
    kind: 'text',
    side: 'left',
    eyebrow: 'The cut',
    title: 'Cut along one edge, opened in place',
    body: 'PLACEHOLDER — the cutting plane runs parallel to the right edge, and the pieces slide apart along it.',
  },
  {
    id: 'grid',
    kind: 'text',
    side: 'right',
    eyebrow: 'Granularity',
    title: 'Zoom out, and the detail multiplies',
    body: 'PLACEHOLDER — the same field resolves from ten by ten into fifty by fifty as the view pulls back.',
  },
  {
    id: 'shadow',
    kind: 'text',
    side: 'left',
    eyebrow: 'The shadow',
    title: 'A light from the side casts it flat',
    body: 'PLACEHOLDER — the prism throws a two-dimensional triangle across the grid.',
  },
  {
    id: 'ribbons',
    kind: 'text',
    side: 'right',
    eyebrow: 'The bands',
    title: 'The triangle divides into named parts',
    body: 'PLACEHOLDER — the shadow splits into labelled bands, and the second triangle meets it.',
  },
  {
    id: 'sliver',
    kind: 'text',
    side: 'left',
    eyebrow: 'The sliver',
    title: 'The centre slice lifts out',
    body: 'PLACEHOLDER — the slice from the apex to the base mid-line comes forward and becomes the ribbons.',
  },
]

export const CHAPTER_COUNT = chapters.length

export const unresolvedChapters = [
  'All chapter copy (chapters 1-6 in lib/chapters.js) is placeholder: Sunny said "some text" without providing it.',
  'Chapters 4-6 (shadow, ribbons, sliver) currently move the prism and show their text; their 2D shadow, band and morph effects are the next phase.',
  'Deferred by Sunny: the red centre line that straightens into a ledge.',
]
