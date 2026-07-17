/**
 * Unit tests for the `teardown` verb — the arc-state authority gate, branch
 * resolution (slug enumeration + ambiguity), and the presence-guarded dispatch
 * decisions. The git mechanics of the composed legs (worktree-kind dispatch, the
 * merge-strategy-independent delete, prune) are exercised end-to-end with real git
 * in the integration tier; here the index and git seams are spied so the
 * orchestration is asserted in isolation.
 */

import { describe, it, expect } from "vitest";

import {
  runBranchTeardown,
  runTeardown,
  type TeardownContext,
} from "../../../../src/lib/work-unit/verbs/teardown.js";
import { contentDigest } from "../../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../../src/lib/canonical/managed-path.js";
import { artifactGroupDigest } from "../../../../src/lib/canonical/receipt-id.js";
import type { GitExec } from "../../../../src/lib/git/exec.js";
import type { LifecycleIndexFs, DirEntry } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { WorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import type { RetirementAuthorityPort } from "../../../../src/lib/work-unit/retirement-authority.js";

const CWD = "/repo";

interface MetaSpec {
  slug: string;
  /** Lifecycle tier directory under `.arc/` (e.g. `active`, `completed`). */
  tier: string;
  state: string;
  /** Optional nested subdir under the tier. */
  subdir?: string;
  /** Optional exact branch declaration (defaults to `[none]`). */
  branch?: string;
}

function metaFixturePath(meta: MetaSpec): string {
  const root = meta.subdir === undefined
    ? `.arc/${meta.tier}`
    : `.arc/${meta.tier}/${meta.subdir}`;
  return `${root}/meta-${meta.slug}.md`;
}

function metaFixtureContent(meta: MetaSpec): string {
  return `# Metadata: ${meta.slug}\n\n`
    + `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n`
    + `|-----------|-----------|------------|-----------|--------------|\n`
    + `| \`${meta.state}\` | \`andrew\` | \`${meta.branch ?? "[none]"}\` | \`Novel\` | \`P1\` |\n\n---\n`;
}

function metaFixtureDigest(meta: MetaSpec): `sha256:${string}` {
  return artifactGroupDigest([{
    path: validateManagedPath(metaFixturePath(meta)),
    state: "present",
    contentDigest: contentDigest(new TextEncoder().encode(metaFixtureContent(meta))),
  }]);
}

/** Build an injectable index fs over a fixed set of metas (absolute-path keyed). */
function buildIndexFs(metas: MetaSpec[]): LifecycleIndexFs {
  const dirs = new Map<string, DirEntry[]>();
  const files = new Map<string, string>();

  const ensureDir = (dir: string): DirEntry[] => {
    let entries = dirs.get(dir);
    if (entries === undefined) {
      entries = [];
      dirs.set(dir, entries);
    }
    return entries;
  };
  const addChildDir = (parent: string, name: string): void => {
    const entries = ensureDir(parent);
    if (!entries.some((e) => e.name === name && e.isDirectory())) {
      entries.push({ name, isDirectory: () => true });
    }
  };

  for (const meta of metas) {
    const tierAbs = `${CWD}/.arc/${meta.tier}`;
    const dirAbs = meta.subdir === undefined ? tierAbs : `${tierAbs}/${meta.subdir}`;
    const filename = `meta-${meta.slug}.md`;
    if (meta.subdir !== undefined) {
      const segments = meta.subdir.split("/");
      let parent = tierAbs;
      for (const seg of segments) {
        addChildDir(parent, seg);
        parent = `${parent}/${seg}`;
      }
    }
    ensureDir(dirAbs).push({ name: filename, isDirectory: () => false });
    files.set(`${dirAbs}/${filename}`, metaFixtureContent(meta));
  }

  return {
    readdir: (path) => {
      const entries = dirs.get(path);
      if (entries === undefined) return Promise.reject(new Error(`ENOENT: ${path}`));
      return Promise.resolve(entries);
    },
    readFile: (path) => {
      const content = files.get(path);
      if (content === undefined) return Promise.reject(new Error(`ENOENT: ${path}`));
      return Promise.resolve(content);
    },
  };
}

const SHIPPED_META: MetaSpec = { slug: "demo", tier: "completed", state: "Shipped", subdir: "2026-q2/01_demo" };
const ACTIVE_META: MetaSpec = { slug: "demo", tier: "active", state: "Active" };
/** A parked origin — `Active` phase, `backlog/planned/` location (the `park@Planning` shelf). */
const PARKED_META: MetaSpec = { slug: "demo", tier: "backlog", state: "Active", subdir: "planned/demo" };
const SHIPPED_RESULT_DIGEST = metaFixtureDigest(SHIPPED_META);

/** A configurable git exec spy. Routes by command; records calls. */
interface ExecOptions {
  /** Lifecycle metas exposed by the authoritative base ref (defaults to the checkout metas). */
  baseMetas?: readonly MetaSpec[];
  /** Branches `for-each-ref` reports. */
  branches?: string[];
  /** `git worktree list --porcelain` body. */
  worktreePorcelain?: string;
  /** Whether the branch still exists after a delete attempt (drives `branchDeleted`). */
  branchSurvivesDelete?: boolean;
  /** Whether the local `git branch -D` throws (simulates a force-delete failure). */
  branchDeleteThrows?: boolean;
  /** Whether the directional local compare-and-delete throws. */
  updateRefThrows?: boolean;
  /** `git cherry` body — default empty (every commit landed in base). */
  cherryOutput?: string;
  /** `git rev-list` body — default empty (the branch is contained upstream). */
  revListOutput?: string;
}

function buildExec(opts: ExecOptions = {}, metas: readonly MetaSpec[] = []): { exec: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  const branches = opts.branches ?? [];
  const deletedBranches = new Set<string>();
  const committedFiles = new Map(
    (opts.baseMetas ?? metas).map((meta) => [metaFixturePath(meta), metaFixtureContent(meta)]),
  );
  const exec: GitExec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const sub = args[0];
    if (sub === "for-each-ref") return { stdout: branches.join("\n") + "\n" };
    if (sub === "worktree" && args[1] === "list") return { stdout: opts.worktreePorcelain ?? "" };
    if (sub === "rev-parse") return { stdout: "deadbeef\n" };
    if (sub === "rev-list") return { stdout: opts.revListOutput ?? "" }; // empty → contained
    if (sub === "cherry") return { stdout: opts.cherryOutput ?? "" }; // default: landed in base
    if (sub === "ls-tree") return { stdout: [...committedFiles.keys()].join("\0") + "\0" };
    if (sub === "show") {
      const path = args[1]?.split(":", 2)[1];
      if (path !== undefined) {
        const content = committedFiles.get(path);
        if (content !== undefined) return { stdout: content };
      }
      throw new Error("not found");
    }
    if (sub === "branch" && args[1] === "-D") {
      if (opts.branchDeleteThrows) throw new Error("git branch -D failed");
      const deleted = args[2];
      if (deleted !== undefined) deletedBranches.add(deleted);
      return { stdout: "" };
    }
    if (sub === "update-ref" && args[1] === "-d") {
      if (opts.updateRefThrows) throw new Error("git update-ref failed");
      const ref = args[2];
      if (ref?.startsWith("refs/heads/")) deletedBranches.add(ref.slice("refs/heads/".length));
      return { stdout: "" };
    }
    if (sub === "show-ref") {
      if (opts.branchSurvivesDelete) return { stdout: "" };
      const ref = args[args.length - 1];
      const branch = ref?.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : undefined;
      if (branch !== undefined && branches.includes(branch) && !deletedBranches.has(branch)) {
        return { stdout: "" };
      }
      throw new Error("not found"); // ref gone → deleted
    }
    if (sub === "fetch") return { stdout: "" };
    if (sub === "status") return { stdout: "" }; // clean worktree
    return { stdout: "" };
  };
  return { exec, calls };
}

