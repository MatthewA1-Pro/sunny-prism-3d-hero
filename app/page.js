import PrismHero from '@/components/hero/PrismHero'

/*
 * Scope is the hero only: the page opens on the hero, the prism is its main
 * visual, and nothing follows it (no features, pricing or contact sections).
 */
export default function Home() {
  return (
    <main className="prism-page">
      <PrismHero />
    </main>
  )
}
