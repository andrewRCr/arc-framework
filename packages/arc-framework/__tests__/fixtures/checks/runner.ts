/** Declared repositories and independent executable locations for process-backed runner conformance. */
import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createDeclaredCheckRepository } from "./repository.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../../src/lib/git/process-executor.js";
import { CheckDeclarationSchema } from "../../../src/lib/checks/declaration.js";
import { resolveCheckRequest } from "../../../src/lib/checks/resolve-request.js";
import { nodeSourcePresentationIO } from "../../../src/lib/checks/runner/source-io.js";
import type { PrepareSelectedCheckExecutionInput, CheckExecutionIO } from "../../../src/lib/checks/runner/execution.js";

export const LOCAL_RUNNER_EXAMPLE = fileURLToPath(new URL("../../../examples/check-runner/local.mjs", import.meta.url));

export async function createRunnerCheckRepository(directories: string[]): Promise<{
  root: string; stateRoot: string; input: PrepareSelectedCheckExecutionInput; io: CheckExecutionIO; captures: string[];
}> {
  const checks = { example: { runner: true, mode: "files", command: [process.execPath, "check.cjs"],
    environment_inputs: { EXPLICIT_FILE: "file", SCALAR: "value" } } };
  const root = await createDeclaredCheckRepository(checks);
  directories.push(root);
  const stateRoot = await mkdtemp(join(tmpdir(), "arc-runner-fixture-state-"));
  directories.push(stateRoot);
  await Promise.all([
    appendFile(join(root, ".gitignore"), "*.secret\n"),
    writeFile(join(root, "input.txt"), "captured source\r\n"),
    writeFile(join(root, "check.cjs"), "process.exit(0);\n"),
    writeFile(join(root, "input.secret"), Buffer.from([0, 255, 13, 10])),
  ]);
  const git = createExecaGitExec();
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "runner inputs"], { cwd: root });
  const resolved = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["example"] } });
  if (resolved.status !== "resolved") throw new Error(resolved.message);
  const check = CheckDeclarationSchema.parse({ checks }).checks.example;
  if (check === undefined) throw new Error("Expected declared runner check");
  const captures: string[] = [];
  const io = { git, gitRaw: createExecaRawGitExec(), source: { ...nodeSourcePresentationIO,
    files: { ...nodeSourcePresentationIO.files, createDirectory: async () => {
      const directory = await nodeSourcePresentationIO.files.createDirectory();
      captures.push(directory); directories.push(directory); return directory;
    } } } };
  return { root, stateRoot, io, captures, input: { callerRoot: root, request: resolved.request, check, paths: ["input.txt"],
    configuration: { file: join(stateRoot, "machine.yml"), argv: [process.execPath, LOCAL_RUNNER_EXAMPLE, "--state-root", stateRoot] },
    environment: { EXPLICIT_FILE: "input.secret", SCALAR: "literal\nvalue" },
    globalRuntimeInputs: [[process.execPath, "-e", `process.stdout.write(${JSON.stringify(" \nglobal-probe:0\r\n")})`]] } };
}
