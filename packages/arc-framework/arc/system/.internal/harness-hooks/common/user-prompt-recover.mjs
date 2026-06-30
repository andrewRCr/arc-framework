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

const additionalContext = [
  "=== ARC post-compaction recovery (agent instructions) ===",
  "Before project work resumes:",
  "1. Follow .arc/system/workflows/arc/session-lifecycle/session-recover.md.",
  `2. Audit command: ${arcCommand} recover audit --json.`,
  "3. Use recovered ARC context for procedure/state; use the compacted harness summary only for the volatile work locus.",
  `4. If ready after load-set rehydration, clear ${markers.length === 1 ? "the marker" : "the markers"}:`,
  ...clearCommands,
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
