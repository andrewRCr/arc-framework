import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { load } from "js-yaml";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveIndexedMarkdownCheckerPaths } from "../../src/lib/markdown/checker-alignment.js";
import { main } from "../../src/scripts/lint-markdown-underwrap.js";

const git = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const entryPaths = ["packages/arc-framework/src/scripts/lint-markdown-underwrap.ts"];
const good = `${"This well-wrapped prose explains the behavior in enough detail to reach the minimum width."}\nShort ending.\n`;
const bad = "Short first line.\nThe next word would fit.\n";
let sourcePaths: readonly string[];
let root: string;
let messages: string[];

async function write(path: string, content: string | Uint8Array): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

beforeAll(async () => {
  sourcePaths = await resolveIndexedMarkdownCheckerPaths({ root: repositoryRoot, entryPaths,
    readBlob: async (cwd, path) => readFile(join(cwd, path)) });
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-underwrap-"));
  await git("git", ["init", "-q", "--initial-branch=main"], { cwd: root });
  await Promise.all([...sourcePaths, "package.json", "packages/arc-framework/package.json", "package-lock.json",
    ".arc/system/arc-checks.yml"].map(async path => write(path, await readFile(join(repositoryRoot, path)))));
  await write("guide.md", good);
  await write("untouched.md", bad);
  await git("git", ["add", "--all"], { cwd: root });
  await git("git", ["-c", "user.name=Test", "-c", "user.email=t@example.com", "commit", "-qm", "baseline"], { cwd: root });
  messages = [];
  vi.spyOn(process.stderr, "write").mockImplementation(chunk => { messages.push(String(chunk)); return true; });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
});

