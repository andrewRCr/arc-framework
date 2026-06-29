import { findPendingMarkers } from "./codex-recovery-marker.mjs";

const { markers } = findPendingMarkers();
const arcCommand = process.env.ARC_HOOK_ARC_COMMAND?.trim() || "arc";

if (markers.length === 0) {
  process.exit(0);
}

const marker = markers[0];
const markerArg = marker === undefined ? "" : ` --marker ${shellQuote(marker.markerPath)}`;

const additionalContext = [
  "=== ARC post-compaction recovery (agent instructions) ===",
  "Before project work resumes:",
  "1. Follow .arc/system/workflows/arc/session-lifecycle/session-recover.md.",
  `2. Audit command: ${arcCommand} recover audit --json.`,
  "3. Use recovered ARC context for procedure/state; use the compacted harness summary only for the volatile work locus.",
  "4. If ready after load-set rehydration, clear the marker:",
  `   node "$(git rev-parse --show-toplevel)/.arc/system/.internal/harness-hooks/common/clear-codex-recovery-pending.mjs"${markerArg}`,
  "5. If stopped, leave the marker and report the structured stop reasons.",
].join("\n");

process.stdout.write(`${JSON.stringify({
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext,
  },
})}\n`);

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
