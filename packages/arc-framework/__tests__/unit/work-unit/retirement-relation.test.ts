import { describe, expect, it } from "vitest";

import { canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import {
  contentDigest,
  patchDigest,
  type PatchOperation,
} from "../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import type {
  DecomposeAllocationMap,
  RetirementReceipt,
} from "../../../src/lib/work-unit/retirement-authority.js";
import {
  validateRetirementReceiptRelation,
  type RetirementRelationContext,
} from "../../../src/lib/work-unit/retirement-relation.js";

const sourceHead = "a".repeat(40);
const resultParent = "b".repeat(40);
const resultHead = "c".repeat(40);
const laterHead = "d".repeat(40);
const metaPath = validateManagedPath(".arc/active/meta-sample.md");
const draftPath = validateManagedPath(".arc/backlog/planned/draft-sample.md");

function directReceipt(operations: readonly PatchOperation[]): RetirementReceipt {
  return {
    schemaVersion: 1,
    receiptId: contentDigest(new TextEncoder().encode("direct-receipt")),
    subject: { kind: "work-unit", name: "sample" },
    transition: "abandon",
    source: {
      branch: "plan/sample",
      head: sourceHead,
      artifactDigest: contentDigest(new TextEncoder().encode("source")),
    },
    transitionPatchDigest: patchDigest(operations),
    retiringProjection: { kind: "direct-transition" },
    authorization: "discard-confirmed",
    result: { kind: "discard", artifactDigest: "absent" },
  };
}

function unchangedReceipt(operations: readonly PatchOperation[]): RetirementReceipt {
  return {
    ...directReceipt(operations),
    receiptId: contentDigest(new TextEncoder().encode("unchanged-receipt")),
    transition: "decompose",
    retiringProjection: { kind: "unchanged" },
    result: {
      kind: "decompose",
      preparationId: contentDigest(new TextEncoder().encode("preparation")),
      allocation: { schemaVersion: 2 } as DecomposeAllocationMap,
      cutMapDigest: contentDigest(new TextEncoder().encode("cut-map")),
      sourceInventoryDigest: contentDigest(new TextEncoder().encode("source-inventory")),
      incomingEdgeInventoryDigest: contentDigest(new TextEncoder().encode("incoming-inventory")),
      outgoingEdgeInventoryDigest: contentDigest(new TextEncoder().encode("outgoing-inventory")),
      targets: [],
    },
  };
}

function relationContext(
  receipt: RetirementReceipt,
  operations: readonly PatchOperation[],
): RetirementRelationContext & { records: Map<string, string>; parents: Map<string, readonly string[]> } {
  const records = new Map<string, string>();
  const parents = new Map<string, readonly string[]>([
    [sourceHead, []],
    [resultParent, ["0".repeat(40)]],
    [resultHead, [receipt.retiringProjection.kind === "direct-transition" ? sourceHead : resultParent]],
    [laterHead, [resultHead]],
  ]);
  records.set(resultHead, canonicalize(receipt));
  return {
    readCommitParents: async (commit) => parents.get(commit) ?? [],
    readRecord: async (commit) => records.get(commit) ?? null,
    readPatchOperations: async () => operations,
    records,
    parents,
  };
}

describe("direct-transition receipt relation", () => {
  const operations = [{ operation: "delete", path: metaPath }] as const;

  it("accepts only a single-parent transition commit directly atop source.head", async () => {
    const receipt = directReceipt(operations);
    const ctx = relationContext(receipt, operations);

    await expect(
      validateRetirementReceiptRelation(ctx, receipt, {
        retiringHead: resultHead,
        resultHead: "e".repeat(40),
      }),
    ).resolves.toBeNull();
  });

  it("rejects an amended or later-descendant transition relation", async () => {
    const receipt = directReceipt(operations);
    const ctx = relationContext(receipt, operations);
    ctx.records.set(laterHead, canonicalize(receipt));

    await expect(
      validateRetirementReceiptRelation(ctx, receipt, {
        retiringHead: laterHead,
        resultHead: "e".repeat(40),
      }),
    ).resolves.toBe("evidence-mismatch");
  });
});

describe("unchanged receipt relation", () => {
  const operations = [
    { operation: "delete", path: metaPath },
    {
      operation: "write",
      path: draftPath,
      contentDigest: contentDigest(new TextEncoder().encode("planned")),
    },
  ] as const;

  it("accepts an unchanged source and a result-side commit that introduces the receipt", async () => {
    const receipt = unchangedReceipt(operations);
    const ctx = relationContext(receipt, operations);

    await expect(
      validateRetirementReceiptRelation(ctx, receipt, {
        retiringHead: sourceHead,
        resultHead,
      }),
    ).resolves.toBeNull();
  });

  it("rejects a recreated receipt in a later descendant", async () => {
    const receipt = unchangedReceipt(operations);
    const ctx = relationContext(receipt, operations);
    ctx.records.set(laterHead, canonicalize(receipt));
    ctx.records.set(resultHead, canonicalize(receipt));

    await expect(
      validateRetirementReceiptRelation(ctx, receipt, {
        retiringHead: sourceHead,
        resultHead: laterHead,
      }),
    ).resolves.toBe("evidence-mismatch");
  });
});

describe("transition write set", () => {
  it("rejects unrelated content because the complete non-record patch digest changes", async () => {
    const expected = [{ operation: "delete", path: metaPath }] as const;
    const actual = [
      ...expected,
      {
        operation: "write",
        path: validateManagedPath("unrelated.txt"),
        contentDigest: contentDigest(new TextEncoder().encode("unrelated")),
      },
    ] as const;
    const receipt = directReceipt(expected);
    const ctx = relationContext(receipt, actual);

    await expect(
      validateRetirementReceiptRelation(ctx, receipt, {
        retiringHead: resultHead,
        resultHead: "e".repeat(40),
      }),
    ).resolves.toBe("evidence-mismatch");
  });
});
