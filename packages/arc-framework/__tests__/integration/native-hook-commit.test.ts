/** Native fixture commits keep process termination distinct from a completed hook verdict. */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { commitThroughManager } from "../fixtures/checks/hook-manager.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";
import { git } from "../e2e/helpers.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => removeGitBackedDir(root))); });

async function repository(script: string): Promise<string> {
  const root = await createTempRepoCore({ prefix: "arc-hook-termination-" });
  roots.push(root);
  await writeFile(join(root, "input.txt"), "candidate\n");
  await git(root, ["add", "input.txt"]);
  await mkdir(join(root, "hooks"));
  await git(root, ["config", "core.hooksPath", "hooks"]);
  await hook(root, script);
  return root;
}

async function hook(root: string, script: string): Promise<void> {
  const path = join(root, "hooks/pre-commit");
  const node = `'${process.execPath.replaceAll("'", "'\\''")}'`;
  await writeFile(path, `#!/bin/sh\nprintf 'hook diagnostic before termination\\n' >&2\nexec ${node} -e '${script}'\n`);
  await chmod(path, 0o755);
}

it("preserves a fixture timeout and hook diagnostics, then commits after repair", async () => {
  const root = await repository("setTimeout(() => process.exit(1), 2000)");
  await expect(commitThroughManager(root, undefined, {}, [], { timeoutMs: 1000 })).rejects.toMatchObject({
    timedOut: true, stderr: expect.stringContaining("hook diagnostic before termination"),
    durationMs: expect.any(Number),
  });
  await hook(root, "process.exit(0)");
  await expect(commitThroughManager(root)).resolves.toMatchObject({ exitCode: 0 });
  expect(await git(root, ["show", "HEAD:input.txt"])).toBe("candidate");
});

it.skipIf(process.platform === "win32")("preserves native signal termination instead of reporting a hook refusal", async () => {
  const root = await repository('process.kill(process.ppid, "SIGTERM")');
  await expect(commitThroughManager(root)).rejects.toMatchObject({
    timedOut: false, signal: "SIGTERM", stderr: expect.stringContaining("hook diagnostic before termination"),
  });
});
