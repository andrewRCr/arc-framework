import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../src/lib/canonical/canonical-json.js";
import { receiptId } from "../../src/lib/canonical/receipt-id.js";
import { GitDeliveryRenameTransitionSource } from "../../src/lib/delivery/plan-resolution.js";
import { resolveUserReferenceAuthority } from "../../src/lib/user-reference-reconcile.js";
import { queryGitRetirementDisposition } from "../../src/lib/work-unit/git-retirement-record-enumeration.js";
import {
  enumerateGitTransitionRecords,
  queryGitTransitionDisposition,
  transitionRecordGitExec,
} from "../../src/lib/work-unit/git-transition-record-enumeration.js";
import type { RetirementReceipt } from "../../src/lib/work-unit/retirement-authority.js";
import {
  RETIREMENT_RECORD_NAMESPACE,
  encodeRetirementRecordKey,
} from "../../src/lib/work-unit/retirement-record-store.js";
import {
  resolveTransitionRecordPath,
  writeTransitionRecord,
} from "../../src/lib/work-unit/transition-record-store.js";
import type { TransitionRecord } from "../../src/lib/work-unit/transition-record.js";
import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  join,
  makeCommit,
  makeGitExec,
  mkdir,
  writeFile,
} from "../helpers/integration.js";

function receipt(): RetirementReceipt {
  const subject = { kind: "work-unit", name: "origin" } as const;
  const source = {
    branch: "feat/origin",
    head: "a".repeat(40),
    artifactDigest: canonicalDigest("source"),
  };
  return {
    schemaVersion: 1,
    receiptId: receiptId({
      schemaVersion: 1,
      subject,
      transition: "rename",
      sourceBranch: source.branch,
      sourceHead: source.head,
    }),
    subject,
    transition: "rename",
    source,
    transitionPatchDigest: canonicalDigest("patch"),
    retiringProjection: { kind: "direct-transition" },
    authorization: "identity-renamed",
    result: {
      kind: "rename",
      targetSlug: "successor",
      artifactDigest: canonicalDigest("successor"),
    },
  };
}

function transition(targetSlug: string): TransitionRecord {
  return {
    schemaVersion: 1,
    origin: "origin",
    kind: "rename",
    successors: [targetSlug],
    edges: [],
  };
}

