import { writePendingMarker } from "./codex-recovery-marker.mjs";

writePendingMarker();

const systemMessage = [
  "ARC post-compaction session recovery is required before continuing.",
  "Codex cannot inject recovery context from PostCompact, so ARC has stopped after writing a recovery-pending",
  "marker. Send a short prompt such as \"continue\"; ARC will inject the recovery workflow on that prompt before",
  "project work resumes.",
].join(" ");

process.stdout.write(`${JSON.stringify({
  continue: false,
  stopReason: "ARC recovery required after compaction",
  systemMessage,
})}\n`);
