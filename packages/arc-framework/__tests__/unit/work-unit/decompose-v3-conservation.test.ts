import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/kernel/canonical/canonical-json.js";
import {
  validateV3DecomposeConservation,
  type V3DecomposeConservationInput,
} from "../../../src/lib/work-unit/decompose-v3-conservation.js";
import {
  createV3DecomposeStarterMap,
  v3IncomingEdgeId,
  v3OutgoingEdgeId,
  v3PreflightId,
  v3SourceId,
} from "../../../src/lib/work-unit/decompose-v3-schema.js";
import type { V3DecomposePreflight } from "../../../src/lib/work-unit/decompose-v3-preflight.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

function validInput(): V3DecomposeConservationInput {
  const completedMap = structuredClone(v3DecompositionEvidenceFixture().preparation.facts.completedMap);
  const starterMap = createV3DecomposeStarterMap(structuredClone(completedMap.machine));
  if (starterMap === null) throw new Error("fixture machine must produce a starter map");
  const preflight: V3DecomposePreflight = {
    sourceOriginPath: ".arc/active/meta-origin.md",
    sourceArtifactInventory: [],
    sourceArtifactDigest: canonicalDigest([]),
    starterMap,
  };
  return {
    completedMap,
    currentPreflight: preflight,
    originDependsOn: [],
    resultBaseLiveSlugs: [],
    resultBaseCompletedSlugs: [],
    workUnits: [{
      slug: "consumer",
      writablePath: ".arc/active/meta-consumer.md",
      dependsOn: ["origin"],
    }],
  };
}

function rebindCurrentPreflight(input: V3DecomposeConservationInput): void {
  const machine = input.completedMap.machine;
  const facts = {
    source: machine.source,
    resultBase: machine.resultBase,
    planningProfile: machine.planningProfile,
    sourceUnits: machine.sourceUnits,
    incomingEdges: machine.incomingEdges,
    outgoingEdges: machine.outgoingEdges,
  };
  input.completedMap.machine.preflightId = v3PreflightId(facts);
  const starterMap = createV3DecomposeStarterMap(structuredClone(input.completedMap.machine));
  if (starterMap === null) throw new Error("updated machine must remain canonical");
  input.currentPreflight.starterMap = starterMap;
}

function extractionInput(replacementTargets: string[]): V3DecomposeConservationInput {
  const input = validInput();
  input.completedMap.machine.source.kind = "active-origin";
  input.completedMap.authoring.shape = "extraction";
  input.completedMap.authoring.placement = { kind: "direct-member" };
  input.completedMap.authoring.destinations = [input.completedMap.authoring.destinations[0]!];
  input.completedMap.authoring.incomingDispositions[0]!.disposition = {
    kind: "replace",
    replacementTargets,
  };
  rebindCurrentPreflight(input);
  return input;
}

function addExistingWorkUnitDestination(
  input: V3DecomposeConservationInput,
  slug: string,
  dependsOn: string[] = [],
): void {
  input.completedMap.authoring.shape = input.completedMap.authoring.shape === "extraction"
    ? "extraction"
    : "heterogeneous";
  input.completedMap.authoring.destinations.unshift({
    kind: "existing-home",
    destinationId: slug,
    target: { kind: "work-unit", slug },
  });
  input.workUnits.push({
    slug,
    writablePath: `.arc/active/meta-${slug}.md`,
    dependsOn,
  });
}

function externalSource(input: V3DecomposeConservationInput, source: "existing-home" | "new-member"): string {
  if (source === "new-member") return "member-a";
  addExistingWorkUnitDestination(input, "existing");
  return "existing";
}

