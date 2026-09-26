import PrismStory from '@/components/hero/PrismStory'

/*
 * The prism scroll story: the designed hero, then Sunny's stages — the
 * cross-section sweep, the diagonal cut, the zoom-out, the cast shadow, the
 * bands and the centre sliver (see lib/chapters.js). Still no unrelated site
 * sections: no features, pricing or contact.
 */
export default function Home() {
  return (
    <main className="prism-page">
      <PrismStory />
    </main>
  )
}
