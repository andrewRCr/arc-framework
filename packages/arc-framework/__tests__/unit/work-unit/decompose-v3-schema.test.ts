import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { v3TopologyDigest } from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import { v3TransitionPatchDigest } from "../../../src/lib/work-unit/decompose-v3-receipt.js";
import {
  createV3DecomposeStarterMap,
  decodeV3DecomposeCutMap,
  parseV3DecomposeCutMap,
  parseV3DecomposeStarterMap,
  v3AllowedPathsDigest,
  v3CutMapDigest,
  v3IncomingEdgeId,
  v3IncomingEdgeInventoryDigest,
  v3OutgoingEdgeId,
  v3OutgoingEdgeInventoryDigest,
  v3PreflightId,
  v3ReceiptId,
  v3SourceArtifactDigest,
  v3SourceId,
  v3SourceInventoryDigest,
  type V3DecomposeCutMap,
  type V3DecomposeMachine,
} from "../../../src/lib/work-unit/decompose-v3-schema.js";

function machine(): V3DecomposeMachine {
  const locator = { artifact: "draft-origin.md", kind: "preamble" as const };
  const sourceUnit = {
    sourceId: v3SourceId({ sourcePath: ".arc/active/draft-origin.md", sourceLocator: locator }),
    sourcePath: ".arc/active/draft-origin.md",
    sourceLocator: locator,
    contentDigest: canonicalDigest("content"),
  };
  const incoming = {
    edgeId: v3IncomingEdgeId({ dependent: "consumer", currentTargets: ["origin"] }),
    dependent: "consumer",
    currentTargets: ["origin"],
  };
  const outgoing = {
    edgeId: v3OutgoingEdgeId({ prerequisite: "foundation" }),
    prerequisite: "foundation",
  };
  const facts = {
    source: {
      origin: "origin",
      kind: "started-planning" as const,
      logicalBranch: "plan/origin",
      ref: "refs/heads/plan/origin",
      head: "a".repeat(40),
    },
    resultBase: { ref: "refs/heads/main", head: "b".repeat(40) },
    planningProfile: { kind: "draft" as const, sourceDesign: ["draft-origin.md"] },
    sourceUnits: [sourceUnit],
    incomingEdges: [incoming],
    outgoingEdges: [outgoing],
  };
  return { preflightId: v3PreflightId(facts), ...facts };
}

function completed(): V3DecomposeCutMap {
  const facts = machine();
  return {
    schemaVersion: 3,
    machine: facts,
    authoring: {
      shape: "symmetric",
      placement: { kind: "cohort", cohort: "origin" },
      destinations: [
        { kind: "new-member", destinationId: "member-a", slug: "member-a", workClass: "Light" },
        { kind: "new-member", destinationId: "member-b", slug: "member-b", workClass: "Heavy" },
      ],
      internalEdges: [{ from: "member-a", to: "member-b" }],
      sourceAllocations: [{
        sourceId: facts.sourceUnits[0]!.sourceId,
        ownership: "destination-owned",
        disposition: {
          kind: "target",
          destinationId: "member-a",
          targetLocator: { artifact: "draft-member-a.md", kind: "preamble" },
        },
      }],
      incomingDispositions: [{
        edgeId: facts.incomingEdges[0]!.edgeId,
        disposition: { kind: "replace", replacementTargets: ["member-a"] },
      }],
      outgoingDispositions: [{
        edgeId: facts.outgoingEdges[0]!.edgeId,
        disposition: { kind: "targets", targets: ["member-b"] },
      }],
    },
  };
}

