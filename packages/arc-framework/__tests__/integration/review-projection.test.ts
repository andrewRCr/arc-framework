/**
 * Integration tests for `scripts/review-projection.sh`, the builder that projects one
 * work unit's review chunks as a stack of commits — one per chunk, each on the last —
 * and publishes them as `review-projection/<slug>/<k>` branches for stacked draft pull
 * requests.
 *
 * Every case runs against a throwaway repository: `main` holds the base, and
 * `feat/example` carries a change set spanning two directories, a deletion, a path with
 * a space, and an active work-unit meta that no projection may carry.
 *
 * @module
 */

import { describe, it, expect, afterEach } from "vitest";

import { REVIEW_PROJECTION_SCRIPT, runScript, type RunScriptResult } from "../helpers/run-script.js";
import {
  addBareRemote,
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  join,
  mkdir,
  writeFile,
} from "../helpers/integration.js";

/** Usage-error exit status. */
const EX_USAGE = 64;
/** Invalid chunk file or chunk coverage. */
const EX_DATAERR = 65;

/** Two chunks in stack order that together cover the fixture's change set. */
const TWO_CHUNKS = ["# Stack order: source first, then docs.", "[source]", "src/", "", "[docs]", "docs/", ""];

/** One parsed `build` output line. */
interface ProjectionLine {
  index: number;
  sha: string;
  name: string;
}

