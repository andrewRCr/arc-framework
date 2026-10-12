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
  await execa("git", ["-c", "user.name=Test User", "-c", "user.email=test@example.com",
    "commit", "-q", "-m", "baseline"], { cwd: root });
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

// Invoke the public file entry without npm's script shell expanding glob characters.
async function lintFileEntry(paths: string[]) {
  return execa(process.execPath, ["--import", "tsx", "packages/arc-framework/src/scripts/lint-markdown-file.ts", ...paths], {
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

it("refuses an ignored pattern-character filename and lints it after repairing its ignore", async () => {
  const path = "docs/ignored-patterns/[a].md";
  await write("docs/ignored-patterns/.gitignore", "?a?.md\n");
  await write("docs/ignored-patterns/a.md", "# Neighbor\n");
  await write(path, "# Literal\n");
  await execa("git", ["add", "--", ":(literal)docs/ignored-patterns/.gitignore", ":(literal)docs/ignored-patterns/a.md"],
    { cwd: root });
  const ignored = await lintFileEntry(["docs/valid.md", path]);
  expect(ignored.exitCode).toBe(1);
  expect(ignored.stderr).toContain(path);
  expect(ignored.stderr).toContain("ignored or excluded");
  expect(ignored.stdout).not.toContain("Linting:");

  await write("docs/ignored-patterns/.gitignore", "");
  const repaired = await lintFileEntry([path]);
  expect(repaired.exitCode).toBe(0);
  expect(repaired.stdout).toContain("Linting: 1 file(s)");
});

it("lints only the exact tracked and untracked filenames containing pattern characters", async () => {
  const tracked = "docs/literal-patterns/[a].md";
  const untracked = "docs/literal-patterns/[b].md";
  await write(tracked, "# Tracked literal\n");
  await write(untracked, "# Untracked literal\n");
  await write("docs/literal-patterns/a.md", "# Wrong neighbor\n\n\n");
  await write("docs/literal-patterns/b.md", "# Wrong neighbor\n\n\n");
  await execa("git", ["add", "--", `:(literal)${tracked}`, ":(literal)docs/literal-patterns/a.md",
    ":(literal)docs/literal-patterns/b.md"], { cwd: root });

  const result = await lintFileEntry([tracked, untracked]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Linting: 2 file(s)");
  expect(result.stderr).not.toContain("MD012");
});

it.each([false, true])("refuses a new nested selector and resumes after repair (Git-ignored=%s)", async ignored => {
  const directory = `docs/new-config-${ignored ? "ignored" : "untracked"}`;
  const path = `${directory}/page.md`;
  const configPath = `${directory}/.markdownlint-cli2.jsonc`;
  await write(path, "# Invalid\n\n\n");
  await execa("git", ["add", "--", `:(literal)${path}`], { cwd: root });
  if (ignored) await write(`${directory}/.gitignore`, ".markdownlint-cli2.jsonc\n");
  await write(configPath, JSON.stringify({ ignores: ["**/*.md"] }));

  const refused = await lint([path]);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain(configPath);
  expect(refused.stderr).toContain("Nested configuration must not define ignores");
  expect(refused.stdout).not.toContain("Linting:");

  await write(configPath, JSON.stringify({ config: { MD012: true } }));
  const findings = await lint([path]);
  expect(findings.exitCode).toBe(1);
  expect(findings.stderr).toContain("MD012");
  await write(path, "# Repaired\n");
  const repaired = await lint([path]);
  expect(repaired.exitCode).toBe(0);
  expect(repaired.stdout).toContain("Linting: 1 file(s)");
});

it("refuses an untracked executable config before native lint runs", async () => {
  const path = "docs/new-executable-config/page.md";
  const configPath = "docs/new-executable-config/.markdownlint-cli2.cjs";
  await write(path, "# Page\n");
  await execa("git", ["add", "--", `:(literal)${path}`], { cwd: root });
  await write(configPath, "module.exports = { ignores: ['**/*.md'] };\n");

  const result = await lint([path]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain(`Unsupported Markdown configuration form: ${configPath}`);
  expect(result.stdout).not.toContain("Linting:");
});

it.each(["audit:tables", "audit:emphasis"])("%s rejects a final symlink and audits its regular target", async script => {
  const run = (path: string) => execa("npm", ["run", "-s", script, "--", path], {
    cwd: root, reject: false, timeout: 30_000, env: { FORCE_COLOR: "0" },
  });
  const refused = await run("docs/contained-link.md");
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain("docs/contained-link.md");
  expect(refused.stderr).toContain("not a regular file");
  expect(refused.stdout).not.toContain("baseline ");

  const repaired = await run("docs/valid.md");
  expect(repaired.exitCode).toBe(0);
  expect(repaired.stdout).toMatch(/baseline [a-f0-9]{40}/u);
  expect(repaired.stdout).toContain("unchanged docs/valid.md");
});
