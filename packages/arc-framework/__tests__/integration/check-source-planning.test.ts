/** Fixed source plans select the intended files through real process cwd semantics. */
import { afterEach, expect, it } from "vitest";
import { dirname, join, resolve } from "node:path";
import { mkdir, writeFile, symlink } from "node:fs/promises";
import { createTempRepoCore, removeGitBackedDir, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { resolveCheckRequest } from "../../src/lib/checks/resolve-request.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { acquireSourceBoundary } from "../../src/lib/checks/runner/source-boundary.js";
import { freezeSelectedSource } from "../../src/lib/checks/runner/source-materialize.js";
import { addSourceGitMetadata } from "../../src/lib/checks/runner/source-git.js";
import { nodeSourcePresentationIO } from "../../src/lib/checks/runner/source-io.js";
import { planCheckExecution } from "../../src/lib/checks/runner/planning.js";
import { runCheckProcess } from "../../src/lib/checks/process.js";

const git = createExecaGitExec();
const io = { git, gitRaw: createExecaRawGitExec(), source: nodeSourcePresentationIO };
const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("plans a linked cwd against captured physical paths and reads the intended file after original removal", async () => {
  const root = await createTempRepoCore({ prefix: "arc-source-plan-linked-" });
  directories.push(root);
  for (const [path, content] of [
    ["packages/check/file.txt", "intended\n"],
    ["packages/packages/check/file.txt", "decoy\n"],
    ["packages/check/check.cjs", 'process.stdout.write(require("node:fs").readFileSync(process.argv[2]));\n'],
  ]) {
    if (path === undefined || content === undefined) throw new Error("Expected fixture file");
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  await symlink("packages/check", join(root, "alias"), "dir");
  await git("git", ["config", "core.symlinks", "true"], { cwd: root });
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "linked check"], { cwd: root });
  const request = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["example"] } });
  if (request.status !== "resolved") throw new Error(request.message);
  const boundary = await acquireSourceBoundary(io, root, request.request);
  try {
    const source = await freezeSelectedSource(io, root, request.request, boundary);
    try {
      await addSourceGitMetadata(io, root, source);
      await boundary.recheck();
      await boundary.remove();
      await removeGitBackedDir(root);
      const check = CheckDeclarationSchema.parse({ checks: { example: { command: [process.execPath, "check.cjs"],
        mode: "files", root: join(root, "alias"), runner: true } } }).checks.example!;
      const plan = await planCheckExecution({ callerRoot: root, source, check, paths: ["packages/check/file.txt"] });
      const invocation = plan.invocations[0];
      if (invocation === undefined) throw new Error("Expected planned invocation");
      const result = await runCheckProcess(invocation.argv, resolve(source.root, invocation.cwd), invocation.commandContent,
        { shell: invocation.shell, rawStdout: true });
      expect(result).toMatchObject({ started: true, exitCode: 0, stdout: "intended\n" });
      expect(invocation.cwd).toBe("packages/check");
      expect(invocation.argv).toEqual([process.execPath, "check.cjs", "file.txt"]);
      expect(invocation.commandContent?.tree).toBe(source.manifest.coordinates.tree);
    } finally { await source.remove(); }
  } finally { await boundary.remove(); }
});
