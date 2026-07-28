/** Git adapter for complete three-tree v3 retirement-delta planning. */

import type { GitExec } from "../git/exec.js";
import {
  planV3RetirementDelta,
  type V3RetirementDeltaInput,
  type V3RetirementDeltaResult,
  type V3RetirementTree,
} from "./decompose-v3-retirement-delta.js";

export interface GitV3RetirementDeltaDependencies {
  cwd: string;
  exec: GitExec;
  readObject(oid: string, objectKind: string): Promise<Uint8Array>;
}

export type GitV3RetirementDeltaInput = Omit<
  V3RetirementDeltaInput,
  "mergeBases" | "baseTree" | "sourceTree" | "resultTree"
> & {
  sourceHead: string;
  resultBaseHead: string;
};

interface ListedTreeObject {
  path: string;
  oid: string;
  objectKind: string;
  mode: string;
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

async function readTree(
  deps: GitV3RetirementDeltaDependencies,
  oid: string,
): Promise<V3RetirementTree | null> {
  const { stdout } = await deps.exec("git", [
    "ls-tree",
    "--full-tree",
    "-r",
    "-t",
    "-z",
    "--format=%(objectmode) %(objecttype) %(objectname)%x09%(path)",
    oid,
  ], { cwd: deps.cwd });
  const listed = parseTreeObjects(stdout);
  if (listed === null) return null;
  const tree: V3RetirementTree = {};
  for (const object of listed) {
    if (tree[object.path] !== undefined) return null;
    tree[object.path] = {
      kind: "object",
      objectKind: object.objectKind,
      mode: object.mode,
      bytes: await deps.readObject(object.oid, object.objectKind),
    };
  }
  return tree;
}

function omitPureTreePaths(trees: V3RetirementTree[]): V3RetirementTree[] {
  const paths = new Set(trees.flatMap((tree) => Object.keys(tree)));
  const pureTreePaths = new Set<string>();
  for (const path of paths) {
    const present = trees.flatMap((tree) => tree[path] === undefined ? [] : [tree[path]]);
    if (present.length > 0 && present.every((state) => state.objectKind === "tree")) {
      pureTreePaths.add(path);
    }
  }
  return trees.map((tree) => Object.fromEntries(
    Object.entries(tree).filter(([path]) => !pureTreePaths.has(path)),
  ));
}

/**
 * Resolve every merge base, read the three exact object trees, and invoke the pure planner.
 *
 * @param deps - Binary-safe Git object and command seams.
 * @param input - Pinned source/result commits plus retirement identities.
 * @returns A complete retirement plan or a closed read/topology refusal.
 */
export async function planGitV3RetirementDelta(
  deps: GitV3RetirementDeltaDependencies,
  input: GitV3RetirementDeltaInput,
): Promise<V3RetirementDeltaResult> {
  try {
    const { stdout } = await deps.exec(
      "git",
      ["merge-base", "--all", input.sourceHead, input.resultBaseHead],
      { cwd: deps.cwd },
    );
    const mergeBases = stdout.split(/\r?\n/u).filter(Boolean);
    if (mergeBases.length !== 1) {
      return planV3RetirementDelta({
        ...input,
        mergeBases,
        baseTree: {},
        sourceTree: {},
        resultTree: {},
      });
    }
    const mergeBase = mergeBases[0];
    if (mergeBase === undefined) {
      return { status: "refused", refusal: { code: "missing-merge-base" } };
    }
    const trees = await Promise.all([
      readTree(deps, mergeBase),
      readTree(deps, input.sourceHead),
      readTree(deps, input.resultBaseHead),
    ]);
    const [baseTree, sourceTree, resultTree] = trees;
    if (baseTree === null || sourceTree === null || resultTree === null) {
      return { status: "refused", refusal: { code: "git-read-failed" } };
    }
    const [filteredBase, filteredSource, filteredResult] = omitPureTreePaths([
      baseTree,
      sourceTree,
      resultTree,
    ]);
    if (filteredBase === undefined || filteredSource === undefined || filteredResult === undefined) {
      return { status: "refused", refusal: { code: "git-read-failed" } };
    }
    return planV3RetirementDelta({
      ...input,
      mergeBases,
      baseTree: filteredBase,
      sourceTree: filteredSource,
      resultTree: filteredResult,
    });
  } catch {
    return { status: "refused", refusal: { code: "git-read-failed" } };
  }
}
