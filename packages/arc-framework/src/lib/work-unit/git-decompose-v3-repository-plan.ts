/** Exact Git binding for v3 decomposition repository-plan projection. */

import { relative, sep } from "node:path";

import type { GitExec } from "../git/exec.js";
import {
  composeProjectReadinessViewResult,
  resolveProjectReadinessViewInput,
  type ProjectViewDirEntry,
  type ProjectViewFs,
} from "../status/project-view.js";
import {
  composeV3ExtractionRepositoryPlan,
  composeV3RepositoryPlan,
  type V3RepositoryPlanInput,
  type V3RepositoryPlanResult,
  type V3RepositoryPlanTree,
} from "./decompose-v3-repository-plan.js";
import { decodeV3DecomposeCutMap } from "./decompose-v3-schema.js";
import { createGitV3DecomposePreflight } from "./git-decompose-v3-preflight.js";
import { transitionOverlayCompositionInput } from "./transition-overlay.js";

export interface GitV3RepositoryPlanDependencies {
  cwd: string;
  exec: GitExec;
  readBlob(ref: string, path: string): Promise<Uint8Array | null>;
  readObject(oid: string, objectKind: string): Promise<Uint8Array>;
  cohortTemplate: Uint8Array;
}

export type GitV3RepositoryPlanResult =
  | V3RepositoryPlanResult
  | {
      status: "refused";
      refusal: {
        stage: "git";
        reason: string;
        locus?: string;
      };
    };

interface ListedTreeObject {
  path: string;
  oid: string;
  objectKind: string;
  mode: string;
}

function bindGitCwd(exec: GitExec, cwd: string): GitExec {
  return async (command, args, options) => await exec(command, args, {
    ...options,
    cwd: options?.cwd ?? cwd,
  });
}

function normalizeObjectKind(mode: string, gitKind: string): string {
  if (mode === "120000") return "symlink";
  if (mode === "160000") return "gitlink";
  return gitKind;
}

function parseTreeObjects(stdout: string): ListedTreeObject[] | null {
  const objects: ListedTreeObject[] = [];
  for (const entry of stdout.split("\0").filter(Boolean)) {
    const match = /^(\d{6}) ([^ ]+) ([0-9a-f]{40,64})\t([\s\S]+)$/u.exec(entry);
    if (match === null) return null;
    const [, mode, gitKind, oid, path] = match;
    if (mode === undefined || gitKind === undefined || oid === undefined || path === undefined) return null;
    objects.push({
      path,
      oid,
      objectKind: normalizeObjectKind(mode, gitKind),
      mode,
    });
  }
  return objects;
}

/** Read one exact Git tree into the canonical repository-plan object model. */
export async function readGitV3RepositoryTree(
  dependencies: GitV3RepositoryPlanDependencies,
  oid: string,
): Promise<V3RepositoryPlanTree | null> {
  const { stdout } = await dependencies.exec("git", [
    "ls-tree",
    "--full-tree",
    "-r",
    "-z",
    "--format=%(objectmode) %(objecttype) %(objectname)%x09%(path)",
    oid,
  ], { cwd: dependencies.cwd });
  const listed = parseTreeObjects(stdout);
  if (listed === null) return null;
  const tree: V3RepositoryPlanTree = {};
  for (const object of listed) {
    if (tree[object.path] !== undefined) return null;
    tree[object.path] = {
      kind: "object",
      objectKind: object.objectKind,
      mode: object.mode,
      bytes: await dependencies.readObject(object.oid, object.objectKind),
    };
  }
  return tree;
}

function relativeTreePath(cwd: string, path: string): string | null {
  const candidate = relative(cwd, path).split(sep).join("/");
  return candidate === "" || candidate === "."
    ? ""
    : candidate === ".." || candidate.startsWith("../")
      ? null
      : candidate;
}

class TreeDirEntry implements ProjectViewDirEntry {
  constructor(
    readonly name: string,
    private readonly directory: boolean,
  ) {}

  isDirectory(): boolean {
    return this.directory;
  }
}

