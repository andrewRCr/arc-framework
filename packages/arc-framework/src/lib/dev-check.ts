/**
 * Dev-mode stale-build check for the self-hosting repo.
 *
 * In this repo, `npx arc` resolves through the workspace symlink to
 * `packages/arc-framework/dist/cli.js`. `dist/` is gitignored, so after a
 * `git pull` or local source edit, `dist/cli.js` can lag behind `src/`.
 * No command can afford to run against stale dist: a stale build silently
 * produces wrong answers, and the ones that drive cross-machine state write
 * those answers down.
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
 * Neither adopters nor a run from source ever see the check. Two conditions
 * gate it: the running entry is the built bundle (a `.js` file inside a
 * `dist/` directory), and `src/` sits beside that directory. Published
 * installs fail the second — they don't carry `src/`, which the package's
 * `files` array excludes — and a source entry fails the first. Either way the
 * helper returns `{ kind: "skip" }` and the CLI proceeds as normal.
 *
 * The pure verdict and post-command refresh functions take injected
 * boundaries so tests can pin each shape without touching the real
 * filesystem. Refusal, the single compaction-seed exception, and refresh
 * eligibility live at the cli.ts action-hook boundary.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

/** Filename of the content-hash stamp written beside `dist/cli.js` at build time. */
export const DEV_BUILD_STAMP_NAME = "dev-build-stamp.json";

/**
 * Whether the running entry is the built bundle rather than TypeScript source.
 *
 * The verdict compares `src/` against a `dist/` output, which means nothing
 * when the entry is the source itself — there the check reads `src/` as its own
 * output directory, finds no stamp, and falls back to comparing source mtimes
 * against the entry point, a verdict that is stale by construction. Keyed on
 * the extension and the parent directory name rather than the filename, which
 * the build config owns.
 *
 * @param entryPath - Absolute path of the running CLI entry
 * @returns `true` when the entry is a `.js` file directly inside a `dist/` directory
 */
export function isBuiltBundleEntry(entryPath: string): boolean {
  return entryPath.endsWith(".js") && basename(dirname(entryPath)) === "dist";
}

/** Verdict returned by {@link checkDevBuildStaleness}. */
export type DevCheckResult =
  | { kind: "skip" }
  | { kind: "fresh" }
  | {
      kind: "stale";
      /** Evidence that established staleness. */
      basis: "content-hash" | "missing-dist" | "mtime";
      /** Seconds since the newest src change. */
      srcAge: number;
      /** Seconds since dist/cli.js was built. `null` when dist is missing. */
      distAge: number | null;
      /** Repo-relative path of the newest src file. */
      newestSrc: string;
    };

/** Exact developer command that regenerates the self-hosting runtime bundle. */
export const DEV_BUILD_REFRESH_COMMAND = "npm run build:fast";

/** Internal build-time override used to direct a fast build into a staging directory. */
export const DEV_BUILD_OUTPUT_DIRECTORY_ENV = "ARC_DEV_BUILD_OUT_DIR";

/** Command families whose successful action may change the running development bundle's inputs. */
export const DEV_BUILD_REFRESH_COMMAND_PATHS = Object.freeze([
  "base merge",
  "delivery review-fix continue",
  "errand close",
  "errand open",
]);

const devBuildRefreshCommandPathSet: ReadonlySet<string> = new Set(DEV_BUILD_REFRESH_COMMAND_PATHS);

/**
 * Report whether one Commander action path can self-mutate bundled source.
 *
 * @param commandPath - Commander path, with or without the root `arc` name
 * @returns True only for a supported head-moving action
 */
export function isDevBuildRefreshCommandPath(commandPath: string): boolean {
  const normalized = commandPath.startsWith("arc ") ? commandPath.slice("arc ".length) : commandPath;
  return devBuildRefreshCommandPathSet.has(normalized);
}

/** Injectable freshness and build boundaries for the post-command refresh. */
export interface DevBuildRefreshDeps {
  /** Read freshness before and after any required rebuild. */
  check: () => DevCheckResult;
  /** Regenerate the developer bundle without re-entering the ARC CLI. */
  rebuild: () => Promise<
    { kind: "completed" }
    | { kind: "failed"; message: string }
  >;
}

/** Outcome of handing the next self-hosting command a fresh runtime bundle. */
export type DevBuildRefreshResult =
  | { kind: "not-required" }
  | { kind: "refreshed" }
  | { kind: "failed"; command: typeof DEV_BUILD_REFRESH_COMMAND; message: string };

