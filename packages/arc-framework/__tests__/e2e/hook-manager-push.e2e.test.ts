/** Pushes dispatch the declared gate through the real native hook managers. */
import { afterEach, expect, inject, it } from "vitest";
import { chmod, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";
import { HOOK_MANAGERS, createHookManagerRepository, executionReceipt, pushThroughManager, type NativeHookManager } from "../fixtures/checks/hook-manager.js";
import { cleanupTempDir, git } from "./helpers.js";
import { restrictedGitPath } from "../helpers/restricted-git-path.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(cleanupTempDir)); });

async function publishedRepository(manager: NativeHookManager): Promise<{ root: string; remote: string; base: string }> {
  const root = await createHookManagerRepository(manager, inject("arcHookManagerTools"));
  roots.push(root);
  const remote = join(root, ".git/test-origin");
  await git(root, ["init", "--bare", "--initial-branch=main", remote]);
  await git(root, ["remote", "add", "origin", remote]);
  await git(root, ["push", "origin", "HEAD"]);
  return { root, remote, base: await git(root, ["rev-parse", "HEAD"]) };
}

async function declarePushCheck(root: string, exitCode: number): Promise<void> {
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: { content: {
    gate: "push", cache: false, inputs: ["src/**"], command: [process.execPath, "-e",
      `require('node:fs').appendFileSync('receipt.json','executed\\n');process.exit(${exitCode})`],
  } } }));
}

it.each(HOOK_MANAGERS.flatMap(manager => ["refs/heads/feat/native-hooks", "HEAD"].map(ref => ({ manager, ref }))))(
  "blocks a failed gate, runs once, and permits a repaired push of $ref through $manager", async ({ manager, ref }) => {
  const { root, remote, base } = await publishedRepository(manager);
  await declarePushCheck(root, 1);
  await writeFile(join(root, "src/0.txt"), "changed\n");
  await git(root, ["add", ".arc/system/arc-checks.yml", "src/0.txt"]);
  await git(root, ["commit", "-m", "push input"]);
  const failed = await pushThroughManager(root, ["origin", ref]);
  expect(failed.exitCode, failed.output).toBe(1);
  expect(failed.output).toContain(ref);
  expect(await executionReceipt(root)).toBe("executed\n");
  expect(await git(remote, ["rev-parse", "refs/heads/feat/native-hooks"])).toBe(base);
  await declarePushCheck(root, 0);
  await git(root, ["add", ".arc/system/arc-checks.yml"]);
  await git(root, ["commit", "-m", "repair push check"]);
  const repaired = await pushThroughManager(root, ["origin", ref]);
  expect(repaired.exitCode, repaired.output).toBe(0);
  expect(await executionReceipt(root)).toBe("executed\nexecuted\n");
  expect(await git(remote, ["rev-parse", "refs/heads/feat/native-hooks"])).toBe(await git(root, ["rev-parse", "HEAD"]));
}, 60_000);

