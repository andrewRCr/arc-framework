import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../src/lib/canonical/canonical-json.js";
import { receiptId } from "../../src/lib/canonical/receipt-id.js";
import { queryGitRetirementDisposition } from "../../src/lib/work-unit/git-retirement-record-enumeration.js";
import type { RetirementReceipt } from "../../src/lib/work-unit/retirement-authority.js";
import {
  LEGACY_RETIREMENT_RECORD_NAMESPACE,
  RETIREMENT_RECORD_NAMESPACE,
  encodeRetirementRecordKey,
} from "../../src/lib/work-unit/retirement-record-store.js";
import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  join,
  makeCommit,
  makeGitExec,
  mkdir,
  rm,
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

  async function commitLegacyOnlyMerge(filename: string, content: string): Promise<void> {
    await execFileAsync("git", ["switch", "-c", "legacy-retirement"], { cwd: repo });
    const directory = join(repo, LEGACY_RETIREMENT_RECORD_NAMESPACE);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, filename), content, "utf8");
    await execFileAsync("git", ["add", "--", LEGACY_RETIREMENT_RECORD_NAMESPACE], { cwd: repo });
    await makeCommit(repo, "record legacy retirement");

    await execFileAsync("git", ["switch", "main"], { cwd: repo });
    await makeCommit(repo, "advance canonical line");
    await execFileAsync("git", ["merge", "--no-commit", "--no-ff", "legacy-retirement"], { cwd: repo });
    await rm(join(repo, ".arc", ".internal"), { recursive: true });
    await execFileAsync("git", ["add", "-A"], { cwd: repo });
    await makeCommit(repo, "merge without legacy tree path");
  }

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

  it("finds valid legacy evidence reachable only through a merged side branch", async () => {
    const candidate = receipt();
    const filename = `${encodeRetirementRecordKey(candidate.receiptId)}.json`;
    await commitLegacyOnlyMerge(filename, canonicalize(candidate));

    await expect(queryGitRetirementDisposition(makeGitExec(repo), "HEAD", {
      retiredSubject: "origin",
      dependentSlug: "consumer",
    })).resolves.toEqual({
      status: "unique",
      evidenceQuality: "unknown",
      disposition: { kind: "retarget", targetSlug: "successor" },
    });
  });

  it("fails closed for malformed legacy evidence reachable only through a merged side branch", async () => {
    const candidate = receipt();
    const filename = `${encodeRetirementRecordKey(candidate.receiptId)}.json`;
    await commitLegacyOnlyMerge(filename, '{"malformed":true}');

    await expect(queryGitRetirementDisposition(makeGitExec(repo), "HEAD", {
      retiredSubject: "unrelated",
      dependentSlug: "consumer",
    })).resolves.toEqual({ status: "namespace-corrupt" });
  });
});
