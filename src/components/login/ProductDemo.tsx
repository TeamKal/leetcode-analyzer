"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Spinner } from "@/components/ui/Spinner";
import {
  commit,
  press,
  pointIn,
  ripple,
  travel,
  travelMs,
  type Point,
} from "./demoCursor";
import "./ProductDemo.css";

/* Content ---------------------------------------------------------------------
 * Labels mirror the real student page (page.tsx, TranscriptionPanel.tsx,
 * LeetCodeProblemInput.tsx). The feedback pane is illustrative: the student
 * result view is not built yet, but the rubric categories and maximums are the
 * real ones used by the evaluator.
 */

const URL_TEXT = "https://leetcode.com/problems/two-sum";
const FILE_NAME = "two-sum-explained.mp4";

const TRANSCRIPT =
  "I put every number in a hash map with its index. For each element I check whether target minus that number is already in the map. If it is, I return both indexs, so the whole thing runs in linear time.";
const WORDS = TRANSCRIPT.split(" ");
const FIX_INDEX = WORDS.findIndex((w) => w.startsWith("indexs"));

const RUBRIC = [
  {
    label: "Problem understanding",
    score: 2,
    max: 2,
    note: "You restated the goal and the input and output clearly.",
  },
  {
    label: "Approach",
    score: 2,
    max: 2,
    note: "Clear hash map approach: store each index, then look up the complement.",
  },
  {
    label: "Reasoning",
    score: 1.5,
    max: 2,
    note: "Good flow. Say why one pass over the array is enough.",
  },
  {
    label: "Edge cases",
    score: 0.5,
    max: 1,
    note: "Mention duplicates, like [3, 3] with target 6, and how they are handled.",
  },
  {
    label: "Complexity",
    score: 1,
    max: 1,
    note: "Linear time is right. Add the extra space the map uses.",
  },
  {
    label: "Communication",
    score: 1.5,
    max: 2,
    note: "Easy to follow, with a steady pace.",
  },
];
const TOTAL = RUBRIC.reduce((sum, r) => sum + r.score, 0);

const EVAL_STEPS = [
  "Reading your transcript",
  "Checking it against the problem",
  "Scoring your explanation",
];

/* State ------------------------------------------------------------------- */

type Ui = {
  url: string;
  urlFocus: boolean;
  identifying: boolean;
  problem: boolean;
  video: "none" | "uploading" | "done";
  pct: number;
  tr: "none" | "working" | "done";
  words: number;
  fixing: boolean;
  fixed: boolean;
  submit: "idle" | "busy" | "done";
  ev: "empty" | "running" | "done";
  evStep: number;
  score: number;
  shown: number;
  selected: number | null;
  tip: boolean;
  hover: string | null;
  pressed: string | null;
  fade: boolean;
};

const INITIAL: Ui = {
  url: "",
  urlFocus: false,
  identifying: false,
  problem: false,
  video: "none",
  pct: 0,
  tr: "none",
  words: 0,
  fixing: false,
  fixed: false,
  submit: "idle",
  ev: "empty",
  evStep: 0,
  score: 0,
  shown: 0,
  selected: null,
  tip: false,
  hover: null,
  pressed: null,
  fade: false,
};

/** What a viewer with reduced motion sees: the finished recording. */
const FINAL: Ui = {
  ...INITIAL,
  url: URL_TEXT,
  problem: true,
  video: "done",
  pct: 100,
  tr: "done",
  words: WORDS.length,
  fixed: true,
  submit: "done",
  ev: "done",
  evStep: EVAL_STEPS.length,
  score: TOTAL,
  shown: RUBRIC.length,
  selected: 1,
};

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

const flag = (value: boolean) => (value ? "true" : "false");

/* Small pieces ---------------------------------------------------------------- */

