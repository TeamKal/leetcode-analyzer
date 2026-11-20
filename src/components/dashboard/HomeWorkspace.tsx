"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions";
import {
  AuthMascot,
  type MascotHandle,
  type MascotMood,
} from "@/components/login/mascot/AuthMascot";
import { useRecording } from "@/hooks/useRecording";
import { useMascotEntrance } from "@/hooks/useMascotEntrance";
import { useMascotExtras } from "@/hooks/useMascotExtras";
import { useSubmissionTracker } from "@/hooks/useSubmissionTracker";
import type { MascotMode } from "@/lib/flags/flagCheck";
import { clearLegacyWhisperCache } from "@/lib/legacyWhisperCache";
import { checkSubmissionInput } from "@/lib/leetcode";
import { canStart, isBusy } from "@/lib/submit/progress";
import { DashboardBackdrop } from "./DashboardBackdrop";
import { FlowStep, type FlowStepState } from "./FlowStep";
import { PillNav } from "./PillNav";
import { RecordingStep } from "./RecordingStep";
import { SubmissionStep } from "./SubmissionStep";
import { BlastSequence } from "./blast/BlastSequence";
import { FinalMessage } from "./blast/FinalMessage";
import { SubmitStep } from "./SubmitStep";
import { SuccessVideo } from "./SuccessVideo";

/** What the mascot announces when the page opens (shown in a speech bubble). */
const ANNOUNCEMENT = "The website will be blasted soon...";
/** Typed on the plain screen once the destruction has fully finished. */
const FINAL_MESSAGE = "You no longer have to record videos.";
/** How long the announcement and the sly look last. */
const ANNOUNCE_MS = 8000;

/**
 * The student's home: three connected steps. Enter the submission link, record
 * the explanation, submit and follow the real progress. All state lives here and
 * in two hooks (the recorder and the submission tracker).
 */