function comprehensiveMachine(): V3DecomposeMachine {
  const sources = [
    {
      sourcePath: ".arc/active/draft-origin.md",
      sourceLocator: { artifact: "draft-origin.md", kind: "preamble" as const },
    },
    {
      sourcePath: ".arc/active/draft-origin.md",
      sourceLocator: {
        artifact: "draft-origin.md",
        kind: "section" as const,
        level: 3,
        headingSource: "Scope",
        ancestry: [{ level: 2, headingSource: "Design", occurrence: 0 }],
        occurrence: 1,
      },
    },
    {
      sourcePath: ".arc/active/notes-origin.md",
      sourceLocator: { artifact: "notes-origin.md", kind: "whole-file" as const },
    },
  ].map((source, index) => ({
    ...source,
    sourceId: v3SourceId(source),
    contentDigest: canonicalDigest(`source-${index}`),
  })).sort((left, right) => Buffer.compare(Buffer.from(left.sourceId), Buffer.from(right.sourceId)));
  const incomingEdges = [
    { dependent: "consumer-a", currentTargets: ["origin"] },
    { dependent: "consumer-b", currentTargets: ["foundation", "origin"] },
  ].map((edge) => ({ ...edge, edgeId: v3IncomingEdgeId(edge) }))
    .sort((left, right) => Buffer.compare(Buffer.from(left.edgeId), Buffer.from(right.edgeId)));
  const outgoingEdges = ["foundation-a", "foundation-b"]
    .map((prerequisite) => ({ prerequisite, edgeId: v3OutgoingEdgeId({ prerequisite }) }))
    .sort((left, right) => Buffer.compare(Buffer.from(left.edgeId), Buffer.from(right.edgeId)));
  const facts = {
    source: {
      origin: "origin",
      kind: "started-planning" as const,
      logicalBranch: "plan/origin",
      ref: "refs/heads/plan/origin",
      head: "a".repeat(40),
    },
    resultBase: { ref: "refs/heads/main", head: "b".repeat(40) },
    planningProfile: {
      kind: "paired-spec" as const,
      sourceDesign: ["spec-origin.md", "rfc-origin.md"] as [string, string],
    },
    sourceUnits: sources,
    incomingEdges,
    outgoingEdges,
  };
  return { preflightId: v3PreflightId(facts), ...facts };
}

function machinePreimage(machine: V3DecomposeMachine): Omit<V3DecomposeMachine, "preflightId"> {
  return {
    source: machine.source,
    resultBase: machine.resultBase,
    planningProfile: machine.planningProfile,
    sourceUnits: machine.sourceUnits,
    incomingEdges: machine.incomingEdges,
    outgoingEdges: machine.outgoingEdges,
  };
}

function comprehensiveCompleted(): V3DecomposeCutMap {
  const facts = comprehensiveMachine();
  const destinations: V3DecomposeCutMap["authoring"]["destinations"] = [
    { kind: "cohort-coordination", destinationId: "coordination", cohort: "group/nested" },
    {
      kind: "existing-home",
      destinationId: "existing-document",
      target: { kind: "document", path: ".arc/reference/PROJECT-PRD.md" },
    },
    {
      kind: "existing-home",
      destinationId: "existing-draft",
      target: {
        kind: "draft-block",
        slug: "existing-draft",
        locator: {
          artifact: "draft-existing-draft.md",
          kind: "section",
          level: 2,
          headingSource: "Scope",
          ancestry: [],
          occurrence: 0,
        },
      },
    },
    {
      kind: "existing-home",
      destinationId: "existing-work-unit",
      target: { kind: "work-unit", slug: "existing-work-unit" },
    },
    { kind: "new-member", destinationId: "new-a", slug: "new-a", workClass: "Light" },
    { kind: "new-member", destinationId: "new-b", slug: "new-b", workClass: "Heavy" },
  ];
  return {
    schemaVersion: 3,
    machine: facts,
    authoring: {
      shape: "heterogeneous",
      placement: { kind: "subcohort", cohort: "group/nested" },
      destinations,
      internalEdges: [
        { from: "existing-work-unit", to: "new-a" },
        { from: "new-a", to: "new-b" },
      ],
      sourceAllocations: facts.sourceUnits.map(({ sourceId }, index) => ({
        sourceId,
        ownership: index === 1 ? "cohort-shared" as const : "destination-owned" as const,
        disposition: index === 2
          ? { kind: "drop" as const, reason: "superseded explanatory material" }
          : {
              kind: "target" as const,
              destinationId: index === 0 ? "existing-draft" : "new-a",
              targetLocator: index === 0
                ? { artifact: "draft-existing-draft.md", kind: "preamble" as const }
                : { artifact: "draft-new-a.md", kind: "whole-file" as const },
            },
      })),
      incomingDispositions: facts.incomingEdges.map(({ edgeId }, index) => ({
        edgeId,
        disposition: index === 0
          ? { kind: "drop" as const, reason: "dependency retired with the origin" }
          : { kind: "replace" as const, replacementTargets: ["new-a", "new-b"] },
      })),
      outgoingDispositions: facts.outgoingEdges.map(({ edgeId }, index) => ({
        edgeId,
        disposition: index === 0
          ? { kind: "drop" as const, reason: "no destination consumes this edge" }
          : { kind: "targets" as const, targets: ["new-a", "new-b"] },
      })),
    },
  };
}

