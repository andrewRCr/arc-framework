/** Real fixer entry points refuse an invalid subset before writing and recover on retry. */
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execa } from "execa";
import { afterEach, expect, it } from "vitest";
import { MARKDOWN_SELECTION } from "../../src/lib/markdown/selection.js";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";

const roots: string[] = [];
const repository = resolve(import.meta.dirname, "../../../..");
const script = join(repository, "packages/arc-framework/src/scripts/fix-markdown.ts");
afterEach(async () => { await removeGitBackedDirs(roots.splice(0)); });

it("runs the actual fixer CLI over a literal subset after an all-or-nothing refusal", async () => {
  const root = await createTempRepoCore({ prefix: "arc-fix-cli-" });
  roots.push(root);
  const original = "# Heading\n\nTrailing whitespace. \n";
  const path = "[literal] # notes.md";
  await writeFile(join(root, ".markdownlint-cli2.jsonc"), JSON.stringify({ config: { default: true }, ...MARKDOWN_SELECTION }));
  await mkdir(join(root, ".git/info"), { recursive: true });
  await writeFile(join(root, ".git/info/exclude"), "ignored.md\n");
  for (const name of [path, "other.md", "ignored.md"]) await writeFile(join(root, name), original);
  await symlink(join(repository, "node_modules"), join(root, "node_modules"), "junction");
  await execa("git", ["add", "--all"], { cwd: root });
  await execa("git", ["commit", "-qm", "fix fixture"], { cwd: root });
  await mkdir(join(root, "packages/arc-framework"), { recursive: true });
  await cp(join(repository, "packages/arc-framework/src"), join(root, "packages/arc-framework/src"), { recursive: true });
  await writeFile(join(root, ".gitignore"), "packages/\n");
  const manifest = JSON.parse(await readFile(join(repository, "package.json"), "utf8")) as { scripts: Record<string, string> };
  await writeFile(join(root, "package.json"), JSON.stringify({ type: "module", scripts: {
    "lint:md:fix": manifest.scripts["lint:md:fix"], "lint:md:fix:file": manifest.scripts["lint:md:fix:file"],
  } }));
  const run = (args: string[]) => execa(process.execPath, ["--import", import.meta.resolve("tsx"), script, ...args], {
    cwd: root, reject: false, env: { FORCE_COLOR: undefined },
  });
  const refused = await run(["--files", path, "ignored.md"]);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain("outside the lint corpus");
  for (const name of [path, "other.md", "ignored.md"]) expect(await readFile(join(root, name), "utf8")).toBe(original);
  const repaired = await run(["--files", path]);
  expect(repaired.exitCode, repaired.stderr).toBe(0);
  expect(await readFile(join(root, path), "utf8")).toBe(original.replace(". \n", ".\n"));
  for (const name of ["other.md", "ignored.md"]) expect(await readFile(join(root, name), "utf8")).toBe(original);
  await writeFile(join(root, path), original);
  const explicit = await execa("npm", ["run", "-s", "lint:md:fix:file", "--", path], { cwd: root, reject: false });
  expect(explicit.exitCode, explicit.stderr).toBe(0);
  expect(await readFile(join(root, path), "utf8")).not.toBe(original);
  expect(await readFile(join(root, "other.md"), "utf8")).toBe(original);
  const full = await execa("npm", ["run", "-s", "lint:md:fix"], { cwd: root, reject: false });
  expect(full.exitCode, full.stderr).toBe(0);
  expect(await readFile(join(root, "other.md"), "utf8")).not.toBe(original);
  expect(await readFile(join(root, "ignored.md"), "utf8")).toBe(original);
}, 30_000);
