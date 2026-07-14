/**
 * Coherent, slug-scoped project-view filesystem snapshots backed by a pinned Git ref.
 *
 * Mutating lifecycle dispatch must resolve against the same tree it will cut a
 * branch from. This adapter locates and reads one slug's lifecycle metas up
 * front, then exposes that immutable snapshot through the normal project-view
 * filesystem seam. Any tree or matching-blob read failure rejects the snapshot
 * so callers cannot misclassify an unreadable base as an absent work unit.
 *
 * @module
 */

import { isAbsolute, relative, sep } from "node:path";

import type { GitExec } from "../git/exec.js";

import type { ProjectViewDirEntry, ProjectViewFs } from "./project-view.js";

const LIFECYCLE_ROOTS = [
  ".arc/active",
  ".arc/backlog/planned",
  ".arc/backlog/provisional",
  ".arc/completed",
] as const;
const META_PATH_RE = /(?:^|\/)meta-[^/]+\.md$/u;

/** Inputs for {@link createProjectViewRefSnapshot}. */
export interface ProjectViewRefSnapshotOptions {
  /** Repository root used to normalize project-view filesystem paths. */
  cwd: string;
  /** Git executor bound to the repository. */
  exec: GitExec;
  /** Commit or ref whose lifecycle tree is authoritative. */
  ref: string;
  /** Work-unit slug to select from the lifecycle tree. */
  slug: string;
}

/** A coherent slug snapshot, or a fail-closed diagnostic. */
export type ProjectViewRefSnapshot =
  | { ok: true; fs: ProjectViewFs }
  | { ok: false; reason: string };

class SnapshotDirEntry implements ProjectViewDirEntry {
  constructor(
    readonly name: string,
    private readonly directory: boolean,
  ) {}

  isDirectory(): boolean {
    return this.directory;
  }
}

/**
 * Read one slug's lifecycle metas from a Git ref and expose them as a project-view filesystem.
 *
 * @param options - Repository root, Git executor, pinned source ref, and target slug.
 * @returns A coherent filesystem snapshot, or a diagnostic when any source read fails.
 */
export async function createProjectViewRefSnapshot(
  options: ProjectViewRefSnapshotOptions,
): Promise<ProjectViewRefSnapshot> {
  let stdout: string;
  try {
    ({ stdout } = await options.exec(
      "git",
      ["ls-tree", "--full-tree", "-r", "--name-only", options.ref, "--", ...LIFECYCLE_ROOTS],
      { cwd: options.cwd },
    ));
  } catch (err) {
    return {
      ok: false,
      reason: `could not enumerate lifecycle metadata at \`${options.ref}\`: ${errorMessage(err)}`,
    };
  }

  const paths = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((path) =>
      META_PATH_RE.test(path)
      && filename(path) === `meta-${options.slug}.md`
      && LIFECYCLE_ROOTS.some((root) => isWithin(root, path)),
    );
  const contentByPath = new Map<string, string>();
  for (const path of paths) {
    try {
      const result = await options.exec("git", ["show", `${options.ref}:${path}`], { cwd: options.cwd });
      contentByPath.set(path, result.stdout);
    } catch (err) {
      return {
        ok: false,
        reason: `could not read lifecycle meta \`${path}\` at \`${options.ref}\`: ${errorMessage(err)}`,
      };
    }
  }

  return {
    ok: true,
    fs: {
      readdir: (path) => Promise.resolve().then(
        () => listDirectory(contentByPath.keys(), repoPath(options.cwd, path)),
      ),
      readFile: (path) => Promise.resolve().then(() => {
        const relativePath = repoPath(options.cwd, path);
        const content = contentByPath.get(relativePath);
        if (content === undefined) throw new Error(`Path is absent from ref snapshot: ${relativePath}`);
        return content;
      }),
    },
  };
}

function listDirectory(paths: Iterable<string>, dir: string): ProjectViewDirEntry[] {
  const entries = new Map<string, boolean>();
  for (const path of paths) {
    const rest = relativePath(dir, path);
    if (rest === null || rest === "") continue;
    const [name, ...tail] = rest.split("/");
    if (name === undefined || name === "") continue;
    entries.set(name, (entries.get(name) ?? false) || tail.length > 0);
  }
  return [...entries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, directory]) => new SnapshotDirEntry(name, directory));
}

function repoPath(cwd: string, path: string): string {
  const normalized = relative(cwd, path).split(sep).join("/");
  if (normalized === "") return ".";
  if (normalized === ".." || normalized.startsWith("../") || isAbsolute(normalized)) {
    throw new Error(`Path is outside repository root: ${path}`);
  }
  return normalized;
}

function relativePath(dir: string, path: string): string | null {
  if (dir === ".") return path;
  if (path === dir) return "";
  const prefix = `${dir}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

function isWithin(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function filename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
