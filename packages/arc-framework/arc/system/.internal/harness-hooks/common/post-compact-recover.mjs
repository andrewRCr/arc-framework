import { writePendingMarker } from "./codex-recovery-marker.mjs";

writePendingMarker();

const systemMessage = [
  "=== ARC compaction recovery ===",
  "ARC paused after compaction, as expected, to restore repo instructions and session context.",
  "Send \"continue\" to the agent; it will reload context before work resumes.",
].join("\n");

process.stdout.write(`${JSON.stringify({
  continue: false,
  stopReason: "ARC recovery required after compaction",
  systemMessage,
})}\n`);