function buildCtx(metas: MetaSpec[], execOpts?: ExecOptions): { ctx: TeardownContext; calls: string[][] } {
  const { exec, calls } = buildExec(execOpts, metas);
  const committedFiles = new Map(metas.map((meta) => [metaFixturePath(meta), metaFixtureContent(meta)]));
  const authority: Pick<RetirementAuthorityPort, "authorize" | "revalidate"> = {
    authorize: async (request) => ({
      status: "authorized",
      authorization: request.requestedMode === "shipped" ? "merged-preserved" : "discard-confirmed",
      authorityVersion: "test-authority",
      evidence: request.requestedMode === "shipped"
        ? {
            kind: "shipped",
            expectedLifecycle: "completed",
            resultDigest: `sha256:${"0".repeat(64)}`,
            baseProofOid: request.head,
          }
        : {
            kind: "receipt",
            receiptId: `sha256:${"1".repeat(64)}`,
            transition: "abandon",
            expectedLifecycle: "nonexistent",
            resultDigest: `sha256:${"2".repeat(64)}`,
          },
      refs: { localOid: request.head, remote: null },
    }),
    revalidate: async () => ({ status: "valid" }),
  };
  return {
    ctx: {
      cwd: CWD,
      exec,
      indexFs: buildIndexFs(metas),
      chdir: () => {},
      authority,
      readBlob: async (_ref, path) => {
        const content = committedFiles.get(path);
        return content === undefined ? null : new TextEncoder().encode(content);
      },
    },
    calls,
  };
}

function installStatefulPrimaryProjection(
  ctx: TeardownContext,
  failures: { remote?: number; local?: number },
): () => string | null {
  const baseExec = ctx.exec;
  let primaryBranch: string | null = "plan/demo";
  let remoteFailures = failures.remote ?? 0;
  let localFailures = failures.local ?? 0;
  ctx.exec = async (cmd, args, opts) => {
    if (args[0] === "push" && args.some((arg) => arg.startsWith("--force-with-lease=")) && remoteFailures > 0) {
      remoteFailures -= 1;
      throw new Error("simulated remote transport failure");
    }
    if (args[0] === "update-ref" && args[1] === "-d" && localFailures > 0) {
      localFailures -= 1;
      throw new Error("simulated local ref lock");
    }
    const result = await baseExec(cmd, args, opts);
    if (args[0] === "switch" && args[1] !== undefined && args[1] !== "--detach") primaryBranch = args[1];
    return result;
  };
  ctx.scanWorktrees = async () => ({
    ok: true,
    worktrees: [{
      path: CWD,
      head: primaryBranch === "plan/demo" ? "abc" : "deadbeef",
      branch: primaryBranch,
      detached: false,
      primary: true,
    }],
  });
  return () => primaryBranch;
}

function installRemoteDeleteAuthority(ctx: TeardownContext, onAuthorize: () => void): void {
  const baseAuthority = ctx.authority;
  if (baseAuthority === undefined) throw new Error("missing test retirement authority");
  ctx.authority = {
    authorize: async (request) => {
      onAuthorize();
      const authorization = await baseAuthority.authorize(request);
      if (authorization.status === "refused") return authorization;
      return {
        ...authorization,
        refs: {
          localOid: request.head,
          remote: {
            remote: request.remote,
            oid: request.head,
            disposition: "delete" as const,
          },
        },
      };
    },
    revalidate: baseAuthority.revalidate,
  };
}

function enableSelfHusk(ctx: TeardownContext): void {
  ctx.cwd = CWD;
  ctx.worktreeFs = {
    directoryExists: async () => false,
    copyDirectory: async () => {},
    readFile: async () => "",
    writeFile: async () => {},
    mkdir: async () => {},
    readDir: async () => [],
    removeFile: async () => {},
  };
  ctx.now = () => Date.parse("2026-07-14T20:00:00.000Z");
  ctx.stampHusk = async (_path, husk) => {
    const marker: WorktreeMarker = {
      spawnedByArc: true,
      wuName: "demo",
      createdFor: { kind: "work-unit", name: "demo" },
      spawningIdentity: "andrew",
      createdAt: "2026-07-14T19:00:00.000Z",
      husk,
    };
    return { kind: "stamped", marker };
  };
}

