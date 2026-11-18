import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = {
  title: "Privacy policy – Student Tracker",
  description:
    "What Student Tracker collects, why, who can see it, and how long it is kept.",
};

const LAST_UPDATED = "18 November 2026";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2
        id={id}
        className="text-[19px] font-semibold tracking-[-0.02em] text-ink"
      >
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-ink-2">
        {children}
      </div>
    </section>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

export default function PrivacyPage() {
  return (
    <div className="ds min-h-screen bg-page font-sans text-ink antialiased">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[760px] items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            aria-label="Student Tracker home"
            className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            <Logo />
          </Link>
          <Link
            href="/"
            className="rounded-md text-[13px] font-semibold text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Back to the app
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
        <h1 className="text-[30px] font-semibold tracking-[-0.03em] sm:text-[36px]">
          Privacy policy
        </h1>
        <p className="mt-2 text-sm text-muted">Last updated {LAST_UPDATED}</p>
        <p className="mt-6 text-[15px] leading-7 text-ink-2">
          Student Tracker lets students record a spoken explanation of a coding
          problem they solved. An AI gives a first score, and a mentor gives the
          final grade. This page explains what information the service handles,
          why, who can see it, and how long it is kept.
        </p>

        <Section id="collect" title="What we collect">
          <List>
            <li>
              <strong className="font-semibold text-ink">Your account.</strong>{" "}
              When you sign in with Google we receive your name and email
              address. We never see your Google password.
            </li>
            <li>
              <strong className="font-semibold text-ink">Your enrollment.</strong>{" "}
              Your mentor or an administrator adds your name, Google email and
              LeetCode username so you can sign in and be placed in a class.
            </li>
            <li>
              <strong className="font-semibold text-ink">Your submissions.</strong>{" "}
              The LeetCode problem link you enter, the video and audio you
              record with your camera and microphone, a text transcript of what
              you said, the AI&apos;s evaluation, and your mentor&apos;s grade
              and feedback.
            </li>
            <li>
              <strong className="font-semibold text-ink">Sign-in cookies.</strong>{" "}
              See &ldquo;Cookies&rdquo; below.
            </li>
          </List>
          <p>
            We do not use advertising or analytics trackers, and we do not sell
            your information.
          </p>
        </Section>

        <Section id="use" title="How we use it">
          <List>
            <li>To sign you in and make sure only enrolled people get access.</li>
            <li>To store your recording and turn it into a transcript.</li>
            <li>
              To have an AI score your explanation as a first look. The AI
              score is provisional; your mentor&apos;s grade is the final one.
            </li>
            <li>To let your mentor review your work and grade it.</li>
          </List>
        </Section>

        <Section id="camera" title="Camera and microphone">
          <p>
            The app asks your browser for camera and microphone access only when
            you choose to turn them on to record. Recording happens live in the
            app, and you can turn the camera off at any time. You can also take
            back the permission in your browser settings.
          </p>
        </Section>

        <Section id="providers" title="Services that process your information">
          <p>We rely on these providers to run the service:</p>
          <List>
            <li>
              <strong className="font-semibold text-ink">Google</strong> for
              sign-in.
            </li>
            <li>
              <strong className="font-semibold text-ink">Supabase</strong> for
              the database and authentication. It stores accounts, enrollments,
              transcripts, evaluations and grades.
            </li>
            <li>
              <strong className="font-semibold text-ink">Cloudflare R2</strong>{" "}
              for private storage of your recording. Videos are not public and
              are opened only through short-lived private links.
            </li>
            <li>
              <strong className="font-semibold text-ink">Deepgram</strong> for
              speech-to-text. The audio of your recording is sent to it,
              through a short-lived private link, to produce the transcript.
            </li>
            <li>
              <strong className="font-semibold text-ink">Groq</strong> for the
              AI evaluation. It receives the transcript and the text of the
              problem. We do not send your name, email or video to it.
            </li>
            <li>
              <strong className="font-semibold text-ink">Vercel</strong> to host
              the app.
            </li>
          </List>
          <p>
            These providers handle data under their own terms and privacy
            policies. We share information with them only to run the service.
          </p>
        </Section>

        <Section id="access" title="Who can see your information">
          <List>
            <li>
              <strong className="font-semibold text-ink">You</strong> can see
              your own submissions, the AI score and feedback, and your
              mentor&apos;s grade and feedback. You cannot see the transcript,
              which is used only for evaluation and mentor review.
            </li>
            <li>
              <strong className="font-semibold text-ink">Your mentor</strong>{" "}
              can see the submissions, videos, transcripts, AI evaluations and
              grades of the students in their class.
            </li>
            <li>
              <strong className="font-semibold text-ink">Administrators</strong>{" "}
              can see enrollment and submission data in order to run the
              program.
            </li>
          </List>
          <p>
            Other students cannot see your work. Access is enforced by account
            roles and by database access rules, not only by what the pages
            display.
          </p>
        </Section>

        <Section id="retention" title="How long we keep it">
          <List>
            <li>
              <strong className="font-semibold text-ink">Videos</strong> are
              scheduled for deletion 30 days after the AI evaluation finishes.
              A background job then removes the stored file.
            </li>
            <li>
              <strong className="font-semibold text-ink">
                Transcripts, evaluations, grades and submission records
              </strong>{" "}
              are kept as part of your record in the program. They are not
              deleted automatically.
            </li>
            <li>
              Account and enrollment details are kept while you are enrolled.
            </li>
          </List>
        </Section>

        <Section id="cookies" title="Cookies">
          <p>
            We use only the cookies the app needs to work: sign-in session
            cookies that keep you signed in, and a short-lived cookie that
            remembers whether the welcome animation on the sign-in page has
            already played. There are no advertising or analytics cookies.
          </p>
        </Section>

        <Section id="security" title="Security">
          <p>
            Recordings are stored privately, opened only through short-lived
            links, and every request is checked against the signed-in
            person&apos;s role. Keys and secrets stay on the server. No system
            is perfectly secure, so we cannot promise absolute security.
          </p>
        </Section>

        <Section id="choices" title="Your choices">
          <List>
            <li>
              Ask your mentor or administrator what information we hold about
              you, to correct it, or to ask for it to be deleted. Some records
              may need to be kept for grading history.
            </li>
            <li>Sign out at any time from the top of the app.</li>
            <li>
              Remove this app&apos;s access to your Google account in your
              Google account settings.
            </li>
          </List>
        </Section>

        <Section id="changes" title="Changes to this policy">
          <p>
            If we change how your information is handled, we will update this
            page and the date at the top.
          </p>
        </Section>

        <Section id="contact" title="Questions">
          <p>
            Questions about this policy or your information can go to your
            mentor or the program administrator who enrolled you.
          </p>
        </Section>
      </main>
    </div>
  );
}
