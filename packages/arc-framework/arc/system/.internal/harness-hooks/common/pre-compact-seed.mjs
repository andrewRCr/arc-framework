import { spawnSync } from "node:child_process";

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const arcCommand = process.env.ARC_HOOK_ARC_COMMAND?.trim() || "arc";

try {
  spawnSync(`${arcCommand} status --session-init --write-compaction-seed --json`, {
    cwd,
    shell: true,
    stdio: "ignore",
  });
} catch {
  // PreCompact must never block compaction; recovery will surface seed failures.
}

process.exit(0);
