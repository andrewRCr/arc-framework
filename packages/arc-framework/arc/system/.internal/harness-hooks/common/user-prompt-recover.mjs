import {
  buildRecoveryInstructions,
  claimPendingInjection,
  drainStdin,
} from "./codex-recovery-marker.mjs";

drainStdin();
const { claimed } = claimPendingInjection();
const arcCommand = process.env.ARC_HOOK_ARC_COMMAND?.trim() || "arc";

// Turn-boundary channel: covers a compaction with no subsequent tool call — the
// first user prompt claims and injects. Shares the atomic claim with PostToolUse,
// so the two channels never double-inject the same marker.
if (claimed.length === 0) {
  process.exit(0);
}

const additionalContext = buildRecoveryInstructions({ markers: claimed, arcCommand });

process.stdout.write(`${JSON.stringify({
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext,
  },
})}\n`);