function Check({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`size-3.5 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

function Label({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--pd-muted)]">
      {children}
    </p>
  );
}

function UploadGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 text-[var(--pd-muted)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V4m0 0-4 4m4-4 4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

/* Component --------------------------------------------------------------------- */

export function ProductDemo() {
  const reduced = usePrefersReducedMotion();
  const [ui, setUi] = useState<Ui>(INITIAL);
  const view = reduced ? FINAL : ui;

  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const visibleRef = useRef(true);

  // Pause while off-screen.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new IntersectionObserver((entries) => {
      visibleRef.current = entries.some((entry) => entry.isIntersecting);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // The recorded script. One continuous run; nothing here switches screens.
  useEffect(() => {
    if (reduced) return;
    const stage = stageRef.current;
    const cursor = cursorRef.current;
    if (!stage || !cursor) return;

    const controller = new AbortController();
    const { signal } = controller;
    const set = (patch: Partial<Ui>) => setUi((u) => ({ ...u, ...patch }));
    const isPaused = () =>
      hoveredRef.current ||
      focusedRef.current ||
      !visibleRef.current ||
      document.hidden;

    // Pause-aware clock: time only advances while the demo is playing.
    let lastFrame = performance.now();
    const frame = () =>
      new Promise<number>((resolve, reject) => {
        requestAnimationFrame((now) => {
          if (signal.aborted) {
            reject(new DOMException("aborted", "AbortError"));
            return;
          }
          const dt = Math.min(250, now - lastFrame);
          lastFrame = now;
          resolve(isPaused() ? 0 : dt);
        });
      });
    const sleep = async (ms: number) => {
      let t = 0;
      while (t < ms) t += await frame();
    };
    const tween = async (ms: number, apply: (progress: number) => void) => {
      let t = 0;
      while (t < ms) {
        t += await frame();
        apply(Math.min(1, t / ms));
      }
      apply(1);
    };

    // Cursor.
    let pos: Point = { x: 0, y: 0 };
    let placed = false;
    let bend: 1 | -1 = 1;

    const travelTo = async (to: Point) => {
      if (!placed) {
        pos = { x: stage.clientWidth + 12, y: stage.clientHeight + 12 };
        cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        placed = true;
      }
      cursor.style.opacity = "1";
      bend = bend === 1 ? -1 : 1;
      const animation = travel(cursor, pos, to, travelMs(pos, to), bend);
      while (animation.playState !== "finished") {
        const paused = isPaused();
        if (paused && animation.playState === "running") animation.pause();
        if (!paused && animation.playState === "paused") animation.play();
        await frame();
      }
      commit(cursor, animation, to);
      pos = to;
    };

    const target = (id: string) =>
      stage.querySelector<HTMLElement>(`[data-demo="${id}"]`);

    const moveTo = async (id: string, anchorX = 0.5, anchorY = 0.5) => {
      const el = target(id);
      if (!el) return;
      set({ hover: null });
      await travelTo(pointIn(stage, el, anchorX, anchorY));
    };

    const click = async (id: string) => {
      set({ hover: id });
      await sleep(260);
      ripple(stage, pos);
      press(cursor);
      set({ pressed: id });
      await sleep(180);
      set({ pressed: null });
    };

    const hoverClick = async (id: string, anchorX = 0.5, anchorY = 0.5) => {
      await moveTo(id, anchorX, anchorY);
      await click(id);
    };

    const park = async () => {
      set({ hover: null });
      await travelTo({
        x: stage.clientWidth - 34,
        y: stage.clientHeight - 28,
      });
    };

    const playOnce = async () => {
      set({ ...INITIAL });
      await sleep(900);

      // 1. Paste the problem link, then identify the problem.
      await hoverClick("url", 0.3);
      set({ urlFocus: true });
      await tween(URL_TEXT.length * 30, (p) =>
        set({ url: URL_TEXT.slice(0, Math.round(p * URL_TEXT.length)) }),
      );
      await sleep(250);
      await hoverClick("identify");
      set({ urlFocus: false, identifying: true });
      await sleep(850);
      set({ identifying: false, problem: true });
      await sleep(500);

      // 2. Drop the explanation video.
      await hoverClick("drop");
      set({ video: "uploading", pct: 0 });
      await tween(2000, (p) => set({ pct: Math.round(p * 100) }));
      set({ video: "done" });
      await sleep(600);

      // 3. Generate the transcript.
      await hoverClick("generate");
      set({ tr: "working" });
      await sleep(1600);
      set({ tr: "done", words: 0 });
      await tween(WORDS.length * 55, (p) =>
        set({ words: Math.round(p * WORDS.length) }),
      );
      await sleep(450);

      // 4. Correct a misheard word (the transcript is editable).
      await moveTo("fixword", 0.5, 0.55);
      set({ hover: "fixword" });
      await sleep(260);
      ripple(stage, pos);
      press(cursor);
      set({ fixing: true });
      await sleep(900);
      set({ fixing: false, fixed: true });
      await sleep(600);

      // 5. Submit.
      await hoverClick("submit");
      set({ submit: "busy", ev: "running", evStep: 0 });
      await sleep(750);
      for (let s = 1; s <= EVAL_STEPS.length; s++) {
        set({ evStep: s });
        await sleep(700);
      }
      set({ submit: "done", ev: "done", score: 0, shown: 0 });
      await tween(1400, (p) => set({ score: TOTAL * p }));
      for (let i = 1; i <= RUBRIC.length; i++) {
        set({ shown: i });
        await sleep(260);
      }
      await sleep(800);

      // 6. Explore the feedback: select categories.
      await hoverClick("row-1");
      set({ selected: 1 });
      await sleep(2100);
      await hoverClick("row-3");
      set({ selected: 3 });
      await sleep(2100);

      // 7. Mentor review note.
      await moveTo("mentor");
      set({ hover: "mentor", tip: true });
      await sleep(1900);
      set({ tip: false });

      // 8. Rest, pause, then reset for the next loop.
      await park();
      await sleep(3000);
      set({ fade: true });
      await sleep(500);
    };

    (async () => {
      try {
        while (!signal.aborted) await playOnce();
      } catch {
        // Aborted on unmount.
      }
    })();

    return () => {
      controller.abort();
      cursor.getAnimations().forEach((a) => a.cancel());
      cursor.style.opacity = "0";
    };
  }, [reduced]);

  const rowsDone = view.ev === "done";

  return (
    <section
      role="img"
      aria-label="Animated demonstration: paste a LeetCode problem, upload your explanation video, review the transcript, submit, and get AI feedback."
      className="pd"
      onPointerMove={() => (hoveredRef.current = true)}
      onPointerLeave={() => (hoveredRef.current = false)}
      onFocus={() => (focusedRef.current = true)}
      onBlur={() => (focusedRef.current = false)}
    >
      <div className="pd-frame">
      <div
        ref={stageRef}
        className="pd-stage overflow-visible rounded-xl border border-[var(--pd-line)] bg-[var(--pd-surface)]"
      >
        <div
          className="pd-window overflow-hidden rounded-xl"
          data-fade={flag(view.fade)}
        >
          <div className="flex items-center justify-between border-b border-[var(--pd-line)] px-5 py-3 text-[12px] text-[var(--pd-muted)]">
            <span>New submission</span>
            <span>Student</span>
          </div>

          <div className="pd-body grid min-h-[480px] gap-px bg-[var(--pd-line)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            {/* Left: the submit form --------------------------------------- */}
            <div className="space-y-4 bg-[var(--pd-surface)] p-4 sm:p-5">
              <div>
                <Label>Problem or submission URL</Label>
                <div className="mt-2 flex gap-2">
                  <div
                    data-demo="url"
                    data-focus={flag(view.urlFocus)}
                    className="pd-field pd-ctl flex h-[34px] min-w-0 flex-1 items-center px-3 font-mono text-[12px] text-[var(--pd-ink)]"
                  >
                    <span className="truncate">
                      {view.url || (
                        <span className="text-[var(--pd-muted)]">
                          https://leetcode.com/problems/…
                        </span>
                      )}
                    </span>
                    {view.urlFocus && <span className="pd-caret" />}
                  </div>
                  <button
                    type="button"
                    tabIndex={-1}
                    data-demo="identify"
                    data-hover={flag(view.hover === "identify")}
                    data-pressed={flag(view.pressed === "identify")}
                    className="pd-btn pd-btn-secondary pd-ctl shrink-0"
                  >
                    Identify problem
                  </button>
                </div>
                <div className="mt-2 min-h-[24px] text-[12px]">
                  {view.identifying && (
                    <p className="pd-fade flex items-center gap-2 text-[var(--pd-muted)]">
                      <Spinner className="size-3" />
                      Looking up problem metadata…
                    </p>
                  )}
                  {view.problem && (
                    <p className="pd-in flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[13px] font-semibold text-[var(--pd-ink)]">
                        1. Two Sum
                      </span>
                      <span className="rounded bg-[var(--pd-success-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--pd-success)]">
                        Easy
                      </span>
                    </p>
                  )}
                </div>
              </div>

              <div
                data-demo="drop"
                data-hover={flag(view.hover === "drop")}
                data-pressed={flag(view.pressed === "drop")}
                className="pd-drop pd-ctl flex min-h-[84px] flex-col items-center justify-center gap-1 px-4 py-3 text-center"
              >
                {view.video === "none" && (
                  <>
                    <UploadGlyph />
                    <p className="text-[13px] font-medium text-[var(--pd-ink)]">
                      Drop your video here
                    </p>
                    <p className="text-[11px] text-[var(--pd-muted)]">
                      MP4, WebM or MOV
                    </p>
                  </>
                )}
                {view.video === "uploading" && (
                  <div className="pd-fade w-full text-left">
                    <p className="truncate text-[13px] font-medium text-[var(--pd-ink)]">
                      {FILE_NAME}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--pd-muted)]">
                      Uploading original video to private storage…{" "}
                      <span className="tabular-nums">{view.pct}%</span>
                    </p>
                    <div className="pd-meter mt-2">
                      <span style={{ width: `${view.pct}%` }} />
                    </div>
                  </div>
                )}
                {view.video === "done" && (
                  <div className="pd-fade w-full text-left">
                    <p className="truncate text-[13px] font-medium text-[var(--pd-ink)]">
                      {FILE_NAME}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--pd-success)]">
                      <Check />
                      Video saved to private storage
                    </p>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Label>Transcript</Label>
                    {view.tr === "working" && (
                      <span className="pd-fade rounded bg-[var(--pd-sunken)] px-1.5 py-0.5 text-[11px] text-[var(--pd-ink-2)]">
                        Transcribing
                      </span>
                    )}
                    {view.tr === "done" && (
                      <span className="pd-fade rounded bg-[var(--pd-success-soft)] px-1.5 py-0.5 text-[11px] text-[var(--pd-success)]">
                        Completed
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    tabIndex={-1}
                    data-demo="generate"
                    data-hover={flag(view.hover === "generate")}
                    data-pressed={flag(view.pressed === "generate")}
                    data-busy={flag(view.video !== "done" || view.tr === "working")}
                    className="pd-btn pd-btn-secondary pd-ctl !h-7 !px-2.5 !text-[12px]"
                  >
                    {view.tr === "done" ? "Generate again" : "Generate Transcript"}
                  </button>
                </div>
                <div className="pd-field mt-2 min-h-[92px] px-3 py-2.5 text-[13px] leading-[1.55] text-[var(--pd-ink)]">
                  {view.tr === "none" && (
                    <p className="text-[var(--pd-muted)]">
                      {view.video === "done"
                        ? "Ready to transcribe."
                        : "Waiting for the video upload to finish…"}
                    </p>
                  )}
                  {view.tr === "working" && (
                    <p className="pd-fade flex items-center gap-2 text-[var(--pd-ink-2)]">
                      <Spinner className="size-3.5" />
                      Transcribing your explanation…
                    </p>
                  )}
                  {view.tr === "done" && (
                    <p>
                      {WORDS.slice(0, view.words).map((word, i) =>
                        i === FIX_INDEX ? (
                          <span key={i}>
                            <span
                              data-demo="fixword"
                              data-hover={flag(view.hover === "fixword")}
                              data-fixing={flag(view.fixing)}
                              data-fixed={flag(view.fixed)}
                              className="pd-word-fix"
                            >
                              {view.fixed ? "indexes" : "indexs"}
                            </span>
                            {word.slice("indexs".length)}{" "}
                          </span>
                        ) : (
                          <span key={i}>{word} </span>
                        ),
                      )}
                    </p>
                  )}
                </div>
                <div className="mt-1.5 min-h-[16px]">
                  {view.tr === "done" && view.words === WORDS.length && (
                    <p className="pd-fade text-[11px] text-[var(--pd-muted)]">
                      Transcript is editable. Review and correct it before
                      final submission.
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                tabIndex={-1}
                data-demo="submit"
                data-hover={flag(view.hover === "submit")}
                data-pressed={flag(view.pressed === "submit")}
                data-busy={flag(view.tr !== "done" || view.submit === "busy")}
                className="pd-btn pd-btn-primary pd-ctl w-full"
              >
                {view.submit === "busy" && <Spinner className="size-3.5" />}
                {view.submit === "busy"
                  ? "Submitting solution…"
                  : view.submit === "done"
                    ? "Solution submitted"
                    : "Submit Solution"}
              </button>
            </div>

            {/* Right: feedback ------------------------------------------------- */}
            <div className="bg-[var(--pd-surface)] p-4 sm:p-5">
              <Label>AI feedback</Label>

              {view.ev === "empty" && (
                <p className="mt-6 text-[13px] leading-6 text-[var(--pd-muted)]">
                  Submit your solution and your feedback will appear here.
                </p>
              )}

              {view.ev === "running" && (
                <div className="pd-fade mt-5 space-y-3">
                  {EVAL_STEPS.map((step, i) => {
                    const done = i < view.evStep;
                    const active = i === view.evStep;
                    return (
                      <p
                        key={step}
                        className={`flex items-center gap-2.5 text-[13px] ${
                          done || active
                            ? "text-[var(--pd-ink)]"
                            : "text-[var(--pd-muted)]"
                        }`}
                      >
                        {done ? (
                          <Check className="text-[var(--pd-success)]" />
                        ) : active ? (
                          <Spinner className="size-3.5" />
                        ) : (
                          <span className="size-1.5 rounded-full bg-[var(--pd-line-strong)]" />
                        )}
                        {step}
                      </p>
                    );
                  })}
                  <div className="pd-meter !mt-5">
                    <span
                      style={{
                        width: `${(view.evStep / EVAL_STEPS.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {rowsDone && (
                <div className="mt-3">
                  <div className="flex items-end justify-between gap-3">
                    <p className="flex items-baseline gap-1.5 tracking-[-0.04em]">
                      <span className="text-[44px] font-semibold leading-none tabular-nums text-[var(--pd-ink)]">
                        {view.score.toFixed(1)}
                      </span>
                      <span className="text-[14px] text-[var(--pd-muted)]">
                        / 10
                      </span>
                    </p>
                    <span className="mb-1 rounded bg-[var(--pd-sunken)] px-1.5 py-0.5 text-[11px] text-[var(--pd-ink-2)]">
                      Provisional
                    </span>
                  </div>

                  <ul
                    className="pd-rows mt-3 space-y-0.5"
                    data-has-selection={flag(view.selected !== null)}
                  >
                    {RUBRIC.map((item, i) => {
                      const shown = i < view.shown;
                      const selected = view.selected === i;
                      return (
                        <li
                          key={item.label}
                          data-demo={`row-${i}`}
                          data-hover={flag(view.hover === `row-${i}`)}
                          data-selected={flag(selected)}
                          className="pd-row pd-ctl px-2.5 py-1.5"
                        >
                          <div className="flex items-center justify-between gap-3 text-[12px]">
                            <span className="truncate text-[var(--pd-ink-2)]">
                              {item.label}
                            </span>
                            <span className="font-mono tabular-nums text-[var(--pd-muted)]">
                              {shown ? `${item.score} / ${item.max}` : "…"}
                            </span>
                          </div>
                          <div
                            className="pd-meter mt-1.5"
                            data-emphasis={flag(selected)}
                          >
                            <span
                              style={{
                                width: shown
                                  ? `${(item.score / item.max) * 100}%`
                                  : "0%",
                              }}
                            />
                          </div>
                          <div className="pd-row-detail">
                            <div>
                              <p className="pt-2 text-[12px] leading-5 text-[var(--pd-ink-2)]">
                                {item.note}
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="relative mt-3">
                    <div
                      data-demo="mentor"
                      data-hover={flag(view.hover === "mentor")}
                      className="pd-chip pd-ctl inline-flex items-center gap-2 rounded-md border border-[var(--pd-line-strong)] px-2.5 py-1 text-[12px] text-[var(--pd-ink-2)]"
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full bg-[var(--pd-warning)]"
                      />
                      Mentor review pending
                    </div>
                    {view.tip && (
                      <div className="pd-fade absolute bottom-full left-0 z-20 mb-2 w-[220px] rounded-lg border border-[var(--pd-line-strong)] bg-[var(--pd-raised)] px-3 py-2 text-[12px] leading-5 text-[var(--pd-ink-2)] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]">
                        Your mentor reviews this and gives the final grade.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cursor (decorative, never receives events) */}
        <div ref={cursorRef} className="pd-cursor" aria-hidden="true">
          <svg viewBox="0 0 12 19" fill="none">
            <path
              d="M0.6 0.9 0.6 15.2 4.3 11.9 6.9 17.9 9.1 16.9 6.5 11.1 11.3 11.1Z"
              fill="#ffffff"
              stroke="#09090b"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      </div>
    </section>
  );
}
