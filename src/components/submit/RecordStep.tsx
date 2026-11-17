import type { ReactNode } from "react";
import { StepCard } from "@/components/ui/StepCard";

type Props = {
  done: boolean;
  /** The camera recorder. */
  children: ReactNode;
};

/** Step 2: record the explanation live with the camera. There is no file upload. */
export function RecordStep({ done, children }: Props) {
  return (
    <StepCard
      number={2}
      title="Record your explanation"
      description="Explain out loud what the problem asks, how you solve it, and why it works. Record it live with your camera."
      state={done ? "done" : "active"}
    >
      {children}
    </StepCard>
  );
}