/** Project one pinned canonical repository tree through the shared project-view filesystem seam. */
export function createGitV3RepositoryTreeProjectViewFs(
  cwd: string,
  tree: V3RepositoryPlanTree,
): ProjectViewFs {
  const files = new Map<string, string>();
  for (const [path, state] of Object.entries(tree)) {
    if (state.kind === "absent") continue;
    if (state.objectKind !== "blob" || (state.mode !== "100644" && state.mode !== "100755")) continue;
    try {
      files.set(path, new TextDecoder("utf-8", { fatal: true }).decode(state.bytes));
    } catch {
      // Project record loading will classify the missing text projection as unreadable.
    }
  }
  return {
    readdir: (path) => {
      const directory = relativeTreePath(cwd, path);
      if (directory === null) return Promise.reject(new Error("path-outside-repository"));
      const prefix = directory === "" ? "" : `${directory}/`;
      const entries = new Map<string, boolean>();
      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue;
        const remainder = file.slice(prefix.length);
        if (remainder === "") continue;
        const slash = remainder.indexOf("/");
        entries.set(
          slash < 0 ? remainder : remainder.slice(0, slash),
          slash >= 0 || entries.get(remainder) === true,
        );
      }
      return Promise.resolve(
        [...entries.entries()]
          .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
          .map(([name, directoryEntry]) => new TreeDirEntry(name, directoryEntry)),
      );
    },
    readFile: (path) => {
      const relativePath = relativeTreePath(cwd, path);
      const content = relativePath === null ? undefined : files.get(relativePath);
      return content === undefined
        ? Promise.reject(new Error("path-not-found"))
        : Promise.resolve(content);
    },
  };
}

