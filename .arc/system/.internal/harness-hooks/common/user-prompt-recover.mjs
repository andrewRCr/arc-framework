import {
  buildRecoveryInstructions,
  claimPendingInjection,
  readHookInput,
} from "./codex-recovery-marker.mjs";

const { sessionId, agentId } = readHookInput();
// A subagent carries its parent's session_id; it never claims the parent's injection.
if (agentId !== null) process.exit(0);
const { root, claimed } = claimPendingInjection(sessionId);
const arcCommand = process.env.ARC_HOOK_ARC_COMMAND?.trim() || "arc";

// Turn-boundary channel: covers a compaction with no subsequent tool call — the
// first user prompt claims and injects. Shares the atomic claim with PostToolUse,
// so the two channels never double-inject the same marker.
if (claimed.length === 0) {
  process.exit(0);
}

const additionalContext = buildRecoveryInstructions({ root, markers: claimed, arcCommand });

process.stdout.write(`${JSON.stringify({
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext,
  },
})}\n`);
