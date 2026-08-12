/**
 * ROADMAP regeneration assert helpers.
 *
 * The pre-commit check compares the staged ROADMAP blob against a fresh render
 * whose project-tree inputs are read from the Git index. That certifies the
 * commit being made instead of the caller's dirty worktree.
 *
 * @module
 */

import { isAbsolute, posix, relative, sep } from "node:path";

import type { GitExec } from "../git/exec.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { resolveArcPath } from "../layout/index.js";
import { buildLifecycleIndex } from "../work-unit/lifecycle-index.js";
import { listParkedSlugs } from "../work-unit/lifecycle-resolver.js";
import { parseTransitionRecord } from "../work-unit/transition-record.js";
import {
  resolveTransitionRecordRelativePath,
  TRANSITION_RECORD_NAMESPACE,
} from "../work-unit/transition-record-store.js";
import { readTreeEntry } from "../work-unit/git-decomposition-object-readers.js";
import {
  createValidatedTransitionOverlay,
  type TransitionOverlayCompositionInput,
  type ValidatedTransitionOverlay,
} from "../work-unit/transition-overlay.js";

import {
  composeProjectReadinessViewResult,
  resolveProjectReadinessRenderStamp,
  resolveProjectReadinessViewInput,
  type ProjectReadinessRenderStamp,
  type ProjectReadinessViewResult,
  type ProjectViewDirEntry,
  type ProjectViewFs,
} from "./project-view.js";
import { resolveProjectErrandOracleContext } from "./project-oracle-context.js";

/** Repo-relative path to the tracked project readiness view. */
export const ROADMAP_PATH = resolveArcPath({ kind: "project-document", document: "roadmap" });

/** Command users can run to recreate the tracked readiness view. */
export const ROADMAP_RERENDER_COMMAND = "arc status --project --staged --write";

/** Shared remediation instruction for hook diagnostics. */
export const ROADMAP_RERENDER_INSTRUCTION =
  `Re-render with \`${ROADMAP_RERENDER_COMMAND}\`, then stage \`${ROADMAP_PATH}\`.`;

/** Result of comparing a staged ROADMAP blob with a fresh render. */
export type RoadmapRegenerationAssertVerdict =
  | { status: "pass" }
  | { status: "reject-mismatch"; message: string }
  | { status: "reject-markers"; message: string }
  | { status: "warn-and-allow"; message: string };

/** Inputs for {@link assertRoadmapRegenerated}. */
export interface RoadmapRegenerationAssertInput {
  /** Exact staged ROADMAP blob content. */
  stagedContent: string;
  /** Exact fresh render content, including its trailing newline. */
  renderedContent: string;
  /** Whether the fresh render observed changing in-flight inputs. */
  indeterminate: boolean;
}

/** Options for {@link createIndexProjectViewFs}. */
export interface IndexProjectViewFsOptions {
  /** Repository root containing the staged index. */
  cwd: string;
  /** Git executor that preserves stdout bytes for blob reads. */
  exec: GitExec;
}

/** Options for rendering the staged-index ROADMAP view. */
export interface RenderRoadmapFromIndexOptions extends IndexProjectViewFsOptions {
  /** Optional H1 text without the leading `#`. */
  title?: string;
  /** Base branch for the local-ref oracle. */
  baseBranch?: string;
  /** Optional fixed render stamp for tests. */
  renderedRef?: string | ProjectReadinessRenderStamp;
  /** Optional fixed checked-out branch for tests; omitted resolves it from Git. */
  currentBranch?: string | null;
  /** Optional explicit receipt-blind transition suppressions. */
  transitionOverlays?: readonly TransitionOverlayCompositionInput[];
}

/** ROADMAP content plus whether its source snapshot was determinate. */
export interface RoadmapIndexRenderResult {
  content: string;
  indeterminate: boolean;
}

/** ROADMAP structured view plus whether its source snapshot was determinate. */
export interface RoadmapIndexViewResult {
  result: ProjectReadinessViewResult;
  indeterminate: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const TRANSITION_RECORD_PATH_RE = new RegExp(
  `^${escapeRegExp(TRANSITION_RECORD_NAMESPACE)}/[^/]+\\.json$`,
  "u",
);
const CONFLICT_MARKER_RE = /^(?:<{7}(?: .*)?|={7}|>{7}(?: .*)?|\|{7}(?: .*)?)$/mu;

class IndexDirEntry implements ProjectViewDirEntry {
  constructor(
    readonly name: string,
    private readonly directory: boolean,
  ) {}

