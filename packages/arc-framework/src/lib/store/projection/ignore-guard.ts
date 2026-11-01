/** One `git check-ignore` call proving every projected root and the aside folder ignored before the projection writes. */
import { isAbsolute, join, parse, posix, resolve, sep } from "node:path";
import type { GitExecInput } from "../../git/exec.js";
import { isGitProcessError } from "../../git/process-error.js";
import { readGitDirectories, type GitDirectoryFileAccess } from "../../git/directories.js";
import type { Slug } from "../../kernel/index.js";
import { isProjectedLifecyclePath, projectedRootPaths, projectedRootPatterns } from "../../layout/index.js";
import { PROJECTION_ASIDE_ROOT, PROJECTION_LOCAL_ROOT } from "./paths.js";

/** Where the line that would ignore a root belongs. */
export type IgnoreLineFile = "info/exclude" | ".gitignore";

/** A path the guard checks, with the line that ignores it and the file that line belongs in. */
export interface GuardedRoot { path: string; line: string; file: IgnoreLineFile }

/** The guard's verdict over every projected root and the aside folder. */
export type ProjectionIgnoreVerdict =
  | { kind: "passed"; ignoreFiles: readonly string[] }
  | { kind: "refused"; reason: "not-ignored"; roots: readonly GuardedRoot[]; remedy: string }
  | { kind: "refused"; reason: "guard-failed"; paths: readonly string[]; failure: string; remedy: string };

/** What the guard reads. */
export interface ProjectionIgnoreGuardInput {
  /** Pin a captured excludes selection; absent for a standalone guard over live configuration. */
  excludesFile?: string;
  root: string;
  identity: Slug;
  exec: GitExecInput;
  fs: GitDirectoryFileAccess;
}

const CHECK_IGNORE_ARGS = ["check-ignore", "-z", "-v", "--non-matching", "--no-index", "--stdin"];

interface CheckIgnoreMatch { source: string; pattern: string; path: string }

/** Each projected root for the identity and the aside folder, as directory paths, in the order the call answers. */
function guardedPaths(identity: Slug): GuardedRoot[] {
  const patterns = projectedRootPatterns();
  const roots = projectedRootPaths(identity).map((path, index): GuardedRoot => {
    const line = patterns[index];
    if (line === undefined) throw new Error("The projected roots' path and pattern forms disagree");
    return { path: `${path}/`, line, file: isProjectedLifecyclePath(path) ? "info/exclude" : ".gitignore" };
  });
  return [...roots, { path: `${PROJECTION_ASIDE_ROOT}/`, line: `${PROJECTION_LOCAL_ROOT}/`, file: "info/exclude" }];
}

/** Split the call's NUL-terminated output, four fields per path — source, line, pattern, path — in input order. */
function parseMatches(stdout: string, guarded: readonly GuardedRoot[]): CheckIgnoreMatch[] | undefined {
  const fields = stdout.split("\0");
  if (fields.length !== guarded.length * 4 + 1 || fields.at(-1) !== "") return undefined;
  const matches: CheckIgnoreMatch[] = [];
  for (const [index, root] of guarded.entries()) {
    const [source = "", , pattern = "", path] = fields.slice(index * 4, index * 4 + 4);
    if (path !== root.path) return undefined;
    matches.push({ source, pattern, path });
  }
  return matches;
}

/** Each `.gitignore` in a directory above a guarded path, from the repository root down, as Git names it. */
function ancestorGitignores(path: string): string[] {
  const directories = posix.dirname(path.replace(/\/$/u, "")).split("/");
  const files = [".gitignore"];
  for (let depth = 1; depth <= directories.length; depth += 1) {
    const directory = directories.slice(0, depth).join("/");
    if (directory !== ".") files.push(`${directory}/.gitignore`);
  }
  return files;
}

/**
 * The ignore files every pass rests on, whatever the call answers: info/exclude in the common Git directory and every
 * `.gitignore` above a guarded path, present or not.
 * @param input - Checkout, identity, and the Git and filesystem boundaries.
 * @returns Their absolute paths.
 */
export async function predictableIgnoreFiles(input: ProjectionIgnoreGuardInput): Promise<string[]> {
  const { commonDir } = await readGitDirectories(input.root, input.fs);
  const named = guardedPaths(input.identity).flatMap((root) => ancestorGitignores(root.path));
  return [...new Set([join(commonDir, "info", "exclude"), ...named.map((path) => resolve(input.root, path))])];
}

/** The ignore files a pass rests on: the predictable ones and each match's source. */
async function ignoreFiles(input: ProjectionIgnoreGuardInput, matches: readonly CheckIgnoreMatch[]): Promise<string[]> {
  const sources = matches.map((match) => sourcePath(input.root, match.source));
  return [...new Set([...await predictableIgnoreFiles(input), ...sources])];
}