it.each(HOOK_MANAGERS)("pushes without gate dispatch when disabled through %s", async manager => {
  const { root, remote } = await publishedRepository(manager);
  await declarePushCheck(root, 1);
  const configPath = join(root, ".arc/system/arc-config.yml");
  const config = await readFile(configPath, "utf8");
  await writeFile(configPath, config.replace("hooks.pre_push: enabled", "hooks.pre_push: disabled"));
  await writeFile(join(root, "src/0.txt"), "changed\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "disable push hook"]);
  const pushed = await pushThroughManager(root);
  expect(pushed.exitCode, pushed.output).toBe(0);
  expect(await executionReceipt(root)).toBe("");
  expect(pushed.output).not.toContain("content:");
  expect(await git(remote, ["rev-parse", "refs/heads/feat/native-hooks"])).toBe(await git(root, ["rev-parse", "HEAD"]));
}, 60_000);

it.each(HOOK_MANAGERS)("keeps the force-push advisory nonblocking through %s", async manager => {
  const { root, remote, base } = await publishedRepository(manager);
  await writeFile(join(root, "src/0.txt"), "published\n");
  await git(root, ["add", "src/0.txt"]);
  await git(root, ["commit", "-m", "published input"]);
  await git(root, ["push", "origin", "refs/heads/feat/native-hooks"]);
  await git(root, ["reset", "--hard", base]);
  if (manager === "pre-commit") {
    const path = join(root, ".pre-commit-config.yaml");
    const config = yaml.load(await readFile(path, "utf8")) as { repos: { hooks: { id: string; verbose?: boolean }[] }[] };
    const hook = config.repos.flatMap(repo => repo.hooks).find(entry => entry.id === "arc-pre-push");
    if (hook === undefined) throw new Error("Missing installed push entry");
    hook.verbose = true;
    await writeFile(path, yaml.dump(config));
  }
  await declarePushCheck(root, 0);
  await writeFile(join(root, "src/0.txt"), "replacement\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "replacement input"]);
  const pushed = await pushThroughManager(root, ["--force", "origin", "refs/heads/feat/native-hooks"]);
  expect(pushed.exitCode, pushed.output).toBe(0);
  expect(await executionReceipt(root)).toBe("executed\n");
  if (manager === "pre-commit") expect(pushed.output).not.toContain("force-push rewrites published history");
  else expect(pushed.output).toContain("force-push rewrites published history");
  expect(await git(remote, ["rev-parse", "refs/heads/feat/native-hooks"])).toBe(await git(root, ["rev-parse", "HEAD"]));
}, 60_000);

it.each(HOOK_MANAGERS.filter(manager => manager !== "pre-commit"))("leaves state-only rewrites out of the advisory and gate through %s", async manager => {
  const { root, remote, base } = await publishedRepository(manager);
  const ref = "refs/arc/test-state";
  await writeFile(join(root, "src/0.txt"), "published state\n");
  await git(root, ["add", "src/0.txt"]);
  await git(root, ["commit", "-m", "published state"]);
  await git(root, ["update-ref", ref, "HEAD"]);
  await git(root, ["push", "origin", ref]);
  await git(root, ["reset", "--hard", base]);
  await declarePushCheck(root, 1);
  await writeFile(join(root, "src/0.txt"), "replacement state\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "replacement state"]);
  await git(root, ["update-ref", ref, "HEAD"]);
  const pushed = await pushThroughManager(root, ["--force", "origin", ref]);
  expect(pushed.exitCode, pushed.output).toBe(0);
  expect(pushed.output).not.toContain("force-push rewrites published history");
  expect(await executionReceipt(root)).toBe("");
  expect(await git(remote, ["rev-parse", ref])).toBe(await git(root, ["rev-parse", "HEAD"]));
}, 60_000);

it.each([true, false])("handles a missing CLI with declaration presence %s and permits repair", async declared => {
  const { root, remote, base } = await publishedRepository("core.hooksPath");
  const environment = { PATH: await restrictedGitPath(root) };
  const cliPath = join(root, "node_modules/.bin/arc");
  const cli = await readFile(cliPath);
  await unlink(cliPath);
  if (declared) await declarePushCheck(root, 0);
  else await unlink(join(root, ".arc/system/arc-checks.yml"));
  await writeFile(join(root, "src/0.txt"), "changed\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "push without CLI"]);
  const args = ["origin", "refs/heads/feat/native-hooks"];
  const pushed = await pushThroughManager(root, args, environment);
  expect(pushed.exitCode, pushed.output).toBe(declared ? 1 : 0);
  expect(await executionReceipt(root)).toBe("");
  if (declared) {
    expect(pushed.output).toContain("CLI could not be resolved");
    expect(pushed.output).toContain(cliPath);
    expect(await git(remote, ["rev-parse", "refs/heads/feat/native-hooks"])).toBe(base);
    await writeFile(cliPath, cli);
    await chmod(cliPath, 0o755);
    const repaired = await pushThroughManager(root, args, environment);
    expect(repaired.exitCode, repaired.output).toBe(0);
    expect(await executionReceipt(root)).toBe("executed\n");
  }
  expect(await git(remote, ["rev-parse", "refs/heads/feat/native-hooks"])).toBe(await git(root, ["rev-parse", "HEAD"]));
}, 60_000);
