import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

const markerFileBaseName = "codex-compaction-recovery-pending";
const legacySeedHandoffBaseName = "codex-compaction-recovery-seed";
const seedFileName = "compaction-seed.json";
const recoveryPayloadSchemaVersion = 2;
const recoveryArtifactMaxAgeMs = 7 * 24 * 60 * 60 * 1000;

const posixClearScriptPath = ".arc/system/.internal/harness-hooks/common/clear-codex-recovery-pending.mjs";
const windowsClearScriptPath = ".arc\\system\\.internal\\harness-hooks\\common\\clear-codex-recovery-pending.mjs";

// Hook payloads (PostToolUse carries full tool output) can exceed the pipe
// buffer; exiting without draining stdin breaks the harness's write and the
// hook is reported failed. Every hook entrypoint drains before exiting.
export function drainStdin() {
  try {
    readFileSync(0);
  } catch {
    // A closed or TTY stdin has nothing to drain.
  }
}

export function resolveRepoRoot() {
  const cwd = hookProjectDir();
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status === 0) {
    const stdout = result.stdout.trim();
    if (stdout.length > 0) {
      return stdout;
    }
  }

  return cwd;
}

function hookProjectDir() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR?.trim();
  return projectDir && projectDir.length > 0 ? projectDir : process.cwd();
}

function internalDirs(root) {
  const userDir = join(root, ".arc", "user");
  const dirs = [join(userDir, ".internal")];

  if (!existsSync(userDir)) {
    return dirs;
  }

  for (const entry of readdirSync(userDir, { withFileTypes: true })) {
    if (entry.name === ".internal") {
      continue;
    }
    if (!entry.isDirectory()) {
      continue;
    }
    dirs.push(join(userDir, entry.name, ".internal"));
  }

  return dirs;
}

function globalInternalDir(root) {
  return join(root, ".arc", "user", ".internal");
}

function currentCodexThreadId() {
  const raw = process.env.CODEX_THREAD_ID;
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function currentScope() {
  const codexThreadId = currentCodexThreadId();
  if (codexThreadId !== null) {
    return {
      kind: "thread",
      id: codexThreadId,
      suffix: codexThreadId,
      codexThreadId,
      hookParentPid: process.ppid,
    };
  }

  const parentPid = String(process.ppid);
  return {
    kind: "process",
    id: parentPid,
    suffix: `ppid-${parentPid}`,
    codexThreadId: null,
    hookParentPid: process.ppid,
  };
}

function fileSafeSuffix(value) {
  let suffix = "";
  for (const byte of Buffer.from(value, "utf8")) {
    const char = String.fromCharCode(byte);
    suffix += /^[A-Za-z0-9._-]$/u.test(char)
      ? char
      : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return suffix;
}

function markerFileName(scope) {
  return `${markerFileBaseName}-${fileSafeSuffix(scope.suffix)}.json`;
}

function normalizeSeedPath(root, seedPath) {
  const relativeSeedPath = isAbsolute(seedPath) ? relative(root, seedPath) : seedPath;
  const normalized = relativeSeedPath.replaceAll("\\", "/");
  const seedPathPattern = new RegExp(
    `^\\.arc/user/(?<identity>[^/]+)/\\.internal/${seedFileName.replaceAll(".", "\\.")}$`,
    "u",
  );
  const match = seedPathPattern.exec(normalized);
  const identity = match?.groups?.identity;
  if (
    identity === undefined
    || isReservedIdentitySegment(identity)
    || normalized.startsWith("../")
    || normalized === ".."
    || normalized.includes("/../")
    || normalized.startsWith("/")
  ) {
    throw new Error(`Invalid ARC compaction seed path: ${seedPath}`);
  }
  return normalized;
}

function isReservedIdentitySegment(identity) {
  return identity.startsWith(".") || hasControlCharacter(identity);
}

function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1F || code === 0x7F) return true;
  }
  return false;
}

export function writePendingMarker(seedPath) {
  const root = resolveRepoRoot();
  const scope = currentScope();
  const normalizedSeedPath = normalizeSeedPath(root, seedPath);
  const markerDir = join(root, dirname(normalizedSeedPath));
  const markerPath = join(markerDir, markerFileName(scope));

  mkdirSync(markerDir, { recursive: true });
  writeFileSync(markerPath, `${JSON.stringify({
    schemaVersion: recoveryPayloadSchemaVersion,
    kind: "codex-compaction-recovery-pending",
    scope: {
      kind: scope.kind,
      id: scope.id,
    },
    codexThreadId: scope.codexThreadId,
    hookParentPid: scope.hookParentPid,
    emittedAt: new Date().toISOString(),
    fallback: false,
    reason: null,
    seedPath: normalizedSeedPath,
    notifiedAt: null,
  }, null, 2)}\n`);

  return { root, markerPath };
}