  isDirectory(): boolean {
    return this.directory;
  }
}

/**
 * Compare staged ROADMAP content to the fresh render and produce the hook
 * verdict. Conflict markers always reject before determinacy is considered.
 *
 * @param input - Staged blob, rendered blob, and render determinacy.
 * @returns The block/warn/pass verdict.
 */
export function assertRoadmapRegenerated(
  input: RoadmapRegenerationAssertInput,
): RoadmapRegenerationAssertVerdict {
  if (CONFLICT_MARKER_RE.test(input.stagedContent)) {
    return {
      status: "reject-markers",
      message: [
        `${ROADMAP_PATH} contains conflict markers.`,
        "This file is derived; resolve by regenerating it instead of hand-merging.",
        ROADMAP_RERENDER_INSTRUCTION,
      ].join("\n"),
    };
  }

  if (input.stagedContent === input.renderedContent) {
    return { status: "pass" };
  }

  if (input.indeterminate) {
    return {
      status: "warn-and-allow",
      message: [
        `${ROADMAP_PATH} does not match a fresh render, but the render observed changing in-flight inputs.`,
        "Commit is allowed because the snapshot was indeterminate; re-run the render when refs settle.",
        ROADMAP_RERENDER_INSTRUCTION,
      ].join("\n"),
    };
  }

  return {
    status: "reject-mismatch",
    message: [
      `${ROADMAP_PATH} does not match the rendered project readiness view.`,
      ROADMAP_RERENDER_INSTRUCTION,
    ].join("\n"),
  };
}

/**
 * Build a filesystem adapter whose directory and file reads come from the Git
 * index (`git ls-files --stage` and `git show :path`).
 *
 * @param options - Repository root and Git executor.
 * @returns A project-view filesystem backed by staged content.
 */
export function createIndexProjectViewFs(options: IndexProjectViewFsOptions): ProjectViewFs {
  return {
    readdir: async (path) => listIndexDirectory(options.exec, options.cwd, repoPath(options.cwd, path)),
    readFile: async (path) => {
      const { stdout } = await options.exec("git", ["show", `:${repoPath(options.cwd, path)}`], {
        cwd: options.cwd,
      });
      return stdout;
    },
  };
}

async function readHeadTransitionRecord(
  options: IndexProjectViewFsOptions,
  path: string,
): Promise<string | null> {
  const cwdExec: GitExec = async (command, args) => await options.exec(command, args, {
    cwd: options.cwd,
  });
  const entry = await readTreeEntry(cwdExec, "HEAD", path);
  if (entry === null) return null;
  if (entry === false || entry.type !== "blob") {
    throw new Error(`unable to read transition record at HEAD:${path}`);
  }
  const { stdout } = await options.exec("git", ["show", `HEAD:${path}`], { cwd: options.cwd });
  return stdout;
}

/**
 * Resolve terminal transitions staged with the prospective ROADMAP tree.
 *
 * This adapter authenticates an added record's canonical origin path before granting
 * transition-overlay authority. Decomposition branches are deterministic; direct
 * transitions recover their retiring branch from the origin meta at HEAD.
 *
 * @param options - Repository root and Git executor for the staged index.
 * @returns Every validated suppression authority represented by the staged transition set.
 */
export async function resolveStagedTransitionOverlays(
  options: IndexProjectViewFsOptions,
): Promise<readonly ValidatedTransitionOverlay[]> {
  const { stdout } = await options.exec("git", [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=AM",
    "-z",
    "--",
    TRANSITION_RECORD_NAMESPACE,
  ], { cwd: options.cwd });
  const recordPaths = stdout.split("\0").filter((path) => TRANSITION_RECORD_PATH_RE.test(path));
  const overlays = (await Promise.all(recordPaths.map(async (path) => {
    const { stdout: content } = await options.exec("git", ["show", `:${path}`], { cwd: options.cwd });
    const record = parseTransitionRecord(content);
    if (record === null || path !== resolveTransitionRecordRelativePath(record.origin)) {
      return null;
    }
    if (await readHeadTransitionRecord(options, path) !== null) return null;
    if (record.kind === "decompose") {
      return createValidatedTransitionOverlay({ origin: record.origin, sourceBranch: `plan/${record.origin}` });
    }
    const { stdout: paths } = await options.exec("git", [
      "ls-tree", "-r", "--name-only", "-z", "HEAD", "--", ".arc/active", ".arc/backlog",
    ], { cwd: options.cwd });
    const metaPaths = paths.split("\0").filter((candidate) =>
      posix.basename(candidate) === `meta-${record.origin}.md`);
    if (metaPaths.length !== 1 || metaPaths[0] === undefined) return null;
    const { stdout: metaContent } = await options.exec(
      "git",
      ["show", `HEAD:${metaPaths[0]}`],
      { cwd: options.cwd },
    );
    const sourceBranch = parseMetaRecord(metaContent).branch;
    return sourceBranch === null
      ? null
      : createValidatedTransitionOverlay({ origin: record.origin, sourceBranch });
  }))).filter((overlay): overlay is ValidatedTransitionOverlay => overlay !== null);
  return overlays;
}

/**
 * Render the project readiness view (structured) from staged tree inputs and
 * local refs. This is the shared index-render primitive: the pre-commit assert
 * and `arc status --project --staged` both compose from it, so their output
 * matches by construction.
 *
 * @param options - Repo root, Git executor, and optional render metadata.
 * @returns The structured readiness view plus source determinacy.
 */
export async function renderRoadmapFromIndexViewResult(
  options: RenderRoadmapFromIndexOptions,
): Promise<RoadmapIndexViewResult> {
  const fs = createIndexProjectViewFs(options);
  const [parkedSlugs, currentBranch, errandContext] = await Promise.all([
    buildLifecycleIndex({ cwd: options.cwd, fs }).then(listParkedSlugs),
    options.currentBranch === undefined
      ? resolveCurrentBranch(options.exec, options.cwd)
      : Promise.resolve(options.currentBranch),
    resolveProjectErrandOracleContext(options.exec),
  ]);
  const input = await resolveProjectReadinessViewInput({
    cwd: options.cwd,
    ...(options.title !== undefined ? { title: options.title } : {}),
    fs,
    localRefs: {
      exec: options.exec,
      acquisitionPolicy: "local",
      ...(options.baseBranch !== undefined ? { baseBranch: options.baseBranch } : {}),
      parkedSlugs,
      ...errandContext,
    },
    ...(currentBranch === null
      ? {}
      : {
          prospective: {
            currentBranch,
          },
        }),
    ...(options.transitionOverlays === undefined ? {} : { transitionOverlays: options.transitionOverlays }),
  });
  const renderedRef = options.renderedRef ?? await resolveProjectReadinessRenderStamp({
    exec: options.exec,
    cwd: options.cwd,
    scope: "tree + local refs",
    liveView: "arc status --project",
  });
  return {
    result: composeProjectReadinessViewResult({ ...input, renderedRef }),
    indeterminate: input.indeterminate,
  };
}

async function resolveCurrentBranch(exec: GitExec, cwd: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    const branch = stdout.trim();
    return branch === "" || branch === "HEAD" ? null : branch;
  } catch {
    return null;
  }
}

