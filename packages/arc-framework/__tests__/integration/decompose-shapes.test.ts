/**
 * Integration coverage for `runDecompose`'s executable shapes, against real git.
 *
 * The unit suite drives the executor's legs over spies; this replays the three
 * executable shapes end-to-end through the real binder seams (`buildExecutorContext`
 * + `node:fs/promises`) over a temp repo, asserting the on-disk result the spies
 * can't: member skeletons actually written, the origin's artifacts actually removed
 * (or kept), and an incoming dependent's `Depends On` actually re-pointed and staged.
 * The started origin's branch + worktree teardown is out-of-band, so the verb returns
 * its locators here and the real reap is covered through the CLI seam in the
 * `lifecycle-exit` E2E — not fabricated with a cross-worktree state the CLI never makes.
 *
 * (ROADMAP regen is a forward-compat advisory in production — `roadmap-tooling`
 * owns the real render — so the shapes assert origin disposition + scaffold +
 * re-point, the deterministic on-disk facts, not a ROADMAP.md delta.)
 */

import { execFile } from "node:child_process";
import { readdir, rm, rmdir, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { parseMetaRecord, renderMetaFile, type MetaFieldOverrides } from "../../src/lib/active/meta-reader.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { getInternalTemplatePath } from "../../src/lib/paths.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import type { DecomposeParams } from "../../src/lib/work-unit/decompose-cut-map.js";
import { runDecompose, type RunDecomposeContext } from "../../src/lib/work-unit/verbs/decompose.js";
import { createTempRepo, cleanupTempDir, type GitExec } from "../helpers/integration.js";

const execFileAsync = promisify(execFile);
const IDENTITY = "test-user";

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function commitAll(repo: string, message: string): Promise<void> {
  await execFileAsync("git", ["add", "-A"], { cwd: repo });
  await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", message], { cwd: repo });
}

/** Write a managed meta (+ a placeholder draft) for a fixture WU at a repo-relative dir. */
async function writeWu(repo: string, relDir: string, slug: string, over: MetaFieldOverrides): Promise<void> {
  await mkdir(join(repo, relDir), { recursive: true });
  await writeFile(join(repo, relDir, `meta-${slug}.md`), renderMetaFile(slug, over));
  await writeFile(join(repo, relDir, `draft-${slug}.md`), `# Draft: ${slug}\n\n- **Purpose:** —\n\n---\n`);
}

/**
 * A repo-rooted git executor that honors a per-call `cwd` override — mirroring the
 * production exec's behavior (the simplified `makeGitExec` drops it), so a leg that
 * scopes a command to a specific path resolves it there, not at the base repo.
 */
function repoExec(repo: string): GitExec {
  return async (cmd, args, opts) => {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd: opts?.cwd ?? repo });
    return { stdout: stdout.trimEnd(), stderr };
  };
}

/** Build the real `runDecompose` context over a temp repo (mirrors the handler's binding). */
function decomposeCtx(repo: string): RunDecomposeContext {
  const io = { ...createUserIOContext(), exec: repoExec(repo) };
  const executor = buildExecutorContext({
    cwd: repo,
    io,
    identity: IDENTITY,
    teamMode: false,
    internalTemplateDir: getInternalTemplatePath(),
  });
  return {
    executor,
    fs: { mkdir: io.mkdir, writeFile: io.writeFile },
    removeFs: { readdir: (path) => readdir(path), rm: (path) => rm(path), rmdir: (path) => rmdir(path) },
  };
}

function newMember(slug: string, dependsOn: string[] = []): DecomposeParams["entries"][number] {
  void dependsOn;
  return { kind: "new-member", destinationId: slug, slug, workClass: "Light" };
}

