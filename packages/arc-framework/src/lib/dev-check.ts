/**
 * Dev-mode stale-build check for the self-hosting repo.
 *
 * In this repo, `npx arc` resolves through the workspace symlink to
 * `packages/arc-framework/dist/cli.js`. `dist/` is gitignored, so after a
 * `git pull` or local source edit, `dist/cli.js` can lag behind `src/`.
 * Handoff-critical commands (`arc sync`, `arc user save`, `arc user push`,
 * session-init / session-handoff status probes) cannot afford to run against
 * stale dist — their output drives cross-machine state and a stale build
 * silently produces wrong answers.
 *
 * Staleness is scoped to the bundle's real input graph, read from the esbuild
 * metafile tsup emits: only files that actually feed `dist/cli.js` count.
 * Editing a non-bundled tree — the standalone review-gate scripts, tests —
 * cannot change the artifact, so it no longer forces a rebuild. The scope
 * fails safe: a missing or unusable metafile falls back to a full `src/` walk.
 *
 * Content, not mtime, is authoritative when a build stamp is present: the
 * build writes `dist/dev-build-stamp.json` with a hash of the bundled source
 * inputs, and the check treats matching hashes as fresh even when a tool has
 * bumped mtimes without editing content. When the stamp is missing (legacy
 * dist, or a partial build), the check falls back to the mtime comparison.
 *
 * Adopters never see the check. The dev-mode discriminator is `src/`
 * adjacency from the running `dist/cli.js`: published installs don't carry
 * `src/` (excluded from the package's `files` array), so the helper returns
 * `{ kind: "skip" }` and the CLI proceeds as normal.
 *
 * The pure verdict function takes injected fs primitives so tests can pin
 * each shape without touching the real filesystem. Allowlist branching
 * (handoff-critical fail-fast vs warn-only) lives at the cli.ts preAction
 * boundary.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/** Filename of the content-hash stamp written beside `dist/cli.js` at build time. */
export const DEV_BUILD_STAMP_NAME = "dev-build-stamp.json";

/** Verdict returned by {@link checkDevBuildStaleness}. */
export type DevCheckResult =
  | { kind: "skip" }
  | { kind: "fresh" }
  | {
      kind: "stale";
      /** Seconds since the newest src change. */
      srcAge: number;
      /** Seconds since dist/cli.js was built. `null` when dist is missing. */
      distAge: number | null;
      /** Repo-relative path of the newest src file. */
      newestSrc: string;
    };

/** Injectable dependencies for the dev-check verdict function. */
export interface DevCheckDeps {
  /**
   * Resolve the newest src/**\/*.ts file (mtime + repo-relative path), or
   * `null` when `src/` does not exist (published-install case).
   */
  newestSrc: () => { mtimeMs: number; path: string } | null;
  /**
   * Resolve `dist/cli.js` mtime in ms, or `null` when the file is missing
   * (function-level case; runtime is unreachable since the CLI wouldn't
   * launch without dist/cli.js).
   */
  distMtimeMs: () => number | null;
  /** Current time in ms — injectable for deterministic age calculations. */
  now: () => number;
  /**
   * Content hash of the current bundle inputs, or `null` when not computable.
   * When both this and {@link stampedInputsHash} are non-null, content wins
   * over mtime.
   */
  currentInputsHash?: () => string | null;
  /**
   * Content hash recorded beside dist at the last successful build, or `null`
   * when the stamp is missing/unreadable (legacy dist → mtime fallback).
   */
  stampedInputsHash?: () => string | null;
}

/**
 * Pure verdict function. Returns `skip` for adopters, `stale` when source
 * content (or mtime, when no stamp is available) is ahead of dist or dist is
 * missing, `fresh` otherwise.
 */