function markerWithHusk(pathBranch = "feat/demo"): WorktreeMarker {
  return {
    spawnedByArc: true,
    wuName: "demo",
    createdFor: { kind: "work-unit", name: "demo" },
    spawningIdentity: "andrew",
    createdAt: "2026-07-14T19:00:00.000Z",
    husk: {
      sha: "def",
      at: "2026-07-14T20:00:00.000Z",
      subject: { kind: "work-unit", name: "demo" },
      branch: pathBranch,
    },
  };
}

function markerWithCurrentHusk(
  remoteRef: Exclude<NonNullable<WorktreeMarker["husk"]>["remoteRef"], undefined>,
  resultDigest: `sha256:${string}` = SHIPPED_RESULT_DIGEST,
): WorktreeMarker {
  return {
    ...markerWithHusk(),
    husk: {
      ...markerWithHusk().husk!,
      authorization: "merged-preserved",
      remoteRef,
      evidence: {
        kind: "shipped",
        expectedLifecycle: "completed",
        resultDigest,
        baseProofOid: "abc",
      },
    },
  };
}

function branchMarkerWithHusk(branch: string): WorktreeMarker {
  return {
    spawnedByArc: true,
    wuName: "demo",
    createdFor: { kind: "work-unit", name: "demo" },
    spawningIdentity: "andrew",
    createdAt: "2026-07-14T19:00:00.000Z",
    husk: {
      sha: "def",
      at: "2026-07-14T20:00:00.000Z",
      subject: { kind: "branch", ref: branch },
      branch,
    },
  };
}

describe("runTeardown — arc-state authority gate", () => {
  it("authorizes a `completed/` WU through the compatibility seam when protection is omitted", async () => {
    const { ctx } = buildCtx([SHIPPED_META], { branches: [] });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
  });

  it("refuses an `active/` WU through the compatibility seam when protection is omitted", async () => {
    const { ctx, calls } = buildCtx([ACTIVE_META]);

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/not shipped|completed/i);
    expect(calls).toEqual([]);
  });

  it("uses the remote base under full protection so a stale linked checkout can teardown a shipped WU", async () => {
    const { ctx, calls } = buildCtx([ACTIVE_META], {
      baseMetas: [SHIPPED_META],
      branches: [],
    });

    const result = await runTeardown(ctx, {
      name: "demo",
      base: "main",
      protection: "full",
    });

    expect(result.status).toBe("torn-down");
    expect(calls).toContainEqual([
      "git",
      "ls-tree",
      "--full-tree",
      "-r",
      "--name-only",
      "origin/main",
      "--",
      ".arc/completed/",
    ]);
  });

  it("refuses a nonexistent WU", async () => {
    const { ctx } = buildCtx([], { branches: [] });

    const result = await runTeardown(ctx, { name: "ghost", base: "main" });

    expect(result.status).toBe("rejected");
  });
});

describe("runTeardown — branch resolution", () => {
  it("resolves the WU branch by slug regardless of type prefix and reaps it", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["main", "feat/demo"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branch).toBe("feat/demo");
    expect(result.branchDeleted).toBe(true);
    expect(calls).toContainEqual(["git", "branch", "-D", "feat/demo"]);
  });

  it("is a no-op on the branch arm when no local branch maps (already reaped), still prunes", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["main"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branch).toBeNull();
    expect(result.branchDeleted).toBe(false);
    expect(calls.some((c) => c[1] === "branch" && c[2] === "-D")).toBe(false);
    // Prune still runs (cleans any lingering tracking refs).
    expect(calls).toContainEqual(["git", "fetch", "--prune", "origin"]);
  });

  it("refuses when more than one local branch maps to the slug (ambiguous)", async () => {
    const { ctx } = buildCtx([SHIPPED_META], { branches: ["feat/demo", "fix/demo"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/multiple local branches|ambiguous|resolve manually/i);
  });

  it("surfaces a push-state refusal (branch left intact) without dropping the WU", async () => {
    // `show-ref` reports the branch still present after the merged-safe delete →
    // the push-state gate refused (ahead of / no upstream); surface, don't fail.
    const { ctx } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      branchSurvivesDelete: true,
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branchDeleted).toBe(false);
    expect(result.notices.some((n) => /left intact/i.test(n))).toBe(true);
  });
});

describe("runTeardown — worktree dispatch (presence guard)", () => {
  const PRIMARY_PORCELAIN = "worktree /repo\nHEAD abc\nbranch refs/heads/main\n";

  it("in-place arm: branch lives in the primary worktree → relocate to base, no worktree removal", async () => {
    const porcelain =
      "worktree /repo\nHEAD abc\nbranch refs/heads/feat/demo\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      worktreePorcelain: porcelain,
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    // The branch maps to the primary worktree → no distinct worktree to remove,
    // but the primary must be switched off the branch before the delete.
    expect(result.worktreeRemoved).toBeNull();
    expect(calls.some((c) => c[1] === "worktree" && c[2] === "remove")).toBe(false);
    expect(calls).toContainEqual(["git", "switch", "main"]);
    // The relocation precedes the branch delete (a checked-out branch can't be deleted).
    const switchIdx = calls.findIndex((c) => c[1] === "switch");
    const deleteIdx = calls.findIndex((c) => c[1] === "branch" && c[2] === "-D");
    expect(switchIdx).toBeLessThan(deleteIdx);
    // The refreshed remote base is fast-forwarded into the local base after the switch.
    expect(calls).toContainEqual(["git", "merge", "--ff-only", "origin/main"]);
    expect(result.notices.some((n) => /relocated the primary worktree/i.test(n))).toBe(true);
  });

  it("linked arm: branch lives in a distinct worktree → that worktree is removed", async () => {
    const porcelain =
      PRIMARY_PORCELAIN +
      "\nworktree /repo-feat-demo\nHEAD def\nbranch refs/heads/feat/demo\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      worktreePorcelain: porcelain,
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.worktreeRemoved).toBe("/repo-feat-demo");
    expect(calls).toContainEqual(["git", "worktree", "remove", "/repo-feat-demo"]);
    // Worktree removal precedes the branch delete (a checked-out branch can't be deleted).
    const removeIdx = calls.findIndex((c) => c[1] === "worktree" && c[2] === "remove");
    const deleteIdx = calls.findIndex((c) => c[1] === "branch" && c[2] === "-D");
    expect(removeIdx).toBeLessThan(deleteIdx);
  });
});

