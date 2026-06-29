import { writeFallbackPendingMarker, writePendingMarker } from "./codex-recovery-marker.mjs";

let markerError = null;
let fallbackMarkerSaved = false;
try {
  writePendingMarker();
} catch (error) {
  markerError = error instanceof Error ? error.message : String(error);
  try {
    writeFallbackPendingMarker(markerError);
    fallbackMarkerSaved = true;
  } catch (fallbackError) {
    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    markerError = `${markerError}; fallback marker failed: ${fallbackMessage}`;
  }
}

let recoveryInstruction = "Send \"continue\" to the agent; it will reload context before work resumes.";
if (markerError !== null && fallbackMarkerSaved) {
  recoveryInstruction = "Send \"continue\" to the agent; it will run recovery and report the seed issue.";
} else if (markerError !== null) {
  recoveryInstruction = "ARC could not save its recovery marker; send \"continue\" and ask the agent to run recovery.";
}

const systemMessage = [
  "=== ARC compaction recovery ===",
  "ARC paused after compaction, as expected, to restore ARC session context.",
  recoveryInstruction,
].join("\n");

process.stdout.write(`${JSON.stringify({
  continue: false,
  stopReason: "ARC recovery required after compaction",
  systemMessage,
})}\n`);