export function writeFallbackPendingMarker(reason = null) {
  const root = resolveRepoRoot();
  const scope = currentScope();
  const markerDir = globalInternalDir(root);
  const markerPath = join(markerDir, markerFileName(scope));

  mkdirSync(markerDir, { recursive: true });
  writeFileSync(markerPath, `${JSON.stringify({
    schemaVersion: recoveryPayloadSchemaVersion,
    kind: "codex-compaction-recovery-pending",
    scope: {
      kind: scope.kind,
      id: scope.id,
    },
    codexThreadId: scope.codexThreadId,
    hookParentPid: scope.hookParentPid,
    emittedAt: new Date().toISOString(),
    fallback: true,
    reason: typeof reason === "string" && reason.trim().length > 0 ? singleLine(reason) : null,
    seedPath: null,
    notifiedAt: null,
  }, null, 2)}\n`);

  return { root, markerPath };
}

export function findPendingMarkers() {
  const root = resolveRepoRoot();
  const scope = currentScope();
  const expectedMarkerName = markerFileName(scope);
  const markers = [];

  for (const dir of internalDirs(root)) {
    if (!existsSync(dir)) {
      continue;
    }

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name !== expectedMarkerName) {
        continue;
      }

      const markerPath = join(dir, entry.name);
      let emittedAt = null;
      let scopeMatches = true;
      let seedPath = null;
      let fallback = false;
      let reason = null;
      let notifiedAt = null;
      try {
        const marker = JSON.parse(readFileSync(markerPath, "utf8"));
        emittedAt = typeof marker.emittedAt === "string" ? marker.emittedAt : null;
        seedPath = typeof marker.seedPath === "string" ? marker.seedPath : null;
        fallback = marker.fallback === true;
        reason = typeof marker.reason === "string" ? singleLine(marker.reason) : null;
        notifiedAt = typeof marker.notifiedAt === "string" ? marker.notifiedAt : null;
        scopeMatches = marker.scope === undefined
          || (marker.scope.kind === scope.kind && marker.scope.id === scope.id);
      } catch {
        // Filename-derived scope is enough: malformed scoped markers still block recovery.
      }

      if (!scopeMatches) continue;

      markers.push({ markerPath, emittedAt, seedPath, fallback, reason, notifiedAt });
    }
  }

  return { root, markers };
}

export function markMarkersNotified(markers) {
  const notifiedAt = new Date().toISOString();
  for (const marker of markers) {
    try {
      const payload = JSON.parse(readFileSync(marker.markerPath, "utf8"));
      payload.notifiedAt = notifiedAt;
      writeFileSync(marker.markerPath, `${JSON.stringify(payload, null, 2)}\n`);
    } catch {
      // Notification bookkeeping is best-effort; an unmarked marker re-notifies, never blocks.
    }
  }
}

export function clearPendingMarkers(options = {}) {
  const root = resolveRepoRoot();
  const markers = options.markerPath === undefined
    ? findPendingMarkers().markers
    : [{ markerPath: validateMarkerPath(root, options.markerPath) }];
  const removed = [];

  for (const marker of markers) {
    rmSync(marker.markerPath, { force: true });
    removed.push(marker.markerPath);
  }

  return removed;
}

export function reapExpiredRecoveryArtifacts(maxAgeMs = recoveryArtifactMaxAgeMs) {
  const root = resolveRepoRoot();
  const now = Date.now();
  const removed = [];

  for (const dir of internalDirs(root)) {
    if (!existsSync(dir)) {
      continue;
    }

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !isRecoveryArtifactFileName(entry.name)) {
        continue;
      }

      const artifactPath = join(dir, entry.name);
      if (now - artifactTimestampMs(artifactPath) <= maxAgeMs) {
        continue;
      }
      try {
        rmSync(artifactPath, { force: true });
        removed.push(artifactPath);
      } catch {
        // Reaping is best-effort hygiene; a survivor is retried at the next sweep.
      }
    }
  }

  return removed;
}

