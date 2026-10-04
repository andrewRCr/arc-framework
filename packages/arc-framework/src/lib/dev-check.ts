/** Compiler-free self-hosting freshness checks and isolated owned refresh. */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { selectFirstPartyInputs } from "./build-inputs.js";
import { DEV_BUILD_STAMP_NAME, parseBuildEvidence } from "./build-evidence.js";
import { readBuildQualification } from "./build-qualification.js";

/** Filename of the content-hash stamp written beside `dist/cli.js` at build time. */
export { DEV_BUILD_STAMP_NAME };

/**
 * Whether the running entry is the built bundle rather than TypeScript source.
 *
 * Only a JavaScript entry inside `dist` can represent a published development
 * build; source execution does not consume those artifacts. The build config
 * owns the filename, so this discriminator uses extension and parent directory.
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
      basis: "content-hash" | "missing-dist";
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
  /** Current runtime input identity and required live output are qualified. */
  runtimeQualified: () => boolean;
}

/**
 * Pure verdict function. Returns `skip` for adopters, `stale` when source
 * inputs or required qualification do not match, `fresh` otherwise.
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

  if (deps.runtimeQualified()) return { kind: "fresh" };
  return { kind: "stale", basis: "content-hash", srcAge, distAge, newestSrc: newest.path };
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
  return refreshStaleDevBuild({
    check,
    rebuild: () => runFastDevBuild(packageRoot),
  });
}

async function runFastDevBuild(packageRoot: string): Promise<
  { kind: "completed" } | { kind: "failed"; message: string }
> {
  return await new Promise((settle) => {
    const child = execFile(process.execPath,
      ["--import", "tsx", join(packageRoot, "src/scripts/run-build.ts"), "fast"],
      { cwd: packageRoot, env: process.env, maxBuffer: 16 * 1024 * 1024 }, (error) => {
        settle(error === null ? { kind: "completed" } : { kind: "failed", message: error.message });
      });
    child.stdin?.end();
  });
}

/**
 * Build production-mode dependencies for the running `dist/cli.js` location.
 *
 * Reads recorded runtime inputs and complete qualification; mtimes supply ages only.
 * Returns `null` for `newestSrc` when the entry is not a bundle or `src/` is absent.
 */
export function createDevCheckDeps(cliJsPath: string): DevCheckDeps {
  const distDir = dirname(cliJsPath);
  const pkgDir = dirname(distDir);
  const srcDir = join(pkgDir, "src");

  const resolveInputFiles = (): string[] | null => {
    if (!isBuiltBundleEntry(cliJsPath) || !existsSync(srcDir)) return null;
    try {
      const evidence = parseBuildEvidence(JSON.parse(readFileSync(join(distDir, DEV_BUILD_STAMP_NAME), "utf8")));
      if (evidence !== null) {
        const root = resolve(pkgDir, "../..");
        return [...new Set([...evidence.graphs.cli, ...evidence.graphs.controls, ...evidence.configurationInputs])]
          .map((key) => join(root, key));
      }
    } catch { /* Unqualified evidence still receives source-age diagnostics. */ }
    const files: string[] = [];
    walkTsFiles(srcDir, (file) => files.push(file));
    return files;
  };
  return {
    newestSrc: () => {
      const files = resolveInputFiles();
      if (files === null) return null;
      return newestFile(files, pkgDir) ?? { mtimeMs: 0, path: "src" };
    },
    distMtimeMs: () => existsSync(cliJsPath) ? statSync(cliJsPath).mtimeMs : null,
    now: () => Date.now(),
    runtimeQualified: () => readBuildQualification(pkgDir, "runtime").status === "qualified",
  };
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
 * Select first-party TS, JS, and JSON inputs from actual compiler metadata.
 * @param metafile - Parsed esbuild metadata
 * @param pkgDir - Compiler working directory
 * @returns Normalized absolute inputs, or null for unusable or empty metadata
 */
export function selectBundleInputs(metafile: unknown, pkgDir: string): string[] | null {
  if (metafile === null || typeof metafile !== "object" || !("inputs" in metafile)) return null;
  const inputs: unknown = metafile.inputs;
  if (inputs === null || typeof inputs !== "object" || Array.isArray(inputs)) return null;
  const paths = selectFirstPartyInputs(Object.keys(inputs), pkgDir);
  return paths.length > 0 ? paths : null;
}