describe("runTeardown — linked self-husk", () => {
  const SELF_PORCELAIN =
    "worktree /primary\nHEAD abc\nbranch refs/heads/main\n\n"
    + "worktree /repo\nHEAD def\nbranch refs/heads/feat/demo\n";

  it("refuses when the retirement port cannot authorize the live projection", async () => {
    const { ctx, calls } = buildCtx([ACTIVE_META], {
      branches: ["feat/demo"],
      worktreePorcelain: SELF_PORCELAIN,
    });
    enableSelfHusk(ctx);
    ctx.authority = {
      authorize: async () => ({ status: "refused", reason: "evidence-missing" }),
      revalidate: async () => ({ status: "refused", reason: "authority-conflict" }),
    };

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result).toMatchObject({ status: "rejected", huskRefusal: "authorization-refused" });
    expect(calls.some((call) => call[1] === "switch" && call[2] === "--detach")).toBe(false);
  });

  it("detaches, stamps, and reaps refs while retaining the current worktree", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      worktreePorcelain: SELF_PORCELAIN,
    });
    enableSelfHusk(ctx);

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.worktreeRemoved).toBeNull();
    expect(result.husk).toEqual({
      worktreePath: "/repo",
      subject: { kind: "work-unit", name: "demo" },
      branch: "feat/demo",
      stamped: true,
      outcome: "created",
    });
    expect(calls).toContainEqual(["git", "switch", "--detach", "def"]);
    expect(calls.some((call) => call[1] === "worktree" && call[2] === "remove")).toBe(false);
    expect(calls.findIndex((call) => call[1] === "switch")).toBeLessThan(
      calls.findIndex((call) => call[1] === "update-ref" && call[2] === "-d"),
    );
  });

  it("refuses a dirty self-worktree before detach", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      worktreePorcelain: SELF_PORCELAIN,
    });
    enableSelfHusk(ctx);
    const baseExec = ctx.exec;
    ctx.exec = async (cmd, args, opts) =>
      args[0] === "status" ? { stdout: " M dirty.ts" } : baseExec(cmd, args, opts);

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result).toMatchObject({ status: "rejected", huskRefusal: "dirty" });
    expect(calls.some((call) => call[1] === "switch" && call[2] === "--detach")).toBe(false);
  });

  it("refuses unproven preservation before detach", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      worktreePorcelain: SELF_PORCELAIN,
      revListOutput: "unpublished\n",
      cherryOutput: "+ unmerged\n",
    });
    enableSelfHusk(ctx);
    ctx.authority = {
      authorize: async () => ({ status: "refused", reason: "preservation-unproven" }),
      revalidate: async () => ({ status: "refused", reason: "authority-conflict" }),
    };

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result).toMatchObject({ status: "rejected", huskRefusal: "authorization-refused" });
    expect(calls.some((call) => call[1] === "switch" && call[2] === "--detach")).toBe(false);
  });

  it("refuses a blocked user-surface reconcile before detach", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      worktreePorcelain: SELF_PORCELAIN,
    });
    enableSelfHusk(ctx);
    const directory = (name: string) => ({ name, isDirectory: () => true, isFile: () => false });
    const file = (name: string) => ({ name, isDirectory: () => false, isFile: () => true });
    if (ctx.worktreeFs === undefined) throw new Error("self-husk filesystem seam missing");
    ctx.worktreeFs.readDir = async (path) => path.endsWith("/.arc/user")
      ? [directory("andrew")]
      : [file("FUTURE.md")];
    ctx.worktreeFs.readFile = async (path) => path.startsWith("/repo/.arc/user") ? "linked\n" : "primary\n";

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result).toMatchObject({ status: "rejected", huskRefusal: "user-surfaces" });
    expect(calls.some((call) => call[1] === "switch" && call[2] === "--detach")).toBe(false);
  });

  it("refuses when the mutating user-surface reconcile becomes blocked", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      worktreePorcelain: SELF_PORCELAIN,
    });
    enableSelfHusk(ctx);
    const directory = (name: string) => ({ name, isDirectory: () => true, isFile: () => false });
    const file = (name: string) => ({ name, isDirectory: () => false, isFile: () => true });
    if (ctx.worktreeFs === undefined) throw new Error("self-husk filesystem seam missing");
    ctx.worktreeFs.readDir = async (path) => path.endsWith("/.arc/user")
      ? [directory("andrew")]
      : [file("FUTURE.md")];
    let linkedReads = 0;
    ctx.worktreeFs.readFile = async (path) => {
      if (path.startsWith("/repo/.arc/user")) {
        linkedReads += 1;
        return "linked\n";
      }
      return linkedReads === 1 ? "linked\n" : "primary\n";
    };

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result).toMatchObject({ status: "rejected", huskRefusal: "user-surfaces" });
    expect(calls.some((call) => call[1] === "switch" && call[2] === "--detach")).toBe(false);
  });

  it("completes as an externally managed husk when stamping fails", async () => {
    const { ctx } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      worktreePorcelain: SELF_PORCELAIN,
    });
    enableSelfHusk(ctx);
    ctx.stampHusk = async () => { throw new Error("disk full"); };

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.husk).toMatchObject({ stamped: false, outcome: "created" });
    expect(result.notices).toContain("Could not stamp the detached worktree (disk full).");
  });

  it("returns a retained-branch husk when local deletion fails after detach", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      worktreePorcelain: SELF_PORCELAIN,
      updateRefThrows: true,
      branchSurvivesDelete: true,
    });
    enableSelfHusk(ctx);

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branchDeleted).toBe(false);
    expect(result.husk?.outcome).toBe("created");
    expect(result.notices.some((notice) => /compare-and-delete/iu.test(notice))).toBe(true);
    expect(calls.some((call) => call[1] === "push" && call.includes("--delete"))).toBe(false);
    expect(calls).toContainEqual(["git", "fetch", "--prune", "origin"]);
  });
});

