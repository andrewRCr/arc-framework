import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { receiptId } from "../../../src/lib/canonical/receipt-id.js";
import type { RetirementReceipt } from "../../../src/lib/work-unit/retirement-authority.js";
import {
  queryRetirementDisposition,
} from "../../../src/lib/work-unit/retirement-disposition-query.js";
import type {
  RetirementRecordEnumerationResult,
} from "../../../src/lib/work-unit/retirement-record-enumeration.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

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
  it("joins a v3 incoming edge to its exact authored disposition", () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const result = queryRetirementDisposition({
      status: "valid",
      records: [{
        id: receipt.receiptId,
        content: "",
        record: { kind: "v3-decomposition-receipt", value: receipt },
      }],
    }, { retiredSubject: "origin", dependentSlug: "consumer" });

    expect(result).toEqual({
      status: "unique",
      evidenceQuality: "tree-only",
      disposition: { kind: "replace", replacementTargets: ["member-a"] },
    });
  });

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
    const { receipt } = v3DecompositionEvidenceFixture();
    const withoutMatchingDependent = structuredClone(receipt);
    withoutMatchingDependent.prepared.completedMap.machine.incomingEdges[0]!.dependent = "other";

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
      {
        status: "valid",
        records: [{
          id: withoutMatchingDependent.receiptId,
          content: "",
          record: {
            kind: "v3-decomposition-receipt",
            value: withoutMatchingDependent,
          },
        }],
      },
      { retiredSubject: "origin", dependentSlug: "consumer" },
    )).toEqual({ status: "unmapped-dependent", evidenceQuality: "tree-only" });
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

  it("keeps v3 preparation nonterminal and retained-plus-v3 evidence ambiguous", () => {
    const { preparation, receipt } = v3DecompositionEvidenceFixture();
    const retained = renameReceipt();
    expect(queryRetirementDisposition({
      status: "valid",
      records: [{
        id: preparation.receiptId,
        content: "",
        record: { kind: "v3-decomposition-preparation", value: preparation },
      }],
    }, { retiredSubject: "origin", dependentSlug: "consumer" })).toEqual({ status: "absent" });

    expect(queryRetirementDisposition({
      status: "valid",
      records: [
        {
          id: retained.receiptId,
          content: "",
          record: { kind: "receipt", value: retained },
        },
        {
          id: receipt.receiptId,
          content: "",
          record: { kind: "v3-decomposition-receipt", value: receipt },
        },
      ],
    }, { retiredSubject: "origin", dependentSlug: "consumer" })).toEqual({ status: "ambiguous" });
  });

  it("fails malformed v3 dependent joins closed", () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const query = (candidate: typeof receipt) => queryRetirementDisposition({
      status: "valid",
      records: [{
        id: candidate.receiptId,
        content: "",
        record: { kind: "v3-decomposition-receipt", value: candidate },
      }],
    }, { retiredSubject: "origin", dependentSlug: "consumer" });

    const duplicateDependent = structuredClone(receipt);
    duplicateDependent.prepared.completedMap.machine.incomingEdges.push({
      dependent: "consumer",
      currentTargets: ["other"],
      edgeId: canonicalDigest("duplicate dependent edge"),
    });
    expect(query(duplicateDependent)).toEqual({ status: "namespace-corrupt" });

    const missingDisposition = structuredClone(receipt);
    missingDisposition.prepared.completedMap.authoring.incomingDispositions = [];
    expect(query(missingDisposition)).toEqual({ status: "namespace-corrupt" });

    const duplicateDisposition = structuredClone(receipt);
    duplicateDisposition.prepared.completedMap.authoring.incomingDispositions.push(
      structuredClone(duplicateDisposition.prepared.completedMap.authoring.incomingDispositions[0]!),
    );
    expect(query(duplicateDisposition)).toEqual({ status: "namespace-corrupt" });
  });
});
