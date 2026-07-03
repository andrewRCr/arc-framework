import { findPendingMarkers } from "./codex-recovery-marker.mjs";

const posixClearScriptPath = ".arc/system/.internal/harness-hooks/common/clear-codex-recovery-pending.mjs";
const windowsClearScriptPath = ".arc\\system\\.internal\\harness-hooks\\common\\clear-codex-recovery-pending.mjs";

const { markers } = findPendingMarkers();
const arcCommand = process.env.ARC_HOOK_ARC_COMMAND?.trim() || "arc";

if (markers.length === 0) {
  process.exit(0);
}

const clearCommands = markers.map(({ markerPath }) =>
  `   ${markerClearCommand(` --marker ${quoteMarkerPath(markerPath)}`)}`,
);
const fallbackMarkers = markers.filter((marker) => marker.seedPath === null || marker.fallback === true);
const seedIssueLines = fallbackMarkers.length === 0
  ? []
  : [
    "Seed issue marker(s):",
    ...fallbackMarkers.map((marker) => `- ${marker.markerPath}: ${seedIssueReason(marker)}`),
  ];
const auditInstruction = fallbackMarkers.length === 0
  ? `2. Audit command: ${arcCommand} recover audit --json.`
  : `2. Seed issue detected: if the current worktree is the intended compacted state, first run ${arcCommand} status --session-init --write-compaction-seed --json, then run ${arcCommand} recover audit --json.`;

const additionalContext = [
  "=== ARC post-compaction recovery (agent instructions) ===",
  "Before project work resumes:",
  "1. Follow .arc/system/workflows/arc/session-lifecycle/session-recover.md.",
  auditInstruction,
  "3. Use recovered ARC context for procedure/state; use the compacted harness summary only for the volatile work locus.",
  `4. If ready after load-set rehydration, clear ${markers.length === 1 ? "the marker" : "the markers"}:`,
  ...clearCommands,
  "5. If stopped, leave the marker and report the structured stop reasons.",
  ...seedIssueLines,
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

function quoteMarkerPath(value) {
  return process.platform === "win32" ? windowsQuote(value) : shellQuote(value);
}

function markerClearCommand(markerArg) {
  if (process.platform === "win32") {
    return [
      `for /f "delims=" %i in ('git rev-parse --show-toplevel') do node "%i\\${windowsClearScriptPath}"`,
      markerArg,
    ].join("");
  }

  return `node "$(git rev-parse --show-toplevel)/${posixClearScriptPath}"${markerArg}`;
}

function windowsQuote(value) {
  return `"${value
    .replaceAll("^", "^^")
    .replaceAll("%", "^%")
    .replaceAll('"', '""')}"`;
}

function singleLine(value) {
  return value.replace(/[\x00-\x1F\x7F]+/gu, " ").trim();
}

function seedIssueReason(marker) {
  const reason = typeof marker.reason === "string" ? singleLine(marker.reason) : "";
  return reason.length > 0 ? reason : "seed handoff unavailable";
}
