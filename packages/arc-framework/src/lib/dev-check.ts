/** Compiler-free self-hosting freshness checks, rebuild-and-rerun admission and isolated owned refresh. */
import { createHash } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { constants } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { selectFirstPartyInputs } from "./build-inputs.js";
import { DEV_BUILD_STAMP_NAME, parseBuildEvidence } from "./build-evidence.js";
import { readBuildQualification, type BuildQualification } from "./build-qualification.js";
import { classifyAdvisoryLockRead, type AdvisoryLockReadResult } from "./advisory-lock.js";
import { BUILD_ARTIFACT_LOCK_NAME, TEST_CONTROLLER_TOKEN_ENV } from "./build-ownership.js";

/**
 * Decide whether this child is pinned to a live managed test controller's artifacts.
 * @param token - Controller token inherited by this process
 * @param holder - Classification of one lockfile observation
 * @param now - Current time in milliseconds
 * @returns Whether the owning test run makes another freshness check redundant
 */
export function shouldSkipDevBuildStaleness(
  token: string | undefined, holder: AdvisoryLockReadResult, now: number,
): boolean {
  if (!token || typeof holder === "string" || holder.token !== token
    || holder.leaseUntil === undefined || holder.leaseUntil <= now) return false;
  const metadata = holder.metadata;
  return typeof metadata === "object" && metadata !== null && "operation" in metadata
    && typeof metadata.operation === "string" && /^tests \([^)]+\)$/u.test(metadata.operation);
}

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
  | ({
      kind: "stale";
      /** Seconds since the newest src change. */
      srcAge: number;
      /** Seconds since dist/cli.js was built. `null` when dist is missing. */
      distAge: number | null;
      /** Repo-relative path of the newest src file. */
      newestSrc: string;
    } & (
      | { basis: "missing-dist" }
      | { basis: "content-hash"; qualificationReason: string }
    ));

/** Exact developer command that regenerates the self-hosting runtime bundle. */
export const DEV_BUILD_REFRESH_COMMAND = "npm run build:fast";

/** Internal build-time override used to direct a fast build into a staging directory. */
export const DEV_BUILD_OUTPUT_DIRECTORY_ENV = "ARC_DEV_BUILD_OUT_DIR";

/** Marks the one re-run of a command after its stale build was rebuilt, which refuses rather than rebuilding again. */
export const DEV_BUILD_RERUN_ENV = "ARC_DEV_BUILD_RERUN";

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
  /** Qualification of current runtime inputs and live output, retaining any refusal reason. */
  runtimeQualification: () => { status: "qualified" } | Extract<BuildQualification, { status: "unqualified" }>;
}

/** Synchronous command identity and the sole stale-build continuation exception. */
export interface DevBuildGuardInput {
  readonly commandPath: string;
  readonly writeCompactionSeed?: boolean;
}

/** Independent lease, freshness, rebuild and process-output boundaries for command admission. */
export interface DevBuildGuardDeps {
  readonly token: string | undefined;
  readonly readHolder: () => AdvisoryLockReadResult;
  readonly now: () => number;
  readonly freshness: DevCheckDeps;
  /** Whether this process is the re-run of a command whose stale build was already rebuilt. */
  readonly rerunning: boolean;
  /** Bring the runtime build current under checkout ownership. */
  readonly rebuild: DevBuildRefreshDeps["rebuild"];
  readonly writeStderr: (message: string) => void;
  readonly exit: (code: number) => void;
}

/** What a command does once the development build guard admits it. */
export type DevBuildAdmission =
  | { readonly kind: "run"; readonly refreshEligible: boolean }
  | { readonly kind: "rerun" };

const RUN_WITHOUT_REFRESH: DevBuildAdmission = { kind: "run", refreshEligible: false };

/**
 * Admit a command against the live controller lease or ordinary build qualification.
 *
 * This process has already loaded the bundle it checks, so a stale build is rebuilt and the command runs again on the
 * new bundle. A failed rebuild, a rebuild that leaves the bundle stale, and the re-run itself refuse instead.
 * @param input - Command path and compaction-seed exception
 * @param deps - Holder, freshness, rebuild and process boundaries
 * @returns Whether to run the command here and refresh the build after it, or to run it again on the rebuilt bundle
 */
