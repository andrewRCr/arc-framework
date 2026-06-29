const additionalContext = [
  "ARC post-compaction session recovery is required before continuing.",
  "Recovery workflow: .arc/system/workflows/arc/session-lifecycle/session-recover.md.",
  "Recovery audit command: arc recover audit --json.",
  "Use recovered ARC context as the procedural floor; use the compacted harness summary only for the volatile",
  "current work locus.",
].join(" ");

process.stdout.write(`${JSON.stringify({
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext,
  },
})}\n`);
