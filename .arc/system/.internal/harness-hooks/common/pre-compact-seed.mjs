import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { clearSeedHandoff, writeSeedHandoff } from "./codex-recovery-marker.mjs";

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const arcCommand = process.env.ARC_HOOK_ARC_COMMAND?.trim() || "arc";
const staleBuildCommand = process.env.ARC_HOOK_STALE_BUILD_COMMAND?.trim() || "";
const env = { ...process.env };

try {
  clearSeedHandoff();
  let result = runSeedCommand();
  if (shouldRetryAfterBuild(result)) {
    const build = spawnSync(staleBuildCommand, {
      cwd,
      env,
      encoding: "utf8",
      shell: true,
      stdio: "ignore",
      timeout: 20_000,
      killSignal: "SIGKILL",
    });
    if (build.status === 0) {
      result = runSeedCommand();
    }
  }

  writeHandoffFromResult(result);
} catch {
  // PreCompact must never block compaction; recovery will surface seed failures.
}

process.exit(0);

function runSeedCommand() {
  return spawnSync(`${arcCommand} status --session-init --write-compaction-seed --json`, {
    cwd,
    env,
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15_000,
    killSignal: "SIGKILL",
  });
}

function shouldRetryAfterBuild(result) {
  if (staleBuildCommand.length === 0 || result.status === 0) {
    return false;
  }
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  return `${stderr}\n${stdout}`.includes("arc dev build is stale");
}

function writeHandoffFromResult(result) {
  if (result.status === 0 && typeof result.stdout === "string") {
    const envelope = JSON.parse(result.stdout);
    const identity = typeof envelope?.identity?.identity === "string"
      ? envelope.identity.identity.trim()
      : "";
    if (isSafeIdentitySegment(identity)) {
      writeSeedHandoff(join(cwd, ".arc", "user", identity, ".internal", "compaction-seed.json"));
    }
  }
}

function isSafeIdentitySegment(identity) {
  return (
    identity !== ""
    && identity !== "."
    && identity !== ".."
    && !identity.startsWith(".")
    && !identity.includes(":")
    && !/[\\/]/u.test(identity)
  );
}