export function HomeWorkspace({
  extras: extrasMode = "off",
  finale = false,
}: {
  extras?: MascotMode;
  /** Decided on the server: only listed accounts get the finale. */
  finale?: boolean;
}) {
  const [link, setLink] = useState("");
  const mascotRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLElement>(null);
  const mascotControl = useRef<MascotHandle | null>(null);
  const [introMood, setIntroMood] = useState<MascotMood | null>(null);
  // The success clip: played once per successful submission, and while it plays
  // the page behind it is made inert (no clicks, focus or typing).
  const [celebrated, setCelebrated] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [ruined, setRuined] = useState(false);
  const [blastActive, setBlastActive] = useState(false);
  const [blastLocked, setBlastLocked] = useState(false);
  const [speech, setSpeech] = useState<{ text: string; key: number } | null>(null);

  // On load it flies in from outside the window, then greets you.
  useMascotEntrance(mascotRef, setIntroMood, () => {
    // Once it has landed it makes its announcement, with a sly smirk to match.
    mascotControl.current?.wiggle();
    setSpeech({ text: ANNOUNCEMENT, key: 1 });
    mascotControl.current?.express("evil", ANNOUNCE_MS);
  });

  // With reduced motion there is no flight (and no expression): just the words.
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => setSpeech({ text: ANNOUNCEMENT, key: 1 }), 600);
    return () => window.clearTimeout(timer);
  }, []);
  const quietRef = useRef(false);
  const { extras, play } = useMascotExtras(extrasMode, mascotControl, mascotRef, quietRef);
  const recording = useRecording();
  const { tracker, start, reset, canRetry } = useSubmissionTracker();

  // As the previous page did: clear leftover model files from the browser once.
  useEffect(() => {
    void clearLegacyWhisperCache();
  }, []);

  const check = checkSubmissionInput(link);
  const recorded = recording.phase === "recorded" && recording.videoBlob !== null;
  const ready = check.ok && recorded;
  const locked = isBusy(tracker) || tracker.phase === "complete";

  const missing = [
    ...(check.ok ? [] : ["Add your submission link"]),
    ...(recorded ? [] : ["Record your explanation"]),
  ];

  function submit() {
    if (!check.ok || !recording.videoBlob) return;
    if (!canStart(tracker, { hasLink: true, hasRecording: true })) return;
    void start({ href: check.link.href, video: recording.videoBlob });
  }

  function another() {
    reset();
    setCelebrated(false);
    setLink("");
    recording.retake();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const states: FlowStepState[] = [
    check.ok ? "done" : "active",
    recorded ? "done" : check.ok ? "active" : "upcoming",
    tracker.phase === "complete" ? "done" : ready ? "active" : "upcoming",
  ];

  // The mascot reacts to what really happens on the page ---------------------
  const mood: MascotMood =
    tracker.phase === "failed" ? "error" : isBusy(tracker) ? "busy" : "idle";
  useEffect(() => {
    quietRef.current =
      tracker.phase === "failed" ||
      isBusy(tracker) ||
      blastActive ||
      speech !== null;
  }, [tracker, blastActive, speech]);

  // The bubble goes away by itself, and straight away if something real happens.
  useEffect(() => {
    if (!speech) return;
    const timer = window.setTimeout(() => setSpeech(null), ANNOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [speech]);
  useEffect(() => {
    if (speech && (blastActive || isBusy(tracker) || tracker.phase === "failed")) {
      setSpeech(null);
    }
  }, [speech, blastActive, tracker]);
  const statesKey = states.join("|");
  const activeIndex = states.indexOf("active");
  const prevStatesKey = useRef(statesKey);

  // A step was completed: a happy hop.
  useEffect(() => {
    const before = prevStatesKey.current.split("|");
    prevStatesKey.current = statesKey;
    const control = mascotControl.current;
    if (!control) return;
    const finished = statesKey
      .split("|")
      .some((state, index) => state === "done" && before[index] !== "done");
    if (finished) {
      control.express("happy", 1400);
      control.bounce(190);
      control.wiggle();
      window.setTimeout(() => play("heart"), 500);
    }
  }, [statesKey, play]);

  // The submission was accepted: a bigger celebration (the same one a click on it gives).
  useEffect(() => {
    if (tracker.phase !== "complete") return;
    mascotControl.current?.express("happy", 2600);
    mascotRef.current?.click();
  }, [tracker.phase]);

  // It glances at the step that is now waiting for you.
  useEffect(() => {
    if (activeIndex < 0) return;
    const timer = window.setTimeout(() => {
      const heading = document.getElementById(`flow-step-${activeIndex + 1}`);
      if (!heading) return;
      const rect = heading.getBoundingClientRect();
      mascotControl.current?.lookAt(rect.left + 40, rect.top + rect.height / 2, 1800);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [activeIndex]);

  // After the finale: nothing of the page is left, only a plain screen.
  if (ruined) return <FinalMessage text={FINAL_MESSAGE} />;

  return (
    <div className="ds dash relative isolate min-h-screen bg-page font-sans text-ink antialiased">
      <DashboardBackdrop />
      <SuccessVideo
        preload={isBusy(tracker) || tracker.phase === "complete"}
        play={tracker.phase === "complete" && !celebrated}
        onFinish={() => setCelebrated(true)}
        onBlockedChange={setBlocked}
      />
      <div className="contents" inert={blocked || blastLocked}>
      <PillNav active="home" signOutAction={signOut} />

      <main ref={areaRef} className="relative z-[1] mx-auto w-full max-w-[760px] px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
        <h1 className="hd-shine text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">
          Submit your explanation
        </h1>
        <p className="mt-2 max-w-[56ch] text-[15px] leading-7 text-muted">
          Three steps: paste your submission link, record yourself explaining your
          approach, then send it for review.
        </p>

        {/* The mascot lives in the bottom-right corner. Hover or click it; it also
            reacts to your progress. It flies in from outside the window on load. */}
        <div
          ref={mascotRef}
          className="mc-dock fixed bottom-3 right-3 z-30 w-[68px] cursor-pointer sm:bottom-5 sm:right-6 sm:w-[112px]"
        >
          <AuthMascot
            targetRef={mascotRef}
            areaRef={areaRef}
            controlRef={mascotControl}
            mood={introMood ?? mood}
            extras={extras}
            speech={speech}
            className="w-full"
          />
          {finale && (
          <BlastSequence
            targetRef={mascotRef}
            controlRef={mascotControl}
            areaRef={areaRef}
            busy={isBusy(tracker) || tracker.phase === "failed"}
            onActiveChange={setBlastActive}
            onLockChange={setBlastLocked}
            onRuin={() => setRuined(true)}
          />
          )}
        </div>

        <ol className="mt-8 list-none p-0">
          <FlowStep
            number={1}
            title="Submission link"
            description="The LeetCode submission you want reviewed."
            state={states[0]}
          >
            <SubmissionStep
              value={link}
              onChange={setLink}
              check={check}
              disabled={locked}
            />
          </FlowStep>

          <FlowStep
            number={2}
            title="Record your explanation"
            description="Talk through your solution on camera, then check the recording."
            state={states[1]}
          >
            <RecordingStep recording={recording} locked={locked} />
          </FlowStep>

          <FlowStep
            number={3}
            title="Submit and track"
            description="Send it in and see exactly where it is."
            state={states[2]}
            last
          >
            <SubmitStep
              tracker={tracker}
              ready={ready}
              missing={missing}
              canRetry={canRetry}
              onSubmit={submit}
              onAnother={another}
            />
          </FlowStep>
        </ol>
      </main>
      </div>
    </div>
  );
}
