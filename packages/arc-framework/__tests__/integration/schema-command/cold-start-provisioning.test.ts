/** Cold-start provisioning uses scaffold rollback and preserves ignored local output. */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runColdStart } from "../../../src/commands/start.js";
import { runInit } from "../../../src/commands/init.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import { writeEditorDocuments } from "../../../src/lib/schema-command/editor-documents.js";
import type { SpawnWorktreeContext } from "../../../src/lib/git/worktree-scaffold.js";
import { readWorktreeMarkerGeneration } from "../../../src/lib/git/worktree-marker.js";
import { createTempRepo, cleanupTempDir, makeIOContext, makeGitExec, makeGitExecInput,
  loadRecipe, DEFAULT_PROMPTS, getArcTemplatePath, getInternalTemplatePath } from "../../helpers/integration.js";

const directory = resolveArcPath({ kind: "editor-document-root" });
describe("cold-start editor-document provisioning", () => {
  let root: string;
  let ctx: SpawnWorktreeContext;
  beforeEach(async () => {
    root = await createTempRepo("arc-cold-start-documents-");
    await runInit({ cwd: root, io: makeIOContext(root), templateDir: getArcTemplatePath(),
      internalTemplateDir: getInternalTemplatePath(), recipe: await loadRecipe(),
      prompts: { ...DEFAULT_PROMPTS, pm_mode: "arc-in-git" }, identityResult: "test-user" });
    const configPath = join(root, ".arc/system/arc-config.yml");
    await writeFile(configPath, (await readFile(configPath, "utf8")).replace("branch.protection: partial", "branch.protection: full"));
    const exec = makeGitExec(root);
    await exec("git", ["add", "."]);
    await exec("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "initialize fixture"]);
    ctx = { io: { ...createUserIOContext(), exec, execInput: makeGitExecInput(root) }, internalTemplateDir: getInternalTemplatePath() };
  });
  afterEach(async () => { await cleanupTempDir(root); });
  const params = () => ({ worktreePath: root, branch: "main", identity: "test-user", name: "editor" });

  it("writes an excluded directory in an existing checkout without an ownership marker", async () => {
    const ignoredBefore = await readFile(join(root, ".gitignore"), "utf8");
    expect(await runColdStart(ctx, params())).toMatchObject({ ok: true, value: { branch: "plan/editor" } });
    expect((await stat(join(root, directory))).isDirectory()).toBe(true);
    expect((await readFile(join(root, ".git/info/exclude"), "utf8")).split(/\r?\n/u)).toContain(`${directory}/`);
    expect(await readWorktreeMarkerGeneration(root)).toEqual({ kind: "absent" });
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(ignoredBefore);
  });

  it("rolls the scaffold back, preserves ignored partial output, and succeeds on retry", async () => {
    ctx.writeEditorDocuments = async (path, exec, fs, registry) => {
      const written = await writeEditorDocuments(path, exec, fs, registry);
      if (!written.ok) return written;
      await mkdir(join(path, directory), { recursive: true });
      await writeFile(join(path, directory, "partial.schema.json"), "partial output\n");
      return { ok: false, target: "documents", detail: "documents denied" };
    };
    expect(await runColdStart(ctx, params())).toEqual({ ok: false, reason: "could not scaffold the work unit: documents denied" });
    await expect(stat(join(root, ".arc/active/meta-editor.md"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await ctx.io.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim()).toBe("main");
    expect((await ctx.io.exec("git", ["for-each-ref", "--format=%(refname)", "refs/heads/plan/editor"])).stdout).toBe("");
    expect(await readFile(join(root, directory, "partial.schema.json"), "utf8")).toBe("partial output\n");
    expect((await ctx.io.exec("git", ["status", "--porcelain"])).stdout).toBe("");
    ctx.writeEditorDocuments = undefined;
    expect(await runColdStart(ctx, params())).toMatchObject({ ok: true });
    await expect(stat(join(root, directory, "partial.schema.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await stat(join(root, directory))).isDirectory()).toBe(true);
  });
});