interface LooseCompletedMap {
  machine: { source: { kind: unknown } };
  authoring: {
    shape: unknown;
    placement: unknown;
    destinations: unknown;
    internalEdges: unknown;
    sourceAllocations: Array<{ ownership: unknown; disposition: unknown }>;
    incomingDispositions: Array<{ disposition: unknown }>;
    outgoingDispositions: Array<{ disposition: unknown }>;
  };
  extra?: unknown;
}

describe("v3 decomposition map schema", () => {
  it("prepopulates every starter author slot without changing machine identity", () => {
    const facts = machine();
    const starter = createV3DecomposeStarterMap(facts);

    expect(starter).not.toBeNull();
    expect(starter?.machine).toEqual(facts);
    expect(starter?.authoring.sourceAllocations).toEqual([{
      sourceId: facts.sourceUnits[0]!.sourceId,
      ownership: { status: "author" },
      disposition: { status: "author" },
    }]);
    expect(parseV3DecomposeStarterMap(starter)).toEqual(starter);
  });

  it("accepts a closed completed map and rejects machine or identity-array tampering", () => {
    const value = completed();
    expect(parseV3DecomposeCutMap(value)).toEqual(value);

    const changedMachine = structuredClone(value);
    changedMachine.machine.source.logicalBranch = "plan/other";
    expect(parseV3DecomposeCutMap(changedMachine)).toBeNull();

    const changedIdentity = structuredClone(value);
    changedIdentity.authoring.sourceAllocations[0]!.sourceId = canonicalDigest("other");
    expect(parseV3DecomposeCutMap(changedIdentity)).toBeNull();
  });

  it("closes the public shape and destination domain", () => {
    const symmetric = completed();
    symmetric.authoring.destinations = [symmetric.authoring.destinations[0]!];
    expect(parseV3DecomposeCutMap(symmetric)).toBeNull();

    const extraction = structuredClone(completed()) as unknown as Record<string, unknown>;
    (extraction.authoring as Record<string, unknown>).shape = "extraction";
    expect(parseV3DecomposeCutMap(extraction)).toBeNull();

    const surviving = structuredClone(completed()) as unknown as Record<string, unknown>;
    (surviving.authoring as { destinations: unknown[] }).destinations.push({
      kind: "surviving-origin",
      destinationId: "origin",
      slug: "origin",
    });
    expect(parseV3DecomposeCutMap(surviving)).toBeNull();
  });

  it("binds every placement arm to its exact cohort depth", () => {
    const topLevel = completed();
    topLevel.authoring.placement = { kind: "cohort", cohort: "group/member" };
    expect(parseV3DecomposeCutMap(topLevel)).toBeNull();

    const nested = completed();
    nested.authoring.placement = { kind: "subcohort", cohort: "group" };
    expect(parseV3DecomposeCutMap(nested)).toBeNull();

    const atCap = completed();
    atCap.authoring.placement = { kind: "at-cap", parent: "group" };
    expect(parseV3DecomposeCutMap(atCap)).toBeNull();

    const coordination = completed();
    coordination.authoring.destinations.unshift({
      kind: "cohort-coordination",
      destinationId: "coordination",
      cohort: "[none]",
    });
    expect(parseV3DecomposeCutMap(coordination)).toBeNull();
  });

  it("binds every canonical identity to its exact versioned preimage", () => {
    const facts = machine();
    const map = completed();
    expect(v3ReceiptId(facts)).not.toBe(v3ReceiptId({
      ...facts,
      source: { ...facts.source, head: "c".repeat(40) },
    }));
    expect(v3CutMapDigest(map)).not.toBe(v3CutMapDigest({
      ...map,
      authoring: { ...map.authoring, placement: { kind: "direct-member" } },
    }));
    expect(v3SourceInventoryDigest(facts)).not.toBe(v3IncomingEdgeInventoryDigest(facts));
    expect(v3IncomingEdgeInventoryDigest(facts)).not.toBe(v3OutgoingEdgeInventoryDigest(facts));
    expect(v3AllowedPathsDigest(["a.md", "b.md"])).not.toBeNull();
    expect(v3AllowedPathsDigest(["b.md", "a.md"])).toBeNull();
    expect(v3SourceArtifactDigest([{
      path: "a.md",
      objectKind: "blob",
      mode: "100644",
      contentDigest: canonicalDigest("bytes"),
    }])).not.toBe(v3SourceArtifactDigest([{
      path: "a.md",
      objectKind: "blob",
      mode: "100755",
      contentDigest: canonicalDigest("bytes"),
    }]));
  });

  it("refuses extra and self-referential digest operands", () => {
    const facts = machine();
    const incoming = { dependent: "consumer", currentTargets: ["origin"] };
    expect(() => v3IncomingEdgeId({
      ...incoming,
      edgeId: v3IncomingEdgeId(incoming),
    } as Parameters<typeof v3IncomingEdgeId>[0])).toThrow();
    expect(() => v3OutgoingEdgeId({
      prerequisite: "foundation",
      extra: true,
    } as Parameters<typeof v3OutgoingEdgeId>[0])).toThrow();
    expect(() => v3SourceId({
      sourcePath: facts.sourceUnits[0]!.sourcePath,
      sourceLocator: facts.sourceUnits[0]!.sourceLocator,
      contentDigest: facts.sourceUnits[0]!.contentDigest,
    } as Parameters<typeof v3SourceId>[0])).toThrow();
    expect(() => v3PreflightId({
      ...facts,
      preflightId: facts.preflightId,
    } as Parameters<typeof v3PreflightId>[0])).toThrow();
    expect(() => v3CutMapDigest({
      ...completed(),
      cutMapDigest: canonicalDigest("self"),
    } as V3DecomposeCutMap)).toThrow();
    expect(v3SourceArtifactDigest([{
      path: "a.md",
      objectKind: "blob",
      mode: "100644",
      contentDigest: canonicalDigest("bytes"),
      checkoutBytes: canonicalDigest("not stored"),
    } as Parameters<typeof v3SourceArtifactDigest>[0][number]])).toBeNull();
    expect(() => v3TopologyDigest([{
      kind: "none",
      topologyDigest: canonicalDigest("self"),
    } as Parameters<typeof v3TopologyDigest>[0][number]])).toThrow();
    expect(() => v3TransitionPatchDigest([{
      path: "a.md",
      before: { kind: "absent" },
      after: { kind: "file", mode: "100644", contentDigest: canonicalDigest("after") },
      transitionPatchDigest: canonicalDigest("self"),
    } as Parameters<typeof v3TransitionPatchDigest>[0][number]])).toThrow();
  });

  it("returns direct guidance at the first incomplete or tampered locus", () => {
    const placeholder = structuredClone(completed()) as unknown as Record<string, unknown>;
    (placeholder.authoring as Record<string, unknown>).shape = { status: "author" };
    expect(decodeV3DecomposeCutMap(placeholder)).toEqual({
      status: "rejected",
      issue: {
        code: "incomplete-authoring",
        path: "authoring.shape",
        message: "Replace the author slot at authoring.shape with a complete closed value.",
      },
    });

    const tampered = completed();
    tampered.machine.sourceUnits[0]!.contentDigest = canonicalDigest("tampered");
    expect(decodeV3DecomposeCutMap(tampered)).toEqual({
      status: "rejected",
      issue: {
        code: "machine-identity",
        path: "machine.preflightId",
        message: "Restore the complete machine envelope emitted by preflight.",
      },
    });

    const missing = completed();
    missing.authoring.incomingDispositions = [];
    expect(decodeV3DecomposeCutMap(missing)).toEqual({
      status: "rejected",
      issue: {
        code: "authoring-identity",
        path: "authoring.incomingDispositions",
        message: "Preserve every machine identity exactly once and in machine order; edit only its authored value.",
      },
    });
  });

  it("pins canonical starter and completed bytes while covering every nested arm", () => {
    const complete = comprehensiveCompleted();
    const starter = createV3DecomposeStarterMap(complete.machine);
    expect(starter).not.toBeNull();
    const starterBytes = canonicalize(starter);
    const completedBytes = canonicalize(complete);
    expect(canonicalDigest(starterBytes))
      .toBe("sha256:810d29e2c6983a18169d74d769f4d423dc909260ebae08b657eacb156d7378a0");
    expect(canonicalDigest(completedBytes))
      .toBe("sha256:7a75d04b5f04423427b1e9a7c049dfb46cd46026caaa6a6b53a686882622ef36");
    expect(canonicalize(parseV3DecomposeStarterMap(JSON.parse(starterBytes)))).toBe(starterBytes);
    expect(canonicalize(parseV3DecomposeCutMap(JSON.parse(completedBytes)))).toBe(completedBytes);

    for (const planningProfile of [
      { kind: "draft" as const, sourceDesign: ["draft-origin.md"] },
      { kind: "single-spec" as const, sourceDesign: ["spec-origin.md"] as [string] },
      { kind: "paired-spec" as const, sourceDesign: ["spec-origin.md", "rfc-origin.md"] as [string, string] },
    ]) {
      const facts = machinePreimage(comprehensiveMachine());
      const machineFacts = { ...facts, planningProfile };
      const candidate = {
        ...machineFacts,
        preflightId: v3PreflightId(machineFacts),
      };
      expect(parseV3DecomposeStarterMap(createV3DecomposeStarterMap(candidate))).not.toBeNull();
    }

    for (const placement of [
      { kind: "direct-member" as const },
      { kind: "cohort" as const, cohort: "group" },
      { kind: "subcohort" as const, cohort: "group/nested" },
      { kind: "at-cap" as const, parent: "group/nested" },
    ]) {
      expect(parseV3DecomposeCutMap({
        ...complete,
        authoring: { ...complete.authoring, placement },
      })).not.toBeNull();
    }
  });

  it("enforces shape cardinality and zero-one-many internal-edge replacement", () => {
    const heterogeneous = comprehensiveCompleted();
    expect(parseV3DecomposeCutMap(heterogeneous)).not.toBeNull();

    for (const internalEdges of [
      [],
      [{ from: "new-a", to: "new-b" }],
      [{ from: "existing-work-unit", to: "new-a" }, { from: "new-a", to: "new-b" }],
    ]) {
      expect(parseV3DecomposeCutMap({
        ...heterogeneous,
        authoring: { ...heterogeneous.authoring, internalEdges },
      })).not.toBeNull();
    }

    const missingNew = comprehensiveCompleted();
    missingNew.authoring.destinations = missingNew.authoring.destinations
      .filter(({ kind }) => kind !== "new-member");
    expect(parseV3DecomposeCutMap(missingNew)).toBeNull();

    const missingExisting = comprehensiveCompleted();
    missingExisting.authoring.destinations = missingExisting.authoring.destinations
      .filter(({ kind }) => kind !== "existing-home");
    expect(parseV3DecomposeCutMap(missingExisting)).toBeNull();

    const symmetricWithExisting = completed();
    symmetricWithExisting.authoring.destinations.splice(0, 0, {
      kind: "existing-home",
      destinationId: "existing",
      target: { kind: "work-unit", slug: "existing" },
    });
    expect(parseV3DecomposeCutMap(symmetricWithExisting)).toBeNull();
  });

  it("refuses missing, extra, and reordered copied machine identities", () => {
    const identityCollections = [
      "sourceAllocations",
      "incomingDispositions",
      "outgoingDispositions",
    ] as const;
    for (const collection of identityCollections) {
      const missing = comprehensiveCompleted();
      missing.authoring[collection] = missing.authoring[collection].slice(1) as never;
      expect(decodeV3DecomposeCutMap(missing)).toMatchObject({
        status: "rejected",
        issue: { code: "authoring-identity", path: `authoring.${collection}` },
      });

      const extra = comprehensiveCompleted();
      extra.authoring[collection] = [
        ...extra.authoring[collection],
        extra.authoring[collection][0]!,
      ] as never;
      expect(decodeV3DecomposeCutMap(extra)).toMatchObject({
        status: "rejected",
        issue: { code: "authoring-identity", path: `authoring.${collection}` },
      });

      const reordered = comprehensiveCompleted();
      reordered.authoring[collection] = [...reordered.authoring[collection]].reverse() as never;
      expect(decodeV3DecomposeCutMap(reordered)).toMatchObject({
        status: "rejected",
        issue: { code: "authoring-identity", path: `authoring.${collection}` },
      });
    }
  });

  it("refuses every remaining author slot and every excluded public domain arm", () => {
    const authorSlotMutations: Array<(value: LooseCompletedMap) => void> = [
      (value) => { value.authoring.shape = { status: "author" }; },
      (value) => { value.authoring.placement = { status: "author" }; },
      (value) => { value.authoring.destinations = { status: "author" }; },
      (value) => { value.authoring.internalEdges = { status: "author" }; },
      (value) => { value.authoring.sourceAllocations[0]!.ownership = { status: "author" }; },
      (value) => { value.authoring.sourceAllocations[0]!.disposition = { status: "author" }; },
      (value) => { value.authoring.incomingDispositions[0]!.disposition = { status: "author" }; },
      (value) => { value.authoring.outgoingDispositions[0]!.disposition = { status: "author" }; },
    ];
    for (const mutate of authorSlotMutations) {
      const value = structuredClone(comprehensiveCompleted()) as unknown as LooseCompletedMap;
      mutate(value);
      expect(decodeV3DecomposeCutMap(value)).toMatchObject({
        status: "rejected",
        issue: { code: "incomplete-authoring" },
      });
    }

    const excludedMutations: Array<(value: LooseCompletedMap) => void> = [
      (value) => { value.machine.source.kind = "provisional"; },
      (value) => { value.authoring.shape = "extraction"; },
      (value) => { value.authoring.placement = { kind: "unknown" }; },
      (value) => {
        (value.authoring.destinations as unknown[])[0] = {
          kind: "surviving-origin",
          destinationId: "origin",
        };
      },
      (value) => { value.extra = true; },
    ];
    for (const mutate of excludedMutations) {
      const value = structuredClone(comprehensiveCompleted()) as unknown as LooseCompletedMap;
      mutate(value);
      expect(decodeV3DecomposeCutMap(value)).toMatchObject({
        status: "rejected",
        issue: { code: "invalid-structure" },
      });
    }
  });

  it("refuses reordered machine inventories before authored identity evaluation", () => {
    for (const collection of ["sourceUnits", "incomingEdges", "outgoingEdges"] as const) {
      const value = comprehensiveCompleted();
      value.machine[collection].reverse();
      expect(decodeV3DecomposeCutMap(value)).toMatchObject({
        status: "rejected",
        issue: { code: "machine-order", path: `machine.${collection}` },
      });
    }
  });

  it("changes each exact preimage when and only when its named facts change", () => {
    const facts = comprehensiveMachine();
    const preflightFacts = machinePreimage(facts);
    const preflightDigest = v3PreflightId(preflightFacts);
    const preflightMutations: Array<typeof preflightFacts> = [
      { ...preflightFacts, source: { ...preflightFacts.source, head: "c".repeat(40) } },
      { ...preflightFacts, resultBase: { ...preflightFacts.resultBase, head: "c".repeat(40) } },
      {
        ...preflightFacts,
        planningProfile: { kind: "single-spec", sourceDesign: ["spec-origin.md"] },
      },
      {
        ...preflightFacts,
        sourceUnits: preflightFacts.sourceUnits.map((unit, index) =>
          index === 0 ? { ...unit, contentDigest: canonicalDigest("changed-source") } : unit),
      },
      {
        ...preflightFacts,
        incomingEdges: preflightFacts.incomingEdges.map((edge, index) =>
          index === 0 ? { ...edge, dependent: "changed-consumer" } : edge),
      },
      {
        ...preflightFacts,
        outgoingEdges: preflightFacts.outgoingEdges.map((edge, index) =>
          index === 0 ? { ...edge, prerequisite: "changed-foundation" } : edge),
      },
    ];
    for (const mutation of preflightMutations) {
      expect(v3PreflightId(mutation)).not.toBe(preflightDigest);
    }

    const incoming = { dependent: "consumer", currentTargets: ["origin"] };
    expect(v3IncomingEdgeId(incoming))
      .not.toBe(v3IncomingEdgeId({ ...incoming, dependent: "other-consumer" }));
    expect(v3IncomingEdgeId(incoming))
      .not.toBe(v3IncomingEdgeId({ ...incoming, currentTargets: ["other-origin"] }));
    expect(v3OutgoingEdgeId({ prerequisite: "foundation" }))
      .not.toBe(v3OutgoingEdgeId({ prerequisite: "other-foundation" }));

    expect(v3ReceiptId(facts)).not.toBe(v3ReceiptId({
      ...facts,
      source: { ...facts.source, origin: "changed-origin" },
    }));
    expect(v3ReceiptId(facts)).not.toBe(v3ReceiptId({
      ...facts,
      source: { ...facts.source, logicalBranch: "plan/changed-origin" },
    }));
    expect(v3ReceiptId(facts)).not.toBe(v3ReceiptId({
      ...facts,
      source: { ...facts.source, head: "c".repeat(40) },
    }));

    const unit = facts.sourceUnits[0]!;
    expect(v3SourceId({ sourcePath: unit.sourcePath, sourceLocator: unit.sourceLocator }))
      .not.toBe(v3SourceId({ sourcePath: `${unit.sourcePath}.other`, sourceLocator: unit.sourceLocator }));
    expect(v3SourceId({ sourcePath: unit.sourcePath, sourceLocator: unit.sourceLocator }))
      .not.toBe(v3SourceId({
        sourcePath: unit.sourcePath,
        sourceLocator: { artifact: "other.md", kind: "whole-file" },
      }));
    expect(v3SourceId({ sourcePath: unit.sourcePath, sourceLocator: unit.sourceLocator }))
      .toBe(v3SourceId({ sourcePath: unit.sourcePath, sourceLocator: unit.sourceLocator }));
    for (const sourceLocator of [
      {
        artifact: "draft-origin.md",
        kind: "section" as const,
        level: 3,
        headingSource: "Child",
        ancestry: [{ level: 3, headingSource: "Impossible", occurrence: 0 }],
        occurrence: 0,
      },
      {
        artifact: "draft-origin.md",
        kind: "section" as const,
        level: 5,
        headingSource: "Child",
        ancestry: [
          { level: 4, headingSource: "Inner", occurrence: 0 },
          { level: 2, headingSource: "Outer", occurrence: 0 },
        ],
        occurrence: 0,
      },
    ]) {
      expect(() => v3SourceId({ sourcePath: unit.sourcePath, sourceLocator })).toThrow();
    }

    const artifact = {
      path: "a.md",
      objectKind: "blob" as const,
      mode: "100644" as const,
      contentDigest: canonicalDigest("stored-bytes"),
    };
    const artifactDigest = v3SourceArtifactDigest([artifact]);
    expect(v3SourceArtifactDigest([{ ...artifact, path: "b.md" }])).not.toBe(artifactDigest);
    expect(v3SourceArtifactDigest([{ ...artifact, mode: "100755" }])).not.toBe(artifactDigest);
    expect(v3SourceArtifactDigest([{
      ...artifact,
      contentDigest: canonicalDigest("different-stored-bytes"),
    }])).not.toBe(artifactDigest);
    expect(v3SourceId({ sourcePath: unit.sourcePath, sourceLocator: unit.sourceLocator }))
      .toBe(unit.sourceId);

    const sourceInventoryDigest = v3SourceInventoryDigest(facts);
    for (const changedUnit of [
      { ...unit, sourceId: canonicalDigest("changed-source-id") },
      { ...unit, sourcePath: `${unit.sourcePath}.other` },
      { ...unit, sourceLocator: { artifact: "other.md", kind: "whole-file" as const } },
      { ...unit, contentDigest: canonicalDigest("changed-content") },
    ]) {
      expect(v3SourceInventoryDigest({
        ...facts,
        sourceUnits: facts.sourceUnits.map((candidate, index) => index === 0 ? changedUnit : candidate),
      })).not.toBe(sourceInventoryDigest);
    }

    const incomingInventoryDigest = v3IncomingEdgeInventoryDigest(facts);
    const firstIncoming = facts.incomingEdges[0]!;
    for (const changedEdge of [
      { ...firstIncoming, edgeId: canonicalDigest("changed-incoming-id") },
      { ...firstIncoming, dependent: "changed-dependent" },
      { ...firstIncoming, currentTargets: ["changed-target"] },
    ]) {
      expect(v3IncomingEdgeInventoryDigest({
        ...facts,
        incomingEdges: facts.incomingEdges.map((candidate, index) => index === 0 ? changedEdge : candidate),
      })).not.toBe(incomingInventoryDigest);
    }

    const outgoingInventoryDigest = v3OutgoingEdgeInventoryDigest(facts);
    const firstOutgoing = facts.outgoingEdges[0]!;
    for (const changedEdge of [
      { ...firstOutgoing, edgeId: canonicalDigest("changed-outgoing-id") },
      { ...firstOutgoing, prerequisite: "changed-prerequisite" },
    ]) {
      expect(v3OutgoingEdgeInventoryDigest({
        ...facts,
        outgoingEdges: facts.outgoingEdges.map((candidate, index) => index === 0 ? changedEdge : candidate),
      })).not.toBe(outgoingInventoryDigest);
    }

    expect(v3AllowedPathsDigest(["a.md", "b.md"]))
      .not.toBe(v3AllowedPathsDigest(["a.md", "c.md"]));
    expect(v3AllowedPathsDigest(["a.md", "a.md"])).toBeNull();

    const topology = [{
      kind: "create" as const,
      path: "a.md",
      before: { kind: "absent" as const },
      after: {
        kind: "file" as const,
        mode: "100644" as const,
        contentDigest: canonicalDigest("after"),
      },
    }];
    const topologyDigest = v3TopologyDigest(topology);
    expect(v3TopologyDigest([{ ...topology[0]!, kind: "append" }])).not.toBe(topologyDigest);
    expect(v3TopologyDigest([{ ...topology[0]!, path: "b.md" }])).not.toBe(topologyDigest);
    expect(v3TopologyDigest([{
      ...topology[0]!,
      before: { kind: "file", mode: "100644", contentDigest: canonicalDigest("before") },
    }])).not.toBe(topologyDigest);
    expect(v3TopologyDigest([{
      ...topology[0]!,
      after: { ...topology[0]!.after, mode: "100755" },
    }])).not.toBe(topologyDigest);

    const patch = [{ path: "a.md", before: topology[0]!.before, after: topology[0]!.after }];
    const patchDigest = v3TransitionPatchDigest(patch);
    expect(v3TransitionPatchDigest([{ ...patch[0]!, path: "b.md" }])).not.toBe(patchDigest);
    expect(v3TransitionPatchDigest([{
      ...patch[0]!,
      before: { kind: "file", mode: "100644", contentDigest: canonicalDigest("before") },
    }])).not.toBe(patchDigest);
    expect(v3TransitionPatchDigest([{
      ...patch[0]!,
      after: { ...patch[0]!.after, mode: "100755" },
    }])).not.toBe(patchDigest);
  });

  it("pins every named versioned digest preimage", () => {
    const facts = comprehensiveMachine();
    const map = comprehensiveCompleted();
    const artifact = [{
      path: ".arc/active/draft-origin.md",
      objectKind: "blob" as const,
      mode: "100644" as const,
      contentDigest: canonicalDigest("stored-bytes"),
    }];
    const topology = [{
      kind: "create" as const,
      path: ".arc/backlog/planned/group/meta-group.md",
      before: { kind: "absent" as const },
      after: {
        kind: "file" as const,
        mode: "100644" as const,
        contentDigest: canonicalDigest("topology-after"),
      },
    }];
    const patch = [{
      path: ".arc/backlog/ROADMAP.md",
      before: { kind: "absent" as const },
      after: {
        kind: "file" as const,
        mode: "100644" as const,
        contentDigest: canonicalDigest("patch-after"),
      },
    }];
    expect({
      receiptId: v3ReceiptId(facts),
      preflightId: facts.preflightId,
      sourceId: facts.sourceUnits[0]!.sourceId,
      incomingEdgeId: facts.incomingEdges[0]!.edgeId,
      outgoingEdgeId: facts.outgoingEdges[0]!.edgeId,
      cutMapDigest: v3CutMapDigest(map),
      allowedPathsDigest: v3AllowedPathsDigest(["a.md", "b.md"]),
      topologyDigest: v3TopologyDigest(topology),
      transitionPatchDigest: v3TransitionPatchDigest(patch),
      sourceArtifactDigest: v3SourceArtifactDigest(artifact),
      sourceInventoryDigest: v3SourceInventoryDigest(facts),
      incomingInventoryDigest: v3IncomingEdgeInventoryDigest(facts),
      outgoingInventoryDigest: v3OutgoingEdgeInventoryDigest(facts),
    }).toEqual({
      receiptId: "sha256:d69f8e709ff03781fce64adaab549f669ec328f93c726ce7b7c3ad67a1896f01",
      preflightId: "sha256:b022832be770a88c034697c72eed20c7fb5b577829046af524bd2ad758aa663b",
      sourceId: "sha256:1746baa12ae6a59ab3f2798506769ada531f3c4bd54eddc7b81fe5020bbe4c0e",
      incomingEdgeId: "sha256:6562eeb5557735ce19d452629a0b9dec7c57c0bb75ab5405b2a903699e448038",
      outgoingEdgeId: "sha256:09a2ee82c7ab19d5e8761e65d92c9d2d271afd660910473eea0c19b38fa746c3",
      cutMapDigest: "sha256:220124864fd22f6743df622ad7c369749208047b9a729349aaff26bd5f30d591",
      allowedPathsDigest: "sha256:3a7859f5699f28d740ac1a17e3eadc456104ffe68bfd93779ed8e40fdb51100c",
      topologyDigest: "sha256:e82afa273ab2091806eb2b776fba0b97d4d207dc8f4221ba3f505d27980ea1ba",
      transitionPatchDigest:
        "sha256:747d670a4e9c70a3d04026503e21165c5330500a9f9b51371e0d275f390f29ed",
      sourceArtifactDigest:
        "sha256:eb04ac5ec3e4200b1f33a7239ba91f446c13fb68710a3e6072c06c4ad337bab5",
      sourceInventoryDigest:
        "sha256:6b0d8b64a16573b57270e2ec734b453e71a9cea2597f6623236ff2b059f50e0f",
      incomingInventoryDigest:
        "sha256:fa498fbf953d141904d9fc4da24f562bf0b964608e3f768ab954a7daa92ad759",
      outgoingInventoryDigest:
        "sha256:a5b468bb508f330dec97c0e4e0217283cc408276e0dcb2f94985eaecc0fe16ff",
    });
  });
});
