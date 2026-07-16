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
import { canonicalDigest } from "../../src/lib/canonical/canonical-json.js";
import { validateManagedPath } from "../../src/lib/canonical/managed-path.js";
import { createUserIOContext, readGitBlobBytes } from "../../src/lib/io-context.js";
import { getInternalTemplatePath } from "../../src/lib/paths.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import type { DecomposeParams } from "../../src/lib/work-unit/decompose-cut-map.js";
import { createInRepoDecomposeRetirementDriver } from "../../src/lib/work-unit/decompose-retirement-driver.js";
import {
  resolveRetirementRecordPath,
  writeRetirementRecord,
} from "../../src/lib/work-unit/retirement-record-store.js";
import {
  runDecompose,
  runPreparedDecompose,
  type RunDecomposeContext,
} from "../../src/lib/work-unit/verbs/decompose.js";
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

function decomposeDriver(repo: string, failStage = false) {
  const baseExec = repoExec(repo);
  const exec: GitExec = async (cmd, args, options) => {
    if (failStage && cmd === "git" && args[0] === "add") throw new Error("injected final staging failure");
    return await baseExec(cmd, args, options);
  };
  return createInRepoDecomposeRetirementDriver({
    cwd: repo,
    exec,
    lifecycleFs: {
      readdir: (path) => readdir(path, { withFileTypes: true }),
      readFile: (path) => readFile(path, "utf8"),
    },
    readFile: (path) => readFile(path, "utf8"),
    readBlob: (ref, path) => readGitBlobBytes(repo, ref, path),
    createRecord: (receiptId, content) => writeRetirementRecord(repo, receiptId, content),
    removeRecord: (receiptId) => rm(resolveRetirementRecordPath(repo, receiptId)),
  });
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
      incomingEdges: [
        { dependent: "dep", disposition: { kind: "replace", replacementTargets: ["alpha", "beta"] } },
      ],
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

  it("runs the prepared mutation and receipt-addressed finalization as one durable transition", async () => {
    await writeWu(repo, ".arc/active", "mono", { State: "Planning", Branch: "plan/mono", Origin: "[internal]" });
    await writeWu(repo, ".arc/active", "dep", { State: "Active", Branch: "feat/dep", "Depends On": "mono" });
    await commitAll(repo, "origin + dependent");
    await execFileAsync("git", ["branch", "plan/mono", "HEAD"], { cwd: repo });

    const sourcePath = validateManagedPath(".arc/active/draft-mono.md");
    const sourceId = canonicalDigest({
      schemaVersion: 2,
      sourcePath,
      sourceLocator: { artifact: "draft-mono.md", kind: "preamble" },
    });
    const cut: DecomposeParams = {
      schemaVersion: 2,
      origin: { slug: "mono", phase: "Planning", location: "active" },
      shape: "symmetric",
      parentPosition: "standalone",
      cohort: "mono",
      entries: [newMember("alpha"), newMember("beta")],
      internalEdges: [],
      sourceAllocations: [{
        sourceId,
        disposition: {
          kind: "target",
          destinationId: "alpha",
          targetLocator: { artifact: "draft-alpha.md", kind: "preamble" },
        },
      }],
      incomingEdges: [
        { dependent: "dep", disposition: { kind: "replace", replacementTargets: ["alpha"] } },
      ],
      outgoingEdges: [],
    };
    const driver = decomposeDriver(repo);
    const prepared = await driver.prepare(cut);
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;

    const mutation = await runPreparedDecompose(decomposeCtx(repo), { cut, preparation: prepared.preparation });
    expect(mutation.status).toBe("decomposed");
    if (mutation.status !== "decomposed") return;
    await driver.stagePreparedResult(prepared.preparation);

    const targetDraft = join(repo, ".arc/backlog/planned/mono/alpha/draft-alpha.md");
    await writeFile(targetDraft, `${await readFile(targetDraft, "utf8")}\nPreserved origin framing.\n`);
    await execFileAsync("git", ["add", "--", targetDraft], { cwd: repo });

    const failed = await decomposeDriver(repo, true).finalize("mono", prepared.preparation.locator.receiptId);
    expect(failed).toMatchObject({ status: "refused", reason: "authority-unavailable" });
    expect(JSON.parse(await readFile(
      resolveRetirementRecordPath(repo, prepared.preparation.locator.receiptId),
      "utf8",
    ))).toMatchObject({ kind: "prepared-decompose" });

    const finalized = await driver.finalize("mono", prepared.preparation.locator.receiptId);
    if (finalized.status === "refused") throw new Error(JSON.stringify(finalized));
    expect(finalized).toMatchObject({ status: "recorded" });
    const stored = JSON.parse(await readFile(
      resolveRetirementRecordPath(repo, prepared.preparation.locator.receiptId),
      "utf8",
    )) as { transition?: string; kind?: string };
    expect(stored).toMatchObject({ transition: "decompose" });
    expect(stored.kind).not.toBe("prepared-decompose");
  });

  it("admits an existing-home meta when it receives an outgoing dependency", async () => {
    await writeWu(repo, ".arc/active", "mono", {
      State: "Planning",
      Branch: "plan/mono",
      Origin: "[internal]",
      "Depends On": "foundation",
    });
    await writeWu(repo, ".arc/active", "foundation", { State: "Active", Branch: "feat/foundation" });
    await writeWu(repo, ".arc/active", "home", { State: "Active", Branch: "feat/home" });
    await commitAll(repo, "origin + existing dependency home");
    await execFileAsync("git", ["branch", "plan/mono", "HEAD"], { cwd: repo });

    const sourcePath = validateManagedPath(".arc/active/draft-mono.md");
    const cut: DecomposeParams = {
      schemaVersion: 2,
      origin: { slug: "mono", phase: "Planning", location: "active" },
      shape: "heterogeneous-home",
      parentPosition: "standalone",
      cohort: "mono",
      entries: [
        newMember("alpha"),
        {
          kind: "existing-home",
          destinationId: "home",
          target: { kind: "work-unit", slug: "home" },
          home: "fold",
        },
      ],
      internalEdges: [],
      sourceAllocations: [{
        sourceId: canonicalDigest({
          schemaVersion: 2,
          sourcePath,
          sourceLocator: { artifact: "draft-mono.md", kind: "preamble" },
        }),
        disposition: {
          kind: "target",
          destinationId: "alpha",
          targetLocator: { artifact: "draft-alpha.md", kind: "preamble" },
        },
      }],
      incomingEdges: [],
      outgoingEdges: [{
        prerequisite: "foundation",
        disposition: { kind: "targets", targets: ["home"] },
      }],
    };

    const prepared = await decomposeDriver(repo).prepare(cut);
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;
    expect(prepared.preparation.record.allowedPaths).toContain(".arc/active/meta-home.md");
  });

  it("refuses a new-member slug already present in the lifecycle index", async () => {
    await writeWu(repo, ".arc/active", "mono", { State: "Planning", Branch: "plan/mono" });
    await writeWu(repo, ".arc/active", "alpha", { State: "Active", Branch: "feat/alpha" });
    await commitAll(repo, "origin + occupied member");
    await execFileAsync("git", ["branch", "plan/mono", "HEAD"], { cwd: repo });

    const cut: DecomposeParams = {
      schemaVersion: 2,
      origin: { slug: "mono", phase: "Planning", location: "active" },
      shape: "symmetric",
      parentPosition: "standalone",
      cohort: "mono",
      entries: [newMember("alpha"), newMember("beta")],
      internalEdges: [],
      sourceAllocations: [],
      incomingEdges: [],
      outgoingEdges: [],
    };
    expect(await decomposeDriver(repo).prepare(cut)).toMatchObject({
      status: "refused",
      reason: expect.stringMatching(/alpha.*already exists/i),
    });
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
