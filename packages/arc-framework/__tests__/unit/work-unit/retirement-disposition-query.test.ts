import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { receiptId } from "../../../src/lib/canonical/receipt-id.js";
import type { DecomposeAllocationMap } from "../../../src/lib/work-unit/decompose-cut-map.js";
import type { RetirementReceipt } from "../../../src/lib/work-unit/retirement-authority.js";
import {
  queryRetirementDisposition,
} from "../../../src/lib/work-unit/retirement-disposition-query.js";
import type {
  RetirementRecordEnumerationResult,
} from "../../../src/lib/work-unit/retirement-record-enumeration.js";

function renameReceipt(
  retiredSubject = "origin",
  targetSlug = "successor",
  sourceHead = "a".repeat(40),
): RetirementReceipt {
  const subject = { kind: "work-unit", name: retiredSubject } as const;
  const source = {
    branch: `feat/${retiredSubject}`,
    head: sourceHead,
    artifactDigest: canonicalDigest(`source:${retiredSubject}`),
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
    transitionPatchDigest: canonicalDigest(`patch:${retiredSubject}`),
    retiringProjection: { kind: "direct-transition" },
    authorization: "identity-renamed",
    result: {
      kind: "rename",
      targetSlug,
      artifactDigest: canonicalDigest(`target:${targetSlug}`),
    },
  };
}

function decomposeReceipt(
  incomingEdges: DecomposeAllocationMap["incomingEdges"],
  evidenceQuality: "unknown" | "tree-only" | "reachable" | "degraded" = "reachable",
): RetirementReceipt {
  const subject = { kind: "work-unit", name: "origin" } as const;
  const source = {
    branch: "feat/origin",
    head: "c".repeat(40),
    artifactDigest: canonicalDigest("source:origin"),
  };
  const allocation: DecomposeAllocationMap = {
    schemaVersion: 2,
    origin: { slug: "origin", phase: "Active", location: "active" },
    shape: "symmetric",
    parentPosition: "standalone",
    entries: [{ kind: "new-member", destinationId: "successor", slug: "successor", workClass: "Light" }],
    internalEdges: [],
    sourceAllocations: [],
    incomingEdges,
    outgoingEdges: [],
  };
  const schemaVersion = evidenceQuality === "unknown" ? 1 : 2;
  const common = {
    receiptId: receiptId({
      schemaVersion,
      subject,
      transition: "decompose",
      sourceBranch: source.branch,
      sourceHead: source.head,
    }),
    subject,
    transition: "decompose" as const,
    source,
    transitionPatchDigest: canonicalDigest("patch:origin"),
    retiringProjection: { kind: "unchanged" as const },
    authorization: "discard-confirmed" as const,
    result: {
      kind: "decompose" as const,
      preparationId: canonicalDigest("preparation"),
      allocation,
      cutMapDigest: canonicalDigest("cut-map"),
      sourceInventoryDigest: canonicalDigest("source-inventory"),
      incomingEdgeInventoryDigest: canonicalDigest("incoming-inventory"),
      outgoingEdgeInventoryDigest: canonicalDigest("outgoing-inventory"),
      targets: [],
    },
  };
  if (evidenceQuality === "unknown") return { ...common, schemaVersion: 1 };
  return { ...common, schemaVersion: 2, inventoryRead: evidenceQuality };
}

function enumeration(...receipts: RetirementReceipt[]): RetirementRecordEnumerationResult {
  return {
    status: "valid",
    records: receipts.map((candidate) => ({
      id: candidate.receiptId,
      content: "",
      record: { kind: "receipt", value: candidate },
    })),
  };
}

function abandonReceipt(
  evidenceQuality: "unknown" | "tree-only" | "reachable" | "degraded",
): RetirementReceipt {
  const subject = { kind: "work-unit", name: "origin" } as const;
  const source = {
    branch: "feat/origin",
    head: "d".repeat(40),
    artifactDigest: canonicalDigest("source:abandon"),
  };
  const schemaVersion = evidenceQuality === "unknown" ? 1 : 2;
  const common = {
    receiptId: receiptId({
      schemaVersion,
      subject,
      transition: "abandon",
      sourceBranch: source.branch,
      sourceHead: source.head,
    }),
    subject,
    transition: "abandon" as const,
    source,
    transitionPatchDigest: canonicalDigest("patch:abandon"),
    retiringProjection: { kind: "direct-transition" as const },
    authorization: "discard-confirmed" as const,
    result: { kind: "discard" as const, artifactDigest: "absent" as const },
  };
  if (evidenceQuality === "unknown") return { ...common, schemaVersion: 1 };
  return { ...common, schemaVersion: 2, inventoryRead: evidenceQuality };
}

