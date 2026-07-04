import {
  buildRecoveryInstructions,
  drainStdin,
  findPendingMarkers,
  markMarkersNotified,
} from "./codex-recovery-marker.mjs";

drainStdin();
const { markers } = findPendingMarkers();
const arcCommand = process.env.ARC_HOOK_ARC_COMMAND?.trim() || "arc";

// Inject once per marker, at the first tool boundary after compaction — the
// mid-turn channel. Already-notified markers stay silent here; the
// UserPromptSubmit backstop re-nags at the next turn boundary until cleared.
const unnotified = markers.filter((marker) => marker.notifiedAt === null);

if (unnotified.length === 0) {
  process.exit(0);
}

const additionalContext = buildRecoveryInstructions({ markers, arcCommand });
markMarkersNotified(unnotified);

// No suppressOutput here: Codex (v0.142.5) rejects it on PostToolUse output
// despite the published schema, failing the hook and dropping the injection.
process.stdout.write(`${JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext,
  },
})}\n`);
