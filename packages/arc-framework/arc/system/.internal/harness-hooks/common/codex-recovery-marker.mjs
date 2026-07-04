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
const recoveryPayloadSchemaVersion = 3;
const sessionlessScopeId = "sessionless";
const recoveryArtifactMaxAgeMs = 7 * 24 * 60 * 60 * 1000;

const posixClearScriptPath = ".arc/system/.internal/harness-hooks/common/clear-codex-recovery-pending.mjs";
const windowsClearScriptPath = ".arc\\system\\.internal\\harness-hooks\\common\\clear-codex-recovery-pending.mjs";

// Symmetric banners bracket the recovery window in the transcript: the injection
// opens it (PENDING, agent instructions follow), the clear command closes it
// (COMPLETE, terminal).
const recoveryPendingBanner = "=== ARC post-compaction recovery: PENDING ===";
export const recoveryCompleteBanner = "=== ARC post-compaction recovery: COMPLETE ===";

// Codex delivers the stable per-session identifier on the hook's stdin JSON
// payload (`session_id`) — NOT as an environment variable. `CODEX_THREAD_ID` is
// scoped to the model's shell-tool sandbox and is absent from hook subprocesses
// (verified on Codex 0.142.5: a PreCompact hook's stdin carries `session_id`, its
// env does not). Every turn-scoped event (PreCompact, PostToolUse,
// UserPromptSubmit) receives the same `session_id`, so the writer and the readers
// key the marker on one identifier all of them can see — the scope then matches
// across separately-spawned hook processes, which a ppid-derived scope never could.
//
// Reading the payload also drains stdin: hook payloads (PostToolUse carries full
// tool output) can exceed the pipe buffer, and exiting without draining breaks the
// harness's write and fails the hook. Every hook entrypoint reads before exiting.
export function readHookInput() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    // A closed or TTY stdin has nothing to read.
  }
  let sessionId = null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.session_id === "string" && parsed.session_id.trim().length > 0) {
      sessionId = parsed.session_id.trim();
    }
  } catch {
    // Empty or non-JSON stdin — degrade to the sessionless scope below.
  }
  return { sessionId, raw };
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

// The marker filename and its recorded scope both derive from the hook's stdin
// `session_id`. A present session id scopes the marker to that Codex session (so a
// sibling session in the same worktree never claims it); an absent one falls back to
// a single stable scope shared by writer and readers alike. The fallback is
// deliberately NOT process/ppid-keyed: each hook runs in its own short-lived shell
// with a distinct parent pid, so a ppid suffix differs between the PreCompact writer
// and the PostToolUse/UserPromptSubmit readers and the marker could never be found.
// The only cost of the stable fallback is that two concurrent session-id-less Codex
// sessions in one worktree+identity would share a marker; `session_id` is
// contractual and present in practice, so this path is defensive.
function resolveScope(sessionId) {
  if (typeof sessionId === "string" && sessionId.trim().length > 0) {
    const id = sessionId.trim();
    return { kind: "session", id, suffix: id };
  }
  return { kind: "sessionless", id: sessionlessScopeId, suffix: sessionlessScopeId };
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

export function writePendingMarker(seedPath, sessionId) {
  const root = resolveRepoRoot();
  const scope = resolveScope(sessionId);
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
    sessionId: scope.kind === "session" ? scope.id : null,
    emittedAt: new Date().toISOString(),
    fallback: false,
    reason: null,
    seedPath: normalizedSeedPath,
  }, null, 2)}\n`);
  // Drop any stale claim so a marker rewritten by a later compaction re-arms.
  rmSync(claimPath(markerPath), { force: true });

  return { root, markerPath };
}

export function writeFallbackPendingMarker(reason = null, sessionId) {
  const root = resolveRepoRoot();
  const scope = resolveScope(sessionId);
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
    sessionId: scope.kind === "session" ? scope.id : null,
    emittedAt: new Date().toISOString(),
    fallback: true,
    reason: typeof reason === "string" && reason.trim().length > 0 ? singleLine(reason) : null,
    seedPath: null,
  }, null, 2)}\n`);
  // Drop any stale claim so a marker rewritten by a later compaction re-arms.
  rmSync(claimPath(markerPath), { force: true });

  return { root, markerPath };
}

