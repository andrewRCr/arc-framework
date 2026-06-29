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
import { join, relative } from "node:path";

const markerFileName = "codex-compaction-recovery-pending.json";
const seedFileName = "compaction-seed.json";

export function resolveRepoRoot() {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status === 0) {
    const stdout = result.stdout.trim();
    if (stdout.length > 0) {
      return stdout;
    }
  }

  return process.cwd();
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

function newestSeedDir(root) {
  const candidates = [];

  for (const dir of internalDirs(root)) {
    const seedPath = join(dir, seedFileName);
    if (!existsSync(seedPath)) {
      continue;
    }
    candidates.push({ dir, seedPath, mtimeMs: statSync(seedPath).mtimeMs });
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0] ?? null;
}

export function writePendingMarker() {
  const root = resolveRepoRoot();
  const seed = newestSeedDir(root);
  const markerDir = seed?.dir ?? join(root, ".arc", "user", ".internal");
  const markerPath = join(markerDir, markerFileName);

  mkdirSync(markerDir, { recursive: true });
  writeFileSync(markerPath, `${JSON.stringify({
    schemaVersion: 1,
    kind: "codex-compaction-recovery-pending",
    emittedAt: new Date().toISOString(),
    seedPath: seed ? relative(root, seed.seedPath) : null,
  }, null, 2)}\n`);

  return { root, markerPath };
}

export function findPendingMarkers() {
  const root = resolveRepoRoot();
  const markers = [];

  for (const dir of internalDirs(root)) {
    const markerPath = join(dir, markerFileName);
    if (!existsSync(markerPath)) {
      continue;
    }

    let emittedAt = null;
    try {
      const marker = JSON.parse(readFileSync(markerPath, "utf8"));
      emittedAt = typeof marker.emittedAt === "string" ? marker.emittedAt : null;
    } catch {
      // Malformed markers still mean recovery is pending; recovery can clear them after success.
    }

    markers.push({ markerPath, emittedAt, mtimeMs: statSync(markerPath).mtimeMs });
  }

  markers.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { root, markers };
}

export function clearPendingMarkers() {
  const { markers } = findPendingMarkers();
  const removed = [];

  for (const marker of markers) {
    rmSync(marker.markerPath, { force: true });
    removed.push(marker.markerPath);
  }

  return removed;
}