describe("runTeardown — detached husk replay", () => {
  it("selects one exact absolute husk path when repeated retirements exist", async () => {
    const porcelain =
      "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n"
      + "worktree /repo.husk-one\nHEAD def\ndetached\n\n"
      + "worktree /repo.husk-two\nHEAD def\ndetached\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["main"], worktreePorcelain: porcelain });
    ctx.readMarker = async () => ({ kind: "present", marker: markerWithHusk() });

    const ambiguous = await runTeardown(ctx, { name: "demo", base: "main" });
    expect(ambiguous).toMatchObject({ status: "rejected" });

    const selected = await runTeardown(ctx, { name: "demo", base: "main", huskPath: "/repo.husk-two" });
    expect(selected).toMatchObject({ status: "torn-down", worktreeRemoved: "/repo.husk-two" });
    expect(calls).toContainEqual(["git", "worktree", "remove", "/repo.husk-two"]);
  });

  it("refuses a relative husk selector", async () => {
    const { ctx } = buildCtx([SHIPPED_META], { branches: ["main"] });
    expect(await runTeardown(ctx, { name: "demo", base: "main", huskPath: "relative/husk" })).toMatchObject({
      status: "rejected",
      reason: expect.stringMatching(/absolute/iu),
    });
  });

  it("removes an exact clean stamped candidate from outside", async () => {
    const porcelain =
      "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n"
      + "worktree /repo.husk\nHEAD def\ndetached\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["main"], worktreePorcelain: porcelain });
    ctx.readMarker = async () => ({ kind: "present", marker: markerWithHusk() });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.worktreeRemoved).toBe("/repo.husk");
    expect(result.husk?.outcome).toBe("already-husked");
    expect(calls).toContainEqual(["git", "worktree", "remove", "/repo.husk"]);
  });

  it("retains a branchless replay husk when its persisted remote retain proof no longer resolves", async () => {
    const porcelain =
      "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n"
      + "worktree /repo.husk\nHEAD def\ndetached\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["main"], worktreePorcelain: porcelain });
    ctx.readMarker = async () => ({
      kind: "present",
      marker: markerWithCurrentHusk({
        remote: "origin",
        oid: "def",
        disposition: "retain",
      }),
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.worktreeRemoved).toBeNull();
    expect(result.notices).toContainEqual(expect.stringMatching(/preservation ref.*changed/iu));
    expect(calls.some((call) => call[1] === "worktree" && call[2] === "remove")).toBe(false);
  });

  it("resolves a branchless replay's persisted leased delete before physical husk removal", async () => {
    const porcelain =
      "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n"
      + "worktree /repo.husk\nHEAD def\ndetached\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["main"], worktreePorcelain: porcelain });
    ctx.readMarker = async () => ({
      kind: "present",
      marker: markerWithCurrentHusk({
        remote: "origin",
        oid: "def",
        disposition: "delete",
      }),
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result).toMatchObject({ status: "torn-down", worktreeRemoved: "/repo.husk", remoteBranchDeleted: true });
    const remoteIdx = calls.findIndex((call) => call[1] === "push" && call.some((arg) => arg.includes("force-with-lease")));
    const removeIdx = calls.findIndex((call) => call[1] === "worktree" && call[2] === "remove");
    expect(remoteIdx).toBeGreaterThanOrEqual(0);
    expect(remoteIdx).toBeLessThan(removeIdx);
  });

  it("vetoes replay when a completed-locus restart declares the stamped branch", async () => {
    const porcelain =
      "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n"
      + "worktree /repo.husk\nHEAD def\ndetached\n";
    const restartedMeta: MetaSpec = { ...SHIPPED_META, branch: "feat/demo" };
    const { ctx, calls } = buildCtx([restartedMeta], {
      branches: ["feat/demo"],
      worktreePorcelain: porcelain,
    });
    ctx.readMarker = async () => ({
      kind: "present",
      marker: markerWithCurrentHusk(null, metaFixtureDigest(restartedMeta)),
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result).toMatchObject({ status: "torn-down", branchDeleted: false, worktreeRemoved: null });
    expect(calls.some((call) => call[1] === "update-ref" && call[2] === "-d")).toBe(false);
    expect(calls.some((call) => call[1] === "worktree" && call[2] === "remove")).toBe(false);
  });

  it("never removes a replayed husk from inside its own cwd", async () => {
    const porcelain =
      "worktree /primary\nHEAD abc\nbranch refs/heads/main\n\n"
      + "worktree /repo\nHEAD def\ndetached\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["main"], worktreePorcelain: porcelain });
    ctx.readMarker = async () => ({ kind: "present", marker: markerWithHusk() });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.worktreeRemoved).toBeNull();
    expect(result.husk?.outcome).toBe("already-husked");
    expect(calls.some((call) => call[1] === "worktree" && call[2] === "remove")).toBe(false);
  });

  it("rejects a surviving ref that disagrees with the husk's stamped branch", async () => {
    const porcelain =
      "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n"
      + "worktree /repo.husk\nHEAD def\ndetached\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["fix/demo"],
      worktreePorcelain: porcelain,
    });
    ctx.readMarker = async () => ({ kind: "present", marker: markerWithHusk("feat/demo") });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/stamped branch.*does not match `fix\/demo`/iu);
    expect(calls.some((call) => call[1] === "worktree" && call[2] === "remove")).toBe(false);
    expect(calls.some((call) => call[1] === "branch" && call[2] === "-D")).toBe(false);
  });

  it("rejects a checked-out same-slug branch that disagrees with the husk's stamped branch", async () => {
    const porcelain =
      "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n"
      + "worktree /repo.fix\nHEAD fed\nbranch refs/heads/fix/demo\n\n"
      + "worktree /repo.husk\nHEAD def\ndetached\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["fix/demo"],
      worktreePorcelain: porcelain,
    });
    ctx.readMarker = async () => ({ kind: "present", marker: markerWithHusk("feat/demo") });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/stamped branch.*does not match `fix\/demo`/iu);
    expect(calls.some((call) => call[1] === "worktree" && call[2] === "remove")).toBe(false);
    expect(calls.some((call) => call[1] === "branch" && call[2] === "-D")).toBe(false);
  });

  it("refuses multiple detached worktrees with the same exact terminal identity", async () => {
    const porcelain =
      "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n"
      + "worktree /repo.husk-one\nHEAD def\ndetached\n\n"
      + "worktree /repo.husk-two\nHEAD def\ndetached\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["main"], worktreePorcelain: porcelain });
    ctx.readMarker = async () => ({ kind: "present", marker: markerWithHusk() });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/multiple detached worktrees/iu);
    expect(calls.some((call) => call[1] === "worktree" && call[2] === "remove")).toBe(false);
  });

  it("returns truthful retained-ref state when an inside-husk retry still cannot delete", async () => {
    const porcelain =
      "worktree /primary\nHEAD abc\nbranch refs/heads/main\n\n"
      + "worktree /repo\nHEAD def\ndetached\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      worktreePorcelain: porcelain,
      branchDeleteThrows: true,
      branchSurvivesDelete: true,
    });
    ctx.readMarker = async () => ({ kind: "present", marker: markerWithHusk() });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.husk?.outcome).toBe("already-husked");
    expect(result.branchDeleted).toBe(false);
    expect(result.worktreeRemoved).toBeNull();
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toMatch(/retry teardown from the husk or primary/iu);
    expect(calls.some((call) => call[1] === "worktree" && call[2] === "remove")).toBe(false);
  });

  it("refuses a candidate whose live HEAD moved past its stamp", async () => {
    const porcelain =
      "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n"
      + "worktree /repo.husk\nHEAD moved\ndetached\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["main"], worktreePorcelain: porcelain });
    ctx.readMarker = async () => ({ kind: "present", marker: markerWithHusk() });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("rejected");
    expect(calls.some((call) => call[1] === "worktree" && call[2] === "remove")).toBe(false);
  });
});