export function checkDevBuildStaleness(deps: DevCheckDeps): DevCheckResult {
  const newest = deps.newestSrc();
  if (newest === null) return { kind: "skip" };

  const distMtimeMs = deps.distMtimeMs();
  const now = deps.now();
  const srcAge = Math.max(0, Math.floor((now - newest.mtimeMs) / 1000));

  if (distMtimeMs === null) {
    return { kind: "stale", srcAge, distAge: null, newestSrc: newest.path };
  }

  const distAge = Math.max(0, Math.floor((now - distMtimeMs) / 1000));

  // Content stamp is authoritative when both sides are available: an mtime-only
  // bump (tooling, checkout, multi-subagent reads) must not refuse handoff or
  // warn, while a real content edit (or pull of newer sources) still does.
  const currentHash = deps.currentInputsHash?.() ?? null;
  const stampedHash = deps.stampedInputsHash?.() ?? null;
  if (currentHash !== null && stampedHash !== null) {
    if (currentHash === stampedHash) return { kind: "fresh" };
    return { kind: "stale", srcAge, distAge, newestSrc: newest.path };
  }

  // Legacy / stamp-less fallback: mtime comparison.
  if (newest.mtimeMs > distMtimeMs) {
    return { kind: "stale", srcAge, distAge, newestSrc: newest.path };
  }

  return { kind: "fresh" };
}

/**
 * Build production-mode dependencies for the running `dist/cli.js` location.
 *
 * Resolves the bundle input graph, `dist/cli.js` mtime, and the content-hash
 * stamp. Returns `null` for `newestSrc` when `src/` is absent (the dev-mode
 * discriminator).
 */
export function createDevCheckDeps(cliJsPath: string): DevCheckDeps {
  const distDir = dirname(cliJsPath);
  const pkgDir = dirname(distDir);
  const srcDir = join(pkgDir, "src");

  const resolveInputFiles = (): string[] | null => {
    if (!existsSync(srcDir)) return null;

    // Prefer the bundle's real input graph: editing a non-bundled tree
    // (standalone scripts, tests) cannot change dist/cli.js, so it must not
    // read as stale. Fall back to a full src walk when the metafile is
    // absent or unusable — conservative (a false positive at worst, never a
    // false negative that would let genuinely stale dist through).
    const inputs = readMetafileInputs(distDir, pkgDir);
    if (inputs !== null && inputs.length > 0) return inputs;

    const all: string[] = [];
    walkTsFiles(srcDir, (file) => all.push(file));
    return all.length > 0 ? all : null;
  };

  return {
    newestSrc: () => {
      const files = resolveInputFiles();
      if (files === null) return null;
      return newestFile(files, pkgDir);
    },
    distMtimeMs: () => {
      if (!existsSync(cliJsPath)) return null;
      return statSync(cliJsPath).mtimeMs;
    },
    now: () => Date.now(),
    currentInputsHash: () => {
      const files = resolveInputFiles();
      if (files === null) return null;
      return hashSourceInputs(files, pkgDir);
    },
    stampedInputsHash: () => readDevBuildStamp(distDir),
  };
}

/**
 * Write the content-hash stamp for the just-built bundle. Called from the
 * package's tsup `onSuccess` so every successful build leaves a stamp the
 * runtime check can compare against.
 *
 * @param distDir - Absolute path to the package `dist/` directory
 * @param pkgDir - Absolute path to the package root (tsup cwd)
 * @returns The written hash, or `null` when no src inputs could be resolved
 */
export function writeDevBuildStamp(distDir: string, pkgDir: string): string | null {
  const inputs = readMetafileInputs(distDir, pkgDir);
  const files = inputs ?? (() => {
    const srcDir = join(pkgDir, "src");
    if (!existsSync(srcDir)) return null;
    const all: string[] = [];
    walkTsFiles(srcDir, (file) => all.push(file));
    return all.length > 0 ? all : null;
  })();
  if (files === null) return null;

  const inputsHash = hashSourceInputs(files, pkgDir);
  const stamp = { schemaVersion: 1 as const, inputsHash };
  writeFileSync(join(distDir, DEV_BUILD_STAMP_NAME), `${JSON.stringify(stamp)}\n`, "utf8");
  return inputsHash;
}

