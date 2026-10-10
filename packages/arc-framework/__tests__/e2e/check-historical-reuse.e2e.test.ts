/** Historical declared counterparts affect real package-sync reuse. */
import { afterEach, expect, it } from "vitest";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { git, runArc } from "./helpers.js";

const roots: string[] = [];
afterEach(async () => { await removeGitBackedDirs(roots.splice(0)); });

it("reruns package sync when equal checked trees have different historical counterpart content", async () => {
  const instance = ".arc/system/example.md", source = "packages/arc-framework/arc/system/example.md";
  const root = await createDeclaredCheckRepository({ sync: { gate: "push", mode: "files", reads_index: true,
    inputs: [instance, source], command: ["bash", "check-sync.sh"] } });
  roots.push(root);
  const write = async (path: string, content: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  const checkout = resolve(import.meta.dirname, "../../../..");
  await copyFile(join(checkout, "scripts/check-package-sync.sh"), join(root, "check-sync.sh"));
  await mkdir(join(root, ".arc/system/.internal/scripts"), { recursive: true });
  await copyFile(join(checkout, ".arc/system/.internal/scripts/arc-lib.sh"),
    join(root, ".arc/system/.internal/scripts/arc-lib.sh"));
  await write(".arc/system/.internal/manifest.json", JSON.stringify({ files: {
    "system/example.md": { classification: "Configurable" },
  } }, null, 2));
  await write(instance, "base override\n");
  await write(source, "checked default\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "sync base"]);
  const base = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  const parent = async (counterpart: string) => {
    await write(instance, "incoming override\n");
    await write(source, counterpart);
    await git(root, ["add", instance, source]);
    const tree = await git(root, ["write-tree"]);
    return git(root, ["commit-tree", tree, "-p", base, "-m", "incoming"]);
  };
  const converged = await parent("incoming override\n");
  const divergent = await parent("different counterpart\n");
  await write(instance, "checked default\n");
  await write(source, "checked default\n");
  await git(root, ["add", instance, source]);
  const tree = await git(root, ["write-tree"]);
  const run = () => runArc(["check", "run", "sync", "--range", base, "--json"], root);
  const selectParent = async (incoming: string) => {
    const merge = await git(root, ["commit-tree", tree, "-p", base, "-p", incoming, "-m", "merge"]);
    await git(root, ["update-ref", branch, merge]);
  };
  await selectParent(converged);
  const first = await run();
  expect(first.exitCode, first.stdout + first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).result.checks[0].outcome).toBe("passed");
  expect(JSON.parse((await run()).stdout).result.checks[0].outcome).toBe("reused");
  await selectParent(divergent);
  const changed = await run();
  expect(changed.exitCode, changed.stdout + changed.stderr).toBe(1);
  expect(JSON.parse(changed.stdout).result.checks[0]).toMatchObject({ outcome: "failed" });
  await selectParent(converged);
  expect(JSON.parse((await run()).stdout).result.checks[0].outcome).toBe("reused");
  await git(root, ["read-tree", converged]);
  await write("history-only.txt", "outside declared inputs\n");
  await git(root, ["add", "history-only.txt"]);
  const unrelatedTree = await git(root, ["write-tree"]);
  const unrelated = await git(root, ["commit-tree", unrelatedTree, "-p", converged, "-m", "unrelated history"]);
  await rm(join(root, "history-only.txt"));
  await git(root, ["read-tree", tree]);
  await selectParent(unrelated);
  expect(JSON.parse((await run()).stdout).result.checks[0].outcome).toBe("reused");
}, 60_000);
