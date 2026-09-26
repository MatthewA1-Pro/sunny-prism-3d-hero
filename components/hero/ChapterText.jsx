/**
 * One scroll chapter: a full-viewport section holding its text block and the
 * anchor that tells the prism where to sit while that chapter is on screen.
 *
 * The anchor is not an element to measure — it is three CSS custom properties
 * (`--px`, `--py`, `--ph`, all in percent of the stage) read once per resize.
 * Media queries can therefore re-place the prism per breakpoint without any
 * layout reads during scroll.
 */
export default function ChapterText({ chapter, index }) {
  return (
    <section
      className={`chapter chapter-${chapter.id} chapter-${chapter.side ?? 'left'}`}
      data-chapter={index}
      aria-labelledby={`chapter-${chapter.id}-title`}
    >
      <div className="chapter-copy">
        <p className="chapter-eyebrow">{chapter.eyebrow}</p>
        <h2 className="chapter-title" id={`chapter-${chapter.id}-title`}>
          {chapter.title}
        </h2>
        <p className="chapter-body">{chapter.body}</p>
      </div>
    </section>
  )
}