describe("runTeardown — base refresh before the reap-safety check", () => {
  it("fetches `origin/<base>` before the merged-safe delete (order-independent reap)", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["feat/demo"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    // The base is refreshed (fetch `origin main`) ahead of the containment-gated
    // delete, so a stale local base can't false-negative a merged branch.
    const fetchIdx = calls.findIndex(
      (c) => c[1] === "fetch" && c[2] === "origin" && c[3] === "main",
    );
    const deleteIdx = calls.findIndex((c) => c[1] === "branch" && c[2] === "-D");
    expect(fetchIdx).toBeGreaterThanOrEqual(0);
    expect(fetchIdx).toBeLessThan(deleteIdx);
  });
});

describe("runTeardown — remote-head cleanup (shipped)", () => {
  it("deletes the live remote head when the landed-in-base proof holds", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["feat/demo"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branchDeleted).toBe(true);
    expect(result.remoteBranchDeleted).toBe(true);
    expect(calls).toContainEqual(["git", "push", "origin", "--delete", "feat/demo"]);
    // The landed proof is read before the local delete consumes the branch ref.
    const cherryIdx = calls.findIndex((c) => c[1] === "cherry");
    const deleteIdx = calls.findIndex((c) => c[1] === "branch" && c[2] === "-D");
    expect(cherryIdx).toBeGreaterThanOrEqual(0);
    expect(cherryIdx).toBeLessThan(deleteIdx);
  });

  it("leaves the remote head when it is the sole proven preservation (upstream-only)", async () => {
    // `cherry` reports an unlanded commit (the multi-commit-squash shape), while
    // upstream containment still proves preservation → local delete lands, but
    // the remote head is where the work is kept — never deleted.
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      cherryOutput: "+ deadbeef",
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branchDeleted).toBe(true);
    expect(result.remoteBranchDeleted).toBe(false);
    expect(calls.some((c) => c[1] === "push" && c.includes("--delete"))).toBe(false);
    expect(result.notices.some((n) => /remote branch.*left intact/i.test(n))).toBe(true);
  });

  it("treats an already-gone remote head as the idempotent no-op (delete-on-merge)", async () => {
    const { ctx } = buildCtx([SHIPPED_META], { branches: ["feat/demo"] });
    const baseExec = ctx.exec;
    ctx.exec = async (cmd, args) => {
      if (args[0] === "push" && args.includes("--delete")) throw new Error("remote ref does not exist");
      return baseExec(cmd, args);
    };

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branchDeleted).toBe(true);
    expect(result.remoteBranchDeleted).toBe(false);
    expect(result.notices.some((n) => /remote/i.test(n))).toBe(false);
  });

  it("degrades an actionable remote-head delete failure to a notice, still torn-down", async () => {
    const { ctx } = buildCtx([SHIPPED_META], { branches: ["feat/demo"] });
    const baseExec = ctx.exec;
    ctx.exec = async (cmd, args) => {
      if (args[0] === "push" && args.includes("--delete")) throw new Error("connection refused");
      return baseExec(cmd, args);
    };

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branchDeleted).toBe(true);
    expect(result.remoteBranchDeleted).toBe(false);
    expect(result.notices.some((n) => /could not delete the remote branch/i.test(n))).toBe(true);
  });
});

