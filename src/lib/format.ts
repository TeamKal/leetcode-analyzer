/** Small, pure formatting helpers for the submit page. */

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return null;

  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}
