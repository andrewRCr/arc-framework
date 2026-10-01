/** Canonical, byte-preserving facts derived from Git raw-diff output. */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CanonicalChange,
  ChangePathFact,
  ChangePathSet,
  ChangeSet,
} from "./change-facts.schema.js";
import type { RawGitExec, RawGitResult } from "./git/exec.js";

export type { CanonicalChange, ChangePathFact, ChangePathSet, ChangeSet };
export type ChangeStatus = ChangePathFact["status"];

const GIT_REPOSITORY_LOCAL_ENVIRONMENT = new Set<string>([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
  "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR",
]);

function environmentForRawGit(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([variable]) => !GIT_REPOSITORY_LOCAL_ENVIRONMENT.has(variable)),
  );
}

/** Stable union of every affected path, including both move and copy endpoints. */
export function affectedPaths(
  changes: readonly { path: string; previousPath?: string }[],
): string[] {
  const paths = new Set<string>();
  for (const change of changes) {
    if (change.previousPath !== undefined) paths.add(change.previousPath);
    paths.add(change.path);
  }
  return [...paths];
}

const UNKNOWN: ChangeSet = { changeSet: "unknown", changes: [] };
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();
const STATUS = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type-changed",
} as const;

type RawStatus = keyof typeof STATUS;
type ModeClass = "regular" | "symlink" | "gitlink";

function modeClass(mode: string): ModeClass | null {
  if (mode === "100644" || mode === "100755") return "regular";
  if (mode === "120000") return "symlink";
  if (mode === "160000") return "gitlink";
  return null;
}

function rawEndpointsAreValid(
  status: RawStatus,
  oldMode: string,
  newMode: string,
  oldObject: string,
  newObject: string,
): boolean {
  const oldZeroMode = oldMode === "000000";
  const newZeroMode = newMode === "000000";
  const oldZeroObject = /^0+$/u.test(oldObject);
  const newZeroObject = /^0+$/u.test(newObject);
  if (oldZeroMode !== oldZeroObject || newZeroMode !== newZeroObject) return false;
  const oldAbsent = oldZeroMode;
  const newAbsent = newZeroMode;
  const oldClass = oldAbsent ? null : modeClass(oldMode);
  const newClass = newAbsent ? null : modeClass(newMode);
  if ((!oldAbsent && oldClass === null) || (!newAbsent && newClass === null)) return false;

  switch (status) {
    case "A":
      return oldAbsent && !newAbsent;
    case "D":
      return !oldAbsent && newAbsent;
    case "M":
      return (
        !oldAbsent &&
        !newAbsent &&
        oldClass === newClass &&
        (oldMode !== newMode || oldObject !== newObject)
      );
    case "T":
      return !oldAbsent && !newAbsent && oldClass !== newClass;
    case "R":
    case "C":
      return !oldAbsent && !newAbsent;
  }
}

function splitNul(input: Uint8Array): Uint8Array[] | null {
  if (input.length === 0 || input.at(-1) !== 0) return null;

  const fields: Uint8Array[] = [];
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] !== 0) continue;
    fields.push(input.subarray(start, index));
    start = index + 1;
  }
  return fields;
}

/**
 * Parse `git diff --raw -z --no-abbrev` output into the canonical change record.
 *
 * @param input - Exact bytes emitted by Git
 * @returns A known record only when every raw-diff entry is valid
 */