describe("runTeardown — abandoned mode (un-shipped / force)", () => {
  const PRIMARY_PORCELAIN = "worktree /repo\nHEAD abc\nbranch refs/heads/main\n";

  it("accepts a parked (`backlog/planned/`) origin — un-shipped arc-state", async () => {
    const { ctx } = buildCtx([PARKED_META], {
      branches: ["plan/demo"],
      worktreePorcelain: "worktree /repo\nHEAD def\nbranch refs/heads/plan/demo\n",
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result.status).toBe("torn-down");
  });

  it("accepts a retired (removed → nonexistent) origin — no meta on disk", async () => {
    const { ctx } = buildCtx([], {
      branches: ["plan/demo"],
      worktreePorcelain: "worktree /repo\nHEAD def\nbranch refs/heads/plan/demo\n",
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result.status).toBe("torn-down");
  });

  it("refuses a remotely shipped WU under full protection even when the checkout is stale", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["feat/demo"] });

    ctx.indexFs = buildIndexFs([ACTIVE_META]);
    const result = await runTeardown(ctx, {
      name: "demo",
      base: "main",
      mode: "abandoned",
      protection: "full",
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/shipped|merged-safe|completed/i);
    expect(calls).toContainEqual([
      "git",
      "ls-tree",
      "--full-tree",
      "-r",
      "--name-only",
      "origin/main",
      "--",
      ".arc/completed/",
    ]);
  });

  it("refuses an unregistered non-shipped branch without retirement authority", async () => {
    const { ctx, calls } = buildCtx([], { branches: ["plan/demo"] });
    ctx.authority = {
      authorize: async () => ({ status: "refused", reason: "projection-mismatch" }),
      revalidate: async () => ({ status: "refused", reason: "authority-conflict" }),
    };

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result).toMatchObject({ status: "rejected", huskRefusal: "authorization-refused" });
    expect(calls.some((call) => call[1] === "branch" && call[2] === "-D")).toBe(false);
    expect(calls.some((call) => call[1] === "push" && call.includes("--delete"))).toBe(false);
  });

  it("mode selection routes correctly: shipped uses the containment-gated delete, not force", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["feat/demo"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "shipped" });

    expect(result.status).toBe("torn-down");
    // The merged-safe path consults containment before any delete; the force path
    // never does. The remote head is deleted here only because the landed-in-base
    // proof holds (the spy's `cherry` reports every commit landed).
    expect(calls.some((c) => c[1] === "rev-list" || c[1] === "cherry")).toBe(true);
    expect(calls.some((c) => c[1] === "push" && c.includes("--delete"))).toBe(true);
  });

  it("in-place arm under abandoned mode: authorizes, switches the primary, then compare-deletes", async () => {
    const porcelain = "worktree /repo\nHEAD abc\nbranch refs/heads/plan/demo\n";
    const { ctx, calls } = buildCtx([PARKED_META], {
      branches: ["plan/demo"],
      worktreePorcelain: porcelain,
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.worktreeRemoved).toBeNull();
    expect(calls.some((c) => c[1] === "worktree" && c[2] === "remove")).toBe(false);
    expect(calls).toContainEqual(["git", "switch", "main"]);
    // The relocation precedes the exact compare-delete (a checked-out branch can't be deleted).
    const switchIdx = calls.findIndex((c) => c[1] === "switch");
    const deleteIdx = calls.findIndex((c) => c[1] === "update-ref" && c[2] === "-d");
    expect(switchIdx).toBeLessThan(deleteIdx);
  });

  it("keeps the abandoned primary branch checked out when remote cleanup fails, then retries", async () => {
    const { ctx, calls } = buildCtx([], {
      branches: ["plan/demo"],
      worktreePorcelain: "worktree /repo\nHEAD abc\nbranch refs/heads/plan/demo\n",
    });
    const currentPrimaryBranch = installStatefulPrimaryProjection(ctx, { remote: 1 });
    let authorizationCount = 0;
    installRemoteDeleteAuthority(ctx, () => { authorizationCount += 1; });

    const first = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(first).toMatchObject({ status: "torn-down", branchDeleted: false, remoteBranchDeleted: false });
    if (first.status !== "torn-down") return;
    expect(first.notices.some((notice) => /simulated remote transport failure/iu.test(notice))).toBe(true);
    expect(currentPrimaryBranch()).toBe("plan/demo");
    expect(calls.some((call) => call[1] === "switch")).toBe(false);

    const retry = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(retry).toMatchObject({ status: "torn-down", branchDeleted: true, remoteBranchDeleted: true });
    expect(authorizationCount).toBe(2);
    expect(currentPrimaryBranch()).toBe("main");
  });

  it("restores the abandoned primary branch when local CAS fails, then retries", async () => {
    const { ctx, calls } = buildCtx([], {
      branches: ["plan/demo"],
      worktreePorcelain: "worktree /repo\nHEAD abc\nbranch refs/heads/plan/demo\n",
    });
    const currentPrimaryBranch = installStatefulPrimaryProjection(ctx, { local: 1 });
    let authorizationCount = 0;
    const baseAuthority = ctx.authority;
    if (baseAuthority === undefined) throw new Error("missing test retirement authority");
    ctx.authority = {
      authorize: async (request) => {
        authorizationCount += 1;
        return await baseAuthority.authorize(request);
      },
      revalidate: baseAuthority.revalidate,
    };

    const first = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(first).toMatchObject({ status: "torn-down", branchDeleted: false });
    if (first.status !== "torn-down") return;
    expect(first.notices.some((notice) => /simulated local ref lock/iu.test(notice))).toBe(true);
    expect(first.notices.some((notice) => /Restored the primary worktree/iu.test(notice))).toBe(true);
    expect(currentPrimaryBranch()).toBe("plan/demo");
    expect(calls.filter((call) => call[1] === "switch")).toEqual([
      ["git", "switch", "main"],
      ["git", "switch", "plan/demo"],
    ]);

    const retry = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(retry).toMatchObject({ status: "torn-down", branchDeleted: true });
    expect(authorizationCount).toBe(2);
    expect(currentPrimaryBranch()).toBe("main");
  });

  it("linked arm under abandoned mode stamps and detaches before ref cleanup, then removes the resolved husk", async () => {
    const porcelain =
      PRIMARY_PORCELAIN +
      "\nworktree /repo-plan-demo\nHEAD def\nbranch refs/heads/plan/demo\n";
    const { ctx, calls } = buildCtx([PARKED_META], {
      branches: ["plan/demo"],
      worktreePorcelain: porcelain,
    });
    enableSelfHusk(ctx);

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.worktreeRemoved).toBe("/repo-plan-demo");
    expect(calls).toContainEqual(["git", "worktree", "remove", "/repo-plan-demo"]);
    expect(calls).toContainEqual(["git", "switch", "--detach", "def"]);
    const removeIdx = calls.findIndex((c) => c[1] === "worktree" && c[2] === "remove");
    const deleteIdx = calls.findIndex((c) => c[1] === "update-ref" && c[2] === "-d");
    expect(deleteIdx).toBeLessThan(removeIdx);
  });

  it.each([
    {
      label: "linked worktree",
      porcelain:
        PRIMARY_PORCELAIN
        + "\nworktree /repo-plan-demo\nHEAD def\nbranch refs/heads/plan/demo\n",
    },
    {
      label: "in-place primary worktree",
      porcelain: "worktree /repo\nHEAD def\nbranch refs/heads/plan/demo\n",
    },
  ])("refuses a $label before projection mutation when retirement authority is missing", async ({ porcelain }) => {
    const { ctx, calls } = buildCtx([PARKED_META], {
      branches: ["plan/demo"],
      worktreePorcelain: porcelain,
    });
    ctx.authority = {
      authorize: async () => ({ status: "refused", reason: "evidence-missing" }),
      revalidate: async () => ({ status: "refused", reason: "authority-conflict" }),
    };

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result).toMatchObject({
      status: "rejected",
      huskRefusal: "authorization-refused",
    });
    expect(calls.some((call) => call[1] === "worktree" && call[2] === "remove")).toBe(false);
    expect(calls.some((call) => call[1] === "switch")).toBe(false);
    expect(calls.some((call) => call[1] === "branch" && call[2] === "-D")).toBe(false);
    expect(calls.some((call) => call[1] === "update-ref" && call[2] === "-d")).toBe(false);
  });
});

