/** Integration coverage for focused-test arguments crossing the root npm workspace wrapper. */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("root test wrapper", () => {
  it("forwards both file and name filters to the workspace test command", async () => {
    const repositoryManifest = JSON.parse(
      await readFile(join(repositoryRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const root = await mkdtemp(join(tmpdir(), "arc-root-test-forwarding-"));
    temporaryRoots.push(root);
    const packageRoot = join(root, "packages", "arc-framework");
    await mkdir(packageRoot, { recursive: true });
    await Promise.all([
      writeFile(join(root, "package.json"), JSON.stringify({
        private: true,
        workspaces: ["packages/arc-framework"],
        scripts: { test: repositoryManifest.scripts.test },
      })),
      writeFile(join(packageRoot, "package.json"), JSON.stringify({
        name: "@arc-framework/test-forwarding-fixture",
        version: "1.0.0",
        private: true,
        scripts: { test: "node capture-arguments.mjs" },
      })),
      writeFile(
        join(packageRoot, "capture-arguments.mjs"),
        'import { writeFileSync } from "node:fs";\n'
          + 'writeFileSync("arguments.json", JSON.stringify(process.argv.slice(2)));\n',
      ),
    ]);

    await execute(
      npmExecutable,
      ["test", "--", "focused.test.ts", "-t", "selected behavior"],
      { cwd: root, encoding: "utf8" },
    );

    expect(JSON.parse(await readFile(join(packageRoot, "arguments.json"), "utf8")))
      .toEqual(["focused.test.ts", "-t", "selected behavior"]);
  });
});
