/**
 * Scroll affordance from the deployed revision. Its opacity is driven by the
 * scroll listener in PrismHero; the pulse is CSS and stops for reduced motion.
 */
export default function ScrollHint({ ref }) {
  return (
    <div className="scroll-hint" ref={ref} aria-hidden="true">
      <span>scroll</span>
      <div className="scroll-hint-arrow" />
    </div>
  )
}
