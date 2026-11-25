/** Native manager windows preserve unstaged edits around commit selection. */
import { afterEach, expect, inject, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execa } from "execa";
import { join } from "node:path";
import { commitThroughManager, createHookManagerRepository, executionReceipt } from "../fixtures/checks/hook-manager.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { git } from "./helpers.js";
const roots: string[] = [];
afterEach(async () => { await removeGitBackedDirs(roots.splice(0)); });

it.each(["husky", "core.hooksPath"] as const)("refuses and repairs partially staged inputs through %s", async manager => {
  const root = await createHookManagerRepository(manager, inject("arcHookManagerTools"));
  roots.push(root);
  const path = join(root, "src/0.txt");
  await writeFile(path, "staged\n");
  await git(root, ["add", "src/0.txt"]);
  await writeFile(path, "staged\nunstaged\n");
  const head = await git(root, ["rev-parse", "HEAD"]);
  const refused = await commitThroughManager(root);
  expect(refused.exitCode, refused.output).toBe(1);
  expect(refused.output).toContain("src/0.txt");
  expect(refused.output).toContain("git stash push --keep-index");
  expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
  expect(await readFile(path, "utf8")).toBe("staged\nunstaged\n");
  expect(await executionReceipt(root)).toBe("");
  await git(root, ["add", "src/0.txt"]);
  const repaired = await commitThroughManager(root);
  expect(repaired.exitCode, repaired.output).toBe(0);
  expect(await git(root, ["show", "HEAD:src/0.txt"])).toBe("staged\nunstaged");
  expect(await executionReceipt(root)).toBe("executed\n");
}, 60_000);

it("commits only the staged content after setting the unstaged changes aside, then reapplies them all", async () => {
  const root = await createHookManagerRepository("core.hooksPath", inject("arcHookManagerTools"));
  roots.push(root);
  const sibling = join(root, "notes/0.txt");
  await mkdir(join(root, "notes"));
  await writeFile(sibling, "base\n");
  await git(root, ["add", "notes/0.txt"]);
  await git(root, ["commit", "-q", "-m", "chore: add notes"]);
  await git(root, ["config", "apply.whitespace", "fix"]);
  await writeFile(sibling, "base\nunstaged sibling with trailing spaces  \n");
  const path = join(root, "src/0.txt");
  await writeFile(path, "staged\n");
  await git(root, ["add", "src/0.txt"]);
  await writeFile(path, "staged\nunstaged\n");
  const refused = await commitThroughManager(root);
  expect(refused.exitCode, refused.output).toBe(1);
  await git(root, ["stash", "push", "--keep-index"]);
  const committed = await commitThroughManager(root);
  expect(committed.exitCode, committed.output).toBe(0);
  const top = (await execa("git", ["rev-parse", "--show-toplevel"], { cwd: join(root, "src") })).stdout;
  const unstaged = await execa("git", ["diff-tree", "-p", "--binary", "refs/stash^2", "refs/stash"], { cwd: top, stripFinalNewline: false });
  await execa("git", ["apply", "--3way", "--whitespace=nowarn"], { cwd: top, input: unstaged.stdout });
  await git(top, ["reset", "-q"]);
  await git(top, ["stash", "drop"]);
  expect(await git(root, ["show", "HEAD:src/0.txt"])).toBe("staged");
  expect(await readFile(path, "utf8")).toBe("staged\nunstaged\n");
  expect(await readFile(sibling, "utf8")).toBe("base\nunstaged sibling with trailing spaces  \n");
  expect(await git(root, ["diff", "--cached", "--name-only"])).toBe("");
  expect(await git(root, ["stash", "list"])).toBe("");
  expect(await executionReceipt(root)).toBe("executed\n");
}, 60_000);

it("keeps commit-message validation active when a person skips the declared check", async () => {
  const root = await createHookManagerRepository("core.hooksPath", inject("arcHookManagerTools"));
  roots.push(root);
  await writeFile(join(root, "src/0.txt"), "changed\n");
  await git(root, ["add", "src/0.txt"]);
  const head = await git(root, ["rev-parse", "HEAD"]);
  const result = await commitThroughManager(root, "invalid message", { ARC_SKIP: "content,unknown" });
  expect(result.exitCode, result.output).toBe(1);
  expect(result.output).toContain("content: skipped");
  expect(result.output).toContain("ignored unknown checks: unknown");
  expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
  expect(await executionReceipt(root)).toBe("");
}, 60_000);

it.each(["lefthook", "pre-commit"] as const)("checks staged bytes inside its %s set-aside window", async manager => {
  const root = await createHookManagerRepository(manager, inject("arcHookManagerTools"));
  roots.push(root);
  const path = join(root, "src/0.txt");
  await writeFile(path, "staged\n");
  await git(root, ["add", "src/0.txt"]);
  await writeFile(path, "staged\nunstaged\n");
  await writeFile(join(root, "src/1.txt"), "another unstaged input\n");
  await writeFile(join(root, "src/untracked.txt"), "untracked input\n");
  const result = await commitThroughManager(root);
  expect(result.exitCode, result.output).toBe(0);
  expect(await git(root, ["show", "HEAD:src/0.txt"])).toBe("staged");
  expect(await readFile(path, "utf8")).toBe("staged\nunstaged\n");
  expect(await readFile(join(root, "src/1.txt"), "utf8")).toBe("another unstaged input\n");
  expect(await readFile(join(root, "src/untracked.txt"), "utf8")).toBe("untracked input\n");
  expect(await executionReceipt(root)).toBe("executed\n");
}, 60_000);
