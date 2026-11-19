import "./extras.css";
import { FaceOverlay, FloatOverlay } from "./Overlay";
import { EXTRA_DURATION, poseFor } from "./poses";
import type { MascotExtrasModule } from "./types";

/** Loaded on demand (dynamic import) and only for accounts the server allows. */
const extras: MascotExtrasModule = {
  durations: EXTRA_DURATION,
  poseFor,
  FaceOverlay,
  FloatOverlay,
};

export default extras;
