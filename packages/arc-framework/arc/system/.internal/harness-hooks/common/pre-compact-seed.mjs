import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  readHookInput,
  reapExpiredRecoveryArtifacts,
  writeFallbackPendingMarker,
  writePendingMarker,
} from "./codex-recovery-marker.mjs";

// Read the PreCompact payload's `session_id` (drains stdin in the same call) so the
// marker is scoped to a key the later reader hooks share — see codex-recovery-marker.
const { sessionId } = readHookInput();
const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const arcCommand = process.env.ARC_HOOK_ARC_COMMAND?.trim() || "arc";
const staleBuildCommand = process.env.ARC_HOOK_STALE_BUILD_COMMAND?.trim() || "";
const env = { ...process.env };

try {
  reapExpiredRecoveryArtifacts();
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

  if (isCodexHarness()) {
    writeMarkerFromResult(result);
  }
} catch {
  // PreCompact must never block compaction; recovery will surface seed failures.
}

process.exit(0);

// The pending marker feeds Codex's PostToolUse / UserPromptSubmit recovery
// injection; Claude Code injects via SessionStart(compact) and must not mint
// markers nothing consumes. ARC_HOOK_HARNESS is authoritative when set;
// otherwise CLAUDE_PROJECT_DIR (set by Claude Code for its hooks) is the tell.
function isCodexHarness() {
  const harness = process.env.ARC_HOOK_HARNESS?.trim().toLowerCase();
  if (harness) {
    return harness !== "claude-code";
  }
  return !process.env.CLAUDE_PROJECT_DIR?.trim();
}

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

function writeMarkerFromResult(result) {
  if (result.status !== 0) {
    writeFallbackPendingMarker(seedCommandFailureMessage(result), sessionId);
    return;
  }
  if (typeof result.stdout !== "string") {
    writeFallbackPendingMarker("seed command produced no JSON envelope", sessionId);
    return;
  }

  let envelope;
  try {
    envelope = JSON.parse(result.stdout);
  } catch (err) {
    writeFallbackPendingMarker(`seed command produced malformed JSON: ${errorMessage(err)}`, sessionId);
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
    writePendingMarker(write.path, sessionId);
    return;
  }

  writeFallbackPendingMarker(seedWriteFailureMessage(write, expectedPath), sessionId);
}

function expectedSeedPath(envelope) {
  const identity = typeof envelope?.identity?.identity === "string" ? envelope.identity.identity : "";
  if (!isSafeIdentitySegment(identity)) return null;
  return join(arcRoot(cwd), ".arc", "user", identity, ".internal", "compaction-seed.json");
}

// Resolve the ARC root the way the `arc` CLI's resolveArcRoot does: walk up from
// the hook's base dir to the nearest ancestor containing `.arc/`. The seed is
// written under that root (the emitter resolves it identically), which is not
// necessarily the raw base dir when the hook runs from a subdirectory or a linked
// worktree — so matching this walk-up keeps expectedSeedPath equal to the emitter's
// reported write path. Falls back to the base dir when no `.arc/` is found (the
// seed write would itself fail there, so the check still fails safe).
function arcRoot(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, ".arc"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir);
    dir = parent;
  }
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