export function parseRawDiff(input: Uint8Array): ChangeSet {
  const fields = splitNul(input);
  if (fields === null || fields.length === 0) return UNKNOWN;

  try {
    const changes: CanonicalChange[] = [];
    let objectWidth: number | undefined;
    let cursor = 0;

    while (cursor < fields.length) {
      const header = decoder.decode(fields[cursor]);
      cursor += 1;
      const match =
        /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]+) ([0-9a-f]+) ([AMDT]|[RC][0-9]{3})$/u.exec(header);
      if (match === null) return UNKNOWN;

      const [, oldMode, newMode, oldObject, newObject, rawStatusWithScore] = match;
      if (
        oldMode === undefined ||
        newMode === undefined ||
        oldObject === undefined ||
        newObject === undefined ||
        rawStatusWithScore === undefined ||
        oldObject.length !== newObject.length ||
        (oldObject.length !== 40 && oldObject.length !== 64) ||
        (objectWidth !== undefined && oldObject.length !== objectWidth)
      ) {
        return UNKNOWN;
      }
      objectWidth = oldObject.length;

      const rawStatus = rawStatusWithScore[0] as keyof typeof STATUS;
      const hasPreviousPath = rawStatus === "R" || rawStatus === "C";
      if (
        (hasPreviousPath && Number(rawStatusWithScore.slice(1)) > 100) ||
        !rawEndpointsAreValid(rawStatus, oldMode, newMode, oldObject, newObject)
      ) {
        return UNKNOWN;
      }

      const firstPathBytes = fields[cursor];
      if (firstPathBytes === undefined) return UNKNOWN;
      cursor += 1;
      const firstPath = decoder.decode(firstPathBytes);
      if (firstPath.length === 0) return UNKNOWN;

      let previousPath: string | undefined;
      let path = firstPath;
      if (hasPreviousPath) {
        const secondPathBytes = fields[cursor];
        if (secondPathBytes === undefined) return UNKNOWN;
        cursor += 1;
        previousPath = firstPath;
        path = decoder.decode(secondPathBytes);
        if (path.length === 0 || path === previousPath) return UNKNOWN;
      }

      changes.push({
        status: STATUS[rawStatus],
        path,
        ...(previousPath === undefined ? {} : { previousPath }),
        oldMode,
        newMode,
      } as CanonicalChange);
    }

    return changes.length === 0 ? UNKNOWN : { changeSet: "known", changes };
  } catch {
    return UNKNOWN;
  }
}

/**
 * Resolve canonical change facts between two explicit Git coordinates.
 *
 * @param exec - Byte-preserving Git boundary
 * @param base - Base commitish
 * @param head - Head commitish
 * @returns Canonical facts, or an unknown record when Git or parsing fails
 */
export async function resolveChangeSet(
  exec: RawGitExec,
  base: string,
  head: string,
): Promise<ChangeSet> {
  if (base.length === 0 || head.length === 0 || base.startsWith("-") || head.startsWith("-")) {
    return UNKNOWN;
  }

  try {
    const { stdout } = await exec([
      "diff",
      "--raw",
      "-z",
      "--no-abbrev",
      "-M",
      "-C",
      "--find-copies-harder",
      base,
      head,
      "--",
    ]);
    return parseRawDiff(stdout);
  } catch {
    return UNKNOWN;
  }
}

/**
 * Create the production byte-preserving Git boundary.
 *
 * @param cwd - Default repository working directory
 * @returns A raw Git executor
 */
export function createSpawnRawGitExec(cwd = process.cwd()): RawGitExec {
  return (args, options) =>
    new Promise<RawGitResult>((resolveResult, reject) => {
      const effectiveArgs = options?.objectAccess === "local-only"
        ? ["--no-lazy-fetch", ...args]
        : args;
      const effectiveCwd = options?.cwd ?? cwd;
      const environment = environmentForRawGit();
      const env = options?.objectAccess === "local-only"
        ? { ...environment, GIT_NO_LAZY_FETCH: "1" }
        : environment;
      const child = spawn("git", effectiveArgs, {
        cwd: effectiveCwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        const stdoutBytes = Buffer.concat(stdout);
        const stderrBytes = Buffer.concat(stderr);
        if (code === 0) {
          resolveResult({ stdout: stdoutBytes, stderr: stderrBytes });
          return;
        }
        reject(Object.assign(
          new Error(`git ${effectiveArgs[0] ?? "command"} failed with exit code ${code ?? "unknown"}`),
          {
            ...(code === null ? {} : { exitCode: code }),
            stdout: stdoutBytes,
            stderr: stderrBytes,
          },
        ));
      });
      child.stdin.end(options?.input);
    });
}

const CODE_SURFACE_GLOBS = [
  "packages/arc-framework/src/*",
  "packages/arc-framework/__tests__/*",
  "packages/arc-framework/arc/*",
  "packages/arc-framework/templates/*",
  "packages/arc-framework/package.json",
  "packages/arc-framework/tsconfig*.json",
  "packages/arc-framework/tsup.config.ts",
  "packages/arc-framework/vitest.config.ts",
  "packages/arc-framework/eslint.config.js",
  "packages/arc-framework/init-recipe.json",
  "package.json",
  "package-lock.json",
  "scripts/*.sh",
  ".github/workflows/ci.yml",
  ".arc/system/extensions/*",
] as const;

const GENUINE_DOCS_GLOBS = [".arc/*", "docs/*", "mkdocs.yml"] as const;

