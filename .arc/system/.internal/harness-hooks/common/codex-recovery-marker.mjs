import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

const markerFileBaseName = "codex-compaction-recovery-pending";
const seedHandoffFileBaseName = "codex-compaction-recovery-seed";
const seedFileName = "compaction-seed.json";
const recoveryPayloadSchemaVersion = 1;
const seedHandoffMaxAgeMs = 10 * 60 * 1000;

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

function seedHandoffFileName(scope) {
  return `${seedHandoffFileBaseName}-${fileSafeSuffix(scope.suffix)}.json`;
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

function markerDirForSeed(root, seedPath) {
  return join(root, dirname(normalizeSeedPath(root, seedPath)));
}

export function writeSeedHandoff(seedPath) {
  const root = resolveRepoRoot();
  const scope = currentScope();
  const handoffDir = globalInternalDir(root);
  const handoffPath = join(handoffDir, seedHandoffFileName(scope));
  const normalizedSeedPath = normalizeSeedPath(root, seedPath);

  mkdirSync(handoffDir, { recursive: true });
  writeFileSync(handoffPath, `${JSON.stringify({
    schemaVersion: recoveryPayloadSchemaVersion,
    kind: "codex-compaction-recovery-seed",
    scope: {
      kind: scope.kind,
      id: scope.id,
    },
    codexThreadId: scope.codexThreadId,
    hookParentPid: scope.hookParentPid,
    emittedAt: new Date().toISOString(),
    seedPath: normalizedSeedPath,
  }, null, 2)}\n`);

  return { root, handoffPath, seedPath: normalizedSeedPath };
}

export function clearSeedHandoff() {
  const root = resolveRepoRoot();
  const scope = currentScope();
  const handoffPath = join(globalInternalDir(root), seedHandoffFileName(scope));
  rmSync(handoffPath, { force: true });
  return { root, handoffPath };
}

function readSeedHandoff(root, scope) {
  const handoffPath = join(globalInternalDir(root), seedHandoffFileName(scope));
  const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));
  if (
    handoff?.schemaVersion !== recoveryPayloadSchemaVersion
    || handoff?.kind !== "codex-compaction-recovery-seed"
  ) {
    throw new Error(`Invalid ARC recovery seed handoff: ${handoffPath}`);
  }
  if (handoff.scope?.kind !== scope.kind || handoff.scope?.id !== scope.id) {
    throw new Error(`Mismatched ARC recovery seed handoff scope: ${handoffPath}`);
  }
  const emittedAtMs = typeof handoff.emittedAt === "string" ? Date.parse(handoff.emittedAt) : NaN;
  const handoffAgeMs = Date.now() - emittedAtMs;
  if (!Number.isFinite(emittedAtMs) || handoffAgeMs < 0 || handoffAgeMs > seedHandoffMaxAgeMs) {
    throw new Error(`Stale ARC recovery seed handoff: ${handoffPath}`);
  }
  return {
    seedPath: normalizeSeedPath(root, handoff.seedPath),
    handoffPath,
  };
}

export function writePendingMarker() {
  const root = resolveRepoRoot();
  const scope = currentScope();
  const seed = readSeedHandoff(root, scope);
  const markerDir = markerDirForSeed(root, seed.seedPath);
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
    seedPath: seed.seedPath,
    seedHandoffPath: relative(root, seed.handoffPath),
  }, null, 2)}\n`);
  try {
    rmSync(seed.handoffPath, { force: true });
  } catch {
    // Marker creation succeeded; stale handoff cleanup is best-effort.
  }

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
    reason: typeof reason === "string" && reason.trim().length > 0 ? reason : null,
    seedPath: null,
    seedHandoffPath: null,
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
      try {
        const marker = JSON.parse(readFileSync(markerPath, "utf8"));
        emittedAt = typeof marker.emittedAt === "string" ? marker.emittedAt : null;
        seedPath = typeof marker.seedPath === "string" ? marker.seedPath : null;
        scopeMatches = marker.scope === undefined
          || (marker.scope.kind === scope.kind && marker.scope.id === scope.id);
      } catch {
        // Filename-derived scope is enough: malformed scoped markers still block recovery.
      }

      if (!scopeMatches) continue;

      markers.push({ markerPath, emittedAt, seedPath });
    }
  }

  return { root, markers };
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
