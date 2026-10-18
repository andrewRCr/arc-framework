/** Match supplied paths independently of the checkout's index and objects. */
import type { RawGitExec } from "../git/exec.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inputPathspecs } from "./matching.js";

/** A matched path list, or an unavailable read with its original reason. */
export type PathListSelection = { status: "ok"; paths: readonly string[] }
  | { status: "unavailable"; reason: string };

/** Injectable Git and temporary-directory creation for explicit matching. */
export interface PathListMatchIO {
  git: RawGitExec;
  createDirectory?(prefix: string): Promise<string>;
}

/** Filter supplied repository paths with the declaration's Git pathspec semantics. */
export async function matchPathList(io: PathListMatchIO, root: string, paths: readonly string[],
  inputs: readonly string[]): Promise<PathListSelection> {
  if (paths.length === 0 || inputs.length === 0) return { status: "ok", paths: [] };
  try {
    const directory = await (io.createDirectory ?? mkdtemp)(join(tmpdir(), "arc-check-paths-"));
    try {
      const options = { cwd: root, indexFile: join(directory, "index"), removeEnvironment: [
        "GIT_LITERAL_PATHSPECS", "GIT_GLOB_PATHSPECS", "GIT_NOGLOB_PATHSPECS", "GIT_ICASE_PATHSPECS",
      ] };
      const blob = Buffer.from((await io.git(["hash-object", "--stdin"], { ...options, input: Buffer.alloc(0) })).stdout)
        .toString("utf8").trim();
      if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(blob)) throw new Error("Git returned an invalid empty-blob identity.");
      const entries = [...new Set(paths)].map(path => `100644 ${blob}\t${path}\0`).join("");
      await io.git(["update-index", "--add", "-z", "--index-info"], { ...options, input: Buffer.from(entries) });
      const result = await io.git(["ls-files", "-z", "--", ...inputPathspecs(inputs)], options);
      const output = Buffer.from(result.stdout).toString("utf8");
      return { status: "ok", paths: output.split("\0").filter(Boolean) };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  } catch (error) {
    return { status: "unavailable", reason: String(error) };
  }
}