describe("changed indexed Markdown under-wrap check", () => {
  it.each([true, false])("certifies index bytes when worktree content disagrees (badIndex=%s)", async badIndex => {
    await write("guide.md", badIndex ? bad : good);
    await git("git", ["add", "guide.md"], { cwd: root });
    await write("guide.md", badIndex ? good : bad);
    const before = (await git("git", ["write-tree"], { cwd: root })).stdout;
    expect(await main(root, ["guide.md"])).toBe(badIndex ? 1 : 0);
    expect(messages.join("")).toBe(badIndex ? "guide.md:1 ARC001 Line is 17 columns; the next word fits within 120.\n" : "");
    expect((await git("git", ["write-tree"], { cwd: root })).stdout).toBe(before);
    expect(await readFile(join(root, "guide.md"), "utf8")).toBe(badIndex ? good : bad);
  });

  it("defaults to changed staged paths and leaves untouched under-wrap debt outside the check", async () => {
    await write("guide.md", `${good}\nA single-line added paragraph.\n`);
    await git("git", ["add", "guide.md"], { cwd: root });
    expect(await main(root, [])).toBe(0);
    expect(messages).toEqual([]);
  });

  it("does not report a clean result when there is no changed Markdown evidence", async () => {
    expect(await main(root, [])).toBe(5);
    expect(messages.join("")).toContain("No changed indexed Markdown files");
  });

  it("honors an inherited index without substituting the repository's main index", async () => {
    await write("guide.md", bad);
    await git("git", ["add", "guide.md"], { cwd: root });
    const indexFile = join(root, ".git", "checked-index");
    await writeFile(indexFile, await readFile(join(root, ".git", "index")));
    await git("git", ["reset", "--quiet", "HEAD", "--", "guide.md"], { cwd: root });
    vi.stubEnv("GIT_INDEX_FILE", indexFile);
    expect(await main(root, ["guide.md"])).toBe(1);
    expect(messages.join("")).toContain("guide.md:1 ARC001");
  });

  it("refuses a staged parser version the executing installation does not provide", async () => {
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    manifest.devDependencies["markdown-it"] = "99.0.0";
    await write("package.json", JSON.stringify(manifest));
    await git("git", ["add", "package.json"], { cwd: root });
    expect(await main(root, ["guide.md"])).toBe(1);
    expect(messages.join("")).toContain("Indexed markdown-it differs from the loaded parser");
  });

  it("refuses explicit excluded Markdown paths instead of reporting clean", async () => {
    await write(".arc/completed/excluded.md", bad);
    await git("git", ["add", ".arc/completed/excluded.md"], { cwd: root });
    expect(await main(root, [".arc/completed/excluded.md"])).toBe(1);
    expect(messages.join("")).toContain("Markdown path is excluded");
  });

  it.each(["pull_request", "push"])("runs the authored CI step on changed files for %s", async event => {
    await cp(join(repositoryRoot, "packages/arc-framework/src"), join(root, "packages/arc-framework/src"), { recursive: true });
    await write("scripts/run-ci-checks.mjs", await readFile(join(repositoryRoot, "scripts/run-ci-checks.mjs")));
    await write(".github/check-plumbing.yml", await readFile(join(repositoryRoot, ".github/check-plumbing.yml")));
    await write(".gitignore", "node_modules\n.arc-check-forecast.json\n");
    await symlink(join(repositoryRoot, "node_modules"), join(root, "node_modules"), "junction");
    await symlink(join(repositoryRoot, "packages/arc-framework/node_modules"),
      join(root, "packages/arc-framework/node_modules"), "junction");
    await git("git", ["add", "--all"], { cwd: root });
    await git("git", ["-c", "user.name=Test", "-c", "user.email=t@example.com", "commit", "-qm", "CI source fixture"], { cwd: root });
    const before = (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
    await write("guide.md", `${good}\nAn added paragraph.\n`);
    await git("git", ["add", "guide.md"], { cwd: root });
    if (event === "push") await git("git", ["-c", "user.name=Test", "-c", "user.email=t@example.com",
      "commit", "-qm", "pushed guide change"], { cwd: root });
    const forecast = await git(process.execPath, [join(repositoryRoot, "packages/arc-framework/dist/cli.js"),
      "check", "gate", "merge", "--ci", "--dry-run", "--json"], { cwd: root });
    await write(".arc-check-forecast.json", forecast.stdout);
    const workflow = load(await readFile(join(repositoryRoot, ".github/workflows/ci.yml"), "utf8")) as {
      jobs: Record<string, { steps: Array<{ id?: string; run?: string; env?: Record<string, string> }> }>;
    };
    const step = workflow.jobs["lint-typecheck"]?.steps.find(step => step.id === "markdown-underwrap");
    expect(step?.run).toBeTypeOf("string");
    const expressions: Record<string, string> = {
      "${{ github.event_name }}": event, "${{ github.event.before }}": before,
    };
    const stepEnv = Object.fromEntries(Object.entries(step?.env ?? {}).map(([key, expression]) => {
      if (!(expression in expressions)) throw new Error(`Unrecognized workflow expression: ${expression}`);
      return [key, expressions[expression]];
    }));
    const result = await git("bash", ["-e", "-o", "pipefail", "-c", step!.run!], {
      cwd: root, env: { ...process.env, ...stepEnv, FORCE_COLOR: undefined },
    }).catch(error => { throw new Error(`${error.stdout}\n${error.stderr}`); });
    expect(result.stdout).toContain("Checks: 1 passed.");
    expect(result.stdout + result.stderr).not.toContain("untouched.md");
    if (event === "push") {
      for (const invalidBase of ["", "0".repeat(40)]) {
        await expect(git("bash", ["-e", "-o", "pipefail", "-c", step!.run!], {
          cwd: root, env: { ...process.env, ...stepEnv, PUSH_BEFORE: invalidBase, FORCE_COLOR: undefined },
        })).rejects.toThrow();
      }
    }
  }, 60_000);

  it("selects only changed Markdown inputs even when a global package input changes", async () => {
    await write("guide.md", `${good}\nAn added paragraph.\n`);
    await write("package.json", `${await readFile(join(root, "package.json"), "utf8")}\n`);
    await git("git", ["add", "guide.md", "package.json"], { cwd: root });
    const result = await git(process.execPath, [join(repositoryRoot, "packages/arc-framework/dist/cli.js"),
      "check", "gate", "commit", "--staged", "--dry-run", "--json"], { cwd: root })
      .catch(error => { throw new Error(`${error.stdout}\n${error.stderr}`); });
    const checks = JSON.parse(result.stdout).result.checks.filter((check: { id: string }) => check.id === "lint:md:underwrap");
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ outcome: "would run" });
    expect(checks[0].batches.flat().filter((argument: string) => argument.endsWith(".md"))).toEqual(["guide.md"]);
  });
});
