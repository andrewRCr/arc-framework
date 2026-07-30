import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { receiptId } from "../../../src/lib/canonical/receipt-id.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  enumerateGitRetirementRecords,
  queryGitRetirementDisposition,
} from "../../../src/lib/work-unit/git-retirement-record-enumeration.js";
import type { RetirementReceipt } from "../../../src/lib/work-unit/retirement-authority.js";
import {
  RETIREMENT_RECORD_NAMESPACE,
  encodeRetirementRecordKey,
} from "../../../src/lib/work-unit/retirement-record-store.js";

function receipt(): RetirementReceipt {
  const subject = { kind: "work-unit", name: "sample" } as const;
  const source = {
    branch: "plan/sample",
    head: "a".repeat(40),
    artifactDigest: canonicalDigest("source"),
  };
  return {
    schemaVersion: 1,
    receiptId: receiptId({
      schemaVersion: 1,
      subject,
      transition: "abandon",
      sourceBranch: source.branch,
      sourceHead: source.head,
    }),
    subject,
    transition: "abandon",
    source,
    transitionPatchDigest: canonicalDigest("patch"),
    retiringProjection: { kind: "direct-transition" },
    authorization: "discard-confirmed",
    result: { kind: "discard", artifactDigest: "absent" },
  };
}

function treeLine(mode: string, oid: string, path: string): string {
  return `${mode} blob ${oid}\t${path}\0`;
}

function enumerationExec(options: { canonicalMode?: string } = {}): GitExec {
  const candidate = receipt();
  const filename = `${encodeRetirementRecordKey(candidate.receiptId)}.json`;
  const canonicalOid = "c".repeat(40);
  return async (_command, args) => {
    if (args[0] === "ls-tree") {
      const ref = args[4];
      const namespace = args[6];
      if (ref === "HEAD" && namespace === RETIREMENT_RECORD_NAMESPACE) {
        return {
          stdout: treeLine(
            options.canonicalMode ?? "100644",
            canonicalOid,
            `${RETIREMENT_RECORD_NAMESPACE}/${filename}`,
          ),
          stderr: "",
        };
      }
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "show" && args[1] === canonicalOid) {
      return { stdout: canonicalize(candidate), stderr: "" };
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };
}

describe("Git retirement record enumeration", () => {
  it("projects the dependent query behind the Git adapter boundary", async () => {
    await expect(queryGitRetirementDisposition(enumerationExec(), "HEAD", {
      retiredSubject: "sample",
      dependentSlug: "consumer",
    })).resolves.toEqual({
      status: "unique",
      evidenceQuality: "unknown",
      disposition: { kind: "abandoned" },
    });
  });

  it("authenticates canonical records without exposing paths", async () => {
    const result = await enumerateGitRetirementRecords(enumerationExec(), "HEAD");

    expect(result.status).toBe("valid");
    if (result.status !== "valid") throw new Error(result.status);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).not.toHaveProperty("path");
  });

  it("fails globally for a reachable symlink record", async () => {
    const filename = `${encodeRetirementRecordKey(receipt().receiptId)}.json`;
    await expect(enumerateGitRetirementRecords(enumerationExec({ canonicalMode: "120000" }), "HEAD"))
      .resolves.toEqual({ status: "namespace-corrupt", filename });
  });
});
