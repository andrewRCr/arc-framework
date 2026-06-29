import { writePendingMarker } from "./codex-recovery-marker.mjs";

writePendingMarker();

const systemMessage = [
  "ARC paused after compaction to restore session base context (AGENTS.md + ARC load set).",
  "Send \"continue\"; ARC will recover automatically before project work resumes.",
].join(" ");

process.stdout.write(`${JSON.stringify({
  continue: false,
  stopReason: "ARC recovery required after compaction",
  systemMessage,
})}\n`);