describe("runBranchTeardown — recordless cheap branches", () => {
  it("reaps an exact recordless chore branch without an arc-state gate", async () => {
    const { ctx, calls } = buildCtx([], { branches: ["chore/groom-demo"] });

    const result = await runBranchTeardown(ctx, { branch: "chore/groom-demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branch).toBe("chore/groom-demo");
    expect(result.branchDeleted).toBe(true);
    expect(calls).toContainEqual(["git", "branch", "-D", "chore/groom-demo"]);
    // The cheap-branch path shares the shipped arm, so a lingering live remote
    // head is cleaned under the same landed-in-base proof.
    expect(calls).toContainEqual(["git", "push", "origin", "--delete", "chore/groom-demo"]);
    // Exact ref enumeration is projection-only; no lifecycle-index gate is involved.
    expect(calls).toContainEqual([
      "git",
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads/chore/groom-demo",
    ]);
  });

  it("husks a recordless self-worktree using the terminal branch subject", async () => {
    const branch = "chore/groom-demo";
    const porcelain =
      "worktree /primary\nHEAD abc\nbranch refs/heads/main\n\n"
      + `worktree /repo\nHEAD def\nbranch refs/heads/${branch}\n`;
    const { ctx, calls } = buildCtx([], { branches: [branch], worktreePorcelain: porcelain });
    enableSelfHusk(ctx);

    const result = await runBranchTeardown(ctx, { branch, base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.husk).toMatchObject({
      subject: { kind: "branch", ref: branch },
      branch,
      stamped: true,
      outcome: "created",
    });
    expect(result.worktreeRemoved).toBeNull();
    expect(calls.some((call) => call[1] === "worktree" && call[2] === "remove")).toBe(false);
  });

  it("is idempotent when the recordless branch is already absent", async () => {
    const { ctx, calls } = buildCtx([], { branches: [] });

    const result = await runBranchTeardown(ctx, { branch: "chore/groom-demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branch).toBeNull();
    expect(result.branchDeleted).toBe(false);
    expect(calls.some((c) => c[1] === "branch" && c[2] === "-D")).toBe(false);
    expect(calls).toContainEqual(["git", "fetch", "--prune", "origin"]);
  });

  it("removes an exact stamped recordless husk from outside", async () => {
    const branch = "chore/groom-demo";
    const porcelain =
      "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n"
      + "worktree /repo.husk\nHEAD def\ndetached\n";
    const { ctx, calls } = buildCtx([], { branches: [], worktreePorcelain: porcelain });
    ctx.readMarker = async () => ({ kind: "present", marker: branchMarkerWithHusk(branch) });

    const result = await runBranchTeardown(ctx, { branch, base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.husk).toMatchObject({
      subject: { kind: "branch", ref: branch },
      branch,
      outcome: "already-husked",
    });
    expect(result.worktreeRemoved).toBe("/repo.husk");
    expect(calls).toContainEqual(["git", "worktree", "remove", "/repo.husk"]);
  });

  it("refuses non-chore branches so WU and errand records keep their authoritative teardown paths", async () => {
    const { ctx, calls } = buildCtx([], { branches: ["feat/demo"] });

    const result = await runBranchTeardown(ctx, { branch: "feat/demo", base: "main" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/chore\/<slug>|cheap branches/i);
    expect(calls).toEqual([]);
  });

  it.each(["chore/", "chore/groom demo", "chore/groom/demo"])(
    "refuses malformed chore branch `%s` before the absence fallback",
    async (branch) => {
      const { ctx, calls } = buildCtx([], { branches: [] });

      const result = await runBranchTeardown(ctx, { branch, base: "main" });

      expect(result.status).toBe("rejected");
      if (result.status !== "rejected") return;
      expect(result.reason).toMatch(/slug-safe/i);
      expect(calls).toEqual([]);
    },
  );
});
