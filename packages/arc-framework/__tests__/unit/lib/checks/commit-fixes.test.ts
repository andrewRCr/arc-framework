/** Hook restaging preserves exact index ownership and the original commit path set. */
import { expect, it } from "vitest";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { commitRestageAllowed, restageCommitFixes } from "../../../../src/lib/checks/commit-fixes.js";
import type { GitExec } from "../../../../src/lib/git/exec.js";

const root = resolve(tmpdir(), "arc-hook-fix-unit"), own = join(root, ".git/worktrees/feature/index");
const base = "a".repeat(40), tree = "b".repeat(40), produced = "c".repeat(40);
const changed = `:100644 100644 ${"d".repeat(40)} ${"e".repeat(40)} M\0src/[a]*.ts\0`;
const added = `:000000 100644 ${"0".repeat(40)} ${"e".repeat(40)} A\0src/[a]*.ts\0`;

it.each([own, `${own}.lock`])("allows restaging into the checkout's %s", async index => {
  const git: GitExec = async () => ({ stdout: dirname(own) });
  await expect(commitRestageAllowed(git, root, index)).resolves.toBe(true);
});

it.each([join(root, ".git/index"), join(dirname(own), "next-index-123.lock")])(
  "excludes a foreign or temporary index %s", async index => {
    const git: GitExec = async () => ({ stdout: dirname(own) });
    await expect(commitRestageAllowed(git, root, index)).resolves.toBe(false);
  });

it.each(["existing", "unborn"])("restages only the original %s commit paths into its exact index", async history => {
  let staged = false;
  const git: GitExec = async (_command, args, options) => {
    if (args[0] === "diff") return { stdout: history === "existing" ? changed : added };
    if (options?.indexFile !== `${own}.lock`) throw new Error("Wrong index ownership");
    if (args[0] === "add") {
      if (!options.clearPathspecEnvironment || args.slice(3).join() !== ":(literal)src/[a]*.ts") {
        throw new Error("Refused staging outside the literal commit path");
      }
      staged = true;
    }
    return { stdout: staged ? produced : tree };
  };
  await expect(restageCommitFixes({ git, gitInput: async () => "f".repeat(40) }, root,
    { ...(history === "existing" ? { base } : {}), tree, rewritten: ["src/[a]*.ts", "src/outside.ts"] }, `${own}.lock`))
    .resolves.toBe(produced);
});

it("refuses unavailable commit paths and can restage after the Git read is repaired", async () => {
  let readable = false;
  const git: GitExec = async (_command, args) => {
    if (args[0] === "diff" && !readable) throw new Error("Unavailable object");
    return { stdout: args[0] === "diff" ? changed : produced };
  };
  const run = () => restageCommitFixes({ git, gitInput: async () => "f".repeat(40) }, root,
    { base, tree, rewritten: ["src/[a]*.ts"] }, own);
  await expect(run()).rejects.toThrow("Could not resolve the commit's paths; retry git commit");
  readable = true;
  await expect(run()).resolves.toBe(produced);
});


it("restages historical conflict rewrites equal to HEAD while excluding unrelated writes", async () => {
  let indexed = tree;
  const git: GitExec = async (_command, args, options) => {
    if (args[0] === "diff") return { stdout: "" };
    if (options?.indexFile !== own) throw new Error("Wrong index ownership");
    if (args[0] === "add") {
      if (args.includes(":(literal)src/outside.ts")) indexed = "0".repeat(40);
      else if (args.includes(":(literal)src/[a]*.ts")) indexed = produced;
    }
    return { stdout: indexed };
  };
  await expect(restageCommitFixes({ git, gitInput: async () => "f".repeat(40) }, root,
    { base, tree, mergePaths: ["src/[a]*.ts"], rewritten: ["src/[a]*.ts", "src/outside.ts"] }, own))
    .resolves.toBe(produced);
});
