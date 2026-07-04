const arcCommand = process.env.ARC_HOOK_ARC_COMMAND?.trim() || "arc";

// Single boundary marker (no PENDING/COMPLETE bracket): Claude injects immediately
// at SessionStart(compact) with no pending window and no clear command to close on,
// so a lifecycle bracket could hang open. The banner shares Codex's visual family
// for a common cross-harness recovery boundary.
const additionalContext = [
  "=== ARC post-compaction recovery ===",
  [
    "ARC post-compaction session recovery is required before continuing — mandatory even if your context",
    "feels sufficient, because compaction loss is silent and you cannot tell from inside what was dropped.",
    "Recovery workflow: .arc/system/workflows/arc/session-lifecycle/session-recover.md.",
    `Recovery audit command: ${arcCommand} recover audit --json.`,
    "Use recovered ARC context as the procedural floor; use the compacted harness summary only for the volatile",
    "current work locus.",
  ].join(" "),
].join("\n");

process.stdout.write(`${JSON.stringify({
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext,
  },
})}\n`);
