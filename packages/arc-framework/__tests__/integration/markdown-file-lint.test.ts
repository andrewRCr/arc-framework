/** Real npm and markdownlint boundaries for explicit Markdown file selection. */
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { execa } from "execa";
import { afterAll, beforeAll, expect, it } from "vitest";

import { MARKDOWN_SELECTION } from "../../src/lib/markdown/selection.js";
import { copyLiveTree } from "../helpers/copy-live-tree.js";

let root: string;
let outside: string;

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

beforeAll(async () => {
  const sourcePackage = resolve(import.meta.dirname, "../..");
  const sourceRoot = resolve(sourcePackage, "../..");
  root = await mkdtemp(join(tmpdir(), "arc-markdown-file-lint-"));
  await write("package.json", await readFile(join(sourceRoot, "package.json"), "utf8"));
  await write("packages/arc-framework/package.json", await readFile(join(sourcePackage, "package.json"), "utf8"));
  await copyLiveTree(join(sourcePackage, "src/scripts"), join(root, "packages/arc-framework/src/scripts"));
  await copyLiveTree(join(sourcePackage, "src/lib"), join(root, "packages/arc-framework/src/lib"));
  await symlink(join(sourceRoot, "node_modules"), join(root, "node_modules"), "junction");
  await mkdir(join(root, "packages/arc-framework/node_modules"), { recursive: true });
  await write(".markdownlint-cli2.jsonc", JSON.stringify({ config: { default: true, MD013: false }, ...MARKDOWN_SELECTION }));
  await write("docs/valid.md", "# Valid\n");
  await write("docs/invalid.md", "# Invalid\n\nTrailing whitespace.  \n\n");
  for (const path of [".arc/user/andrew/WORKING-MEMORY.md", ".arc/user/andrew/nested/USER-INBOX.md", ".arc/temp-probe.md"]) {
    await write(path, "# Excluded\n");
  }
  outside = `${root}-outside.md`;
  await writeFile(outside, "# Outside\n");
  await symlink("valid.md", join(root, "docs/contained-link.md"), "file");
  await mkdir(join(root, "docs/target-directory"));
  await symlink("target-directory", join(root, "docs/directory-link.md"), "dir");
  await symlink(outside, join(root, "docs/escaping-link.md"), "file");
  await execa("git", ["init", "-q"], { cwd: root });
  await execa("git", ["add", "."], { cwd: root });
  await write("docs/new file.md", "# New file\n");
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  if (outside) await rm(outside, { force: true });
});

async function lint(paths: string[]) {
  return execa("npm", ["run", "-s", "lint:md:file", "--", ...paths], {
    cwd: root, reject: false, timeout: 30_000, env: { FORCE_COLOR: "0" },
  });
}

it.each([".arc/user/andrew/WORKING-MEMORY.md", ".arc/user/andrew/nested/USER-INBOX.md", ".arc/temp-probe.md"])(
  "refuses the explicitly excluded path %s", async path => {
    const result = await lint([path]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(path);
    expect(result.stderr).toMatch(/excluded/i);
  },
);

it("refuses a mixed included and excluded selection before partial linting", async () => {
  const result = await lint(["docs/valid.md", ".arc/user/andrew/WORKING-MEMORY.md"]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain(".arc/user/andrew/WORKING-MEMORY.md");
  expect(result.stdout).not.toContain("Linting:");
});

it("lints included and untracked files with a repair continuation", async () => {
  const included = await lint(["./docs/valid.md", "docs/new file.md"]);
  expect(included.exitCode).toBe(0);
  expect(included.stdout).toContain("Linting: 2 file(s)");
  const missing = await lint(["docs/missing.md"]);
  expect(missing.exitCode).toBe(1);
  await write("docs/missing.md", "# Repaired\n");
  const repaired = await lint(["docs/missing.md"]);
  expect(repaired.exitCode).toBe(0);
  expect(repaired.stdout).toContain("Linting: 1 file(s)");
});

it("retains native lint findings for included files", async () => {
  const result = await lint(["docs/invalid.md"]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("MD012");
});


it("lints a contained regular-file symlink", async () => {
  const result = await lint(["docs/contained-link.md"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Linting: 1 file(s)");
});

it.each([
  ["docs/directory-link.md", "not a regular file"],
  ["docs/escaping-link.md", "escapes the repository"],
])("refuses a symlink with an invalid read target %s", async (path, message) => {
  const result = await lint([path]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain(path);
  expect(result.stderr).toContain(message);
  expect(result.stdout).not.toContain("Linting:");
});