const PACKAGED_CONTENT_SENSITIVE_GLOBS = [
  "packages/arc-framework/arc/system/extensions/*",
  "packages/arc-framework/arc/system/.internal/*",
  "packages/arc-framework/arc/reference/templates/*",
  "packages/arc-framework/arc/*.template.md",
] as const;

const PORTABILITY_SURFACE_GLOBS = [
  "packages/arc-framework/src/lib/fs.ts",
  "packages/arc-framework/src/lib/kernel/fs-retry.ts",
  "packages/arc-framework/src/lib/local-test-admission.ts",
  "packages/arc-framework/src/lib/local-vitest-runner.ts",
  "packages/arc-framework/src/lib/git/worktree-marker.ts",
  "packages/arc-framework/src/lib/git/exec.ts",
  "packages/arc-framework/src/lib/release/commit-message-retry-store.ts",
  "packages/arc-framework/src/lib/work-unit/park-planning-landing.ts",
  "packages/arc-framework/src/lib/dev-check.ts",
  "packages/arc-framework/src/lib/kernel/schema/generate.ts",
  "packages/arc-framework/src/lib/test-cost/run.ts",
  "packages/arc-framework/src/handlers/status.ts",
  "packages/arc-framework/src/lib/advisory-lock.ts",
  "packages/arc-framework/src/lib/git/ref-tree.ts",
  "packages/arc-framework/src/lib/errand/*",
  "packages/arc-framework/src/lib/user-sync/*",
  "packages/arc-framework/src/commands/user/shared.ts",
  "packages/arc-framework/__tests__/unit/advisory-lock.test.ts",
  "packages/arc-framework/__tests__/unit/fs.test.ts",
  "packages/arc-framework/__tests__/unit/local-test-admission.test.ts",
  "packages/arc-framework/__tests__/unit/git/worktree-marker.test.ts",
  "packages/arc-framework/__tests__/unit/lib/release/commit-message-retry-store.test.ts",
  "packages/arc-framework/__tests__/integration/ref-tree-cas*.test.ts",
  "packages/arc-framework/__tests__/integration/sync-state-ref*.test.ts",
  "packages/arc-framework/__tests__/e2e/state-ref-race.e2e.test.ts",
  "packages/arc-framework/__tests__/e2e/race-worker.ts",
  "packages/arc-framework/__tests__/e2e/true-race.ts",
  "packages/arc-framework/__tests__/e2e/helpers.ts",
  "packages/arc-framework/__tests__/helpers/integration.ts",
  "packages/arc-framework/package.json",
  "packages/arc-framework/vitest.config.ts",
  "package.json",
  "package-lock.json",
  ".github/workflows/ci.yml",
  "scripts/classify-change.sh",
] as const;

function matchesGlob(path: string, glob: string): boolean {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/gu, "\\$&").replaceAll("*", "[\\s\\S]*");
  return new RegExp(`^${escaped}$`, "u").test(path);
}

function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((glob) => matchesGlob(path, glob));
}

/** Whether a path can change build, lint, typecheck, or test behavior. */
export function isCodeSurfacePath(path: string): boolean {
  if (matchesAny(path, CODE_SURFACE_GLOBS)) return true;
  if (matchesAny(path, GENUINE_DOCS_GLOBS)) return false;
  if (!path.includes("/") && path.endsWith(".md")) return false;
  return true;
}

/** Whether a path belongs to the packaged ARC tree. */
export function isPackagedArcPath(path: string): boolean {
  return path.startsWith("packages/arc-framework/arc/");
}

/** Whether packaged content participates in verified-tree identity by blob. */
export function isPackagedContentSensitivePath(path: string): boolean {
  return !path.endsWith(".md") || matchesAny(path, PACKAGED_CONTENT_SENSITIVE_GLOBS);
}

/** Whether a path can affect the cross-platform portability suite. */
export function isPortabilitySurfacePath(path: string): boolean {
  return matchesAny(path, PORTABILITY_SURFACE_GLOBS);
}

/** Whether a path belongs to the formative planning-artifact lane. */
export function isPlanningArtifactPath(path: string): boolean {
  const artifactName = "(?:draft|tasks|meta|notes|cohort|research|analysis|spec)-[a-z0-9]+(?:-[a-z0-9]+)*\\.md";
  const workUnitDirectory = "[a-z0-9]+(?:-[a-z0-9]+)*";
  return path === ".arc/backlog/ROADMAP.md"
    || new RegExp(`^\\.arc/system/\\.internal/transitions/${workUnitDirectory}\\.json$`, "u").test(path)
    || new RegExp(`^\\.arc/active/${artifactName}$`, "u").test(path)
    // A planned work unit may sit under a cohort and one subcohort; provisional stubs never nest that deep.
    || new RegExp(`^\\.arc/backlog/planned/(?:${workUnitDirectory}/){1,3}${artifactName}$`, "u").test(path)
    || new RegExp(`^\\.arc/backlog/provisional/(?:${workUnitDirectory}/){1,2}${artifactName}$`, "u").test(path);
}

