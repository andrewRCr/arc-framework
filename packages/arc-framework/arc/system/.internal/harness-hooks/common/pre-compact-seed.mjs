import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

import { clearSeedHandoff, writeSeedHandoff, writeSeedHandoffFailure } from "./codex-recovery-marker.mjs";

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
  if (result.status !== 0) {
    writeSeedHandoffFailure(seedCommandFailureMessage(result));
    return;
  }
  if (typeof result.stdout !== "string") {
    writeSeedHandoffFailure("seed command produced no JSON envelope");
    return;
  }

  let envelope;
  try {
    envelope = JSON.parse(result.stdout);
  } catch (err) {
    writeSeedHandoffFailure(`seed command produced malformed JSON: ${errorMessage(err)}`);
    return;
  }

  const write = envelope?.compactionSeedWrite;
  const expectedPath = expectedSeedPath(envelope);
  if (
    write?.status === "written"
    && typeof write.path === "string"
    && expectedPath !== null
    && samePath(write.path, expectedPath)
  ) {
    writeSeedHandoff(write.path);
    return;
  }

  writeSeedHandoffFailure(seedWriteFailureMessage(write, expectedPath));
}

function expectedSeedPath(envelope) {
  const identity = typeof envelope?.identity?.identity === "string" ? envelope.identity.identity : "";
  if (!isSafeIdentitySegment(identity)) return null;
  return join(cwd, ".arc", "user", identity, ".internal", "compaction-seed.json");
}

function samePath(actual, expected) {
  return resolve(cwd, actual) === resolve(cwd, expected);
}

function isSafeIdentitySegment(identity) {
  return (
    identity !== ""
    && identity !== "."
    && identity !== ".."
    && !identity.startsWith(".")
    && !hasControlCharacter(identity)
    && !/[<>:"/\\|?*]/u.test(identity)
    && !/[. ]$/u.test(identity)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(identity)
  );
}

function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1F || code === 0x7F) return true;
  }
  return false;
}

function seedCommandFailureMessage(result) {
  const status = result.status === null ? "unknown" : String(result.status);
  const signal = typeof result.signal === "string" ? ` signal ${result.signal}` : "";
  const error = result.error instanceof Error ? result.error.message : null;
  const stderr = firstNonEmptyLine(result.stderr);
  const stdout = firstNonEmptyLine(result.stdout);
  const detail = stderr ?? stdout ?? error;
  return `seed command exited ${status}${signal}${detail ? `: ${detail}` : ""}`;
}

function seedWriteFailureMessage(write, expectedPath) {
  if (write?.status === "written") {
    if (expectedPath === null) return "seed command reported a written seed for an unsafe identity";
    return "seed command reported an unexpected seed path";
  }
  if (typeof write?.status === "string") {
    const reason = typeof write.reason === "string" ? ` (${write.reason})` : "";
    const message = typeof write.message === "string" ? `: ${write.message}` : "";
    return `seed write ${write.status}${reason}${message}`;
  }
  return "seed command did not report compactionSeedWrite";
}

function firstNonEmptyLine(value) {
  if (typeof value !== "string") return null;
  for (const line of value.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
