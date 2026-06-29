import { spawnSync } from "node:child_process";

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const arcCommand = process.env.ARC_HOOK_ARC_COMMAND?.trim() || "arc";
const explicitHarness = process.env.ARC_HOOK_HARNESS?.trim();
const inferredHarness = explicitHarness || (process.env.CLAUDE_PROJECT_DIR ? "claude-code" : "");
const env = { ...process.env };

if (inferredHarness.length > 0) {
  env.ARC_HOOK_HARNESS = inferredHarness;
}

try {
  spawnSync(`${arcCommand} status --session-init --write-compaction-seed --json`, {
    cwd,
    env,
    shell: true,
    stdio: "ignore",
  });
} catch {
  // PreCompact must never block compaction; recovery will surface seed failures.
}

process.exit(0);
