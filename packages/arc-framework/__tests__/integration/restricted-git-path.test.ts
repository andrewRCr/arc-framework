/** CLI-absence fixtures retain utilities while excluding ambient ARC installations. */
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { restrictedGitPath } from "../helpers/restricted-git-path.js";

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it.skipIf(process.platform === "win32")("excludes arc installed alongside the selected Git executable", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-cli-absence-"));
  roots.push(root);
  const tools = join(root, "ambient");
  await mkdir(tools);
  for (const name of ["git", "arc"]) {
    await writeFile(join(tools, name), `#!/bin/sh\nprintf '%s\\n' 'fixture-${name}'\n`);
    await chmod(join(tools, name), 0o755);
  }
  const previous = process.env.PATH;
  let path: string;
  try {
    process.env.PATH = `${tools}${delimiter}${previous ?? ""}`;
    path = await restrictedGitPath(root);
  } finally {
    process.env.PATH = previous;
  }
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: path, NO_COLOR: "1" };
  delete env.FORCE_COLOR;
  const result = await execute("bash", ["-c", "git; if command -v arc; then arc; exit 1; fi"], { env });
  expect(result.stdout).toBe("fixture-git\n");
  expect(result.stderr).toBe("");
});
