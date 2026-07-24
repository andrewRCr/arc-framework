import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../src/lib/canonical/canonical-json.js";
import { receiptId } from "../../src/lib/canonical/receipt-id.js";
import { queryGitRetirementDisposition } from "../../src/lib/work-unit/git-retirement-record-enumeration.js";
import type { RetirementReceipt } from "../../src/lib/work-unit/retirement-authority.js";
import {
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
});