/**
 * Render the project readiness view from staged tree inputs and local refs.
 *
 * @param options - Repo root, Git executor, and optional render metadata.
 * @returns Rendered content with a trailing newline, plus determinacy.
 */
export async function renderRoadmapFromIndexResult(
  options: RenderRoadmapFromIndexOptions,
): Promise<RoadmapIndexRenderResult> {
  const { result, indeterminate } = await renderRoadmapFromIndexViewResult(options);
  return {
    content: withTrailingNewline(result.markdown),
    indeterminate,
  };
}

/**
 * Render only the staged-index ROADMAP content.
 *
 * @param options - Repo root, Git executor, and optional render metadata.
 * @returns Rendered content with a trailing newline.
 */
export async function renderRoadmapFromIndex(
  options: RenderRoadmapFromIndexOptions,
): Promise<string> {
  return (await renderRoadmapFromIndexResult(options)).content;
}

function withTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

function repoPath(cwd: string, path: string): string {
  const rel = relative(cwd, path).split(sep).join("/");
  if (rel === "") return ".";
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error(`Path is outside repository root: ${path}`);
  }
  return rel;
}

async function listIndexDirectory(exec: GitExec, cwd: string, dir: string): Promise<ProjectViewDirEntry[]> {
  const { stdout } = await exec("git", ["ls-files", "--stage", "--", dir], { cwd });
  const entries = new Map<string, boolean>();
  for (const line of stdout.split("\n")) {
    const indexedPath = pathFromLsFilesStage(line);
    if (indexedPath === null) continue;
    const rest = relativeIndexPath(dir, indexedPath);
    if (rest === null || rest === "") continue;
    const [name, ...tail] = rest.split("/");
    if (name === undefined || name === "") continue;
    entries.set(name, (entries.get(name) ?? false) || tail.length > 0);
  }
  return [...entries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, directory]) => new IndexDirEntry(name, directory));
}

function pathFromLsFilesStage(line: string): string | null {
  const tab = line.indexOf("\t");
  if (tab === -1) return null;
  return line.slice(tab + 1);
}

function relativeIndexPath(dir: string, path: string): string | null {
  if (dir === ".") return path;
  if (path === dir) return "";
  const prefix = `${dir}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}
