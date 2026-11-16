# VideoMind (LeetCode Analyzer)

Students submit a LeetCode URL and an explanation video. The video is stored in
private Cloudflare R2 storage and transcribed on the server by Deepgram. The
student edits the transcript, an AI scores it on a rubric (provisional), and the
mentor gives the final grade. Built with Next.js, TypeScript, Supabase, R2,
Groq and Deepgram.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to
`.env.local` and fill in the values. Never commit `.env.local`.

## Transcription

After a video is uploaded and verified in private storage, **Generate
Transcript** calls `POST /api/transcription` with the video's object key only.
The server:

1. takes the student from the session (never from the request);
2. checks the key is inside that student's R2 prefix and the object exists;
3. reserves a slot against a per-student daily limit
   (`reserve_transcription_slot`, see `supabase/sql/transcription_usage.sql`);
4. creates a short-lived presigned read link and has Deepgram (Nova-3,
   English, model-training opt-out, LeetCode keyterms) fetch and transcribe it.

`DEEPGRAM_API_KEY` is server-only. If transcription fails the student sees a
generic message and can retry; there is no in-browser fallback.

## Evaluation (rubric v2)

`/api/cron/evaluation` (Supabase Cron, every minute) claims one job and grades
the transcript with Groq. Each grading call is grounded in:

- **The real problem**: statement, topics and hints fetched once from
  LeetCode's public GraphQL endpoint and stored in `problems.description`
  (paid-only problems have no public statement and are flagged).
- **A reference card**: a cached per-problem answer key (optimal approach,
  expected complexity, edge cases, common mistakes) generated once with
  `GROQ_REFERENCE_MODEL` (default `openai/gpt-oss-120b`) in
  `problem_reference_cards`, so every student is judged against the same key.

The model must quote verbatim transcript evidence for every category score; the
backend drops quotes it cannot find in the transcript, computes the overall
score itself, and records `review_flags` (wrong problem, prompt injection,
too-short transcript, missing statement, ...) for the mentor. Temperature is 0
with a fixed seed. Run `supabase/sql/evaluation_v2.sql` before deploying.

Groq's free tier limits `openai/gpt-oss-20b` to about 8,000 tokens per minute;
one v2 evaluation uses roughly 4,000, so keep the Cron at one job per minute.

## Camera and microphone recording

Students can record in the browser (`getUserMedia` and `MediaRecorder`, HTTPS or
localhost required). The recorded video is uploaded to private storage after
the take ends and is transcribed from there. Uploaded files can be MP4 or WebM
up to 100 MB.

## Cleanup

Videos are deleted from R2 30 days after a successful evaluation by
`/api/cron/video-cleanup` (see `supabase/sql/`).

## Tests

```bash
npm run test:evaluation
npm run test:cleanup
npm run test:deepgram
```

For a production build: `npm run build && npm start`.