/**
 * Stable content hash of first-party source inputs. Paths are hashed as
 * package-relative forward-slash keys so the stamp is cwd-stable.
 *
 * @param files - Absolute paths to source files
 * @param pkgDir - Package root used to relativize paths
 */
export function hashSourceInputs(files: string[], pkgDir: string): string {
  const hash = createHash("sha256");
  const keys = files
    .map((file) => ({ file, key: relative(pkgDir, file).split("\\").join("/") }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  for (const { file, key } of keys) {
    hash.update(key);
    hash.update("\0");
    try {
      hash.update(readFileSync(file));
    } catch {
      hash.update("\0missing\0");
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

/**
 * Newest file (mtime + repo-relative path) among `files`, or `null` when none
 * are stattable. A file that vanished or is unreadable between enumeration and
 * stat is skipped — this guard runs before every handoff-critical command, so
 * it must degrade rather than crash on a transient filesystem gap.
 */
function newestFile(files: string[], pkgDir: string): { mtimeMs: number; path: string } | null {
  let newest: { mtimeMs: number; path: string } | null = null;
  for (const file of files) {
    let mtimeMs: number;
    try {
      mtimeMs = statSync(file).mtimeMs;
    } catch {
      continue;
    }
    if (newest === null || mtimeMs > newest.mtimeMs) {
      newest = { mtimeMs, path: relative(pkgDir, file) };
    }
  }
  return newest;
}

function walkTsFiles(dir: string, visit: (file: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, visit);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      visit(full);
    }
  }
}

/**
 * Select the `src/**\/*.ts` inputs of the bundle from a parsed esbuild
 * metafile, returned as absolute paths under `pkgDir`. Returns `null` when the
 * metafile shape is unusable or lists no src inputs, signalling the caller to
 * fall back to a full src walk. Non-src inputs (node_modules, generated files)
 * are excluded — only first-party sources can make dist stale.
 */
export function selectBundleInputs(metafile: unknown, pkgDir: string): string[] | null {
  if (metafile === null || typeof metafile !== "object" || !("inputs" in metafile)) return null;
  const inputs: unknown = metafile.inputs;
  if (inputs === null || typeof inputs !== "object") return null;

  const paths: string[] = [];
  for (const key of Object.keys(inputs)) {
    // esbuild keys are forward-slash paths relative to the build cwd (the
    // package dir); first-party sources live under `src/`.
    if (key.startsWith("src/") && key.endsWith(".ts")) {
      paths.push(join(pkgDir, key));
    }
  }
  return paths.length > 0 ? paths : null;
}

/**
 * Read the esbuild metafile tsup emits beside the bundle and select its src
 * inputs. Returns `null` on a missing, unreadable, malformed, or input-less
 * metafile (caller falls back to a full src walk).
 */
function readMetafileInputs(distDir: string, pkgDir: string): string[] | null {
  const metafilePath = join(distDir, "metafile-esm.json");
  if (!existsSync(metafilePath)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(metafilePath, "utf8"));
    return selectBundleInputs(raw, pkgDir);
  } catch {
    return null;
  }
}

/**
 * Read the stamped inputs hash from `dist/dev-build-stamp.json`, or `null`
 * when the stamp is missing, unreadable, or malformed.
 */
function readDevBuildStamp(distDir: string): string | null {
  const stampPath = join(distDir, DEV_BUILD_STAMP_NAME);
  if (!existsSync(stampPath)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(stampPath, "utf8"));
    if (raw === null || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    if (record.schemaVersion !== 1 || typeof record.inputsHash !== "string") return null;
    return record.inputsHash.length > 0 ? record.inputsHash : null;
  } catch {
    return null;
  }
}
