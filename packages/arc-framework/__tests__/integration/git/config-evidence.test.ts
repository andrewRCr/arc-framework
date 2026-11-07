/** Real Git config observations distinguish absence, malformed input and successful recovery. */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { gitConfigGet, gitConfigUnset, type GitExec } from "../../../src/lib/git/exec.js";
import { createExecaGitExec } from "../../../src/lib/git/process-executor.js";

it("preserves genuine config absence while refusing malformed reads until repair", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-git-config-evidence-"));
  const file = join(root, "config");
  const native = createExecaGitExec();
  const exec: GitExec = (command, args, options) =>
    native(command, [args[0]!, "--file", file, ...args.slice(1)], { ...options, cwd: root });
  try {
    await writeFile(file, "[arc]\n present = value\n empty =\n");
    await expect(gitConfigGet(exec, "arc.present")).resolves.toBe("value");
    await expect(gitConfigGet(exec, "arc.empty")).resolves.toBe("");
    await expect(gitConfigGet(exec, "arc.absent")).resolves.toBeUndefined();
    await expect(gitConfigGet(exec, "invalid")).rejects.toMatchObject({
      kind: "nonzero-exit", exitCode: 1, stdout: "", stderr: expect.stringMatching(/\S/u),
    });
    await expect(gitConfigGet(exec, "arc.present")).resolves.toBe("value");
    await writeFile(file, "invalid configuration line\n");
    await expect(gitConfigUnset(exec, "arc.present")).rejects.toMatchObject({
      kind: "nonzero-exit", exitCode: 128, stdout: "", stderr: expect.stringMatching(/\S/u),
    });
    expect(await readFile(file, "utf8")).toBe("invalid configuration line\n");
    await writeFile(file, "[arc]\n present = repaired\n");
    await expect(gitConfigUnset(exec, "arc.present")).resolves.toBeUndefined();
    await expect(gitConfigGet(exec, "arc.present")).resolves.toBeUndefined();
    await expect(gitConfigUnset(exec, "arc.absent")).resolves.toBeUndefined();
  } finally { await rm(root, { recursive: true, force: true }); }
});