describe("runDecompose shapes — end-to-end against a real repo", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await createTempRepo("arc-decompose-");
    await mkdir(join(repo, ".arc", "active"), { recursive: true });
    await mkdir(join(repo, ".arc", "backlog", "planned"), { recursive: true });
    await mkdir(join(repo, ".arc", "system"), { recursive: true });
    await writeFile(join(repo, ".arc", "system", "arc-config.yml"), "branch.base: main\nbranch.protection: partial\n");
    await commitAll(repo, "scaffold .arc");
  });

  afterEach(async () => {
    await cleanupTempDir(repo);
  });

  it("symmetric: retires a started origin's artifacts, defers teardown out-of-band, scaffolds members, re-points a dependent", async () => {
    // The real run-context: the started origin and a standalone dependent live in
    // `active/` on the working branch where decompose runs. No cross-worktree
    // artifice (origin committed to `main` + a separate clean worktree) full
    // protection never produces — and none is needed, because the branch + worktree
    // teardown is out-of-band: the verb returns its locators (meta-sourced) and the
    // reap belongs to `arc teardown --force`, covered end-to-end at the E2E tier.
    await writeWu(repo, ".arc/active", "mono", { State: "Planning", Branch: "plan/mono", Origin: "[internal]" });
    await writeWu(repo, ".arc/active", "dep", { State: "Active", Branch: "feat/dep", "Depends On": "mono" });
    await commitAll(repo, "origin + dependent");

    const cut: DecomposeParams = {
      schemaVersion: 2,
      origin: { slug: "mono", phase: "Planning", location: "active" },
      shape: "symmetric",
      parentPosition: "standalone",
      cohort: "mono",
      entries: [newMember("alpha"), newMember("beta")],
      internalEdges: [{ from: "beta", to: "alpha" }],
      sourceAllocations: [],
      incomingEdges: [],
      outgoingEdges: [],
    };

    const result = await runDecompose(decomposeCtx(repo), { cut });

    expect(result.status).toBe("decomposed");
    if (result.status !== "decomposed") return;
    expect(result.result.origin).toBe("retired");

    // Members scaffolded with both skeletons under the new cohort.
    expect(await pathExists(join(repo, ".arc/backlog/planned/mono/alpha/meta-alpha.md"))).toBe(true);
    expect(await pathExists(join(repo, ".arc/backlog/planned/mono/beta/draft-beta.md"))).toBe(true);
    // The internal edge landed on the dependent member.
    const beta = parseMetaRecord(await readFile(join(repo, ".arc/backlog/planned/mono/beta/meta-beta.md"), "utf8"));
    expect(beta["Depends On"]).toContain("alpha");

    // Origin artifacts removed in-verb; the branch + worktree teardown is deferred —
    // the verb reaps nothing and returns the meta-sourced locators instead.
    expect(await pathExists(join(repo, ".arc/active/meta-mono.md"))).toBe(false);
    expect(result.result.teardown).toEqual({ slug: "mono", branch: "plan/mono" });

    // The dependent's incoming edge re-pointed to the delivering members, and staged.
    expect(result.result.repointed).toEqual([{ dependent: "dep", to: ["alpha", "beta"] }]);
    const depStaged = parseMetaRecord(
      (await execFileAsync("git", ["show", ":.arc/active/meta-dep.md"], { cwd: repo })).stdout,
    );
    expect(depStaged["Depends On"]).toContain("alpha");
    expect(depStaged["Depends On"]).toContain("beta");
    expect(depStaged["Depends On"]).not.toContain("mono");
  });

  it("extraction: keeps the origin in place, mints only the extracted member with its dependency edge", async () => {
    await writeWu(repo, ".arc/active", "mono", { State: "Active", Branch: "feat/mono" });
    await commitAll(repo, "active origin");

    const cut: DecomposeParams = {
      schemaVersion: 2,
      origin: { slug: "mono", phase: "Active", location: "active" },
      shape: "extraction",
      parentPosition: "standalone",
      cohort: "mono",
      entries: [
        newMember("alpha", ["mono"]),
        { kind: "surviving-origin", destinationId: "mono", slug: "mono", disposition: "keep-active" },
      ],
      internalEdges: [],
      sourceAllocations: [],
      incomingEdges: [],
      outgoingEdges: [{ prerequisite: "mono", disposition: { kind: "targets", targets: ["alpha"] } }],
    };

    const result = await runDecompose(decomposeCtx(repo), { cut });

    expect(result.status).toBe("decomposed");
    if (result.status !== "decomposed") return;
    expect(result.result.origin).toBe("survived");
    expect(result.result.repointed).toEqual([]);

    // The origin survives in place; only the extracted member is minted, depending on the origin.
    expect(await pathExists(join(repo, ".arc/active/meta-mono.md"))).toBe(true);
    expect(await pathExists(join(repo, ".arc/backlog/planned/mono/alpha/meta-alpha.md"))).toBe(true);
    const alpha = parseMetaRecord(await readFile(join(repo, ".arc/backlog/planned/mono/alpha/meta-alpha.md"), "utf8"));
    expect(alpha["Depends On"]).toContain("mono");
  });

  it("backlog-stub-source: retires a planned stub in place (artifacts removed, no branch), prunes the emptied subdir", async () => {
    // The origin is a planned stub at the cap (cohort `parent/sub`); its members fan
    // out laterally as siblings, so retiring it leaves an emptied own-subdir to prune.
    await writeWu(repo, ".arc/backlog/planned/parent/sub/mono", "mono", { State: "Planning", Cohort: "parent/sub" });
    await commitAll(repo, "backlog stub origin");

    const cut: DecomposeParams = {
      schemaVersion: 2,
      origin: { slug: "mono", phase: "Planning", location: "planned" },
      shape: "backlog-stub-source",
      parentPosition: "at-cap",
      entries: [newMember("alpha"), newMember("beta")],
      internalEdges: [],
      sourceAllocations: [],
      incomingEdges: [],
      outgoingEdges: [],
    };

    const result = await runDecompose(decomposeCtx(repo), { cut });

    expect(result.status).toBe("decomposed");
    if (result.status !== "decomposed") return;
    expect(result.result.origin).toBe("retired");

    // Members fan out as siblings under the origin's existing cohort.
    expect(await pathExists(join(repo, ".arc/backlog/planned/parent/sub/alpha/meta-alpha.md"))).toBe(true);
    // Origin artifacts removed and its now-empty own subdir pruned; the parent cohort dir survives.
    expect(await pathExists(join(repo, ".arc/backlog/planned/parent/sub/mono/meta-mono.md"))).toBe(false);
    expect(await pathExists(join(repo, ".arc/backlog/planned/parent/sub/mono"))).toBe(false);
    expect(await pathExists(join(repo, ".arc/backlog/planned/parent/sub"))).toBe(true);
  });
});
