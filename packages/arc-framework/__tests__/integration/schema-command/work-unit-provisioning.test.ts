/** Real-Git work-unit spawning and writer-failure rollback. */
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  nodeReconcileWorkUnitWorktreeFs, reconcileWorkUnitWorktree,
  type ReconcileWorkUnitWorktreeContext,
} from "../../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import { EditorDocumentsWriteError } from "../../../src/lib/schema-command/editor-documents.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../../helpers/integration.js";

const directory = resolveArcPath({ kind: "editor-document-root" });
describe("work-unit editor-document provisioning", () => {
  let root: string;
  let linked: string;
  beforeEach(async () => {
    root = await createTempRepo("arc-work-unit-documents-");
    linked = `${root}-editor`;
    const exec = makeGitExec(root);
    await writeFile(join(root, ".gitignore"), "# existing rules\n");
    await exec("git", ["add", ".gitignore"]);
    await exec("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "seed"]);
  });
  afterEach(async () => { await Promise.all([cleanupTempDir(linked), cleanupTempDir(root)]); });

  function spawn(ctx: ReconcileWorkUnitWorktreeContext) {
    return reconcileWorkUnitWorktree(ctx, { mutation: "spawn", branch: "plan/editor", base: "main",
      locationTemplate: `${root}-{name}`, repo: "repo", wuName: "editor", spawningIdentity: "test-user",
      primaryWorktreePath: root });
  }

  it("provisions an ignored document directory in the spawned checkout", async () => {
    const exec = makeGitExec(root);
    await spawn({ exec, chdir: () => undefined, fs: nodeReconcileWorkUnitWorktreeFs });
    expect((await stat(join(linked, directory))).isDirectory()).toBe(true);
    expect((await readFile(join(root, ".git/info/exclude"), "utf8")).split(/\r?\n/u)).toContain(`${directory}/`);
    expect(await readFile(join(linked, ".gitignore"), "utf8")).toBe("# existing rules\n");
    expect((await exec("git", ["status", "--porcelain"], { cwd: linked })).stdout).toBe("");
  });

  it("removes the worktree and newly-created branch when the writer fails", async () => {
    const exec = makeGitExec(root);
    await expect(spawn({ exec, chdir: () => undefined, fs: nodeReconcileWorkUnitWorktreeFs,
      writeEditorDocuments: async (path) => ({ ok: false, target: "documents", path: join(path, directory), detail: "documents denied" }),
    })).rejects.toBeInstanceOf(EditorDocumentsWriteError);
    await expect(stat(linked)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await exec("git", ["for-each-ref", "--format=%(refname)", "refs/heads/plan/editor"])).stdout).toBe("");
    expect((await exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(linked);
  });
});
