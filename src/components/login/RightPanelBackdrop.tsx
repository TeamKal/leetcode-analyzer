"use client";

import { CornerWave } from "@/components/login/CornerWave";
import GradientWaves from "@/components/login/GradientWaves";
import "./backdrop.css";

/**
 * Atmosphere for the sign-in panel: Gradient Waves (React Bits), pale red and
 * lilac, hanging from the top edge and melting into the white below. It is
 * decorative only: behind the content, ignores the pointer, never affects
 * layout. It is clipped by its own wrapper (not by the panel), so the mascot
 * can still fly out of the panel during its exploration flights.
 */
function Waves({ className }: { className: string }) {
  return (
    <div className={`absolute inset-x-0 ${className}`}>
      <GradientWaves
        lightMode
        horizonColor="#f7b4b0"
        waveColor="#cfc5fa"
        crestColor="#ffffff"
        backgroundColor="transparent"
        speed={0.22}
        amplitude={1.8}
        waveScale={0.55}
        swell={28}
        turbulence={14}
        tilt={62}
        height={5}
        fogDepth={42}
        relief={1.1}
        sheen={0}
        brightness={1.7}
        opacity={1}
        grain={0.08}
        quality="low"
        intro={false}
        mouseInteraction={false}
        swellOnClick={false}
        dpr={1.5}
      />
    </div>
  );
}

export function RightPanelBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* The waves hang from the top edge and melt into the white below. */}
      <Waves className="pb-waves-top top-0 h-[40%]" />
      {/* A soft lavender wave settles into the bottom-right corner. */}
      <CornerWave />
    </div>
  );
}
