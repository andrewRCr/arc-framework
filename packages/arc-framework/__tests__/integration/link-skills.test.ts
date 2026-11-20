/** The self-hosting skill linker points each present harness skill folder at the checkout's canonical skills. */
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const script = resolve(import.meta.dirname, "../../../../scripts/link-skills.mjs");
const canonical = join(".arc", "system", ".internal", "skills");
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function checkout(harnesses: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-link-skills-"));
  roots.push(root);
  for (const name of ["arc-alpha", "arc-beta"]) {
    await mkdir(join(root, canonical, name), { recursive: true });
    await writeFile(join(root, canonical, name, "SKILL.md"), `# ${name}\n`);
  }
  await writeFile(join(root, canonical, "README.md"), "# Skills\n");
  for (const harness of harnesses) await mkdir(join(root, harness), { recursive: true });
  return root;
}

async function linksToCanonical(root: string, harness: string, name: string): Promise<boolean> {
  const path = join(root, harness, "skills", name);
  return (await lstat(path)).isSymbolicLink() && await realpath(path) === await realpath(join(root, canonical, name));
}

const link = (...roots: string[]) => run(process.execPath, [script, ...roots]);

it("links every canonical skill into each harness folder that exists, and nothing on a second run", async () => {
  const root = await checkout([".claude"]);
  const first = await link(root);
  expect(await readdir(join(root, ".claude", "skills"))).toEqual(["arc-alpha", "arc-beta"]);
  expect(await linksToCanonical(root, ".claude", "arc-alpha")).toBe(true);
  expect(await linksToCanonical(root, ".claude", "arc-beta")).toBe(true);
  expect(await readdir(root)).not.toContain(".codex");
  expect(first.stdout).toMatch(/linked .*arc-alpha/u);
  expect(await link(root)).toEqual({ stdout: "", stderr: "" });
});

it("replaces a copied skill folder holding only generated files, and a link that resolves elsewhere", async () => {
  const root = await checkout([".codex"]);
  await mkdir(join(root, ".codex", "skills", "arc-alpha", "agents"), { recursive: true });
  await writeFile(join(root, ".codex", "skills", "arc-alpha", "SKILL.md"), "# stale copy\n");
  await writeFile(join(root, ".codex", "skills", "arc-alpha", "agents", "openai.yaml"), "interface: {}\n");
  await mkdir(join(root, "elsewhere"));
  await symlink(join(root, "elsewhere"), join(root, ".codex", "skills", "arc-beta"), "junction");
  const { stdout } = await link(root);
  expect(await linksToCanonical(root, ".codex", "arc-alpha")).toBe(true);
  expect(await linksToCanonical(root, ".codex", "arc-beta")).toBe(true);
  expect(await readFile(join(root, canonical, "arc-alpha", "SKILL.md"), "utf8")).toBe("# arc-alpha\n");
  expect(await readdir(join(root, "elsewhere"))).toEqual([]);
  expect(stdout).toMatch(/replaced .*arc-alpha/u);
  expect(stdout).toMatch(/replaced .*arc-beta/u);
});

it("leaves a skill folder holding anything else and names it", async () => {
  const root = await checkout([".claude"]);
  await mkdir(join(root, ".claude", "skills", "arc-alpha"), { recursive: true });
  await writeFile(join(root, ".claude", "skills", "arc-alpha", "SKILL.md"), "# edited\n");
  await writeFile(join(root, ".claude", "skills", "arc-alpha", "notes.md"), "mine\n");
  const { stderr } = await link(root);
  expect(await readdir(join(root, ".claude", "skills", "arc-alpha"))).toEqual(["SKILL.md", "notes.md"]);
  expect(await linksToCanonical(root, ".claude", "arc-beta")).toBe(true);
  expect(stderr).toMatch(/left .*arc-alpha/u);
});

it("links each named checkout to its own canonical skills", async () => {
  const [first, second] = [await checkout([".claude"]), await checkout([".claude", ".codex"])];
  await link(first, second);
  expect(await linksToCanonical(first, ".claude", "arc-alpha")).toBe(true);
  expect(await linksToCanonical(second, ".claude", "arc-alpha")).toBe(true);
  expect(await linksToCanonical(second, ".codex", "arc-beta")).toBe(true);
});