async function exactRef(
  dependencies: GitV3RepositoryPlanDependencies,
  ref: string,
): Promise<string | null> {
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["rev-parse", "--verify", `${ref}^{commit}`],
      { cwd: dependencies.cwd },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function shortRef(
  dependencies: GitV3RepositoryPlanDependencies,
  oid: string,
): Promise<string> {
  const { stdout } = await dependencies.exec(
    "git",
    ["rev-parse", "--short", oid],
    { cwd: dependencies.cwd },
  );
  return stdout.trim() || oid;
}

function gitRefusal(reason: string, locus?: string): GitV3RepositoryPlanResult {
  return {
    status: "refused",
    refusal: {
      stage: "git",
      reason,
      ...(locus === undefined ? {} : { locus }),
    },
  };
}

/**
 * Pin source, merge-base, and result-base commits and compose their immutable plan.
 *
 * @param dependencies - Git object, preflight-blob, and bundled-template boundaries.
 * @param baseBranch - Configured result base branch.
 * @param completedMap - Fully authored closed v3 map.
 * @returns One exact repository plan or a typed read/projection refusal.
 */
async function composeGitRepositoryPlan(
  dependencies: GitV3RepositoryPlanDependencies,
  baseBranch: string,
  completedMap: unknown,
  compose: (input: V3RepositoryPlanInput) => Promise<V3RepositoryPlanResult>,
): Promise<GitV3RepositoryPlanResult> {
  const decoded = decodeV3DecomposeCutMap(completedMap);
  if (decoded.status === "rejected") {
    return {
      status: "refused",
      refusal: { stage: "map", reason: decoded.issue.code, locus: decoded.issue.path },
    };
  }
  const map = decoded.value;
  try {
    const refreshed = await createGitV3DecomposePreflight({
      cwd: dependencies.cwd,
      exec: dependencies.exec,
      readBlob: async (ref, path) => await dependencies.readBlob(ref, path),
    }, baseBranch, map.machine.source.origin);
    if (refreshed.status === "rejected") {
      return gitRefusal(refreshed.reason, "locus" in refreshed ? refreshed.locus : undefined);
    }
    const sourceHead = map.machine.source.head;
    const resultBaseHead = map.machine.resultBase.head;
    const [sourceRef, resultRef, mergeBaseResult] = await Promise.all([
      exactRef(dependencies, map.machine.source.ref),
      exactRef(dependencies, map.machine.resultBase.ref),
      dependencies.exec(
        "git",
        ["merge-base", "--all", sourceHead, resultBaseHead],
        { cwd: dependencies.cwd },
      ),
    ]);
    if (sourceRef !== sourceHead) return gitRefusal("source-ref-moved", map.machine.source.ref);
    if (resultRef !== resultBaseHead) return gitRefusal("result-ref-moved", map.machine.resultBase.ref);
    const mergeBases = mergeBaseResult.stdout.split(/\r?\n/u).filter(Boolean);
    if (mergeBases.length !== 1 || mergeBases[0] === undefined) {
      return gitRefusal(mergeBases.length === 0 ? "missing-merge-base" : "ambiguous-merge-base");
    }
    const [sourceTree, mergeBaseTree, resultBaseTree, renderedRef] = await Promise.all([
      readGitV3RepositoryTree(dependencies, sourceHead),
      readGitV3RepositoryTree(dependencies, mergeBases[0]),
      readGitV3RepositoryTree(dependencies, resultBaseHead),
      shortRef(dependencies, resultBaseHead),
    ]);
    if (sourceTree === null || mergeBaseTree === null || resultBaseTree === null) {
      return gitRefusal("tree-read-failed");
    }
    const result = await compose({
      completedMap: map,
      currentPreflight: refreshed.preflight,
      sourceTree,
      mergeBaseTree,
      resultBaseTree,
      mergeBases,
      cohortTemplate: dependencies.cohortTemplate,
      renderRoadmap: async (projectedTree, overlay) => {
        const readiness = await resolveProjectReadinessViewInput({
          cwd: dependencies.cwd,
          fs: createGitV3RepositoryTreeProjectViewFs(dependencies.cwd, projectedTree),
          localRefs: {
            exec: bindGitCwd(dependencies.exec, dependencies.cwd),
            acquisitionPolicy: "local",
            baseBranch,
          },
          transitionOverlays: overlay === undefined
            ? []
            : [transitionOverlayCompositionInput(overlay)],
        });
        const markdown = composeProjectReadinessViewResult({
          ...readiness,
          renderedRef: {
            ref: renderedRef,
            scope: "tree + local refs",
            liveView: "arc status --project",
          },
        }).markdown;
        return new TextEncoder().encode(markdown.endsWith("\n") ? markdown : `${markdown}\n`);
      },
    });
    const [sourceAfter, resultAfter] = await Promise.all([
      exactRef(dependencies, map.machine.source.ref),
      exactRef(dependencies, map.machine.resultBase.ref),
    ]);
    if (sourceAfter !== sourceHead) return gitRefusal("source-ref-moved", map.machine.source.ref);
    if (resultAfter !== resultBaseHead) return gitRefusal("result-ref-moved", map.machine.resultBase.ref);
    return result;
  } catch (error) {
    return gitRefusal(
      "repository-plan-failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Pin exact Git inputs and compose a retirement result.
 *
 * @param dependencies - Git object, preflight-blob, and bundled-template boundaries.
 * @param baseBranch - Configured result base branch.
 * @param completedMap - Fully authored closed v3 retirement map.
 * @returns One exact repository plan or a typed read/projection refusal.
 */
export async function composeGitV3RepositoryPlan(
  dependencies: GitV3RepositoryPlanDependencies,
  baseBranch: string,
  completedMap: unknown,
): Promise<GitV3RepositoryPlanResult> {
  return await composeGitRepositoryPlan(
    dependencies,
    baseBranch,
    completedMap,
    composeV3RepositoryPlan,
  );
}

/**
 * Pin exact Git inputs and compose an additive extraction result.
 *
 * @param dependencies - Git object, preflight-blob, and bundled-template boundaries.
 * @param baseBranch - Configured result base branch.
 * @param completedMap - Fully authored closed v3 extraction map.
 * @returns One exact additive repository plan or a typed read/projection refusal.
 */
export async function composeGitV3ExtractionRepositoryPlan(
  dependencies: GitV3RepositoryPlanDependencies,
  baseBranch: string,
  completedMap: unknown,
): Promise<GitV3RepositoryPlanResult> {
  return await composeGitRepositoryPlan(
    dependencies,
    baseBranch,
    completedMap,
    composeV3ExtractionRepositoryPlan,
  );
}