/** Anchor only a source's root prefix; preserve its traversal components for the filesystem to follow in order. */
function sourcePath(root: string, source: string): string {
  const prefix = parse(source).root;
  const base = prefix === "" ? (isAbsolute(root) ? root : `${process.cwd()}${sep}${root}`) : resolve(root, `${prefix}.`);
  const rest = source.slice(prefix.length);
  const tail = sep === "\\" ? rest.replaceAll("/", sep) : rest;
  return `${base}${base.endsWith(sep) ? "" : sep}${tail}`;
}

/**
 * Prove every projected root and the aside folder ignored with one Git call.
 * @param input - Checkout, identity, and the Git and filesystem boundaries.
 * @returns A pass with the ignore files it rests on, or a typed refusal.
 */
export async function guardProjectionIgnores(input: ProjectionIgnoreGuardInput): Promise<ProjectionIgnoreVerdict> {
  const guarded = guardedPaths(input.identity);
  let stdout: string;
  try {
    stdout = await checkIgnore(input, guarded);
  } catch (error) {
    return guardFailed(guarded, error);
  }
  const matches = parseMatches(stdout, guarded);
  if (matches === undefined) return guardFailed(guarded, new Error("git check-ignore did not answer every guarded path"));
  const unignored = guarded.filter((root, index) => !isIgnoredAsRequired(root, matches[index]));
  if (unignored.length > 0) {
    return { kind: "refused", reason: "not-ignored", roots: unignored, remedy: notIgnoredRemedy(unignored) };
  }
  try {
    return { kind: "passed", ignoreFiles: await ignoreFiles(input, matches) };
  } catch (error) {
    return guardFailed(guarded, error);
  }
}

/** A refusal of every root for the command, typed apart from a missing line. */
export type GuardFailedVerdict = Extract<ProjectionIgnoreVerdict, { reason: "guard-failed" }>;

/**
 * Refuse every root for the command, as a call that did not answer does.
 * @param identity - The identity whose roots are guarded.
 * @param failure - What failed.
 * @returns The refusal, with the remedy of running the command again.
 */
export function refuseEveryRoot(identity: Slug, failure: string): GuardFailedVerdict {
  return guardFailed(guardedPaths(identity), new Error(failure));
}

/** Fail closed: a call that did not answer refuses every root for the command, typed apart from a missing line. */
function guardFailed(guarded: readonly GuardedRoot[], error: unknown): GuardFailedVerdict {
  return {
    kind: "refused", reason: "guard-failed", paths: guarded.map((root) => root.path),
    failure: error instanceof Error ? error.message : String(error),
    remedy: "The projection writes into no root until the guard passes; run the command again.",
  };
}

/** Run the one call; exit status 1, which Git returns when it counts no path ignored, still carries every verdict. */
async function checkIgnore(input: ProjectionIgnoreGuardInput, guarded: readonly GuardedRoot[]): Promise<string> {
  const args = input.excludesFile === undefined ? CHECK_IGNORE_ARGS
    : ["-c", `core.excludesFile=${input.excludesFile}`, ...CHECK_IGNORE_ARGS];
  try {
    return await input.exec(args, guarded.map((root) => `${root.path}\0`).join(""), { cwd: input.root });
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return error.stdout;
    throw error;
  }
}

/**
 * Git answers a directory a `!` pattern re-includes with an empty source, as it does a path no rule matches, and a
 * file so re-included with the `!` pattern itself, which it counts as a match; neither is ignored.
 */
function isIgnored(match: CheckIgnoreMatch): boolean {
  return match.source !== "" && !match.pattern.startsWith("!");
}

/**
 * A root whose line belongs in `.gitignore` passes only on a rule from a `.gitignore` inside the repository — the
 * root's or one nested on the path to it, which Git names by a repository-relative path — since `npm pack` reads only
 * those; an excludes file named `.gitignore` outside the repository does not count.
 */
function isIgnoredAsRequired(root: GuardedRoot, match: CheckIgnoreMatch | undefined): boolean {
  if (match === undefined || !isIgnored(match)) return false;
  return root.file !== ".gitignore" || ancestorGitignores(root.path).includes(match.source);
}

const LINE_FILE_NAMES: Record<IgnoreLineFile, string> = { "info/exclude": "Git's info/exclude", ".gitignore": ".gitignore" };

function notIgnoredRemedy(roots: readonly GuardedRoot[]): string {
  const lines = roots.map((root) => `\`${root.line}\` to ${LINE_FILE_NAMES[root.file]}`);
  return `Add ${lines.join(", ")}, then run the command again.`;
}
