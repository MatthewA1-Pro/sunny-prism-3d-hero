import PrismExperience from '@/components/PrismExperience'

export default function Home() {
  return (
    <div className="scroll-container">
      <PrismExperience />
      {/* Scroll distance that the normalized animation progress maps onto. */}
      <div className="scroll-space" />
    </div>
  )
}