describe("retirement disposition branch reachability", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await createTempRepo("arc-retirement-disposition-");
    await makeCommit(repo, "initial");
  });

  afterEach(async () => {
    await cleanupTempDir(repo);
  });

  it("ignores another branch's receipt until its introduction is reachable", async () => {
    await execFileAsync("git", ["branch", "dependent"], { cwd: repo });
    await execFileAsync("git", ["switch", "-c", "retirement"], { cwd: repo });
    const candidate = receipt();
    const directory = join(repo, RETIREMENT_RECORD_NAMESPACE);
    const path = join(directory, `${encodeRetirementRecordKey(candidate.receiptId)}.json`);
    await mkdir(directory, { recursive: true });
    await writeFile(path, canonicalize(candidate), "utf8");
    await execFileAsync("git", ["add", "--", RETIREMENT_RECORD_NAMESPACE], { cwd: repo });
    await makeCommit(repo, "record retirement");

    const exec = makeGitExec(repo);
    const query = { retiredSubject: "origin", dependentSlug: "consumer" };
    await expect(queryGitRetirementDisposition(exec, "dependent", query))
      .resolves.toEqual({ status: "absent" });

    await execFileAsync("git", ["switch", "dependent"], { cwd: repo });
    await execFileAsync("git", ["merge", "--no-ff", "retirement", "-m", "merge retirement"], { cwd: repo });
    await expect(queryGitRetirementDisposition(exec, "dependent", query)).resolves.toEqual({
      status: "unique",
      evidenceQuality: "unknown",
      disposition: { kind: "retarget", targetSlug: "successor" },
    });
  });

  it("keeps old authority live through migration and cuts over without a false absence", async () => {
    const candidate = receipt();
    const receiptDirectory = join(repo, RETIREMENT_RECORD_NAMESPACE);
    const receiptPath = join(receiptDirectory, `${encodeRetirementRecordKey(candidate.receiptId)}.json`);
    await mkdir(receiptDirectory, { recursive: true });
    await writeFile(receiptPath, canonicalize(candidate), "utf8");
    await execFileAsync("git", ["add", "--", RETIREMENT_RECORD_NAMESPACE], { cwd: repo });
    await makeCommit(repo, "record old authority");
    await execFileAsync("git", ["branch", "pre-cutover"], { cwd: repo });

    await writeTransitionRecord(repo, {
      schemaVersion: 1,
      origin: "origin",
      kind: "rename",
      successors: ["successor"],
      edges: [],
    });
    await execFileAsync("git", ["add", "--", ".arc/system/.internal/transitions"], { cwd: repo });
    await makeCommit(repo, "migrate transition authority");
    await execFileAsync("git", ["branch", "migrated-pre-cutover"], { cwd: repo });

    await writeFile(receiptPath, "{malformed", "utf8");
    await execFileAsync("git", ["add", "--", RETIREMENT_RECORD_NAMESPACE], { cwd: repo });
    await makeCommit(repo, "cut semantic consumer over");
    await execFileAsync("git", ["branch", "post-cutover"], { cwd: repo });

    const exec = makeGitExec(repo);
    const query = { retiredSubject: "origin", dependentSlug: "consumer" };
    const expected = {
      status: "unique",
      evidenceQuality: "unknown",
      disposition: { kind: "retarget", targetSlug: "successor" },
    } as const;
    await expect(queryGitRetirementDisposition(exec, "pre-cutover", query)).resolves.toEqual(expected);
    await expect(queryGitRetirementDisposition(exec, "migrated-pre-cutover", query)).resolves.toEqual(expected);
    await expect(new GitDeliveryRenameTransitionSource(exec).enumerate("post-cutover")).resolves.toEqual({
      status: "ok",
      value: [{ subject: "origin", outcome: { kind: "rename", targetSlug: "successor" } }],
    });
  });

  it("ignores uncommitted bytes and keeps divergent branch answers ref-local", async () => {
    const initial = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
    await execFileAsync("git", ["switch", "-c", "unreachable", initial], { cwd: repo });
    await writeTransitionRecord(repo, transition("unreachable-successor"));
    await execFileAsync("git", ["add", "--", ".arc/system/.internal/transitions"], { cwd: repo });
    await makeCommit(repo, "record unreachable transition");

    await execFileAsync("git", ["switch", "main"], { cwd: repo });
    await writeTransitionRecord(repo, transition("head-successor"));
    await execFileAsync("git", ["add", "--", ".arc/system/.internal/transitions"], { cwd: repo });
    await makeCommit(repo, "record head transition");
    await writeFile(resolveTransitionRecordPath(repo, "origin"), canonicalize(transition("worktree-successor")));

    const rawExec = transitionRecordGitExec(makeGitExec(repo));
    const query = { origin: "origin", dependentSlug: "consumer" };
    await expect(queryGitTransitionDisposition(rawExec, "HEAD", query)).resolves.toEqual({
      status: "unique",
      disposition: { kind: "retarget", targetSlug: "head-successor" },
    });
    await expect(queryGitTransitionDisposition(rawExec, "unreachable", query)).resolves.toEqual({
      status: "unique",
      disposition: { kind: "retarget", targetSlug: "unreachable-successor" },
    });
  });

  it("selects current, local-base, refreshed remote-base, and delivery refs independently", async () => {
    const initial = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
    const commitOn = async (branch: string, targetSlug: string): Promise<string> => {
      await execFileAsync("git", ["switch", "-c", branch, initial], { cwd: repo });
      await writeTransitionRecord(repo, transition(targetSlug));
      await execFileAsync("git", ["add", "--", ".arc/system/.internal/transitions"], { cwd: repo });
      await makeCommit(repo, `record ${branch} transition`);
      return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
    };
    const currentCommit = await commitOn("current-wu", "head-successor");
    await commitOn("local-base", "local-successor");
    const remoteCommit = await commitOn("remote-base", "remote-successor");
    await commitOn("delivery-ref", "delivery-successor");
    await execFileAsync("git", ["branch", "-f", "main", "local-base"], { cwd: repo });
    await execFileAsync("git", ["update-ref", "refs/remotes/origin/main", remoteCommit], { cwd: repo });
    await execFileAsync("git", ["switch", "current-wu"], { cwd: repo });
    expect((await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim()).toBe(currentCommit);

    const exec = makeGitExec(repo);
    const rawExec = transitionRecordGitExec(exec);
    const query = { origin: "origin", dependentSlug: "consumer" };
    await expect(queryGitTransitionDisposition(rawExec, "HEAD", query)).resolves.toMatchObject({
      disposition: { targetSlug: "head-successor" },
    });
    const enumerateAt = (ref: string) => enumerateGitTransitionRecords(rawExec, ref);
    await expect(resolveUserReferenceAuthority({
      protection: "partial",
      baseBranch: "main",
      refreshRemoteBase: () => Promise.reject(new Error("must not refresh partial authority")),
      enumerateAt,
    })).resolves.toMatchObject({
      status: "ready",
      ref: "main",
      transitions: [{ outcome: { targetSlug: "local-successor" } }],
    });
    await expect(resolveUserReferenceAuthority({
      protection: "full",
      baseBranch: "main",
      refreshRemoteBase: () => Promise.resolve(true),
      enumerateAt,
    })).resolves.toMatchObject({
      status: "ready",
      ref: "origin/main",
      transitions: [{ outcome: { targetSlug: "remote-successor" } }],
    });
    await expect(new GitDeliveryRenameTransitionSource(exec).enumerate("delivery-ref")).resolves.toMatchObject({
      status: "ok",
      value: [{ outcome: { targetSlug: "delivery-successor" } }],
    });
  });

  it("keeps a failed full-protection refresh unavailable without consulting another authority", async () => {
    const candidate = receipt();
    const directory = join(repo, RETIREMENT_RECORD_NAMESPACE);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, `${encodeRetirementRecordKey(candidate.receiptId)}.json`),
      canonicalize(candidate),
      "utf8",
    );
    await execFileAsync("git", ["add", "--", RETIREMENT_RECORD_NAMESPACE], { cwd: repo });
    await makeCommit(repo, "record legacy fallback candidate");
    const result = await resolveUserReferenceAuthority({
      protection: "full",
      baseBranch: "main",
      refreshRemoteBase: () => Promise.resolve(false),
      enumerateAt: () => Promise.reject(new Error("must not enumerate or fall back")),
    });
    expect(result).toEqual({ status: "unavailable", ref: "origin/main" });
  });
});
