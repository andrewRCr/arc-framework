import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tsxLoader = import.meta.resolve("tsx");
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const entrypoint = join(repositoryRoot, "packages/arc-framework/src/scripts/format-prose.ts");
const CASE_TIMEOUT_MS = 60_000;
const original = Array.from({ length: 30 }, () => "word").join(" ") + "\n";
const wrapped = Array.from({ length: 24 }, () => "word").join(" ") + "\n"
  + Array.from({ length: 6 }, () => "word").join(" ") + "\n";
let fixtureParent: string | undefined;

async function git(root: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: root });
}

async function put(root: string, path: string, text: string): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-prose-e2e-"));
  fixtureParent = root;
  await git(root, ["init", "-q"]);
  await put(root, "packages/arc-framework/init-recipe.json", JSON.stringify({ prompts: [], include_files: [], conditions: {} }));
  await put(root, ".arc/system/.internal/manifest.json", JSON.stringify({ schema_version: 1, framework_version: "test",
    installed_at: "2026-07-20", install_config: { project_name: "Demo", pm_mode: "arc-in-git", tools: [] }, files: {} }));
  return root;
}

function run(root: string, args: string[]) {
  const env = { ...process.env };
  delete env.FORCE_COLOR;
  return execFileAsync(process.execPath, ["--import", tsxLoader, entrypoint, ...args], { cwd: root, env, encoding: "utf8" });
}

afterEach(async () => {
  if (fixtureParent !== undefined) await rm(fixtureParent, { recursive: true, force: true });
  fixtureParent = undefined;
});

describe("format:prose entry point", () => {
  it("routes a rendered-copy refusal to its prose source and succeeds through that remedy", async () => {
    const root = await fixture();
    const source = "packages/arc-framework/arc/reference/demo.template.md";
    const rendered = ".arc/reference/demo.md";
    await put(root, "packages/arc-framework/init-recipe.json", JSON.stringify({ prompts: [],
      include_files: ["reference/demo.template.md"], conditions: {} }));
    await put(root, source, original);
    await put(root, rendered, original);
    await expect(run(root, [rendered]))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("npm run format:prose") });
    expect(await readFile(join(root, source), "utf8")).toBe(original);
    expect(await readFile(join(root, rendered), "utf8")).toBe(original);
    await run(root, [source]);
    expect(await readFile(join(root, source), "utf8")).toBe(wrapped);
    expect(await readFile(join(root, rendered), "utf8")).toBe(wrapped);
  }, CASE_TIMEOUT_MS);

  it("writes explicit prose through the atomic writer and is idempotent", async () => {
    const root = await fixture();
    await put(root, "notes.md", original);
    const first = await run(root, ["notes.md"]);
    expect(first.stdout).toBe("formatted notes.md [0,149)\n");
    expect(await readFile(join(root, "notes.md"), "utf8")).toBe(wrapped);
    const retry = await run(root, ["notes.md"]);
    expect(retry.stdout).toBe("unchanged notes.md\n");
    expect(await readFile(join(root, "notes.md"), "utf8")).toBe(wrapped);
  }, CASE_TIMEOUT_MS);

  it("refuses an invalid line then selects one paragraph from a nested cwd in a linked checkout", async () => {
    const root = await fixture();
    const neighbor = "neighbor ".repeat(20).trimEnd() + "\n";
    await put(root, "notes.md", original + "\n" + neighbor);
    await git(root, ["add", "-f", "--", "notes.md", "packages/arc-framework/init-recipe.json", ".arc/system/.internal/manifest.json"]);
    await git(root, ["-c", "user.name=Test User", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"]);
    const linked = join(root, "linked");
    await git(root, ["worktree", "add", "-qb", "prose-linked", linked]);
    const nested = join(linked, "nested");
    await mkdir(nested);
    await expect(run(nested, ["--line", "0", "notes.md"]))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("positive line") });
    expect(await readFile(join(linked, "notes.md"), "utf8")).toBe(original + "\n" + neighbor);
    const first = await run(nested, ["--line", "1", "notes.md"]);
    expect(first.stdout).toBe("formatted notes.md [0,149)\n");
    expect(await readFile(join(linked, "notes.md"), "utf8")).toBe(wrapped + "\n" + neighbor);
    expect(await readFile(join(root, "notes.md"), "utf8")).toBe(original + "\n" + neighbor);
  }, CASE_TIMEOUT_MS);

  it("refuses a semantic change before any file write and succeeds after repair", async () => {
    const root = await fixture();
    const prefix = "a".repeat(120);
    const unsafe = `${prefix} # heading words\n`;
    await put(root, "first.md", original);
    await put(root, "second.md", unsafe);
    await expect(run(root, ["first.md", "second.md"]))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("meaning changed") });
    expect(await readFile(join(root, "first.md"), "utf8")).toBe(original);
    expect(await readFile(join(root, "second.md"), "utf8")).toBe(unsafe);
    await put(root, "second.md", `${prefix} \\# heading words\n`);
    await run(root, ["first.md", "second.md"]);
    expect(await readFile(join(root, "first.md"), "utf8")).toBe(wrapped);
    expect(await readFile(join(root, "second.md"), "utf8")).toBe(`${prefix}\n\\# heading words\n`);
  }, CASE_TIMEOUT_MS);
});
