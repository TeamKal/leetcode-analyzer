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
