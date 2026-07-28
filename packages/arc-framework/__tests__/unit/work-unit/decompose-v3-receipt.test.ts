import { describe, expect, it } from "vitest";

import {
  canonicalDigest,
  canonicalize,
} from "../../../src/lib/canonical/canonical-json.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";
import {
  createV3DecomposeReceipt,
  parseV3DecomposeReceipt,
  parseV3DecomposeContinuationInput,
  v3DestinationDigest,
  v3TransitionPatchDigest,
} from "../../../src/lib/work-unit/decompose-v3-receipt.js";

describe("v3 finalized decomposition evidence", () => {
  const absent = { kind: "absent" as const };
  const file = {
    kind: "file" as const,
    mode: "100644" as const,
    contentDigest: canonicalDigest("content"),
  };
  const publication = {
    logicalAnchor: { kind: "cohort" as const, cohort: "sample" },
    entries: [
      { kind: "new-leaf" as const, slug: "member-a" },
      {
        kind: "existing-destination" as const,
        destinationId: "existing",
        target: { kind: "work-unit" as const, slug: "existing" },
      },
      {
        kind: "existing-destination" as const,
        destinationId: "existing-draft",
        target: {
          kind: "draft-block" as const,
          slug: "existing-draft",
          locator: { artifact: "draft-existing-draft.md", kind: "preamble" as const },
        },
      },
      {
        kind: "existing-destination" as const,
        destinationId: "existing-document",
        target: { kind: "document" as const, path: "docs/existing.md" },
      },
      { kind: "new-leaf" as const, slug: "member-b" },
    ],
  };

  it("accepts only publication-ordered new-leaf continuation", () => {
    expect(parseV3DecomposeContinuationInput(
      { kind: "selected", slugs: ["member-a", "member-b"] },
      publication,
    )).toEqual({ kind: "selected", slugs: ["member-a", "member-b"] });
    expect(parseV3DecomposeContinuationInput(
      { kind: "selected", slugs: ["member-b", "member-a"] },
      publication,
    )).toBeNull();
    expect(parseV3DecomposeContinuationInput(
      { kind: "selected", slugs: ["existing"] },
      publication,
    )).toBeNull();
    expect(parseV3DecomposeContinuationInput(
      { kind: "selected", slugs: ["existing-draft"] },
      publication,
    )).toBeNull();
    expect(parseV3DecomposeContinuationInput(
      { kind: "selected", slugs: ["existing-document"] },
      publication,
    )).toBeNull();
    expect(parseV3DecomposeContinuationInput(
      { kind: "selected", slugs: ["member-a", "member-a"] },
      publication,
    )).toBeNull();
    expect(parseV3DecomposeContinuationInput(
      { kind: "selected", slugs: ["member-a"], readiness: "ready" },
      publication,
    )).toBeNull();
    expect(parseV3DecomposeContinuationInput(
      { kind: "none", receiptId: canonicalDigest("receipt") },
      publication,
    )).toBeNull();
  });

  it("binds every closed destination and patch preimage operand", () => {
    const patch = [{ path: "a.md", before: absent, after: file }];
    expect(v3TransitionPatchDigest(patch)).not.toBe(v3TransitionPatchDigest([{
      ...patch[0]!,
      after: { ...file, mode: "100755" },
    }]));
    const digest = v3DestinationDigest("member-a", [{ path: "a.md", after: file }]);
    expect(digest).not.toBeNull();
    expect(v3DestinationDigest("member-b", [{ path: "a.md", after: file }])).not.toBe(digest);
    expect(v3DestinationDigest("member-a", [{
      path: "a.md",
      after: { ...file, contentDigest: canonicalDigest("other") },
    }])).not.toBe(digest);
    expect(v3DestinationDigest("member-a", [
      { path: "b.md", after: file },
      { path: "a.md", after: file },
    ])).toBeNull();
    expect(v3DestinationDigest("member-a", [
      { path: "a.md", after: file },
      { path: "a.md", after: file },
    ])).toBeNull();
    expect(v3DestinationDigest("", [{ path: "a.md", after: file }])).toBeNull();
    expect(v3DestinationDigest("member-a", [{
      path: "a.md",
      after: file,
      checkoutPath: "/tmp/a.md",
    }] as unknown as Parameters<typeof v3DestinationDigest>[1])).toBeNull();
    expect(() => v3TransitionPatchDigest([{
      ...patch[0]!,
      retryPreimage: absent,
    }] as unknown as Parameters<typeof v3TransitionPatchDigest>[0])).toThrow();
  });

  it("pins one canonical byte-exact receipt with every finalized member", () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const bytes = canonicalize(receipt);
    expect(bytes).toBe(canonicalize(JSON.parse(bytes)));
    expect(canonicalDigest(bytes)).toBe("sha256:4e0f98d4eb48b85ab7b2678c3484a5dfb3312b160878a4613f46d4e07f622c69");
  });

  it("seals exact prepared publication and a disjoint exhaustive path partition", () => {
    const { preparation, receipt } = v3DecompositionEvidenceFixture();
    expect(parseV3DecomposeReceipt(receipt, preparation)).toEqual(receipt);

    const replacedAnchor = structuredClone(receipt);
    replacedAnchor.finalized.publication.logicalAnchor = {
      kind: "direct-member",
      slug: "member-a",
    };
    expect(parseV3DecomposeReceipt(replacedAnchor, preparation)).toBeNull();

    const replacedEntry = structuredClone(receipt);
    replacedEntry.finalized.publication.entries.reverse();
    expect(parseV3DecomposeReceipt(replacedEntry, preparation)).toBeNull();

    const uncovered = structuredClone(receipt);
    uncovered.finalized.managedPathResults.pop();
    expect(parseV3DecomposeReceipt(uncovered, preparation)).toBeNull();

    const receiptPathResult = structuredClone(receipt);
    receiptPathResult.finalized.managedPathResults.push({
      path: preparation.facts.allowedPaths.find((path) =>
        path.includes("retirement-receipts"))!,
      before: absent,
      after: file,
    });
    expect(parseV3DecomposeReceipt(receiptPathResult, preparation)).toBeNull();

    const equalPatch = structuredClone(receipt);
    equalPatch.finalized.transitionPatch[0]!.after = equalPatch.finalized.transitionPatch[0]!.before;
    expect(parseV3DecomposeReceipt(equalPatch, preparation)).toBeNull();

    const modeChanged = structuredClone(receipt);
    modeChanged.finalized.managedPathResults[0]!.before = {
      kind: "file",
      mode: "100755",
      contentDigest: canonicalDigest("before"),
    };
    expect(parseV3DecomposeReceipt(modeChanged, preparation)).toBeNull();

    const missingDestination = structuredClone(receipt);
    missingDestination.finalized.destinationDigests.pop();
    expect(parseV3DecomposeReceipt(missingDestination, preparation)).toBeNull();

    const unknown = structuredClone(receipt) as typeof receipt & { approval?: string };
    unknown.approval = "accepted";
    expect(parseV3DecomposeReceipt(unknown, preparation)).toBeNull();
  });

  it("authenticates embedded preparation facts without caller-supplied state", () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    expect(parseV3DecomposeReceipt(receipt)).toEqual(receipt);

    const malformedPrepared = structuredClone(receipt);
    malformedPrepared.prepared.allowedPathsDigest = canonicalDigest("invented");
    expect(parseV3DecomposeReceipt(malformedPrepared)).toBeNull();

    const malformedPreparationIdentity = structuredClone(receipt);
    malformedPreparationIdentity.preparationId = canonicalDigest("invented");
    expect(parseV3DecomposeReceipt(malformedPreparationIdentity)).toBeNull();
  });

  it("refuses noncanonical arrays, unsupported objects, and digest drift", () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const variants: unknown[] = [];

    const destinationDigestDrift = structuredClone(receipt);
    destinationDigestDrift.finalized.destinationDigests[0]!.digest = canonicalDigest("other destination");
    variants.push(destinationDigestDrift);

    const destinationOutputDrift = structuredClone(receipt);
    destinationOutputDrift.finalized.destinationDigests[0]!.outputs[0]!.after = file;
    variants.push(destinationOutputDrift);

    const missingDestinationOutput = structuredClone(receipt);
    missingDestinationOutput.finalized.destinationDigests[0]!.outputs = [];
    variants.push(missingDestinationOutput);

    const unsortedResults = structuredClone(receipt);
    unsortedResults.finalized.managedPathResults.reverse();
    variants.push(unsortedResults);

    const duplicatePatchPath = structuredClone(receipt);
    duplicatePatchPath.finalized.transitionPatch[1]!.path =
      duplicatePatchPath.finalized.transitionPatch[0]!.path;
    variants.push(duplicatePatchPath);

    const patchDigestDrift = structuredClone(receipt);
    patchDigestDrift.finalized.transitionPatchDigest = canonicalDigest("other patch");
    variants.push(patchDigestDrift);

    const unsupportedMode = structuredClone(receipt) as unknown as {
      finalized: { managedPathResults: Array<{ after: { mode: string } }> };
    };
    unsupportedMode.finalized.managedPathResults[0]!.after.mode = "120000";
    variants.push(unsupportedMode);

    const unsupportedObject = structuredClone(receipt) as unknown as {
      finalized: { managedPathResults: Array<{ after: unknown }> };
    };
    unsupportedObject.finalized.managedPathResults[0]!.after = {
      kind: "object",
      objectKind: "symlink",
      mode: "120000",
      contentDigest: canonicalDigest("link"),
    };
    variants.push(unsupportedObject);

    const nestedUnknown = structuredClone(receipt) as typeof receipt & {
      finalized: typeof receipt.finalized & { retry?: boolean };
    };
    nestedUnknown.finalized.retry = true;
    variants.push(nestedUnknown);

    for (const variant of variants) {
      expect(parseV3DecomposeReceipt(variant)).toBeNull();
    }
  });

  it("requires canonical stored bytes and the version-plus-kind namespace arm", () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    expect(parseV3DecomposeReceipt(canonicalize(receipt))).toEqual(receipt);
    expect(parseV3DecomposeReceipt(`${canonicalize(receipt)}\n`)).toBeNull();
    expect(parseV3DecomposeReceipt({ ...receipt, schemaVersion: 2 })).toBeNull();
    expect(parseV3DecomposeReceipt({ ...receipt, kind: "prepared-decompose" })).toBeNull();
  });

  it("constructs only the exact prepared envelope and destination output set", () => {
    const { preparation, receipt } = v3DecompositionEvidenceFixture();
    const destinationOutputs = receipt.finalized.destinationDigests.map(({ destinationId, outputs }) => ({
      destinationId,
      outputs,
    }));
    expect(createV3DecomposeReceipt(
      preparation,
      receipt.finalized.managedPathResults,
      destinationOutputs,
      receipt.finalized.publication.initialContinuation,
    )).toEqual(receipt);

    expect(createV3DecomposeReceipt(
      preparation,
      receipt.finalized.managedPathResults,
      destinationOutputs.slice(1),
      receipt.finalized.publication.initialContinuation,
    )).toBeNull();
    const wrongOutput = structuredClone(destinationOutputs);
    wrongOutput[0]!.outputs[0]!.after = file;
    expect(createV3DecomposeReceipt(
      preparation,
      receipt.finalized.managedPathResults,
      wrongOutput,
      receipt.finalized.publication.initialContinuation,
    )).toBeNull();
    expect(createV3DecomposeReceipt(
      preparation,
      receipt.finalized.managedPathResults,
      destinationOutputs,
      { kind: "selected", slugs: ["not-published"] },
    )).toBeNull();
  });
});