function isPlainPlanningContentChange(change: CanonicalChange): boolean {
  switch (change.status) {
    case "added":
      return change.newMode === "100644";
    case "deleted":
      return change.oldMode === "100644";
    case "modified":
    case "renamed":
    case "copied":
      return change.oldMode === "100644" && change.newMode === "100644";
    case "type-changed":
      return false;
  }
}

function classifyPlanningPaths(
  changeSet: ChangeSet,
  pathEligible: (path: string) => boolean,
): "planning" | "reviewed" {
  if (changeSet.changeSet === "unknown") return "reviewed";
  for (const change of changeSet.changes) {
    if (!isPlainPlanningContentChange(change)) return "reviewed";
    const endpoints = [change.path, ...(change.previousPath === undefined ? [] : [change.previousPath])];
    if (!endpoints.every(pathEligible)) return "reviewed";
  }
  return "planning";
}

/** Reduce canonical exact-ref changes to the planning-clearance lane. */
export function classifyPlanningLane(changeSet: ChangeSet): "planning" | "reviewed" {
  return classifyPlanningPaths(changeSet, isPlanningArtifactPath);
}

/** Reduce canonical changes to the CI-weight classification. */
export function classifyChangeSet(changeSet: ChangeSet): "light" | "heavy" | "unknown" {
  if (changeSet.changeSet === "unknown") return "unknown";

  for (const change of changeSet.changes) {
    const endpoints = [change.path, ...(change.previousPath === undefined ? [] : [change.previousPath])];
    for (const endpoint of endpoints) {
      if (isPackagedArcPath(endpoint)) {
        if (
          change.status !== "modified" ||
          change.oldMode !== "100644" ||
          change.newMode !== "100644" ||
          isPackagedContentSensitivePath(endpoint)
        ) {
          return "heavy";
        }
      } else if (isCodeSurfacePath(endpoint)) {
        return "heavy";
      }
    }
  }
  return "light";
}

function parseNulPaths(input: Uint8Array): string[] | null {
  const fields = splitNul(input);
  if (fields === null) return null;
  try {
    const paths = fields.map((field) => decoder.decode(field));
    return paths.some((path) => path.length === 0) ? null : paths;
  } catch {
    return null;
  }
}

type PathProjection = "classify" | "lane" | "portability";

function projectPaths(kind: PathProjection, input: Uint8Array): string {
  const paths = parseNulPaths(input);
  if (paths === null || paths.length === 0) {
    if (kind === "classify") return "heavy";
    if (kind === "lane") return "reviewed";
    return "true";
  }
  if (kind === "classify") return paths.some(isCodeSurfacePath) ? "heavy" : "light";
  if (kind === "lane") return paths.every(isPlanningArtifactPath) ? "auto" : "reviewed";
  return paths.some(isPortabilitySurfacePath) ? "true" : "false";
}

interface TreeEntry {
  mode: string;
  type: string;
  oid: string;
  path: string;
  pathBytes: Uint8Array;
}

function parseTreeListing(input: Uint8Array): TreeEntry[] {
  const records = splitNul(input);
  if (records === null) throw new Error("malformed tree listing");
  const entries: TreeEntry[] = [];
  let objectWidth: number | undefined;

  for (const record of records) {
    const tab = record.indexOf(0x09);
    if (tab < 0) throw new Error("malformed tree entry");
    const meta = decoder.decode(record.subarray(0, tab));
    const match = /^([0-7]{6}) (blob|commit|tree) ([0-9a-f]{40}|[0-9a-f]{64})$/u.exec(meta);
    if (match === null) throw new Error("malformed tree metadata");
    const [, mode, type, oid] = match;
    if (mode === undefined || type === undefined || oid === undefined) throw new Error("missing tree metadata");
    const validType =
      ((mode === "100644" || mode === "100755" || mode === "120000") && type === "blob") ||
      (mode === "160000" && type === "commit");
    if (!validType || (objectWidth !== undefined && oid.length !== objectWidth)) {
      throw new Error("invalid tree entry");
    }
    objectWidth = oid.length;
    const pathBytes = record.subarray(tab + 1);
    const path = decoder.decode(pathBytes);
    if (path.length === 0) throw new Error("missing tree path");
    entries.push({ mode, type, oid, path, pathBytes });
  }
  return entries;
}

