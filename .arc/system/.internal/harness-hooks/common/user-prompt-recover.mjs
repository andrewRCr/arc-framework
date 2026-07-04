import {
  buildRecoveryInstructions,
  drainStdin,
  findPendingMarkers,
} from "./codex-recovery-marker.mjs";

drainStdin();
const { markers } = findPendingMarkers();
const arcCommand = process.env.ARC_HOOK_ARC_COMMAND?.trim() || "arc";

// Turn-boundary backstop: re-inject at every user prompt while a marker for
// this scope survives — covers a compaction with no subsequent tool call and
// an ignored mid-turn PostToolUse injection alike.
if (markers.length === 0) {
  process.exit(0);
}

const additionalContext = buildRecoveryInstructions({ markers, arcCommand });

process.stdout.write(`${JSON.stringify({
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext,
  },
})}\n`);
