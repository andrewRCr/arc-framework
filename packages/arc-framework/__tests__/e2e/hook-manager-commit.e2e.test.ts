/** Commits run the declared gate once through every supported native manager. */
import { afterEach, expect, inject, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HOOK_MANAGERS, VALID_MESSAGE, commitThroughManager, createHookManagerRepository, executionReceipt } from "../fixtures/checks/hook-manager.js";
import { cleanupTempDir, git } from "./helpers.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(cleanupTempDir)); });

it.each(HOOK_MANAGERS)("runs the commit gate exactly once through %s", async manager => {
  const root = await createHookManagerRepository(manager, inject("arcHookManagerTools"));
  roots.push(root);
  for (let index = 0; index < 24; index++) await writeFile(join(root, "src", `${index}.txt`), "changed\n");
  await git(root, ["add", "src"]);
  const committed = await commitThroughManager(root);
  expect(committed.exitCode, committed.output).toBe(0);
  expect(await executionReceipt(root)).toBe("executed\n");
  expect(await git(root, ["show", "HEAD:src/0.txt"])).toBe("changed");
}, 60_000);

it.each(HOOK_MANAGERS)("gates deletion-only commits through %s", async manager => {
  const root = await createHookManagerRepository(manager, inject("arcHookManagerTools"));
  roots.push(root);
  await git(root, ["rm", "src/0.txt"]);
  const committed = await commitThroughManager(root);
  expect(committed.exitCode, committed.output).toBe(0);
  expect(await executionReceipt(root)).toBe("executed\n");
  expect(await git(root, ["ls-tree", "HEAD", "src/0.txt"])).toBe("");
}, 60_000);

it.each(HOOK_MANAGERS)("validates the commit message file and permits repair through %s", async manager => {
  const root = await createHookManagerRepository(manager, inject("arcHookManagerTools"));
  roots.push(root);
  await writeFile(join(root, "src/0.txt"), "changed\n");
  await git(root, ["add", "src/0.txt"]);
  const refused = await commitThroughManager(root, "not a conventional message");
  expect(refused.exitCode, refused.output).toBe(1);
  expect(await git(root, ["show", "HEAD:src/0.txt"])).toBe("base");
  const repaired = await commitThroughManager(root);
  expect(repaired.exitCode, repaired.output).toBe(0);
  expect(await git(root, ["log", "-1", "--format=%B"])).toBe(VALID_MESSAGE);
  expect(await git(root, ["show", "HEAD:src/0.txt"])).toBe("changed");
}, 60_000);

it.each(HOOK_MANAGERS)("commits without gate dispatch when disabled through %s", async manager => {
  const root = await createHookManagerRepository(manager, inject("arcHookManagerTools"), true);
  roots.push(root);
  await writeFile(join(root, "src/0.txt"), "changed\n");
  await git(root, ["add", "src/0.txt"]);
  const committed = await commitThroughManager(root);
  expect(committed.exitCode, committed.output).toBe(0);
  expect(await executionReceipt(root)).toBe("");
  expect(committed.output).not.toContain("content:");
  expect(await git(root, ["show", "HEAD:src/0.txt"])).toBe("changed");
}, 60_000);
