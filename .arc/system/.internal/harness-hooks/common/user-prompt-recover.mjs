import { findPendingMarkers } from "./codex-recovery-marker.mjs";

const { markers } = findPendingMarkers();
const arcCommand = process.env.ARC_HOOK_ARC_COMMAND?.trim() || "arc";

if (markers.length === 0) {
  process.exit(0);
}

const additionalContext = [
  "ARC Codex post-compaction recovery is pending before continuing.",
  "Recovery workflow: .arc/system/workflows/arc/session-lifecycle/session-recover.md.",
  `Recovery audit command: ${arcCommand} recover audit --json.`,
  "Use recovered ARC context as the procedural floor; use the compacted harness summary only for the volatile",
  "current work locus.",
  "After recovery completes successfully, clear the Codex pending marker with:",
  "node \"$(git rev-parse --show-toplevel)/.arc/system/.internal/harness-hooks/common/clear-codex-recovery-pending.mjs\".",
  "If recovery stops, leave the marker in place and report the structured stop reasons.",
].join(" ");

process.stdout.write(`${JSON.stringify({
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext,
  },
})}\n`);
