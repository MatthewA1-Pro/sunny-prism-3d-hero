import Scene from "@/components/Scene";

export default function Home() {
  return (
    <div className="scroll-container">
      <Scene />
      {/* Scroll space for animation */}
      <div className="scroll-space" />
    </div>
  );
}
