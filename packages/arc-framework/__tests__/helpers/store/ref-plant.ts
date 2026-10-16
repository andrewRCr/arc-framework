/** Raw-Git fixtures for state trees, refs, and deliberately missing objects. */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveGitCommonDir } from "../../../src/lib/git/exec.js";
import { createExecaRawGitExec } from "../../../src/lib/git/process-executor.js";
import { createTempRepoCore, removeGitBackedDirs } from "../temp-repo.js";
import { addBareRemote, makeGitExec, makeGitExecInput } from "../integration.js";

export type RefFormat = "files" | "reftable";
export type PlantTreeEntry = { path: string } & (
  | { content: string | Uint8Array; mode?: "100644" | "100755" | "120000" }
  | { oid: string; mode: "100644" | "100755" | "120000" | "160000" | "040000" }
);
export interface PlantedRef { tip: string; tree: string; blobs: Map<string, string> }

export async function createRefTestRepository(format: RefFormat = "files", objectFormat?: "sha1" | "sha256") {
  const root = await createTempRepoCore({ prefix: "arc-ref-store-", refFormat: format, objectFormat });
  const paths = [root];
  try {
    const exec = makeGitExec(root);
    await exec("git", ["commit", "--allow-empty", "-m", "Code seed"]);
    const remote = await addBareRemote(root, { callerOwnsCleanup: true, objectFormat });
    paths.push(remote);
    await exec("git", ["config", "remote.origin.arc-state", "push"]);
    return { root, remote, exec, execInput: makeGitExecInput(root),
      cleanup: () => removeGitBackedDirs(paths) };
  } catch (error) {
    await removeGitBackedDirs(paths);
    throw error;
  }
}

interface TreeNode {
  files: Map<string, { mode: string; oid: string }>;
  children: Map<string, TreeNode>;
}

export async function plantRef(root: string, ref: string, entries: readonly PlantTreeEntry[],
  options: { parents?: readonly string[]; message?: string; allowMissingObjects?: boolean } = {}): Promise<PlantedRef> {
  const exec = makeGitExec(root);
  const input = makeGitExecInput(root);
  const raw = createExecaRawGitExec(root);
  const node = (): TreeNode => ({ files: new Map(), children: new Map() });
  const tree = node();
  const blobs = new Map<string, string>();
  for (const entry of entries) {
    const oid = "oid" in entry ? entry.oid : new TextDecoder().decode((await raw(["hash-object", "-w", "--stdin"], {
      input: typeof entry.content === "string" ? Buffer.from(entry.content) : entry.content,
    })).stdout).trim();
    if ("content" in entry) blobs.set(entry.path, oid);
    const parts = entry.path.split("/");
    const name = parts.pop() ?? "";
    let parent = tree;
    for (const part of parts) {
      let child = parent.children.get(part);
      if (!child) { child = node(); parent.children.set(part, child); }
      parent = child;
    }
    parent.files.set(name, { mode: entry.mode ?? "100644", oid });
  }
  async function writeTree(treeNode: TreeNode): Promise<string> {
    const rows = [...treeNode.files].map(([name, { mode, oid }]) => {
      const type = mode === "160000" ? "commit" : mode === "040000" ? "tree" : "blob";
      return `${mode} ${type} ${oid}\t${name}\0`;
    });
    for (const [name, child] of treeNode.children) rows.push(`040000 tree ${await writeTree(child)}\t${name}\0`);
    return (await input(["mktree", "-z", ...(options.allowMissingObjects ? ["--missing"] : [])], rows.join(""))).trim();
  }
  const treeId = await writeTree(tree);
  const tip = (await exec("git", ["commit-tree", treeId,
    ...(options.parents ?? []).flatMap((parent) => ["-p", parent]), "-m", options.message ?? "Plant stored records",
  ])).stdout.trim();
  await exec("git", ["update-ref", "--no-deref", ref, tip]);
  return { tip, tree: treeId, blobs };
}

export async function removeLooseObject(root: string, oid: string): Promise<void> {
  const common = await resolveGitCommonDir(makeGitExec(root), root);
  await rm(join(common, "objects", oid.slice(0, 2), oid.slice(2)));
}

export async function plantMissingRef(root: string, ref: string, oid: string): Promise<void> {
  const exec = makeGitExec(root);
  if ((await exec("git", ["rev-parse", "--show-ref-format"])).stdout !== "files") {
    throw new Error("Plant a real tip first, then use removeLooseObject for a reftable missing tip");
  }
  const path = join(await resolveGitCommonDir(exec, root), ref);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${oid}\n`);
}