describe("v3 decomposition allocation and dependency conservation", () => {
  it("returns the exact ordered allocation and dependency edits", () => {
    const input = validInput();

    const result = validateV3DecomposeConservation(input);

    expect(result).toEqual({
      status: "validated",
      allocations: input.completedMap.authoring.sourceAllocations,
      dependencyEdits: [{
        kind: "incoming",
        edgeId: input.completedMap.machine.incomingEdges[0]!.edgeId,
        locus: "authoring.incomingDispositions.0.disposition",
        destinationId: null,
        dependent: "consumer",
        writablePath: ".arc/active/meta-consumer.md",
        beforeTargets: ["origin"],
        afterTargets: ["member-a"],
      }],
    });
  });

  it("retains the retirement-floor assertion after source-unit coverage widens", () => {
    const input = validInput();
    input.retiringArtifacts = [
      { path: input.currentPreflight.sourceOriginPath, byteLength: 256 },
      { path: input.completedMap.machine.sourceUnits[0]!.sourcePath, byteLength: 512 },
    ];

    expect(validateV3DecomposeConservation(input)).toMatchObject({ status: "validated" });
  });

  it("treats live dependency targets as an order-insensitive set", () => {
    const input = validInput();
    const currentTargets = ["foundation", "origin"];
    const edgeId = v3IncomingEdgeId({ dependent: "consumer", currentTargets });
    input.completedMap.machine.incomingEdges = [{
      dependent: "consumer",
      currentTargets,
      edgeId,
    }];
    input.completedMap.authoring.incomingDispositions[0]!.edgeId = edgeId;
    input.workUnits[0]!.dependsOn = ["origin", "foundation"];
    rebindCurrentPreflight(input);

    expect(validateV3DecomposeConservation(input)).toMatchObject({
      status: "validated",
    });
  });

  it("restricts source ownership to a compatible destination kind", () => {
    const input = validInput();
    input.completedMap.authoring.sourceAllocations[0]!.ownership = "cohort-shared";

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage: "ownership",
        reason: "incompatible-source-ownership",
        locus: "authoring.sourceAllocations.0.ownership",
      },
    });
  });

  it("accepts paired-spec artifacts owned by a new member", () => {
    const input = validInput();
    input.completedMap.machine.planningProfile = {
      kind: "paired-spec",
      sourceDesign: ["spec-origin-prd.md", "spec-origin-rfc.md"],
    };
    rebindCurrentPreflight(input);
    input.completedMap.authoring.sourceAllocations[0]!.disposition = {
      kind: "target",
      destinationId: "member-a",
      targetLocator: { artifact: "spec-member-a-prd.md", kind: "preamble" },
    };

    expect(validateV3DecomposeConservation(input)).toMatchObject({
      status: "validated",
    });
  });

  it.each([
    "draft-member-a.md",
    "tasks-member-a.md",
    "notes-member-a.md",
  ])("accepts the member content artifact %s", (artifact) => {
    const input = validInput();
    input.completedMap.authoring.sourceAllocations[0]!.disposition = {
      kind: "target",
      destinationId: "member-a",
      targetLocator: { artifact, kind: "preamble" },
    };

    const result = validateV3DecomposeConservation(input);
    expect(result, JSON.stringify(result)).toMatchObject({ status: "validated" });
  });

  it.each([
    "meta-member-a.md",
    "context-member-a.md",
    "draft-member-b.md",
  ])("refuses the non-member content artifact %s", (artifact) => {
    const input = validInput();
    input.completedMap.authoring.sourceAllocations[0]!.disposition = {
      kind: "target",
      destinationId: "member-a",
      targetLocator: { artifact, kind: "preamble" },
    };

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage: "ownership",
        reason: "incompatible-allocation-locator",
        locus: "authoring.sourceAllocations.0.disposition.targetLocator",
      },
    });
  });

  it("preserves exact document targeting for an existing-home destination", () => {
    const input = validInput();
    input.completedMap.authoring.shape = "heterogeneous";
    input.completedMap.authoring.destinations.unshift({
      kind: "existing-home",
      destinationId: "existing",
      target: { kind: "document", path: ".arc/reference/shared.md" },
    });
    input.completedMap.authoring.sourceAllocations[0]!.disposition = {
      kind: "target",
      destinationId: "existing",
      targetLocator: { artifact: "shared.md", kind: "preamble" },
    };

    const result = validateV3DecomposeConservation(input);
    expect(result, JSON.stringify(result)).toMatchObject({ status: "validated" });
  });

  it("preserves exact artifact and ownership targeting for cohort coordination", () => {
    const input = validInput();
    input.completedMap.authoring.destinations.unshift({
      kind: "cohort-coordination",
      destinationId: "coordination",
      cohort: "origin",
    });
    const allocation = input.completedMap.authoring.sourceAllocations[0]!;
    allocation.ownership = "cohort-shared";
    allocation.disposition = {
      kind: "target",
      destinationId: "coordination",
      targetLocator: { artifact: "cohort-origin.md", kind: "preamble" },
    };

    const result = validateV3DecomposeConservation(input);
    expect(result, JSON.stringify(result)).toMatchObject({ status: "validated" });
  });

  it("refuses duplicate destination identities before allocation projection", () => {
    const input = validInput();
    input.completedMap.authoring.destinations[1] = {
      kind: "new-member",
      destinationId: "member-b",
      slug: "member-a",
      workClass: "Light",
    };

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage: "ownership",
        reason: "duplicate-destination-identity",
        locus: "authoring.destinations.1",
      },
    });
  });

  it("applies live conservation before ownership and ownership before dependency projection", () => {
    const liveFirst = validInput();
    liveFirst.workUnits = [];
    liveFirst.completedMap.authoring.sourceAllocations[0]!.ownership = "cohort-shared";
    expect(validateV3DecomposeConservation(liveFirst)).toMatchObject({
      status: "refused",
      refusal: { stage: "live-conservation" },
    });

    const ownershipFirst = validInput();
    delete ownershipFirst.workUnits[0]!.writablePath;
    ownershipFirst.completedMap.authoring.sourceAllocations[0]!.ownership = "cohort-shared";
    expect(validateV3DecomposeConservation(ownershipFirst)).toMatchObject({
      status: "refused",
      refusal: { stage: "ownership" },
    });
  });

  it.each([
    ["missing destination", (input: V3DecomposeConservationInput) => {
      input.completedMap.authoring.sourceAllocations[0]!.disposition = {
        kind: "target",
        destinationId: "missing",
        targetLocator: { artifact: "draft-member-a.md", kind: "preamble" },
      };
    }, "authoring.sourceAllocations.0.disposition.destinationId", "decoded-map", "authoring-identity"],
    ["incompatible locator", (input: V3DecomposeConservationInput) => {
      input.completedMap.authoring.sourceAllocations[0]!.disposition = {
        kind: "target",
        destinationId: "member-a",
        targetLocator: { artifact: "draft-member-b.md", kind: "preamble" },
      };
    }, "authoring.sourceAllocations.0.disposition.targetLocator", "ownership", "incompatible-allocation-locator"],
  ])("refuses %s at its exact allocation locus", (_name, mutate, locus, stage, reason) => {
    const input = validInput();
    mutate(input);

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage,
        reason,
        locus,
      },
    });
  });

  it.each([
    ["missing", (input: V3DecomposeConservationInput) => {
      input.workUnits = [];
    }, "machine.incomingEdges", "incoming-edge-set-changed", "live-conservation", {
      expected: ["consumer"],
      actual: [],
    }],
    ["unwritable", (input: V3DecomposeConservationInput) => {
      delete input.workUnits[0]!.writablePath;
    }, "workUnits.consumer.writablePath", "unwritable-dependent", "dependency-projection", undefined],
    ["stale", (input: V3DecomposeConservationInput) => {
      input.workUnits[0]!.dependsOn = ["origin", "other"];
    }, ".arc/active/meta-consumer.md", "stale-dependent", "dependency-projection", {
      expected: ["origin"],
      actual: ["origin", "other"],
    }],
  ])("refuses a %s incoming dependent", (_name, mutate, locus, reason, stage, evidence) => {
    const input = validInput();
    mutate(input);

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage,
        reason,
        locus,
        ...(evidence === undefined ? {} : { evidence }),
      },
    });
  });

  it("reports the recorded and live outgoing dependency sets", () => {
    const input = validInput();
    input.originDependsOn = ["foundation"];

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage: "live-conservation",
        reason: "outgoing-edge-set-changed",
        locus: "originDependsOn",
        evidence: {
          expected: [],
          actual: ["foundation"],
        },
      },
    });
  });

  it("preserves machine-binding evidence through the conservation refusal", () => {
    const input = validInput();
    const currentMachine = input.currentPreflight.starterMap.machine;
    currentMachine.sourceUnits[0]!.contentDigest = canonicalDigest("changed");
    currentMachine.preflightId = v3PreflightId({
      source: currentMachine.source,
      resultBase: currentMachine.resultBase,
      planningProfile: currentMachine.planningProfile,
      sourceUnits: currentMachine.sourceUnits,
      incomingEdges: currentMachine.incomingEdges,
      outgoingEdges: currentMachine.outgoingEdges,
    });

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage: "machine-binding",
        reason: "source-units",
        locus: "machine.sourceUnits.0",
        evidence: {
          expected: input.completedMap.machine.sourceUnits[0],
          actual: currentMachine.sourceUnits[0],
        },
      },
    });
  });

  it.each([
    ["omitted", (input: V3DecomposeConservationInput) => {
      input.completedMap.authoring.sourceAllocations = [];
    }, "decoded-map", "authoring.sourceAllocations"],
    ["duplicated", (input: V3DecomposeConservationInput) => {
      input.completedMap.authoring.sourceAllocations.push(
        structuredClone(input.completedMap.authoring.sourceAllocations[0]!),
      );
    }, "decoded-map", "authoring.sourceAllocations"],
    ["changed", (input: V3DecomposeConservationInput) => {
      input.currentPreflight.starterMap.machine.sourceUnits[0]!.contentDigest = canonicalDigest("changed");
      const machine = input.currentPreflight.starterMap.machine;
      machine.preflightId = v3PreflightId({
        source: machine.source,
        resultBase: machine.resultBase,
        planningProfile: machine.planningProfile,
        sourceUnits: machine.sourceUnits,
        incomingEdges: machine.incomingEdges,
        outgoingEdges: machine.outgoingEdges,
      });
    }, "machine-binding", "machine.sourceUnits.0"],
    ["added", (input: V3DecomposeConservationInput) => {
      const locator = { artifact: "notes-origin.md", kind: "whole-file" as const };
      input.completedMap.machine.sourceUnits.push({
        sourceId: v3SourceId({ sourcePath: ".arc/active/notes-origin.md", sourceLocator: locator }),
        sourcePath: ".arc/active/notes-origin.md",
        sourceLocator: locator,
        contentDigest: canonicalDigest("added"),
      });
      input.completedMap.machine.sourceUnits.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
      rebindCurrentPreflight(input);
      input.completedMap.machine.sourceUnits = input.completedMap.machine.sourceUnits.filter(
        ({ sourcePath }) => sourcePath !== ".arc/active/notes-origin.md",
      );
      const machine = input.completedMap.machine;
      input.completedMap.machine.preflightId = v3PreflightId({
        source: machine.source,
        resultBase: machine.resultBase,
        planningProfile: machine.planningProfile,
        sourceUnits: machine.sourceUnits,
        incomingEdges: machine.incomingEdges,
        outgoingEdges: machine.outgoingEdges,
      });
    }, "machine-binding", expect.stringMatching(/^machine\.sourceUnits\.\d+$/u)],
  ])("refuses an %s source unit before ownership planning", (_name, mutate, stage, locus) => {
    const input = validInput();
    mutate(input);

    const result = validateV3DecomposeConservation(input);
    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.refusal.stage).toBe(stage);
    expect(result.refusal.locus).toEqual(locus);
  });

  it.each([
    ["unknown recipient", ["ghost"]],
    ["retiring origin", ["origin"]],
  ])("refuses an incoming replacement with %s", (_name, replacementTargets) => {
    const input = validInput();
    input.completedMap.authoring.incomingDispositions[0]!.disposition = {
      kind: "replace",
      replacementTargets,
    };

    const result = validateV3DecomposeConservation(input);
    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.refusal).toMatchObject({
      stage: "decoded-map",
      reason: "authoring-identity",
      locus: "authoring.incomingDispositions.0.disposition.replacementTargets.0",
    });
  });

  it("preserves or extends a retained origin dependency under extraction", () => {
    const retained = validateV3DecomposeConservation(extractionInput(["origin"]));
    expect(retained).toEqual({
      status: "validated",
      allocations: extractionInput(["origin"]).completedMap.authoring.sourceAllocations,
      dependencyEdits: [],
    });

    const extendedInput = extractionInput(["member-a", "origin"]);
    const extended = validateV3DecomposeConservation(extendedInput);
    expect(extended).toMatchObject({ status: "validated" });
    if (extended.status !== "validated") return;
    expect(extended.dependencyEdits).toEqual([{
      kind: "incoming",
      edgeId: extendedInput.completedMap.machine.incomingEdges[0]!.edgeId,
      locus: "authoring.incomingDispositions.0.disposition",
      destinationId: null,
      dependent: "consumer",
      writablePath: ".arc/active/meta-consumer.md",
      beforeTargets: ["origin"],
      afterTargets: ["member-a", "origin"],
    }]);
  });

  it("projects outgoing prerequisites to their exact recipient slots", () => {
    const input = validInput();
    const outgoing = {
      prerequisite: "foundation",
      edgeId: v3OutgoingEdgeId({ prerequisite: "foundation" }),
    };
    input.completedMap.machine.outgoingEdges = [outgoing];
    input.completedMap.authoring.outgoingDispositions = [{
      edgeId: outgoing.edgeId,
      disposition: { kind: "targets", targets: ["member-a"] },
    }];
    input.originDependsOn = ["foundation"];
    rebindCurrentPreflight(input);

    const result = validateV3DecomposeConservation(input);

    expect(result).toMatchObject({ status: "validated" });
    if (result.status !== "validated") return;
    expect(result.dependencyEdits).toContainEqual({
      kind: "outgoing",
      edgeId: outgoing.edgeId,
      locus: "authoring.outgoingDispositions.0.disposition.targets.0",
      destinationId: "member-a",
      dependent: "member-a",
      writablePath: null,
      beforeTargets: [],
      afterTargets: ["foundation"],
    });
    expect(result.dependencyEdits.map(({ edgeId }) => edgeId)).toEqual(
      [...result.dependencyEdits.map(({ edgeId }) => edgeId)].sort(),
    );
  });

  it.each(["new-member", "existing-home"] as const)(
    "projects a live prerequisite absent from source-bound facts for a %s source",
    (source) => {
      const input = { ...validInput(), resultBaseLiveSlugs: ["foundation"] };
      const from = externalSource(input, source);
      input.completedMap.authoring.externalEdges = [{ from, to: "foundation" }];

      const result = validateV3DecomposeConservation(input);

      expect(result).toMatchObject({ status: "validated" });
      if (result.status !== "validated") return;
      const externalId = canonicalDigest({ schemaVersion: 3, kind: "external", from, to: "foundation" });
      expect(externalId).not.toBe(canonicalDigest({ schemaVersion: 3, kind: "internal", from, to: "foundation" }));
      expect(result.dependencyEdits).toContainEqual({
        kind: "external",
        edgeId: externalId,
        locus: "authoring.externalEdges.0",
        destinationId: source === "new-member" ? "member-a" : "existing",
        dependent: from,
        writablePath: source === "new-member" ? null : ".arc/active/meta-existing.md",
        beforeTargets: [],
        afterTargets: ["foundation"],
      });
    },
  );

  it.each(["new-member", "existing-home"] as const)(
    "projects a completed prerequisite for a %s source",
    (source) => {
      const input = { ...validInput(), resultBaseCompletedSlugs: ["foundation"] };
      const from = externalSource(input, source);
      input.completedMap.authoring.externalEdges = [{ from, to: "foundation" }];

      const result = validateV3DecomposeConservation(input);

      expect(result).toMatchObject({
        status: "validated",
        dependencyEdits: expect.arrayContaining([expect.objectContaining({
          kind: "external",
          dependent: from,
          afterTargets: ["foundation"],
        })]),
      });
    },
  );

  it.each(["new-member", "existing-home"] as const)(
    "admits the authenticated surviving origin as an extraction prerequisite for a %s source",
    (source) => {
      const input = extractionInput(["origin"]);
      const from = externalSource(input, source);
      input.completedMap.authoring.externalEdges = [{ from, to: "origin" }];

      const result = validateV3DecomposeConservation(input);

      expect(result).toMatchObject({
        status: "validated",
        dependencyEdits: expect.arrayContaining([expect.objectContaining({
          kind: "external",
          dependent: from,
          afterTargets: ["origin"],
        })]),
      });
    },
  );

  it("classifies an external self-edge as destination-owned redundancy", () => {
    const input = validInput();
    input.resultBaseLiveSlugs = ["member-a"];
    input.completedMap.authoring.externalEdges = [{ from: "member-a", to: "member-a" }];

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage: "dependency-projection",
        reason: "redundant-external-edge",
        locus: "authoring.externalEdges.0.to",
      },
    });
  });

  it("refuses a retirement external edge to its origin even when the origin is live", () => {
    const input = validInput();
    input.resultBaseLiveSlugs = ["origin"];
    input.completedMap.authoring.externalEdges = [{ from: "member-a", to: "origin" }];

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage: "dependency-projection",
        reason: "retiring-origin-target",
        locus: "authoring.externalEdges.0.to",
      },
    });
  });

  it("refuses an external target absent from the live result base", () => {
    const input = validInput();
    input.completedMap.authoring.externalEdges = [{ from: "member-a", to: "missing" }];

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage: "dependency-projection",
        reason: "unknown-external-target",
        locus: "authoring.externalEdges.0.to",
      },
    });
  });

  it.each([
    ["new-member", "member-b"],
    ["existing-home", "member-a"],
  ] as const)("refuses a declared destination target for a %s source", (source, to) => {
    const input = validInput();
    const from = externalSource(input, source);
    input.completedMap.authoring.externalEdges = [{ from, to }];

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage: "dependency-projection",
        reason: "redundant-external-edge",
        locus: "authoring.externalEdges.0.to",
      },
    });
  });

  it.each(["new-member", "existing-home"] as const)(
    "classifies a %s source self-edge as declared-destination redundancy",
    (source) => {
      const input = validInput();
      const from = externalSource(input, source);
      input.resultBaseLiveSlugs = [from];
      input.completedMap.authoring.externalEdges = [{ from, to: from }];

      expect(validateV3DecomposeConservation(input)).toEqual({
        status: "refused",
        refusal: {
          stage: "dependency-projection",
          reason: "redundant-external-edge",
          locus: "authoring.externalEdges.0.to",
        },
      });
    },
  );

  it.each(["new-member", "existing-home"] as const)(
    "refuses an unknown prerequisite for a %s source",
    (source) => {
      const input = validInput();
      const from = externalSource(input, source);
      input.completedMap.authoring.externalEdges = [{ from, to: "missing" }];

      expect(validateV3DecomposeConservation(input)).toMatchObject({
        status: "refused",
        refusal: {
          reason: "unknown-external-target",
          locus: "authoring.externalEdges.0.to",
        },
      });
    },
  );

  it.each(["new-member", "existing-home"] as const)(
    "refuses the retiring origin for a %s source before target eligibility",
    (source) => {
      const input = validInput();
      const from = externalSource(input, source);
      input.resultBaseLiveSlugs = ["origin"];
      input.completedMap.authoring.externalEdges = [{ from, to: "origin" }];

      expect(validateV3DecomposeConservation(input)).toMatchObject({
        status: "refused",
        refusal: {
          reason: "retiring-origin-target",
          locus: "authoring.externalEdges.0.to",
        },
      });
    },
  );

  it("reports the first external-edge refusal in canonical authored order", () => {
    const input = validInput();
    input.completedMap.authoring.externalEdges = [
      { from: "member-a", to: "member-b" },
      { from: "member-a", to: "zzz-missing" },
    ];

    expect(validateV3DecomposeConservation(input)).toMatchObject({
      status: "refused",
      refusal: {
        reason: "redundant-external-edge",
        locus: "authoring.externalEdges.0.to",
      },
    });
  });

  it("reports an already-satisfied external edge at its authored locus", () => {
    const input = validInput();
    input.completedMap.authoring.shape = "heterogeneous";
    input.completedMap.authoring.placement = { kind: "direct-member" };
    input.completedMap.authoring.destinations = [
      {
        kind: "existing-home",
        destinationId: "consumer",
        target: { kind: "work-unit", slug: "consumer" },
      },
      { kind: "new-member", destinationId: "member-a", slug: "member-a", workClass: "Light" },
    ];
    input.completedMap.authoring.externalEdges = [{ from: "consumer", to: "foundation" }];
    input.resultBaseLiveSlugs = ["foundation"];
    input.workUnits[0]!.dependsOn = ["origin", "foundation"];
    const incoming = {
      dependent: "consumer",
      currentTargets: ["foundation", "origin"],
      edgeId: v3IncomingEdgeId({ dependent: "consumer", currentTargets: ["foundation", "origin"] }),
    };
    input.completedMap.machine.incomingEdges = [incoming];
    input.completedMap.authoring.incomingDispositions = [{
      edgeId: incoming.edgeId,
      disposition: { kind: "replace", replacementTargets: ["member-a"] },
    }];
    rebindCurrentPreflight(input);

    expect(validateV3DecomposeConservation(input)).toEqual({
      status: "refused",
      refusal: {
        stage: "dependency-projection",
        reason: "unchanged-dependency-slot",
        locus: "authoring.externalEdges.0",
      },
    });
  });

  it("projects internal member dependencies as canonical edge edits", () => {
    const input = validInput();
    input.completedMap.authoring.internalEdges = [{ from: "member-a", to: "member-b" }];

    const result = validateV3DecomposeConservation(input);

    expect(result.status).toBe("validated");
    if (result.status !== "validated") return;
    expect(result.dependencyEdits).toContainEqual({
      kind: "internal",
      edgeId: canonicalDigest({
        schemaVersion: 3,
        kind: "internal",
        from: "member-a",
        to: "member-b",
      }),
      locus: "authoring.internalEdges.0",
      destinationId: "member-a",
      dependent: "member-a",
      writablePath: null,
      beforeTargets: [],
      afterTargets: ["member-b"],
    });
  });

  it.each([
    [{ from: "member-a", to: "member-b" }],
    [{ from: "consumer", to: "member-a" }],
    [{ from: "member-a", to: "consumer" }],
    [{ from: "consumer", to: "provider" }],
  ])("accepts internal edges across every dependency-capable destination-kind pair", (edge) => {
    const input = validInput();
    input.completedMap.authoring.shape = "heterogeneous";
    input.completedMap.authoring.destinations = [
      {
        kind: "existing-home",
        destinationId: "consumer",
        target: { kind: "work-unit", slug: "consumer" },
      },
      ...input.completedMap.authoring.destinations,
      {
        kind: "existing-home",
        destinationId: "provider",
        target: { kind: "work-unit", slug: "provider" },
      },
    ];
    input.workUnits.push({
      slug: "provider",
      writablePath: ".arc/active/meta-provider.md",
      dependsOn: [],
    });
    input.completedMap.authoring.internalEdges = [edge];

    const result = validateV3DecomposeConservation(input);

    expect(result).toMatchObject({ status: "validated" });
    if (result.status !== "validated") return;
    expect(result.dependencyEdits).toContainEqual(expect.objectContaining({
      kind: "internal",
      dependent: edge.from,
      afterTargets: expect.arrayContaining([edge.to]),
    }));
  });

  it("chains same-dependent edits in canonical edge order", () => {
    const input = validInput();
    input.completedMap.authoring.shape = "heterogeneous";
    input.completedMap.authoring.placement = { kind: "direct-member" };
    input.completedMap.authoring.destinations = [
      {
        kind: "existing-home",
        destinationId: "consumer",
        target: { kind: "work-unit", slug: "consumer" },
      },
      { kind: "new-member", destinationId: "member-a", slug: "member-a", workClass: "Light" },
    ];
    const outgoing = {
      prerequisite: "foundation",
      edgeId: v3OutgoingEdgeId({ prerequisite: "foundation" }),
    };
    input.completedMap.machine.outgoingEdges = [outgoing];
    input.completedMap.authoring.outgoingDispositions = [{
      edgeId: outgoing.edgeId,
      disposition: { kind: "targets", targets: ["consumer"] },
    }];
    input.completedMap.authoring.externalEdges = [{ from: "consumer", to: "foundation-b" }];
    input.originDependsOn = ["foundation"];
    input.resultBaseLiveSlugs = ["foundation-b"];
    rebindCurrentPreflight(input);

    const result = validateV3DecomposeConservation(input);

    expect(result).toMatchObject({ status: "validated" });
    if (result.status !== "validated") return;
    const consumerEdits = result.dependencyEdits.filter(({ dependent }) => dependent === "consumer");
    expect(consumerEdits).toHaveLength(3);
    expect(consumerEdits.map(({ edgeId }) => edgeId)).toEqual(
      [...consumerEdits.map(({ edgeId }) => edgeId)].sort(),
    );
    expect(new Set(consumerEdits.map(({ kind }) => kind))).toEqual(new Set(["external", "incoming", "outgoing"]));
    expect(consumerEdits[0]!.afterTargets).toEqual(consumerEdits[1]!.beforeTargets);
    expect(consumerEdits[1]!.afterTargets).toEqual(consumerEdits[2]!.beforeTargets);
    expect([...consumerEdits.at(-1)!.afterTargets].sort()).toEqual(["foundation", "foundation-b", "member-a"]);
  });
});
