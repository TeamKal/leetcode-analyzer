"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import {
  AI_TOTAL,
  formatClock,
  MENTOR_GRADE,
  mixLabel,
  RECORDING_SECONDS,
  RUBRIC,
  STAGES,
  stageIndex,
  stageOf,
  type StageId,
} from "./demo/stages";
import { useReducedMotion } from "./useReducedMotion";
import "./ProductDemo.css";

/* Content ---------------------------------------------------------------------
 * The stages follow the real flow: pick a problem, record with the camera, the
 * server transcribes (only the mentor reads the transcript), the AI scores the
 * rubric, then the student sees the AI score and the mentor's final grade.
 */

const URL_TEXT = "https://leetcode.com/problems/two-sum";

const EVAL_STEPS = [
  "Reading the transcript",
  "Checking it against the problem",
  "Scoring against the rubric",
];

/* State ------------------------------------------------------------------- */

type Ui = {
  stage: StageId;
  glitch: boolean;
  labelFrom: string;
  labelTo: string;
  labelP: number;
  // Submission
  url: string;
  urlFocus: boolean;
  identifying: boolean;
  problem: boolean;
  // Recording
  cam: boolean;
  rec: "idle" | "recording" | "stopped";
  sec: number;
  up: "none" | "uploading" | "done";
  pct: number;
  // Transcription
  trPct: number;
  // Analysis
  gauges: number;
  gaugeP: number;
  // Feedback
  score: number;
  status: "awaiting" | "graded";
  selected: number | null;
  // Script-driven interaction states.
  hover: string | null;
  pressed: string | null;
  fade: boolean;
};

const INITIAL: Ui = {
  stage: "submission",
  glitch: false,
  labelFrom: "Submission",
  labelTo: "Submission",
  labelP: 1,
  url: "",
  urlFocus: false,
  identifying: false,
  problem: false,
  cam: false,
  rec: "idle",
  sec: 0,
  up: "none",
  pct: 0,
  trPct: 0,
  gauges: 0,
  gaugeP: 0,
  score: 0,
  status: "awaiting",
  selected: null,
  hover: null,
  pressed: null,
  fade: false,
};

/** What a viewer with reduced motion sees: the finished result. */
const FINAL: Ui = {
  ...INITIAL,
  stage: "feedback",
  labelFrom: "Feedback",
  labelTo: "Feedback",
  url: URL_TEXT,
  problem: true,
  cam: true,
  rec: "stopped",
  sec: RECORDING_SECONDS,
  up: "done",
  pct: 100,
  trPct: 1,
  gauges: RUBRIC.length,
  score: AI_TOTAL,
  status: "graded",
  selected: 1,
};

const flag = (value: boolean) => (value ? "true" : "false");

const BARS = Array.from({ length: 44 }, (_, i) => {
  // A fixed, speech-like silhouette (no randomness, so it never differs per render).
  const v = Math.abs(Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.53 + 1) * 0.4);
  return Math.round(18 + v * 74);
});

/* Small pieces ---------------------------------------------------------------- */