export async function runDevBuildGuard(
  input: DevBuildGuardInput, deps: DevBuildGuardDeps,
): Promise<DevBuildAdmission> {
  if (shouldSkipDevBuildStaleness(deps.token, deps.readHolder(), deps.now())) return RUN_WITHOUT_REFRESH;
  const verdict = checkDevBuildStaleness(deps.freshness);
  if (verdict.kind === "skip") return RUN_WITHOUT_REFRESH;
  if (verdict.kind === "fresh") {
    return { kind: "run", refreshEligible: isDevBuildRefreshCommandPath(input.commandPath) };
  }
  const staleness = describeStaleness(verdict);
  // A stale seed is revalidated during recovery and is preferable to no seed.
  if (input.writeCompactionSeed === true) {
    deps.writeStderr(`warn: arc dev build is stale (${staleness}). Run \`npm run build:fast\` before relying on output.\n`);
    return RUN_WITHOUT_REFRESH;
  }
  if (!deps.rerunning) {
    deps.writeStderr(`info: rebuilding the stale arc dev build (${staleness}), `
      + `then running \`${input.commandPath}\` again.\n`);
    const refreshed = await refreshStaleDevBuild({
      check: () => checkDevBuildStaleness(deps.freshness), rebuild: deps.rebuild,
    });
    if (refreshed.kind !== "failed") return { kind: "rerun" };
    deps.writeStderr(`error: arc could not rebuild the dev build (${refreshed.message}).\n`);
  }
  deps.writeStderr(`error: arc dev build is stale (${staleness}). Refusing \`${input.commandPath}\` against stale `
    + "dist; run `npm run build:fast`, then retry.\n");
  deps.exit(1);
  return RUN_WITHOUT_REFRESH;
}

function describeStaleness(verdict: Extract<DevCheckResult, { kind: "stale" }>): string {
  const distAgeText = verdict.distAge === null ? "dist/cli.js missing"
    : `dist/cli.js built ${formatAge(verdict.distAge)} ago`;
  const staleCause = verdict.basis === "content-hash"
    ? verdict.qualificationReason
    : `${verdict.newestSrc} changed ${formatAge(verdict.srcAge)} ago`;
  return `${staleCause}; ${distAgeText}`;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

/**
 * Bind command admission to the running entry, its one holder read and process output.
 * @param cliJsPath - Absolute running CLI entry path
 * @returns Native synchronous dependencies without performing a freshness read
 */
export function createDevBuildGuardDeps(cliJsPath: string): DevBuildGuardDeps {
  const packageRoot = dirname(dirname(cliJsPath));
  const rerunning = process.env[DEV_BUILD_RERUN_ENV] === "1";
  // Commands this one starts check their own build rather than inheriting its single re-run.
  Reflect.deleteProperty(process.env, DEV_BUILD_RERUN_ENV);
  return {
    token: process.env[TEST_CONTROLLER_TOKEN_ENV], now: () => Date.now(),
    readHolder: () => {
      try {
        return classifyAdvisoryLockRead({ text: readFileSync(join(packageRoot, BUILD_ARTIFACT_LOCK_NAME), "utf8") });
      } catch (error) { return classifyAdvisoryLockRead({ error }); }
    },
    freshness: createDevCheckDeps(cliJsPath),
    rerunning,
    rebuild: () => prepareDevBuild(packageRoot),
    writeStderr: (message) => { process.stderr.write(message); },
    exit: (code) => { process.exit(code); },
  };
}

/**
 * Build the runtime under checkout ownership only if it is still unqualified once owned, so commands that found the
 * same stale build wait for one build instead of each publishing their own. A wait for another owner and any build
 * error show on this process's standard error; standard output stays the command's. A command cancelled during the
 * build ends the build, then ends as asked rather than refusing.
 */
async function prepareDevBuild(packageRoot: string): Promise<{ kind: "completed" } | { kind: "failed"; message: string }> {
  // On POSIX the build leads its own process group, so a signal reaches it only through this process, once, and
  // ends the compiler it starts as well. Windows' console signals every attached process directly.
  const ownGroup = process.platform !== "win32";
  const child = spawn(process.execPath,
    ["--import", "tsx", join(packageRoot, "src/scripts/run-build.ts"), "prepare"],
    { cwd: packageRoot, env: process.env, stdio: ["ignore", "ignore", "inherit"], detached: ownGroup });
  const ended = await superviseChild(child, ownGroup ? (signal) => { signalGroup(child, signal); } : undefined);
  if (ended.kind === "unstarted") return { kind: "failed", message: ended.message };
  if (ended.received !== null) endBySignal(ended.received);
  return ended.code === 0 ? { kind: "completed" }
    : { kind: "failed", message: `the build exited with ${ended.signal ?? `code ${String(ended.code)}`}` };
}

/**
 * Run this command again on the rebuilt bundle, ending this process with the re-run's status.
 *
 * On POSIX the re-run replaces this process, keeping its process ID, process group and standard streams, so every
 * signal reaches the re-run directly and exactly once, and input this process never read stays unread for it. On
 * Windows the re-run is a child that inherits the standard streams, and the console signals both directly.
 * @returns Never: the re-run replaces this process, or this process exits with its exit code or by its signal
 */
export async function rerunDevCommand(): Promise<never> {
  const args = [...process.execArgv, ...process.argv.slice(1)];
  const env = { ...process.env, [DEV_BUILD_RERUN_ENV]: "1" };
  if (process.platform !== "win32" && typeof process.execve === "function") {
    // Nothing after the replacement runs, so output already written must leave this process first.
    await Promise.all([flushed(process.stdout), flushed(process.stderr)]);
    try {
      process.execve(process.execPath, [process.execPath, ...args], env);
    } catch (error) {
      reportUnstartedRerun(error instanceof Error ? error.message : String(error));
    }
  }
  const ended = await superviseChild(spawn(process.execPath, args, { stdio: "inherit", env }));
  if (ended.kind === "unstarted") reportUnstartedRerun(ended.message);
  if (ended.signal !== null) endBySignal(ended.signal);
  process.exit(ended.code ?? 1);
}

function reportUnstartedRerun(message: string): never {
  process.stderr.write(`error: arc could not run the command again on the rebuilt dev build (${message}).\n`);
  process.exit(1);
}

/** Resolve once output already written to a stream has been handed to the system, or the stream has failed. */
async function flushed(stream: NodeJS.WriteStream): Promise<void> {
  await new Promise<void>((settle) => { stream.write("", () => { settle(); }); });
}

/** How a supervised child ended, and the first signal this process received while it ran. */
type SupervisedEnd =
  | { readonly kind: "exited"; readonly code: number | null; readonly signal: NodeJS.Signals | null;
      readonly received: NodeJS.Signals | null }
  | { readonly kind: "unstarted"; readonly message: string };

/** Signals that end a command, as a POSIX supervisor or terminal may send them and as Windows' console raises them. */
const SUPERVISED_SIGNALS: readonly NodeJS.Signals[] = process.platform === "win32"
  ? ["SIGINT", "SIGHUP"]
  : ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];

