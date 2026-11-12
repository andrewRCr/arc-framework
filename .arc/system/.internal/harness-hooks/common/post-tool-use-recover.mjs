import {
  buildRecoveryInstructions,
  claimPendingInjection,
  readHookInput,
} from "./codex-recovery-marker.mjs";

const { sessionId, agentId } = readHookInput();
// A subagent's tool call carries its parent's session_id; claiming here would spend
// the parent's one-shot injection on the subagent.
if (agentId !== null) process.exit(0);
const { root, claimed } = claimPendingInjection(sessionId);
const arcCommand = process.env.ARC_HOOK_ARC_COMMAND?.trim() || "arc";

// Inject once, at the first tool boundary after compaction. The atomic claim in
// claimPendingInjection dedupes across concurrent PostToolUse fires (parallel tool
// calls) and the UserPromptSubmit channel alike; a process that wins no claim —
// every pending marker already claimed, or none pending — stays silent.
if (claimed.length === 0) {
  process.exit(0);
}

const additionalContext = buildRecoveryInstructions({ root, markers: claimed, arcCommand });

// No suppressOutput here: Codex (v0.142.5) rejects it on PostToolUse output
// despite the published schema, failing the hook and dropping the injection.
process.stdout.write(`${JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext,
  },
})}\n`);