function Check({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`size-3 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

function Lock() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.6" />
      <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" />
    </svg>
  );
}

function Rail({ stage }: { stage: StageId }) {
  const active = stageIndex(stage);
  return (
    <ol className="pd-rail" aria-hidden="true">
      {STAGES.map((s, i) => (
        <li
          key={s.id}
          data-state={i < active ? "done" : i === active ? "active" : "todo"}
          style={{ "--accent": s.accent } as CSSProperties}
        >
          <span className="pd-node">{i < active ? <Check /> : i + 1}</span>
          <span className="pd-node-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

/* Stages ------------------------------------------------------------------------ */

function Submission({ ui }: { ui: Ui }) {
  return (
    <div className="pd-pane">
      <p className="pd-kicker">Step 1 · Pick the problem</p>
      <h3 className="pd-display">Which problem did you solve?</h3>

      <div className="mt-5 flex gap-2">
        <div
          data-demo="url"
          data-focus={flag(ui.urlFocus)}
          className="pd-field pd-ctl flex h-10 min-w-0 flex-1 items-center px-3 font-mono text-[12.5px]"
        >
          <span className="truncate">
            {ui.url || (
              <span className="text-[var(--pd-muted)]">
                https://leetcode.com/problems/…
              </span>
            )}
          </span>
          {ui.urlFocus && <span className="pd-caret" />}
        </div>
        <button
          type="button"
          tabIndex={-1}
          data-demo="identify"
          data-hover={flag(ui.hover === "identify")}
          data-pressed={flag(ui.pressed === "identify")}
          className="pd-btn pd-btn-ghost pd-ctl shrink-0"
        >
          Identify problem
        </button>
      </div>

      <div className="mt-4 min-h-[88px]">
        {ui.identifying && (
          <p className="pd-fade flex items-center gap-2 text-[12.5px] text-[var(--pd-muted)]">
            <Spinner className="size-3" />
            Looking up the problem…
          </p>
        )}
        {ui.problem && (
          <div className="pd-problem pd-in">
            <span className="pd-problem-index">1</span>
            <div className="min-w-0">
              <p className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--pd-ink)]">
                Two Sum
              </p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--pd-muted)]">
                leetcode.com/problems/two-sum
              </p>
            </div>
            <span className="pd-chip pd-chip-good ml-auto">Easy</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Recording({ ui }: { ui: Ui }) {
  const recording = ui.rec === "recording";
  return (
    <div className="pd-pane">
      <p className="pd-kicker">Step 2 · Record your explanation</p>

      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="pd-cam" data-on={flag(ui.cam)} data-rec={flag(recording)}>
          {!ui.cam && (
            <div className="pd-cam-off">
              <p>Turn on your camera and microphone to record your explanation.</p>
              <button
                type="button"
                tabIndex={-1}
                data-demo="enable"
                data-hover={flag(ui.hover === "enable")}
                data-pressed={flag(ui.pressed === "enable")}
                className="pd-btn pd-btn-ghost pd-ctl"
              >
                Enable camera and microphone
              </button>
            </div>
          )}
          {ui.cam && (
            <>
              <svg
                viewBox="0 0 120 80"
                className="pd-cam-figure pd-fade"
                aria-hidden="true"
              >
                <circle cx="60" cy="33" r="13" />
                <path d="M30 80c2-18 14-27 30-27s28 9 30 27Z" />
              </svg>
              <div className="pd-cam-hud pd-fade">
                <span className="pd-rec-dot" data-on={flag(recording)} />
                <span>{recording ? "REC" : ui.rec === "stopped" ? "SAVED" : "LIVE"}</span>
                <span className="pd-timer">{formatClock(ui.sec)}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-3">
          <div className="pd-wave" data-active={flag(recording)} aria-hidden="true">
            {BARS.map((h, i) => (
              <span
                key={i}
                style={
                  {
                    "--h": `${h}%`,
                    animationDelay: `${(i % 11) * -90}ms`,
                  } as CSSProperties
                }
              />
            ))}
          </div>

          <div className="min-h-[88px]">
            {ui.cam && ui.rec === "idle" && (
              <button
                type="button"
                tabIndex={-1}
                data-demo="start"
                data-hover={flag(ui.hover === "start")}
                data-pressed={flag(ui.pressed === "start")}
                className="pd-btn pd-btn-solid pd-ctl w-full"
              >
                Start recording
              </button>
            )}
            {recording && (
              <button
                type="button"
                tabIndex={-1}
                data-demo="stop"
                data-hover={flag(ui.hover === "stop")}
                data-pressed={flag(ui.pressed === "stop")}
                className="pd-btn pd-btn-danger pd-ctl w-full"
              >
                Stop recording
              </button>
            )}
            {ui.rec === "stopped" && (
              <div className="pd-fade space-y-2.5">
                {ui.up === "uploading" ? (
                  <>
                    <p className="text-[12px] text-[var(--pd-muted)]">
                      Saving to private storage…{" "}
                      <span className="tabular-nums text-[var(--pd-ink)]">
                        {ui.pct}%
                      </span>
                    </p>
                    <div className="pd-meter">
                      <span style={{ width: `${ui.pct}%` }} />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="flex items-center gap-1.5 text-[12px] text-[var(--pd-good)]">
                      <Check /> Saved privately
                    </p>
                    <button
                      type="button"
                      tabIndex={-1}
                      data-demo="submit"
                      data-hover={flag(ui.hover === "submit")}
                      data-pressed={flag(ui.pressed === "submit")}
                      className="pd-btn pd-btn-solid pd-ctl w-full"
                    >
                      Submit solution
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Transcription({ ui }: { ui: Ui }) {
  const lit = Math.round(ui.trPct * BARS.length);
  const lines = [92, 78, 96, 64, 84];
  return (
    <div className="pd-pane">
      <p className="pd-kicker">Server · Speech to text</p>
      <h3 className="pd-display">Turning your voice into text</h3>

      <div className="pd-strip mt-5" aria-hidden="true">
        {BARS.map((h, i) => (
          <span
            key={i}
            data-lit={flag(i < lit)}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>

      <div className="mt-4 space-y-2" aria-hidden="true">
        {lines.map((w, i) => (
          <div
            key={i}
            className="pd-mask-line"
            data-shown={flag(ui.trPct > (i + 1) / (lines.length + 1))}
            style={{ width: `${w}%` }}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-[12px] text-[var(--pd-muted)]">
        <span className="flex items-center gap-1.5">
          <Lock /> Only your mentor can read the transcript.
        </span>
        <span className="font-mono tabular-nums text-[var(--pd-ink-2)]">
          {formatClock(ui.trPct * RECORDING_SECONDS)} /{" "}
          {formatClock(RECORDING_SECONDS)}
        </span>
      </div>
    </div>
  );
}

function Analysis({ ui }: { ui: Ui }) {
  const step = ui.gauges < 2 ? 0 : ui.gauges < 4 ? 1 : 2;
  const total = RUBRIC.reduce((sum, row, i) => {
    if (i < ui.gauges) return sum + row.score;
    if (i === ui.gauges) return sum + row.score * ui.gaugeP;
    return sum;
  }, 0);
  return (
    <div className="pd-pane">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="pd-kicker">AI · Rubric</p>
          <h3 className="pd-display">Scoring your explanation</h3>
        </div>
        <p className="pd-total" aria-hidden="true">
          {total.toFixed(1)}
          <small>/10</small>
        </p>
      </div>

      <p className="mt-2 flex items-center gap-2 text-[12px] text-[var(--pd-muted)]">
        <Spinner className="size-3" />
        {EVAL_STEPS[step]}…
      </p>

      <div className="pd-gauges mt-4" aria-hidden="true">
        <span className="pd-sweep" />
        {RUBRIC.map((row, i) => {
          const fill =
            i < ui.gauges ? row.score / row.max : i === ui.gauges ? (row.score / row.max) * ui.gaugeP : 0;
          return (
            <div key={row.key} className="pd-gauge" data-done={flag(i < ui.gauges)}>
              <span className="pd-gauge-label">{row.label}</span>
              <span className="pd-track">
                <span style={{ width: `${fill * 100}%` }} />
              </span>
              <span className="pd-gauge-value">
                {(fill * row.max).toFixed(1)}
                <small>/{row.max}</small>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Feedback({ ui }: { ui: Ui }) {
  const graded = ui.status === "graded";
  return (
    <div className="pd-pane">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className="pd-kicker">AI score</p>
          <p className="pd-big">
            {ui.score.toFixed(1)}
            <small>/10</small>
          </p>
          <span className="pd-chip">Provisional</span>
        </div>

        <div className="pd-verdict min-w-0 flex-1" data-graded={flag(graded)}>
          {!graded ? (
            <p className="flex items-center gap-2 text-[13px] text-[var(--pd-ink-2)]">
              <span className="pd-pulse" /> Waiting for your mentor
            </p>
          ) : (
            <div className="pd-stamp pd-in">
              <span className="pd-kicker">Final grade · Mentor</span>
              <span className="pd-stamp-score">
                {MENTOR_GRADE}
                <small>/10</small>
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        className="pd-rows mt-4"
        data-has-selection={flag(ui.selected !== null)}
      >
        {RUBRIC.map((row, i) => (
          <div
            key={row.key}
            data-demo={`row-${i}`}
            data-hover={flag(ui.hover === `row-${i}`)}
            data-selected={flag(ui.selected === i)}
            className="pd-row pd-ctl"
          >
            <div className="flex items-center gap-3 px-2.5 py-[7px]">
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--pd-ink)]">
                {row.label}
              </span>
              <span className="pd-track pd-track-sm">
                <span style={{ width: `${(row.score / row.max) * 100}%` }} />
              </span>
              <span className="w-[34px] text-right font-mono text-[11.5px] tabular-nums text-[var(--pd-ink-2)]">
                {row.score}
                <span className="text-[var(--pd-muted)]">/{row.max}</span>
              </span>
            </div>
            <div className="pd-row-detail">
              <div>
                <p className="px-2.5 pb-2 text-[12px] leading-5 text-[var(--pd-muted)]">
                  {row.note}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Component --------------------------------------------------------------------- */

export function ProductDemo() {
  const reduced = useReducedMotion();
  const [ui, setUi] = useState<Ui>(INITIAL);
  const view = reduced ? FINAL : ui;

  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
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

  // The recorded script: one continuous run. A stage change is a short glitch
  // transition driven by the same script, so the label and the screen change
  // together and the label can never disagree with what is shown.
  useEffect(() => {
    if (reduced) return;
    const stage = stageRef.current;
    const cursor = cursorRef.current;
    if (!stage || !cursor) return;

    const controller = new AbortController();
    const { signal } = controller;
    const set = (patch: Partial<Ui>) => setUi((u) => ({ ...u, ...patch }));
    // The demo only pauses when nobody can see it (a hidden tab, or scrolled
    // off-screen). Pointing at it does not pause it.
    const isPaused = () => !visibleRef.current || document.hidden;

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
      await sleep(240);
      ripple(stage, pos);
      press(cursor);
      set({ pressed: id });
      await sleep(170);
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

    // A stage change: the label breaks up and resolves into the new word while
    // the screen glitches; the new screen is swapped in at the midpoint.
    const goto = async (next: StageId) => {
      const to = stageOf(next).label;
      setUi((u) => ({
        ...u,
        glitch: true,
        labelFrom: u.labelTo,
        labelTo: to,
        labelP: 0,
        hover: null,
      }));
      let swapped = false;
      await tween(380, (p) => {
        const patch: Partial<Ui> = { labelP: p };
        if (!swapped && p >= 0.5) {
          swapped = true;
          patch.stage = next;
        }
        set(patch);
      });
      set({ glitch: false, labelFrom: to, labelTo: to, labelP: 1 });
    };

    const playOnce = async () => {
      set({ ...INITIAL });
      await sleep(800);

      // 1. Submission: paste the problem link, identify the problem.
      await hoverClick("url", 0.3);
      set({ urlFocus: true });
      await tween(URL_TEXT.length * 28, (p) =>
        set({ url: URL_TEXT.slice(0, Math.round(p * URL_TEXT.length)) }),
      );
      await sleep(220);
      await hoverClick("identify");
      set({ urlFocus: false, identifying: true });
      await sleep(800);
      set({ identifying: false, problem: true });
      await sleep(1100);

      // 2. Recording: camera on, record, stop, save privately, submit.
      await goto("recording");
      await sleep(500);
      await hoverClick("enable");
      set({ cam: true });
      await sleep(800);
      await hoverClick("start");
      set({ rec: "recording", sec: 0 });
      await tween(3400, (p) => set({ sec: p * RECORDING_SECONDS }));
      await hoverClick("stop");
      set({ rec: "stopped", sec: RECORDING_SECONDS, up: "uploading", pct: 0 });
      await tween(1500, (p) => set({ pct: Math.round(p * 100) }));
      set({ up: "done" });
      await sleep(500);
      await hoverClick("submit");
      await park();

      // 3. Transcription: audio becomes text, which only the mentor can read.
      await goto("transcription");
      await tween(3400, (p) => set({ trPct: p }));
      await sleep(700);

      // 4. Analysis: the rubric is scored one category at a time.
      await goto("analysis");
      await sleep(600);
      for (let i = 0; i < RUBRIC.length; i++) {
        set({ gauges: i, gaugeP: 0 });
        await tween(620, (p) => set({ gaugeP: p }));
      }
      set({ gauges: RUBRIC.length, gaugeP: 0 });
      await sleep(900);

      // 5. Feedback: AI score first, then the mentor's final grade.
      await goto("feedback");
      await tween(1100, (p) => set({ score: AI_TOTAL * p }));
      await sleep(600);
      await sleep(1600);
      set({ status: "graded" });
      await sleep(1300);
      await hoverClick("row-1");
      set({ selected: 1 });
      await sleep(2000);
      await hoverClick("row-3");
      set({ selected: 3 });
      await sleep(2000);

      // 6. Rest, then reset for the next loop.
      await park();
      await sleep(2200);
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

  const current = stageOf(view.stage);
  const labelText = mixLabel(view.labelFrom, view.labelTo, view.labelP);

  return (
    <section
      role="img"
      aria-label="Animated demonstration of the workflow: submit a problem link, record your explanation with the camera, the recording is transcribed, the AI scores it against a rubric, and you see the AI score and your mentor's final grade."
      className="pd"
      style={{ "--accent": current.accent } as CSSProperties}
    >
      <div className="pd-label-row" aria-hidden="true">
        <span className="pd-label-dot" />
        <span className="pd-label" data-glitch={flag(view.glitch)}>
          {labelText}
        </span>
        <span className="pd-label-count">
          {stageIndex(view.stage) + 1} / {STAGES.length}
        </span>
      </div>

      <div className="pd-frame">
        <div
          ref={stageRef}
          className="pd-stage overflow-visible rounded-xl border border-[var(--pd-line)] bg-[var(--pd-surface)]"
        >
          <div className="pd-window overflow-hidden rounded-xl" data-fade={flag(view.fade)}>
            <Rail stage={view.stage} />
            <div className="pd-viewport" data-glitch={flag(view.glitch)}>
              <span className="pd-scan" />
              <div className="pd-body">
                {view.stage === "submission" && <Submission ui={view} />}
                {view.stage === "recording" && <Recording ui={view} />}
                {view.stage === "transcription" && <Transcription ui={view} />}
                {view.stage === "analysis" && <Analysis ui={view} />}
                {view.stage === "feedback" && <Feedback ui={view} />}
              </div>
            </div>
          </div>

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
