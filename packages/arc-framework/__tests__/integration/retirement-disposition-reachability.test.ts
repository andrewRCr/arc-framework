import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../src/lib/canonical/canonical-json.js";
import { receiptId } from "../../src/lib/canonical/receipt-id.js";
import { GitDeliveryRenameTransitionSource } from "../../src/lib/delivery/plan-resolution.js";
import { queryGitRetirementDisposition } from "../../src/lib/work-unit/git-retirement-record-enumeration.js";
import type { RetirementReceipt } from "../../src/lib/work-unit/retirement-authority.js";
import {
  RETIREMENT_RECORD_NAMESPACE,
  encodeRetirementRecordKey,
} from "../../src/lib/work-unit/retirement-record-store.js";
import { writeTransitionRecord } from "../../src/lib/work-unit/transition-record-store.js";
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
});