function artifactTimestampMs(artifactPath) {
  try {
    const payload = JSON.parse(readFileSync(artifactPath, "utf8"));
    const emittedAtMs = typeof payload.emittedAt === "string" ? Date.parse(payload.emittedAt) : NaN;
    if (Number.isFinite(emittedAtMs)) {
      return emittedAtMs;
    }
  } catch {
    // Malformed artifacts age by mtime below.
  }
  try {
    return statSync(artifactPath).mtimeMs;
  } catch {
    return Date.now();
  }
}

function isRecoveryArtifactFileName(fileName) {
  if (!fileName.endsWith(".json")) {
    return false;
  }
  return fileName.startsWith(`${markerFileBaseName}-`)
    || fileName.startsWith(`${legacySeedHandoffBaseName}-`);
}

export function buildRecoveryInstructions({ markers, arcCommand }) {
  const clearCommands = markers.map(({ markerPath }) =>
    `   ${markerClearCommand(` --marker ${quoteMarkerPath(markerPath)}`)}`,
  );
  const seedIssueMarkers = markers.filter((marker) => marker.seedPath === null || marker.fallback === true);
  const seedIssueLines = seedIssueMarkers.length === 0
    ? []
    : [
      "Seed issue marker(s):",
      ...seedIssueMarkers.map((marker) => `- ${marker.markerPath}: ${seedIssueReason(marker)}`),
    ];
  const auditInstruction = seedIssueMarkers.length === 0
    ? `2. Audit command: ${arcCommand} recover audit --json.`
    : `2. Seed issue detected: if the current worktree is the intended compacted state, first run ${arcCommand} status --session-init --write-compaction-seed --json, then run ${arcCommand} recover audit --json.`;

  return [
    "=== ARC post-compaction recovery (agent instructions) ===",
    "Before project work resumes:",
    "1. Follow .arc/system/workflows/arc/session-lifecycle/session-recover.md.",
    auditInstruction,
    "3. Use recovered ARC context for procedure/state; use the compacted harness summary only for the volatile work locus.",
    "4. If any actions landed between compaction and this notice, re-verify them against the recovered ARC context before continuing.",
    `5. If ready after load-set rehydration, clear ${markers.length === 1 ? "the marker" : "the markers"}:`,
    ...clearCommands,
    "6. If stopped, leave the marker and report the structured stop reasons.",
    ...seedIssueLines,
  ].join("\n");
}

function seedIssueReason(marker) {
  const reason = typeof marker.reason === "string" ? singleLine(marker.reason) : "";
  return reason.length > 0 ? reason : "compaction seed unavailable";
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function quoteMarkerPath(value) {
  return process.platform === "win32" ? windowsQuote(value) : shellQuote(value);
}

function markerClearCommand(markerArg) {
  if (process.platform === "win32") {
    return [
      `for /f "delims=" %i in ('git rev-parse --show-toplevel') do node "%i\\${windowsClearScriptPath}"`,
      markerArg,
    ].join("");
  }

  return `node "$(git rev-parse --show-toplevel)/${posixClearScriptPath}"${markerArg}`;
}

function windowsQuote(value) {
  return `"${value
    .replaceAll("^", "^^")
    .replaceAll("%", "^%")
    .replaceAll('"', '""')}"`;
}

function validateMarkerPath(root, markerPath) {
  const normalized = isAbsolute(markerPath) ? markerPath : join(root, markerPath);
  const relativeMarkerPath = relative(root, normalized).replaceAll("\\", "/");
  const markerFile = relativeMarkerPath.split("/").pop() ?? "";
  if (
    relativeMarkerPath.startsWith("../")
    || relativeMarkerPath === ".."
    || relativeMarkerPath.includes("/../")
    || !relativeMarkerPath.startsWith(".arc/user/")
    || !relativeMarkerPath.includes("/.internal/")
    || !isMarkerFileName(markerFile)
  ) {
    throw new Error(`Invalid ARC recovery marker path: ${markerPath}`);
  }
  return normalized;
}

function isMarkerFileName(markerFile) {
  const prefix = `${markerFileBaseName}-`;
  if (!markerFile.startsWith(prefix) || !markerFile.endsWith(".json")) {
    return false;
  }

  const suffix = markerFile.slice(prefix.length, -".json".length);
  return suffix.length > 0 && /^(?:[A-Za-z0-9._-]|%[0-9A-F]{2})+$/u.test(suffix);
}

function singleLine(value) {
  return value.replace(/[\x00-\x1F\x7F]+/gu, " ").trim();
}
