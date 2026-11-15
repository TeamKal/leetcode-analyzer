# Local Audio

A client-side video audio capture and transcription app built with Next.js,
TypeScript, Tailwind CSS, and Transformers.js. Video and audio are processed in
the browser and are never uploaded to a server.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). For uploaded videos, the
browser plays the local file and routes its audio through Web Audio into a
MediaRecorder. Extraction runs at playback speed; a video is not processed
instantly. No API routes or media backend are used.

## Local transcription

After extracting audio, select **Generate Transcript** to run multilingual
Whisper Tiny in a dedicated browser worker. Transformers.js downloads the
required ONNX model files from Hugging Face the first time they are needed.
The files can be large (the exact size depends on the browser's execution
mode); later visits can reuse the browser's model cache. The application does
not send audio to Hugging Face or to a backend.

WebGPU is used when an adapter is available. The worker selects FP16 weights
when the adapter supports `shader-f16`, otherwise it uses the model's FP32
weights. If WebGPU initialization fails or is unavailable, the worker falls
back to the model's quantized ONNX weights on WASM. The selected mode appears
next to the transcript status.

Audio is decoded locally, converted to mono 16 kHz Float32 samples, and
transferred to the worker. Whisper processes recordings in overlapping
30-second chunks with a 5-second stride. Long recordings may take several
minutes and require substantial browser memory; the Tiny model prioritizes
speed and lower resource use over maximum accuracy. The downloaded model
cache can allow later transcription without downloading those model files
again, but the application does not promise that the rest of the site works
offline.

## Camera and microphone recording

Select **Enable camera and microphone** to request both permissions and show a
live camera preview. Start recording to capture the original camera/microphone
stream as a video while a second recorder captures a clone of the microphone
audio track alone. After stopping, preview and download both recordings, then
send the audio-only recording directly to the same local Whisper pipeline.
Use **Retake** to record again or **End camera session** to stop the camera and
microphone; leaving the page also stops all media tracks.

Recording requires browser support for `getUserMedia` and `MediaRecorder` and
typically requires HTTPS (localhost is allowed). Codec availability varies;
the browser's supported WebM/Opus formats are preferred, with its default
MediaRecorder format used when those are unavailable.

For a production build:

```bash
npm run build
npm start
```

## Supported input and output

- MP4, WebM, and MOV inputs (up to 100 MB)
- Extracted audio uses a browser-supported codec and is not guaranteed to be
  MP3. Whisper preparation converts it to mono 16 kHz samples.
- Maximum input size is configurable with `MAX_FILE_SIZE_MB` in
  `src/app/page.tsx`

Video and audio decoding depend on the selected browser's supported codecs.
Extraction uses HTMLMediaElement and Web Audio rather than a demuxing library,
so the video must play successfully and extraction takes approximately as long
as playback. Large videos may use substantial browser memory. Videos without
audible audio and unsupported codecs produce an extraction error.

## Testing transcription

Run `npm run dev`, extract audio from a short video containing clear speech,
and choose **Generate Transcript**. To exercise WASM fallback, use a browser
without WebGPU or disable WebGPU in the browser; the selected mode is shown in
the interface. WebGPU requires a compatible browser/device and may be
unavailable in private browsing or under restrictive graphics policies.

The project has not been validated against five- or ten-minute sample
recordings on every device. Test long recordings on the target hardware and
browser before relying on them; browser memory and WebGPU performance vary.

Camera/microphone permissions, simultaneous recording, playback, and
transcription require an actual browser with camera and microphone hardware
and were not validated by the build checks.
