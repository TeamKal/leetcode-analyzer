export const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;

export const SUPPORTED_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;

export type SupportedVideoType = (typeof SUPPORTED_VIDEO_TYPES)[number];

export function normalizeVideoMimeType(
  value: unknown,
): SupportedVideoType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.split(";")[0]?.trim().toLowerCase();
  if (
    typeof normalized !== "string" ||
    !SUPPORTED_VIDEO_TYPES.includes(normalized as SupportedVideoType)
  ) {
    return null;
  }

  return normalized as SupportedVideoType;
}

export function isSupportedVideoType(
  value: unknown,
): value is SupportedVideoType {
  return normalizeVideoMimeType(value) !== null;
}

export function isValidVideoSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_VIDEO_SIZE_BYTES
  );
}
