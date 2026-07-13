/** Real-Git coverage for proof-gated canonical notes publication. */

import { afterEach, describe, expect, it } from "vitest";

import {
  addBareRemote,
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
  makeGitExecInput,
  makeNotesTreeCommit,
} from "../helpers/integration.js";
import {
  planBranchBoundedNotesExport,
  pushBranchBoundedNotesExport,
} from "../../src/lib/user-sync/branch-bounded-notes-export.js";
import type { GitExec } from "../../src/lib/git/index.js";

const IDENTITY = "test-user";
const NOTES_REF = `refs/notes/arc/user/${IDENTITY}`;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

describe("canonical notes publication", () => {
  const cleanup = new Set<string>();

  afterEach(async () => {
    await Promise.all([...cleanup].map((path) => cleanupTempDir(path)));
    cleanup.clear();
  });

  async function harness(prefix: string): Promise<{ repo: string; remote: string; base: string }> {
    const repo = await createTempRepo(prefix);
    cleanup.add(repo);
    const base = await makeCommit(repo, "base");
    const remote = await addBareRemote(repo);
    cleanup.add(remote);
    return { repo, remote, base };
  }

  it("plans the exact captured canonical tip when its history is public", async () => {
    const { repo, base } = await harness("arc-notes-canonical-safe-");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "public note", base]);
    const capturedTip = await git(repo, ["rev-parse", NOTES_REF]);

    await expect(planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
    })).resolves.toEqual({
      kind: "planned",
      target: { destinationRef: NOTES_REF, capturedTip },
    });
    expect(await git(repo, ["for-each-ref", "--format=%(refname)", `${NOTES_REF}__publication_`])).toBe("");
  });

  it("reserves no-local-notes for a verified absent canonical ref", async () => {
    const { repo } = await harness("arc-notes-canonical-absent-");

    await expect(planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
    })).resolves.toEqual({ kind: "skipped", reason: "no-local-notes" });
  });

  it("accepts a well-formed SHA-256 canonical tip", async () => {
    const tip = "a".repeat(64);
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: `${tip}\n`, stderr: "" };
      if (args[0] === "ls-remote" || args[0] === "ls-tree" || args[0] === "log") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "update-ref" && args[1] === "-d") return { stdout: "", stderr: "" };
      throw new Error(`unexpected git invocation: ${args.join(" ")}`);
    };

    await expect(planBranchBoundedNotesExport({ exec, identity: IDENTITY })).resolves.toEqual({
      kind: "planned",
      target: { destinationRef: NOTES_REF, capturedTip: tip },
    });
  });

  it("fails malformed local tips and unexpected local-ref errors instead of treating them as absent", async () => {
    const malformedExec: GitExec = async () => ({ stdout: "not-an-object-id\n", stderr: "" });
    await expect(planBranchBoundedNotesExport({ exec: malformedExec, identity: IDENTITY }))
      .resolves.toMatchObject({ kind: "failed" });

    const failure = Object.assign(new Error("object database unavailable"), { code: 128 });
    const failingExec: GitExec = async () => { throw failure; };
    await expect(planBranchBoundedNotesExport({ exec: failingExec, identity: IDENTITY }))
      .resolves.toEqual({ kind: "failed", error: failure });
  });

  it.each([
    ["malformed", `invalid\t${NOTES_REF}\n`],
    ["duplicate", `${"a".repeat(40)}\t${NOTES_REF}\n${"b".repeat(40)}\t${NOTES_REF}\n`],
    ["mismatched", `${"a".repeat(40)}\trefs/notes/arc/user/someone-else\n`],
  ])("fails %s exact remote-ref membership output", async (_case, remoteOutput) => {
    const { repo, base } = await harness(`arc-notes-canonical-remote-${_case}-`);
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "public note", base]);
    const realExec = makeGitExec(repo);
    const exec: GitExec = async (command, args, options) => args[0] === "ls-remote"
      ? { stdout: remoteOutput, stderr: "" }
      : realExec(command, args, options);

    await expect(planBranchBoundedNotesExport({
      exec,
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
    })).resolves.toMatchObject({ kind: "failed" });
  });

  it("publishes deletion-bearing history instead of treating its empty tree as absent", async () => {
    const { repo, base } = await harness("arc-notes-canonical-deletion-");
    const root = await makeNotesTreeCommit(repo, [{ commit: base, content: "removed" }]);
    const deletion = await makeNotesTreeCommit(repo, [], { parents: [root.tip], message: "delete note" });
    await git(repo, ["update-ref", NOTES_REF, deletion.tip]);

    await expect(planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
    })).resolves.toEqual({
      kind: "planned",
      target: { destinationRef: NOTES_REF, capturedTip: deletion.tip },
    });
  });

  it("refuses unpublished annotated history without mutating canonical refs", async () => {
    const { repo, remote } = await harness("arc-notes-canonical-unpublished-");
    await git(repo, ["checkout", "-b", "feat/private"]);
    const privateCommit = await makeCommit(repo, "private");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "private note", privateCommit]);
    const localBefore = await git(repo, ["rev-parse", NOTES_REF]);

    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
    });
    expect(plan).toMatchObject({ kind: "refused", reason: "unpublished-history" });
    expect(plan.kind === "refused" ? plan.message : "").toContain("Publish those commits on a live origin branch");
    expect(plan.kind === "refused" ? plan.message : "").toContain("preflighted `arc user push`");
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localBefore);
    expect(await git(remote, ["for-each-ref", "--format=%(refname)", NOTES_REF])).toBe("");
  });

  it("distinguishes ordinary divergence from incompatible compaction lineage", async () => {
    const ordinary = await harness("arc-notes-canonical-diverged-");
    const local = await makeNotesTreeCommit(ordinary.repo, [{ commit: ordinary.base, content: "local" }]);
    const remote = await makeNotesTreeCommit(ordinary.repo, [{ commit: ordinary.base, content: "remote" }]);
    await git(ordinary.repo, ["update-ref", NOTES_REF, local.tip]);
    await git(ordinary.repo, ["push", "origin", `${remote.tip}:${NOTES_REF}`]);

    const ordinaryPlan = await planBranchBoundedNotesExport({
      exec: makeGitExec(ordinary.repo),
      execInput: makeGitExecInput(ordinary.repo),
      identity: IDENTITY,
    });
    expect(ordinaryPlan).toMatchObject({ kind: "refused", reason: "history-diverged" });
    expect(ordinaryPlan.kind === "refused" ? ordinaryPlan.message : "")
      .toContain("preflighted `arc user push`");

    const compacted = await harness("arc-notes-canonical-compaction-");
    const compactLocal = await makeNotesTreeCommit(compacted.repo, [{ commit: compacted.base, content: "local" }], {
      manifest: { version: 1, generation: 1, preCompactionTip: null, pruned: [] },
    });
    const compactRemote = await makeNotesTreeCommit(compacted.repo, [{ commit: compacted.base, content: "remote" }], {
      manifest: { version: 1, generation: 2, preCompactionTip: compactLocal.tip, pruned: [] },
    });
    await git(compacted.repo, ["update-ref", NOTES_REF, compactLocal.tip]);
    await git(compacted.repo, ["push", "origin", `${compactRemote.tip}:${NOTES_REF}`]);

    const compactionPlan = await planBranchBoundedNotesExport({
      exec: makeGitExec(compacted.repo),
      execInput: makeGitExecInput(compacted.repo),
      identity: IDENTITY,
    });
    expect(compactionPlan).toMatchObject({ kind: "refused", reason: "compaction-lineage" });
    const compactionMessage = compactionPlan.kind === "refused" ? compactionPlan.message : "";
    expect(compactionMessage).toContain("accept the remote snapshot");
    expect(compactionMessage).toContain("fresh authoritative save after manual canonical-ref repair");
    expect(compactionMessage.toLowerCase()).not.toMatch(/sort|force-push|blind retry/u);
  });

  it.each(["local-newer", "one-sided", "same-generation-mismatch"] as const)(
    "refuses %s compaction metadata before ordinary divergence routing",
    async (variant) => {
      const { repo, base } = await harness(`arc-notes-canonical-${variant}-`);
      const pruned = [{ blob: "d".repeat(40), commit: base }];
      const localManifest = variant === "local-newer"
        ? { version: 1 as const, generation: 2, preCompactionTip: null, pruned: [] }
        : { version: 1 as const, generation: 1, preCompactionTip: null, pruned: [] };
      const remoteManifest = variant === "one-sided"
        ? null
        : variant === "local-newer"
          ? { version: 1 as const, generation: 1, preCompactionTip: null, pruned: [] }
          : { version: 1 as const, generation: 1, preCompactionTip: null, pruned };
      const local = await makeNotesTreeCommit(repo, [{ commit: base, content: "local" }], {
        manifest: localManifest,
      });
      const remote = await makeNotesTreeCommit(repo, [{ commit: base, content: "remote" }], {
        ...(remoteManifest === null ? {} : { manifest: remoteManifest }),
      });
      await git(repo, ["update-ref", NOTES_REF, local.tip]);
      await git(repo, ["push", "origin", `${remote.tip}:${NOTES_REF}`]);

      await expect(planBranchBoundedNotesExport({
        exec: makeGitExec(repo),
        execInput: makeGitExecInput(repo),
        identity: IDENTITY,
      })).resolves.toMatchObject({ kind: "refused", reason: "compaction-lineage" });
    },
  );

  it("routes diverged histories with equal complete manifests to ordinary reconciliation", async () => {
    const { repo, base } = await harness("arc-notes-canonical-equal-manifest-");
    const manifest = { version: 1 as const, generation: 1, preCompactionTip: null, pruned: [] };
    const local = await makeNotesTreeCommit(repo, [{ commit: base, content: "local" }], { manifest });
    const remote = await makeNotesTreeCommit(repo, [{ commit: base, content: "remote" }], { manifest });
    await git(repo, ["update-ref", NOTES_REF, local.tip]);
    await git(repo, ["push", "origin", `${remote.tip}:${NOTES_REF}`]);

    await expect(planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
    })).resolves.toMatchObject({ kind: "refused", reason: "history-diverged" });
  });

  it("keeps non-ancestry command failures out of the ordinary divergence class", async () => {
    const { repo, base } = await harness("arc-notes-canonical-ancestry-error-");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "remote", base]);
    await git(repo, ["push", "origin", NOTES_REF]);
    const later = await makeCommit(repo, "later");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "local", later]);
    const realExec = makeGitExec(repo);
    const ancestryFailure = Object.assign(new Error("missing commit graph"), { code: 128 });
    const exec: GitExec = async (command, args, options) => {
      if (args[0] === "merge-base") throw ancestryFailure;
      return realExec(command, args, options);
    };

    await expect(planBranchBoundedNotesExport({
      exec,
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
    })).resolves.toEqual({ kind: "failed", error: ancestryFailure });
  });

  it("fails unreadable compaction metadata and never invokes canonical mutators", async () => {
    const { repo, base } = await harness("arc-notes-canonical-manifest-error-");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "public note", base]);
    const realExec = makeGitExec(repo);
    const calls: string[][] = [];
    const exec: GitExec = async (command, args, options) => {
      calls.push(args);
      if (args[0] === "ls-tree") {
        return { stdout: `100644 blob ${"a".repeat(40)}\twrong-path\n`, stderr: "" };
      }
      return realExec(command, args, options);
    };

    await expect(planBranchBoundedNotesExport({
      exec,
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
    })).resolves.toMatchObject({ kind: "failed" });
    expect(calls.some((args) => args[0] === "notes")).toBe(false);
    expect(calls.some((args) => args[0] === "commit-tree")).toBe(false);
    expect(calls.some((args) => args[0] === "update-ref" && args[1] !== "-d")).toBe(false);
  });

  it("does not let caller-unique temp-ref cleanup failure mask a safe plan", async () => {
    const { repo, base } = await harness("arc-notes-canonical-cleanup-error-");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "public note", base]);
    const capturedTip = await git(repo, ["rev-parse", NOTES_REF]);
    const realExec = makeGitExec(repo);
    let cleanupAttempts = 0;
    const exec: GitExec = async (command, args, options) => {
      if (args[0] === "update-ref" && args[1] === "-d") {
        cleanupAttempts += 1;
        throw new Error("cleanup denied");
      }
      return realExec(command, args, options);
    };

    await expect(planBranchBoundedNotesExport({
      exec,
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
    })).resolves.toEqual({
      kind: "planned",
      target: { destinationRef: NOTES_REF, capturedTip },
    });
    expect(cleanupAttempts).toBe(1);
  });

  it("returns the equal immutable target without requiring publication plumbing", async () => {
    const { repo, base } = await harness("arc-notes-canonical-equal-");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "public note", base]);
    await git(repo, ["push", "origin", NOTES_REF]);
    const capturedTip = await git(repo, ["rev-parse", NOTES_REF]);

    const plan = await planBranchBoundedNotesExport({ exec: makeGitExec(repo), identity: IDENTITY });
    expect(plan).toEqual({
        kind: "planned",
        target: { destinationRef: NOTES_REF, capturedTip },
      });
    if (plan.kind !== "planned") return;
    await expect(pushBranchBoundedNotesExport({ exec: makeGitExec(repo), target: plan.target }))
      .resolves.toEqual({ kind: "noop" });
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(capturedTip);
  });

  it("pushes only the captured tip when the local canonical ref advances later", async () => {
    const { repo, remote, base } = await harness("arc-notes-canonical-pinned-");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "first", base]);
    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
    });
    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;

    await git(repo, ["checkout", "-b", "feat/later"]);
    const later = await makeCommit(repo, "later local save");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "later", later]);
    const localAfter = await git(repo, ["rev-parse", NOTES_REF]);

    await expect(pushBranchBoundedNotesExport({ exec: makeGitExec(repo), target: plan.target }))
      .resolves.toEqual({ kind: "pushed" });
    expect(await git(remote, ["rev-parse", NOTES_REF])).toBe(plan.target.capturedTip);
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localAfter);
  });

  it("rejects a remote advance after planning without force or local mutation", async () => {
    const { repo, base } = await harness("arc-notes-canonical-race-");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "planned", base]);
    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
    });
    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;

    const advanced = await makeNotesTreeCommit(repo, [{ commit: base, content: "advanced" }], {
      parents: [plan.target.capturedTip],
    });
    await git(repo, ["push", "origin", `${advanced.tip}:${NOTES_REF}`]);
    const localBefore = await git(repo, ["rev-parse", NOTES_REF]);

    await expect(pushBranchBoundedNotesExport({ exec: makeGitExec(repo), target: plan.target }))
      .resolves.toMatchObject({ kind: "failed" });
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localBefore);
  });
});
