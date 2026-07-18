/**
 * Semantic artifact-group resolver for `arc view`.
 *
 * The viewer asks for kinds; this module owns every path derivation and
 * composes the active, cohort, session-notes, and user-surface resolvers.
 */

import { access, readFile, readdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";

import {
  resolveTaskListPath,
  runActiveSessionInitStatus,
  type ActiveSessionInitResult,
  type MetaFileCandidate,
} from "../commands/active.js";
import {
  VIEW_KINDS,
  type ResolveViewArtifactOptions,
  type ViewArtifactResult,
  type ViewKind,
} from "../commands/view.js";
import { gitConfigGet, type GitExec } from "./git/index.js";
import { gitExec } from "./io-context.js";
import { resolveActiveCohortDocPath } from "./session-init/cohort-doc.js";
import {
  resolveWorkUnitSessionNotesPath,
  type SessionNotesPathResult,
} from "./handoff/session-notes-path.js";
import {
  resolveUserSurfaceResolver,
  type UserSurfaceResolver,
} from "./user-surfaces.js";

interface UserSurfacePaths {
  identityGlobalPath: (...segments: readonly string[]) => string;
}

export interface ViewArtifactDependencies {
  resolveActive: (options: {
    cwd: string;
    identity: string | null;
  }) => Promise<ActiveSessionInitResult>;
  resolveCurrentBranch: (cwd: string) => Promise<string | null>;
  resolveCohort: (options: { cwd: string; activeMetaPath: string }) => Promise<string | null>;
  resolveSessionNotes: (options: {
    cwd: string;
    identity: string;
    workUnitName: string;
  }) => Promise<SessionNotesPathResult>;
  resolveUserSurfaces: (options: {
    cwd: string;
    identity: string;
  }) => Promise<UserSurfacePaths>;
  pathExists: (path: string) => Promise<boolean>;
}

interface ResolvedWorkUnit {
  metaPath: string;
  taskListPath: string | null;
  name: string;
}

/** Resolve one view kind through the shared artifact-group oracle. */
export async function resolveViewArtifact(
  options: ResolveViewArtifactOptions,
  dependencies: ViewArtifactDependencies = createViewArtifactDependencies(gitExec),
): Promise<ViewArtifactResult> {
  try {
    return await resolveViewArtifactUnchecked(options, dependencies);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return error(options.kind, `Unable to resolve ${options.kind}: ${message}`);
  }
}

async function resolveViewArtifactUnchecked(
  options: ResolveViewArtifactOptions,
  dependencies: ViewArtifactDependencies,
): Promise<ViewArtifactResult> {
  if (!isViewKind(options.kind)) return error(options.kind, `Unknown view kind "${options.kind}".`);
  const kind = options.kind;

  if (kind === "inbox" && options.project) {
    return presentOrAbsent(kind, join(options.cwd, ".arc", "backlog", "ATOMIC-INBOX.md"), dependencies);
  }

  if (kind === "working-memory" || kind === "inbox") {
    if (options.identity === null) {
      return error(kind, "No ARC identity is configured for this identity-scoped artifact.");
    }
    const surfaces = await dependencies.resolveUserSurfaces({
      cwd: options.cwd,
      identity: options.identity,
    });
    const filename = kind === "working-memory" ? "WORKING-MEMORY.md" : "USER-INBOX.md";
    return presentOrAbsent(kind, surfaces.identityGlobalPath(filename), dependencies);
  }

  const workUnit = await resolveWorkUnit(options, dependencies);
  if (workUnit === null) {
    return error(kind, "No active work unit matches the current branch.");
  }

  switch (kind) {
    case "meta":
      return presentOrAbsent(kind, absolute(options.cwd, workUnit.metaPath), dependencies);
    case "tasks":
      return workUnit.taskListPath === null
        ? { status: "absent", kind }
        : presentOrAbsent(kind, absolute(options.cwd, workUnit.taskListPath), dependencies);
    case "spec":
    case "draft":
    case "notes":
      return presentOrAbsent(
        kind,
        join(options.cwd, dirname(workUnit.metaPath), `${kind}-${workUnit.name}.md`),
        dependencies,
      );
    case "cohort": {
      const path = await dependencies.resolveCohort({
        cwd: options.cwd,
        activeMetaPath: workUnit.metaPath,
      });
      return path === null
        ? { status: "absent", kind }
        : presentOrAbsent(kind, absolute(options.cwd, path), dependencies);
    }
    case "session-notes": {
      if (options.identity === null) {
        return error(kind, "No ARC identity is configured for this identity-scoped artifact.");
      }
      const result = await dependencies.resolveSessionNotes({
        cwd: options.cwd,
        identity: options.identity,
        workUnitName: workUnit.name,
      });
      if (result.status === "error") return { status: "error", kind, message: result.message };
      if (result.status === "absent") return { status: "absent", kind };
      return presentOrAbsent(kind, result.path, dependencies);
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

async function resolveWorkUnit(
  options: ResolveViewArtifactOptions,
  dependencies: ViewArtifactDependencies,
): Promise<ResolvedWorkUnit | null> {
  const result = await dependencies.resolveActive({ cwd: options.cwd, identity: options.identity });
  let candidate: MetaFileCandidate | null = null;
  let taskListPath: string | null = null;

  if (result.resolution === "single" && result.path !== null) {
    candidate = {
      path: result.path,
      filename: basename(result.path),
      branch: null,
      state: null,
      nextTask: null,
      taskList: null,
      nextAction: null,
      currentWorkflow: null,
    };
    taskListPath = result.taskListPath ?? null;
  } else if (result.resolution === "multiple") {
    const branch = await dependencies.resolveCurrentBranch(options.cwd);
    const matches = result.candidates.filter((entry) => entry.branch !== null && entry.branch === branch);
    if (matches.length !== 1) return null;
    candidate = matches[0] ?? null;
    if (candidate !== null) taskListPath = resolveTaskListPath(candidate.path, candidate.taskList);
  }

  if (candidate === null) return null;
  const name = /^meta-(.+)\.md$/u.exec(basename(candidate.path))?.[1];
  if (name === undefined) return null;
  return { metaPath: candidate.path, taskListPath, name };
}

function isViewKind(kind: string): kind is ViewKind {
  return (VIEW_KINDS as readonly string[]).includes(kind);
}

async function presentOrAbsent(
  kind: ViewKind,
  path: string,
  dependencies: ViewArtifactDependencies,
): Promise<ViewArtifactResult> {
  return await dependencies.pathExists(path)
    ? { status: "resolved", kind, path }
    : { status: "absent", kind };
}

function error(kind: string, prefix: string): ViewArtifactResult {
  return {
    status: "error",
    kind,
    message: `${prefix} Valid kinds: ${VIEW_KINDS.join(", ")}.`,
  };
}

function absolute(cwd: string, path: string): string {
  return isAbsolute(path) ? path : join(cwd, path);
}

function createViewArtifactDependencies(exec: GitExec): ViewArtifactDependencies {
  return {
    resolveActive: async ({ cwd, identity }) => runActiveSessionInitStatus({
      cwd,
      identity,
      role: await gitConfigGet(exec, "arc.role"),
      exec,
    }),
    resolveCurrentBranch: async (cwd) => {
      try {
        const result = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
        const branch = result.stdout.trim();
        return branch === "" || branch === "HEAD" ? null : branch;
      } catch {
        return null;
      }
    },
    resolveCohort: ({ cwd, activeMetaPath }) => resolveActiveCohortDocPath({
      cwd,
      activeMetaPath,
      fs: {
        readFile: (path) => readFile(path, "utf8"),
        pathExists,
      },
    }),
    resolveSessionNotes: ({ cwd, identity, workUnitName }) =>
      resolveWorkUnitSessionNotesPath(cwd, identity, workUnitName, { readDir: readUserDirStrict }),
    resolveUserSurfaces: ({ cwd, identity }): Promise<UserSurfaceResolver> =>
      resolveUserSurfaceResolver({ cwd, identity, exec }),
    pathExists,
  };
}

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

async function readUserDirStrict(dirPath: string): Promise<Array<{ name: string; size: number }>> {
  const entries: Array<{ name: string; size: number }> = [];

  async function walk(path: string, prefix: string): Promise<void> {
    const children = await readdir(path, { withFileTypes: true });
    for (const child of children) {
      const name = prefix === "" ? child.name : `${prefix}/${child.name}`;
      if (child.isDirectory()) {
        if (!child.name.startsWith(".")) await walk(join(path, child.name), name);
      } else if (child.isFile()) {
        entries.push({ name, size: 0 });
      }
    }
  }

  await walk(dirPath, "");
  return entries;
}
