import { describe, expect, it } from "vitest";

import { analyzeIntegrationEvidence } from "../../../src/lib/git/base-integration-evidence.js";
import type { IntegrationEvidenceResolver } from "../../../src/lib/git/base-drift-types.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const oid = (char: string): string => char.repeat(40);
const record = (commit: string, parents: string[], subject: string): string =>
  `${commit}\0${parents.join(" ")}\0${subject}\0`;

function execWith(stdout: string): GitExec {
  return async (_cmd, args) => {
    expect(args).toContain("-z");
    return { stdout };
  };
}

const emptyResolver: IntegrationEvidenceResolver = {
  enrichTopologyEvent: async () => ({ status: "available", value: null }),
  proveSingleParentEvents: async () => ({ status: "available", value: [] }),
};

describe("integration-event evidence", () => {
  it("classifies a merge as one topology event with exact PR identity", async () => {
    const result = await analyzeIntegrationEvidence({
      exec: execWith(record(oid("a"), [oid("b"), oid("c")], "Merge pull request #42 from team/topic")),
      baseOid: oid("d"),
      resolver: emptyResolver,
    });
    expect(result).toMatchObject({
      coverage: "complete",
      scannedCommitCount: 1,
      unclassifiedCommitCount: 0,
      events: [{ commits: [oid("a")], proof: "topology", prNumber: 42 }],
    });
  });

  it("does not treat a terminal PR suffix as event proof", async () => {
    const result = await analyzeIntegrationEvidence({
      exec: execWith(record(oid("a"), [oid("b")], "feature delivery (#42)")),
      baseOid: oid("d"),
      resolver: emptyResolver,
    });
    expect(result).toMatchObject({ coverage: "partial", unclassifiedCommitCount: 1, events: [] });
  });

  it("accepts disjoint resolver membership and preserves oldest-first order", async () => {
    const resolver: IntegrationEvidenceResolver = {
      enrichTopologyEvent: async () => ({ status: "available", value: null }),
      proveSingleParentEvents: async (inputs) => ({
        status: "available",
        value: [{ commits: [inputs[0]!.oid, inputs[1]!.oid], slug: "sibling" }],
      }),
    };
    const result = await analyzeIntegrationEvidence({
      exec: execWith(
        record(oid("a"), [oid("b")], "one") + record(oid("c"), [oid("a")], "two"),
      ),
      baseOid: oid("d"),
      resolver,
    });
    expect(result).toMatchObject({
      coverage: "complete",
      events: [{ commits: [oid("a"), oid("c")], proof: "resolver", slug: "sibling" }],
    });
  });

  it("rejects an out-of-range resolver response atomically", async () => {
    const resolver: IntegrationEvidenceResolver = {
      enrichTopologyEvent: async () => ({ status: "available", value: null }),
      proveSingleParentEvents: async () => ({
        status: "available",
        value: [{ commits: [oid("f")], slug: "stale" }],
      }),
    };
    const result = await analyzeIntegrationEvidence({
      exec: execWith(record(oid("a"), [oid("b")], "one")),
      baseOid: oid("d"),
      resolver,
    });
    expect(result).toMatchObject({
      coverage: "partial",
      events: [],
      unclassifiedCommitCount: 1,
      limitations: ["resolver-invalid", "unclassified-commits"],
    });
  });

  it("marks cap-plus-one input as truncated without classifying the extra record", async () => {
    const result = await analyzeIntegrationEvidence({
      exec: execWith(
        record(oid("a"), [oid("b")], "one") + record(oid("c"), [oid("a")], "two"),
      ),
      baseOid: oid("d"),
      resolver: emptyResolver,
      scanLimit: 1,
    });
    expect(result).toMatchObject({
      coverage: "partial",
      scannedCommitCount: 1,
      truncated: true,
      limitations: ["unclassified-commits", "scan-truncated"],
    });
  });

  it("fails the evidence arm on malformed fixed-arity framing", async () => {
    const result = await analyzeIntegrationEvidence({
      exec: execWith(`${oid("a")}\0${oid("b")}\0`),
      baseOid: oid("d"),
    });
    expect(result).toEqual({ coverage: "unavailable", reason: "history-scan-failed" });
  });
});