function parkReceipt(): RetirementReceipt {
  const subject = { kind: "work-unit", name: "origin" } as const;
  const source = {
    branch: "plan/origin",
    head: "e".repeat(40),
    artifactDigest: canonicalDigest("source:park"),
  };
  return {
    schemaVersion: 2,
    inventoryRead: "reachable",
    receiptId: receiptId({
      schemaVersion: 2,
      subject,
      transition: "park-planning",
      sourceBranch: source.branch,
      sourceHead: source.head,
    }),
    subject,
    transition: "park-planning",
    source,
    transitionPatchDigest: canonicalDigest("patch:park"),
    retiringProjection: { kind: "direct-transition" },
    authorization: "planning-relocated",
    result: { kind: "relocate", plannedArtifactDigest: canonicalDigest("target:park") },
  };
}

describe("retirement disposition query", () => {
  it("projects one reachable receipt without exposing storage paths", () => {
    const result = queryRetirementDisposition(
      enumeration(renameReceipt()),
      { retiredSubject: "origin", dependentSlug: "consumer" },
    );

    expect(result).toEqual({
      status: "unique",
      evidenceQuality: "unknown",
      disposition: { kind: "retarget", targetSlug: "successor" },
    });
    expect(result).not.toHaveProperty("path");
  });

  it("distinguishes absent, ambiguous, unmapped, version-conflict, and corrupt outcomes", () => {
    expect(queryRetirementDisposition(
      enumeration(),
      { retiredSubject: "origin", dependentSlug: "consumer" },
    )).toEqual({ status: "absent" });
    expect(queryRetirementDisposition(
      enumeration(
        renameReceipt("origin", "first"),
        renameReceipt("origin", "second", "b".repeat(40)),
      ),
      { retiredSubject: "origin", dependentSlug: "consumer" },
    )).toEqual({ status: "ambiguous" });
    expect(queryRetirementDisposition(
      enumeration(decomposeReceipt([])),
      { retiredSubject: "origin", dependentSlug: "consumer" },
    )).toEqual({ status: "unmapped-dependent", evidenceQuality: "reachable" });
    expect(queryRetirementDisposition(
      { status: "version-conflict", id: canonicalDigest("conflict") },
      { retiredSubject: "origin", dependentSlug: "consumer" },
    )).toEqual({ status: "version-conflict" });
    expect(queryRetirementDisposition(
      { status: "namespace-corrupt" },
      { retiredSubject: "origin", dependentSlug: "consumer" },
    )).toEqual({ status: "namespace-corrupt" });
  });

  it.each([
    {
      label: "decompose replacement",
      candidate: decomposeReceipt([{
        dependent: "consumer",
        disposition: { kind: "replace", replacementTargets: ["successor"] },
      }]),
      expected: { kind: "replace", replacementTargets: ["successor"] },
    },
    {
      label: "authored decompose drop",
      candidate: decomposeReceipt([{
        dependent: "consumer",
        disposition: { kind: "drop", reason: "no surviving concern" },
      }]),
      expected: { kind: "drop", reason: "no surviving concern" },
    },
    {
      label: "rename",
      candidate: renameReceipt(),
      expected: { kind: "retarget", targetSlug: "successor" },
    },
    {
      label: "abandon",
      candidate: abandonReceipt("reachable"),
      expected: { kind: "abandoned" },
    },
  ])("admits the $label disposition", ({ candidate, expected }) => {
    const first = queryRetirementDisposition(
      enumeration(candidate),
      { retiredSubject: "origin", dependentSlug: "consumer" },
    );
    const replay = queryRetirementDisposition(
      enumeration(candidate),
      { retiredSubject: "origin", dependentSlug: "consumer" },
    );

    expect(first).toMatchObject({ status: "unique", disposition: expected });
    expect(replay).toEqual(first);
  });

  it("treats park evidence as non-actionable on every replay", () => {
    const evidence = enumeration(parkReceipt());
    const query = { retiredSubject: "origin", dependentSlug: "consumer" };

    expect(queryRetirementDisposition(evidence, query)).toEqual({ status: "absent" });
    expect(queryRetirementDisposition(evidence, query)).toEqual({ status: "absent" });
  });

  it.each(["degraded", "unknown"] as const)(
    "keeps mapped %s evidence actionable and unmapped evidence conflicting",
    (evidenceQuality) => {
      const mapped = decomposeReceipt([{
        dependent: "consumer",
        disposition: { kind: "replace", replacementTargets: ["successor"] },
      }], evidenceQuality);
      expect(queryRetirementDisposition(
        enumeration(mapped),
        { retiredSubject: "origin", dependentSlug: "consumer" },
      )).toMatchObject({ status: "unique", evidenceQuality });

      expect(queryRetirementDisposition(
        enumeration(decomposeReceipt([], evidenceQuality)),
        { retiredSubject: "origin", dependentSlug: "consumer" },
      )).toEqual({ status: "unmapped-dependent", evidenceQuality });
    },
  );
});
