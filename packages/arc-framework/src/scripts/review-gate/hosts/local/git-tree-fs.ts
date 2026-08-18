/** Immutable in-repository filesystem projection for one exact Git tree. */

import { isAbsolute, relative, resolve, sep } from "node:path";

import type { GitExec } from "../../../../lib/git/exec.js";
import type { ProjectViewFs } from "../../../../lib/status/project-view.js";
import type {
  ReviewReadinessDirEntry,
  ReviewReadinessFs,
  ReviewReadinessStat,
} from "../../readiness.js";

function repositoryPath(root: string, path: string): string {
  const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
  const projected = relative(resolve(root), absolute).split(sep).join("/");
  if (projected === "") return "";
  if (projected === ".." || projected.startsWith("../")) {
    throw new Error("Git-tree read escaped the repository root.");
  }
  return projected;
}

function treeish(revision: string, path: string): string {
  return path === "" ? revision : `${revision}:${path}`;
}

function statFor(type: string): ReviewReadinessStat {
  return {
    isFile: () => type === "blob",
    isDirectory: () => type === "tree",
  };
}

/** Project one immutable repository version through the filesystem interfaces its readers already consume. */
export function createGitTreeReadFs(input: {
  cwd: string;
  revision: string;
  exec: GitExec;
}): ReviewReadinessFs & ProjectViewFs {
  const options = { cwd: input.cwd, objectAccess: "local-only" as const };
  return {
    stat: async (path) => {
      const projected = repositoryPath(input.cwd, path);
      if (projected === "") return statFor("tree");
      try {
        const type = (await input.exec("git", ["cat-file", "-t", treeish(input.revision, projected)], options))
          .stdout.trim();
        return statFor(type);
      } catch (error) {
        throw Object.assign(new Error(`Git-tree path is unavailable: ${projected}`, { cause: error }), {
          code: "ENOENT",
        });
      }
    },
    readFile: async (path) => {
      const projected = repositoryPath(input.cwd, path);
      return (await input.exec("git", ["show", treeish(input.revision, projected)], options)).stdout;
    },
    readdir: async (path) => {
      const projected = repositoryPath(input.cwd, path);
      const output = (await input.exec("git", ["ls-tree", "-z", treeish(input.revision, projected)], options)).stdout;
      return output.split("\0").filter((entry) => entry !== "").map((entry) => {
        const match = /^[0-7]{6} (blob|tree|commit) [0-9a-f]+\t(.+)$/u.exec(entry);
        if (match?.[1] === undefined || match[2] === undefined) {
          throw new Error("Git returned a malformed tree entry.");
        }
        const type = match[1];
        return {
          name: match[2],
          isDirectory: () => type === "tree",
        } satisfies ReviewReadinessDirEntry;
      });
    },
  };
}