/**
 * Wait for a child of this process, recording the first ending signal this process receives meanwhile and handing
 * each one to `passOn`. Without `passOn` the child is signalled only directly, so this process outlasts the signal.
 */
async function superviseChild(
  child: ChildProcess, passOn?: (signal: NodeJS.Signals) => void,
): Promise<SupervisedEnd> {
  let received: NodeJS.Signals | null = null;
  const handle = (signal: NodeJS.Signals): void => { received ??= signal; passOn?.(signal); };
  for (const signal of SUPERVISED_SIGNALS) process.on(signal, handle);
  const detach = (): void => { for (const signal of SUPERVISED_SIGNALS) process.off(signal, handle); };
  return await new Promise((settle) => {
    child.on("error", (error) => {
      // A started child reports its end through `exit`; only a launch failure settles here.
      if (child.pid !== undefined) return;
      detach();
      settle({ kind: "unstarted", message: error.message });
    });
    child.once("exit", (code, signal) => { detach(); settle({ kind: "exited", code, signal, received }); });
  });
}

/** Signal every process in the group a child leads, including any it started; a group already ended is left alone. */
function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // Every process in the group has already ended.
  }
}

/** End this process by a signal, or by its conventional status where the signal is ignored here. */
function endBySignal(signal: NodeJS.Signals): never {
  process.kill(process.pid, signal);
  process.exit(128 + constants.signals[signal]);
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

  const qualification = deps.runtimeQualification();
  if (qualification.status === "qualified") return { kind: "fresh" };
  return { kind: "stale", basis: "content-hash", qualificationReason: qualification.reason,
    srcAge, distAge, newestSrc: newest.path };
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
    runtimeQualification: () => readBuildQualification(pkgDir, "runtime"),
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
