/**
 * Runs once the sequence's audio has played to its end: asks the server to block
 * this account (identity comes from the session; nothing is sent), then reloads.
 * From then on the server answers every request with the unreachable page.
 */
export async function blockAfterAudio(): Promise<void> {
  try {
    const res = await fetch("/api/blocked", { method: "POST", credentials: "same-origin" });
    if (res.ok) window.location.reload();
  } catch {
    // Offline or failed: stay on the final message.
  }
}