/** Injectable dependencies for the dev-check verdict function. */
export interface DevCheckDeps {
  /**
   * Resolve the newest src/**\/*.ts file (mtime + repo-relative path), or
   * `null` when either half of the dev-mode discriminator fails: the running
   * entry is not the built bundle (source-run case), or `src/` does not exist
   * (published-install case).
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
    return { kind: "stale", basis: "missing-dist", srcAge, distAge: null, newestSrc: newest.path };
  }

  const distAge = Math.max(0, Math.floor((now - distMtimeMs) / 1000));

  // Content stamp is authoritative when both sides are available: an mtime-only
  // bump (tooling, checkout, multi-subagent reads) must not refuse handoff or
  // warn, while a real content edit (or pull of newer sources) still does.
  const currentHash = deps.currentInputsHash?.() ?? null;
  const stampedHash = deps.stampedInputsHash?.() ?? null;
  if (currentHash !== null && stampedHash !== null) {
    if (currentHash === stampedHash) return { kind: "fresh" };
    return { kind: "stale", basis: "content-hash", srcAge, distAge, newestSrc: newest.path };
  }

  // Legacy / stamp-less fallback: mtime comparison.
  if (newest.mtimeMs > distMtimeMs) {
    return { kind: "stale", basis: "mtime", srcAge, distAge, newestSrc: newest.path };
  }

  return { kind: "fresh" };
}

/**
 * Refresh a bundle that became stale while the current command was running.
 *
 * The second check is the handoff proof: a successful build process alone does
 * not establish that the next command will consume current source.
 *
 * @param deps - Freshness reader and runtime-only rebuild boundary
 * @returns Whether no work was needed, freshness was restored, or manual retry is required
 */
export async function refreshStaleDevBuild(
  deps: DevBuildRefreshDeps,
): Promise<DevBuildRefreshResult> {
  const before = deps.check();
  if (before.kind !== "stale") return { kind: "not-required" };

  const rebuilt = await deps.rebuild();
  if (rebuilt.kind === "failed") {
    return { kind: "failed", command: DEV_BUILD_REFRESH_COMMAND, message: rebuilt.message };
  }

  return deps.check().kind === "fresh"
    ? { kind: "refreshed" }
    : {
        kind: "failed",
        command: DEV_BUILD_REFRESH_COMMAND,
        message: "the rebuilt bundle is still stale",
      };
}

/**
 * Bind post-command refresh to the running CLI bundle and its repository root.
 * Published installs remain inert because their staleness check returns `skip`.
 *
 * @param cliJsPath - Absolute path of the running CLI entry point
 * @returns The post-command freshness handoff result
 */
export async function refreshDevBuildAfterAction(
  cliJsPath: string,
): Promise<DevBuildRefreshResult> {
  const check = (): DevCheckResult => checkDevBuildStaleness(createDevCheckDeps(cliJsPath));
  const packageRoot = dirname(dirname(cliJsPath));
  const repositoryRoot = resolve(packageRoot, "..", "..");
  return refreshStaleDevBuild({
    check,
    rebuild: () => runFastDevBuild(repositoryRoot, dirname(cliJsPath)),
  });
}

async function runFastDevBuild(cwd: string, distDir: string): Promise<
  { kind: "completed" }
  | { kind: "failed"; message: string }
> {
  const packageRoot = dirname(distDir);
  let stagingDir: string;
  try {
    stagingDir = await mkdtemp(join(packageRoot, ".arc-dev-build-"));
  } catch (error) {
    return {
      kind: "failed",
      message: `could not prepare a staged development build: ${errorMessage(error)}`,
    };
  }

  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  const build = await new Promise<{ kind: "completed" } | { kind: "failed"; message: string }>((settle) => {
    const child = execFile(executable, ["run", "build:fast"], {
      cwd,
      env: { ...process.env, [DEV_BUILD_OUTPUT_DIRECTORY_ENV]: stagingDir },
    }, (error) => {
      settle(error === null
        ? { kind: "completed" }
        : { kind: "failed", message: error.message });
    });
    child.stdin?.end();
  });

  if (build.kind === "failed") {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    return build;
  }

  try {
    await promoteStagedDevBuild(stagingDir, distDir);
    await rm(stagingDir, { recursive: true, force: true });
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    return {
      kind: "failed",
      message: `the build completed but its staged output could not be promoted: ${errorMessage(error)}`,
    };
  }
  return build;
}

async function promoteStagedDevBuild(stagingDir: string, distDir: string): Promise<void> {
  const stagedFiles = await listRelativeFiles(stagingDir);
  const liveFiles = await listRelativeFiles(distDir);
  const entry = "cli.js";
  if (!stagedFiles.includes(entry)) {
    throw new Error("staged build did not produce cli.js");
  }

  for (const file of stagedFiles.filter((candidate) => candidate !== entry)) {
    const destination = join(distDir, file);
    await mkdir(dirname(destination), { recursive: true });
    await rename(join(stagingDir, file), destination);
  }

  // The package bin always resolves this path. Replacing the file by rename keeps
  // either the old or new complete entry visible to concurrent invocations.
  await rename(join(stagingDir, entry), join(distDir, entry));

  const stagedFileSet = new Set(stagedFiles);
  await Promise.all(liveFiles
    .filter((file) => !stagedFileSet.has(file))
    .map((file) => rm(join(distDir, file), { force: true })));
}

async function listRelativeFiles(root: string, current = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listRelativeFiles(root, path));
    } else {
      files.push(relative(root, path));
    }
  }
  return files.sort();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Build production-mode dependencies for the running `dist/cli.js` location.
 *
 * Resolves the bundle input graph, `dist/cli.js` mtime, and the content-hash
 * stamp. Returns `null` for `newestSrc` when either half of the dev-mode
 * discriminator fails — the entry is not the built bundle, or `src/` is absent.
 */
export function createDevCheckDeps(cliJsPath: string): DevCheckDeps {
  const distDir = dirname(cliJsPath);
  const pkgDir = dirname(distDir);
  const srcDir = join(pkgDir, "src");

  const resolveInputFiles = (): string[] | null => {
    if (!isBuiltBundleEntry(cliJsPath)) return null;
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
 * stat is skipped — this guard runs before every command, so it must degrade
 * rather than crash on a transient filesystem gap.
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