function identityBytes(entries: TreeEntry[]): Uint8Array {
  const sorted = [...entries].sort((left, right) => Buffer.compare(left.pathBytes, right.pathBytes));
  const parts: Uint8Array[] = [encoder.encode("arc-code-tree\0v2\0layer\0content-sensitive\0")];
  for (const entry of sorted) {
    if (
      isCodeSurfacePath(entry.path) &&
      (!isPackagedArcPath(entry.path) || isPackagedContentSensitivePath(entry.path))
    ) {
      parts.push(
        encoder.encode("entry\0path\0"),
        entry.pathBytes,
        encoder.encode(`\0mode\0${entry.mode}\0type\0${entry.type}\0oid\0${entry.oid}\0`),
      );
    }
  }
  parts.push(encoder.encode("layer\0packaged-shape\0"));
  for (const entry of sorted) {
    if (isPackagedArcPath(entry.path)) {
      parts.push(
        encoder.encode("entry\0path\0"),
        entry.pathBytes,
        encoder.encode(`\0mode\0${entry.mode}\0type\0${entry.type}\0`),
      );
    }
  }
  return Buffer.concat(parts);
}

/** Compute the versioned code-tree identity at a Git ref. */
export async function codeTreeHash(
  exec: RawGitExec,
  ref: string,
  listing?: Uint8Array,
): Promise<string> {
  if (ref.length === 0 || ref.startsWith("-")) throw new Error("invalid tree ref");
  const raw = listing ?? (await exec(["ls-tree", "-rz", "--full-tree", ref])).stdout;
  const identity = identityBytes(parseTreeListing(raw));
  const { stdout } = await exec(["hash-object", "--stdin"], { input: identity });
  const hash = decoder.decode(stdout).trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(hash)) throw new Error("invalid tree hash");
  return hash;
}

async function optionalTreeFixture(ref: string): Promise<Uint8Array | undefined> {
  const fixtureDir = process.env.CLASSIFY_TREE_LIST_DIR;
  if (fixtureDir === undefined || fixtureDir === "") return undefined;
  try {
    return await readFile(join(fixtureDir, `${ref}.raw`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function runExecutable(args: string[]): Promise<void> {
  const [command, ...operands] = args;
  const exec = createSpawnRawGitExec();

  if (command === "classification") {
    const [base, head, ...rest] = operands;
    let changeSet = UNKNOWN;
    if (base !== undefined && head !== undefined && rest.length === 0) {
      const fixture = process.env.CLASSIFY_RAW_DIFF_FILE;
      changeSet =
        fixture === undefined || fixture === ""
          ? await resolveChangeSet(exec, base, head)
          : parseRawDiff(await readFile(fixture));
    }
    process.stdout.write(`${classifyChangeSet(changeSet)}\n`);
    return;
  }

  const pathProjection = {
    "classify-paths": "classify",
    "lane-paths": "lane",
    "portability-paths": "portability",
  }[command ?? ""] as PathProjection | undefined;
  if (pathProjection !== undefined && operands.length === 0) {
    process.stdout.write(`${projectPaths(pathProjection, readFileSync(0))}\n`);
    return;
  }

  if (command === "tree-hash") {
    const [ref, ...rest] = operands;
    if (ref === undefined || rest.length !== 0) throw new Error("tree-hash requires one ref");
    if (process.env.CLASSIFY_TREE_SERIALIZE_FAIL === "true") throw new Error("tree serialization failed");
    process.stdout.write(`${await codeTreeHash(exec, ref, await optionalTreeFixture(ref))}\n`);
    return;
  }

  const [base, head, ...rest] = args;
  const result =
    base === undefined || head === undefined || rest.length !== 0
      ? UNKNOWN
      : await resolveChangeSet(exec, base, head);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1];
const modulePath = fileURLToPath(import.meta.url);
if (
  invokedPath !== undefined
  && /(?:^|[/\\])change-facts\.(?:ts|js)$/u.test(modulePath)
  && modulePath === resolve(invokedPath)
) {
  try {
    await runExecutable(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "change-fact execution failed"}\n`);
    process.exitCode = 1;
  }
}
