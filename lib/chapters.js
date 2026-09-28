/**
 * The scroll story, chapter by chapter.
 *
 * SOURCE: Sunny's walkthrough of shapes.pptx + animation-details.mp4.
 *
 * Implemented against the buyer sequence:
 *   - Hero: closed glass prism with continuous idle spin
 *   - Section (ch1): purple cross-section travels apex→base, green base lit (gif2)
 *   - Cut (ch2): diagonal cut, seams light, pieces open and stay open (gif10)
 *   - Grid (ch3): ground field 10×10 → 50×50 as the view pulls back
 *   - Shadow / ribbons / sliver (ch4–6): cast shadow → labelled bands → centre sliver
 *
 * COPY: chapters 1-6 remain PLACEHOLDER until Sunny provides final text.
 */
export const PLACEHOLDER_COPY = true

export const chapters = [
  {
    id: 'hero',
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

export const bandLabels = ['Apex', 'Second', 'Third', 'Base']

export const unresolvedChapters = [
  'All chapter copy (chapters 1-6 in lib/chapters.js) is placeholder: Sunny said "some text" without providing it.',
  'The four band/ribbon labels (bandLabels in lib/chapters.js) name the geometry as a stand-in; the labels in his reference diagram belong to that diagram, not to this product.',
]