export function findPendingMarkers(sessionId) {
  const root = resolveRepoRoot();
  const scope = resolveScope(sessionId);
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
      try {
        const marker = JSON.parse(readFileSync(markerPath, "utf8"));
        emittedAt = typeof marker.emittedAt === "string" ? marker.emittedAt : null;
        seedPath = typeof marker.seedPath === "string" ? marker.seedPath : null;
        fallback = marker.fallback === true;
        reason = typeof marker.reason === "string" ? singleLine(marker.reason) : null;
        scopeMatches = marker.scope === undefined
          || (marker.scope.kind === scope.kind && marker.scope.id === scope.id);
      } catch {
        // Filename-derived scope is enough: malformed scoped markers still block recovery.
      }

      if (!scopeMatches) continue;

      markers.push({ markerPath, emittedAt, seedPath, fallback, reason, claimed: existsSync(claimPath(markerPath)) });
    }
  }

  return { root, markers };
}

// The claim sentinel is the atomic exactly-once gate. `writeFileSync` with the
// `wx` flag (O_CREAT|O_EXCL) can be won by only one process, so concurrent
// PostToolUse fires (parallel tool calls) and a cross-channel PostToolUse +
// UserPromptSubmit pair can never both inject: the first to create the sentinel
// wins; every other reader gets EEXIST and stays silent.
function claimPath(markerPath) {
  return markerPath.replace(/\.json$/, ".claim.json");
}

export function claimMarker(markerPath) {
  try {
    writeFileSync(
      claimPath(markerPath),
      `${JSON.stringify({ claimedAt: new Date().toISOString() })}\n`,
      { flag: "wx" },
    );
    return true;
  } catch {
    // EEXIST — already claimed — or a transient write failure: either way this
    // process stays silent. A transient failure self-heals, since the marker
    // stays unclaimed and the next tool/prompt boundary retries the claim.
    return false;
  }
}

// Find pending markers and atomically claim any not yet claimed. Returns only the
// markers THIS process won — the caller injects those, not the full pending set.
// Two same-scope markers (a global fallback + a scoped marker) can be won by two
// concurrent processes; emitting the full set from each would duplicate, so
// per-won-marker injection keeps every marker's instruction exactly once — no
// duplication across parallel tool calls or the tool/prompt channels, and nothing
// missed. The `marker.claimed` pre-filter is only an optimization; the real gate is
// the atomic `wx` write in claimMarker.
//
// Claim-before-deliver makes injection at-most-once: the sentinel is created here,
// before the caller writes the injection, so if that process dies or its stdout
// write fails afterward the injection is lost and no later boundary retries. The
// safety nets are marker re-arm on the next compaction and the age-based reaper; a
// genuinely missed recovery surfaces to the user, who can run the manual fallback.
export function claimPendingInjection(sessionId) {
  const { root, markers } = findPendingMarkers(sessionId);
  const claimed = [];
  for (const marker of markers) {
    if (marker.claimed) continue;
    if (claimMarker(marker.markerPath)) claimed.push(marker);
  }
  return { root, claimed };
}

export function clearPendingMarkers(options = {}) {
  const root = resolveRepoRoot();
  const markers = options.markerPath === undefined
    ? findPendingMarkers(options.sessionId).markers
    : [{ markerPath: validateMarkerPath(root, options.markerPath) }];
  const removed = [];

  for (const marker of markers) {
    // Only report a marker as removed when it actually existed — an explicit
    // --marker path is passed through unconditionally, so without this guard a
    // re-run of the (idempotent) clear would re-report a removal and re-emit the
    // COMPLETE banner.
    if (!existsSync(marker.markerPath)) continue;
    rmSync(marker.markerPath, { force: true });
    rmSync(claimPath(marker.markerPath), { force: true });
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
    recoveryPendingBanner,
    "Agent instructions — complete before resuming project work.",
    "Recovery is mandatory even if your context feels sufficient: compaction loss is silent, so you cannot tell from inside what was dropped.",
    "1. Follow .arc/system/workflows/arc/session-lifecycle/session-recover.md.",
    auditInstruction,
    "3. Recovered ARC context governs procedure and state; the harness summary covers only the volatile work locus — re-verify any actions taken since compaction against it.",
    `4. When ready after rehydration, clear ${markers.length === 1 ? "the marker" : "the markers"} (or, if recovery stops, leave ${markers.length === 1 ? "it" : "them"} and report the structured stop reasons):`,
    ...clearCommands,
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