describe("review-projection.sh", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
  });

  async function git(cwd: string, ...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd });
    return stdout.trim();
  }

  async function write(repo: string, path: string, content: string): Promise<void> {
    await mkdir(join(repo, path, ".."), { recursive: true });
    await writeFile(join(repo, path), content);
  }

  /** Build the fixture: a base on `main`, optionally pushed, and `feat/example` checked out. */
  async function fixture(options: { remote?: boolean } = {}): Promise<string> {
    const repo = await createTempRepo("arc-review-projection-");
    tempDirs.push(repo);
    await write(repo, "src/core.ts", "export const core = 1;\n");
    await write(repo, "src/util.ts", "export const util = 1;\n");
    await write(repo, "docs/guide.md", "# Guide\n");
    await write(repo, "docs/old.md", "# Old\n");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-m", "base");
    if (options.remote === true) await addBareRemote(repo);
    await git(repo, "switch", "-c", "feat/example");
    await write(repo, "src/core.ts", "export const core = 2;\n");
    await write(repo, "src/extra.ts", "export const extra = 1;\n");
    await write(repo, "docs/guide.md", "# Guide\n\nRevised.\n");
    await write(repo, "docs/with space.md", "# Spaced\n");
    await write(repo, ".arc/active/meta-example.md", "# Metadata: example\n");
    await git(repo, "rm", "-q", "docs/old.md");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-m", "change");
    return repo;
  }

  /** Write a chunk file inside `.git/`, where it can never enter the change set. */
  async function chunkFile(repo: string, lines: readonly string[], name = "chunks"): Promise<string> {
    const path = join(repo, ".git", `review-${name}`);
    await writeFile(path, lines.join("\n"));
    return path;
  }

  function run(repo: string, ...args: string[]): Promise<RunScriptResult> {
    return runScript(REVIEW_PROJECTION_SCRIPT, args, { cwd: repo, timeout: 30_000 });
  }

  function parse(stdout: string): ProjectionLine[] {
    return stdout.trim().split("\n").map((line) => {
      const [index, sha, name] = line.split("\t");
      return { index: Number(index), sha: sha ?? "", name: name ?? "" };
    });
  }

  async function changedNames(repo: string, from: string, to: string): Promise<string[]> {
    const out = await git(repo, "-c", "core.quotePath=false", "diff", "--name-only", "--no-renames", from, to);
    return out === "" ? [] : out.split("\n");
  }

  async function remoteProjectionRefs(repo: string): Promise<Record<string, string>> {
    const out = await git(repo, "ls-remote", "origin", "refs/heads/review-projection/example/*");
    if (out === "") return {};
    return Object.fromEntries(out.split("\n").map((line) => {
      const [sha, ref] = line.split("\t");
      return [ref ?? "", sha ?? ""];
    }));
  }

  it("stacks one commit per chunk on the merge base, in chunk-file order", async () => {
    const repo = await fixture();
    const chunks = await chunkFile(repo, TWO_CHUNKS);

    const result = await run(repo, "build", "example", chunks, "--base-ref", "main");

    expect(result.exitCode, result.stderr).toBe(0);
    const lines = parse(result.stdout);
    expect(lines.map(({ index, name }) => [index, name])).toEqual([[0, "base"], [1, "source"], [2, "docs"]]);
    const [base, source, docs] = lines.map(({ sha }) => sha);
    expect(base).toBe(await git(repo, "merge-base", "main", "feat/example"));
    expect(await git(repo, "rev-parse", `${source}^`)).toBe(base);
    expect(await git(repo, "rev-parse", `${docs}^`)).toBe(source);
    expect(await changedNames(repo, base ?? "", source ?? "")).toEqual(["src/core.ts", "src/extra.ts"]);
    expect(await changedNames(repo, source ?? "", docs ?? "")).toEqual([
      "docs/guide.md",
      "docs/old.md",
      "docs/with space.md",
    ]);
  });

  it("matches the head outside .arc/active and carries no active artifact in any projection", async () => {
    const repo = await fixture();
    const chunks = await chunkFile(repo, TWO_CHUNKS);

    const result = await run(repo, "build", "example", chunks, "--base-ref", "main");

    expect(result.exitCode, result.stderr).toBe(0);
    const top = parse(result.stdout).at(-1)?.sha ?? "";
    await expect(execFileAsync("git", ["diff", "--quiet", top, "feat/example", "--", ".", ":(exclude).arc/active"], {
      cwd: repo,
    })).resolves.toBeDefined();
    for (const { sha } of parse(result.stdout)) {
      expect(await git(repo, "ls-tree", "-r", "--name-only", sha, "--", ".arc")).toBe("");
    }
    expect(result.stderr).toContain(".arc/active/meta-example.md");
  });

  it("keeps a deleted path until the chunk that deletes it", async () => {
    const repo = await fixture();
    const chunks = await chunkFile(repo, TWO_CHUNKS);

    const result = await run(repo, "build", "example", chunks, "--base-ref", "main");

    expect(result.exitCode, result.stderr).toBe(0);
    const [, source, docs] = parse(result.stdout).map(({ sha }) => sha);
    expect(await git(repo, "ls-tree", "--name-only", source ?? "", "docs/old.md")).toBe("docs/old.md");
    expect(await git(repo, "ls-tree", "--name-only", docs ?? "", "docs/old.md")).toBe("");
  });

  it("refuses a change set the chunks do not cover, naming each uncovered path", async () => {
    const repo = await fixture();
    const chunks = await chunkFile(repo, ["[source]", "src/"]);

    const result = await run(repo, "build", "example", chunks, "--base-ref", "main");

    expect(result.exitCode).toBe(EX_DATAERR);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("not covered");
    expect(result.stderr).toContain("docs/guide.md");
    expect(result.stderr).toContain("docs/old.md");
  });

  it("refuses a path that two chunks claim, naming both chunks", async () => {
    const repo = await fixture();
    const chunks = await chunkFile(repo, ["[source]", "src/", "[everything]", "src/core.ts", "docs/"]);

    const result = await run(repo, "build", "example", chunks, "--base-ref", "main");

    expect(result.exitCode).toBe(EX_DATAERR);
    expect(result.stderr).toMatch(/src\/core\.ts.*source.*everything/u);
  });

  it("refuses a chunk that covers no changed path", async () => {
    const repo = await fixture();
    const chunks = await chunkFile(repo, [...TWO_CHUNKS, "[nothing]", "lib/"]);

    const result = await run(repo, "build", "example", chunks, "--base-ref", "main");

    expect(result.exitCode).toBe(EX_DATAERR);
    expect(result.stderr).toContain("chunk 'nothing' covers no changed path");
  });

  it("refuses a pathspec before any chunk header", async () => {
    const repo = await fixture();
    const chunks = await chunkFile(repo, ["src/", "[docs]", "docs/"]);

    const result = await run(repo, "build", "example", chunks, "--base-ref", "main");

    expect(result.exitCode).toBe(EX_DATAERR);
    expect(result.stderr).toContain("before any [chunk] header");
  });

  it("rebuilds deterministically and keeps every chunk below a change unmoved", async () => {
    const repo = await fixture();
    const chunks = await chunkFile(repo, TWO_CHUNKS);
    const first = await run(repo, "build", "example", chunks, "--base-ref", "main");
    const again = await run(repo, "build", "example", chunks, "--base-ref", "main");
    expect(again.stdout).toBe(first.stdout);

    await write(repo, "docs/guide.md", "# Guide\n\nRevised after review.\n");
    await git(repo, "commit", "-am", "fix docs");
    const rebuilt = await run(repo, "build", "example", chunks, "--base-ref", "main");

    expect(rebuilt.exitCode, rebuilt.stderr).toBe(0);
    const before = parse(first.stdout);
    const after = parse(rebuilt.stdout);
    expect(after[1]?.sha).toBe(before[1]?.sha);
    expect(after[2]?.sha).not.toBe(before[2]?.sha);
  });

  it("publishes the base anchor and every chunk as projection branches, pruning chunks a rebuild dropped", async () => {
    const repo = await fixture({ remote: true });
    const chunks = await chunkFile(repo, TWO_CHUNKS);

    const published = await run(repo, "publish", "example", chunks, "--no-pr");

    expect(published.exitCode, published.stderr).toBe(0);
    const built = parse((await run(repo, "build", "example", chunks)).stdout);
    expect(await remoteProjectionRefs(repo)).toEqual(Object.fromEntries(
      built.map(({ index, sha }) => [`refs/heads/review-projection/example/${index}`, sha]),
    ));

    const merged = await chunkFile(repo, ["[everything]", "src/", "docs/"], "merged");
    const republished = await run(repo, "publish", "example", merged, "--no-pr");

    expect(republished.exitCode, republished.stderr).toBe(0);
    const rebuilt = parse((await run(repo, "build", "example", merged)).stdout);
    expect(await remoteProjectionRefs(repo)).toEqual(Object.fromEntries(
      rebuilt.map(({ index, sha }) => [`refs/heads/review-projection/example/${index}`, sha]),
    ));
  });

  it("closes a projection by deleting every projection branch", async () => {
    const repo = await fixture({ remote: true });
    const chunks = await chunkFile(repo, TWO_CHUNKS);
    expect((await run(repo, "publish", "example", chunks, "--no-pr")).exitCode).toBe(0);

    const closed = await run(repo, "close", "example", "--no-pr");

    expect(closed.exitCode, closed.stderr).toBe(0);
    expect(await remoteProjectionRefs(repo)).toEqual({});
  });

  it("exits with a usage error when no command is given", async () => {
    const result = await runScript(REVIEW_PROJECTION_SCRIPT, []);

    expect(result.exitCode).toBe(EX_USAGE);
    expect(result.stderr).toContain("Usage: review-projection.sh");
  });
});
